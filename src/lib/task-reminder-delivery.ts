import {
  isValidTimeZone,
  localDateTimeToEpoch,
  nextRepeatedLocalDateTime,
} from "./date-time";

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<unknown>;
  all<T>(): Promise<{ results: T[] }>;
};

type D1Database = {
  prepare(query: string): D1Statement;
  batch<T = unknown>(statements: D1Statement[]): Promise<T[]>;
};

export type TaskReminderDeliveryEnv = {
  REPORTS: D1Database;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
};

export type TaskReminderDeliveryOptions = {
  now?: Date;
  fetcher?: (input: string, init?: RequestInit) => Promise<Response>;
  logger?: Pick<Console, "info" | "error">;
  limit?: number;
};

type ReminderCandidate = {
  reminder_id: string;
  title: string;
  details: string | null;
  due_at: string | null;
  due_timezone: string;
  remind_at: string;
  timezone: string;
  remind_at_utc: string;
  label: string;
  repeat: string;
  recipient_email: string;
};

type DeliveryAttempt = {
  delivery_key: string;
  reminder_id: string;
  recipient_email: string;
  occurrence_at: string;
  occurrence_timezone: string;
  payload_json: string;
  provider_idempotency_key: string;
  attempt_count: number;
  retry_deadline_at: string;
  remind_at: string;
  timezone: string;
  repeat: string;
};

const MAX_ATTEMPTS = 5;
const CLAIM_LEASE_MS = 15 * 60 * 1_000;
const RETRY_DELAYS_MS = [
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  6 * 60 * 60_000,
];
const RETRY_WINDOW_MS = 23 * 60 * 60_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const safeLog = (
  logger: Pick<Console, "info" | "error">,
  level: "info" | "error",
  event: string,
  fields: Record<string, unknown> = {},
) => {
  logger[level](JSON.stringify({ event, ...fields }));
};

const emailSafe = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] ?? character,
  );

const digest = async (value: string) => {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const isRetryableStatus = (status: number) =>
  status === 408 ||
  status === 409 ||
  status === 425 ||
  status === 429 ||
  status >= 500;

const reminderEpoch = (value: string, timezone: string) => {
  try {
    return localDateTimeToEpoch(value, timezone);
  } catch {
    return Number.NaN;
  }
};

async function normalizeReminderInstants(
  env: TaskReminderDeliveryEnv,
  now: string,
  logger: Pick<Console, "info" | "error">,
) {
  const result = await env.REPORTS.prepare(
    "SELECT id,remind_at,timezone FROM editorial_task_reminders WHERE remind_at_utc IS NULL LIMIT 500",
  ).all<{ id: string; remind_at: string; timezone: string }>();
  const updates = [] as D1Statement[];
  for (const row of result.results ?? []) {
    const epoch = reminderEpoch(row.remind_at, row.timezone);
    if (!Number.isFinite(epoch)) {
      safeLog(logger, "error", "task_reminder_invalid_time", {
        reminderId: row.id,
        category: "invalid_time",
      });
      continue;
    }
    updates.push(
      env.REPORTS.prepare(
        "UPDATE editorial_task_reminders SET remind_at_utc=? WHERE id=? AND remind_at=? AND timezone=? AND remind_at_utc IS NULL",
      ).bind(
        new Date(epoch).toISOString(),
        row.id,
        row.remind_at,
        row.timezone,
      ),
    );
  }
  if (updates.length) await env.REPORTS.batch(updates);
  safeLog(logger, "info", "task_reminder_normalized", {
    count: updates.length,
    at: now,
  });
}

const buildPayload = (
  row: ReminderCandidate,
  from: string,
): Record<string, unknown> => {
  const dueLabel = row.due_at
    ? `${row.due_at.replace("T", " ")} (${row.due_timezone})`
    : "期限未設定";
  return {
    from,
    to: [row.recipient_email],
    subject: `ToDoリマインダー：${row.title}`,
    text: `AtlasezのToDoリマインダーです。\n\n${row.title}\nリマインダー：${row.label || "設定した日時"}\n期限：${dueLabel}${row.details ? `\n\n${row.details}` : ""}`,
    html: `<h2>ToDoリマインダー</h2><p><b>${emailSafe(row.title)}</b></p><p>リマインダー：${emailSafe(row.label || "設定した日時")}<br>期限：${emailSafe(dueLabel)}</p>${row.details ? `<pre>${emailSafe(row.details)}</pre>` : ""}`,
  };
};

async function createOccurrenceAttempt(
  env: TaskReminderDeliveryEnv,
  row: ReminderCandidate,
  payload: Record<string, unknown>,
  now: string,
  deadline: string,
) {
  const occurrenceKey = `${row.reminder_id}|${row.remind_at_utc}|${row.recipient_email}`;
  const keyHash = await digest(occurrenceKey);
  const deliveryKey = `v1:${keyHash}`;
  const providerKey = `atlasez-reminder-${keyHash.slice(0, 48)}`;
  await env.REPORTS.prepare(
    `INSERT OR IGNORE INTO editorial_task_reminder_delivery_attempts
       (delivery_key,reminder_id,recipient_email,occurrence_at,occurrence_timezone,payload_json,provider_idempotency_key,status,attempt_count,next_attempt_at,retry_deadline_at,created_at,updated_at)
       SELECT ?,r.id,?,?,?,?,?,'pending',0,?,?,?,?
       FROM editorial_task_reminders r JOIN editorial_tasks t ON t.id=r.task_id
       WHERE r.id=? AND r.remind_at_utc=? AND r.remind_at_utc<=?
         AND t.status!='done' AND lower(trim(t.reminder_email))=lower(?)`,
  )
    .bind(
      deliveryKey,
      row.recipient_email,
      row.remind_at_utc,
      row.timezone,
      JSON.stringify(payload),
      providerKey,
      now,
      deadline,
      now,
      now,
      row.reminder_id,
      row.remind_at_utc,
      now,
      row.recipient_email,
    )
    .run();
}

async function claimAttempt(
  env: TaskReminderDeliveryEnv,
  attempt: DeliveryAttempt,
  now: string,
  leaseCutoff: string,
) {
  const claimToken = crypto.randomUUID();
  const result = (await env.REPORTS.prepare(
    `UPDATE editorial_task_reminder_delivery_attempts AS a
       SET status='sending',claim_token=?,claimed_at=?,attempt_count=attempt_count+1,updated_at=?
       WHERE a.delivery_key=? AND a.attempt_count<? AND a.retry_deadline_at>?
         AND ((a.status IN ('pending','retry') AND a.next_attempt_at<=?)
              OR (a.status='sending' AND a.claimed_at<=?))
         AND EXISTS (
           SELECT 1 FROM editorial_task_reminders r
           JOIN editorial_tasks t ON t.id=r.task_id
           WHERE r.id=a.reminder_id AND r.remind_at_utc=a.occurrence_at
             AND r.remind_at_utc<=? AND t.status!='done'
             AND lower(trim(t.reminder_email))=lower(a.recipient_email)
         )`,
  )
    .bind(
      claimToken,
      now,
      now,
      attempt.delivery_key,
      MAX_ATTEMPTS,
      now,
      now,
      leaseCutoff,
      now,
    )
    .run()) as { meta?: { changes?: number } };
  return result.meta?.changes === 1 ? claimToken : null;
}

async function sendProvider(
  env: TaskReminderDeliveryEnv,
  attempt: DeliveryAttempt,
  fetcher: (input: string, init?: RequestInit) => Promise<Response>,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
        "Idempotency-Key": attempt.provider_idempotency_key,
      },
      body: attempt.payload_json,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function finalizeSuccess(
  env: TaskReminderDeliveryEnv,
  attempt: DeliveryAttempt,
  claimToken: string,
  now: string,
) {
  let nextWall: string | null = null;
  let nextUtc: string | null = null;
  if (["daily", "weekly", "monthly"].includes(attempt.repeat)) {
    nextWall = nextRepeatedLocalDateTime(
      attempt.remind_at,
      attempt.repeat as "daily" | "weekly" | "monthly",
      attempt.timezone,
      Date.parse(now),
    );
    if (nextWall) {
      const epoch = reminderEpoch(nextWall, attempt.timezone);
      if (Number.isFinite(epoch)) nextUtc = new Date(epoch).toISOString();
      else nextWall = null;
    }
  }
  const reminderUpdate = nextWall
    ? env.REPORTS.prepare(
        `UPDATE editorial_task_reminders SET remind_at=?,remind_at_utc=?,notified_at=NULL
           WHERE id=? AND remind_at_utc=? AND EXISTS (
             SELECT 1 FROM editorial_task_reminder_delivery_attempts
             WHERE delivery_key=? AND claim_token=? AND status='sending'
           )`,
      ).bind(
        nextWall,
        nextUtc,
        attempt.reminder_id,
        attempt.occurrence_at,
        attempt.delivery_key,
        claimToken,
      )
    : env.REPORTS.prepare(
        `UPDATE editorial_task_reminders SET notified_at=?
           WHERE id=? AND remind_at_utc=? AND EXISTS (
             SELECT 1 FROM editorial_task_reminder_delivery_attempts
             WHERE delivery_key=? AND claim_token=? AND status='sending'
           )`,
      ).bind(
        now,
        attempt.reminder_id,
        attempt.occurrence_at,
        attempt.delivery_key,
        claimToken,
      );
  const results = (await env.REPORTS.batch([
    reminderUpdate,
    env.REPORTS.prepare(
      "UPDATE editorial_task_reminder_delivery_attempts SET status='sent',sent_at=?,claim_token=NULL,claimed_at=NULL,provider_message_id=NULL,error_category=NULL,updated_at=? WHERE delivery_key=? AND status='sending' AND claim_token=?",
    ).bind(now, now, attempt.delivery_key, claimToken),
  ])) as Array<{ meta?: { changes?: number } }>;
  if (results[1]?.meta?.changes !== 1)
    throw new Error("Reminder delivery claim was lost before finalize");
}

async function recordFailure(
  env: TaskReminderDeliveryEnv,
  attempt: DeliveryAttempt,
  claimToken: string,
  nowDate: Date,
  category: string,
  retryable: boolean,
) {
  const nextAttempt = attempt.attempt_count + 1;
  const retryAt = new Date(
    nowDate.getTime() +
      (RETRY_DELAYS_MS[nextAttempt - 1] ?? RETRY_DELAYS_MS.at(-1)!),
  ).toISOString();
  const canRetry =
    retryable &&
    nextAttempt < MAX_ATTEMPTS &&
    retryAt < attempt.retry_deadline_at;
  await env.REPORTS.prepare(
    `UPDATE editorial_task_reminder_delivery_attempts
       SET status=?,next_attempt_at=?,claim_token=NULL,claimed_at=NULL,error_category=?,updated_at=?
       WHERE delivery_key=? AND status='sending' AND claim_token=?`,
  )
    .bind(
      canRetry ? "retry" : "failed",
      canRetry ? retryAt : attempt.retry_deadline_at,
      category,
      nowDate.toISOString(),
      attempt.delivery_key,
      claimToken,
    )
    .run();
}

export async function dispatchDueTaskReminders(
  env: TaskReminderDeliveryEnv,
  options: TaskReminderDeliveryOptions = {},
) {
  const logger = options.logger ?? console;
  const nowDate = options.now ?? new Date();
  const now = nowDate.toISOString();
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    safeLog(logger, "error", "task_reminder_config_missing", {
      missing: [
        !apiKey ? "RESEND_API_KEY" : null,
        !from ? "EMAIL_FROM" : null,
      ].filter(Boolean),
    });
    throw new Error("Task reminder email configuration is incomplete");
  }
  if (!EMAIL_PATTERN.test(from.match(/<([^>]+)>/)?.[1] ?? from)) {
    safeLog(logger, "error", "task_reminder_config_invalid", {
      category: "email_from",
    });
    throw new Error("Task reminder email sender is invalid");
  }
  const fetcher = options.fetcher ?? fetch;
  const limit = Math.min(100, Math.max(1, options.limit ?? 50));
  safeLog(logger, "info", "task_reminder_cron_start", { at: now });
  await normalizeReminderInstants(env, now, logger);
  const candidates = await env.REPORTS.prepare(
    `SELECT r.id AS reminder_id,t.title,t.details,t.due_at,t.due_timezone,
              r.remind_at,r.timezone,r.remind_at_utc,r.label,
              CASE WHEN (SELECT COUNT(*) FROM editorial_task_reminders rr WHERE rr.task_id=r.task_id)=1 THEN COALESCE(t.reminder_repeat,'none') ELSE 'none' END AS repeat,
              lower(trim(t.reminder_email)) AS recipient_email
       FROM editorial_task_reminders r JOIN editorial_tasks t ON t.id=r.task_id
       WHERE t.status!='done' AND r.remind_at_utc IS NOT NULL AND r.remind_at_utc<=?
         AND lower(trim(t.reminder_email)) IS NOT NULL
       ORDER BY r.remind_at_utc ASC LIMIT ?`,
  )
    .bind(now, limit)
    .all<ReminderCandidate>();
  safeLog(logger, "info", "task_reminder_due_count", {
    count: candidates.results?.length ?? 0,
  });
  const deadline = new Date(nowDate.getTime() + RETRY_WINDOW_MS).toISOString();
  for (const row of candidates.results ?? []) {
    if (
      !EMAIL_PATTERN.test(row.recipient_email) ||
      !isValidTimeZone(row.timezone)
    ) {
      safeLog(logger, "error", "task_reminder_skipped", {
        reminderId: row.reminder_id,
        category: "invalid_recipient_or_timezone",
      });
      continue;
    }
    const payload = buildPayload(row, from);
    await createOccurrenceAttempt(env, row, payload, now, deadline);
  }
  const ready = await env.REPORTS.prepare(
    `SELECT a.delivery_key,a.reminder_id,a.recipient_email,a.occurrence_at,a.occurrence_timezone,a.payload_json,a.provider_idempotency_key,a.attempt_count,a.retry_deadline_at,
              r.remind_at,r.timezone,
              CASE WHEN (SELECT COUNT(*) FROM editorial_task_reminders rr WHERE rr.task_id=r.task_id)=1 THEN COALESCE(t.reminder_repeat,'none') ELSE 'none' END AS repeat
       FROM editorial_task_reminder_delivery_attempts a
       JOIN editorial_task_reminders r ON r.id=a.reminder_id
       JOIN editorial_tasks t ON t.id=r.task_id
       WHERE a.attempt_count<? AND a.retry_deadline_at>? AND r.remind_at_utc=a.occurrence_at
         AND r.remind_at_utc<=? AND t.status!='done'
         AND lower(trim(t.reminder_email))=lower(a.recipient_email)
         AND ((a.status IN ('pending','retry') AND a.next_attempt_at<=?)
              OR (a.status='sending' AND a.claimed_at<=?))
       ORDER BY a.next_attempt_at ASC LIMIT ?`,
  )
    .bind(
      MAX_ATTEMPTS,
      now,
      now,
      now,
      new Date(nowDate.getTime() - CLAIM_LEASE_MS).toISOString(),
      limit,
    )
    .all<DeliveryAttempt>();
  let sent = 0;
  let failed = 0;
  for (const attempt of ready.results ?? []) {
    const claimToken = await claimAttempt(
      env,
      attempt,
      now,
      new Date(nowDate.getTime() - CLAIM_LEASE_MS).toISOString(),
    );
    if (!claimToken) continue;
    safeLog(logger, "info", "task_reminder_claimed", {
      reminderId: attempt.reminder_id,
      attempt: attempt.attempt_count + 1,
    });
    try {
      const response = await sendProvider(env, attempt, fetcher);
      if (!response.ok) {
        const retryable = isRetryableStatus(response.status);
        await recordFailure(
          env,
          attempt,
          claimToken,
          nowDate,
          `provider_${response.status}`,
          retryable,
        );
        failed += 1;
        safeLog(logger, "error", "task_reminder_failed", {
          reminderId: attempt.reminder_id,
          category: `provider_${response.status}`,
          retryable,
        });
        continue;
      }
      await finalizeSuccess(env, attempt, claimToken, now);
      sent += 1;
      safeLog(logger, "info", "task_reminder_sent", {
        reminderId: attempt.reminder_id,
      });
    } catch (error) {
      const category =
        error instanceof DOMException && error.name === "AbortError"
          ? "timeout"
          : "network_or_database";
      if (category === "timeout" || category === "network_or_database") {
        try {
          await recordFailure(
            env,
            attempt,
            claimToken,
            nowDate,
            category,
            true,
          );
        } catch {
          // Keep the sending lease for a later reclaim when D1 itself is unavailable.
        }
      }
      failed += 1;
      safeLog(logger, "error", "task_reminder_failed", {
        reminderId: attempt.reminder_id,
        category,
      });
    }
  }
  safeLog(logger, "info", "task_reminder_cron_complete", { sent, failed });
  return { sent, failed };
}
