import type { D1Database } from "./admin-database";

export type WorkspaceTask = {
  id: string;
  project_id: string;
  subject: string | null;
  title: string;
  status: string;
  assignee_email: string | null;
  updated_at: string;
  archived_at: string | null;
};
export type TaskWorkspaceAccess = {
  task: WorkspaceTask;
  canEdit: boolean;
  canAssign: boolean;
};
export type TaskWorkspaceContext = {
  db: D1Database;
  email: string;
  access: (id: string) => Promise<TaskWorkspaceAccess | null>;
  documentAllowed: (id: string) => Promise<boolean>;
  // Uses the same project/subject restrictions as the member task list.
  candidates: (
    projectId: string,
    query: string,
  ) => Promise<Array<{ id: string; title: string; status: string }>>;
};
export type ChecklistItem = { id: string; label: string; done: boolean };
type WorkspaceRow = {
  summary: string;
  next_action: string;
  waiting_for: string;
  document_id: string | null;
  checklist_json: string;
  dependencies_json: string;
  revision: number;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
const fail = (error: string, status = 400) => json({ error }, status);

export function normalizeWorkspace(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("入力内容を確認してください。");
  const payload = value as Record<string, unknown>;
  const field = (key: string, max: number) => {
    const value = payload[key] ?? "";
    if (typeof value !== "string" || value.length > max)
      throw new Error("メモの長さと内容を確認してください。");
    return value.trim();
  };
  if (
    !Number.isInteger(payload.revision) ||
    Number(payload.revision) < 0 ||
    typeof payload.expectedUpdatedAt !== "string"
  )
    throw new Error("再読み込みしてから保存してください。");
  if (
    !Array.isArray(payload.checklist) ||
    payload.checklist.length > 30 ||
    !Array.isArray(payload.dependencyIds) ||
    payload.dependencyIds.length > 20
  )
    throw new Error("確認項目は30件、前提タスクは20件までです。");
  const checklist = payload.checklist.map((item: unknown): ChecklistItem => {
    if (!item || typeof item !== "object")
      throw new Error("確認項目を確認してください。");
    const row = item as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      !uuid.test(row.id) ||
      typeof row.label !== "string" ||
      !row.label.trim() ||
      row.label.length > 200 ||
      typeof row.done !== "boolean"
    )
      throw new Error("確認項目を確認してください。");
    return { id: row.id, label: row.label.trim(), done: row.done };
  });
  if (new Set(checklist.map((item) => item.id)).size !== checklist.length)
    throw new Error("確認項目が重複しています。");
  const dependencyIds = payload.dependencyIds.map((id: unknown) => {
    if (typeof id !== "string" || !uuid.test(id))
      throw new Error("前提タスクを確認してください。");
    return id;
  });
  if (new Set(dependencyIds).size !== dependencyIds.length)
    throw new Error("前提タスクが重複しています。");
  const documentId = field("documentId", 36);
  if (documentId && !uuid.test(documentId))
    throw new Error("関連原稿を確認してください。");
  if (payload.handoff !== undefined && typeof payload.handoff !== "boolean")
    throw new Error("引き継ぎの指定を確認してください。");
  let assignees: string[] | undefined;
  if (payload.assigneeEmails !== undefined) {
    if (
      !Array.isArray(payload.assigneeEmails) ||
      !payload.assigneeEmails.length ||
      payload.assigneeEmails.length > 20
    )
      throw new Error("引き継ぎ先を選択してください。");
    assignees = [
      ...new Set(
        payload.assigneeEmails.map((email: unknown) => {
          if (
            typeof email !== "string" ||
            email.length > 254 ||
            !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email)
          )
            throw new Error("引き継ぎ先を確認してください。");
          return email.trim().toLowerCase();
        }),
      ),
    ].sort();
    if (!payload.handoff)
      throw new Error("担当変更には引き継ぎ記録が必要です。");
  }
  const summary = field("summary", 4000),
    nextAction = field("nextAction", 4000),
    waitingFor = field("waitingFor", 2000);
  if (payload.handoff && (!summary || !nextAction))
    throw new Error("引き継ぎには現在の状況と次にすることを入力してください。");
  return {
    summary,
    nextAction,
    waitingFor,
    documentId,
    checklist,
    dependencyIds,
    revision: Number(payload.revision),
    expectedUpdatedAt: payload.expectedUpdatedAt,
    handoff: payload.handoff === true,
    assignees,
  };
}

// UNION (not UNION ALL) bounds traversal by unique task IDs, even if legacy rows contain a cycle.
export const dependencyCycleSql = `WITH RECURSIVE reachable(id) AS (
  SELECT value FROM json_each(?)
  UNION
  SELECT j.value FROM reachable r
  JOIN editorial_task_workspaces w ON w.task_id=r.id
  JOIN json_each(w.dependencies_json) j
) SELECT 1 FROM reachable WHERE id=? LIMIT 1`;

export async function handleTaskWorkspace(
  request: Request,
  taskId: string,
  context: TaskWorkspaceContext,
): Promise<Response> {
  const access = await context.access(taskId);
  if (!access) return fail("タスクが見つからないか、閲覧できません。", 404);
  const { task } = access;
  if (request.method !== "GET" && request.method !== "PUT")
    return fail("GET、PUTのみ利用できます。", 405);
  if (request.method === "PUT" && (!access.canEdit || task.archived_at))
    return fail("このタスクを編集できません。", 403);
  try {
    const workspace = await context.db
      .prepare(
        "SELECT summary,next_action,waiting_for,document_id,checklist_json,dependencies_json,revision FROM editorial_task_workspaces WHERE task_id=?",
      )
      .bind(taskId)
      .first<WorkspaceRow>();
    if (request.method === "GET") {
      const dependencyIds = JSON.parse(
        workspace?.dependencies_json ?? "[]",
      ) as string[];
      const dependencies = [];
      for (const id of dependencyIds) {
        const dependency = await context.access(id);
        dependencies.push(
          dependency
            ? {
                id,
                title: dependency.task.title,
                status: dependency.task.status,
                available: true,
              }
            : {
                id: null,
                title: "閲覧できない前提タスク",
                status: "unknown",
                available: false,
              },
        );
      }
      const history = await context.db
        .prepare(
          `SELECT summary,next_action,waiting_for,created_at,
        CASE WHEN COALESCE(from_assignees,'')!=COALESCE(to_assignees,'') THEN 1 ELSE 0 END AS reassigned
        FROM editorial_task_handoffs WHERE task_id=? ORDER BY created_at DESC,id DESC LIMIT 20`,
        )
        .bind(taskId)
        .all();
      const members = access.canAssign
        ? (
            await context.db
              .prepare(
                `SELECT m.email,COALESCE(NULLIF(p.display_name,''),'表示名未登録') AS name
        FROM atlasez_project_memberships m LEFT JOIN editorial_member_profiles p ON lower(p.email)=lower(m.email)
        WHERE m.project_id=? ORDER BY name,m.email`,
              )
              .bind(task.project_id)
              .all<{ email: string; name: string }>()
          ).results
        : [];
      const documentId =
        workspace?.document_id &&
        (await context.documentAllowed(workspace.document_id))
          ? workspace.document_id
          : null;
      return json({
        task: {
          id: task.id,
          title: task.title,
          status: task.status,
          updatedAt: task.updated_at,
          archived: Boolean(task.archived_at),
          assigneeEmails: access.canAssign
            ? (task.assignee_email ?? "")
                .split(",")
                .filter((email) => email && email !== "*")
            : [],
        },
        workspace: {
          summary: workspace?.summary ?? "",
          nextAction: workspace?.next_action ?? "",
          waitingFor: workspace?.waiting_for ?? "",
          documentId,
          documentRestricted: Boolean(workspace?.document_id && !documentId),
          checklist: JSON.parse(workspace?.checklist_json ?? "[]"),
          revision: workspace?.revision ?? 0,
        },
        dependencies,
        candidates: await context.candidates(
          task.project_id,
          (new URL(request.url).searchParams.get("q") ?? "").slice(0, 100),
        ),
        members,
        history: history.results,
        canEdit: access.canEdit && !task.archived_at,
        canAssign: access.canAssign && !task.archived_at,
      });
    }
    let input: ReturnType<typeof normalizeWorkspace>;
    try {
      input = normalizeWorkspace(await request.json());
    } catch (error) {
      return fail(
        error instanceof Error
          ? error.message
          : "入力内容を読み取れませんでした。",
      );
    }
    if (
      input.revision !== (workspace?.revision ?? 0) ||
      input.expectedUpdatedAt !== task.updated_at
    )
      return fail(
        "他の更新が先に反映されています。入力を控えて再読み込みしてください。",
        409,
      );
    if (input.documentId && !(await context.documentAllowed(input.documentId)))
      return fail("関連原稿を閲覧できません。", 403);
    // Preserve references hidden after permission changes; saving another field must not silently remove them.
    if (
      workspace?.document_id &&
      !(await context.documentAllowed(workspace.document_id)) &&
      input.documentId !== workspace.document_id
    )
      return fail(
        "関連原稿の権限が変わっています。運営内運営へ確認してください。",
        409,
      );
    for (const id of JSON.parse(
      workspace?.dependencies_json ?? "[]",
    ) as string[]) {
      if (!(await context.access(id)))
        return fail(
          "前提タスクの権限が変わっています。運営内運営へ確認してください。",
          409,
        );
    }
    for (const id of input.dependencyIds) {
      const dependency = await context.access(id);
      if (
        id === taskId ||
        !dependency ||
        dependency.task.project_id !== task.project_id
      )
        return fail(
          "同じプロジェクトで閲覧できる別のタスクを選択してください。",
        );
    }
    if (input.assignees && !access.canAssign)
      return fail("担当者を変更できるのは運営内運営のみです。", 403);
    if (input.assignees) {
      const rows = await context.db
        .prepare(
          `SELECT lower(email) AS email FROM atlasez_project_memberships WHERE project_id=? AND lower(email) IN (${input.assignees.map(() => "?").join(",")})`,
        )
        .bind(task.project_id, ...input.assignees)
        .all<{ email: string }>();
      if (rows.results.length !== input.assignees.length)
        return fail(
          "引き継ぎ先はこのプロジェクトの参加者に限定されます。",
          403,
        );
    }
    const dependencies = JSON.stringify(input.dependencyIds);
    const cycle = await context.db
      .prepare(dependencyCycleSql)
      .bind(dependencies, taskId)
      .first();
    if (cycle) return fail("前提タスクが循環するため保存できません。", 409);
    const now = new Date().toISOString(),
      operationId = crypto.randomUUID();
    const assignees = input.assignees?.join(",") ?? task.assignee_email;
    const audit = context.db
      .prepare(
        `INSERT INTO admin_audit_log(id,actor_email,action,target_type,target_id,target_label,summary,details_json,created_at)
      SELECT ?,?,'task_workspace_updated','task',?,?,?, ?,? WHERE changes()=1`,
      )
      .bind(
        operationId,
        context.email,
        taskId,
        task.title,
        input.handoff
          ? "タスクの引き継ぎを記録"
          : "タスクの確認項目とメモを更新",
        JSON.stringify({
          projectId: task.project_id,
          revision: input.revision + 1,
          handoff: input.handoff,
          reassigned: assignees !== task.assignee_email,
        }),
        now,
      );
    const statements = [
      context.db
        .prepare(
          `UPDATE editorial_tasks SET assignee_email=?,updated_at=? WHERE id=? AND updated_at=? AND archived_at IS NULL
        AND COALESCE((SELECT revision FROM editorial_task_workspaces WHERE task_id=editorial_tasks.id),0)=?
        AND NOT EXISTS (${dependencyCycleSql})`,
        )
        .bind(
          assignees,
          now,
          taskId,
          task.updated_at,
          input.revision,
          dependencies,
          taskId,
        ),
      context.db
        .prepare(
          `INSERT INTO editorial_task_workspaces(task_id,summary,next_action,waiting_for,document_id,checklist_json,dependencies_json,revision,operation_id,updated_by,updated_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE changes()=1
        ON CONFLICT(task_id) DO UPDATE SET summary=excluded.summary,next_action=excluded.next_action,waiting_for=excluded.waiting_for,document_id=excluded.document_id,checklist_json=excluded.checklist_json,dependencies_json=excluded.dependencies_json,revision=excluded.revision,operation_id=excluded.operation_id,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
        )
        .bind(
          taskId,
          input.summary,
          input.nextAction,
          input.waitingFor,
          input.documentId || null,
          JSON.stringify(input.checklist),
          dependencies,
          input.revision + 1,
          operationId,
          context.email,
          now,
        ),
      audit,
    ];
    if (input.handoff)
      statements.push(
        context.db
          .prepare(
            `INSERT INTO editorial_task_handoffs(id,task_id,summary,next_action,waiting_for,from_assignees,to_assignees,created_by,created_at)
      SELECT ?,?,?,?,?,?,?,?,? WHERE changes()=1`,
          )
          .bind(
            operationId,
            taskId,
            input.summary,
            input.nextAction,
            input.waitingFor,
            task.assignee_email,
            assignees,
            context.email,
            now,
          ),
      );
    const result = await context.db.batch(statements);
    if (!result[0]?.meta?.changes)
      return fail(
        "他の更新または前提タスクの変更が先に反映されています。入力を控えて再読み込みしてください。",
        409,
      );
    return json({ ok: true, revision: input.revision + 1, updatedAt: now });
  } catch (error) {
    if (String(error).includes("no such table"))
      return fail(
        "タスク詳細の準備が完了していません。運営内運営へ確認してください。",
        503,
      );
    throw error;
  }
}
