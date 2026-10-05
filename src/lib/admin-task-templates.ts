import { Temporal } from "@js-temporal/polyfill";
import type { D1Database } from "./admin-database";
import {
  nextTemplateOccurrence,
  scheduleInstant,
  templateDeadline,
  type Schedule,
} from "./task-template-schedule";

export type MemberToolContext = {
  db: D1Database;
  email: string;
  primaryEmail: string;
  projects: Array<{ id: string; name: string; role: string }>;
};
export type TaskTemplate = {
  id: string;
  owner_email: string;
  project_id: string;
  name: string;
  title: string;
  details: string;
  assignees_json: string;
  timezone: string;
  schedule: Schedule;
  anchor_at: string | null;
  due_after_days: number | null;
  enabled: number;
  next_run_at: string | null;
  last_task_id: string | null;
  last_generated_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const schedules = new Set<Schedule>(["none", "daily", "weekly", "monthly"]);
class TemplateUnavailableError extends Error {}
const authoritySql = `(lower(t.owner_email)=lower(?) OR EXISTS(SELECT 1 FROM report_admin_permissions p WHERE lower(p.email)=lower(t.owner_email) AND p.subject='*') OR EXISTS(SELECT 1 FROM atlasez_project_memberships m WHERE m.project_id=t.project_id AND lower(m.email)=lower(t.owner_email) AND (m.role='manager' OR (m.role='member' AND json_array_length(t.assignees_json)=1 AND NOT EXISTS(SELECT 1 FROM json_each(t.assignees_json) a WHERE lower(a.value)<>lower(t.owner_email))))))
  AND NOT EXISTS(SELECT 1 FROM atlasez_project_member_lifecycle l WHERE l.project_id=t.project_id AND lower(l.email)=lower(t.owner_email) AND l.state!='active')
  AND NOT (t.project_id='atlas' AND EXISTS(SELECT 1 FROM admin_member_lifecycle archived WHERE lower(archived.email)=lower(t.owner_email) AND archived.status='archived'))
  AND NOT EXISTS(SELECT 1 FROM json_each(t.assignees_json) a WHERE NOT EXISTS(SELECT 1 FROM atlasez_project_memberships m LEFT JOIN atlasez_project_member_lifecycle l ON l.project_id=m.project_id AND lower(l.email)=lower(m.email) WHERE m.project_id=t.project_id AND lower(m.email)=lower(a.value) AND COALESCE(l.state,'active')='active' AND NOT EXISTS(SELECT 1 FROM admin_member_lifecycle archived WHERE t.project_id='atlas' AND lower(archived.email)=lower(m.email) AND archived.status='archived')))`;
export async function templateTaskId(id: string, run: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${id}:${run}`),
    ),
  ).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 128;
  bytes[8] = (bytes[8] & 63) | 128;
  const value = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
export async function createTemplateTask(
  db: D1Database,
  row: TaskTemplate,
  primary: string,
  now: string,
  run: string,
  scheduled = false,
) {
  const occurrence = scheduled ? row.next_run_at! : now;
  const taskId = await templateTaskId(row.id, run);
  const dueAt =
    row.due_after_days === null
      ? null
      : templateDeadline(occurrence, row.timezone, row.due_after_days);
  const next =
    scheduled && row.schedule !== "none"
      ? nextTemplateOccurrence(row.anchor_at!, row.timezone, row.schedule, now)
      : row.next_run_at;
  const guard = `t.id=? AND t.updated_at=?${scheduled ? " AND t.enabled=1 AND t.next_run_at=?" : ""} AND ${authoritySql}`;
  const guardValues = [
    row.id,
    row.updated_at,
    ...(scheduled ? [row.next_run_at] : []),
    primary,
  ];
  const statements = [
    db
      .prepare(
        `INSERT OR IGNORE INTO editorial_tasks (id,project_id,assignee_email,title,details,status,due_at,due_timezone,created_by,created_at,updated_at)
    SELECT ?,t.project_id,(SELECT group_concat(value,',') FROM json_each(t.assignees_json)),t.title,t.details,'open',?,t.timezone,t.owner_email,?,? FROM editorial_task_templates t WHERE ${guard}`,
      )
      .bind(taskId, dueAt, now, now, ...guardValues),
    db
      .prepare(
        `UPDATE editorial_task_templates AS t SET last_task_id=?,last_generated_at=?,last_error=NULL${scheduled ? ",next_run_at=?" : ""} WHERE ${guard} AND EXISTS(SELECT 1 FROM editorial_tasks WHERE id=?)`,
      )
      .bind(taskId, now, ...(scheduled ? [next] : []), ...guardValues, taskId),
  ];
  const result = await db.batch(statements);
  const task = await db
    .prepare(
      "SELECT id FROM editorial_tasks WHERE id=? AND lower(created_by)=lower(?)",
    )
    .bind(taskId, row.owner_email)
    .first<{ id: string }>();
  if (!task)
    throw new TemplateUnavailableError(
      "テンプレートが変更されたか、作成権限または担当者の所属を確認できませんでした。",
    );
  return {
    taskId,
    created: Number(result[0]?.meta?.changes ?? 0) > 0,
    nextRunAt: next,
  };
}
export async function dispatchTaskTemplates(
  db: D1Database,
  primaryEmail: string,
  now = new Date(),
) {
  const timestamp = now.toISOString();
  const ready = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='editorial_task_templates'",
    )
    .first();
  if (!ready) return { created: 0, failed: 0, skipped: true };
  const rows = await db
    .prepare(
      "SELECT * FROM editorial_task_templates WHERE enabled=1 AND schedule<>'none' AND next_run_at<=? ORDER BY next_run_at,id LIMIT 25",
    )
    .bind(timestamp)
    .all<TaskTemplate>();
  let created = 0,
    failed = 0;
  for (const row of rows.results) {
    try {
      const result = await createTemplateTask(
        db,
        row,
        primaryEmail,
        timestamp,
        `scheduled:${row.next_run_at}`,
        true,
      );
      if (result.created) created++;
    } catch (error) {
      failed++;
      if (!(error instanceof TemplateUnavailableError)) {
        console.error(
          JSON.stringify({
            event: "task_template_dispatch_failed",
            templateId: row.id,
          }),
        );
        continue;
      }
      await db
        .prepare(
          "UPDATE editorial_task_templates SET enabled=0,last_error=? WHERE id=? AND updated_at=? AND next_run_at=?",
        )
        .bind(
          "作成を停止しました。権限・担当者・日時を確認して再開してください。",
          row.id,
          row.updated_at,
          row.next_run_at,
        )
        .run();
    }
  }
  return { created, failed };
}
export async function handleTaskTemplates(
  request: Request,
  context: MemberToolContext,
): Promise<Response> {
  const { db, email, projects } = context;
  const ready = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='editorial_task_templates'",
    )
    .first();
  if (!ready)
    return json(
      {
        error:
          "タスクテンプレートの準備が完了していません。管理者にmigration 0121の適用状況を確認してください。",
      },
      503,
    );
  const match = new URL(request.url).pathname.match(
    /^\/api\/admin\/task-templates(?:\/([0-9a-f-]{36})(\/create)?)?$/i,
  );
  if (!match) return json({ error: "テンプレートが見つかりません。" }, 404);
  const id = match[1];
  if (request.method === "GET" && !id) {
    const allowed = projects.map((project) => project.id);
    const rows = allowed.length
      ? await db
          .prepare(
            `SELECT * FROM editorial_task_templates WHERE lower(owner_email)=lower(?) AND project_id IN (${allowed.map(() => "?").join(",")}) ORDER BY created_at DESC LIMIT 100`,
          )
          .bind(email, ...allowed)
          .all<TaskTemplate>()
      : { results: [] };
    const members = allowed.length
      ? await db
          .prepare(
            `SELECT m.project_id,m.email,COALESCE(NULLIF(trim(p.display_name),''),'表示名未設定') AS name FROM atlasez_project_memberships m LEFT JOIN atlasez_project_member_lifecycle l ON l.project_id=m.project_id AND lower(l.email)=lower(m.email) LEFT JOIN editorial_member_profiles p ON lower(p.email)=lower(m.email) WHERE m.project_id IN (${allowed.map(() => "?").join(",")}) AND COALESCE(l.state,'active')='active' AND NOT EXISTS(SELECT 1 FROM admin_member_lifecycle a WHERE m.project_id='atlas' AND lower(a.email)=lower(m.email) AND a.status='archived')`,
          )
          .bind(...allowed)
          .all<{ project_id: string; email: string; name: string }>()
      : { results: [] };
    return json({
      templates: rows.results.map((row) => ({
        ...row,
        owner_email: undefined,
        assignees: JSON.parse(row.assignees_json),
        assignees_json: undefined,
      })),
      projects,
      members: members.results.filter(
        (member) =>
          projects.some(
            (p) => p.id === member.project_id && p.role === "manager",
          ) || member.email.toLowerCase() === email.toLowerCase(),
      ),
      email,
    });
  }
  if (!["POST", "PATCH"].includes(request.method))
    return json({ error: "利用できない操作です。" }, 405);
  if (new URL(request.url).origin !== request.headers.get("origin"))
    return json({ error: "許可されていない送信元です。" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json"))
    return json({ error: "JSON形式で送信してください。" }, 415);
  const payload = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!payload) return json({ error: "入力内容を読み取れませんでした。" }, 400);
  const current = id
    ? await db
        .prepare(
          "SELECT * FROM editorial_task_templates WHERE id=? AND lower(owner_email)=lower(?)",
        )
        .bind(id, email)
        .first<TaskTemplate>()
    : null;
  if (id && (!current || !projects.some((p) => p.id === current.project_id)))
    return json({ error: "テンプレートが見つかりません。" }, 404);
  if (match[2]) {
    const key = text(payload.idempotencyKey, 100);
    if (!/^[0-9a-f-]{36}$/i.test(key))
      return json({ error: "作成キーを確認してください。" }, 400);
    try {
      return json(
        await createTemplateTask(
          db,
          current!,
          context.primaryEmail,
          new Date().toISOString(),
          `manual:${key}`,
        ),
      );
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error ? error.message : "作成できませんでした。",
        },
        409,
      );
    }
  }
  if (current && payload.updatedAt !== current.updated_at)
    return json(
      { error: "別の画面で変更されています。再読み込みしてください。" },
      409,
    );
  const now = new Date().toISOString();
  if (
    current &&
    typeof payload.enabled === "boolean" &&
    !("title" in payload)
  ) {
    if (payload.enabled && current.schedule === "none")
      return json({ error: "定期作成の周期を先に設定してください。" }, 400);
    const result = await db
      .prepare(
        "UPDATE editorial_task_templates SET enabled=?,last_error=NULL,updated_at=? WHERE id=? AND lower(owner_email)=lower(?) AND updated_at=?",
      )
      .bind(payload.enabled ? 1 : 0, now, id, email, current.updated_at)
      .run();
    return result.meta?.changes
      ? json({ ok: true })
      : json({ error: "別の画面で変更されています。" }, 409);
  }
  const project = projects.find(
    (project) => project.id === text(payload.projectId, 80),
  );
  if (!project) return json({ error: "プロジェクトを確認してください。" }, 403);
  const name = text(payload.name, 120),
    title = text(payload.title, 200),
    details = text(payload.details, 8000),
    timezone = text(payload.timezone, 80) || "Asia/Tokyo",
    schedule = (text(payload.schedule, 12) || "none") as Schedule,
    anchor = text(payload.anchorAt, 32),
    dueDays =
      payload.dueAfterDays === null ||
      payload.dueAfterDays === undefined ||
      payload.dueAfterDays === ""
        ? null
        : Number(payload.dueAfterDays);
  if (
    !name ||
    !title ||
    !schedules.has(schedule) ||
    (dueDays !== null &&
      (!Number.isInteger(dueDays) || dueDays < 0 || dueDays > 90))
  )
    return json(
      { error: "名前・タスク名・周期・期限日数を確認してください。" },
      400,
    );
  let next: string | null = null;
  try {
    Temporal.Now.instant().toZonedDateTimeISO(timezone);
    if (schedule !== "none") next = scheduleInstant(anchor, timezone);
  } catch {
    return json(
      { error: "日時またはタイムゾーンが不正、もしくは曖昧です。" },
      400,
    );
  }
  const assignees =
    project.role === "manager"
      ? [
          ...new Set(
            (Array.isArray(payload.assignees) ? payload.assignees : []).map(
              (value) => text(value, 254).toLowerCase(),
            ),
          ),
        ]
      : [email.toLowerCase()];
  if (
    assignees.length > 20 ||
    assignees.some((value) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
  )
    return json({ error: "担当者を確認してください。" }, 400);
  if (assignees.length) {
    const rows = await db
      .prepare(
        `SELECT lower(m.email) AS email FROM atlasez_project_memberships m LEFT JOIN atlasez_project_member_lifecycle l ON l.project_id=m.project_id AND lower(l.email)=lower(m.email) WHERE m.project_id=? AND lower(m.email) IN (${assignees.map(() => "?").join(",")}) AND COALESCE(l.state,'active')='active' AND NOT EXISTS(SELECT 1 FROM admin_member_lifecycle a WHERE m.project_id='atlas' AND lower(a.email)=lower(m.email) AND a.status='archived')`,
      )
      .bind(project.id, ...assignees)
      .all<{ email: string }>();
    if (
      assignees.some(
        (value) => !rows.results.some((row) => row.email === value),
      )
    )
      return json({ error: "担当者がプロジェクトに所属していません。" }, 403);
  }
  const enabled = schedule !== "none" && payload.enabled === true ? 1 : 0;
  const record = [
    project.id,
    name,
    title,
    details,
    JSON.stringify(assignees),
    timezone,
    schedule,
    schedule === "none" ? null : anchor,
    dueDays,
    enabled,
    next,
    now,
  ];
  const result = current
    ? await db
        .prepare(
          "UPDATE editorial_task_templates SET project_id=?,name=?,title=?,details=?,assignees_json=?,timezone=?,schedule=?,anchor_at=?,due_after_days=?,enabled=?,next_run_at=?,updated_at=?,last_error=NULL WHERE id=? AND lower(owner_email)=lower(?) AND updated_at=?",
        )
        .bind(...record, id, email, current.updated_at)
        .run()
    : await db
        .prepare(
          "INSERT INTO editorial_task_templates (project_id,name,title,details,assignees_json,timezone,schedule,anchor_at,due_after_days,enabled,next_run_at,updated_at,id,owner_email,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM editorial_task_templates WHERE lower(owner_email)=lower(?))<100",
        )
        .bind(...record, crypto.randomUUID(), email, now, email)
        .run();
  return result.meta?.changes
    ? json({ ok: true })
    : json(
        {
          error: current
            ? "別の画面で変更されています。"
            : "テンプレートは100件まで保存できます。",
        },
        409,
      );
}
