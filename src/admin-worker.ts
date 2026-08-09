interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<unknown>;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface Env {
  ASSETS: Fetcher;
  REPORTS: D1Database;
  /** 既定は cloudflare-access。Google移行時のみ google-oauth を設定する。 */
  ADMIN_AUTH_MODE?: string;
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
}

type ReportStatus = "new" | "reviewing" | "resolved";
type AdminUpdatePayload = { status?: unknown; adminNote?: unknown };
type PermissionPayload = { email?: unknown; subject?: unknown };
type ReportAdminPermission = { email: string; subject: string };
type ArticleReport = {
  id: string;
  article_title: string;
  article_url: string;
  article_id: string | null;
  subject: string;
  category: string;
  report_type: string;
  details: string;
  contact: string | null;
  locale: string;
  status: ReportStatus;
  admin_note: string;
  created_at: string;
  updated_at: string;
};
type ArticleAnalytics = {
  article_id: string;
  article_title: string;
  subject: string;
  category: string;
  views: number;
  engaged_reads: number;
  completed_reads: number;
};

const REPORT_STATUSES = new Set<ReportStatus>(["new", "reviewing", "resolved"]);
const MAX_ADMIN_NOTE_LENGTH = 4_000;
const ACCESS_EMAIL_HEADER = "Cf-Access-Authenticated-User-Email";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBJECT_SLUG = /^[a-z0-9-]+$/;
const ADMIN_SESSION_COOKIE = "atlasez_admin_session";
const GOOGLE_STATE_COOKIE = "atlasez_google_oauth_state";
const ADMIN_SESSION_DURATION_MS = 8 * 60 * 60 * 1_000;
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });
const text = (value: unknown, maximum: number) =>
  typeof value === "string" ? value.trim().slice(0, maximum) : "";

type AdminScope = { email: string; subjects: string[]; allSubjects: boolean };

const cookieValue = (request: Request, name: string) => {
  const prefix = `${name}=`;
  for (const item of (request.headers.get("cookie") ?? "").split(";")) {
    const value = item.trim();
    if (value.startsWith(prefix))
      return decodeURIComponent(value.slice(prefix.length));
  }
  return "";
};

const cookie = (name: string, value: string, maxAge: number, path = "/") =>
  `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=${path}; HttpOnly; Secure; SameSite=Lax`;

const hash = async (value: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const authMode = (env: Env) => env.ADMIN_AUTH_MODE ?? "cloudflare-access";
const googleOAuthEnabled = (env: Env) =>
  authMode(env) === "google-oauth" || authMode(env) === "hybrid-preview";
const cloudflareAccessEnabled = (env: Env) =>
  authMode(env) === "cloudflare-access" || authMode(env) === "hybrid-preview";

/**
 * 認証方式の境界。現在はCloudflare Access、将来は同じ権限表のまま
 * Google OAuthのセッションへ切り替えられる。
 */
async function getAuthenticatedEmail(
  request: Request,
  env: Env,
): Promise<string | Response> {
  const mode = authMode(env);
  if (!cloudflareAccessEnabled(env) && !googleOAuthEnabled(env))
    return json(
      { error: "管理画面の認証方式が正しく設定されていません。" },
      500,
    );

  // 併用プレビューでは、Googleログイン済みならそちらを優先する。
  // まだGoogleでログインしていない運営者は、従来どおりAccessのメールを使う。
  if (googleOAuthEnabled(env)) {
    const token = cookieValue(request, ADMIN_SESSION_COOKIE);
    if (token) {
      const session = await env.REPORTS.prepare(
        "SELECT email FROM admin_auth_sessions WHERE session_hash = ? AND expires_at > ?",
      )
        .bind(await hash(token), new Date().toISOString())
        .first<{ email: string }>();
      if (session?.email) return session.email;
    }
  }

  if (cloudflareAccessEnabled(env)) {
    const email = request.headers
      .get(ACCESS_EMAIL_HEADER)
      ?.trim()
      .toLowerCase();
    if (email) return email;
  }
  return json(
    {
      error:
        mode === "google-oauth"
          ? "ログインが必要です。"
          : "Cloudflare Access の認証情報を確認できませんでした。",
    },
    401,
  );
}

async function getAdminScope(
  request: Request,
  env: Env,
): Promise<AdminScope | Response> {
  const identity = await getAuthenticatedEmail(request, env);
  if (identity instanceof Response) return identity;
  const email = identity;
  const result = await env.REPORTS.prepare(
    "SELECT subject FROM report_admin_permissions WHERE email = ?",
  )
    .bind(email)
    .all<{ subject: string }>();
  const subjects = result.results
    .map((permission) => permission.subject)
    .filter(Boolean);
  if (!subjects.length)
    return json({ error: "この管理画面の閲覧権限が設定されていません。" }, 403);
  return { email, subjects, allSubjects: subjects.includes("*") };
}

const isResponse = (value: AdminScope | Response): value is Response =>
  value instanceof Response;

async function getGlobalAdminScope(
  request: Request,
  env: Env,
): Promise<AdminScope | Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!scope.allSubjects)
    return json(
      { error: "担当分野の設定は全分野管理者のみ変更できます。" },
      403,
    );
  return scope;
}

const isSameOrigin = (request: Request) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

async function listArticleReports(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const requested = new URL(request.url).searchParams.get("status") ?? "all";
  const status = REPORT_STATUSES.has(requested as ReportStatus)
    ? (requested as ReportStatus)
    : null;
  if (requested !== "all" && !status)
    return json({ error: "状態を確認してください。" }, 400);
  const select = `SELECT id, article_title, article_url, article_id, subject, category, report_type, details,
      contact, locale, status, admin_note, created_at, updated_at FROM article_reports`;
  const order = ` ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END, created_at DESC LIMIT 250`;
  const filters: string[] = [];
  const values: unknown[] = [];
  if (!scope.allSubjects) {
    filters.push(`subject IN (${scope.subjects.map(() => "?").join(", ")})`);
    values.push(...scope.subjects);
  }
  if (status) {
    filters.push("status = ?");
    values.push(status);
  }
  const where = filters.length ? ` WHERE ${filters.join(" AND ")}` : "";
  const statement = env.REPORTS.prepare(`${select}${where}${order}`);
  const result = values.length
    ? await statement.bind(...values).all<ArticleReport>()
    : await statement.all<ArticleReport>();
  return json({ reports: result.results });
}

async function listArticleAnalytics(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const daysParam = Number(new URL(request.url).searchParams.get("days") ?? 30);
  const days = Number.isInteger(daysParam) ? Math.min(90, Math.max(1, daysParam)) : 30;
  const since = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10);
  const filters = ["day >= ?"];
  const values: unknown[] = [since];
  if (!scope.allSubjects) {
    filters.push(`subject IN (${scope.subjects.map(() => "?").join(", ")})`);
    values.push(...scope.subjects);
  }
  const result = await env.REPORTS.prepare(
    `SELECT article_id, MAX(article_title) AS article_title, subject, category,
        SUM(views) AS views, SUM(engaged_reads) AS engaged_reads,
        SUM(completed_reads) AS completed_reads
     FROM article_analytics_daily
     WHERE ${filters.join(" AND ")}
     GROUP BY article_id, subject, category
     ORDER BY completed_reads DESC, engaged_reads DESC, views DESC, article_title ASC
     LIMIT 50`,
  )
    .bind(...values)
    .all<ArticleAnalytics>();
  return json({ days, articles: result.results });
}

async function updateArticleReport(
  request: Request,
  env: Env,
  reportId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  if (
    request.headers.get("content-type")?.includes("application/json") !== true
  )
    return json({ error: "JSON形式で送信してください。" }, 415);
  let payload: AdminUpdatePayload;
  try {
    payload = (await request.json()) as AdminUpdatePayload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const status = text(payload.status, 20) as ReportStatus;
  if (!REPORT_STATUSES.has(status))
    return json({ error: "対応状況を確認してください。" }, 400);
  const report = await env.REPORTS.prepare(
    "SELECT subject FROM article_reports WHERE id = ?",
  )
    .bind(reportId)
    .first<{ subject: string }>();
  if (!report) return json({ error: "報告が見つかりません。" }, 404);
  if (!scope.allSubjects && !scope.subjects.includes(report.subject))
    return json({ error: "この分野の報告を更新する権限がありません。" }, 403);
  await env.REPORTS.prepare(
    `UPDATE article_reports SET status = ?, admin_note = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(
      status,
      text(payload.adminNote, MAX_ADMIN_NOTE_LENGTH),
      new Date().toISOString(),
      reportId,
    )
    .run();
  return json({ ok: true });
}

async function listReportAdminPermissions(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getGlobalAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const result = await env.REPORTS.prepare(
    "SELECT email, subject FROM report_admin_permissions ORDER BY email, subject",
  ).all<ReportAdminPermission>();
  return json({ permissions: result.results });
}

async function createReportAdminPermission(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getGlobalAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  if (
    request.headers.get("content-type")?.includes("application/json") !== true
  )
    return json({ error: "JSON形式で送信してください。" }, 415);
  let payload: PermissionPayload;
  try {
    payload = (await request.json()) as PermissionPayload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const email = text(payload.email, 320).toLowerCase();
  const subject = text(payload.subject, 80);
  if (
    !EMAIL_PATTERN.test(email) ||
    (subject !== "*" && !SUBJECT_SLUG.test(subject))
  )
    return json({ error: "メールアドレスと担当分野を確認してください。" }, 400);
  await env.REPORTS.prepare(
    "INSERT OR IGNORE INTO report_admin_permissions (email, subject) VALUES (?, ?)",
  )
    .bind(email, subject)
    .run();
  return json({ ok: true }, 201);
}

async function deleteReportAdminPermission(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getGlobalAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  const url = new URL(request.url);
  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
  const subject = (url.searchParams.get("subject") ?? "").trim();
  if (
    !EMAIL_PATTERN.test(email) ||
    (subject !== "*" && !SUBJECT_SLUG.test(subject))
  )
    return json({ error: "対象の権限を確認してください。" }, 400);
  if (email === scope.email && subject === "*")
    return json({ error: "自分自身の全分野権限は削除できません。" }, 400);
  await env.REPORTS.prepare(
    "DELETE FROM report_admin_permissions WHERE email = ? AND subject = ?",
  )
    .bind(email, subject)
    .run();
  return json({ ok: true });
}

const googleOAuthConfigured = (env: Env) =>
  Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET);

const adminReturnPath = (value: string | null) =>
  value === "/admin/reports" || value === "/admin/reports/"
    ? value
    : "/admin/reports";

function googleCallbackUrl(request: Request) {
  const url = new URL(request.url);
  return `${url.origin}/auth/google/callback`;
}

async function startGoogleLogin(request: Request, env: Env): Promise<Response> {
  if (!googleOAuthEnabled(env) || !googleOAuthConfigured(env))
    return json({ error: "Googleログインはまだ有効ではありません。" }, 404);
  const requestUrl = new URL(request.url);
  const state = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorization.search = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    redirect_uri: googleCallbackUrl(request),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
    access_type: "online",
  }).toString();
  const headers = new Headers({ location: authorization.toString() });
  headers.append(
    "set-cookie",
    cookie(
      GOOGLE_STATE_COOKIE,
      JSON.stringify({
        state,
        returnTo: adminReturnPath(requestUrl.searchParams.get("returnTo")),
      }),
      10 * 60,
      "/auth/google",
    ),
  );
  return new Response(null, { status: 302, headers });
}

async function completeGoogleLogin(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!googleOAuthEnabled(env) || !googleOAuthConfigured(env))
    return json({ error: "Googleログインはまだ有効ではありません。" }, 404);
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code") ?? "";
  const state = requestUrl.searchParams.get("state") ?? "";
  let savedState: { state?: string; returnTo?: string } = {};
  try {
    savedState = JSON.parse(cookieValue(request, GOOGLE_STATE_COOKIE)) as {
      state?: string;
      returnTo?: string;
    };
  } catch {
    // 不正なCookieはログイン失敗として扱う。
  }
  if (!code || !state || state !== savedState.state)
    return json(
      { error: "Googleログインの確認に失敗しました。もう一度お試しください。" },
      400,
    );

  let token: { access_token?: string };
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_OAUTH_CLIENT_ID ?? "",
        client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
        redirect_uri: googleCallbackUrl(request),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) throw new Error("token exchange failed");
    token = (await tokenResponse.json()) as { access_token?: string };
  } catch {
    return json({ error: "Googleログインを完了できませんでした。" }, 502);
  }
  if (!token.access_token)
    return json({ error: "Googleログインを完了できませんでした。" }, 502);

  let user: { email?: string; email_verified?: boolean };
  try {
    const userResponse = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      { headers: { authorization: `Bearer ${token.access_token}` } },
    );
    if (!userResponse.ok) throw new Error("userinfo failed");
    user = (await userResponse.json()) as {
      email?: string;
      email_verified?: boolean;
    };
  } catch {
    return json({ error: "Googleアカウントを確認できませんでした。" }, 502);
  }
  const email = user.email?.trim().toLowerCase() ?? "";
  if (!user.email_verified || !EMAIL_PATTERN.test(email))
    return json({ error: "確認済みのGoogleメールアドレスが必要です。" }, 403);
  const permission = await env.REPORTS.prepare(
    "SELECT subject FROM report_admin_permissions WHERE email = ? LIMIT 1",
  )
    .bind(email)
    .first<{ subject: string }>();
  if (!permission)
    return json({ error: "この管理画面の閲覧権限が設定されていません。" }, 403);

  const sessionToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ADMIN_SESSION_DURATION_MS);
  await env.REPORTS.prepare(
    "DELETE FROM admin_auth_sessions WHERE expires_at <= ?",
  )
    .bind(now.toISOString())
    .run();
  await env.REPORTS.prepare(
    "INSERT INTO admin_auth_sessions (session_hash, email, expires_at, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(
      await hash(sessionToken),
      email,
      expiresAt.toISOString(),
      now.toISOString(),
    )
    .run();
  const headers = new Headers({
    location: adminReturnPath(savedState.returnTo ?? null),
  });
  headers.append(
    "set-cookie",
    cookie(
      ADMIN_SESSION_COOKIE,
      sessionToken,
      ADMIN_SESSION_DURATION_MS / 1_000,
    ),
  );
  headers.append(
    "set-cookie",
    cookie(GOOGLE_STATE_COOKIE, "", 0, "/auth/google"),
  );
  return new Response(null, { status: 302, headers });
}

async function logoutAdmin(request: Request, env: Env): Promise<Response> {
  if (googleOAuthEnabled(env)) {
    const token = cookieValue(request, ADMIN_SESSION_COOKIE);
    if (token)
      await env.REPORTS.prepare(
        "DELETE FROM admin_auth_sessions WHERE session_hash = ?",
      )
        .bind(await hash(token))
        .run();
  }
  const headers = new Headers({ location: "/admin/reports" });
  headers.append("set-cookie", cookie(ADMIN_SESSION_COOKIE, "", 0));
  return new Response(null, { status: 302, headers });
}

async function adminAuthStatus(request: Request, env: Env): Promise<Response> {
  const identity = await getAuthenticatedEmail(request, env);
  if (identity instanceof Response) return identity;
  const token = cookieValue(request, ADMIN_SESSION_COOKIE);
  const googleSession = token
    ? await env.REPORTS.prepare(
        "SELECT email FROM admin_auth_sessions WHERE session_hash = ? AND expires_at > ?",
      )
        .bind(await hash(token), new Date().toISOString())
        .first<{ email: string }>()
    : null;
  return json({
    email: identity,
    googlePreviewEnabled: googleOAuthEnabled(env) && googleOAuthConfigured(env),
    googleAuthenticated: googleSession?.email === identity,
    authMode: authMode(env),
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/auth/google/login" && request.method === "GET")
      return startGoogleLogin(request, env);
    if (url.pathname === "/auth/google/callback" && request.method === "GET")
      return completeGoogleLogin(request, env);
    if (url.pathname === "/auth/logout" && request.method === "POST")
      return logoutAdmin(request, env);
    if (url.pathname === "/api/admin/auth-status" && request.method === "GET")
      return adminAuthStatus(request, env);
    if (url.pathname === "/api/admin/report-admin-permissions") {
      if (request.method === "GET")
        return listReportAdminPermissions(request, env);
      if (request.method === "POST")
        return createReportAdminPermission(request, env);
      if (request.method === "DELETE")
        return deleteReportAdminPermission(request, env);
      return json({ error: "GET、POST、DELETEのみ利用できます。" }, 405);
    }
    if (url.pathname === "/api/admin/article-reports") {
      return request.method === "GET"
        ? listArticleReports(request, env)
        : json({ error: "GETのみ利用できます。" }, 405);
    }
    if (url.pathname === "/api/admin/article-analytics" && request.method === "GET")
      return listArticleAnalytics(request, env);
    const match = url.pathname.match(
      /^\/api\/admin\/article-reports\/([0-9a-f-]{36})$/i,
    );
    if (match)
      return request.method === "PATCH"
        ? updateArticleReport(request, env, match[1])
        : json({ error: "PATCHのみ利用できます。" }, 405);
    if (
      url.pathname === "/admin/reports" ||
      url.pathname === "/admin/reports/"
    ) {
      if (authMode(env) === "google-oauth") {
        const identity = await getAuthenticatedEmail(request, env);
        if (identity instanceof Response)
          return new Response(null, {
            status: 302,
            headers: {
              location: `/auth/google/login?returnTo=${encodeURIComponent(url.pathname)}`,
            },
          });
      }
      return env.ASSETS.fetch(request);
    }
    return new Response("Not found", { status: 404 });
  },
};
