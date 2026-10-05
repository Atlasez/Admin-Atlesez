import type { D1Database, D1PreparedStatement } from "./admin-database";

export type ManagerDisposition = "preserve" | "revoke";
export type ManagerRevocationPlan = {
  statements: D1PreparedStatement[];
  disposition: "none" | "preserved" | "revoked";
  error?: string;
};

const roleAudit = (
  db: D1Database,
  email: string,
  actor: string,
  disposition: string,
) =>
  db
    .prepare(
      `INSERT INTO admin_audit_log(id,actor_email,action,target_type,target_id,target_label,summary,details_json,created_at)
   VALUES (?,?,'member_updated','member',?,?,?,
     json_object('projectId','atlas','requestedDisposition',?,'resultingRole',
       (SELECT role FROM atlasez_project_memberships WHERE project_id='atlas' AND lower(email)=lower(?)),
       'resultingSource',(SELECT source FROM atlasez_project_manager_grants WHERE project_id='atlas' AND lower(email)=lower(?))),?)`,
    )
    .bind(
      crypto.randomUUID(),
      actor,
      email,
      email,
      "アトラス管理者ロールの取消結果を記録",
      disposition,
      email,
      email,
      new Date().toISOString(),
    );

/** Plan before Discord/network writes. The caller batches this with permission changes. */
export async function planAtlasManagerRevocation(
  db: D1Database,
  email: string,
  removesGlobal: boolean,
  selected: unknown,
  actor: string,
): Promise<ManagerRevocationPlan> {
  const empty: ManagerRevocationPlan = { statements: [], disposition: "none" };
  if (!removesGlobal) return empty;
  const membership = await db
    .prepare(
      "SELECT role FROM atlasez_project_memberships WHERE project_id='atlas' AND lower(email)=lower(?)",
    )
    .bind(email)
    .first<{ role: string }>();
  if (membership?.role !== "manager") return empty;
  const grant = await db
    .prepare(
      "SELECT source FROM atlasez_project_manager_grants WHERE project_id='atlas' AND lower(email)=lower(?)",
    )
    .bind(email)
    .first<{ source: string }>();
  if (grant?.source === "explicit")
    return { ...empty, disposition: "preserved" };
  if (
    grant?.source !== "permission" &&
    selected !== "preserve" &&
    selected !== "revoke"
  )
    return {
      ...empty,
      error:
        "アトラスの運営内運営の付与元が未確認です。独立した任命を維持するか、全分野権限と一緒に解除するか選択してください。",
    };
  if (grant?.source !== "permission" && selected === "preserve")
    return {
      disposition: "preserved",
      statements: [
        db
          .prepare(
            `INSERT INTO atlasez_project_manager_grants(project_id,email,source,granted_by,granted_at)
       VALUES ('atlas',?,'explicit',?,?)
       ON CONFLICT(project_id,email) DO UPDATE SET source='explicit',granted_by=excluded.granted_by,granted_at=excluded.granted_at,review_required=0,revision=revision+1`,
          )
          .bind(email, actor, new Date().toISOString()),
        roleAudit(db, email, actor, "preserved-explicit"),
      ],
    };
  return {
    disposition: "revoked",
    statements: [
      db
        .prepare(
          `UPDATE atlasez_project_memberships SET role='member'
      WHERE project_id='atlas' AND lower(email)=lower(?)
      AND NOT EXISTS (SELECT 1 FROM atlasez_project_manager_grants g
        WHERE g.project_id='atlas' AND lower(g.email)=lower(?) AND g.source='explicit')`,
        )
        .bind(email, email),
      db
        .prepare(
          "DELETE FROM atlasez_project_manager_grants WHERE project_id='atlas' AND lower(email)=lower(?) AND source!='explicit'",
        )
        .bind(email),
      roleAudit(db, email, actor, "revoked"),
    ],
  };
}

/** Global administration only; the Worker verifies the actor before calling. */
export async function handleManagerGrants(
  request: Request,
  db: D1Database,
  actor: string,
): Promise<Response> {
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  if (request.method === "GET") {
    const result = await db
      .prepare(
        `SELECT m.project_id,p.name AS project_name,m.email,m.role,
      COALESCE(g.source,'none') AS source,COALESCE(g.revision,0) AS revision,
      COALESCE(g.granted_by,'') AS granted_by,COALESCE(g.granted_at,'') AS granted_at,COALESCE(g.review_required,0) AS review_required
      FROM atlasez_project_memberships m JOIN atlasez_projects p ON p.id=m.project_id
      LEFT JOIN atlasez_project_manager_grants g ON g.project_id=m.project_id AND lower(g.email)=lower(m.email)
      ORDER BY p.name,lower(m.email)`,
      )
      .all();
    return json({ members: result.results });
  }
  if (request.method !== "PATCH")
    return json({ error: "GET、PATCHのみ利用できます。" }, 405);
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  const payload = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const projectId =
    typeof payload?.projectId === "string" ? payload.projectId.trim() : "";
  const email =
    typeof payload?.email === "string"
      ? payload.email.trim().toLowerCase()
      : "";
  const role = payload?.role;
  const expectedRole = payload?.expectedRole;
  const expectedSource = payload?.expectedSource;
  const revision = Number(payload?.revision);
  if (
    !projectId ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !["member", "manager"].includes(String(role)) ||
    !["member", "manager"].includes(String(expectedRole)) ||
    !["none", "legacy", "explicit", "permission"].includes(
      String(expectedSource),
    ) ||
    !Number.isSafeInteger(revision) ||
    revision < 0
  )
    return json({ error: "対象の所属・ロールを確認してください。" }, 400);
  if (actor.toLowerCase() === email && role !== "manager")
    return json({ error: "自分自身の管理者ロールは解除できません。" }, 400);
  const inactive = await db
    .prepare(
      `SELECT 1 AS found FROM atlasez_project_member_lifecycle WHERE project_id=? AND lower(email)=lower(?) AND state!='active'
    UNION ALL SELECT 1 WHERE ?='atlas' AND EXISTS(SELECT 1 FROM admin_member_lifecycle WHERE lower(email)=lower(?) AND status='archived') LIMIT 1`,
    )
    .bind(projectId, email, projectId, email)
    .first();
  if (inactive)
    return json(
      { error: "活動停止中の所属は先に再開・復元してください。" },
      409,
    );
  const exists = await db
    .prepare(
      "SELECT role FROM atlasez_project_memberships WHERE project_id=? AND lower(email)=lower(?)",
    )
    .bind(projectId, email)
    .first<{ role: string }>();
  if (!exists) return json({ error: "所属が見つかりません。" }, 404);
  if (role === "member" && exists.role === "manager") {
    const replacement = await db
      .prepare(
        `SELECT 1 AS found FROM atlasez_project_memberships m
      WHERE m.project_id=? AND lower(m.email)!=lower(?) AND m.role='manager'
        AND NOT EXISTS (SELECT 1 FROM atlasez_project_member_lifecycle l
          WHERE l.project_id=m.project_id AND lower(l.email)=lower(m.email) AND l.state!='active')
        AND (m.project_id!='atlas' OR NOT EXISTS (SELECT 1 FROM admin_member_lifecycle l
          WHERE lower(l.email)=lower(m.email) AND l.status='archived')) LIMIT 1`,
      )
      .bind(projectId, email)
      .first();
    if (!replacement)
      return json(
        {
          error:
            "最後のプロジェクト責任者は解除できません。先に後任を任命してください。",
        },
        409,
      );
  }
  const nonce = crypto.randomUUID(),
    now = new Date().toISOString();
  const activeSql = `NOT EXISTS(SELECT 1 FROM atlasez_project_member_lifecycle l
    WHERE l.project_id=? AND lower(l.email)=lower(?) AND l.state!='active')
    AND (?!='atlas' OR NOT EXISTS(SELECT 1 FROM admin_member_lifecycle l
      WHERE lower(l.email)=lower(?) AND l.status='archived'))
    AND (?='manager' OR EXISTS(SELECT 1 FROM atlasez_project_memberships replacement
      WHERE replacement.project_id=? AND lower(replacement.email)!=lower(?) AND replacement.role='manager'
        AND NOT EXISTS(SELECT 1 FROM atlasez_project_member_lifecycle l
          WHERE l.project_id=replacement.project_id AND lower(l.email)=lower(replacement.email) AND l.state!='active')
        AND (replacement.project_id!='atlas' OR NOT EXISTS(SELECT 1 FROM admin_member_lifecycle l
          WHERE lower(l.email)=lower(replacement.email) AND l.status='archived'))))`;
  const claim =
    expectedSource === "none"
      ? db
          .prepare(
            `INSERT OR IGNORE INTO atlasez_project_manager_grants
        (project_id,email,source,granted_by,granted_at,revision,operation_id)
        SELECT ?,?,'legacy','',?,1,? WHERE ?=0 AND EXISTS(
          SELECT 1 FROM atlasez_project_memberships m
          WHERE m.project_id=? AND lower(m.email)=lower(?) AND m.role=?) AND ${activeSql}`,
          )
          .bind(
            projectId,
            email,
            now,
            nonce,
            revision,
            projectId,
            email,
            expectedRole,
            projectId,
            email,
            projectId,
            email,
            role,
            projectId,
            email,
          )
      : db
          .prepare(
            `UPDATE atlasez_project_manager_grants SET operation_id=?,revision=revision+1
        WHERE project_id=? AND lower(email)=lower(?) AND revision=? AND source=?
        AND EXISTS(SELECT 1 FROM atlasez_project_memberships m WHERE m.project_id=? AND lower(m.email)=lower(?) AND m.role=?) AND ${activeSql}`,
          )
          .bind(
            nonce,
            projectId,
            email,
            revision,
            expectedSource,
            projectId,
            email,
            expectedRole,
            projectId,
            email,
            projectId,
            email,
            role,
            projectId,
            email,
          );
  const statements = [
    claim,
    db
      .prepare(
        `UPDATE atlasez_project_memberships SET role=? WHERE project_id=? AND lower(email)=lower(?)
      AND EXISTS(SELECT 1 FROM atlasez_project_manager_grants g WHERE g.project_id=? AND lower(g.email)=lower(?) AND g.operation_id=?)`,
      )
      .bind(role, projectId, email, projectId, email, nonce),
    db
      .prepare(
        `INSERT INTO admin_audit_log(id,actor_email,action,target_type,target_id,target_label,summary,details_json,created_at)
      SELECT ?,?,'member_updated','member',?,?,?, ?,? WHERE EXISTS(SELECT 1 FROM atlasez_project_manager_grants WHERE operation_id=?)`,
      )
      .bind(
        crypto.randomUUID(),
        actor,
        email,
        email,
        "プロジェクト管理者の任命を確認",
        JSON.stringify({ projectId, role, expectedRole, expectedSource }),
        now,
        nonce,
      ),
  ];
  statements.push(
    role === "manager"
      ? db
          .prepare(
            "UPDATE atlasez_project_manager_grants SET source='explicit',granted_by=?,granted_at=?,review_required=0 WHERE operation_id=?",
          )
          .bind(actor, now, nonce)
      : db
          .prepare(
            "DELETE FROM atlasez_project_manager_grants WHERE operation_id=?",
          )
          .bind(nonce),
  );
  const results = await db.batch(statements);
  if (Number(results[0]?.meta?.changes ?? 0) !== 1)
    return json(
      { error: "他の変更が先に反映されています。再読み込みしてください。" },
      409,
    );
  return json({
    ok: true,
    role,
    source: role === "manager" ? "explicit" : "none",
  });
}

/** A new automatic grant never overwrites an independent/legacy appointment. */
export function permissionDerivedAtlasManagerStatements(
  db: D1Database,
  email: string,
  isManager: boolean,
  actor = "admin-permission",
): D1PreparedStatement[] {
  if (isManager)
    return [
      db
        .prepare(
          `INSERT OR IGNORE INTO atlasez_project_manager_grants(project_id,email,source,granted_by,granted_at)
      SELECT 'atlas',?,'permission',?,? WHERE EXISTS (
        SELECT 1 FROM atlasez_project_memberships WHERE project_id='atlas' AND lower(email)=lower(?))`,
        )
        .bind(email, actor, new Date().toISOString(), email),
      db
        .prepare(
          "UPDATE atlasez_project_memberships SET role='manager' WHERE project_id='atlas' AND lower(email)=lower(?)",
        )
        .bind(email),
    ];
  return [
    db
      .prepare(
        `UPDATE atlasez_project_memberships SET role='member'
    WHERE project_id='atlas' AND lower(email)=lower(?)
      AND EXISTS (SELECT 1 FROM atlasez_project_manager_grants g WHERE g.project_id='atlas' AND lower(g.email)=lower(?) AND g.source='permission')
      AND NOT EXISTS (SELECT 1 FROM report_admin_permissions p WHERE lower(p.email)=lower(?) AND p.subject='*')`,
      )
      .bind(email, email, email),
    db
      .prepare(
        `DELETE FROM atlasez_project_manager_grants WHERE project_id='atlas' AND lower(email)=lower(?) AND source='permission'
      AND NOT EXISTS (SELECT 1 FROM report_admin_permissions p WHERE lower(p.email)=lower(?) AND p.subject='*')`,
      )
      .bind(email, email),
  ];
}

/** Read the outcome after a batch; an independent appointment can supersede revocation. */
export async function resolveAtlasManagerDisposition(
  db: D1Database,
  email: string,
  planned: ManagerRevocationPlan["disposition"],
): Promise<ManagerRevocationPlan["disposition"]> {
  if (planned === "none") return "none";
  const current = await db
    .prepare(
      "SELECT role FROM atlasez_project_memberships WHERE project_id='atlas' AND lower(email)=lower(?)",
    )
    .bind(email)
    .first<{ role: string }>();
  return current?.role === "manager" ? "preserved" : "revoked";
}

/** Unknown legacy appointments require an operator decision before automated global revocation. */
export async function planDiscordAtlasManagerRevocation(
  db: D1Database,
  email: string,
): Promise<{ reviewRequired: boolean; statements: D1PreparedStatement[] }> {
  const current = await db
    .prepare(
      `SELECT m.role,COALESCE(g.source,'legacy') AS source,COALESCE(g.review_required,0) AS review_required
    FROM atlasez_project_memberships m LEFT JOIN atlasez_project_manager_grants g ON g.project_id=m.project_id AND lower(g.email)=lower(m.email)
    WHERE m.project_id='atlas' AND lower(m.email)=lower(?)`,
    )
    .bind(email)
    .first<{ role: string; source: string; review_required: number }>();
  if (current?.role !== "manager" || current.source !== "legacy")
    return { reviewRequired: false, statements: [] };
  if (current.review_required) return { reviewRequired: true, statements: [] };
  const nonce = crypto.randomUUID(),
    now = new Date().toISOString();
  return {
    reviewRequired: true,
    statements: [
      db
        .prepare(
          `INSERT INTO atlasez_project_manager_grants(project_id,email,source,granted_by,granted_at,review_required,operation_id)
      VALUES ('atlas',?,'legacy','discord-sync',?,1,?)
      ON CONFLICT(project_id,email) DO UPDATE SET review_required=1,revision=revision+1,operation_id=excluded.operation_id WHERE source='legacy' AND review_required=0`,
        )
        .bind(email, now, nonce),
      db
        .prepare(
          `INSERT INTO admin_audit_log(id,actor_email,action,target_type,target_id,target_label,summary,details_json,created_at)
        SELECT ?,'discord-sync','member_updated','member',?,?,?,json_object('projectId','atlas','requestedDisposition','review-required-global-revocation-deferred','resultingRole','manager','resultingSource','legacy'),?
        WHERE EXISTS(SELECT 1 FROM atlasez_project_manager_grants WHERE operation_id=?)`,
        )
        .bind(
          crypto.randomUUID(),
          email,
          email,
          "付与元未確認のため全分野権限の自動解除を保留",
          now,
          nonce,
        ),
    ],
  };
}
