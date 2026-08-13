interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface ExportedHandler<Environment> {
  fetch(
    request: Request,
    env: Environment,
    ctx: ExecutionContext,
  ): Response | Promise<Response>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
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
  DISCORD_REPORT_WEBHOOK_URL?: string;
}

type ReportPayload = {
  articleTitle?: unknown;
  articleUrl?: unknown;
  articleId?: unknown;
  subject?: unknown;
  category?: unknown;
  reportType?: unknown;
  details?: unknown;
  contact?: unknown;
  locale?: unknown;
  website?: unknown;
  openedAt?: unknown;
};

type AnalyticsPayload = {
  articleId?: unknown;
  articleTitle?: unknown;
  subject?: unknown;
  category?: unknown;
  locale?: unknown;
  event?: unknown;
};

const MAX_DETAILS_LENGTH = 6_000;
const MAX_CONTACT_LENGTH = 320;
const MIN_FORM_FILL_MS = 1_200;
const MAX_FORM_OPEN_MS = 2 * 60 * 60 * 1_000;
const TAXONOMY_SLUG = /^[a-z0-9-]+$/;
const ALLOWED_REPORT_TYPES = new Set([
  "error",
  "suggestion",
  "reference",
  "other",
]);
const ALLOWED_ANALYTICS_EVENTS = new Set(["view", "engaged", "complete"]);
const REPORT_TYPE_LABEL: Record<string, string> = {
  error: "誤り・不具合",
  suggestion: "改善提案",
  reference: "出典・参考文献",
  other: "その他",
};

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
  Boolean(
    origin &&
    (origin === requestUrl.origin || TRUSTED_REPORT_ORIGINS.has(origin)),
  );

const isTrustedArticleUrl = (value: string, requestUrl: URL) => {
  try {
    const target = new URL(value);
    return (
      (target.protocol === "https:" ||
        target.hostname === "localhost" ||
        target.hostname === "127.0.0.1") &&
      (target.origin === requestUrl.origin ||
        TRUSTED_REPORT_ORIGINS.has(target.origin)) &&
      target.pathname.startsWith("/atlas/")
    );
  } catch {
    return false;
  }
};

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

type DiscordReport = {
  articleTitle: string;
  articleUrl: string;
  subject: string;
  category: string;
  reportType: string;
};

/**
 * 通知先はWorkerのシークレットだけから読む。報告本文・連絡先・IP由来の情報は
 * Discordへ送らず、管理画面でのみ確認できるようにする。
 */
async function notifyDiscord(env: Env, report: DiscordReport): Promise<void> {
  const webhookUrl = env.DISCORD_REPORT_WEBHOOK_URL?.trim();
  if (!webhookUrl) return;
  try {
    const url = new URL(webhookUrl);
    if (
      url.protocol !== "https:" ||
      (url.hostname !== "discord.com" && url.hostname !== "discordapp.com")
    ) {
      return;
    }
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "Atlasez 記事報告",
        allowed_mentions: { parse: [] },
        embeds: [
          {
            title: "新しい記事報告",
            url: report.articleUrl,
            color: 0x176ea6,
            fields: [
              { name: "記事", value: report.articleTitle, inline: false },
              {
                name: "分野",
                value: `${report.subject} / ${report.category}`,
                inline: true,
              },
              {
                name: "種類",
                value:
                  REPORT_TYPE_LABEL[report.reportType] ?? report.reportType,
                inline: true,
              },
            ],
            footer: { text: "本文・連絡先は運営用の報告管理画面で確認" },
          },
        ],
      }),
    });
  } catch {
    // 通知失敗は報告保存に影響させない。Webhook URLもログへ出さない。
  }
}

async function saveArticleReport(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
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
  const subject = text(payload.subject, 80);
  const category = text(payload.category, 80);
  const reportType = text(payload.reportType, 40);
  const details = text(payload.details, MAX_DETAILS_LENGTH);
  const contact = text(payload.contact, MAX_CONTACT_LENGTH);
  const locale = text(payload.locale, 16) || "ja";
  const openedAt = Number(payload.openedAt);

  if (
    !articleTitle ||
    !articleUrl ||
    !TAXONOMY_SLUG.test(subject) ||
    !TAXONOMY_SLUG.test(category) ||
    !details ||
    !ALLOWED_REPORT_TYPES.has(reportType)
  ) {
    return json({ error: "必須項目を確認してください。" }, 400);
  }
  if (contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    return json({ error: "連絡先メールアドレスを確認してください。" }, 400);
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
  if (!isTrustedArticleUrl(articleUrl, new URL(request.url))) {
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
      (id, article_title, article_url, article_id, subject, category, report_type, details, contact, locale, reporter_hash, content_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      articleTitle,
      articleUrl,
      articleId || null,
      subject,
      category,
      reportType,
      details,
      contact || null,
      locale,
      reporterHash,
      contentHash,
      new Date().toISOString(),
    )
    .run();

  ctx.waitUntil(
    notifyDiscord(env, {
      articleTitle,
      articleUrl,
      subject,
      category,
      reportType,
    }),
  );

  return json({ ok: true }, 201);
}

/**
 * 読者の個人情報・IPアドレス・端末識別子は保存せず、公開記事の利用状況だけを
 * 日別集計する。イベントは画面側でも各ページにつき一度だけ送信するため、
 * ここでは集計値だけを持つ。
 */
async function saveArticleAnalytics(
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
  let payload: AnalyticsPayload;
  try {
    payload = (await request.json()) as AnalyticsPayload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const articleId = text(payload.articleId, 200);
  const articleTitle = text(payload.articleTitle, 200);
  const subject = text(payload.subject, 80);
  const category = text(payload.category, 80);
  const locale = text(payload.locale, 16) || "ja";
  const event = text(payload.event, 20);
  if (
    !TAXONOMY_SLUG.test(articleId) ||
    !articleTitle ||
    !TAXONOMY_SLUG.test(subject) ||
    !TAXONOMY_SLUG.test(category) ||
    !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(locale) ||
    !ALLOWED_ANALYTICS_EVENTS.has(event)
  ) {
    return json({ error: "統計データを確認してください。" }, 400);
  }
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const increments = {
    view: event === "view" ? 1 : 0,
    engaged: event === "engaged" ? 1 : 0,
    complete: event === "complete" ? 1 : 0,
  };
  await env.REPORTS.prepare(
    `INSERT INTO article_analytics_daily
      (day, article_id, article_title, subject, category, locale, views, engaged_reads, completed_reads, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(day, article_id, locale) DO UPDATE SET
       article_title = excluded.article_title,
       subject = excluded.subject,
       category = excluded.category,
       views = views + excluded.views,
       engaged_reads = engaged_reads + excluded.engaged_reads,
       completed_reads = completed_reads + excluded.completed_reads,
       updated_at = excluded.updated_at`,
  )
    .bind(
      day,
      articleId,
      articleTitle,
      subject,
      category,
      locale,
      increments.view,
      increments.engaged,
      increments.complete,
      now.toISOString(),
    )
    .run();
  return json({ ok: true }, 201);
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
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
      return withCors(await saveArticleReport(request, env, ctx), request);
    }
    if (url.pathname === "/api/article-analytics") {
      if (request.method === "OPTIONS") {
        return withCors(new Response(null, { status: 204 }), request);
      }
      if (request.method !== "POST")
        return withCors(
          json({ error: "POSTのみ利用できます。" }, 405),
          request,
        );
      return withCors(await saveArticleAnalytics(request, env), request);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
