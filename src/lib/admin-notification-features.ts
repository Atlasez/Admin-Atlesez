import type { D1Database } from "./admin-database";
export const notificationKinds = [
  "comment",
  "mention",
  "application",
  "publication-review-returned",
  "publication-review",
  "publication-ready",
  "review",
  "feedback-request",
  "task-request",
  "approved",
  "published",
  "task-reminder",
] as const;
export const importantKinds = new Set<string>([
  "mention",
  "application",
  "publication-review-returned",
  "publication-review",
  "review",
  "feedback-request",
  "task-request",
  "task-reminder",
]);
export type NotificationPreferences = {
  available: boolean;
  mutedKinds: string[];
  summaryEnabled: boolean;
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
export async function loadNotificationPreferences(
  db: D1Database,
  email: string,
): Promise<NotificationPreferences> {
  const ready = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='admin_notification_preferences'",
    )
    .first();
  if (!ready) return { available: false, mutedKinds: [], summaryEnabled: true };
  const row = await db
    .prepare(
      "SELECT muted_kinds,summary_enabled FROM admin_notification_preferences WHERE email=?",
    )
    .bind(email.toLowerCase())
    .first<{ muted_kinds: string; summary_enabled: number }>();
  return {
    available: true,
    mutedKinds: row ? JSON.parse(row.muted_kinds) : [],
    summaryEnabled: row ? Boolean(row.summary_enabled) : true,
  };
}
export function notificationSourceMetadata(sql: string) {
  if (sql.includes("FROM editorial_task_reminders"))
    return {
      id: "'task-reminder-rule-' || s.reminder_id || '-' || s.remind_at",
      time: "remind_at",
      kind: "'task-reminder'",
      dueReminder: true,
    };
  const definitions = [
    ["instr(c.body, ?) > 0", "mention", "created_at"],
    ["d.created_by = ? AND c.created_by != ?", "comment", "created_at"],
    ["FROM atlasez_member_applications", "application", "created_at"],
    [
      "FROM editorial_publication_reviews",
      "publication-review-returned",
      "created_at",
    ],
    ["publication_review_stage", "publication-review", "updated_at"],
    ["publication_pr_number IS NULL", "publication-ready", "updated_at"],
    ["FROM editorial_review_assignments", "review", "updated_at"],
    ["JOIN editorial_review_assignments", "review", "updated_at"],
    ["status = 'approved'", "approved", "updated_at"],
    ["published_at IS NOT NULL", "published", "published_at"],
  ] as const;
  if (sql.includes("FROM editorial_tasks t"))
    return {
      id: "CASE WHEN s.task_kind='feedback' THEN 'feedback-request-' ELSE 'task-request-' END || s.id",
      time: "updated_at",
      kind: "CASE WHEN s.task_kind='feedback' THEN 'feedback-request' ELSE 'task-request' END",
    };
  for (const [trigger, kind, time] of definitions) {
    if (!sql.includes(trigger)) continue;
    const id =
      kind === "publication-review-returned"
        ? "'publication-review-returned-' || s.id || '-' || s.created_at"
        : kind === "publication-review"
          ? "'publication-review-' || s.id || '-' || s.publication_review_stage"
          : `'${kind}-' || s.id`;
    return { id, time, kind: `'${kind}'` };
  }
  return null;
}
export function notificationFeatureFilter(
  metadata: { id: string; kind: string },
  preferences: NotificationPreferences,
  params: URLSearchParams,
  email: string,
  now: string,
) {
  const conditions: string[] = [],
    values: unknown[] = [];
  if (preferences.available) {
    conditions.push(
      `NOT EXISTS(SELECT 1 FROM json_each(?) muted WHERE muted.value=${metadata.kind})`,
    );
    values.push(JSON.stringify(preferences.mutedKinds));
    const snoozed = `EXISTS(SELECT 1 FROM admin_notification_snoozes ns WHERE ns.email=? AND ns.notification_id=${metadata.id} AND ns.until_at>?)`;
    conditions.push(
      params.get("snoozedOnly") === "true" ? snoozed : `NOT ${snoozed}`,
    );
    values.push(email.toLowerCase(), now);
  }
  if (params.get("importance") === "important") {
    conditions.push(
      `${metadata.kind} IN (${[...importantKinds].map(() => "?").join(",")})`,
    );
    values.push(...importantKinds);
  }
  return {
    sql: conditions.length
      ? conditions.map((s) => `(${s})`).join(" AND ") + " AND "
      : "",
    values,
  };
}
export async function handleNotificationFeatures(
  request: Request,
  db: D1Database,
  email: string,
): Promise<Response> {
  const preferences = await loadNotificationPreferences(db, email);
  if (!preferences.available)
    return json(
      {
        error:
          "通知設定の準備が完了していません。管理者にmigration 0122の適用状況を確認してください。",
      },
      503,
    );
  const path = new URL(request.url).pathname;
  if (request.method === "GET" && path.endsWith("/preferences"))
    return json(preferences);
  if (new URL(request.url).origin !== request.headers.get("origin"))
    return json({ error: "許可されていない送信元です。" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json"))
    return json({ error: "JSON形式で送信してください。" }, 415);
  const payload = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!payload) return json({ error: "入力内容を読み取れませんでした。" }, 400);
  const now = new Date().toISOString();
  if (path.endsWith("/preferences") && request.method === "PUT") {
    if (
      !Array.isArray(payload.mutedKinds) ||
      payload.mutedKinds.length > notificationKinds.length ||
      payload.mutedKinds.some(
        (kind) =>
          typeof kind !== "string" ||
          !notificationKinds.some((value) => value === kind),
      ) ||
      typeof payload.summaryEnabled !== "boolean"
    )
      return json({ error: "通知設定を確認してください。" }, 400);
    await db
      .prepare(
        "INSERT INTO admin_notification_preferences (email,muted_kinds,summary_enabled,updated_at) VALUES (?,?,?,?) ON CONFLICT(email) DO UPDATE SET muted_kinds=excluded.muted_kinds,summary_enabled=excluded.summary_enabled,updated_at=excluded.updated_at",
      )
      .bind(
        email.toLowerCase(),
        JSON.stringify([...new Set(payload.mutedKinds)]),
        payload.summaryEnabled ? 1 : 0,
        now,
      )
      .run();
    return json({ ok: true });
  }
  if (path.endsWith("/snooze") && request.method === "POST") {
    const id = typeof payload.id === "string" ? payload.id : "";
    if (
      !/^(comment|mention|approved|published|publication-ready|review|publication-review|publication-review-returned|application|feedback-request|task-request|task-reminder|task-reminder-rule)-[a-zA-Z0-9:._+\-]{8,}$/.test(
        id,
      ) ||
      id.length > 512
    )
      return json({ error: "通知IDを確認してください。" }, 400);
    const until =
      payload.until === null
        ? null
        : typeof payload.until === "string"
          ? new Date(payload.until)
          : null;
    if (
      payload.until !== null &&
      (!until ||
        !Number.isFinite(until.getTime()) ||
        until.getTime() <= Date.now() ||
        until.getTime() > Date.now() + 30 * 86400000)
    )
      return json(
        { error: "再表示は現在から30日以内に指定してください。" },
        400,
      );
    await db
      .prepare(
        "INSERT INTO admin_notification_snoozes (email,notification_id,until_at,updated_at) VALUES (?,?,?,?) ON CONFLICT(email,notification_id) DO UPDATE SET until_at=excluded.until_at,updated_at=excluded.updated_at",
      )
      .bind(email.toLowerCase(), id, until?.toISOString() ?? now, now)
      .run();
    return json({ ok: true });
  }
  return json({ error: "利用できない操作です。" }, 405);
}
