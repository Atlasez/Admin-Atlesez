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
  created_at: string;
};

const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 5 * 60_000;
const CLAIM_LEASE_MS = 15 * 60_000;
const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
      missing: [
        !apiKey ? "RESEND_API_KEY" : null,
        !from ? "EMAIL_FROM" : null,
      ].filter(Boolean),
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
  const staleClaimCutoff = new Date(
    nowDate.getTime() - CLAIM_LEASE_MS,
  ).toISOString();
  const idempotencyWindowCutoff = new Date(
    nowDate.getTime() - IDEMPOTENCY_WINDOW_MS,
  ).toISOString();
  // 応募が短時間に集中してもキューを滞留させない。claim_tokenと
  // 条件付きUPDATEがあるため、複数の起動が同じ配信を二重送信することはない。
  // 15分を過ぎたsending claimを回収し、冪等性キーの保持期間内だけ再送する。
  // created_atは最初のprovider request以前なので、24時間超の可能性がある
  // sending/retryは自動送信せず、運営確認が必要な失敗として残す。
  const limit = Math.min(100, Math.max(1, options.limit ?? 100));
  const outsideIdempotencyWindow = (await env.REPORTS.prepare(
    `UPDATE atlasez_application_email_deliveries
        SET status='failed',claim_token=NULL,claimed_at=NULL,
            last_error='provider_idempotency_window_expired',updated_at=?
      WHERE status IN ('sending','retry','pending') AND attempt_count>0
        AND created_at<=?
        AND (status!='sending' OR COALESCE(claimed_at,updated_at)<=?)`,
  )
    .bind(now, idempotencyWindowCutoff, staleClaimCutoff)
    .run()) as { meta?: { changes?: number } };
  let failed = Number(outsideIdempotencyWindow.meta?.changes ?? 0);
  if (failed)
    safeLog(
      logger,
      "error",
      "application_email_attempts_past_idempotency_window",
      { count: failed },
    );

  const expiredClaims = (await env.REPORTS.prepare(
    `UPDATE atlasez_application_email_deliveries
        SET status='failed',claim_token=NULL,claimed_at=NULL,
            last_error='claim_expired_max_attempts',updated_at=?
      WHERE status='sending' AND attempt_count>=?
        AND COALESCE(claimed_at,updated_at)<=?`,
  )
    .bind(now, MAX_ATTEMPTS, staleClaimCutoff)
    .run()) as { meta?: { changes?: number } };
  const exhaustedCount = Number(expiredClaims.meta?.changes ?? 0);
  failed += exhaustedCount;
  if (exhaustedCount)
    safeLog(logger, "error", "application_email_stale_claims_exhausted", {
      count: exhaustedCount,
    });

  const ready = await env.REPORTS.prepare(
    `SELECT id,recipient_email,subject,text_body,html_body,attempt_count,created_at
       FROM atlasez_application_email_deliveries
      WHERE attempt_count<? AND (
        (status='pending' AND next_attempt_at<=?)
        OR (status='retry' AND next_attempt_at<=? AND created_at>?)
        OR (status='sending' AND created_at>?
            AND COALESCE(claimed_at,updated_at)<=?)
      )
      ORDER BY CASE WHEN status='sending' THEN COALESCE(claimed_at,updated_at) ELSE next_attempt_at END ASC,
               created_at ASC LIMIT ?`,
  )
    .bind(
      MAX_ATTEMPTS,
      now,
      now,
      idempotencyWindowCutoff,
      idempotencyWindowCutoff,
      staleClaimCutoff,
      limit,
    )
    .all<Delivery>();
  let sent = 0;
  for (const delivery of ready.results ?? []) {
    if (!EMAIL_PATTERN.test(delivery.recipient_email)) {
      await env.REPORTS.prepare(
        "UPDATE atlasez_application_email_deliveries SET status='failed',last_error='invalid_recipient',updated_at=? WHERE id=?",
      )
        .bind(now, delivery.id)
        .run();
      failed += 1;
      continue;
    }
    const claimToken = crypto.randomUUID();
    const claim = (await env.REPORTS.prepare(
      `UPDATE atlasez_application_email_deliveries
          SET status='sending',claim_token=?,claimed_at=?,attempt_count=attempt_count+1,updated_at=?
        WHERE id=? AND attempt_count<? AND (
          (status='pending' AND next_attempt_at<=?)
          OR (status='retry' AND next_attempt_at<=? AND created_at>?)
          OR (status='sending' AND created_at>?
              AND COALESCE(claimed_at,updated_at)<=?)
        )`,
    )
      .bind(
        claimToken,
        now,
        now,
        delivery.id,
        MAX_ATTEMPTS,
        now,
        now,
        idempotencyWindowCutoff,
        idempotencyWindowCutoff,
        staleClaimCutoff,
      )
      .run()) as { meta?: { changes?: number } };
    if (claim.meta?.changes !== 1) continue;
    try {
      const response = await sendEmail(env, delivery, options.fetcher ?? fetch);
      if (!response.ok) {
        const nextAttempt = delivery.attempt_count + 1;
        const canRetry =
          retryableStatus(response.status) && nextAttempt < MAX_ATTEMPTS;
        await env.REPORTS.prepare(
          `UPDATE atlasez_application_email_deliveries
              SET status=?,next_attempt_at=?,last_error=?,claim_token=NULL,claimed_at=NULL,updated_at=?
            WHERE id=? AND status='sending' AND claim_token=?`,
        )
          .bind(
            canRetry ? "retry" : "failed",
            canRetry
              ? new Date(nowDate.getTime() + RETRY_DELAY_MS).toISOString()
              : now,
            `provider_${response.status}`,
            now,
            delivery.id,
            claimToken,
          )
          .run();
        failed += 1;
        continue;
      }
      await env.REPORTS.prepare(
        `UPDATE atlasez_application_email_deliveries
            SET status='sent',sent_at=?,claim_token=NULL,claimed_at=NULL,last_error='',updated_at=?
          WHERE id=? AND status='sending' AND claim_token=?`,
      )
        .bind(now, now, delivery.id, claimToken)
        .run();
      sent += 1;
    } catch (error) {
      const nextAttempt = delivery.attempt_count + 1;
      const canRetry = nextAttempt < MAX_ATTEMPTS;
      const category =
        error instanceof DOMException && error.name === "AbortError"
          ? "timeout"
          : "network_or_provider";
      await env.REPORTS.prepare(
        `UPDATE atlasez_application_email_deliveries
            SET status=?,next_attempt_at=?,last_error=?,claim_token=NULL,claimed_at=NULL,updated_at=?
          WHERE id=? AND status='sending' AND claim_token=?`,
      )
        .bind(
          canRetry ? "retry" : "failed",
          canRetry
            ? new Date(nowDate.getTime() + RETRY_DELAY_MS).toISOString()
            : now,
          category,
          now,
          delivery.id,
          claimToken,
        )
        .run();
      failed += 1;
    }
  }
  return { sent, failed, skipped: false };
}
