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
  /** localhostの開発時だけ使う、ログイン不要のテスト用メールアドレス。 */
  ADMIN_LOCAL_EMAIL?: string;
  /** 承認済み原稿をmainへ反映するためのGitHub Fine-grained token（Secret）。 */
  GITHUB_PUBLISH_TOKEN?: string;
  GITHUB_REPOSITORY?: string;
}

type ReportStatus = "new" | "reviewing" | "resolved";
type AdminUpdatePayload = { status?: unknown; adminNote?: unknown };
type PermissionPayload = { email?: unknown; subject?: unknown };
type ReportAdminPermission = { email: string; subject: string };
type EditorialDocumentStatus = "draft" | "in-review" | "on-hold" | "approved";
type EditorialDocument = {
  id: string;
  source_article_id: string | null;
  subject: string;
  category: string;
  locale: string;
  slug: string;
  title: string;
  summary: string;
  concept_id: string;
  body: string;
  status: EditorialDocumentStatus;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
};
type EditorialComment = {
  id: string;
  document_id: string;
  body: string;
  created_by: string;
  created_at: string;
};
type EditorialDocumentPayload = {
  sourceArticleId?: unknown;
  subject?: unknown;
  category?: unknown;
  locale?: unknown;
  slug?: unknown;
  title?: unknown;
  summary?: unknown;
  conceptId?: unknown;
  body?: unknown;
  status?: unknown;
};
type EditorialCommentPayload = { body?: unknown };
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
const EDITORIAL_DOCUMENT_STATUSES = new Set<EditorialDocumentStatus>([
  "draft",
  "in-review",
  "on-hold",
  "approved",
]);
const MAX_ADMIN_NOTE_LENGTH = 4_000;
const MAX_EDITORIAL_BODY_LENGTH = 240_000;
const MAX_EDITORIAL_COMMENT_LENGTH = 8_000;
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

type AdminScope = { email: string; subjects: string[]; allSubjects: boolean; isManager: boolean };

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
const localDevelopmentEnabled = (request: Request, env: Env) => {
  const hostname = new URL(request.url).hostname;
  return (
    authMode(env) === "local" &&
    (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1")
  );
};

/**
 * 認証方式の境界。現在はCloudflare Access、将来は同じ権限表のまま
 * Google OAuthのセッションへ切り替えられる。
 */
async function getAuthenticatedEmail(
  request: Request,
  env: Env,
): Promise<string | Response> {
  const mode = authMode(env);
  if (localDevelopmentEnabled(request, env))
    return env.ADMIN_LOCAL_EMAIL ?? "local-editor@atlasez.test";
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
  // ローカル開発では本番D1の権限表をコピーしなくても動作確認できる。
  if (localDevelopmentEnabled(request, env))
    return { email, subjects: ["*"], allSubjects: true, isManager: true };
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
  const allSubjects = subjects.includes("*");
  return { email, subjects, allSubjects, isManager: allSubjects };
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

const editorialDocumentSelect = `SELECT id, source_article_id, subject, category, locale, slug,
  title, summary, concept_id, body, status, created_by, updated_by, created_at, updated_at, reviewed_at
  FROM editorial_documents`;

const canEditSubject = (scope: AdminScope, subject: string) =>
  scope.allSubjects || scope.subjects.includes(subject);

async function readEditorialPayload(
  request: Request,
): Promise<EditorialDocumentPayload | Response> {
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  if (request.headers.get("content-type")?.includes("application/json") !== true)
    return json({ error: "JSON形式で送信してください。" }, 415);
  try {
    return (await request.json()) as EditorialDocumentPayload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
}

const editorialValues = (payload: EditorialDocumentPayload) => {
  const subject = text(payload.subject, 80);
  const category = text(payload.category, 80);
  const locale = text(payload.locale, 8);
  const slug = text(payload.slug, 100);
  const title = text(payload.title, 180);
  const summary = text(payload.summary, 800);
  const conceptId = text(payload.conceptId, 180);
  const body = text(payload.body, MAX_EDITORIAL_BODY_LENGTH);
  const status = text(payload.status, 20) as EditorialDocumentStatus;
  const sourceArticleId = text(payload.sourceArticleId, 180) || null;
  if (
    !SUBJECT_SLUG.test(subject) ||
    !SUBJECT_SLUG.test(category) ||
    !["ja", "en"].includes(locale) ||
    !SUBJECT_SLUG.test(slug) ||
    !title ||
    !summary ||
    !/^[a-z0-9-]+\.[a-z0-9-]+\.[a-z0-9-]+$/.test(conceptId) ||
    !EDITORIAL_DOCUMENT_STATUSES.has(status)
  )
    return null;
  return {
    sourceArticleId,
    subject,
    category,
    locale,
    slug,
    title,
    summary,
    conceptId,
    body,
    status,
  };
};

async function listEditorialDocuments(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const filters: string[] = [];
  const values: unknown[] = [];
  if (!scope.allSubjects) {
    filters.push(`subject IN (${scope.subjects.map(() => "?").join(", ")})`);
    values.push(...scope.subjects);
  }
  const where = filters.length ? ` WHERE ${filters.join(" AND ")}` : "";
  const result = await env.REPORTS.prepare(
    `SELECT id, source_article_id, subject, category, locale, slug, title, summary, concept_id,
      status, created_by, updated_by, created_at, updated_at, reviewed_at
     FROM editorial_documents${where} ORDER BY updated_at DESC LIMIT 200`,
  )
    .bind(...values)
    .all<Omit<EditorialDocument, "body">>();
  return json({ documents: result.results, scope: { email: scope.email, subjects: scope.subjects, isManager: scope.isManager } });
}

async function getEditorialDocument(
  request: Request,
  env: Env,
  documentId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const document = await env.REPORTS.prepare(
    `${editorialDocumentSelect} WHERE id = ?`,
  )
    .bind(documentId)
    .first<EditorialDocument>();
  if (!document) return json({ error: "原稿が見つかりません。" }, 404);
  if (!canEditSubject(scope, document.subject))
    return json({ error: "この分野の原稿を閲覧する権限がありません。" }, 403);
  const comments = await env.REPORTS.prepare(
    "SELECT id, document_id, body, created_by, created_at FROM editorial_comments WHERE document_id = ? ORDER BY created_at ASC",
  )
    .bind(documentId)
    .all<EditorialComment>();
  return json({ document, comments: comments.results });
}

async function createEditorialDocument(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const payload = await readEditorialPayload(request);
  if (payload instanceof Response) return payload;
  const values = editorialValues(payload);
  if (!values)
    return json({ error: "記事設定を確認してください。タイトル・要約・概念IDは必須です。" }, 400);
  if (!canEditSubject(scope, values.subject))
    return json({ error: "この分野の原稿を作成する権限がありません。" }, 403);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.REPORTS.prepare(
    `INSERT INTO editorial_documents
      (id, source_article_id, subject, category, locale, slug, title, summary, concept_id, body,
       status, created_by, updated_by, created_at, updated_at, reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      values.sourceArticleId,
      values.subject,
      values.category,
      values.locale,
      values.slug,
      values.title,
      values.summary,
      values.conceptId,
      values.body,
      values.status,
      scope.email,
      scope.email,
      now,
      now,
      values.status === "approved" ? now : null,
    )
    .run();
  return json({ ok: true, id }, 201);
}

async function updateEditorialDocument(
  request: Request,
  env: Env,
  documentId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const payload = await readEditorialPayload(request);
  if (payload instanceof Response) return payload;
  const values = editorialValues(payload);
  if (!values)
    return json({ error: "記事設定を確認してください。タイトル・要約・概念IDは必須です。" }, 400);
  const existing = await env.REPORTS.prepare(
    "SELECT subject FROM editorial_documents WHERE id = ?",
  )
    .bind(documentId)
    .first<{ subject: string }>();
  if (!existing) return json({ error: "原稿が見つかりません。" }, 404);
  if (!canEditSubject(scope, existing.subject) || !canEditSubject(scope, values.subject))
    return json({ error: "この分野の原稿を更新する権限がありません。" }, 403);
  const owner = await env.REPORTS.prepare(
    "SELECT created_by FROM editorial_documents WHERE id = ?",
  ).bind(documentId).first<{ created_by: string }>();
  if (!scope.isManager && owner?.created_by !== scope.email)
    return json({ error: "原稿を編集できるのは作成者本人です。査読コメントは追加できます。" }, 403);
  if (values.status === "approved" && !scope.isManager)
    return json({ error: "承認済みに変更できるのは運営管理者だけです。" }, 403);
  const now = new Date().toISOString();
  const previous = await env.REPORTS.prepare(`${editorialDocumentSelect} WHERE id = ?`).bind(documentId).first<EditorialDocument>();
  if (previous) await env.REPORTS.prepare(
    "INSERT INTO editorial_document_revisions (id, document_id, title, summary, body, status, saved_by, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(crypto.randomUUID(), documentId, previous.title, previous.summary, previous.body, previous.status, scope.email, now).run();
  await env.REPORTS.prepare(
    `UPDATE editorial_documents SET source_article_id = ?, subject = ?, category = ?, locale = ?,
      slug = ?, title = ?, summary = ?, concept_id = ?, body = ?, status = ?, updated_by = ?,
      updated_at = ?, reviewed_at = CASE WHEN ? = 'approved' THEN COALESCE(reviewed_at, ?) ELSE NULL END
     WHERE id = ?`,
  )
    .bind(
      values.sourceArticleId,
      values.subject,
      values.category,
      values.locale,
      values.slug,
      values.title,
      values.summary,
      values.conceptId,
      values.body,
      values.status,
      scope.email,
      now,
      values.status,
      now,
      documentId,
    )
    .run();
  return json({ ok: true });
}

async function listEditorialRevisions(request: Request, env: Env, documentId: string): Promise<Response> {
  const scope = await getAdminScope(request, env); if (isResponse(scope)) return scope;
  const document = await env.REPORTS.prepare("SELECT subject FROM editorial_documents WHERE id = ?").bind(documentId).first<{subject:string}>();
  if (!document || !canEditSubject(scope, document.subject)) return json({ error: "この原稿を閲覧する権限がありません。" }, 403);
  const result = await env.REPORTS.prepare("SELECT id, title, summary, body, status, saved_by, saved_at FROM editorial_document_revisions WHERE document_id = ? ORDER BY saved_at DESC LIMIT 50").bind(documentId).all();
  return json({ revisions: result.results });
}

async function editorialBoard(request: Request, env: Env): Promise<Response> {
  const scope = await getAdminScope(request, env); if (isResponse(scope)) return scope;
  const filters:string[]=[]; const values:unknown[]=[];
  if (!scope.allSubjects) { filters.push(`subject IN (${scope.subjects.map(()=>"?").join(",")})`); values.push(...scope.subjects); }
  const where=filters.length?` WHERE ${filters.join(" AND ")}`:"";
  const result=await env.REPORTS.prepare(`SELECT subject, status, COUNT(*) AS count FROM editorial_documents${where} GROUP BY subject,status ORDER BY subject,status`).bind(...values).all();
  return json({ board: result.results });
}

async function createEditorialComment(
  request: Request,
  env: Env,
  documentId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  if (request.headers.get("content-type")?.includes("application/json") !== true)
    return json({ error: "JSON形式で送信してください。" }, 415);
  let payload: EditorialCommentPayload;
  try {
    payload = (await request.json()) as EditorialCommentPayload;
  } catch {
    return json({ error: "コメントを読み取れませんでした。" }, 400);
  }
  const body = text(payload.body, MAX_EDITORIAL_COMMENT_LENGTH);
  if (!body) return json({ error: "コメントを入力してください。" }, 400);
  const document = await env.REPORTS.prepare(
    "SELECT subject FROM editorial_documents WHERE id = ?",
  )
    .bind(documentId)
    .first<{ subject: string }>();
  if (!document) return json({ error: "原稿が見つかりません。" }, 404);
  if (!canEditSubject(scope, document.subject))
    return json({ error: "この分野にコメントする権限がありません。" }, 403);
  await env.REPORTS.prepare(
    "INSERT INTO editorial_comments (id, document_id, body, created_by, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), documentId, body, scope.email, new Date().toISOString())
    .run();
  return json({ ok: true }, 201);
}

const githubBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const editorialMarkdown = (document: EditorialDocument) => {
  const date = new Date().toISOString().slice(0, 10);
  return [
    "---", `articleId: ${document.locale}-${document.subject}-${document.slug}`,
    `locale: ${document.locale}`, `title: ${document.title}`, `slug: ${document.slug}`,
    `subject: ${document.subject}`, `category: ${document.category}`, "concepts:",
    `  - id: ${document.concept_id}`, "authors: [editorial-workspace]",
    `reviewers: [${document.updated_by}]`, "status: published", `createdAt: ${date}`,
    `updatedAt: ${date}`, `summary: ${document.summary}`, "difficulty: basic",
    "estimatedMinutes: 10", "tags: []", "aliases: []",
    "exerciseIds: { pre: [], post: [] }", "references: []", "---", "", document.body,
  ].join("\n");
};

async function publishEditorialDocument(request: Request, env: Env, documentId: string): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!scope.isManager) return json({ error: "公開できるのは運営管理者だけです。" }, 403);
  if (!isSameOrigin(request)) return json({ error: "この送信元からは受け付けられません。" }, 403);
  const document = await env.REPORTS.prepare(`${editorialDocumentSelect} WHERE id = ?`).bind(documentId).first<EditorialDocument>();
  if (!document) return json({ error: "原稿が見つかりません。" }, 404);
  if (document.status !== "approved") return json({ error: "公開前に原稿を承認済みにしてください。" }, 400);
  const repository = env.GITHUB_REPOSITORY ?? "mitukx/Atlasez01";
  const token = env.GITHUB_PUBLISH_TOKEN;
  if (!token) return json({ error: "GitHub公開連携がまだ設定されていません。運営管理者がGITHUB_PUBLISH_TOKENをCloudflare Secretへ登録してください。" }, 503);
  const path = `src/content/articles/${document.locale}/${document.subject}/${document.category}/${document.slug}.md`;
  const endpoint = `https://api.github.com/repos/${repository}/contents/${path}`;
  const headers = { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "user-agent": "atlasez-editorial-workspace", "x-github-api-version": "2022-11-28" };
  let sha: string | undefined;
  const existing = await fetch(endpoint, { headers });
  if (existing.ok) sha = (await existing.json() as { sha?: string }).sha;
  else if (existing.status !== 404) return json({ error: "GitHub上の公開先を確認できませんでした。" }, 502);
  const publish = await fetch(endpoint, { method: "PUT", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ message: `Publish article: ${document.title}`, content: githubBase64(editorialMarkdown(document)), branch: "main", ...(sha ? { sha } : {}) }) });
  if (!publish.ok) return json({ error: "GitHubへの公開に失敗しました。トークンのContents権限と対象リポジトリを確認してください。" }, 502);
  const result = await publish.json() as { commit?: { html_url?: string } };
  return json({ ok: true, commitUrl: result.commit?.html_url ?? null });
}

const googleOAuthConfigured = (env: Env) =>
  Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET);

const adminReturnPath = (value: string | null) =>
  value === "/admin/reports" ||
  value === "/admin/reports/" ||
  value === "/admin/editor" ||
  value === "/admin/editor/" ||
  value === "/admin/guide" ||
  value === "/admin/guide/"
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
    if (url.pathname === "/api/admin/editor/documents") {
      if (request.method === "GET") return listEditorialDocuments(request, env);
      if (request.method === "POST") return createEditorialDocument(request, env);
      return json({ error: "GET、POSTのみ利用できます。" }, 405);
    }
    if (url.pathname === "/api/admin/editor/board" && request.method === "GET") return editorialBoard(request, env);
    const editorialRevisionMatch = url.pathname.match(/^\/api\/admin\/editor\/documents\/([0-9a-f-]{36})\/revisions$/i);
    if (editorialRevisionMatch && request.method === "GET") return listEditorialRevisions(request, env, editorialRevisionMatch[1]);
    const editorialCommentMatch = url.pathname.match(
      /^\/api\/admin\/editor\/documents\/([0-9a-f-]{36})\/comments$/i,
    );
    if (editorialCommentMatch)
      return request.method === "POST"
        ? createEditorialComment(request, env, editorialCommentMatch[1])
        : json({ error: "POSTのみ利用できます。" }, 405);
    const editorialPublishMatch = url.pathname.match(
      /^\/api\/admin\/editor\/documents\/([0-9a-f-]{36})\/publish$/i,
    );
    if (editorialPublishMatch)
      return request.method === "POST"
        ? publishEditorialDocument(request, env, editorialPublishMatch[1])
        : json({ error: "POSTのみ利用できます。" }, 405);
    const editorialDocumentMatch = url.pathname.match(
      /^\/api\/admin\/editor\/documents\/([0-9a-f-]{36})$/i,
    );
    if (editorialDocumentMatch) {
      if (request.method === "GET")
        return getEditorialDocument(request, env, editorialDocumentMatch[1]);
      if (request.method === "PATCH")
        return updateEditorialDocument(request, env, editorialDocumentMatch[1]);
      return json({ error: "GET、PATCHのみ利用できます。" }, 405);
    }
    const match = url.pathname.match(
      /^\/api\/admin\/article-reports\/([0-9a-f-]{36})$/i,
    );
    if (match)
      return request.method === "PATCH"
        ? updateArticleReport(request, env, match[1])
        : json({ error: "PATCHのみ利用できます。" }, 405);
    if (
      url.pathname === "/admin/reports" ||
      url.pathname === "/admin/reports/" ||
      url.pathname === "/admin/editor" ||
      url.pathname === "/admin/editor/" ||
      url.pathname === "/admin/guide" ||
      url.pathname === "/admin/guide/"
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
    // Permit only the static support files used by the admin UI.  All learning
    // site pages remain unreachable from this Worker.
    if (
      url.pathname.startsWith("/_astro/") ||
      url.pathname.startsWith("/images/") ||
      url.pathname === "/favicon.svg"
    ) {
      return env.ASSETS.fetch(request);
    }
    return new Response("Not found", { status: 404 });
  },
};
