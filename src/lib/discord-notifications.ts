type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<{ meta?: { changes?: number } }>;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
};

type D1Database = {
  prepare(query: string): D1Statement;
};

export type DiscordNotificationEnv = {
  REPORTS: D1Database;
  DISCORD_ATLAS_WEBHOOK_URL?: string;
  DISCORD_PROGRESS_WEBHOOK_URL?: string;
  DISCORD_PROGRESS_CHANNEL_ID?: string;
  DISCORD_BOT_TOKEN?: string;
};

export type DiscordNotificationDraft = {
  dedupeKey: string;
  kind: string;
  destinationKind: "webhook" | "channel";
  destinationRef: string;
  content: string;
};

export type DiscordDeliverySummary = {
  notified: boolean;
  sent: number;
  failed: number;
  skipped: number;
};

export type DiscordNotificationOptions = {
  now?: Date;
  fetcher?: (input: string, init?: RequestInit) => Promise<Response>;
  logger?: Pick<Console, "info" | "error">;
  limit?: number;
  timeoutMs?: number;
};

type NotificationRow = {
  id: string;
  dedupe_key: string;
  kind: string;
  destination_kind: "webhook" | "channel";
  destination_ref: string;
  content: string;
  status: string;
  attempt_count: number;
};

type SendFailure = {
  ok: false;
  retryable: boolean;
  error: string;
  retryDelayMs: number;
};

const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 5 * 60_000;
const CLAIM_LEASE_MS = 15 * 60_000;
const SEND_TIMEOUT_MS = 15_000;
const CONTENT_LIMIT = 1_900;
const DISCORD_HOSTS = new Set(["discord.com", "discordapp.com"]);
const CHANNEL_ID = /^\d{15,22}$/;

const safeLog = (
  logger: Pick<Console, "info" | "error">,
  level: "info" | "error",
  event: string,
  fields: Record<string, unknown> = {},
) => logger[level](JSON.stringify({ event, ...fields }));

const retryableStatus = (status: number) =>
  status === 408 ||
  status === 409 ||
  status === 425 ||
  status === 429 ||
  status >= 500;

const webhookUrl = (env: DiscordNotificationEnv, ref: string) => {
  const raw =
    ref === "DISCORD_ATLAS_WEBHOOK_URL"
      ? env.DISCORD_ATLAS_WEBHOOK_URL
      : ref === "DISCORD_PROGRESS_WEBHOOK_URL"
        ? env.DISCORD_PROGRESS_WEBHOOK_URL
        : undefined;
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return { error: "not_configured" as const };
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || !DISCORD_HOSTS.has(url.hostname))
      return { error: "invalid_destination" as const };
    return { url: url.toString() };
  } catch {
    return { error: "invalid_destination" as const };
  }
};

const progressMessage = (subject: string | null, body: string) => {
  const subjectLabel = subject ? `【${subject}】` : "【全体】";
  return `📌 ${subjectLabel} 進捗報告\n${body}`.slice(0, CONTENT_LIMIT);
};

export const progressDiscordDrafts = (
  env: DiscordNotificationEnv,
  input: {
    reportId: string;
    subject: string | null;
    body: string;
    subjectChannelId?: string | null;
  },
): DiscordNotificationDraft[] => {
  const reportId = input.reportId.trim();
  const content = progressMessage(input.subject, input.body);
  if (!reportId || !content.trim()) return [];
  const drafts: DiscordNotificationDraft[] = [];
  if (env.DISCORD_PROGRESS_WEBHOOK_URL?.trim())
    drafts.push({
      dedupeKey: `progress:${reportId}:webhook:DISCORD_PROGRESS_WEBHOOK_URL`,
      kind: "progress",
      destinationKind: "webhook",
      destinationRef: "DISCORD_PROGRESS_WEBHOOK_URL",
      content,
    });
  if (env.DISCORD_ATLAS_WEBHOOK_URL?.trim())
    drafts.push({
      dedupeKey: `progress:${reportId}:webhook:DISCORD_ATLAS_WEBHOOK_URL`,
      kind: "progress",
      destinationKind: "webhook",
      destinationRef: "DISCORD_ATLAS_WEBHOOK_URL",
      content,
    });
  const progressChannel = env.DISCORD_PROGRESS_CHANNEL_ID?.trim() ?? "";
  if (env.DISCORD_BOT_TOKEN?.trim() && progressChannel)
    drafts.push({
      dedupeKey: `progress:${reportId}:channel:${progressChannel}`,
      kind: "progress",
      destinationKind: "channel",
      destinationRef: progressChannel,
      content,
    });
  const subjectChannel = input.subjectChannelId?.trim() ?? "";
  if (env.DISCORD_BOT_TOKEN?.trim() && subjectChannel)
    drafts.push({
      dedupeKey: `progress:${reportId}:subject-channel:${subjectChannel}`,
      kind: "progress",
      destinationKind: "channel",
      destinationRef: subjectChannel,
      content,
    });
  return drafts;
};

const loadByKey = (env: DiscordNotificationEnv, dedupeKey: string) =>
  env.REPORTS.prepare(
    `SELECT id,dedupe_key,kind,destination_kind,destination_ref,content,status,attempt_count
       FROM discord_notifications WHERE dedupe_key=?`,
  )
    .bind(dedupeKey)
    .first<NotificationRow>();

const loadById = (env: DiscordNotificationEnv, id: string) =>
  env.REPORTS.prepare(
    `SELECT id,dedupe_key,kind,destination_kind,destination_ref,content,status,attempt_count
       FROM discord_notifications WHERE id=?`,
  )
    .bind(id)
    .first<NotificationRow>();

const enqueueNotification = async (
  env: DiscordNotificationEnv,
  draft: DiscordNotificationDraft,
  now: string,
) => {
  await env.REPORTS.prepare(
    `INSERT OR IGNORE INTO discord_notifications
       (id,dedupe_key,kind,destination_kind,destination_ref,content,status,attempt_count,next_attempt_at,last_error,created_at,updated_at)
     VALUES (?,?,?,?,?,?, 'pending', 0, ?, '', ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      draft.dedupeKey,
      draft.kind,
      draft.destinationKind,
      draft.destinationRef,
      draft.content.slice(0, CONTENT_LIMIT),
      now,
      now,
      now,
    )
    .run();
};

const sendDiscordMessage = async (
  env: DiscordNotificationEnv,
  row: NotificationRow,
  fetcher: (input: string, init?: RequestInit) => Promise<Response>,
  timeoutMs: number,
): Promise<{ ok: true } | SendFailure> => {
  const permanent = (error: string): SendFailure => ({
    ok: false,
    retryable: false,
    error,
    retryDelayMs: RETRY_DELAY_MS,
  });
  const content = row.content.slice(0, CONTENT_LIMIT);
  if (!content.trim()) return permanent("empty_content");

  let url = "";
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (row.destination_kind === "webhook") {
    const target = webhookUrl(env, row.destination_ref);
    if ("error" in target)
      return target.error === "not_configured"
        ? {
            ok: false,
            retryable: true,
            error: "not_configured",
            retryDelayMs: RETRY_DELAY_MS,
          }
        : permanent("invalid_destination");
    url = target.url;
  } else {
    const token = env.DISCORD_BOT_TOKEN?.trim() ?? "";
    if (!CHANNEL_ID.test(row.destination_ref))
      return permanent("invalid_destination");
    if (!token)
      return {
        ok: false,
        retryable: true,
        error: "not_configured",
        retryDelayMs: RETRY_DELAY_MS,
      };
    url = `https://discord.com/api/v10/channels/${row.destination_ref}/messages`;
    headers.authorization = `Bot ${token}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        content,
        allowed_mentions: { parse: [] },
      }),
      redirect: "error",
      signal: controller.signal,
    });
    const raw = await response.text().catch(() => "");
    if (response.ok) return { ok: true };
    let retryDelayMs = RETRY_DELAY_MS;
    if (response.status === 429 && raw) {
      try {
        const parsed = JSON.parse(raw) as { retry_after?: unknown };
        if (
          typeof parsed.retry_after === "number" &&
          Number.isFinite(parsed.retry_after) &&
          parsed.retry_after >= 0
        )
          retryDelayMs = Math.min(
            60 * 60_000,
            Math.max(RETRY_DELAY_MS, Math.ceil(parsed.retry_after * 1000)),
          );
      } catch {
        retryDelayMs = RETRY_DELAY_MS;
      }
    }
    return {
      ok: false,
      retryable: retryableStatus(response.status),
      error: `http_${response.status}`,
      retryDelayMs,
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      retryable: true,
      error: aborted ? "timeout" : "network",
      retryDelayMs: RETRY_DELAY_MS,
    };
  } finally {
    clearTimeout(timeout);
  }
};

const claimAndSend = async (
  env: DiscordNotificationEnv,
  row: NotificationRow,
  options: DiscordNotificationOptions,
  nowDate: Date,
): Promise<"sent" | "failed" | "skipped"> => {
  const logger = options.logger ?? console;
  if (row.status === "sent") return "sent";
  if (row.status === "failed") return "failed";
  const now = nowDate.toISOString();
  const staleClaimCutoff = new Date(
    nowDate.getTime() - CLAIM_LEASE_MS,
  ).toISOString();
  const claimToken = crypto.randomUUID();
  const claim = await env.REPORTS.prepare(
    `UPDATE discord_notifications
        SET status='sending',claim_token=?,claimed_at=?,attempt_count=attempt_count+1,updated_at=?
      WHERE id=? AND attempt_count<? AND (
        (status IN ('pending','retry') AND next_attempt_at<=?)
        OR (status='sending' AND COALESCE(claimed_at,updated_at)<=?)
      )`,
  )
    .bind(claimToken, now, now, row.id, MAX_ATTEMPTS, now, staleClaimCutoff)
    .run();
  if (claim.meta?.changes !== 1) {
    const current = await loadById(env, row.id);
    return current?.status === "sent" ? "sent" : "skipped";
  }
  const attempt = row.attempt_count + 1;
  try {
    const result = await sendDiscordMessage(
      env,
      row,
      options.fetcher ?? fetch,
      options.timeoutMs ?? SEND_TIMEOUT_MS,
    );
    if (result.ok) {
      await env.REPORTS.prepare(
        `UPDATE discord_notifications
            SET status='sent',sent_at=?,claim_token=NULL,claimed_at=NULL,last_error='',updated_at=?
          WHERE id=? AND status='sending' AND claim_token=?`,
      )
        .bind(now, now, row.id, claimToken)
        .run();
      return "sent";
    }
    const canRetry = result.retryable && attempt < MAX_ATTEMPTS;
    await env.REPORTS.prepare(
      `UPDATE discord_notifications
          SET status=?,next_attempt_at=?,last_error=?,claim_token=NULL,claimed_at=NULL,updated_at=?
        WHERE id=? AND status='sending' AND claim_token=?`,
    )
      .bind(
        canRetry ? "retry" : "failed",
        canRetry
          ? new Date(nowDate.getTime() + result.retryDelayMs).toISOString()
          : now,
        result.error,
        now,
        row.id,
        claimToken,
      )
      .run();
    safeLog(logger, "error", "discord_notification_failed", {
      id: row.id,
      kind: row.kind,
      destinationKind: row.destination_kind,
      category: result.error,
      attempt,
      retry: canRetry,
    });
    return "failed";
  } catch {
    safeLog(logger, "error", "discord_notification_failed", {
      id: row.id,
      kind: row.kind,
      destinationKind: row.destination_kind,
      category: "queue",
      attempt,
    });
    return "failed";
  }
};

const summarize = (
  settled: PromiseSettledResult<"sent" | "failed" | "skipped">[],
): DiscordDeliverySummary => {
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const result of settled) {
    if (result.status === "rejected") {
      failed += 1;
      continue;
    }
    if (result.value === "sent") sent += 1;
    else if (result.value === "failed") failed += 1;
    else skipped += 1;
  }
  return { notified: sent > 0, sent, failed, skipped };
};

const deliverRows = (
  env: DiscordNotificationEnv,
  rows: NotificationRow[],
  options: DiscordNotificationOptions,
  nowDate: Date,
) =>
  Promise.allSettled(
    rows.map((row) => claimAndSend(env, row, options, nowDate)),
  ).then(summarize);

export async function deliverDiscordNotifications(
  env: DiscordNotificationEnv,
  drafts: DiscordNotificationDraft[],
  options: DiscordNotificationOptions = {},
): Promise<DiscordDeliverySummary> {
  if (!drafts.length)
    return { notified: false, sent: 0, failed: 0, skipped: 0 };
  const nowDate = options.now ?? new Date();
  const now = nowDate.toISOString();
  for (const draft of drafts) await enqueueNotification(env, draft, now);
  const rows: NotificationRow[] = [];
  for (const draft of drafts) {
    const row = await loadByKey(env, draft.dedupeKey);
    if (row) rows.push(row);
  }
  return deliverRows(env, rows, options, nowDate);
}

export async function deliverProgressDiscordNotification(
  env: DiscordNotificationEnv,
  input: {
    reportId: string;
    subject: string | null;
    body: string;
    subjectChannelId?: string | null;
  },
  options: DiscordNotificationOptions = {},
): Promise<DiscordDeliverySummary> {
  return deliverDiscordNotifications(
    env,
    progressDiscordDrafts(env, input),
    options,
  );
}

export async function dispatchDueDiscordNotifications(
  env: DiscordNotificationEnv,
  options: DiscordNotificationOptions = {},
): Promise<DiscordDeliverySummary> {
  const logger = options.logger ?? console;
  const nowDate = options.now ?? new Date();
  const now = nowDate.toISOString();
  const staleClaimCutoff = new Date(
    nowDate.getTime() - CLAIM_LEASE_MS,
  ).toISOString();
  const limit = Math.min(25, Math.max(1, options.limit ?? 25));
  try {
    await env.REPORTS.prepare(
      `UPDATE discord_notifications
          SET status='failed',claim_token=NULL,claimed_at=NULL,last_error='claim_expired_max_attempts',updated_at=?
        WHERE status='sending' AND attempt_count>=? AND COALESCE(claimed_at,updated_at)<=?`,
    )
      .bind(now, MAX_ATTEMPTS, staleClaimCutoff)
      .run();
    const ready = await env.REPORTS.prepare(
      `SELECT id,dedupe_key,kind,destination_kind,destination_ref,content,status,attempt_count
         FROM discord_notifications
        WHERE attempt_count<? AND (
          (status IN ('pending','retry') AND next_attempt_at<=?)
          OR (status='sending' AND COALESCE(claimed_at,updated_at)<=?)
        )
        ORDER BY next_attempt_at ASC,created_at ASC LIMIT ?`,
    )
      .bind(MAX_ATTEMPTS, now, staleClaimCutoff, limit)
      .all<NotificationRow>();
    return deliverRows(env, ready.results ?? [], options, nowDate);
  } catch {
    safeLog(logger, "error", "discord_notifications_dispatch_failed", {
      category: "queue",
    });
    return { notified: false, sent: 0, failed: 0, skipped: 0 };
  }
}
