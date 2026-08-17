import {
  EDITORIAL_ASSET_ID_PATTERN,
  EDITORIAL_IMAGE_TYPES,
  MAX_EDITORIAL_ASSET_BYTES,
  editorialAssetIdsIn,
  replaceEditorialAssetMarkers,
  sanitizeEditorialFilename,
  type EditorialImageType,
} from "./lib/editorial-media";

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
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
}

interface Env {
  ASSETS: Fetcher;
  REPORTS: D1Database;
  /** 既定は cloudflare-access。Google移行時のみ google-oauth を設定する。 */
  ADMIN_AUTH_MODE?: string;
  /** Google OAuth後に必ず戻す運営サイトの固定URL。Preview URLでは認証を完結させない。 */
  ADMIN_PUBLIC_ORIGIN?: string;
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  /** localhostの開発時だけ使う、ログイン不要のテスト用メールアドレス。 */
  ADMIN_LOCAL_EMAIL?: string;
  /** 承認済み原稿をmainへ反映するためのGitHub Fine-grained token（Secret）。 */
  GITHUB_PUBLISH_TOKEN?: string;
  GITHUB_REPOSITORY?: string;
  /** 分野別・全体進捗の通知用。値はCloudflare Secretにのみ保存する。 */
  DISCORD_ATLAS_WEBHOOK_URL?: string;
  DISCORD_PROGRESS_WEBHOOK_URL?: string;
  /** 担当変更をDiscordロールへ反映するBot。 */
  DISCORD_BOT_TOKEN?: string;
  DISCORD_GUILD_ID?: string;
  /** 分野別通知を集約する、全体進捗チャンネルのID。 */
  DISCORD_PROGRESS_CHANNEL_ID?: string;
  /** Cloudflare Turnstile。応募フォーム公開時は必須にする。 */
  TURNSTILE_SECRET_KEY?: string;
  PUBLIC_TURNSTILE_SITE_KEY?: string;
}

type ReportStatus = "new" | "reviewing" | "resolved";
type AdminUpdatePayload = { status?: unknown; adminNote?: unknown };
type PermissionPayload = { email?: unknown; subject?: unknown };
type EditorialDocumentStatus = "draft" | "in-review" | "on-hold" | "approved";
type LatexEngine =
  "uplatex" | "pdflatex" | "xelatex" | "lualatex" | "mathjax" | "katex";
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
  writing_memo: string;
  latex_engine: LatexEngine;
  status: EditorialDocumentStatus;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  published_at: string | null;
};
type EditorialAsset = {
  id: string;
  document_id: string;
  filename: string;
  media_type: EditorialImageType;
  bytes: number;
  data: ArrayBuffer | Uint8Array;
  alt_text: string;
  created_by: string;
  created_at: string;
};
type EditorialComment = {
  id: string;
  document_id: string;
  parent_comment_id: string | null;
  body: string;
  created_by: string;
  created_at: string;
  selection_start: number | null;
  selection_end: number | null;
  selection_text: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  acknowledged_by_emails?: string[];
  unacknowledged_by_emails?: string[];
  selections?: EditorialCommentSelection[];
};
type EditorialCommentSelection = {
  id: string;
  comment_id: string;
  position: number;
  selection_start: number | null;
  selection_end: number | null;
  selection_text: string;
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
  latexEngine?: unknown;
  status?: unknown;
  writingMemo?: unknown;
};
type EditorialCommentPayload = {
  body?: unknown;
  selectionStart?: unknown;
  selectionEnd?: unknown;
  selectionText?: unknown;
  parentCommentId?: unknown;
  selections?: unknown;
};
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
const LATEX_ENGINES = new Set<LatexEngine>([
  "uplatex",
  "pdflatex",
  "xelatex",
  "lualatex",
  "mathjax",
  "katex",
]);
const MAX_ADMIN_NOTE_LENGTH = 4_000;
const MAX_EDITORIAL_BODY_LENGTH = 240_000;
const MAX_EDITORIAL_COMMENT_LENGTH = 8_000;
const MAX_PERSONAL_WORKSPACE_NOTE_LENGTH = 12_000;
const MAX_OPERATION_TEXT_LENGTH = 8_000;
const ACCESS_EMAIL_HEADER = "Cf-Access-Authenticated-User-Email";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBJECT_SLUG = /^[a-z0-9-]+$/;
const MEMBER_UNIVERSITIES = [
  "北海道大学",
  "東北大学",
  "東京大学",
  "東京科学大学",
  "東京都立大学",
  "早稲田大学",
  "横浜国立大学",
  "静岡大学",
  "新潟大学",
  "岐阜大学",
  "立命館大学",
  "京都大学",
  "大阪大学",
  "大阪公立大学",
  "神戸大学",
  "広島大学",
  "九州大学",
  "長崎大学",
  "東洋大学",
  "UCL",
  "国立台湾大学",
  "山口大学",
  "慶應義塾大学",
  "東京理科大学",
  "中央大学",
  "名古屋大学",
  "筑波大学",
  "名古屋市立大学",
  "名城大学",
  "Korea university, School of biomedical engineering",
  "立教大学",
  "Swarthmore College",
  "北見工業大学",
  "ZEN大学",
] as const;
const MEMBER_YEARS = [
  "中1",
  "中2",
  "中3",
  "高1",
  "高2",
  "高3",
  "高専1",
  "高専2",
  "高専3",
  "高専4",
  "高専5",
  "B1",
  "B2",
  "B3",
  "B4",
  "M1",
  "M2",
  "D1",
  "D2",
  "D3",
  "教職員・研究者",
  "社会人",
  "その他",
] as const;
const MEMBER_AFFILIATION_TYPES = [
  "中学校",
  "高等学校",
  "高等専門学校",
  "大学",
  "大学院",
  "研究機関・教育機関",
  "社会人",
  "その他",
] as const;
const MEMBER_INTERESTS = [
  "漢字",
  "古文",
  "漢文",
  "地理",
  "日本史",
  "世界史",
  "哲学",
  "考古学",
  "数学",
  "物理",
  "化学",
  "地質",
  "気象",
  "海洋",
  "天文",
  "生物",
  "情報",
  "水産学",
  "建築",
  "薬学",
  "中国語（普通話）",
  "台湾華語",
  "言語学",
  "ページデザイン",
] as const;
const APPLICATION_SUBJECT_LABELS: Record<string, string> = {
  kanji: "漢字",
  kobun: "古文",
  kanbun: "漢文",
  geography: "地理",
  "japanese-history": "日本史",
  "world-history": "世界史",
  philosophy: "哲学",
  archaeology: "考古学",
  mathematics: "数学",
  physics: "物理",
  chemistry: "化学",
  geology: "地質",
  meteorology: "気象",
  oceanography: "海洋",
  astronomy: "天文",
  biology: "生物",
  informatics: "情報",
  "fisheries-science": "水産学",
  architecture: "建築",
  pharmacy: "薬学",
  chinese: "中国語（普通話）",
  "taiwanese-mandarin": "台湾華語",
  linguistics: "言語学",
  other: "その他",
};
const APPLICATION_AFFILIATION_ALIASES: Record<string, string> = {
  中学: "中学校",
  中学生: "中学校",
  高校: "高等学校",
  高校生: "高等学校",
  高専: "高等専門学校",
  大学生: "大学",
  大学院生: "大学院",
  研究機関: "研究機関・教育機関",
  教育機関: "研究機関・教育機関",
};
const APPLICATION_GRADE_ALIASES: Record<string, string> = {
  中学1年: "中1",
  中学2年: "中2",
  中学3年: "中3",
  高校1年: "高1",
  高校2年: "高2",
  高校3年: "高3",
  大学1年: "B1",
  大学2年: "B2",
  大学3年: "B3",
  大学4年: "B4",
  学部1年: "B1",
  学部2年: "B2",
  学部3年: "B3",
  学部4年: "B4",
  修士1年: "M1",
  修士2年: "M2",
  博士1年: "D1",
  博士2年: "D2",
  博士3年: "D3",
};
const APPLICATION_GRADES_BY_AFFILIATION: Record<string, readonly string[]> = {
  中学校: ["中1", "中2", "中3", "その他"],
  高等学校: ["高1", "高2", "高3", "その他"],
  高等専門学校: ["高専1", "高専2", "高専3", "高専4", "高専5", "その他"],
  大学: ["B1", "B2", "B3", "B4", "教職員・研究者", "その他"],
  大学院: ["M1", "M2", "D1", "D2", "D3", "教職員・研究者", "その他"],
  "研究機関・教育機関": ["教職員・研究者", "その他"],
  社会人: ["社会人", "その他"],
  その他: MEMBER_YEARS,
};
const ADMIN_SESSION_COOKIE = "atlasez_admin_session";
const GOOGLE_STATE_COOKIE = "atlasez_google_oauth_state";
const ADMIN_SESSION_DURATION_MS = 8 * 60 * 60 * 1_000;
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });
const text = (value: unknown, maximum: number) =>
  typeof value === "string" ? value.trim().slice(0, maximum) : "";

const normalizedText = (value: unknown, maximum: number) =>
  text(value, maximum)
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeAffiliationType = (value: unknown) => {
  const normalized = normalizedText(value, 80);
  return APPLICATION_AFFILIATION_ALIASES[normalized] ?? normalized;
};

const normalizeGrade = (value: unknown) => {
  const normalized = normalizedText(value, 80);
  const compact = normalized.replace(/\s+/g, "");
  return APPLICATION_GRADE_ALIASES[compact] ?? compact.toUpperCase();
};

const normalizeInstitution = (value: unknown) => {
  const normalized = normalizedText(value, 160);
  const known = MEMBER_UNIVERSITIES.find(
    (institution) =>
      institution.normalize("NFKC").toLocaleLowerCase("en-US") ===
      normalized.toLocaleLowerCase("en-US"),
  );
  return known ?? normalized;
};

const validTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat("ja-JP", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
};

type AdminScope = {
  email: string;
  subjects: string[];
  allSubjects: boolean;
  isManager: boolean;
};

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
  const grantedSubjects = result.results
    .map((permission) => permission.subject)
    .filter(Boolean);
  if (!grantedSubjects.length)
    return json({ error: "この管理画面の閲覧権限が設定されていません。" }, 403);
  const allSubjects = grantedSubjects.includes("*");
  // `*` は全分野管理者の権限であって、その人自身の執筆担当分野ではない。
  // 通常の原稿一覧・作業状況は担当分野だけに限定する。
  const subjects = grantedSubjects.filter((subject) => subject !== "*");
  return { email, subjects, allSubjects, isManager: allSubjects };
}

const isResponse = <T>(value: T | Response): value is Response =>
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
  if (status) {
    filters.push("status = ?");
    values.push(status);
  }
  const where = filters.length ? ` WHERE ${filters.join(" AND ")}` : "";
  const statement = env.REPORTS.prepare(`${select}${where}${order}`);
  const result = values.length
    ? await statement.bind(...values).all<ArticleReport>()
    : await statement.all<ArticleReport>();
  // 問題内容は全運営者が確認できるが、送信者の連絡先は全分野管理者だけに開示する。
  return json({
    reports: result.results.map((report) => ({
      ...report,
      contact: scope.isManager ? report.contact : null,
    })),
  });
}

async function listArticleAnalytics(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const daysParam = Number(new URL(request.url).searchParams.get("days") ?? 30);
  const days = Number.isInteger(daysParam)
    ? Math.min(90, Math.max(1, daysParam))
    : 30;
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
    `SELECT p.email,
      GROUP_CONCAT(DISTINCT p.subject) AS subjects,
      COALESCE(NULLIF(TRIM(m.display_name), ''), '表示名未設定') AS display_name,
      COALESCE(m.university, '') AS university,
      COALESCE(m.year, '') AS year,
      COALESCE(m.interests, '') AS interests,
      COALESCE(m.avatar_url, '') AS avatar_url,
      COALESCE(d.discord_user_id, '') AS discord_user_id
     FROM report_admin_permissions p
     LEFT JOIN editorial_member_profiles m ON m.email = p.email
     LEFT JOIN atlasez_member_discord_accounts d ON d.email = p.email
     GROUP BY p.email, m.display_name, m.university, m.year, m.interests
     ORDER BY display_name, p.email`,
  ).all<{
    email: string;
    subjects: string;
    display_name: string;
    university: string;
    year: string;
    interests: string;
    avatar_url: string;
    discord_user_id: string;
  }>();
  return json({ permissions: result.results });
}

async function updateMemberDiscordUserId(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getGlobalAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let payload: { email?: unknown; discordUserId?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const email = text(payload.email, 320).toLowerCase();
  const discordUserId = text(payload.discordUserId, 32);
  if (!EMAIL_PATTERN.test(email))
    return json({ error: "メールアドレスを確認してください。" }, 400);
  if (discordUserId && !/^\d{15,22}$/.test(discordUserId))
    return json(
      { error: "DiscordユーザーIDは15〜22桁の数字で入力してください。" },
      400,
    );
  const participant = await env.REPORTS.prepare(
    "SELECT 1 AS found FROM report_admin_permissions WHERE email = ? LIMIT 1",
  )
    .bind(email)
    .first<{ found: number }>();
  if (!participant)
    return json(
      { error: "参加者一覧に登録されていないメールアドレスです。" },
      404,
    );
  if (discordUserId) {
    if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID)
      return json(
        { error: "本人確認に必要なDiscord Bot設定が未完了です。" },
        503,
      );
    const duplicate = await env.REPORTS.prepare(
      "SELECT email FROM atlasez_member_discord_accounts WHERE discord_user_id = ? AND email != ?",
    )
      .bind(discordUserId, email)
      .first<{ email: string }>();
    if (duplicate)
      return json(
        { error: "このDiscordユーザーIDは別の参加者に登録済みです。" },
        409,
      );
    const member = await fetch(
      `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${discordUserId}`,
      {
        headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
      },
    );
    if (!member.ok)
      return json(
        {
          error:
            "Bot test serverで対象ユーザーを確認できません。サーバー参加とユーザーIDを確認してください。",
        },
        400,
      );
  }
  const now = new Date().toISOString();
  if (discordUserId)
    await env.REPORTS.prepare(
      "INSERT INTO atlasez_member_discord_accounts (email,discord_user_id,updated_at) VALUES (?,?,?) ON CONFLICT(email) DO UPDATE SET discord_user_id=excluded.discord_user_id,updated_at=excluded.updated_at",
    )
      .bind(email, discordUserId, now)
      .run();
  else
    await env.REPORTS.prepare(
      "DELETE FROM atlasez_member_discord_accounts WHERE email = ?",
    )
      .bind(email)
      .run();
  if (!discordUserId)
    return json({
      ok: true,
      discordUserId,
      provisioning: { status: "skipped", applied: 0, warnings: [] },
    });
  const [profile, permissions] = await Promise.all([
    env.REPORTS.prepare(
      "SELECT university,year,interests,affiliation_type FROM editorial_member_profiles WHERE email=?",
    )
      .bind(email)
      .first<{
        university: string;
        year: string;
        interests: string;
        affiliation_type: string;
      }>(),
    env.REPORTS.prepare(
      "SELECT subject FROM report_admin_permissions WHERE email=?",
    )
      .bind(email)
      .all<{ subject: string }>(),
  ]);
  const provisioning = await provisionApplicationDiscordRoles(
    env,
    email,
    (permissions.results ?? []).map((item) => item.subject),
    {
      institution: profile?.university ?? "",
      year: profile?.year ?? "",
      affiliationType: profile?.affiliation_type ?? "",
      interests: (profile?.interests ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    },
  );
  await env.REPORTS.prepare(
    `UPDATE atlasez_member_applications
     SET provisioning_status = ?, provisioning_error = ?, provisioned_at = ?, updated_at = ?
     WHERE email = ? AND status = 'accepted'`,
  )
    .bind(
      provisioning.status,
      provisioning.warnings.join("\n").slice(0, 2_000),
      provisioning.status === "synced" ? now : null,
      now,
      email,
    )
    .run();
  return json(
    { ok: provisioning.status !== "failed", discordUserId, provisioning },
    provisioning.status === "failed" ? 502 : 200,
  );
}

async function syncDiscordMemberRoles(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getGlobalAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let payload: { email?: unknown };
  try {
    payload = (await request.json()) as { email?: unknown };
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const email = text(payload.email, 320).toLowerCase();
  if (!EMAIL_PATTERN.test(email))
    return json({ error: "メールアドレスを確認してください。" }, 400);
  const [profile, permissions] = await Promise.all([
    env.REPORTS.prepare(
      "SELECT university, year, interests, affiliation_type FROM editorial_member_profiles WHERE email = ?",
    )
      .bind(email)
      .first<{
        university: string;
        year: string;
        interests: string;
        affiliation_type: string;
      }>(),
    env.REPORTS.prepare(
      "SELECT subject FROM report_admin_permissions WHERE email = ?",
    )
      .bind(email)
      .all<{ subject: string }>(),
  ]);
  if (!profile && !permissions.results?.length)
    return json({ error: "参加者が見つかりません。" }, 404);
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID)
    return json(
      { error: "Discord BotトークンまたはサーバーIDが未設定です。" },
      503,
    );
  const account = await env.REPORTS.prepare(
    "SELECT discord_user_id FROM atlasez_member_discord_accounts WHERE email = ?",
  )
    .bind(email)
    .first<{ discord_user_id: string }>();
  if (!account)
    return json(
      {
        error:
          "この参加者のDiscordユーザーIDが未登録です。運営者・担当管理で本人確認後に登録してください。",
      },
      400,
    );
  const provisioning = await provisionApplicationDiscordRoles(
    env,
    email,
    (permissions.results ?? []).map((item) => item.subject),
    {
      institution: profile?.university ?? "",
      year: profile?.year ?? "",
      affiliationType: profile?.affiliation_type ?? "",
      interests: (profile?.interests ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    },
  );
  if (provisioning.status === "failed")
    return json({ error: provisioning.warnings.join(" "), provisioning }, 502);
  const memberResponse = await fetch(
    `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${account.discord_user_id}`,
    { headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } },
  );
  if (!memberResponse.ok)
    return json(
      {
        error:
          "Discordサーバー内に対象ユーザーが見つかりません。ユーザーIDとBotのサーバー参加状況を確認してください。",
      },
      502,
    );
  const member = (await memberResponse.json()) as { roles?: string[] };
  return json({
    ok: true,
    discordUserId: account.discord_user_id,
    roleCount: member.roles?.length ?? 0,
    provisioning,
  });
}

async function provisionDiscordAttributeRoles(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getGlobalAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID)
    return json(
      { error: "Discord BotトークンまたはサーバーIDが未設定です。" },
      503,
    );
  const headers = {
    authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
    "content-type": "application/json",
  };
  const guildResponse = await fetch(
    `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}`,
    { headers },
  );
  if (!guildResponse.ok)
    return json(
      {
        error:
          "Botが指定サーバーを確認できません。BotがBot test serverに参加しているか確認してください。",
      },
      502,
    );
  const guild = (await guildResponse.json()) as { name?: string };
  const guildName = (guild.name ?? "").trim();
  if (guildName.toLowerCase() !== "bot test server") {
    return json(
      {
        error: `接続先サーバーは「${guildName || "名称不明"}」です。Bot test serverではないため、ロール追加を中止しました。`,
      },
      409,
    );
  }
  const rolesResponse = await fetch(
    `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/roles`,
    { headers },
  );
  if (!rolesResponse.ok)
    return json(
      {
        error:
          "Discordロール一覧を取得できません。Botにサーバーのロール管理権限を付与してください。",
      },
      502,
    );
  const existing = (await rolesResponse.json()) as Array<{
    id: string;
    name: string;
  }>;
  const definitions: Array<{ type: string; value: string }> = [
    { type: "manager", value: "運営内運営" },
    ...MEMBER_AFFILIATION_TYPES.map((value) => ({
      type: "affiliation",
      value,
    })),
    ...MEMBER_UNIVERSITIES.map((value) => ({ type: "university", value })),
    ...MEMBER_YEARS.map((value) => ({ type: "year", value })),
    ...MEMBER_INTERESTS.map((value) => ({ type: "interest", value })),
  ];
  let created = 0;
  let reused = 0;
  for (const definition of definitions) {
    const current = existing.find(
      (role) => role.name.trim() === definition.value.trim(),
    );
    let roleId = current?.id;
    if (roleId) reused++;
    else {
      const response = await fetch(
        `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/roles`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: definition.value,
            color: 0x2f6fa8,
            hoist: false,
            mentionable: false,
          }),
        },
      );
      if (!response.ok)
        return json(
          {
            error: `「${definition.value}」ロールの作成に失敗しました。Botにロール管理権限があるか確認してください。`,
            created,
            reused,
          },
          502,
        );
      const role = (await response.json()) as { id: string; name: string };
      roleId = role.id;
      existing.push(role);
      created++;
    }
    if (definition.type === "manager")
      await env.REPORTS.prepare(
        "INSERT INTO atlasez_discord_role_mappings (project_id,subject,discord_role_id) VALUES ('atlas','__manager__',?) ON CONFLICT(project_id,subject) DO UPDATE SET discord_role_id=excluded.discord_role_id",
      )
        .bind(roleId)
        .run();
    else if (definition.type === "affiliation")
      await env.REPORTS.prepare(
        "INSERT INTO atlasez_discord_role_mappings (project_id,subject,discord_role_id) VALUES ('atlas',?,?) ON CONFLICT(project_id,subject) DO UPDATE SET discord_role_id=excluded.discord_role_id",
      )
        .bind(`__affiliation__${definition.value}`, roleId)
        .run();
    else
      await env.REPORTS.prepare(
        "INSERT INTO atlasez_discord_attribute_role_mappings (attribute_type,attribute_value,discord_role_id) VALUES (?,?,?) ON CONFLICT(attribute_type,attribute_value) DO UPDATE SET discord_role_id=excluded.discord_role_id",
      )
        .bind(definition.type, definition.value, roleId)
        .run();
  }
  return json({
    ok: true,
    guildName: guildName || "Bot test server",
    created,
    reused,
    total: definitions.length,
  });
}

async function updateMemberAttributes(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getGlobalAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let payload: {
    email?: unknown;
    university?: unknown;
    year?: unknown;
    interests?: unknown;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const email = text(payload.email, 320).toLowerCase(),
    university = normalizeInstitution(payload.university),
    year = normalizeGrade(payload.year);
  const interests = [
    ...new Set(
      Array.isArray(payload.interests)
        ? payload.interests
            .map((v) => normalizedText(v, 80))
            .filter((v) => (MEMBER_INTERESTS as readonly string[]).includes(v))
        : [],
    ),
  ];
  if (
    !EMAIL_PATTERN.test(email) ||
    /[<>]/.test(university) ||
    (year && !(MEMBER_YEARS as readonly string[]).includes(year))
  )
    return json(
      { error: "所属機関・学年・メールアドレスを確認してください。" },
      400,
    );
  const now = new Date().toISOString();
  await env.REPORTS.prepare(
    `INSERT INTO editorial_member_profiles (email, university, year, interests, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET university=excluded.university, year=excluded.year, interests=excluded.interests, updated_at=excluded.updated_at`,
  )
    .bind(email, university, year, interests.join(","), now)
    .run();
  await syncDiscordAttributeRoles(env, email, { university, year, interests });
  return json({ ok: true });
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
  await ensureAtlasMembership(env, {
    email,
    subjects: subject === "*" ? [] : [subject],
    allSubjects: subject === "*",
    isManager: subject === "*",
  });
  await syncDiscordSubjectRole(env, email, subject, true);
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
  await syncDiscordSubjectRole(env, email, subject, false);
  return json({ ok: true });
}

const editorialDocumentSelect = `SELECT id, source_article_id, subject, category, locale, slug,
  title, summary, concept_id, body, writing_memo, latex_engine, status, created_by, updated_by, created_at, updated_at, reviewed_at, published_at
  FROM editorial_documents`;

const canEditSubject = (scope: AdminScope, subject: string) =>
  scope.allSubjects || scope.subjects.includes(subject);

const canReviewDocument = (
  scope: AdminScope,
  subject: string,
  status: EditorialDocumentStatus,
) =>
  canEditSubject(scope, subject) || (scope.isManager && status === "in-review");

const editorialAssetResponse = (
  asset: Pick<
    EditorialAsset,
    "id" | "filename" | "media_type" | "bytes" | "alt_text" | "created_at"
  >,
) => ({
  id: asset.id,
  filename: asset.filename,
  mediaType: asset.media_type,
  bytes: asset.bytes,
  alt: asset.alt_text,
  createdAt: asset.created_at,
  marker: `asset://${asset.id}`,
});

const imageSignatureMatches = (
  bytes: Uint8Array,
  mediaType: EditorialImageType,
) => {
  const startsWith = (...values: number[]) =>
    values.every((value, index) => bytes[index] === value);
  if (mediaType === "image/png")
    return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (mediaType === "image/jpeg") return startsWith(0xff, 0xd8, 0xff);
  if (mediaType === "image/gif")
    return (
      new TextDecoder().decode(bytes.slice(0, 6)) === "GIF87a" ||
      new TextDecoder().decode(bytes.slice(0, 6)) === "GIF89a"
    );
  return (
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  );
};

const editorialAssetDocument = async (
  request: Request,
  env: Env,
  documentId: string,
) => {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const document = await env.REPORTS.prepare(
    "SELECT id, subject, status, created_by FROM editorial_documents WHERE id = ?",
  )
    .bind(documentId)
    .first<
      Pick<EditorialDocument, "id" | "subject" | "status" | "created_by">
    >();
  if (!document) return json({ error: "原稿が見つかりません。" }, 404);
  if (!canReviewDocument(scope, document.subject, document.status))
    return json({ error: "この原稿の素材を扱う権限がありません。" }, 403);
  return { scope, document };
};

async function listEditorialAssets(
  request: Request,
  env: Env,
  documentId: string,
): Promise<Response> {
  const access = await editorialAssetDocument(request, env, documentId);
  if (access instanceof Response) return access;
  const result = await env.REPORTS.prepare(
    `SELECT id, filename, media_type, bytes, alt_text, created_at
     FROM editorial_assets WHERE document_id = ? ORDER BY created_at ASC`,
  )
    .bind(documentId)
    .all<
      Pick<
        EditorialAsset,
        "id" | "filename" | "media_type" | "bytes" | "alt_text" | "created_at"
      >
    >();
  return json({ assets: result.results.map(editorialAssetResponse) });
}

async function uploadEditorialAsset(
  request: Request,
  env: Env,
  documentId: string,
): Promise<Response> {
  const access = await editorialAssetDocument(request, env, documentId);
  if (access instanceof Response) return access;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  if (
    !access.scope.isManager &&
    access.document.created_by !== access.scope.email
  )
    return json({ error: "素材を追加できるのは原稿の作成者本人です。" }, 403);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_EDITORIAL_ASSET_BYTES + 32_000)
    return json({ error: "画像は1.5MB以下にしてください。" }, 413);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "画像データを読み取れませんでした。" }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File))
    return json({ error: "画像ファイルを選択してください。" }, 400);
  const mediaType = file.type as EditorialImageType;
  if (!(mediaType in EDITORIAL_IMAGE_TYPES))
    return json({ error: "PNG、JPEG、WebP、GIFのみ対応しています。" }, 415);
  const data = new Uint8Array(await file.arrayBuffer());
  if (!data.byteLength || data.byteLength > MAX_EDITORIAL_ASSET_BYTES)
    return json({ error: "画像は1.5MB以下にしてください。" }, 413);
  if (!imageSignatureMatches(data, mediaType))
    return json({ error: "画像の形式を確認できませんでした。" }, 415);
  const id = crypto.randomUUID();
  const filename = sanitizeEditorialFilename(file.name, mediaType);
  const alt = text(form.get("alt"), 180);
  const now = new Date().toISOString();
  await env.REPORTS.prepare(
    `INSERT INTO editorial_assets
      (id, document_id, filename, media_type, bytes, data, alt_text, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      documentId,
      filename,
      mediaType,
      data.byteLength,
      data,
      alt,
      access.scope.email,
      now,
    )
    .run();
  return json(
    {
      asset: editorialAssetResponse({
        id,
        filename,
        media_type: mediaType,
        bytes: data.byteLength,
        alt_text: alt,
        created_at: now,
      }),
    },
    201,
  );
}

async function serveEditorialAsset(
  request: Request,
  env: Env,
  assetId: string,
): Promise<Response> {
  if (!EDITORIAL_ASSET_ID_PATTERN.test(assetId))
    return new Response("Not found", { status: 404 });
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const asset = await env.REPORTS.prepare(
    `SELECT a.id, a.document_id, a.filename, a.media_type, a.bytes, a.data,
            d.subject, d.status
     FROM editorial_assets a
     JOIN editorial_documents d ON d.id = a.document_id
     WHERE a.id = ?`,
  )
    .bind(assetId)
    .first<
      EditorialAsset & { subject: string; status: EditorialDocumentStatus }
    >();
  if (!asset || !canReviewDocument(scope, asset.subject, asset.status))
    return new Response("Not found", { status: 404 });
  const responseBody =
    asset.data instanceof Uint8Array ? asset.data.slice().buffer : asset.data;
  return new Response(responseBody as ArrayBuffer, {
    headers: {
      "cache-control": "private, max-age=60",
      "content-length": String(asset.bytes),
      "content-type": asset.media_type,
      "content-disposition": `inline; filename="${asset.filename}"`,
      "x-content-type-options": "nosniff",
    },
  });
}

async function readEditorialPayload(
  request: Request,
): Promise<EditorialDocumentPayload | Response> {
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  if (
    request.headers.get("content-type")?.includes("application/json") !== true
  )
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
  const writingMemo = text(payload.writingMemo, MAX_PERSONAL_WORKSPACE_NOTE_LENGTH);
  const latexEngine =
    (text(payload.latexEngine, 24) as LatexEngine) || "mathjax";
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
    !EDITORIAL_DOCUMENT_STATUSES.has(status) ||
    !LATEX_ENGINES.has(latexEngine)
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
    writingMemo,
    latexEngine,
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
    if (!scope.subjects.length)
      return json({
        documents: [],
        scope: { email: scope.email, subjects: [], isManager: scope.isManager },
      });
    filters.push(`subject IN (${scope.subjects.map(() => "?").join(", ")})`);
    values.push(...scope.subjects);
  }
  const where = filters.length ? ` WHERE ${filters.join(" AND ")}` : "";
  const result = await env.REPORTS.prepare(
    `SELECT id, source_article_id, subject, category, locale, slug, title, summary, concept_id, latex_engine,
      status, created_by, updated_by, created_at, updated_at, reviewed_at, published_at
     FROM editorial_documents${where} ORDER BY updated_at DESC LIMIT 200`,
  )
    .bind(...values)
    .all<Omit<EditorialDocument, "body">>();
  const documentRows = result.results ?? [];
  // 査読依頼テーブルは先行環境にも存在するが、古いローカルD1では
  // 未作成の場合があるため、一覧取得自体は依頼情報なしでも継続する。
  const assignmentRows = documentRows.length
    ? await env.REPORTS.prepare(
        `SELECT document_id, reviewer_email FROM editorial_review_assignments
         WHERE document_id IN (${documentRows.map(() => "?").join(",")})`,
      )
        .bind(...documentRows.map((document) => document.id))
        .all<{ document_id: string; reviewer_email: string }>()
        .catch(() => ({ results: [] as { document_id: string; reviewer_email: string }[] }))
    : { results: [] as { document_id: string; reviewer_email: string }[] };
  const reviewerByDocument = new Map(
    (assignmentRows.results ?? []).map((assignment) => [
      assignment.document_id,
      assignment.reviewer_email,
    ]),
  );
  return json({
    documents: documentRows.map((document) => ({
      ...document,
      reviewer_email: reviewerByDocument.get(document.id) ?? null,
    })),
    scope: {
      email: scope.email,
      subjects: scope.subjects,
      isManager: scope.isManager,
    },
  });
}

async function getPersonalWorkspace(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const [documents, workspace] = await Promise.all([
    env.REPORTS.prepare(
      `SELECT id, subject, category, title, status, updated_at, published_at
       FROM editorial_documents WHERE created_by = ? ORDER BY updated_at DESC LIMIT 100`,
    )
      .bind(scope.email)
      .all<
        Pick<
          EditorialDocument,
          | "id"
          | "subject"
          | "category"
          | "title"
          | "status"
          | "updated_at"
          | "published_at"
        >
      >(),
    env.REPORTS.prepare(
      "SELECT private_note, updated_at FROM editorial_personal_workspaces WHERE email = ?",
    )
      .bind(scope.email)
      .first<{ private_note: string; updated_at: string }>(),
  ]);
  return json({
    email: scope.email,
    privateNote: workspace?.private_note ?? "",
    privateNoteUpdatedAt: workspace?.updated_at ?? null,
    documents: documents.results,
  });
}

async function savePersonalWorkspace(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  if (
    request.headers.get("content-type")?.includes("application/json") !== true
  )
    return json({ error: "JSON形式で送信してください。" }, 415);
  let payload: { privateNote?: unknown };
  try {
    payload = (await request.json()) as { privateNote?: unknown };
  } catch {
    return json({ error: "メモを読み取れませんでした。" }, 400);
  }
  const privateNote = text(
    payload.privateNote,
    MAX_PERSONAL_WORKSPACE_NOTE_LENGTH,
  );
  const updatedAt = new Date().toISOString();
  await env.REPORTS.prepare(
    `INSERT INTO editorial_personal_workspaces (email, private_note, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET private_note = excluded.private_note, updated_at = excluded.updated_at`,
  )
    .bind(scope.email, privateNote, updatedAt)
    .run();
  return json({ ok: true, updatedAt });
}

const taskStatus = new Set(["open", "doing", "done"]);
const availabilityStatus = new Set(["available", "maybe", "unavailable"]);

type OperationProject = { id: string; slug: string; name: string; description: string };

async function ensureAtlasMembership(env: Env, scope: AdminScope) {
  await env.REPORTS.prepare(
    "INSERT OR IGNORE INTO atlasez_project_memberships (project_id, email, role, joined_at) VALUES ('atlas', ?, ?, ?)",
  )
    .bind(
      scope.email,
      scope.isManager ? "manager" : "member",
      new Date().toISOString(),
    )
    .run();
}

/** プロジェクト単位のAPI境界。管理者でも、存在しないプロジェクトは開けない。 */
async function resolveOperationProject(
  env: Env,
  scope: AdminScope,
  requested: string,
): Promise<OperationProject | Response> {
  const key = requested.trim().toLowerCase() || "atlas";
  const project = await env.REPORTS.prepare(
    "SELECT id, slug, name, description FROM atlasez_projects WHERE id = ? OR slug = ? LIMIT 1",
  )
    .bind(key, key)
    .first<OperationProject>();
  if (!project) return json({ error: "指定したプロジェクトが見つかりません。" }, 404);
  if (scope.isManager) return project;
  const membership = await env.REPORTS.prepare(
    "SELECT project_id FROM atlasez_project_memberships WHERE project_id = ? AND email = ?",
  )
    .bind(project.id, scope.email)
    .first<{ project_id: string }>();
  if (!membership)
    return json({ error: "このプロジェクトのメンバーではありません。" }, 403);
  return project;
}

async function postDiscordWebhook(url: string | undefined, content: string) {
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: content.slice(0, 1_900),
        allowed_mentions: { parse: [] },
      }),
    });
  } catch {
    /* 通知失敗は本文保存を妨げない。 */
  }
}

async function notifyProgressToDiscord(
  env: Env,
  subject: string | null,
  body: string,
) {
  const subjectLabel = subject ? `【${subject}】` : "【全体】";
  const message = `📌 ${subjectLabel} 進捗報告\n${body}`;
  await Promise.all([
    postDiscordWebhook(env.DISCORD_PROGRESS_WEBHOOK_URL, message),
    postDiscordWebhook(env.DISCORD_ATLAS_WEBHOOK_URL, message),
    postDiscordChannel(env, env.DISCORD_PROGRESS_CHANNEL_ID, message),
    postDiscordSubjectChannel(env, subject, message),
  ]);
}

async function postDiscordSubjectChannel(
  env: Env,
  subject: string | null,
  content: string,
) {
  if (!env.DISCORD_BOT_TOKEN || !subject) return;
  const channel = await env.REPORTS.prepare(
    "SELECT discord_channel_id FROM atlasez_discord_channel_mappings WHERE project_id = 'atlas' AND subject = ?",
  )
    .bind(subject)
    .first<{ discord_channel_id: string }>();
  if (!channel) return;
  try {
    await fetch(
      `https://discord.com/api/v10/channels/${channel.discord_channel_id}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          content: content.slice(0, 1_900),
          allowed_mentions: { parse: [] },
        }),
      },
    );
  } catch {
    /* Discord設定が未完了でも進捗保存は継続する。 */
  }
}

async function postDiscordChannel(
  env: Env,
  channelId: string | undefined,
  content: string,
) {
  if (!env.DISCORD_BOT_TOKEN || !channelId) return;
  try {
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        content: content.slice(0, 1_900),
        allowed_mentions: { parse: [] },
      }),
    });
  } catch {
    /* 通知失敗は進捗保存を妨げない。 */
  }
}

async function syncDiscordSubjectRole(
  env: Env,
  email: string,
  subject: string,
  add: boolean,
) {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID || !subject) return;
  const mappingSubject = subject === "*" ? "__manager__" : subject;
  const account = await env.REPORTS.prepare(
    "SELECT discord_user_id FROM atlasez_member_discord_accounts WHERE email = ?",
  )
    .bind(email)
    .first<{ discord_user_id: string }>();
  const mapping = await env.REPORTS.prepare(
    "SELECT discord_role_id FROM atlasez_discord_role_mappings WHERE project_id = 'atlas' AND subject = ?",
  )
    .bind(mappingSubject)
    .first<{ discord_role_id: string }>();
  if (!account || !mapping) return;
  const endpoint = `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${account.discord_user_id}/roles/${mapping.discord_role_id}`;
  try {
    await fetch(endpoint, {
      method: add ? "PUT" : "DELETE",
      headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
    });
  } catch {
    /* 権限・Bot設定は管理画面のDB変更を止めない。 */
  }
}

async function syncDiscordAttributeRoles(
  env: Env,
  email: string,
  attrs: {
    university: string;
    year: string;
    interests: string[];
    affiliationType?: string;
  },
) {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return;
  const account = await env.REPORTS.prepare(
    "SELECT discord_user_id FROM atlasez_member_discord_accounts WHERE email = ?",
  )
    .bind(email)
    .first<{ discord_user_id: string }>();
  if (!account) return;
  const desired = new Set<string>();
  let guildRoles: Array<{ id: string; name: string }> = [];
  try {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/roles`,
      { headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } },
    );
    if (response.ok)
      guildRoles = (await response.json()) as Array<{
        id: string;
        name: string;
      }>;
  } catch {
    /* 対応表を優先し、取得失敗は後段で通知する。 */
  }
  const values: Array<[string, string]> = [];
  if (attrs.university) values.push(["university", attrs.university]);
  if (attrs.affiliationType)
    values.push(["affiliation", attrs.affiliationType]);
  if (attrs.year) values.push(["year", attrs.year]);
  for (const interest of attrs.interests)
    if (interest) values.push(["interest", interest]);
  for (const [type, value] of values) {
    if (type === "affiliation") {
      const mapping = await env.REPORTS.prepare(
        "SELECT discord_role_id FROM atlasez_discord_role_mappings WHERE project_id='atlas' AND subject=?",
      )
        .bind(`__affiliation__${value}`)
        .first<{ discord_role_id: string }>();
      if (mapping) desired.add(mapping.discord_role_id);
      continue;
    }
    const mapping = await env.REPORTS.prepare(
      "SELECT discord_role_id FROM atlasez_discord_attribute_role_mappings WHERE attribute_type = ? AND attribute_value = ?",
    )
      .bind(type, value)
      .first<{ discord_role_id: string }>();
    if (mapping) desired.add(mapping.discord_role_id);
    else {
      const role = guildRoles.find((item) => item.name.trim() === value.trim());
      if (role) desired.add(role.id);
    }
  }
  // 必要なロールだけを付与する。全ロールの削除確認まで行うと、属性数が増えた際に
  // Workerのサブリクエスト上限を超えて同期ボタンが失敗するため、不要ロールの整理は行わない。
  for (const roleId of desired) {
    const endpoint = `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${account.discord_user_id}/roles/${roleId}`;
    try {
      await fetch(endpoint, {
        method: "PUT",
        headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
      });
    } catch {
      /* Discordの設定不備でプロフィール保存を止めない。 */
    }
  }
}

type DiscordProvisioningResult = {
  status: "synced" | "skipped" | "failed";
  applied: number;
  warnings: string[];
};

/**
 * 応募承認用のDiscord同期。必要なロールが未作成なら、管理者による承認を
 * 起点として作成・対応表登録まで行う。各操作は冪等なので、通信失敗後も
 * 「受入・再同期」を実行すれば未完了分だけを安全に再試行できる。
 */
async function provisionApplicationDiscordRoles(
  env: Env,
  email: string,
  subjects: string[],
  attrs: {
    institution: string;
    year: string;
    affiliationType: string;
    interests: string[];
  },
): Promise<DiscordProvisioningResult> {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID)
    return {
      status: "skipped",
      applied: 0,
      warnings: ["Discord Botが未設定です。"],
    };
  const account = await env.REPORTS.prepare(
    "SELECT discord_user_id FROM atlasez_member_discord_accounts WHERE email = ?",
  )
    .bind(email)
    .first<{ discord_user_id: string }>();
  if (!account?.discord_user_id)
    return {
      status: "skipped",
      applied: 0,
      warnings: ["DiscordユーザーIDが未登録です。"],
    };

  const headers = {
    authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
    "content-type": "application/json",
  };
  const [memberResponse, rolesResponse] = await Promise.all([
    fetch(
      `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${account.discord_user_id}`,
      { headers },
    ),
    fetch(`https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/roles`, {
      headers,
    }),
  ]);
  if (!memberResponse.ok)
    return {
      status: "failed",
      applied: 0,
      warnings: ["Discordサーバー内に対象ユーザーが見つかりません。"],
    };
  if (!rolesResponse.ok)
    return {
      status: "failed",
      applied: 0,
      warnings: ["Discordのロール一覧を取得できません。"],
    };
  const member = (await memberResponse.json()) as { roles?: string[] };
  const guildRoles = (await rolesResponse.json()) as Array<{
    id: string;
    name: string;
  }>;
  const desired = new Set<string>();
  const warnings: string[] = [];

  const ensureMappedRole = async (
    kind: "subject" | "attribute" | "affiliation",
    key: string,
    label: string,
  ) => {
    let roleId = "";
    if (kind === "attribute") {
      const mapping = await env.REPORTS.prepare(
        "SELECT discord_role_id FROM atlasez_discord_attribute_role_mappings WHERE attribute_type = ? AND attribute_value = ?",
      )
        .bind(key.split(":", 1)[0], key.slice(key.indexOf(":") + 1))
        .first<{ discord_role_id: string }>();
      roleId = mapping?.discord_role_id ?? "";
    } else {
      const mappingSubject =
        kind === "affiliation" ? `__affiliation__${key}` : key;
      const mapping = await env.REPORTS.prepare(
        "SELECT discord_role_id FROM atlasez_discord_role_mappings WHERE project_id = 'atlas' AND subject = ?",
      )
        .bind(mappingSubject)
        .first<{ discord_role_id: string }>();
      roleId = mapping?.discord_role_id ?? "";
    }
    if (!roleId)
      roleId =
        guildRoles.find((role) => role.name.trim() === label.trim())?.id ?? "";
    if (!roleId) {
      const create = await fetch(
        `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/roles`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: label.slice(0, 100),
            color: 0x2f6fa8,
            hoist: false,
            mentionable: false,
          }),
        },
      );
      if (!create.ok) {
        warnings.push(`「${label}」ロールを作成できませんでした。`);
        return;
      }
      const role = (await create.json()) as { id: string; name: string };
      roleId = role.id;
      guildRoles.push(role);
    }
    if (kind === "attribute") {
      const attributeType = key.split(":", 1)[0];
      const attributeValue = key.slice(key.indexOf(":") + 1);
      await env.REPORTS.prepare(
        "INSERT INTO atlasez_discord_attribute_role_mappings (attribute_type,attribute_value,discord_role_id) VALUES (?,?,?) ON CONFLICT(attribute_type,attribute_value) DO UPDATE SET discord_role_id=excluded.discord_role_id",
      )
        .bind(attributeType, attributeValue, roleId)
        .run();
    } else {
      const mappingSubject =
        kind === "affiliation" ? `__affiliation__${key}` : key;
      await env.REPORTS.prepare(
        "INSERT INTO atlasez_discord_role_mappings (project_id,subject,discord_role_id) VALUES ('atlas',?,?) ON CONFLICT(project_id,subject) DO UPDATE SET discord_role_id=excluded.discord_role_id",
      )
        .bind(mappingSubject, roleId)
        .run();
    }
    desired.add(roleId);
  };

  for (const subject of subjects) {
    if (subject === "*")
      await ensureMappedRole("subject", "__manager__", "運営内運営");
    else
      await ensureMappedRole(
        "subject",
        subject,
        APPLICATION_SUBJECT_LABELS[subject] ?? subject,
      );
  }
  if (attrs.affiliationType)
    await ensureMappedRole(
      "affiliation",
      attrs.affiliationType,
      attrs.affiliationType,
    );
  if (attrs.institution)
    await ensureMappedRole(
      "attribute",
      `university:${attrs.institution}`,
      attrs.institution,
    );
  if (attrs.year)
    await ensureMappedRole("attribute", `year:${attrs.year}`, attrs.year);
  for (const interest of attrs.interests)
    if (interest)
      await ensureMappedRole("attribute", `interest:${interest}`, interest);

  const current = new Set(member.roles ?? []);
  let applied = 0;
  for (const roleId of desired) {
    if (current.has(roleId)) continue;
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${account.discord_user_id}/roles/${roleId}`,
      { method: "PUT", headers },
    );
    if (response.ok) applied++;
    else
      warnings.push(`Discordロール（ID: ${roleId}）を付与できませんでした。`);
  }
  return { status: warnings.length ? "failed" : "synced", applied, warnings };
}

async function getMyProfile(request: Request, env: Env): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const [profile, discord] = await Promise.all([
    env.REPORTS.prepare(
      "SELECT display_name, bio, availability_note, avatar_url, university, year, interests, updated_at FROM editorial_member_profiles WHERE email = ?",
    )
      .bind(scope.email)
      .first<{
        display_name: string;
        bio: string;
        availability_note: string;
        avatar_url: string;
        university: string;
        year: string;
        interests: string;
        updated_at: string;
      }>(),
    env.REPORTS.prepare(
      "SELECT discord_user_id FROM atlasez_member_discord_accounts WHERE email = ?",
    )
      .bind(scope.email)
      .first<{ discord_user_id: string }>(),
  ]);
  const roles = [
    ...(scope.isManager ? ["全分野管理者"] : []),
    ...scope.subjects.map(
      (subject) => APPLICATION_SUBJECT_LABELS[subject] ?? subject,
    ),
  ];
  return json({
    email: scope.email,
    subjects: scope.subjects,
    roles,
    isManager: scope.isManager,
    discordUserId: discord?.discord_user_id ?? "",
    profile: profile ?? {
      display_name: "",
      bio: "",
      availability_note: "",
      avatar_url: "",
      updated_at: null,
    },
  });
}

async function portalOverview(request: Request, env: Env): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  await ensureAtlasMembership(env, scope);
  const [projects, todos] = await Promise.all([
    scope.isManager
      ? env.REPORTS.prepare(
          `SELECT p.id,p.slug,p.name,p.description,'manager' AS role FROM atlasez_projects p ORDER BY p.name`,
        ).all()
      : env.REPORTS.prepare(
          `SELECT p.id,p.slug,p.name,p.description,m.role FROM atlasez_projects p JOIN atlasez_project_memberships m ON m.project_id=p.id WHERE m.email=? ORDER BY p.name`,
        )
          .bind(scope.email)
          .all(),
    env.REPORTS.prepare(
      `SELECT id,project_id,subject,assignee_email,title,details,status,updated_at FROM atlasez_project_todos WHERE assignee_email=? AND status != 'done' ORDER BY updated_at DESC LIMIT 100`,
    )
      .bind(scope.email)
      .all(),
  ]);
  return json({
    email: scope.email,
    projects: projects.results,
    todos: todos.results,
  });
}

async function createAtlasezProject(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getGlobalAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let p: {
    slug?: unknown;
    name?: unknown;
    description?: unknown;
    memberEmails?: unknown;
  };
  try {
    p = (await request.json()) as typeof p;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const slug = text(p.slug, 60).toLowerCase(),
    name = text(p.name, 100),
    description = text(p.description, 1000);
  if (!/^[a-z0-9-]{2,60}$/.test(slug) || !name)
    return json(
      {
        error:
          "英小文字・数字・ハイフンのプロジェクトIDと名称を入力してください。",
      },
      400,
    );
  const members = Array.isArray(p.memberEmails)
    ? p.memberEmails
        .map((v) => text(v, 320).toLowerCase())
        .filter((v) => EMAIL_PATTERN.test(v))
    : [];
  const id = crypto.randomUUID(),
    now = new Date().toISOString();
  try {
    await env.REPORTS.prepare(
      "INSERT INTO atlasez_projects (id,slug,name,description,created_at) VALUES (?,?,?,?,?)",
    )
      .bind(id, slug, name, description, now)
      .run();
  } catch {
    return json({ error: "同じプロジェクトIDが既にあります。" }, 409);
  }
  const allMembers = [...new Set([scope.email, ...members])];
  for (const email of allMembers)
    await env.REPORTS.prepare(
      "INSERT OR IGNORE INTO atlasez_project_memberships (project_id,email,role,joined_at) VALUES (?,?,?,?)",
    )
      .bind(id, email, email === scope.email ? "manager" : "member", now)
      .run();
  return json({ ok: true, slug });
}

async function saveMyProfile(request: Request, env: Env): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  // 表示名・所属・学年・担当分野は全分野管理者の管理画面で一元管理する。
  // 個人ページから変更できるのは本人のプロフィール画像だけに限定する。
  let payload: { avatarUrl?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const avatarUrl = text(payload.avatarUrl, 3_000_000);
  if (
    avatarUrl &&
    ((!/^https:\/\//i.test(avatarUrl) &&
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(
        avatarUrl,
      )) ||
      /["'<>]/.test(avatarUrl))
  )
    return json(
      {
        error:
          "プロフィール画像はPNG・JPEG・WebPの画像ファイル、またはhttps://画像URLを指定してください。",
      },
      400,
    );
  const updatedAt = new Date().toISOString();
  try {
    await env.REPORTS.prepare(
      `INSERT INTO editorial_member_profiles (email, avatar_url, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET avatar_url=excluded.avatar_url,updated_at=excluded.updated_at`,
    )
      .bind(scope.email, avatarUrl, updatedAt)
      .run();
  } catch {
    return json(
      {
        error:
          "プロフィールを保存できませんでした。時間をおいて再度お試しください。",
      },
      500,
    );
  }
  return json({ ok: true, updatedAt });
}

async function listApplications(request: Request, env: Env): Promise<Response> {
  const scope = await getGlobalAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const rows = await env.REPORTS.prepare(
    `SELECT a.id,a.name,a.email,a.family_name,a.given_name,a.middle_name,a.family_name_kana,a.given_name_kana,a.form_language,a.interests,a.message,a.status,a.created_at,a.updated_at,a.affiliation_type,a.institution,a.grade,a.country,a.timezone,
      a.desired_subjects,a.article_ideas,a.availability_note,a.provisioning_status,a.provisioning_error,a.provisioned_at,a.accepted_by,
      COALESCE(d.discord_user_id, '') AS verified_discord_user_id
     FROM atlasez_member_applications a
     LEFT JOIN atlasez_member_discord_accounts d ON d.email = a.email
     ORDER BY CASE a.status WHEN 'new' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END,a.created_at DESC LIMIT 300`,
  ).all<Record<string, unknown>>();
  return json({
    applications: rows.results,
    subjectLabels: APPLICATION_SUBJECT_LABELS,
  });
}

async function updateApplication(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const scope = await getGlobalAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let payload: { status?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const status = text(payload.status, 20);
  if (!["new", "reviewing", "accepted", "rejected"].includes(status))
    return json({ error: "状態を確認してください。" }, 400);
  const application = await env.REPORTS.prepare(
    `SELECT name,email,status,family_name,given_name,middle_name,family_name_kana,given_name_kana,form_language,institution,grade,affiliation_type,country,timezone,desired_subjects,availability_note
     FROM atlasez_member_applications WHERE id=?`,
  )
    .bind(id)
    .first<{
      name: string;
      email: string;
      status: string;
      family_name: string;
      given_name: string;
      middle_name: string;
      family_name_kana: string;
      given_name_kana: string;
      form_language: string;
      institution: string;
      grade: string;
      affiliation_type: string;
      country: string;
      timezone: string;
      desired_subjects: string;
      availability_note: string;
    }>();
  if (!application) return json({ error: "応募が見つかりません。" }, 404);
  if (application.status === "accepted" && status !== "accepted")
    return json(
      {
        error:
          "登録済み運営者との不整合を防ぐため、受入済み応募の状態は戻せません。権限変更は運営者・担当管理から行ってください。",
      },
      409,
    );
  const now = new Date().toISOString();
  if (status !== "accepted") {
    await env.REPORTS.prepare(
      "UPDATE atlasez_member_applications SET status=?,updated_at=? WHERE id=?",
    )
      .bind(status, now, id)
      .run();
    return json({ ok: true, status });
  }

  // 旧形式の応募は追加列が空でも受入可能にし、自由記述から権限を推測しない。
  const subjects = [
    ...new Set(
      application.desired_subjects
        .split(",")
        .map((value) => value.trim())
        .filter((value) => APPLICATION_SUBJECT_LABELS[value]),
    ),
  ];
  const interestLabels = subjects
    .map((subject) => APPLICATION_SUBJECT_LABELS[subject])
    .filter(Boolean);
  const affiliationType = normalizeAffiliationType(
    application.affiliation_type,
  );
  const institution = normalizeInstitution(application.institution);
  const grade = normalizeGrade(application.grade);
  const country = normalizedText(application.country, 100);
  const timezone = validTimeZone(application.timezone)
    ? application.timezone
    : "Asia/Tokyo";
  // Discord IDは応募者入力を信用せず、運営内運営が参加者一覧で確認・登録した値だけを使う。
  const verifiedDiscord = await env.REPORTS.prepare(
    "SELECT discord_user_id FROM atlasez_member_discord_accounts WHERE email = ?",
  )
    .bind(application.email)
    .first<{ discord_user_id: string }>();
  const displayName =
    [
      application.form_language === "en"
        ? application.given_name
        : application.family_name,
      application.form_language === "en" ? application.middle_name : "",
      application.form_language === "en"
        ? application.family_name
        : application.given_name,
    ]
      .filter(Boolean)
      .join(" ") || application.name;
  const statements: D1PreparedStatement[] = [
    ...subjects.map((subject) =>
      env.REPORTS.prepare(
        "INSERT OR IGNORE INTO report_admin_permissions (email,subject) VALUES (?,?)",
      ).bind(application.email, subject),
    ),
    env.REPORTS.prepare(
      "INSERT INTO atlasez_project_memberships (project_id,email,role,joined_at) VALUES ('atlas',?,'member',?) ON CONFLICT(project_id,email) DO NOTHING",
    ).bind(application.email, now),
    env.REPORTS.prepare(
      `INSERT INTO editorial_member_profiles (email,display_name,availability_note,university,year,interests,affiliation_type,country,timezone,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET
       display_name=CASE WHEN trim(editorial_member_profiles.display_name)='' THEN excluded.display_name ELSE editorial_member_profiles.display_name END,
       availability_note=CASE WHEN trim(editorial_member_profiles.availability_note)='' THEN excluded.availability_note ELSE editorial_member_profiles.availability_note END,
       university=excluded.university,year=excluded.year,interests=excluded.interests,affiliation_type=excluded.affiliation_type,
       country=excluded.country,timezone=excluded.timezone,updated_at=excluded.updated_at`,
    ).bind(
      application.email,
      displayName,
      "",
      institution,
      grade,
      interestLabels.join(","),
      affiliationType,
      country,
      timezone,
      now,
    ),
    env.REPORTS.prepare(
      `UPDATE atlasez_member_applications SET status='accepted',provisioning_status=?,provisioning_error='',accepted_by=?,updated_at=? WHERE id=?`,
    ).bind(verifiedDiscord ? "pending" : "skipped", scope.email, now, id),
  ];
  // D1 batchは一括トランザクション。権限・プロフィール・応募状態の一部だけが残るのを防ぐ。
  try {
    await env.REPORTS.batch(statements);
  } catch {
    return json(
      {
        error: "運営者登録を完了できませんでした。データは変更されていません。",
      },
      500,
    );
  }

  const discord = await provisionApplicationDiscordRoles(
    env,
    application.email,
    subjects,
    {
      institution,
      year: grade,
      affiliationType,
      interests: interestLabels,
    },
  );
  const error = discord.warnings.join("\n").slice(0, 2_000);
  await env.REPORTS.prepare(
    "UPDATE atlasez_member_applications SET provisioning_status=?,provisioning_error=?,provisioned_at=?,updated_at=? WHERE id=?",
  )
    .bind(
      discord.status,
      error,
      discord.status === "synced" ? new Date().toISOString() : null,
      new Date().toISOString(),
      id,
    )
    .run();
  return json({
    ok: true,
    status: "accepted",
    provisioning: discord,
    legacyApplication: !subjects.length,
  });
}
async function operationsOverview(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  await ensureAtlasMembership(env, scope);
  const requestedProject = new URL(request.url).searchParams.get("project") ?? "atlas";
  const project = await resolveOperationProject(env, scope, requestedProject);
  if (isResponse(project)) return project;
  const filters = scope.allSubjects
    ? ["project_id = ?"]
    : [
        "project_id = ? AND (assignee_email = ? OR created_by = ? OR subject IS NULL" +
          (scope.subjects.length
            ? ` OR subject IN (${scope.subjects.map(() => "?").join(",")})`
            : "") +
          ")",
      ];
  const values: unknown[] = scope.allSubjects
    ? [project.id]
    : [project.id, scope.email, scope.email, ...scope.subjects];
  const where = filters.length ? ` WHERE ${filters.join(" AND ")}` : "";
  const memberWhere = scope.allSubjects
    ? ""
    : ` WHERE subject = '*' OR subject IN (${scope.subjects.map(() => "?").join(",")})`;
  const memberValues: unknown[] = scope.allSubjects ? [] : scope.subjects;
  const [tasks, events, progress, members, availability, availabilityBlocks] = await Promise.all([
    env.REPORTS.prepare(
      `SELECT id, project_id, subject, assignee_email, title, details, status, due_at, due_timezone, created_by, created_at, updated_at FROM editorial_tasks${where} ORDER BY status = 'done', CASE WHEN due_at IS NULL OR due_at = '' THEN 1 ELSE 0 END, due_at ASC, updated_at DESC LIMIT 200`,
    )
      .bind(...values)
      .all(),
    env.REPORTS.prepare(
      `SELECT id, project_id, subject, title, details, starts_at, ends_at, timezone, created_by, created_at FROM editorial_events WHERE project_id = ? ORDER BY starts_at ASC LIMIT 60`,
    ).bind(project.id).all<{
      id: string;
      project_id: string;
      subject: string | null;
      title: string;
      details: string;
      starts_at: string;
      ends_at: string | null;
      timezone: string;
      created_by: string;
      created_at: string;
    }>(),
    env.REPORTS.prepare(
      "SELECT id,email,subject,document_id,body,created_at FROM editorial_progress_reports WHERE project_id = ? AND email = ? ORDER BY created_at DESC LIMIT 30",
    )
      .bind(project.id, scope.email)
      .all(),
    env.REPORTS.prepare(
      `SELECT DISTINCT p.email, COALESCE(NULLIF(TRIM(profile.display_name), ''), '表示名未設定') AS display_name FROM report_admin_permissions p LEFT JOIN editorial_member_profiles profile ON profile.email = p.email${memberWhere.replaceAll("subject", "p.subject")} ORDER BY display_name, p.email`,
    )
      .bind(...memberValues)
      .all<{ email: string; display_name: string }>(),
    env.REPORTS.prepare(
      "SELECT a.event_id, a.email, a.availability, CASE WHEN p.display_name IS NULL OR trim(p.display_name) = '' OR lower(trim(p.display_name)) = lower(a.email) THEN '表示名未設定' ELSE trim(p.display_name) END AS display_name FROM editorial_event_availability a JOIN editorial_events e ON e.id = a.event_id AND e.project_id = ? LEFT JOIN editorial_member_profiles p ON p.email = a.email",
    ).bind(project.id).all<{
      event_id: string;
      email: string;
      availability: string;
      display_name: string;
    }>(),
    env.REPORTS.prepare(
      "SELECT id, starts_at, ends_at, timezone, label, kind FROM editorial_member_availability_blocks WHERE email = ? ORDER BY starts_at ASC LIMIT 100",
    ).bind(scope.email).all(),
  ]);
  const participantRows = availability.results ?? [];
  const participantsByEvent = new Map<string, typeof participantRows>();
  for (const item of participantRows) {
    const rows = participantsByEvent.get(item.event_id) ?? [];
    rows.push(item);
    participantsByEvent.set(item.event_id, rows);
  }
  return json({
    scope: {
      email: scope.email,
      subjects: scope.subjects,
      isManager: scope.isManager,
    },
    project,
    tasks: tasks.results,
    availabilityBlocks: availabilityBlocks.results ?? [],
    events: (events.results ?? []).map((item) => {
      const participants = participantsByEvent.get(item.id) ?? [];
      return {
        ...item,
        availability:
          participants.find((participant) => participant.email === scope.email)
            ?.availability ?? null,
        availabilityCounts: {
          available: participants.filter(
            (participant) => participant.availability === "available",
          ).length,
          maybe: participants.filter(
            (participant) => participant.availability === "maybe",
          ).length,
          unavailable: participants.filter(
            (participant) => participant.availability === "unavailable",
          ).length,
        },
        participants: participants.map(
          ({
            email: participantEmail,
            display_name,
            availability: participantAvailability,
          }) => ({
            displayName: display_name,
            availability: participantAvailability,
            isSelf: participantEmail === scope.email,
          }),
        ),
      };
    }),
    progress: progress.results,
    members: members.results ?? [],
  });
}

async function createOperation(
  request: Request,
  env: Env,
  type: "task" | "progress" | "event",
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const now = new Date().toISOString();
  const project = await resolveOperationProject(
    env,
    scope,
    text(payload.projectId, 80) || "atlas",
  );
  if (isResponse(project)) return project;
  const subject = text(payload.subject, 80) || null;
  if (subject && !scope.allSubjects && !scope.subjects.includes(subject))
    return json({ error: "この分野を指定する権限がありません。" }, 403);
  if (type === "progress") {
    const body = text(payload.body, MAX_OPERATION_TEXT_LENGTH);
    if (!body) return json({ error: "進捗内容を入力してください。" }, 400);
    await env.REPORTS.prepare(
      "INSERT INTO editorial_progress_reports (id,email,subject,document_id,body,created_at,project_id) VALUES (?,?,?,?,?,?,?)",
    )
      .bind(
        crypto.randomUUID(),
        scope.email,
        subject,
        text(payload.documentId, 64) || null,
        body,
        now,
        project.id,
      )
      .run();
    if (project.slug === "atlas") await notifyProgressToDiscord(env, subject, body);
    return json({
      ok: true,
      discordNotified: Boolean(
        env.DISCORD_ATLAS_WEBHOOK_URL || env.DISCORD_PROGRESS_WEBHOOK_URL,
      ),
    });
  }
  if (type === "task") {
    const title = text(payload.title, 200);
    if (!title) return json({ error: "タスク名を入力してください。" }, 400);
    const assignee = text(payload.assigneeEmail, 320) || null;
    if (assignee && !scope.isManager && assignee !== scope.email)
      return json(
        { error: "他の運営者への依頼は運営内運営のみ作成できます。" },
        403,
      );
    const dueAt = text(payload.dueAt, 32);
    const dueTimezone = text(payload.dueTimezone, 80) || "Asia/Tokyo";
    if (dueAt && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dueAt))
      return json({ error: "期限はカレンダーから指定してください。" }, 400);
    if (dueAt && !validTimeZone(dueTimezone))
      return json({ error: "期限のタイムゾーンを確認してください。" }, 400);
    await env.REPORTS.prepare(
      "INSERT INTO editorial_tasks (id,project_id,subject,assignee_email,title,details,status,due_at,due_timezone,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,'open',?,?,?,?,?)",
    )
      .bind(
        crypto.randomUUID(),
        project.id,
        subject,
        assignee,
        title,
        text(payload.details, MAX_OPERATION_TEXT_LENGTH),
        dueAt || null,
        dueTimezone,
        scope.email,
        now,
        now,
      )
      .run();
    return json({ ok: true });
  }
  const title = text(payload.title, 200);
  const startsAt = text(payload.startsAt, 40),
    timezone = text(payload.timezone, 80) || "Asia/Tokyo";
  if (!title || !startsAt)
    return json({ error: "催し名と日時を入力してください。" }, 400);
  if (!scope.isManager)
    return json({ error: "日程の作成は運営内運営のみ行えます。" }, 403);
  await env.REPORTS.prepare(
    "INSERT INTO editorial_events (id,project_id,subject,title,details,starts_at,ends_at,timezone,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
  )
    .bind(
      crypto.randomUUID(),
      project.id,
      subject,
      title,
      text(payload.details, MAX_OPERATION_TEXT_LENGTH),
      startsAt,
      text(payload.endsAt, 40) || null,
      timezone,
      scope.email,
      now,
    )
    .run();
  return json({ ok: true });
}

async function updateTask(
  request: Request,
  env: Env,
  taskId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let payload: { status?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const status = text(payload.status, 20);
  if (!taskStatus.has(status))
    return json({ error: "状態を確認してください。" }, 400);
  const task = await env.REPORTS.prepare(
    "SELECT project_id,subject,assignee_email,created_by FROM editorial_tasks WHERE id=?",
  )
    .bind(taskId)
    .first<{
      project_id: string;
      subject: string | null;
      assignee_email: string | null;
      created_by: string;
    }>();
  if (!task) return json({ error: "タスクが見つかりません。" }, 404);
  const project = await resolveOperationProject(env, scope, task.project_id);
  if (isResponse(project)) return project;
  if (
    !scope.isManager &&
    task.assignee_email !== scope.email &&
    task.created_by !== scope.email
  )
    return json({ error: "このタスクを更新する権限がありません。" }, 403);
  await env.REPORTS.prepare(
    "UPDATE editorial_tasks SET status=?,updated_at=? WHERE id=?",
  )
    .bind(status, new Date().toISOString(), taskId)
    .run();
  return json({ ok: true });
}

async function updateEventAvailability(
  request: Request,
  env: Env,
  eventId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let payload: { availability?: unknown; note?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const availability = text(payload.availability, 20);
  if (!availabilityStatus.has(availability))
    return json({ error: "参加可否を確認してください。" }, 400);
  const event = await env.REPORTS.prepare(
    "SELECT project_id FROM editorial_events WHERE id = ?",
  )
    .bind(eventId)
    .first<{ project_id: string }>();
  if (!event) return json({ error: "日程が見つかりません。" }, 404);
  const project = await resolveOperationProject(env, scope, event.project_id);
  if (isResponse(project)) return project;
  await env.REPORTS.prepare(
    `INSERT INTO editorial_event_availability (event_id,email,availability,note,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(event_id,email) DO UPDATE SET availability=excluded.availability,note=excluded.note,updated_at=excluded.updated_at`,
  )
    .bind(
      eventId,
      scope.email,
      availability,
      text(payload.note, 1_000),
      new Date().toISOString(),
    )
    .run();
  return json({ ok: true });
}

async function deleteEvent(
  request: Request,
  env: Env,
  eventId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!scope.isManager)
    return json({ error: "日程の削除は運営内運営のみ行えます。" }, 403);
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  const event = await env.REPORTS.prepare(
    "SELECT id, project_id FROM editorial_events WHERE id=?",
  )
    .bind(eventId)
    .first<{ id: string; project_id: string }>();
  if (!event) return json({ error: "日程が見つかりません。" }, 404);
  const project = await resolveOperationProject(env, scope, event.project_id);
  if (isResponse(project)) return project;
  await env.REPORTS.batch([
    env.REPORTS.prepare(
      "DELETE FROM editorial_event_availability WHERE event_id=?",
    ).bind(eventId),
    env.REPORTS.prepare("DELETE FROM editorial_events WHERE id=?").bind(
      eventId,
    ),
  ]);
  return json({ ok: true });
}

async function createAvailabilityBlock(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request)) return json({ error: "この送信元からは受け付けられません。" }, 403);
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return json({ error: "入力内容を読み取れませんでした。" }, 400); }
  const startsAt = text(payload.startsAt, 40);
  const endsAt = text(payload.endsAt, 40);
  const timezone = text(payload.timezone, 80) || "Asia/Tokyo";
  const kind = text(payload.kind, 20) || "unavailable";
  if (!startsAt || !endsAt || new Date(endsAt).getTime() <= new Date(startsAt).getTime())
    return json({ error: "開始・終了日時を確認してください。" }, 400);
  if (!validTimeZone(timezone) || !["available", "unavailable"].includes(kind))
    return json({ error: "タイムゾーンまたは可否を確認してください。" }, 400);
  await env.REPORTS.prepare(
    "INSERT INTO editorial_member_availability_blocks (id,email,starts_at,ends_at,timezone,label,kind,created_at) VALUES (?,?,?,?,?,?,?,?)",
  ).bind(crypto.randomUUID(), scope.email, startsAt, endsAt, timezone, text(payload.label, 160), kind, new Date().toISOString()).run();
  return json({ ok: true });
}

async function deleteAvailabilityBlock(
  request: Request,
  env: Env,
  blockId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request)) return json({ error: "この送信元からは受け付けられません。" }, 403);
  await env.REPORTS.prepare("DELETE FROM editorial_member_availability_blocks WHERE id = ? AND email = ?")
    .bind(blockId, scope.email).run();
  return json({ ok: true });
}

async function submitMemberApplication(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  if (
    request.headers.get("content-type")?.includes("application/json") !== true
  )
    return json({ error: "JSON形式で送信してください。" }, 415);
  let payload: {
    name?: unknown;
    familyName?: unknown;
    givenName?: unknown;
    middleName?: unknown;
    familyNameKana?: unknown;
    givenNameKana?: unknown;
    formLanguage?: unknown;
    email?: unknown;
    interests?: unknown;
    message?: unknown;
    website?: unknown;
    turnstileToken?: unknown;
    affiliationType?: unknown;
    institution?: unknown;
    grade?: unknown;
    country?: unknown;
    timezone?: unknown;
    desiredSubjects?: unknown;
    articleIdeas?: unknown;
    availabilityNote?: unknown;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  // 人には見せない入力欄。自動送信ボットの基本的な遮断に使う。
  if (text(payload.website, 200)) return json({ ok: true }, 201);
  const familyName = normalizedText(payload.familyName, 80),
    givenName = normalizedText(payload.givenName, 80),
    middleName = normalizedText(payload.middleName, 80),
    familyNameKana = normalizedText(payload.familyNameKana, 80),
    givenNameKana = normalizedText(payload.givenNameKana, 80),
    formLanguage = text(payload.formLanguage, 2) === "en" ? "en" : "ja";
  const legacyName = normalizedText(payload.name, 120),
    name =
      familyName && givenName
        ? [
            formLanguage === "en" ? givenName : familyName,
            formLanguage === "en" ? middleName : "",
            formLanguage === "en" ? familyName : givenName,
          ]
            .filter(Boolean)
            .join(" ")
        : legacyName,
    email = text(payload.email, 320).toLowerCase(),
    interests = normalizedText(payload.interests, 1_000),
    message = text(payload.message, MAX_OPERATION_TEXT_LENGTH);
  const affiliationType = normalizeAffiliationType(payload.affiliationType),
    institution = normalizeInstitution(payload.institution),
    grade = normalizeGrade(payload.grade);
  const country = normalizedText(payload.country, 100),
    timezone = normalizedText(payload.timezone, 80),
    articleIdeas = text(payload.articleIdeas, 3_000),
    availabilityNote = text(payload.availabilityNote, 1_000);
  const desiredSubjectSlugs = [
    ...new Set(
      Array.isArray(payload.desiredSubjects)
        ? payload.desiredSubjects
            .map((v) => text(v, 80))
            .filter((v) => APPLICATION_SUBJECT_LABELS[v])
        : [],
    ),
  ];
  if (
    !name ||
    !EMAIL_PATTERN.test(email) ||
    !interests ||
    !message ||
    !affiliationType ||
    !institution ||
    !grade ||
    !country ||
    !timezone ||
    !articleIdeas ||
    !desiredSubjectSlugs.length
  )
    return json(
      {
        error: "基本情報、希望分野、書きたい記事、参加理由を入力してください。",
      },
      400,
    );
  if (
    formLanguage === "ja" &&
    (!familyName || !givenName || !familyNameKana || !givenNameKana)
  )
    return json({ error: "姓・名・ふりがなを入力してください。" }, 400);
  if (
    !(MEMBER_AFFILIATION_TYPES as readonly string[]).includes(affiliationType)
  )
    return json({ error: "所属区分を一覧から選択してください。" }, 400);
  if (
    !(MEMBER_YEARS as readonly string[]).includes(grade) ||
    !(APPLICATION_GRADES_BY_AFFILIATION[affiliationType] ?? []).includes(grade)
  )
    return json(
      { error: "所属区分に対応する学年・立場を選択してください。" },
      400,
    );
  if (!validTimeZone(timezone))
    return json({ error: "タイムゾーンを一覧から選択してください。" }, 400);
  const clientKey = await hash(
    request.headers.get("CF-Connecting-IP") ?? "unknown",
  );
  const bucket = Math.floor(Date.now() / 600000);
  await env.REPORTS.prepare(
    "INSERT INTO atlasez_application_rate_limits (client_key,bucket,count,updated_at) VALUES (?,?,1,?) ON CONFLICT(client_key,bucket) DO UPDATE SET count=count+1,updated_at=excluded.updated_at",
  )
    .bind(clientKey, bucket, new Date().toISOString())
    .run();
  const limit = await env.REPORTS.prepare(
    "SELECT count FROM atlasez_application_rate_limits WHERE client_key=? AND bucket=?",
  )
    .bind(clientKey, bucket)
    .first<{ count: number }>();
  if ((limit?.count ?? 0) > 3)
    return json(
      {
        error:
          "短時間に送信できる回数を超えました。10分ほど待ってから再度お試しください。",
      },
      429,
    );
  if (env.TURNSTILE_SECRET_KEY) {
    const token = text(payload.turnstileToken, 2_500);
    if (!token)
      return json({ error: "人による操作の確認を完了してください。" }, 400);
    const verification = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          secret: env.TURNSTILE_SECRET_KEY,
          response: token,
          remoteip: request.headers.get("CF-Connecting-IP") ?? undefined,
        }),
      },
    );
    const result = (await verification.json()) as { success?: boolean };
    if (!result.success)
      return json(
        { error: "人による操作の確認に失敗しました。もう一度お試しください。" },
        400,
      );
  }
  const duplicate = await env.REPORTS.prepare(
    "SELECT id FROM atlasez_member_applications WHERE email=? AND status IN ('new','reviewing') LIMIT 1",
  )
    .bind(email)
    .first<{ id: string }>();
  if (duplicate)
    return json(
      {
        error:
          "このメールアドレスの応募はすでに確認中です。結果の連絡をお待ちください。",
      },
      409,
    );
  const now = new Date().toISOString();
  await env.REPORTS.prepare(
    "INSERT INTO atlasez_member_applications (id,name,email,family_name,given_name,middle_name,family_name_kana,given_name_kana,form_language,interests,message,status,created_at,updated_at,affiliation_type,institution,grade,country,timezone,desired_subjects,article_ideas,discord_user_id,availability_note) VALUES (?,?,?,?,?,?,?,?,?,?,?,'new',?,?,?,?,?,?,?,?,?,'',?)",
  )
    .bind(
      crypto.randomUUID(),
      name,
      email,
      familyName,
      givenName,
      middleName,
      familyNameKana,
      givenNameKana,
      formLanguage,
      interests,
      message,
      now,
      now,
      affiliationType,
      institution,
      grade,
      country,
      timezone,
      desiredSubjectSlugs.join(","),
      articleIdeas,
      availabilityNote,
    )
    .run();
  // 応募は個人情報を含むため、Discordへは一切転送しない。運営内運営が管理画面でのみ閲覧する。
  return json(
    { ok: true, turnstileRequired: Boolean(env.TURNSTILE_SECRET_KEY) },
    201,
  );
}

async function purgeExpiredPersonalData(env: Env) {
  const now = new Date();
  const expiredSessions = new Date(
    now.getTime() - 24 * 60 * 60 * 1_000,
  ).toISOString();
  const expiredApplications = new Date(
    now.getTime() - 180 * 24 * 60 * 60 * 1_000,
  ).toISOString();
  const expiredRateLimits = Math.floor(
    (now.getTime() - 24 * 60 * 60 * 1_000) / 600_000,
  );
  await Promise.all([
    env.REPORTS.prepare("DELETE FROM admin_auth_sessions WHERE expires_at < ?")
      .bind(expiredSessions)
      .run(),
    env.REPORTS.prepare(
      "DELETE FROM atlasez_application_rate_limits WHERE bucket < ?",
    )
      .bind(expiredRateLimits)
      .run(),
    env.REPORTS.prepare(
      "DELETE FROM atlasez_member_applications WHERE status IN ('rejected','accepted') AND updated_at < ?",
    )
      .bind(expiredApplications)
      .run(),
  ]);
}

const publicApplicationConfig = (env: Env): Response =>
  json({ turnstileSiteKey: env.PUBLIC_TURNSTILE_SITE_KEY ?? "" });

async function fetchAdminAsset(request: Request, env: Env): Promise<Response> {
  const response = await env.ASSETS.fetch(request);
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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
  if (!canReviewDocument(scope, document.subject, document.status))
    return json({ error: "この分野の原稿を閲覧する権限がありません。" }, 403);
  const comments = await env.REPORTS.prepare(
    `SELECT id, document_id, parent_comment_id, body, created_by, created_at, selection_start, selection_end, selection_text,
      acknowledged_at, acknowledged_by, resolved_at, resolved_by
     FROM editorial_comments WHERE document_id = ? ORDER BY resolved_at IS NOT NULL, created_at ASC`,
  )
    .bind(documentId)
    .all<EditorialComment>();
  const commentRows = comments.results ?? [];
  const commentIds = commentRows.map((comment) => comment.id);
  const actionRows = commentIds.length
    ? await env.REPORTS.prepare(
        `SELECT comment_id, actor_email, action FROM editorial_comment_actions WHERE comment_id IN (${commentIds.map(() => "?").join(",")}) ORDER BY created_at ASC`,
      )
        .bind(...commentIds)
        .all<{ comment_id: string; actor_email: string; action: string }>()
    : { results: [] as { comment_id: string; actor_email: string; action: string }[] };
  const actionsByComment = new Map<string, { acknowledged: Set<string>; unacknowledged: Set<string> }>();
  for (const action of actionRows.results ?? []) {
    const entry = actionsByComment.get(action.comment_id) ?? { acknowledged: new Set<string>(), unacknowledged: new Set<string>() };
    if (action.action === "acknowledge") entry.acknowledged.add(action.actor_email);
    if (action.action === "unacknowledge") entry.unacknowledged.add(action.actor_email);
    actionsByComment.set(action.comment_id, entry);
  }
  const authorEmails = [
    ...new Set(
      commentRows.map((comment) => comment.created_by).filter(Boolean),
    ),
  ];
  const authorProfiles = authorEmails.length
    ? await env.REPORTS.prepare(
        `SELECT email, display_name, avatar_url FROM editorial_member_profiles WHERE email IN (${authorEmails.map(() => "?").join(",")})`,
      )
        .bind(...authorEmails)
        .all<{ email: string; display_name: string; avatar_url: string }>()
    : {
        results: [] as {
          email: string;
          display_name: string;
          avatar_url: string;
        }[],
      };
  const authorProfileByEmail = new Map(
    (authorProfiles.results ?? []).map((profile) => [profile.email, profile]),
  );
  const selectionRows = commentIds.length
    ? await env.REPORTS.prepare(
        `SELECT id, comment_id, position, selection_start, selection_end, selection_text
       FROM editorial_comment_selections WHERE comment_id IN (${commentIds.map(() => "?").join(",")})
       ORDER BY position ASC`,
      )
        .bind(...commentIds)
        .all<EditorialCommentSelection>()
    : { results: [] as EditorialCommentSelection[] };
  const selectionsByComment = new Map<string, EditorialCommentSelection[]>();
  for (const selection of selectionRows.results ?? [])
    selectionsByComment.set(selection.comment_id, [
      ...(selectionsByComment.get(selection.comment_id) ?? []),
      selection,
    ]);
  const commentsWithSelections = commentRows.map((comment) => ({
    ...comment,
    author_display_name:
      authorProfileByEmail.get(comment.created_by)?.display_name?.trim() ||
      "運営メンバー",
    author_avatar_url:
      authorProfileByEmail.get(comment.created_by)?.avatar_url ?? "",
    acknowledged_by_emails: [...(actionsByComment.get(comment.id)?.acknowledged ?? new Set<string>())],
    unacknowledged_by_emails: [...(actionsByComment.get(comment.id)?.unacknowledged ?? new Set<string>())],
    // 旧コメントの一件だけの引用も、同じUIで読めるようにする。
    selections:
      selectionsByComment.get(comment.id) ??
      (comment.selection_text
        ? [
            {
              id: `legacy-${comment.id}`,
              comment_id: comment.id,
              position: 0,
              selection_start: comment.selection_start,
              selection_end: comment.selection_end,
              selection_text: comment.selection_text,
            },
          ]
        : []),
  }));
  return json({ document, comments: commentsWithSelections });
}

type CommentSelectionInput = {
  start: number | null;
  end: number | null;
  text: string;
};

function editorialCommentSelections(
  payload: EditorialCommentPayload,
): CommentSelectionInput[] | Response {
  const raw = Array.isArray(payload.selections) ? payload.selections : [];
  const legacy = raw.length
    ? []
    : [
        {
          start: payload.selectionStart,
          end: payload.selectionEnd,
          text: payload.selectionText,
        },
      ];
  const candidates = raw.length ? raw : legacy;
  const selections: CommentSelectionInput[] = [];
  for (const candidate of candidates.slice(0, 8)) {
    if (!candidate || typeof candidate !== "object")
      return json({ error: "選択範囲を確認してください。" }, 400);
    const value = candidate as {
      start?: unknown;
      end?: unknown;
      text?: unknown;
    };
    const start =
      typeof value.start === "number" &&
      Number.isInteger(value.start) &&
      value.start >= 0
        ? value.start
        : null;
    const end =
      typeof value.end === "number" &&
      Number.isInteger(value.end) &&
      value.end >= (start ?? 0)
        ? value.end
        : null;
    const selectedText = text(value.text, 2_000);
    if ((start === null) !== (end === null))
      return json({ error: "選択範囲を正しく取得できませんでした。" }, 400);
    if (selectedText) selections.push({ start, end, text: selectedText });
  }
  return selections;
}

async function replaceEditorialCommentSelections(
  env: Env,
  commentId: string,
  selections: CommentSelectionInput[],
) {
  await env.REPORTS.prepare(
    "DELETE FROM editorial_comment_selections WHERE comment_id = ?",
  )
    .bind(commentId)
    .run();
  for (const [position, selection] of selections.entries())
    await env.REPORTS.prepare(
      `INSERT INTO editorial_comment_selections
        (id, comment_id, position, selection_start, selection_end, selection_text)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        commentId,
        position,
        selection.start,
        selection.end,
        selection.text,
      )
      .run();
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
    return json(
      {
        error: "記事設定を確認してください。タイトル・要約・概念IDは必須です。",
      },
      400,
    );
  if (!canEditSubject(scope, values.subject))
    return json({ error: "この分野の原稿を作成する権限がありません。" }, 403);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.REPORTS.prepare(
    `INSERT INTO editorial_documents
      (id, source_article_id, subject, category, locale, slug, title, summary, concept_id, body, writing_memo, latex_engine,
       status, created_by, updated_by, created_at, updated_at, reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      values.writingMemo,
      values.latexEngine,
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
    return json(
      {
        error: "記事設定を確認してください。タイトル・要約・概念IDは必須です。",
      },
      400,
    );
  const existing = await env.REPORTS.prepare(
    "SELECT subject, status, title, summary, concept_id, body, writing_memo, category, locale, slug, latex_engine, published_at FROM editorial_documents WHERE id = ?",
  )
    .bind(documentId)
    .first<
      Pick<
        EditorialDocument,
        | "subject"
        | "status"
        | "title"
        | "summary"
        | "concept_id"
        | "body"
        | "writing_memo"
        | "category"
        | "locale"
        | "slug"
        | "latex_engine"
        | "published_at"
      >
    >();
  if (!existing) return json({ error: "原稿が見つかりません。" }, 404);
  const isReviewOnly =
    scope.isManager && !canEditSubject(scope, existing.subject);
  if (
    (!canEditSubject(scope, existing.subject) && !isReviewOnly) ||
    (!canEditSubject(scope, values.subject) &&
      values.subject !== existing.subject)
  )
    return json({ error: "この分野の原稿を更新する権限がありません。" }, 403);
  const owner = await env.REPORTS.prepare(
    "SELECT created_by FROM editorial_documents WHERE id = ?",
  )
    .bind(documentId)
    .first<{ created_by: string }>();
  if (!scope.isManager && owner?.created_by !== scope.email)
    return json(
      {
        error:
          "原稿を編集できるのは作成者本人です。査読コメントは追加できます。",
      },
      403,
    );
  if (
    isReviewOnly &&
    (values.subject !== existing.subject ||
      values.category !== existing.category ||
      values.locale !== existing.locale ||
      values.slug !== existing.slug ||
      values.title !== existing.title ||
      values.summary !== existing.summary ||
      values.conceptId !== existing.concept_id ||
      values.body !== existing.body ||
      values.writingMemo !== existing.writing_memo ||
      values.latexEngine !== existing.latex_engine)
  )
    return json(
      {
        error:
          "担当外の原稿は本文を編集できません。査読結果（状態）とコメントのみ更新できます。",
      },
      403,
    );
  if (values.status === "approved" && !scope.isManager)
    return json({ error: "承認済みに変更できるのは運営管理者だけです。" }, 403);
  if (existing.published_at && values.status !== "approved")
    return json(
      {
        error:
          "公開済み原稿を下書きへ戻すには「公開を取り消して下書きへ戻す」を使ってください。",
      },
      400,
    );
  const now = new Date().toISOString();
  const previous = await env.REPORTS.prepare(
    `${editorialDocumentSelect} WHERE id = ?`,
  )
    .bind(documentId)
    .first<EditorialDocument>();
  if (previous)
    await env.REPORTS.prepare(
      "INSERT INTO editorial_document_revisions (id, document_id, title, summary, body, status, saved_by, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        crypto.randomUUID(),
        documentId,
        previous.title,
        previous.summary,
        previous.body,
        previous.status,
        scope.email,
        now,
      )
      .run();
  await env.REPORTS.prepare(
    `UPDATE editorial_documents SET source_article_id = ?, subject = ?, category = ?, locale = ?,
      slug = ?, title = ?, summary = ?, concept_id = ?, body = ?, writing_memo = ?, latex_engine = ?, status = ?, updated_by = ?,
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
      values.writingMemo,
      values.latexEngine,
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

async function listEditorialRevisions(
  request: Request,
  env: Env,
  documentId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const document = await env.REPORTS.prepare(
    "SELECT subject, status FROM editorial_documents WHERE id = ?",
  )
    .bind(documentId)
    .first<{ subject: string; status: EditorialDocumentStatus }>();
  if (!document || !canReviewDocument(scope, document.subject, document.status))
    return json({ error: "この原稿を閲覧する権限がありません。" }, 403);
  const result = await env.REPORTS.prepare(
    "SELECT id, title, summary, body, status, saved_by, saved_at FROM editorial_document_revisions WHERE document_id = ? ORDER BY saved_at DESC LIMIT 50",
  )
    .bind(documentId)
    .all();
  return json({ revisions: result.results });
}

async function editorialBoard(request: Request, env: Env): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!scope.allSubjects && !scope.subjects.length) return json({ board: [] });
  const values: unknown[] = scope.allSubjects ? [] : [...scope.subjects];
  const where = scope.allSubjects
    ? ""
    : ` WHERE subject IN (${scope.subjects.map(() => "?").join(",")})`;
  const result = await env.REPORTS.prepare(
    `SELECT subject, status, COUNT(*) AS count FROM editorial_documents${where} GROUP BY subject,status ORDER BY subject,status`,
  )
    .bind(...values)
    .all();
  return json({ board: result.results });
}

async function listEditorialReviewRequests(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getGlobalAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const result = await env.REPORTS.prepare(
    `SELECT d.id, d.subject, d.category, d.title, d.updated_at,
       COALESCE(NULLIF(TRIM(p.display_name), ''), '表示名未設定') AS requester_display_name
     FROM editorial_documents d
     LEFT JOIN editorial_member_profiles p ON p.email = d.updated_by
     WHERE d.status = 'in-review' ORDER BY d.updated_at ASC LIMIT 100`,
  ).all<{
    id: string;
    subject: string;
    category: string;
    title: string;
    updated_at: string;
    requester_display_name: string;
  }>();
  return json({ requests: result.results });
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
  if (
    request.headers.get("content-type")?.includes("application/json") !== true
  )
    return json({ error: "JSON形式で送信してください。" }, 415);
  let payload: EditorialCommentPayload;
  try {
    payload = (await request.json()) as EditorialCommentPayload;
  } catch {
    return json({ error: "コメントを読み取れませんでした。" }, 400);
  }
  const body = text(payload.body, MAX_EDITORIAL_COMMENT_LENGTH);
  if (!body) return json({ error: "コメントを入力してください。" }, 400);
  const selections = editorialCommentSelections(payload);
  if (selections instanceof Response) return selections;
  const document = await env.REPORTS.prepare(
    "SELECT subject, status FROM editorial_documents WHERE id = ?",
  )
    .bind(documentId)
    .first<{ subject: string; status: EditorialDocumentStatus }>();
  if (!document) return json({ error: "原稿が見つかりません。" }, 404);
  if (!canReviewDocument(scope, document.subject, document.status))
    return json({ error: "この分野にコメントする権限がありません。" }, 403);
  const parentCommentId =
    typeof payload.parentCommentId === "string" &&
    /^[0-9a-f-]{36}$/i.test(payload.parentCommentId)
      ? payload.parentCommentId
      : null;
  if (parentCommentId) {
    const parent = await env.REPORTS.prepare(
      "SELECT id FROM editorial_comments WHERE id = ? AND document_id = ?",
    )
      .bind(parentCommentId, documentId)
      .first<{ id: string }>();
    if (!parent)
      return json({ error: "返信先のコメントが見つかりません。" }, 404);
  }
  const commentId = crypto.randomUUID();
  const firstSelection = selections[0] ?? null;
  await env.REPORTS.prepare(
    `INSERT INTO editorial_comments
      (id, document_id, parent_comment_id, body, created_by, created_at, selection_start, selection_end, selection_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      commentId,
      documentId,
      parentCommentId,
      body,
      scope.email,
      new Date().toISOString(),
      firstSelection?.start ?? null,
      firstSelection?.end ?? null,
      firstSelection?.text ?? null,
    )
    .run();
  await replaceEditorialCommentSelections(env, commentId, selections);
  return json({ ok: true }, 201);
}

async function updateEditorialCommentStatus(
  request: Request,
  env: Env,
  documentId: string,
  commentId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let payload: { action?: unknown };
  try {
    payload = (await request.json()) as { action?: unknown };
  } catch {
    return json({ error: "操作を読み取れませんでした。" }, 400);
  }
  const action = payload.action;
  if (
    action !== "acknowledge" &&
    action !== "unacknowledge" &&
    action !== "resolve" &&
    action !== "reopen"
  )
    return json({ error: "操作を確認してください。" }, 400);
  const comment = await env.REPORTS.prepare(
    `SELECT c.id, d.subject, d.status FROM editorial_comments c
     JOIN editorial_documents d ON d.id = c.document_id WHERE c.id = ? AND c.document_id = ?`,
  )
    .bind(commentId, documentId)
    .first<{ id: string; subject: string; status: EditorialDocumentStatus }>();
  if (!comment) return json({ error: "コメントが見つかりません。" }, 404);
  if (!canReviewDocument(scope, comment.subject, comment.status))
    return json({ error: "このコメントを操作する権限がありません。" }, 403);
  const now = new Date().toISOString();
  if (action === "acknowledge")
    await env.REPORTS.prepare(
      "UPDATE editorial_comments SET acknowledged_at = ?, acknowledged_by = ? WHERE id = ?",
    )
      .bind(now, scope.email, commentId)
      .run();
  else if (action === "unacknowledge")
    await env.REPORTS.prepare(
      "UPDATE editorial_comments SET acknowledged_at = NULL, acknowledged_by = NULL WHERE id = ?",
    )
      .bind(commentId)
      .run();
  else if (action === "resolve")
    await env.REPORTS.prepare(
      "UPDATE editorial_comments SET resolved_at = ?, resolved_by = ? WHERE id = ?",
    )
      .bind(now, scope.email, commentId)
      .run();
  else
    await env.REPORTS.prepare(
      "UPDATE editorial_comments SET resolved_at = NULL, resolved_by = NULL WHERE id = ?",
    )
      .bind(commentId)
      .run();
  await env.REPORTS.prepare(
    "INSERT INTO editorial_comment_actions (id, comment_id, actor_email, action, created_at) VALUES (?,?,?,?,?)",
  ).bind(crypto.randomUUID(), commentId, scope.email, action, now).run();
  return json({ ok: true });
}

async function editEditorialComment(
  request: Request,
  env: Env,
  documentId: string,
  commentId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let payload: EditorialCommentPayload;
  try {
    payload = (await request.json()) as EditorialCommentPayload;
  } catch {
    return json({ error: "コメントを読み取れませんでした。" }, 400);
  }
  const body = text(payload.body, MAX_EDITORIAL_COMMENT_LENGTH);
  if (!body) return json({ error: "コメントを入力してください。" }, 400);
  const selections = editorialCommentSelections(payload);
  if (selections instanceof Response) return selections;
  const comment = await env.REPORTS.prepare(
    `SELECT c.id, c.created_by, d.subject, d.status FROM editorial_comments c
     JOIN editorial_documents d ON d.id = c.document_id WHERE c.id = ? AND c.document_id = ?`,
  )
    .bind(commentId, documentId)
    .first<{
      id: string;
      created_by: string;
      subject: string;
      status: EditorialDocumentStatus;
    }>();
  if (!comment) return json({ error: "コメントが見つかりません。" }, 404);
  if (
    !canReviewDocument(scope, comment.subject, comment.status) ||
    (!scope.isManager && comment.created_by !== scope.email)
  )
    return json(
      { error: "コメントを編集できるのは投稿者本人または運営内運営です。" },
      403,
    );
  const firstSelection = selections[0] ?? null;
  await env.REPORTS.prepare(
    "UPDATE editorial_comments SET body = ?, selection_start = ?, selection_end = ?, selection_text = ? WHERE id = ?",
  )
    .bind(
      body,
      firstSelection?.start ?? null,
      firstSelection?.end ?? null,
      firstSelection?.text ?? null,
      commentId,
    )
    .run();
  await replaceEditorialCommentSelections(env, commentId, selections);
  return json({ ok: true });
}

async function deleteEditorialComment(
  request: Request,
  env: Env,
  documentId: string,
  commentId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  const comment = await env.REPORTS.prepare(
    `SELECT c.id, c.created_by, d.subject, d.status FROM editorial_comments c
     JOIN editorial_documents d ON d.id = c.document_id WHERE c.id = ? AND c.document_id = ?`,
  )
    .bind(commentId, documentId)
    .first<{
      id: string;
      created_by: string;
      subject: string;
      status: EditorialDocumentStatus;
    }>();
  if (!comment) return json({ error: "コメントが見つかりません。" }, 404);
  if (
    !canReviewDocument(scope, comment.subject, comment.status) ||
    (!scope.isManager && comment.created_by !== scope.email)
  )
    return json(
      { error: "コメントを削除できるのは投稿者本人または運営内運営です。" },
      403,
    );
  // 親コメントを削除する場合は、そのスレッドの返信も一緒に削除する。
  const childRows = await env.REPORTS.prepare(
    "SELECT id FROM editorial_comments WHERE parent_comment_id = ?",
  )
    .bind(commentId)
    .all<{ id: string }>();
  const ids = [commentId, ...(childRows.results ?? []).map((row) => row.id)];
  for (const id of ids)
    await env.REPORTS.prepare(
      "DELETE FROM editorial_comment_selections WHERE comment_id = ?",
    )
      .bind(id)
      .run();
  await env.REPORTS.prepare(
    "DELETE FROM editorial_comments WHERE id = ? OR parent_comment_id = ?",
  )
    .bind(commentId, commentId)
    .run();
  return json({ ok: true });
}

const githubBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const githubBinaryBase64 = (value: ArrayBuffer | Uint8Array) => {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize)
    binary += String.fromCharCode(
      ...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)),
    );
  return btoa(binary);
};

const githubText = (base64: string) => {
  const binary = atob(base64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

async function storeArticleBackup(
  env: Env,
  repository: string,
  path: string,
  gitSha: string,
  body: string,
  source: "scheduled" | "publish",
) {
  await env.REPORTS.prepare(
    `INSERT OR IGNORE INTO article_source_backups
      (id, repository, path, git_sha, body, source, captured_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      repository,
      path,
      gitSha,
      body,
      source,
      new Date().toISOString(),
    )
    .run();
}

/** GitHubの履歴に加え、公開済みMarkdownをD1へ世代バックアップする。 */
async function syncPublishedArticleBackups(env: Env) {
  const token = env.GITHUB_PUBLISH_TOKEN;
  if (!token) return { synced: 0, skipped: true };
  const repository = env.GITHUB_REPOSITORY ?? "Atlasez/Atlasez01";
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "user-agent": "atlasez-editorial-backup",
    "x-github-api-version": "2022-11-28",
  };
  const treeResponse = await fetch(
    `https://api.github.com/repos/${repository}/git/trees/main?recursive=1`,
    { headers },
  );
  if (!treeResponse.ok)
    throw new Error("GitHubのバックアップ対象を取得できませんでした。");
  const tree = (await treeResponse.json()) as {
    tree?: { path?: string; type?: string; sha?: string }[];
  };
  const articles = (tree.tree ?? []).filter(
    (entry) =>
      entry.type === "blob" &&
      entry.path?.startsWith("src/content/articles/") &&
      entry.path.endsWith(".md") &&
      entry.sha,
  );
  let synced = 0;
  for (const entry of articles) {
    const path = entry.path!;
    const sha = entry.sha!;
    const existing = await env.REPORTS.prepare(
      "SELECT id FROM article_source_backups WHERE repository = ? AND path = ? AND git_sha = ? LIMIT 1",
    )
      .bind(repository, path, sha)
      .first<{ id: string }>();
    if (existing) continue;
    const contentResponse = await fetch(
      `https://api.github.com/repos/${repository}/contents/${path}`,
      { headers },
    );
    if (!contentResponse.ok) continue;
    const content = (await contentResponse.json()) as {
      content?: string;
      sha?: string;
    };
    if (!content.content) continue;
    await storeArticleBackup(
      env,
      repository,
      path,
      content.sha ?? sha,
      githubText(content.content),
      "scheduled",
    );
    synced += 1;
  }
  return { synced, skipped: false };
}

/** GitHub main上の公開用Markdownを基準に、編集室の公開済み表示を正規化する。 */
async function syncEditorialPublicationStatus(env: Env) {
  const token = env.GITHUB_PUBLISH_TOKEN;
  if (!token)
    throw new Error("GitHub公開連携が未設定のため、公開状態を同期できません。");
  const repository = env.GITHUB_REPOSITORY ?? "Atlasez/Atlasez01";
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "user-agent": "atlasez-editorial-publication-sync",
    "x-github-api-version": "2022-11-28",
  };
  const documents = await env.REPORTS.prepare(
    "SELECT id, locale, subject, category, slug, published_at FROM editorial_documents",
  ).all<
    Pick<
      EditorialDocument,
      "id" | "locale" | "subject" | "category" | "slug" | "published_at"
    >
  >();
  let published = 0;
  let pending = 0;
  const now = new Date().toISOString();
  for (const document of documents.results) {
    const path = `src/content/articles/${document.locale}/${document.subject}/${document.category}/${document.slug}.md`;
    const response = await fetch(
      `https://api.github.com/repos/${repository}/contents/${path}`,
      { headers },
    );
    let isPublished = false;
    if (response.ok) {
      const content = (await response.json()) as { content?: string };
      const markdown = content.content ? githubText(content.content) : "";
      const frontMatter =
        markdown.match(/^---\s*\n([\s\S]*?)\n---/m)?.[1] ?? "";
      isPublished = /^status:\s*published\s*$/m.test(frontMatter);
    } else if (response.status !== 404) {
      throw new Error("GitHub上の公開状態を取得できませんでした。");
    }
    if (isPublished) {
      published += 1;
      await env.REPORTS.prepare(
        "UPDATE editorial_documents SET published_at = COALESCE(published_at, ?) WHERE id = ?",
      )
        .bind(now, document.id)
        .run();
    } else {
      pending += 1;
      await env.REPORTS.prepare(
        "UPDATE editorial_documents SET published_at = NULL WHERE id = ?",
      )
        .bind(document.id)
        .run();
    }
  }
  return { published, pending, total: documents.results.length };
}

async function syncEditorialPublicationStatusForAdmin(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getGlobalAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  try {
    return json(await syncEditorialPublicationStatus(env));
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "公開状態を同期できませんでした。",
      },
      502,
    );
  }
}

const editorialMarkdown = (
  document: EditorialDocument,
  publicationStatus: "published" | "draft" = "published",
) => {
  const date = new Date().toISOString().slice(0, 10);
  return [
    "---",
    `articleId: ${document.locale}-${document.subject}-${document.slug}`,
    `locale: ${document.locale}`,
    `title: ${document.title}`,
    `slug: ${document.slug}`,
    `subject: ${document.subject}`,
    `category: ${document.category}`,
    "concepts:",
    `  - id: ${document.concept_id}`,
    "authors: [editorial-workspace]",
    `reviewers: [${document.updated_by}]`,
    `status: ${publicationStatus}`,
    `createdAt: ${date}`,
    `updatedAt: ${date}`,
    `summary: ${document.summary}`,
    "difficulty: basic",
    "estimatedMinutes: 10",
    "tags: []",
    "aliases: []",
    "exerciseIds: { pre: [], post: [] }",
    "references: []",
    "---",
    "",
    document.body,
  ].join("\n");
};

const listEditorialAssetsForDocument = async (env: Env, documentId: string) =>
  (
    await env.REPORTS.prepare(
      `SELECT id, document_id, filename, media_type, bytes, data, alt_text, created_by, created_at
       FROM editorial_assets WHERE document_id = ? ORDER BY created_at ASC`,
    )
      .bind(documentId)
      .all<EditorialAsset>()
  ).results;

async function uploadEditorialAssetToGitHub(
  asset: EditorialAsset,
  repository: string,
  headers: Record<string, string>,
  documentId: string,
) {
  const path = `public/images/editorial/${documentId}/${asset.filename}`;
  const endpoint = `https://api.github.com/repos/${repository}/contents/${path}`;
  const existing = await fetch(endpoint, { headers });
  let sha: string | undefined;
  if (existing.ok) sha = ((await existing.json()) as { sha?: string }).sha;
  else if (existing.status !== 404)
    throw new Error("GitHub上の画像公開先を確認できませんでした。");
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      message: `Publish article asset: ${asset.filename}`,
      content: githubBinaryBase64(asset.data),
      branch: "main",
      ...(sha ? { sha } : {}),
    }),
  });
  if (!response.ok) throw new Error("GitHubへ画像を反映できませんでした。");
}

async function writeEditorialDocumentToGitHub(
  document: EditorialDocument,
  env: Env,
  publicationStatus: "published" | "draft",
  message: string,
): Promise<{ commitUrl: string | null; body: string } | Response> {
  const repository = env.GITHUB_REPOSITORY ?? "Atlasez/Atlasez01";
  const token = env.GITHUB_PUBLISH_TOKEN;
  if (!token)
    return json(
      {
        error:
          "GitHub公開連携がまだ設定されていません。運営管理者がGITHUB_PUBLISH_TOKENをCloudflare Secretへ登録してください。",
      },
      503,
    );
  const path = `src/content/articles/${document.locale}/${document.subject}/${document.category}/${document.slug}.md`;
  const endpoint = `https://api.github.com/repos/${repository}/contents/${path}`;
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "user-agent": "atlasez-editorial-workspace",
    "x-github-api-version": "2022-11-28",
  };
  let sha: string | undefined;
  const existing = await fetch(endpoint, { headers });
  if (existing.ok) sha = ((await existing.json()) as { sha?: string }).sha;
  else if (existing.status !== 404)
    return json({ error: "GitHub上の公開先を確認できませんでした。" }, 502);
  const assets = await listEditorialAssetsForDocument(env, document.id);
  const assetsById = new Map(
    assets.map((asset) => [asset.id.toLowerCase(), asset]),
  );
  const referencedAssetIds = editorialAssetIdsIn(document.body);
  const missingAsset = referencedAssetIds.find(
    (id) => !assetsById.has(id.toLowerCase()),
  );
  if (missingAsset)
    return json(
      {
        error:
          "本文が参照している画像素材が見つかりません。再挿入してください。",
      },
      409,
    );
  for (const assetId of referencedAssetIds)
    await uploadEditorialAssetToGitHub(
      assetsById.get(assetId.toLowerCase())!,
      repository,
      headers,
      document.id,
    );
  const body = editorialMarkdown(
    {
      ...document,
      body: replaceEditorialAssetMarkers(document.body, assetsById),
    },
    publicationStatus,
  );
  const publish = await fetch(endpoint, {
    method: "PUT",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      message,
      content: githubBase64(body),
      branch: "main",
      ...(sha ? { sha } : {}),
    }),
  });
  if (!publish.ok)
    return json(
      {
        error:
          "GitHubへの反映に失敗しました。トークンのContents権限と対象リポジトリを確認してください。",
      },
      502,
    );
  const result = (await publish.json()) as {
    commit?: { html_url?: string };
    content?: { sha?: string };
  };
  await storeArticleBackup(
    env,
    repository,
    path,
    result.content?.sha ?? crypto.randomUUID(),
    body,
    "publish",
  );
  return { commitUrl: result.commit?.html_url ?? null, body };
}

async function publishEditorialDocument(
  request: Request,
  env: Env,
  documentId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!scope.isManager)
    return json({ error: "公開できるのは運営管理者だけです。" }, 403);
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  const document = await env.REPORTS.prepare(
    `${editorialDocumentSelect} WHERE id = ?`,
  )
    .bind(documentId)
    .first<EditorialDocument>();
  if (!document) return json({ error: "原稿が見つかりません。" }, 404);
  if (document.status !== "approved")
    return json({ error: "公開前に原稿を承認済みにしてください。" }, 400);
  const result = await writeEditorialDocumentToGitHub(
    document,
    env,
    "published",
    `Publish article: ${document.title}`,
  );
  if (result instanceof Response) return result;
  await env.REPORTS.prepare(
    "UPDATE editorial_documents SET published_at = ?, updated_at = ?, updated_by = ? WHERE id = ?",
  )
    .bind(
      new Date().toISOString(),
      new Date().toISOString(),
      scope.email,
      documentId,
    )
    .run();
  return json({ ok: true, commitUrl: result.commitUrl });
}

async function unpublishEditorialDocument(
  request: Request,
  env: Env,
  documentId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!scope.isManager)
    return json({ error: "公開を取り消せるのは運営管理者だけです。" }, 403);
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  const document = await env.REPORTS.prepare(
    `${editorialDocumentSelect} WHERE id = ?`,
  )
    .bind(documentId)
    .first<EditorialDocument>();
  if (!document) return json({ error: "原稿が見つかりません。" }, 404);
  if (!document.published_at)
    return json({ error: "この原稿は公開済みではありません。" }, 400);
  const result = await writeEditorialDocumentToGitHub(
    document,
    env,
    "draft",
    `Unpublish article: ${document.title}`,
  );
  if (result instanceof Response) return result;
  const now = new Date().toISOString();
  await env.REPORTS.prepare(
    "INSERT INTO editorial_document_revisions (id, document_id, title, summary, body, status, saved_by, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      crypto.randomUUID(),
      documentId,
      document.title,
      document.summary,
      document.body,
      document.status,
      scope.email,
      now,
    )
    .run();
  await env.REPORTS.prepare(
    "UPDATE editorial_documents SET status = 'draft', published_at = NULL, updated_at = ?, updated_by = ? WHERE id = ?",
  )
    .bind(now, scope.email, documentId)
    .run();
  return json({ ok: true, commitUrl: result.commitUrl });
}

const googleOAuthConfigured = (env: Env) =>
  Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET);

const adminReturnPath = (value: string | null) =>
  value === "/admin/workspace" ||
  value === "/admin/workspace/" ||
  value === "/admin/portal" ||
  value === "/admin/portal/" ||
  value === "/admin/applications" ||
  value === "/admin/applications/" ||
  value === "/admin/articles" ||
  value === "/admin/articles/" ||
  value === "/admin/operations" ||
  value === "/admin/operations/" ||
  value === "/admin/review" ||
  value === "/admin/review/" ||
  value === "/admin/reports" ||
  value === "/admin/reports/" ||
  value === "/admin/editor" ||
  value === "/admin/editor/" ||
  value === "/admin/guide" ||
  value === "/admin/guide/" ||
  value === "/admin/introductions" ||
  value === "/admin/introductions/" ||
  value === "/admin/secretariat" ||
  value === "/admin/secretariat/" ||
  value === "/admin/co-working" ||
  value === "/admin/co-working/"
    ? value
    : "/admin/reports";

function adminPublicOrigin(request: Request, env: Env) {
  return (env.ADMIN_PUBLIC_ORIGIN ?? new URL(request.url).origin).replace(
    /\/$/,
    "",
  );
}

function googleCallbackUrl(request: Request, env: Env) {
  return `${adminPublicOrigin(request, env)}/auth/google/callback`;
}

async function startGoogleLogin(request: Request, env: Env): Promise<Response> {
  if (!googleOAuthEnabled(env) || !googleOAuthConfigured(env))
    return json({ error: "Googleログインはまだ有効ではありません。" }, 404);
  const requestUrl = new URL(request.url);
  const state = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorization.search = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    redirect_uri: googleCallbackUrl(request, env),
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
        redirect_uri: googleCallbackUrl(request, env),
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
  // 保護ページを経由せず認証入口へ戻す。ログアウト直後に404へ落ちないようにする。
  const headers = new Headers({
    location: `${adminPublicOrigin(request, env)}/auth/google/login?returnTo=%2Fadmin%2Feditor%2F`,
  });
  headers.append("set-cookie", cookie(ADMIN_SESSION_COOKIE, "", 0));
  return new Response(null, { status: 302, headers });
}

async function adminAuthStatus(request: Request, env: Env): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const identity = scope.email;
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
    isManager: scope.isManager,
    googlePreviewEnabled: googleOAuthEnabled(env) && googleOAuthConfigured(env),
    googleAuthenticated: googleSession?.email === identity,
    authMode: authMode(env),
  });
}

async function adminNotifications(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!scope.isManager && !scope.subjects.length)
    return json({ notifications: [] });
  const [commentRows, approvedRows, publishedRows, reviewRows] =
    await Promise.all([
      env.REPORTS.prepare(
        "SELECT c.id, c.body, c.parent_comment_id, c.created_at, d.id AS document_id, d.title FROM editorial_comments c JOIN editorial_documents d ON d.id = c.document_id WHERE d.created_by = ? AND c.created_by != ? ORDER BY c.created_at DESC LIMIT 12",
      )
        .bind(scope.email, scope.email)
        .all<{
          id: string;
          body: string;
          parent_comment_id: string | null;
          created_at: string;
          document_id: string;
          title: string;
        }>(),
      env.REPORTS.prepare(
        "SELECT id, title, updated_at FROM editorial_documents WHERE created_by = ? AND status = 'approved' AND published_at IS NULL ORDER BY updated_at DESC LIMIT 12",
      )
        .bind(scope.email)
        .all<{ id: string; title: string; updated_at: string }>(),
      env.REPORTS.prepare(
        "SELECT id, title, published_at FROM editorial_documents WHERE created_by = ? AND published_at IS NOT NULL ORDER BY published_at DESC LIMIT 12",
      )
        .bind(scope.email)
        .all<{ id: string; title: string; published_at: string }>(),
      scope.isManager
        ? env.REPORTS.prepare(
            "SELECT id, subject, title, updated_by, updated_at FROM editorial_documents WHERE status = 'in-review' ORDER BY updated_at ASC LIMIT 30",
          ).all<{
            id: string;
            subject: string;
            title: string;
            updated_by: string;
            updated_at: string;
          }>()
        : Promise.resolve({
            results: [] as {
              id: string;
              subject: string;
              title: string;
              updated_by: string;
              updated_at: string;
            }[],
          }),
    ]);
  const notifications = [
    ...(commentRows.results ?? []).map((item) => ({
      id: `comment-${item.id}`,
      kind: "comment",
      title: `${item.parent_comment_id ? "コメントに返信" : "記事に新しいコメント"}：${item.title}`,
      detail: item.body.slice(0, 90),
      href: `/admin/editor/?document=${encodeURIComponent(item.document_id)}`,
      updatedAt: item.created_at,
    })),
    ...(approvedRows.results ?? []).map((item) => ({
      id: `approved-${item.id}`,
      kind: "approved",
      title: `査読完了：${item.title}`,
      detail: "公開前の原稿を確認してください。",
      href: `/admin/editor/?document=${encodeURIComponent(item.id)}`,
      updatedAt: item.updated_at,
    })),
    ...(publishedRows.results ?? []).map((item) => ({
      id: `published-${item.id}`,
      kind: "published",
      title: `記事が公開されました：${item.title}`,
      detail: "学習サイトへの反映を確認できます。",
      href: `/admin/editor/?document=${encodeURIComponent(item.id)}`,
      updatedAt: item.published_at,
    })),
    ...(scope.isManager
      ? (reviewRows.results ?? []).map((item) => ({
          id: `review-${item.id}`,
          kind: "review",
          title: `査読依頼：${item.title}`,
          detail: `担当分野：${item.subject} ／ 依頼者：${item.updated_by}`,
          href: `/admin/editor/?document=${encodeURIComponent(item.id)}`,
          updatedAt: item.updated_at,
        }))
      : []),
  ]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 20);
  const readIds = notifications.length
    ? await env.REPORTS.prepare(
        `SELECT notification_id FROM admin_notification_reads WHERE email = ? AND notification_id IN (${notifications.map(() => "?").join(",")})`,
      )
        .bind(scope.email, ...notifications.map((item) => item.id))
        .all<{ notification_id: string }>()
    : { results: [] as { notification_id: string }[] };
  const read = new Set(
    (readIds.results ?? []).map((item) => item.notification_id),
  );
  return json({
    notifications: notifications.map((item) => ({
      ...item,
      read: read.has(item.id),
    })),
  });
}

async function markAdminNotificationsRead(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "許可されていない送信元です。" }, 403);
  const payload = (await request.json().catch(() => null)) as {
    ids?: unknown;
  } | null;
  const ids = Array.isArray(payload?.ids)
    ? [
        ...new Set(
          payload!.ids
            .filter(
              (id): id is string =>
                typeof id === "string" &&
                /^(comment|approved|published|review)-[a-zA-Z0-9-]{8,}$/.test(
                  id,
                ),
            )
            .slice(0, 32),
        ),
      ]
    : [];
  if (!ids.length)
    return json({ error: "既読にする通知を選択してください。" }, 400);
  const now = new Date().toISOString();
  await env.REPORTS.batch(
    ids.map((id) =>
      env.REPORTS.prepare(
        "INSERT INTO admin_notification_reads (email, notification_id, read_at) VALUES (?, ?, ?) ON CONFLICT(email, notification_id) DO UPDATE SET read_at = excluded.read_at",
      ).bind(scope.email, id, now),
    ),
  );
  return json({ ok: true });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // 運営サイトの入口は常に編集室へ案内する。静的サイトのルートを
    // 公開してしまわないため、ここで明示的にリダイレクトする。
    if (url.pathname === "/")
      return Response.redirect(`${url.origin}/admin/portal/`, 302);
    if (url.pathname === "/auth/google/login" && request.method === "GET")
      return startGoogleLogin(request, env);
    if (url.pathname === "/auth/google/callback" && request.method === "GET")
      return completeGoogleLogin(request, env);
    // ナビゲーションからの直接アクセス（GET）でもログアウトできるようにする。
    if (
      url.pathname === "/auth/logout" &&
      (request.method === "POST" || request.method === "GET")
    )
      return logoutAdmin(request, env);
    if (
      url.pathname === "/api/public/application-config" &&
      request.method === "GET"
    )
      return publicApplicationConfig(env);
    if (url.pathname === "/api/apply" && request.method === "POST")
      return submitMemberApplication(request, env);
    if (url.pathname === "/api/admin/auth-status" && request.method === "GET")
      return adminAuthStatus(request, env);
    if (url.pathname === "/api/admin/notifications" && request.method === "GET")
      return adminNotifications(request, env);
    if (
      url.pathname === "/api/admin/notifications/read" &&
      request.method === "POST"
    )
      return markAdminNotificationsRead(request, env);
    if (url.pathname === "/api/admin/report-admin-permissions") {
      if (request.method === "GET")
        return listReportAdminPermissions(request, env);
      if (request.method === "POST")
        return createReportAdminPermission(request, env);
      if (request.method === "DELETE")
        return deleteReportAdminPermission(request, env);
      return json({ error: "GET、POST、DELETEのみ利用できます。" }, 405);
    }
    if (
      url.pathname === "/api/admin/discord-member-roles" &&
      request.method === "POST"
    ) {
      try {
        return await syncDiscordMemberRoles(request, env);
      } catch (error) {
        return json(
          {
            error: `Discordロール同期中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
          },
          500,
        );
      }
    }
    if (
      url.pathname === "/api/admin/member-discord-user" &&
      request.method === "PUT"
    )
      return updateMemberDiscordUserId(request, env);
    if (
      url.pathname === "/api/admin/discord-provision-roles" &&
      request.method === "POST"
    ) {
      try {
        return await provisionDiscordAttributeRoles(request, env);
      } catch (error) {
        return json(
          {
            error: `ロール準備中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
          },
          500,
        );
      }
    }
    if (
      url.pathname === "/api/admin/member-attributes" &&
      request.method === "PUT"
    )
      return updateMemberAttributes(request, env);
    if (url.pathname === "/api/admin/article-reports") {
      return request.method === "GET"
        ? listArticleReports(request, env)
        : json({ error: "GETのみ利用できます。" }, 405);
    }
    if (
      url.pathname === "/api/admin/article-analytics" &&
      request.method === "GET"
    )
      return listArticleAnalytics(request, env);
    if (url.pathname === "/api/admin/personal-workspace") {
      if (request.method === "GET") return getPersonalWorkspace(request, env);
      if (request.method === "PUT") return savePersonalWorkspace(request, env);
      return json({ error: "GET、PUTのみ利用できます。" }, 405);
    }
    if (url.pathname === "/api/admin/profile") {
      if (request.method === "GET") return getMyProfile(request, env);
      if (request.method === "PUT") return saveMyProfile(request, env);
      return json({ error: "GET、PUTのみ利用できます。" }, 405);
    }
    if (url.pathname === "/api/admin/portal" && request.method === "GET")
      return portalOverview(request, env);
    if (url.pathname === "/api/admin/projects" && request.method === "POST")
      return createAtlasezProject(request, env);
    if (url.pathname === "/api/admin/applications" && request.method === "GET")
      return listApplications(request, env);
    const applicationMatch = url.pathname.match(
      /^\/api\/admin\/applications\/([0-9a-f-]{36})$/i,
    );
    if (applicationMatch && request.method === "PATCH")
      return updateApplication(request, env, applicationMatch[1]);
    if (url.pathname === "/api/admin/operations" && request.method === "GET")
      return operationsOverview(request, env);
    if (
      url.pathname === "/api/admin/operations/tasks" &&
      request.method === "POST"
    )
      return createOperation(request, env, "task");
    if (
      url.pathname === "/api/admin/operations/progress" &&
      request.method === "POST"
    )
      return createOperation(request, env, "progress");
    if (
      url.pathname === "/api/admin/operations/events" &&
      request.method === "POST"
    )
      return createOperation(request, env, "event");
    if (
      url.pathname === "/api/admin/operations/availability-blocks" &&
      request.method === "POST"
    )
      return createAvailabilityBlock(request, env);
    const availabilityBlockMatch = url.pathname.match(
      /^\/api\/admin\/operations\/availability-blocks\/([0-9a-f-]{36})$/i,
    );
    if (availabilityBlockMatch && request.method === "DELETE")
      return deleteAvailabilityBlock(request, env, availabilityBlockMatch[1]);
    const taskMatch = url.pathname.match(
      /^\/api\/admin\/operations\/tasks\/([0-9a-f-]{36})$/i,
    );
    if (taskMatch && request.method === "PATCH")
      return updateTask(request, env, taskMatch[1]);
    const availabilityMatch = url.pathname.match(
      /^\/api\/admin\/operations\/events\/([0-9a-f-]{36})\/availability$/i,
    );
    if (availabilityMatch && request.method === "PUT")
      return updateEventAvailability(request, env, availabilityMatch[1]);
    const eventMatch = url.pathname.match(
      /^\/api\/admin\/operations\/events\/([0-9a-f-]{36})$/i,
    );
    if (eventMatch && request.method === "DELETE")
      return deleteEvent(request, env, eventMatch[1]);
    if (
      url.pathname === "/api/admin/editor/sync-publication-status" &&
      request.method === "POST"
    )
      return syncEditorialPublicationStatusForAdmin(request, env);
    if (url.pathname === "/api/admin/editor/documents") {
      if (request.method === "GET") return listEditorialDocuments(request, env);
      if (request.method === "POST")
        return createEditorialDocument(request, env);
      return json({ error: "GET、POSTのみ利用できます。" }, 405);
    }
    if (url.pathname === "/api/admin/editor/board" && request.method === "GET")
      return editorialBoard(request, env);
    const editorialAssetCollectionMatch = url.pathname.match(
      /^\/api\/admin\/editor\/documents\/([0-9a-f-]{36})\/assets$/i,
    );
    if (editorialAssetCollectionMatch) {
      if (request.method === "GET")
        return listEditorialAssets(
          request,
          env,
          editorialAssetCollectionMatch[1],
        );
      if (request.method === "POST")
        return uploadEditorialAsset(
          request,
          env,
          editorialAssetCollectionMatch[1],
        );
      return json({ error: "GET、POSTのみ利用できます。" }, 405);
    }
    const editorialAssetMatch = url.pathname.match(
      /^\/api\/admin\/editor\/assets\/([0-9a-f-]{36})$/i,
    );
    if (editorialAssetMatch && request.method === "GET")
      return serveEditorialAsset(request, env, editorialAssetMatch[1]);
    if (
      url.pathname === "/api/admin/editor/review-requests" &&
      request.method === "GET"
    )
      return listEditorialReviewRequests(request, env);
    const editorialRevisionMatch = url.pathname.match(
      /^\/api\/admin\/editor\/documents\/([0-9a-f-]{36})\/revisions$/i,
    );
    if (editorialRevisionMatch && request.method === "GET")
      return listEditorialRevisions(request, env, editorialRevisionMatch[1]);
    const editorialCommentMatch = url.pathname.match(
      /^\/api\/admin\/editor\/documents\/([0-9a-f-]{36})\/comments$/i,
    );
    if (editorialCommentMatch)
      return request.method === "POST"
        ? createEditorialComment(request, env, editorialCommentMatch[1])
        : json({ error: "POSTのみ利用できます。" }, 405);
    const editorialCommentStatusMatch = url.pathname.match(
      /^\/api\/admin\/editor\/documents\/([0-9a-f-]{36})\/comments\/([0-9a-f-]{36})$/i,
    );
    if (editorialCommentStatusMatch)
      return request.method === "PATCH"
        ? (await request
            .clone()
            .json()
            .then((payload) => payload?.action === "edit")
            .catch(() => false))
          ? editEditorialComment(
              request,
              env,
              editorialCommentStatusMatch[1],
              editorialCommentStatusMatch[2],
            )
          : updateEditorialCommentStatus(
              request,
              env,
              editorialCommentStatusMatch[1],
              editorialCommentStatusMatch[2],
            )
        : request.method === "DELETE"
          ? deleteEditorialComment(
              request,
              env,
              editorialCommentStatusMatch[1],
              editorialCommentStatusMatch[2],
            )
          : json({ error: "PATCH、DELETEのみ利用できます。" }, 405);
    const editorialPublishMatch = url.pathname.match(
      /^\/api\/admin\/editor\/documents\/([0-9a-f-]{36})\/publish$/i,
    );
    if (editorialPublishMatch)
      return request.method === "POST"
        ? publishEditorialDocument(request, env, editorialPublishMatch[1])
        : json({ error: "POSTのみ利用できます。" }, 405);
    const editorialUnpublishMatch = url.pathname.match(
      /^\/api\/admin\/editor\/documents\/([0-9a-f-]{36})\/unpublish$/i,
    );
    if (editorialUnpublishMatch)
      return request.method === "POST"
        ? unpublishEditorialDocument(request, env, editorialUnpublishMatch[1])
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
      url.pathname === "/apply" ||
      url.pathname === "/apply/" ||
      url.pathname === "/admin/reports" ||
      url.pathname === "/admin/reports/" ||
      url.pathname === "/admin/permissions" ||
      url.pathname === "/admin/permissions/" ||
      url.pathname === "/admin/editor" ||
      url.pathname === "/admin/editor/" ||
      url.pathname === "/admin/workspace" ||
      url.pathname === "/admin/workspace/" ||
      url.pathname === "/admin/portal" ||
      url.pathname === "/admin/portal/" ||
      url.pathname === "/admin/atlas" ||
      url.pathname === "/admin/atlas/" ||
      url.pathname === "/admin/applications" ||
      url.pathname === "/admin/applications/" ||
      url.pathname === "/admin/articles" ||
      url.pathname === "/admin/articles/" ||
      url.pathname === "/admin/operations" ||
      url.pathname === "/admin/operations/" ||
      url.pathname === "/admin/review" ||
      url.pathname === "/admin/review/" ||
      url.pathname === "/admin/guide" ||
      url.pathname === "/admin/guide/" ||
      url.pathname === "/admin/introductions" ||
      url.pathname === "/admin/introductions/" ||
      url.pathname === "/admin/secretariat" ||
      url.pathname === "/admin/secretariat/" ||
      url.pathname === "/admin/co-working" ||
      url.pathname === "/admin/co-working/"
    ) {
      if (url.pathname === "/apply" || url.pathname === "/apply/")
        return fetchAdminAsset(request, env);
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
      const managerPages = new Set([
        "/admin/permissions",
        "/admin/permissions/",
        "/admin/applications",
        "/admin/applications/",
        "/admin/review",
        "/admin/review/",
      ]);
      if (managerPages.has(url.pathname)) {
        const managerScope = await getGlobalAdminScope(request, env);
        if (isResponse(managerScope)) return managerScope;
      }
      return fetchAdminAsset(request, env);
    }
    // Permit only the static support files used by the admin UI.  All learning
    // site pages remain unreachable from this Worker.
    if (
      url.pathname.startsWith("/_astro/") ||
      url.pathname.startsWith("/images/") ||
      url.pathname.startsWith("/data/") ||
      url.pathname === "/favicon.svg"
    ) {
      return env.ASSETS.fetch(request);
    }
    return new Response("Not found", { status: 404 });
  },
  async scheduled(
    _controller: unknown,
    env: Env,
    ctx: { waitUntil(promise: Promise<unknown>): void },
  ) {
    ctx.waitUntil(
      Promise.all([
        syncPublishedArticleBackups(env),
        syncEditorialPublicationStatus(env),
        purgeExpiredPersonalData(env),
      ]),
    );
  },
};
