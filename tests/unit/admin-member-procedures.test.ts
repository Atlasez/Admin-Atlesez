import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, expect, it } from "vitest";
import {
  handleMemberProcedures,
  applyDueMemberProcedures,
} from "../../src/lib/admin-member-procedures";
import type { D1Database } from "../../src/lib/admin-database";
const databases: DatabaseSync[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});
const now = "2026-10-05T10:00:00.000Z";
function fixture() {
  const sql = new DatabaseSync(":memory:");
  databases.push(sql);
  const dir = new URL("../../migrations/", import.meta.url);
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sql.exec(readFileSync(new URL(f, dir), "utf8"));
  sql.exec("PRAGMA foreign_keys=ON");
  const statement = (query: string) => {
    let values: SQLInputValue[] = [];
    return statementBound();
    function statementBound() {
      return {
        bind: (...v: unknown[]) => {
          values = v as SQLInputValue[];
          return statementBound();
        },
        first: async () => sql.prepare(query).get(...values) ?? null,
        all: async () => ({ results: sql.prepare(query).all(...values) }),
        run: async () => ({
          meta: { changes: Number(sql.prepare(query).run(...values).changes) },
        }),
      };
    }
  };
  const db = {
    prepare: statement,
    batch: async (statements: Array<{ run: () => Promise<unknown> }>) => {
      sql.exec("BEGIN");
      try {
        const results = [];
        for (const s of statements) results.push(await s.run());
        sql.exec("COMMIT");
        return results;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  } as unknown as D1Database;
  for (const [email, role] of [
    ["member@atlasez.test", "member"],
    ["manager@atlasez.test", "manager"],
  ])
    sql
      .prepare(
        "INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at) VALUES ('thinking-cafe',?,?,?)",
      )
      .run(email, role, now);
  const send = (
    email: string,
    body?: unknown,
    review = false,
    project = "thinking-cafe",
    at = now,
  ) =>
    handleMemberProcedures(
      new Request(
        `https://admin.atlasez.test/api/admin/member-procedures?project=${project}${review ? "&view=review" : ""}`,
        {
          method: body === undefined ? "GET" : "POST",
          headers: {
            origin: "https://admin.atlasez.test",
            "content-type": "application/json",
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
      ),
      { db, email, global: email === "global@atlasez.test", now: at },
    );
  const submit = async (type = "pause", from = "2026-10-05") => {
    const res = await send("member@atlasez.test", {
      type,
      effectiveFrom: from,
      timezone: "Asia/Tokyo",
      reason: "活動変更",
      confirm: true,
    });
    expect(res.status, await res.clone().text()).toBe(201);
    return (await res.json()).request as { id: string; updated_at: string };
  };
  const approve = (
    row: { id: string; updated_at: string },
    extra: Record<string, unknown> = {},
  ) =>
    send(
      "manager@atlasez.test",
      {
        id: row.id,
        action: "approve",
        expectedUpdatedAt: row.updated_at,
        handoverConfirmed: true,
        ...extra,
      },
      true,
    );
  return { sql, db, send, submit, approve };
}
it("休止と再開を審査後に対象プロジェクトだけ反映し作業と通知件数を保持する", async () => {
  const { sql, submit, approve, send } = fixture();
  sql
    .prepare(
      "INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at) VALUES ('secretariat','member@atlasez.test','member',?)",
    )
    .run(now);
  const request = await submit();
  expect((await approve(request)).status).toBe(200);
  expect(
    sql
      .prepare(
        "SELECT state FROM atlasez_project_member_lifecycle WHERE project_id='thinking-cafe'",
      )
      .get(),
  ).toEqual({ state: "paused" });
  expect(
    sql
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_project_memberships WHERE email='member@atlasez.test'",
      )
      .get(),
  ).toEqual({ count: 2 });
  expect(
    sql
      .prepare(
        "SELECT status,applied_at FROM atlasez_member_procedure_requests WHERE id=?",
      )
      .get(request.id),
  ).toEqual({ status: "applied", applied_at: now });
  expect((await send("member@atlasez.test")).status).toBe(200);
  const restart = await submit("restart");
  expect((await approve(restart)).status).toBe(200);
  expect(
    sql
      .prepare(
        "SELECT state FROM atlasez_project_member_lifecycle WHERE project_id='thinking-cafe'",
      )
      .get(),
  ).toEqual({ state: "active" });
  expect(
    sql
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_application_email_deliveries",
      )
      .get(),
  ).toEqual({ count: 0 });
  expect(
    sql.prepare("SELECT COUNT(*) AS count FROM admin_audit_log").get(),
  ).toEqual({ count: 6 });
  expect(sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});
it("未来の承認は実行待ちとして保持し日本時間の開始日を迎えてから一度だけ適用する", async () => {
  const { sql, db, submit, approve } = fixture();
  const row = await submit("withdrawal", "2026-10-06");
  expect((await approve(row)).status).toBe(200);
  expect(
    sql
      .prepare(
        "SELECT status,effective_at,applied_at FROM atlasez_member_procedure_requests WHERE id=?",
      )
      .get(row.id),
  ).toEqual({
    status: "scheduled",
    effective_at: "2026-10-05T15:00:00Z",
    applied_at: null,
  });
  expect(
    sql
      .prepare("SELECT COUNT(*) AS count FROM atlasez_project_member_lifecycle")
      .get(),
  ).toEqual({ count: 0 });
  expect(
    await applyDueMemberProcedures(db, "2026-10-05T14:59:59.000Z"),
  ).toEqual({ applied: 0 });
  expect(
    await applyDueMemberProcedures(db, "2026-10-05T15:00:01.000Z"),
  ).toEqual({ applied: 1 });
  expect(
    await applyDueMemberProcedures(db, "2026-10-05T15:00:02.000Z"),
  ).toEqual({ applied: 0 });
  expect(
    sql.prepare("SELECT state FROM atlasez_project_member_lifecycle").get(),
  ).toEqual({ state: "withdrawn" });
});
it("別プロジェクト審査・本人承認・未引き継ぎのタスク・古い画面による承認を拒否する", async () => {
  const { sql, send, submit, approve } = fixture();
  const row = await submit();
  expect((await send("stranger@atlasez.test", undefined, true)).status).toBe(
    403,
  );
  expect(
    (
      await send(
        "manager@atlasez.test",
        {
          id: row.id,
          action: "approve",
          expectedUpdatedAt: row.updated_at,
          handoverConfirmed: true,
        },
        true,
        "secretariat",
      )
    ).status,
  ).toBe(403);
  expect(
    (await send("member@atlasez.test", { id: row.id, action: "approve" }, true))
      .status,
  ).toBe(403);
  sql
    .prepare(
      "INSERT INTO editorial_tasks(id,project_id,assignee_email,title,created_by,created_at,updated_at) VALUES ('assigned','thinking-cafe','member@atlasez.test','引継ぎ対象','manager@atlasez.test',?,?)",
    )
    .run(now, now);
  expect((await approve(row, { handoverNote: "メモだけ" })).status).toBe(409);
  sql
    .prepare(
      "UPDATE editorial_tasks SET assignee_email='manager@atlasez.test' WHERE id='assigned'",
    )
    .run();
  expect((await approve(row, { expectedUpdatedAt: "古い画面" })).status).toBe(
    409,
  );
  expect((await approve(row)).status).toBe(200);
  expect(
    sql
      .prepare("SELECT assignee_email FROM editorial_tasks WHERE id='assigned'")
      .get(),
  ).toEqual({ assignee_email: "manager@atlasez.test" });
});
it("却下・本人取り下げ・未処理の重複申請を処理し確認ログを保存する", async () => {
  const { sql, submit, send } = fixture();
  const row = await submit();
  expect(
    (
      await send("member@atlasez.test", {
        type: "pause",
        effectiveFrom: "2026-10-05",
        reason: "重複",
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await send(
        "manager@atlasez.test",
        { id: row.id, action: "reject", expectedUpdatedAt: row.updated_at },
        true,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await send(
        "manager@atlasez.test",
        {
          id: row.id,
          action: "reject",
          expectedUpdatedAt: row.updated_at,
          reviewNote: "時期を相談",
        },
        true,
      )
    ).status,
  ).toBe(200);
  const another = await submit();
  expect(
    (await send("member@atlasez.test", { id: another.id, action: "cancel" }))
      .status,
  ).toBe(200);
  expect(
    sql
      .prepare(
        "SELECT status FROM atlasez_member_procedure_requests ORDER BY rowid",
      )
      .all(),
  ).toEqual([{ status: "rejected" }, { status: "cancelled" }]);
  expect(
    sql
      .prepare("SELECT COUNT(*) AS count FROM atlasez_project_member_lifecycle")
      .get(),
  ).toEqual({ count: 0 });
});
it("最後の運営内運営は休止できず承認後の所属削除も自動復元しない", async () => {
  const { sql, db, send, submit, approve } = fixture();
  const own = await send("manager@atlasez.test", {
    type: "pause",
    effectiveFrom: "2026-10-05",
    reason: "休止",
  });
  const managerRequest = (await own.json()).request;
  expect(
    (
      await send(
        "global@atlasez.test",
        {
          id: managerRequest.id,
          action: "approve",
          expectedUpdatedAt: managerRequest.updated_at,
          handoverConfirmed: true,
        },
        true,
      )
    ).status,
  ).toBe(409);
  const row = await submit("pause", "2026-10-06");
  expect((await approve(row)).status).toBe(200);
  sql
    .prepare(
      "DELETE FROM atlasez_project_memberships WHERE email='member@atlasez.test'",
    )
    .run();
  expect(
    await applyDueMemberProcedures(db, "2026-10-06T01:00:00.000Z"),
  ).toEqual({ applied: 0 });
  expect(
    sql
      .prepare(
        "SELECT status FROM atlasez_member_procedure_requests WHERE id=?",
      )
      .get(row.id),
  ).toEqual({ status: "cancelled" });
  expect(
    sql
      .prepare("SELECT COUNT(*) AS count FROM atlasez_project_member_lifecycle")
      .get(),
  ).toEqual({ count: 0 });
});
it("実在しない日付・越境送信を拒否しUUID所属で申請先を確定する", async () => {
  const { sql, db, send } = fixture();
  expect(
    (
      await send("member@atlasez.test", {
        type: "pause",
        effectiveFrom: "2026-02-30",
        reason: "誤日付",
      })
    ).status,
  ).toBe(400);
  const id = "11111111-1111-4111-8111-111111111111";
  sql
    .prepare(
      "INSERT INTO atlasez_projects(id,slug,name,description,created_at) VALUES (?,'custom-procedure','追加プロジェクト','',?)",
    )
    .run(id, now);
  sql
    .prepare(
      "INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at) VALUES (?,'member@atlasez.test','member',?)",
    )
    .run(id, now);
  const res = await send(
    "member@atlasez.test",
    {
      type: "pause",
      effectiveFrom: "2026-10-05",
      reason: "UUID先",
      projectId: "atlas",
    },
    false,
    "custom-procedure",
  );
  expect(res.status).toBe(201);
  expect((await res.json()).request.project_id).toBe(id);
  const cross = await handleMemberProcedures(
    new Request(
      "https://admin.atlasez.test/api/admin/member-procedures?project=thinking-cafe",
      {
        method: "POST",
        headers: { origin: "https://other.example" },
        body: "{}",
      },
    ),
    { db, email: "member@atlasez.test", global: false, now },
  );
  expect(cross.status).toBe(403);
});

it("承認後に増えた担当タスクは予定日の実行を止め引き継ぎ後に適用する", async () => {
  const { sql, db, submit, approve } = fixture();
  const row = await submit("pause", "2026-10-06");
  expect((await approve(row)).status).toBe(200);
  sql
    .prepare(
      "INSERT INTO editorial_tasks(id,project_id,assignee_email,title,created_by,created_at,updated_at) VALUES ('new-assignment','thinking-cafe','member@atlasez.test','承認後の担当','manager@atlasez.test',?,?)",
    )
    .run(now, now);
  expect(
    await applyDueMemberProcedures(db, "2026-10-06T01:00:00.000Z"),
  ).toEqual({ applied: 0 });
  expect(
    sql
      .prepare(
        "SELECT status,execution_error,applied_at FROM atlasez_member_procedure_requests WHERE id=?",
      )
      .get(row.id),
  ).toEqual({
    status: "scheduled",
    execution_error: "担当タスクの引き継ぎ完了を確認できないため実行待ちです。",
    applied_at: null,
  });
  sql
    .prepare(
      "UPDATE editorial_tasks SET status='done' WHERE id='new-assignment'",
    )
    .run();
  expect(
    await applyDueMemberProcedures(db, "2026-10-06T01:05:00.000Z"),
  ).toEqual({ applied: 1 });
});

it("予定申請を本人が取り下げると期日到来後も実行しない", async () => {
  const { sql, db, send, submit, approve } = fixture();
  const row = await submit("pause", "2026-10-06");
  expect((await approve(row)).status).toBe(200);
  expect(
    (await send("member@atlasez.test", { id: row.id, action: "cancel" }))
      .status,
  ).toBe(200);
  expect(
    await applyDueMemberProcedures(db, "2026-10-06T01:00:00.000Z"),
  ).toEqual({ applied: 0 });
  expect(
    sql
      .prepare("SELECT COUNT(*) AS count FROM atlasez_project_member_lifecycle")
      .get(),
  ).toEqual({ count: 0 });
});

it("活動再開は本人申請と他の運営の承認が必要で越境した本人操作を許可しない", async () => {
  const { sql, send, submit, approve } = fixture();
  const pause = await submit();
  expect((await approve(pause)).status).toBe(200);
  expect(
    (
      await send("stranger@atlasez.test", {
        type: "restart",
        effectiveFrom: "2026-10-05",
        reason: "他人の復帰",
      })
    ).status,
  ).toBe(403);
  const restart = await submit("restart");
  expect(
    (
      await send(
        "member@atlasez.test",
        {
          id: restart.id,
          action: "approve",
          expectedUpdatedAt: restart.updated_at,
        },
        true,
      )
    ).status,
  ).toBe(403);
  expect(
    sql.prepare("SELECT state FROM atlasez_project_member_lifecycle").get(),
  ).toEqual({ state: "paused" });
  expect((await approve(restart)).status).toBe(200);
});

it("同じ古い画面からの二重承認は拒否し審査ログを重複作成しない", async () => {
  const { sql, submit, approve } = fixture();
  const row = await submit("pause", "2026-10-06");
  expect((await approve(row)).status).toBe(200);
  expect((await approve(row)).status).toBe(409);
  expect(
    sql.prepare("SELECT COUNT(*) AS count FROM admin_audit_log").get(),
  ).toEqual({ count: 2 });
});

it("審査の監査記録保存が失敗したら承認状態を一緒にロールバックする", async () => {
  const { sql, submit, approve } = fixture();
  const row = await submit();
  sql.exec(
    "CREATE TRIGGER fail_procedure_audit BEFORE INSERT ON admin_audit_log BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;",
  );
  await expect(approve(row)).rejects.toThrow("audit unavailable");
  expect(
    sql
      .prepare(
        "SELECT status,reviewed_by,reviewed_at FROM atlasez_member_procedure_requests WHERE id=?",
      )
      .get(row.id),
  ).toEqual({ status: "pending", reviewed_by: null, reviewed_at: null });
  expect(
    sql
      .prepare("SELECT COUNT(*) AS count FROM atlasez_project_member_lifecycle")
      .get(),
  ).toEqual({ count: 0 });
});

it("予定反映の監査保存が失敗したら参加状態と反映日時をロールバックし再試行できる", async () => {
  const { sql, db, submit, approve } = fixture();
  const row = await submit("pause", "2026-10-06");
  expect((await approve(row)).status).toBe(200);
  sql.exec(
    "CREATE TRIGGER fail_procedure_apply_audit BEFORE INSERT ON admin_audit_log WHEN NEW.summary='参加状態を変更' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;",
  );
  await expect(
    applyDueMemberProcedures(db, "2026-10-06T01:00:00.000Z"),
  ).rejects.toThrow("audit unavailable");
  expect(
    sql
      .prepare(
        "SELECT status,applied_at FROM atlasez_member_procedure_requests WHERE id=?",
      )
      .get(row.id),
  ).toEqual({ status: "scheduled", applied_at: null });
  expect(
    sql
      .prepare("SELECT COUNT(*) AS count FROM atlasez_project_member_lifecycle")
      .get(),
  ).toEqual({ count: 0 });
  sql.exec("DROP TRIGGER fail_procedure_apply_audit;");
  expect(
    await applyDueMemberProcedures(db, "2026-10-06T01:05:00.000Z"),
  ).toEqual({ applied: 1 });
});

it("手続きAPIの未知のパスと未対応HTTPメソッドを拒否する", async () => {
  const { db } = fixture();
  const context = { db, email: "member@atlasez.test", global: false, now };
  const method = await handleMemberProcedures(
    new Request(
      "https://admin.atlasez.test/api/admin/member-procedures?project=thinking-cafe",
      { method: "DELETE" },
    ),
    context,
  );
  expect(method.status).toBe(405);
  for (const suffix of [
    "-unexpected",
    "/unknown",
    "/11111111-1111-4111-8111-111111111111/apply",
  ]) {
    const response = await handleMemberProcedures(
      new Request(
        `https://admin.atlasez.test/api/admin/member-procedures${suffix}`,
      ),
      context,
    );
    expect(response.status).toBe(404);
  }
});

it("テスト指定の担当タスクを本番の引き継ぎ判定に含めず作業履歴は保持する", async () => {
  const { sql, submit, approve } = fixture();
  sql
    .prepare(
      "INSERT INTO editorial_tasks(id,project_id,assignee_email,title,created_by,created_at,updated_at,is_test_data) VALUES ('trial-assignment','thinking-cafe','member@atlasez.test','テスト担当','manager@atlasez.test',?,?,1)",
    )
    .run(now, now);
  const row = await submit();
  expect((await approve(row)).status).toBe(200);
  expect(
    sql.prepare("SELECT state FROM atlasez_project_member_lifecycle").get(),
  ).toEqual({ state: "paused" });
  expect(
    sql
      .prepare(
        "SELECT title,is_test_data,assignee_email FROM editorial_tasks WHERE id='trial-assignment'",
      )
      .get(),
  ).toEqual({
    title: "テスト担当",
    is_test_data: 1,
    assignee_email: "member@atlasez.test",
  });
});
