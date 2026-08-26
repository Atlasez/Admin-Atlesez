type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<unknown>;
  all<T>(): Promise<{ results: T[] }>;
};

type D1Database = {
  prepare(query: string): D1Statement;
};

export type ApplicationEmailDeliveryEnv = {
  REPORTS: D1Database;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
};

export type ApplicationEmailDeliveryOptions = {
  now?: Date;
  fetcher?: (input: string, init?: RequestInit) => Promise<Response>;
  logger?: Pick<Console, "info" | "error">;
  limit?: number;
};

type Delivery = {
  id: string;
  recipient_email: string;
  subject: string;
  text_body: string;
  html_body: string;
  attempt_count: number;
};

const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 5 * 60_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const safeLog = (
  logger: Pick<Console, "info" | "error">,
  level: "info" | "error",
  event: string,
  fields: Record<string, unknown> = {},
) => logger[level](JSON.stringify({ event, ...fields }));

const retryableStatus = (status: number) =>
  status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;

const sendEmail = async (
  env: ApplicationEmailDeliveryEnv,
  delivery: Delivery,
  fetcher: (input: string, init?: RequestInit) => Promise<Response>,
) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
        "Idempotency-Key": `atlasez-application-${delivery.id}`,
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [delivery.recipient_email],
        subject: delivery.subject,
        text: delivery.text_body,
        html: delivery.html_body,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

export async function dispatchApplicationEmails(
  env: ApplicationEmailDeliveryEnv,
  options: ApplicationEmailDeliveryOptions = {},
) {
  const logger = options.logger ?? console;
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    safeLog(logger, "info", "application_email_delivery_disabled", {
      missing: [!apiKey ? "RESEND_API_KEY" : null, !from ? "EMAIL_FROM" : null].filter(Boolean),
    });
    return { sent: 0, failed: 0, skipped: true };
  }
  const sender = from.match(/<([^>]+)>/)?.[1] ?? from;
  if (!EMAIL_PATTERN.test(sender)) {
    safeLog(logger, "error", "application_email_sender_invalid");
    return { sent: 0, failed: 0, skipped: true };
  }
  const nowDate = options.now ?? new Date();
  const now = nowDate.toISOString();
  // 応募が短時間に集中してもキューを滞留させない。claim_tokenと
  // 条件付きUPDATEがあるため、複数の起動が同じ配信を二重送信することはない。
  const limit = Math.min(100, Math.max(1, options.limit ?? 100));
  const ready = await env.REPORTS.prepare(
    `SELECT id,recipient_email,subject,text_body,html_body,attempt_count
       FROM atlasez_application_email_deliveries
      WHERE status IN ('pending','retry') AND next_attempt_at<=? AND attempt_count<?
      ORDER BY next_attempt_at ASC,created_at ASC LIMIT ?`,
  ).bind(now, MAX_ATTEMPTS, limit).all<Delivery>();
  let sent = 0;
  let failed = 0;
  for (const delivery of ready.results ?? []) {
    if (!EMAIL_PATTERN.test(delivery.recipient_email)) {
      await env.REPORTS.prepare(
        "UPDATE atlasez_application_email_deliveries SET status='failed',last_error='invalid_recipient',updated_at=? WHERE id=?",
      ).bind(now, delivery.id).run();
      failed += 1;
      continue;
    }
    const claimToken = crypto.randomUUID();
    const claim = (await env.REPORTS.prepare(
      `UPDATE atlasez_application_email_deliveries
          SET status='sending',claim_token=?,claimed_at=?,attempt_count=attempt_count+1,updated_at=?
        WHERE id=? AND status IN ('pending','retry') AND attempt_count<?
          AND next_attempt_at<=?`,
    ).bind(claimToken, now, now, delivery.id, MAX_ATTEMPTS, now).run()) as { meta?: { changes?: number } };
    if (claim.meta?.changes !== 1) continue;
    try {
      const response = await sendEmail(env, delivery, options.fetcher ?? fetch);
      if (!response.ok) {
        const nextAttempt = delivery.attempt_count + 1;
        const canRetry = retryableStatus(response.status) && nextAttempt < MAX_ATTEMPTS;
        await env.REPORTS.prepare(
          `UPDATE atlasez_application_email_deliveries
              SET status=?,next_attempt_at=?,last_error=?,claim_token=NULL,claimed_at=NULL,updated_at=?
            WHERE id=? AND status='sending' AND claim_token=?`,
        ).bind(
          canRetry ? "retry" : "failed",
          canRetry ? new Date(nowDate.getTime() + RETRY_DELAY_MS).toISOString() : now,
          `provider_${response.status}`,
          now,
          delivery.id,
          claimToken,
        ).run();
        failed += 1;
        continue;
      }
      await env.REPORTS.prepare(
        `UPDATE atlasez_application_email_deliveries
            SET status='sent',sent_at=?,claim_token=NULL,claimed_at=NULL,last_error='',updated_at=?
          WHERE id=? AND status='sending' AND claim_token=?`,
      ).bind(now, now, delivery.id, claimToken).run();
      sent += 1;
    } catch (error) {
      const nextAttempt = delivery.attempt_count + 1;
      const canRetry = nextAttempt < MAX_ATTEMPTS;
      const category = error instanceof DOMException && error.name === "AbortError" ? "timeout" : "network_or_provider";
      await env.REPORTS.prepare(
        `UPDATE atlasez_application_email_deliveries
            SET status=?,next_attempt_at=?,last_error=?,claim_token=NULL,claimed_at=NULL,updated_at=?
          WHERE id=? AND status='sending' AND claim_token=?`,
      ).bind(
        canRetry ? "retry" : "failed",
        canRetry ? new Date(nowDate.getTime() + RETRY_DELAY_MS).toISOString() : now,
        category,
        now,
        delivery.id,
        claimToken,
      ).run();
      failed += 1;
    }
  }
  return { sent, failed, skipped: false };
}
