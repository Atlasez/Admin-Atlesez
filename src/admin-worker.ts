interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<unknown>;
  all<T>(): Promise<{ results: T[] }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface Env {
  ASSETS: Fetcher;
  REPORTS: D1Database;
}

type ReportStatus = "new" | "reviewing" | "resolved";
type AdminUpdatePayload = { status?: unknown; adminNote?: unknown };
type ArticleReport = {
  id: string; article_title: string; article_url: string; article_id: string | null;
  report_type: string; details: string; contact: string | null; locale: string;
  status: ReportStatus; admin_note: string; created_at: string; updated_at: string;
};

const REPORT_STATUSES = new Set<ReportStatus>(["new", "reviewing", "resolved"]);
const MAX_ADMIN_NOTE_LENGTH = 4_000;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const text = (value: unknown, maximum: number) => typeof value === "string" ? value.trim().slice(0, maximum) : "";

async function listArticleReports(request: Request, env: Env): Promise<Response> {
  const requested = new URL(request.url).searchParams.get("status") ?? "all";
  const status = REPORT_STATUSES.has(requested as ReportStatus) ? requested as ReportStatus : null;
  if (requested !== "all" && !status) return json({ error: "状態を確認してください。" }, 400);
  const select = `SELECT id, article_title, article_url, article_id, report_type, details,
      contact, locale, status, admin_note, created_at, updated_at FROM article_reports`;
  const order = ` ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END, created_at DESC LIMIT 250`;
  const result = status
    ? await env.REPORTS.prepare(`${select} WHERE status = ?${order}`).bind(status).all<ArticleReport>()
    : await env.REPORTS.prepare(`${select}${order}`).all<ArticleReport>();
  return json({ reports: result.results });
}

async function updateArticleReport(request: Request, env: Env, reportId: string): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "この送信元からは受け付けられません。" }, 403);
  if (request.headers.get("content-type")?.includes("application/json") !== true) return json({ error: "JSON形式で送信してください。" }, 415);
  let payload: AdminUpdatePayload;
  try { payload = await request.json() as AdminUpdatePayload; } catch { return json({ error: "入力内容を読み取れませんでした。" }, 400); }
  const status = text(payload.status, 20) as ReportStatus;
  if (!REPORT_STATUSES.has(status)) return json({ error: "対応状況を確認してください。" }, 400);
  await env.REPORTS.prepare(`UPDATE article_reports SET status = ?, admin_note = ?, updated_at = ? WHERE id = ?`)
    .bind(status, text(payload.adminNote, MAX_ADMIN_NOTE_LENGTH), new Date().toISOString(), reportId).run();
  return json({ ok: true });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/admin/article-reports") {
      return request.method === "GET" ? listArticleReports(request, env) : json({ error: "GETのみ利用できます。" }, 405);
    }
    const match = url.pathname.match(/^\/api\/admin\/article-reports\/([0-9a-f-]{36})$/i);
    if (match) return request.method === "PATCH" ? updateArticleReport(request, env, match[1]) : json({ error: "PATCHのみ利用できます。" }, 405);
    if (url.pathname === "/admin/reports" || url.pathname === "/admin/reports/") return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};
