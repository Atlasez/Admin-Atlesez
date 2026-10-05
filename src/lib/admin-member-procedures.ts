import type { D1Database, D1PreparedStatement } from "./admin-database";
import { isValidTimeZone, localDateTimeToInstant } from "./date-time";

type Project = {
  id: string;
  slug: string;
  name: string;
  role: string;
  state: string;
};
type Procedure = {
  id: string;
  project_id: string;
  email: string;
  procedure_type: string;
  status: string;
  effective_from: string;
  effective_until: string;
  timezone: string;
  effective_at: string | null;
  updated_at: string;
  reviewed_by: string | null;
  expected_state: string;
  handover_note: string;
};
export type ProcedureContext = {
  db: D1Database;
  email: string;
  global: boolean;
  now?: string;
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
const openStates = "('pending','reviewing','scheduled')";
const audit = (
  db: D1Database,
  actor: string,
  id: string,
  summary: string,
  details: unknown,
  now: string,
): D1PreparedStatement =>
  db
    .prepare(
      `INSERT INTO admin_audit_log(id,actor_email,action,target_type,target_id,target_label,summary,details_json,created_at) SELECT ?,?, 'member_procedure','member_procedure',?,?,?,?,? WHERE changes()=1`,
    )
    .bind(
      crypto.randomUUID(),
      actor,
      id,
      id,
      summary,
      JSON.stringify(details),
      now,
    );
const handover = async (db: D1Database, row: Procedure) => {
  const tasks = await db
    .prepare(
      `SELECT id,title FROM editorial_tasks WHERE project_id=? AND is_test_data=0 AND archived_at IS NULL AND status!='done' AND instr(','||lower(COALESCE(assignee_email,''))||',',','||lower(?)||',')>0 LIMIT 101`,
    )
    .bind(row.project_id, row.email)
    .all<{ id: string; title: string }>();
  const documents =
    row.project_id === "atlas"
      ? await db
          .prepare(
            `SELECT id,title FROM editorial_documents WHERE lower(created_by)=lower(?) AND archived_at IS NULL AND status IN ('draft','in-review') LIMIT 101`,
          )
          .bind(row.email)
          .all<{ id: string; title: string }>()
      : { results: [] };
  return { tasks: tasks.results, documents: documents.results };
};

export async function applyDueMemberProcedures(
  db: D1Database,
  now = new Date().toISOString(),
) {
  const due = await db
    .prepare(
      "SELECT * FROM atlasez_member_procedure_requests WHERE status='scheduled' AND effective_at<=? ORDER BY effective_at,id LIMIT 50",
    )
    .bind(now)
    .all<Procedure>();
  let applied = 0;
  for (const row of due.results) {
    const membership = await db
      .prepare(
        `SELECT m.role,COALESCE(l.state,'active') AS state FROM atlasez_project_memberships m LEFT JOIN atlasez_project_member_lifecycle l ON l.project_id=m.project_id AND lower(l.email)=lower(m.email) WHERE m.project_id=? AND lower(m.email)=lower(?) AND NOT EXISTS(SELECT 1 FROM admin_member_lifecycle a WHERE lower(a.email)=lower(?) AND a.status='archived' AND ?='atlas')`,
      )
      .bind(row.project_id, row.email, row.email, row.project_id)
      .first<{ role: string; state: string }>();
    // Membership deletion/archive after approval must never be undone by a scheduled request.
    if (!membership || membership.state !== row.expected_state) {
      await db.batch([
        db
          .prepare(
            "UPDATE atlasez_member_procedure_requests SET status='cancelled',review_note=review_note||' 所属が変更されたため実行停止。',updated_at=? WHERE id=? AND status='scheduled'",
          )
          .bind(now, row.id),
        audit(
          db,
          "system",
          row.id,
          "所属変更により手続きの実行を停止",
          {},
          now,
        ),
      ]);
      continue;
    }
    if (row.procedure_type !== "restart" && membership.role === "manager") {
      const others = await db
        .prepare(
          `SELECT COUNT(*) AS count FROM atlasez_project_memberships m LEFT JOIN atlasez_project_member_lifecycle l ON l.project_id=m.project_id AND lower(l.email)=lower(m.email) WHERE m.project_id=? AND m.role='manager' AND lower(m.email)!=lower(?) AND COALESCE(l.state,'active')='active' AND NOT EXISTS(SELECT 1 FROM admin_member_lifecycle archived WHERE lower(archived.email)=lower(m.email) AND archived.status='archived' AND m.project_id='atlas')`,
        )
        .bind(row.project_id, row.email)
        .first<{ count: number }>();
      if (!others?.count) {
        await db
          .prepare(
            "UPDATE atlasez_member_procedure_requests SET execution_error='後任の運営内運営を確認できないため実行待ちです。' WHERE id=? AND status='scheduled'",
          )
          .bind(row.id)
          .run();
        continue;
      }
    }
    const pendingHandover =
      row.procedure_type !== "restart"
        ? await handover(db, row)
        : { tasks: [], documents: [] };
    if (pendingHandover.documents.length && !row.handover_note.trim()) {
      await db
        .prepare(
          "UPDATE atlasez_member_procedure_requests SET execution_error='承認後の担当原稿に引き継ぎ記録が必要です。申請を取り下げて再申請し、原稿の引き継ぎを記録して承認してください。' WHERE id=? AND status='scheduled'",
        )
        .bind(row.id)
        .run();
      continue;
    }
    if (pendingHandover.tasks.length) {
      await db
        .prepare(
          "UPDATE atlasez_member_procedure_requests SET execution_error='担当タスクの引き継ぎ完了を確認できないため実行待ちです。' WHERE id=? AND status='scheduled'",
        )
        .bind(row.id)
        .run();
      continue;
    }
    const state =
      row.procedure_type === "restart"
        ? "active"
        : row.procedure_type === "pause"
          ? "paused"
          : "withdrawn";
    const result = await db.batch([
      db
        .prepare(
          `INSERT INTO atlasez_project_member_lifecycle(project_id,email,state,role_snapshot,last_request_id,updated_at)
           SELECT r.project_id,lower(r.email),?,m.role,r.id,?
           FROM atlasez_member_procedure_requests r
           JOIN atlasez_project_memberships m ON m.project_id=r.project_id AND lower(m.email)=lower(r.email)
           LEFT JOIN atlasez_project_member_lifecycle current ON current.project_id=m.project_id AND lower(current.email)=lower(m.email)
           WHERE r.id=? AND r.status='scheduled' AND r.effective_at<=?
             AND COALESCE(current.state,'active')=r.expected_state
             AND NOT EXISTS(SELECT 1 FROM admin_member_lifecycle a WHERE lower(a.email)=lower(r.email) AND a.status='archived' AND r.project_id='atlas')
             AND (r.procedure_type='restart' OR NOT EXISTS(SELECT 1 FROM editorial_tasks t WHERE t.project_id=r.project_id AND t.is_test_data=0 AND t.archived_at IS NULL AND t.status!='done' AND instr(','||lower(COALESCE(t.assignee_email,''))||',',','||lower(r.email)||',')>0))
             AND (r.procedure_type='restart' OR r.project_id!='atlas' OR length(trim(COALESCE(r.handover_note,'')))>0 OR NOT EXISTS(
               SELECT 1 FROM editorial_documents d WHERE lower(d.created_by)=lower(r.email) AND d.archived_at IS NULL AND d.status IN ('draft','in-review')
             ))
             AND (r.procedure_type='restart' OR m.role!='manager' OR EXISTS(
               SELECT 1 FROM atlasez_project_memberships successor
               LEFT JOIN atlasez_project_member_lifecycle successor_state ON successor_state.project_id=successor.project_id AND lower(successor_state.email)=lower(successor.email)
               WHERE successor.project_id=r.project_id AND successor.role='manager' AND lower(successor.email)!=lower(r.email) AND COALESCE(successor_state.state,'active')='active'
                 AND NOT EXISTS(SELECT 1 FROM admin_member_lifecycle archived WHERE lower(archived.email)=lower(successor.email) AND archived.status='archived' AND successor.project_id='atlas')
             ))
           ON CONFLICT(project_id,email) DO UPDATE SET state=excluded.state,role_snapshot=excluded.role_snapshot,last_request_id=excluded.last_request_id,updated_at=excluded.updated_at`,
        )
        .bind(state, now, row.id, now),
      db
        .prepare(
          `UPDATE atlasez_member_procedure_requests SET status='applied',execution_error='',applied_at=?,updated_at=? WHERE id=? AND status='scheduled' AND EXISTS(SELECT 1 FROM atlasez_project_member_lifecycle l WHERE l.project_id=atlasez_member_procedure_requests.project_id AND lower(l.email)=lower(atlasez_member_procedure_requests.email) AND l.last_request_id=atlasez_member_procedure_requests.id)`,
        )
        .bind(now, now, row.id),
      db
        .prepare(
          `INSERT INTO admin_audit_log(id,actor_email,action,target_type,target_id,target_label,summary,details_json,created_at) SELECT ?,'system','member_procedure','member_procedure',id,email,?, ?,? FROM atlasez_member_procedure_requests WHERE id=? AND status='applied' AND applied_at=? AND changes()=1`,
        )
        .bind(
          crypto.randomUUID(),
          "参加状態を変更",
          JSON.stringify({
            projectId: row.project_id,
            email: row.email,
            state,
          }),
          now,
          row.id,
          now,
        ),
    ]);
    applied += Number(result[1]?.meta?.changes ?? 0);
  }
  return { applied };
}

export async function handleMemberProcedures(
  request: Request,
  context: ProcedureContext,
): Promise<Response> {
  const { db, email } = context;
  const now = context.now ?? new Date().toISOString();
  const url = new URL(request.url);
  if (url.pathname !== "/api/admin/member-procedures")
    return json({ error: "指定した手続きAPIはありません。" }, 404);
  if (request.method !== "GET" && request.method !== "POST")
    return json({ error: "GET、POSTのみ利用できます。" }, 405);
  const review = url.searchParams.get("view") === "review";
  if (
    request.method !== "GET" &&
    request.headers.get("origin") &&
    request.headers.get("origin") !== url.origin
  )
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  const all = await db
    .prepare(
      `SELECT p.id,p.slug,p.name,m.role,COALESCE(l.state,'active') AS state FROM atlasez_projects p JOIN atlasez_project_memberships m ON m.project_id=p.id LEFT JOIN atlasez_project_member_lifecycle l ON l.project_id=m.project_id AND lower(l.email)=lower(m.email) WHERE lower(m.email)=lower(?) AND NOT EXISTS(SELECT 1 FROM admin_member_lifecycle a WHERE lower(a.email)=lower(m.email) AND a.status='archived' AND p.id='atlas') ORDER BY p.name,p.id`,
    )
    .bind(email)
    .all<Project>();
  const visibleProjects = context.global
    ? (
        await db
          .prepare(
            "SELECT id,slug,name,'manager' AS role,'active' AS state FROM atlasez_projects ORDER BY name,id",
          )
          .all<Project>()
      ).results.map(
        (item) => all.results.find((own) => own.id === item.id) ?? item,
      )
    : all.results;
  const requested = url.searchParams.get("project");
  const project =
    all.results.find((p) => p.id === requested || p.slug === requested) ??
    (!requested ? all.results[0] : undefined);
  const globalProject =
    context.global && requested
      ? await db
          .prepare(
            "SELECT id,slug,name,'manager' AS role,'active' AS state FROM atlasez_projects WHERE id=? OR slug=?",
          )
          .bind(requested, requested)
          .first<Project>()
      : null;
  const selected = project ?? (review ? globalProject : null);
  if (!selected) {
    if (request.method === "GET" && !requested)
      return json({
        projects: visibleProjects,
        requests: [],
        canReview: context.global,
      });
    return json({ error: "このプロジェクトの所属を確認できません。" }, 403);
  }
  const canReview =
    context.global ||
    (selected.role === "manager" && selected.state === "active");
  if (review && !canReview)
    return json(
      { error: "このプロジェクトの運営内運営のみ確認できます。" },
      403,
    );
  if (request.method === "GET") {
    const rows = await db
      .prepare(
        `SELECT * FROM atlasez_member_procedure_requests WHERE project_id=? ${review ? "" : "AND lower(email)=lower(?)"} ORDER BY created_at DESC,id DESC LIMIT 100`,
      )
      .bind(selected.id, ...(review ? [] : [email]))
      .all<Procedure>();
    const requests = review
      ? await Promise.all(
          rows.results.map(async (row) => ({
            ...row,
            handover: await handover(db, row),
          })),
        )
      : rows.results;
    return json({
      projects: visibleProjects,
      project: selected,
      canReview,
      requests,
    });
  }
  if (request.method !== "POST")
    return json({ error: "GET、POSTのみ利用できます。" }, 405);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error();
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const id = text(body.id, 100),
    action = text(body.action, 20);
  if (id) {
    const row = await db
      .prepare(
        "SELECT * FROM atlasez_member_procedure_requests WHERE id=? AND project_id=?",
      )
      .bind(id, selected.id)
      .first<Procedure>();
    if (!row || (!review && row.email.toLowerCase() !== email.toLowerCase()))
      return json({ error: "申請が見つかりません。" }, 404);
    if (action === "cancel" && !review) {
      if (!["pending", "reviewing", "scheduled"].includes(row.status))
        return json({ error: "処理済みの申請は取り下げできません。" }, 409);
      const result = await db.batch([
        db
          .prepare(
            `UPDATE atlasez_member_procedure_requests SET status='cancelled',updated_at=? WHERE id=? AND status=? AND updated_at=?`,
          )
          .bind(now, id, row.status, row.updated_at),
        audit(db, email, id, "申請を取り下げ", {}, now),
      ]);
      return result[0]?.meta?.changes
        ? json({ ok: true })
        : json(
            { error: "申請が変更されています。再読み込みしてください。" },
            409,
          );
    }
    if (
      !review ||
      !canReview ||
      row.email.toLowerCase() === email.toLowerCase()
    )
      return json({ error: "他の運営内運営による確認が必要です。" }, 403);
    if (
      !["approve", "reject"].includes(action) ||
      !["pending", "reviewing"].includes(row.status) ||
      text(body.expectedUpdatedAt, 80) !== row.updated_at
    )
      return json(
        { error: "申請が変更されています。再読み込みしてください。" },
        409,
      );
    const reviewNote = text(body.reviewNote, 2000),
      handoverNote = text(body.handoverNote, 2000);
    if (action === "reject" && !reviewNote)
      return json({ error: "却下理由を入力してください。" }, 400);
    if (action === "approve" && row.procedure_type !== "restart") {
      const items = await handover(db, row);
      if (
        body.handoverConfirmed !== true ||
        items.tasks.length > 0 ||
        (items.documents.length > 0 && !handoverNote)
      )
        return json(
          {
            error:
              "未完了の担当タスクを引き継ぐか完了し、原稿の引き継ぎメモを入力してください。",
            handover: items,
          },
          409,
        );
      const member = await db
        .prepare(
          "SELECT role FROM atlasez_project_memberships WHERE project_id=? AND lower(email)=lower(?)",
        )
        .bind(selected.id, row.email)
        .first<{ role: string }>();
      if (member?.role === "manager") {
        const count = await db
          .prepare(
            `SELECT COUNT(*) AS count FROM atlasez_project_memberships m LEFT JOIN atlasez_project_member_lifecycle l ON l.project_id=m.project_id AND lower(l.email)=lower(m.email) WHERE m.project_id=? AND m.role='manager' AND lower(m.email)!=lower(?) AND COALESCE(l.state,'active')='active' AND NOT EXISTS(SELECT 1 FROM admin_member_lifecycle archived WHERE lower(archived.email)=lower(m.email) AND archived.status='archived' AND m.project_id='atlas')`,
          )
          .bind(selected.id, row.email)
          .first<{ count: number }>();
        if (!count?.count)
          return json(
            {
              error:
                "最後の運営内運営です。後任を登録してから承認してください。",
            },
            409,
          );
      }
    }
    let effectiveAt = row.effective_at;
    try {
      if (action === "approve")
        effectiveAt ??= localDateTimeToInstant(
          `${row.effective_from}T00:00`,
          row.timezone,
        );
    } catch {
      return json({ error: "実行日を確認してください。" }, 400);
    }
    const status = action === "approve" ? "scheduled" : "rejected";
    const result = await db.batch([
      db
        .prepare(
          `UPDATE atlasez_member_procedure_requests SET status=?,effective_at=?,review_note=?,handover_note=?,reviewed_by=?,reviewed_at=?,updated_at=? WHERE id=? AND status=? AND updated_at=?
            AND (?=1 OR EXISTS(SELECT 1 FROM atlasez_project_memberships reviewer LEFT JOIN atlasez_project_member_lifecycle lifecycle ON lifecycle.project_id=reviewer.project_id AND lower(lifecycle.email)=lower(reviewer.email) WHERE reviewer.project_id=atlasez_member_procedure_requests.project_id AND lower(reviewer.email)=lower(?) AND reviewer.role='manager' AND COALESCE(lifecycle.state,'active')='active' AND NOT EXISTS(SELECT 1 FROM admin_member_lifecycle archived WHERE lower(archived.email)=lower(reviewer.email) AND archived.status='archived' AND reviewer.project_id='atlas')))`,
        )
        .bind(
          status,
          effectiveAt,
          reviewNote,
          handoverNote,
          email,
          now,
          now,
          id,
          row.status,
          row.updated_at,
          context.global ? 1 : 0,
          email,
        ),
      audit(
        db,
        email,
        id,
        action === "approve" ? "手続きを承認（実行待ち）" : "手続きを却下",
        { projectId: selected.id, email: row.email },
        now,
      ),
    ]);
    if (!result[0]?.meta?.changes)
      return json({ error: "申請が変更されています。" }, 409);
    if (status === "scheduled" && effectiveAt && effectiveAt <= now)
      await applyDueMemberProcedures(db, now);
    return json({
      ok: true,
      request: await db
        .prepare("SELECT * FROM atlasez_member_procedure_requests WHERE id=?")
        .bind(id)
        .first(),
    });
  }
  if (review || request.method !== "POST")
    return json({ error: "この操作は利用できません。" }, 405);
  const type = text(body.type, 20);
  if (!["pause", "withdrawal", "restart"].includes(type))
    return json({ error: "手続きの種類を確認してください。" }, 400);
  if (
    type === "restart"
      ? selected.state === "active"
      : type === "pause"
        ? selected.state !== "active"
        : selected.state === "withdrawn"
  )
    return json(
      { error: "現在の参加状態で申請できる手続きを選んでください。" },
      409,
    );
  if (type === "withdrawal" && body.confirm !== true)
    return json({ error: "退会申請の確認にチェックを入れてください。" }, 400);
  const from = text(body.effectiveFrom, 10),
    until = text(body.effectiveUntil, 10),
    timezone = text(body.timezone, 80) || "Asia/Tokyo",
    reason = text(body.reason, 300),
    note = text(body.note, 2000);
  let effectiveAt: string;
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !isValidTimeZone(timezone))
      throw Error();
    effectiveAt = localDateTimeToInstant(`${from}T00:00`, timezone);
    if (until) {
      if (
        type !== "pause" ||
        until < from ||
        !/^\d{4}-\d{2}-\d{2}$/.test(until)
      )
        throw Error();
      localDateTimeToInstant(`${until}T00:00`, timezone);
    }
  } catch {
    return json({ error: "日付とタイムゾーンを確認してください。" }, 400);
  }
  if (!reason) return json({ error: "理由を入力してください。" }, 400);
  const newId = crypto.randomUUID();
  const result = await db.batch([
    db
      .prepare(
        `INSERT INTO atlasez_member_procedure_requests(id,project_id,email,procedure_type,effective_from,effective_until,timezone,effective_at,reason,note,expected_state,status,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,'pending',?,? WHERE NOT EXISTS(SELECT 1 FROM atlasez_member_procedure_requests WHERE project_id=? AND lower(email)=lower(?) AND status IN ${openStates})`,
      )
      .bind(
        newId,
        selected.id,
        email,
        type,
        from,
        until,
        timezone,
        effectiveAt,
        reason,
        note,
        selected.state,
        now,
        now,
        selected.id,
        email,
      ),
    db
      .prepare(
        `INSERT INTO admin_audit_log(id,actor_email,action,target_type,target_id,target_label,summary,details_json,created_at) SELECT ?,?,'member_procedure','member_procedure',id,email,'手続きを申請',?,? FROM atlasez_member_procedure_requests WHERE id=? AND changes()=1`,
      )
      .bind(
        crypto.randomUUID(),
        email,
        JSON.stringify({ projectId: selected.id, type }),
        now,
        newId,
      ),
  ]);
  if (!result[0]?.meta?.changes)
    return json({ error: "確認待ち・実行待ちの申請が既にあります。" }, 409);
  return json(
    {
      ok: true,
      request: await db
        .prepare("SELECT * FROM atlasez_member_procedure_requests WHERE id=?")
        .bind(newId)
        .first(),
    },
    201,
  );
}
