interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface ExportedHandler<Environment> {
  fetch(request: Request, env: Environment): Response | Promise<Response>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface Env {
  ASSETS: Fetcher;
  REPORTS: D1Database;
}

type ReportPayload = {
  articleTitle?: unknown;
  articleUrl?: unknown;
  articleId?: unknown;
  reportType?: unknown;
  details?: unknown;
  contact?: unknown;
  locale?: unknown;
  website?: unknown;
  openedAt?: unknown;
};

const MAX_DETAILS_LENGTH = 6_000;
const MAX_CONTACT_LENGTH = 320;
const MIN_FORM_FILL_MS = 1_200;
const MAX_FORM_OPEN_MS = 2 * 60 * 60 * 1_000;
const ALLOWED_REPORT_TYPES = new Set([
  "error",
  "suggestion",
  "reference",
  "other",
]);

// GitHub Pages で公開している画面からも、Cloudflare Worker の送信APIを利用する。
// この一覧以外のサイトからはブラウザー経由で送信できない。
const TRUSTED_REPORT_ORIGINS = new Set([
  "https://mitukx.github.io",
  "http://localhost:4321",
  "http://127.0.0.1:4321",
]);

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });

const text = (value: unknown, maximum: number) =>
  typeof value === "string" ? value.trim().slice(0, maximum) : "";

const isTrustedReportOrigin = (origin: string | null, requestUrl: URL) =>
  !origin || origin === requestUrl.origin || TRUSTED_REPORT_ORIGINS.has(origin);

const withCors = (response: Response, request: Request) => {
  const origin = request.headers.get("origin");
  if (!origin || !isTrustedReportOrigin(origin, new URL(request.url)))
    return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-methods", "POST, OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  headers.set("vary", "origin");
  return new Response(response.body, { status: response.status, headers });
};

async function fingerprint(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function saveArticleReport(
  request: Request,
  env: Env,
): Promise<Response> {
  if (
    request.headers.get("content-type")?.includes("application/json") !== true
  ) {
    return json({ error: "JSON形式で送信してください。" }, 415);
  }

  const origin = request.headers.get("origin");
  if (!isTrustedReportOrigin(origin, new URL(request.url))) {
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  }

  let payload: ReportPayload;
  try {
    payload = (await request.json()) as ReportPayload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }

  // 画面には表示しないハニーポット。自動送信だけを静かに成功扱いにする。
  if (text(payload.website, 200)) return json({ ok: true }, 201);

  const articleTitle = text(payload.articleTitle, 200);
  const articleUrl = text(payload.articleUrl, 2_000);
  const articleId = text(payload.articleId, 200);
  const reportType = text(payload.reportType, 40);
  const details = text(payload.details, MAX_DETAILS_LENGTH);
  const contact = text(payload.contact, MAX_CONTACT_LENGTH);
  const locale = text(payload.locale, 16) || "ja";
  const openedAt = Number(payload.openedAt);

  if (
    !articleTitle ||
    !articleUrl ||
    !details ||
    !ALLOWED_REPORT_TYPES.has(reportType)
  ) {
    return json({ error: "必須項目を確認してください。" }, 400);
  }
  const elapsed = Date.now() - openedAt;
  if (
    !Number.isFinite(openedAt) ||
    elapsed < MIN_FORM_FILL_MS ||
    elapsed > MAX_FORM_OPEN_MS
  ) {
    return json(
      { error: "フォームを開いてから、もう一度お試しください。" },
      400,
    );
  }
  try {
    const target = new URL(articleUrl);
    if (target.protocol !== "http:" && target.protocol !== "https:")
      throw new Error();
  } catch {
    return json({ error: "記事URLを確認してください。" }, 400);
  }

  // IPアドレスそのものは保存せず、時間帯ごとの送信回数だけを制限する。
  const reporterHash = await fingerprint(
    request.headers.get("CF-Connecting-IP") ??
      request.headers.get("x-forwarded-for") ??
      "local",
  );
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1_000).toISOString();
  const todayAgo = new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString();
  const recentHour = await env.REPORTS.prepare(
    "SELECT COUNT(*) AS count FROM article_reports WHERE reporter_hash = ? AND created_at >= ?",
  )
    .bind(reporterHash, oneHourAgo)
    .first<{ count: number }>();
  if ((recentHour?.count ?? 0) >= 3) {
    return json(
      {
        error:
          "短時間での送信回数が上限に達しました。時間をおいて再度お試しください。",
      },
      429,
    );
  }
  const recentDay = await env.REPORTS.prepare(
    "SELECT COUNT(*) AS count FROM article_reports WHERE reporter_hash = ? AND created_at >= ?",
  )
    .bind(reporterHash, todayAgo)
    .first<{ count: number }>();
  if ((recentDay?.count ?? 0) >= 8) {
    return json({ error: "本日の送信回数が上限に達しました。" }, 429);
  }

  const contentHash = await fingerprint(
    `${articleId}\n${reportType}\n${details}`,
  );
  const duplicateSince = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1_000,
  ).toISOString();
  const duplicate = await env.REPORTS.prepare(
    "SELECT id FROM article_reports WHERE content_hash = ? AND created_at >= ? LIMIT 1",
  )
    .bind(contentHash, duplicateSince)
    .first<{ id: string }>();
  if (duplicate) {
    return json({ error: "同じ内容の報告はすでに受け付けています。" }, 409);
  }

  await env.REPORTS.prepare(
    `INSERT INTO article_reports
      (id, article_title, article_url, article_id, report_type, details, contact, locale, reporter_hash, content_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      articleTitle,
      articleUrl,
      articleId || null,
      reportType,
      details,
      contact || null,
      locale,
      reporterHash,
      contentHash,
      new Date().toISOString(),
    )
    .run();

  return json({ ok: true }, 201);
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/article-reports") {
      if (request.method === "OPTIONS") {
        return withCors(new Response(null, { status: 204 }), request);
      }
      if (request.method !== "POST")
        return withCors(
          json({ error: "POSTのみ利用できます。" }, 405),
          request,
        );
      return withCors(await saveArticleReport(request, env), request);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
