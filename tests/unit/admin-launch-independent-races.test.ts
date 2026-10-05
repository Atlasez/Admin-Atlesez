import { expect, it } from "vitest";
import worker from "../../src/admin-worker";
import {
  applyDueMemberProcedures,
  handleMemberProcedures,
} from "../../src/lib/admin-member-procedures";
import type {
  D1Database,
  D1PreparedStatement,
} from "../../src/lib/admin-database";
import { createAdminTestEnvironment } from "../helpers/admin-test-environment";

it.each(["project", "common"] as const)(
  "審査画面の表示後に更新された提案を古い画面から承認しない: %s",
  async (kind) => {
    const fixture = createAdminTestEnvironment();
    const id = "22222222-2222-4222-8222-222222222222",
      email = "member@atlasez.test",
      now = "2026-10-05T10:00:01.000Z";
    fixture.db
      .prepare(
        kind === "project"
          ? "INSERT INTO editorial_project_profile_change_requests(id,project_id,email,proposed_internal_bio,status,submitted_at) VALUES (?,'thinking-cafe',?,'新しい内容','pending',?)"
          : "INSERT INTO editorial_member_profile_change_requests(id,email,proposed_display_name,proposed_bio,status,submitted_at) VALUES (?,?,'表示名','新しい内容','pending',?)",
      )
      .run(id, email, now);
    await fixture.request("/api/user/status", "global@atlasez.test");
    const response = await worker.fetch(
      new Request(
        `https://admin.atlasez.test/api/admin/${kind === "project" ? "project-profile-change-requests" : "profile-change-requests"}/${id}`,
        {
          method: "PATCH",
          headers: {
            origin: "https://admin.atlasez.test",
            "content-type": "application/json",
            cookie: "atlasez_admin_session=isolated-global@atlasez.test",
          },
          body: JSON.stringify({
            action: "approve",
            expectedSubmittedAt: "2026-10-05T10:00:00.000Z",
            idempotencyKey: "stale-review-screen",
          }),
        },
      ),
      fixture.env as never,
    );
    expect(response.status, await response.clone().text()).toBe(409);
    const table = `editorial_${kind === "project" ? "project" : "member"}_profile_change_requests`;
    expect(
      fixture.db.prepare(`SELECT status FROM ${table} WHERE id=?`).get(id),
    ).toEqual({ status: "pending" });
    expect(
      fixture.db
        .prepare("SELECT COUNT(*) AS count FROM workflow_transition_events")
        .get(),
    ).toEqual({ count: 0 });
  },
);

it("承認後に作成された原稿には引継ぎメモの再確認が必要", async () => {
  const fixture = createAdminTestEnvironment();
  const db = fixture.env.REPORTS as D1Database;
  const email = "departing@atlasez.test",
    now = "2026-10-05T10:00:00.000Z";
  fixture.db
    .prepare(
      "INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at) VALUES ('atlas',?,'member',?)",
    )
    .run(email, now);
  const send = (body: unknown, review = false) =>
    handleMemberProcedures(
      new Request(
        `https://admin.atlasez.test/api/admin/member-procedures?project=atlas${review ? "&view=review" : ""}`,
        {
          method: "POST",
          headers: {
            origin: "https://admin.atlasez.test",
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        },
      ),
      {
        db,
        email: review ? "global@atlasez.test" : email,
        global: review,
        now,
      },
    );
  const submitted = await send({
    type: "pause",
    effectiveFrom: "2026-10-06",
    reason: "休止",
  });
  expect(submitted.status).toBe(201);
  const row = (await submitted.json()).request;
  expect(
    (
      await send(
        {
          id: row.id,
          action: "approve",
          expectedUpdatedAt: row.updated_at,
          handoverConfirmed: true,
        },
        true,
      )
    ).status,
  ).toBe(200);
  fixture.db
    .prepare(
      "INSERT INTO editorial_documents(id,subject,category,slug,title,concept_id,created_by,updated_by,created_at,updated_at) VALUES ('later-draft','math','test','later-draft','承認後の原稿','later-draft',?,?,?,?)",
    )
    .run(email, email, now, now);
  expect(
    await applyDueMemberProcedures(db, "2026-10-06T01:00:00.000Z"),
  ).toEqual({ applied: 0 });
  expect(
    fixture.db
      .prepare(
        "SELECT status FROM atlasez_member_procedure_requests WHERE id=?",
      )
      .get(row.id),
  ).toEqual({ status: "scheduled" });
  expect(
    fixture.db
      .prepare("SELECT COUNT(*) AS count FROM atlasez_project_member_lifecycle")
      .get(),
  ).toEqual({ count: 0 });
  fixture.db
    .prepare(
      "UPDATE editorial_documents SET status='approved' WHERE id='later-draft'",
    )
    .run();
  expect(
    await applyDueMemberProcedures(db, "2026-10-06T01:05:00.000Z"),
  ).toEqual({ applied: 1 });
});

it.each(["project", "common"] as const)(
  "自己紹介の提案が審査中に更新された場合に古い内容を承認しない: %s",
  async (kind) => {
    const fixture = createAdminTestEnvironment();
    const email = "member@atlasez.test",
      reviewer =
        kind === "project" ? "reviewer@atlasez.test" : "global@atlasez.test",
      now = "2026-10-05T10:00:00.000Z",
      id = "11111111-1111-4111-8111-111111111111";
    for (const [user, role] of [
      [email, "member"],
      [reviewer, "manager"],
    ])
      fixture.db
        .prepare(
          "INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at) VALUES ('thinking-cafe',?,?,?)",
        )
        .run(user, role, now);
    fixture.db
      .prepare(
        "INSERT INTO editorial_tasks(id,project_id,title,created_by,created_at,updated_at) VALUES ('review-task','thinking-cafe','承認対象',?,?,?)",
      )
      .run(email, now, now);
    const table = `editorial_${kind === "project" ? "project" : "member"}_profile_change_requests`;
    const bioColumn =
      kind === "project" ? "proposed_internal_bio" : "proposed_bio";
    fixture.db
      .prepare(
        kind === "project"
          ? "INSERT INTO editorial_project_profile_change_requests(id,project_id,email,proposed_internal_bio,status,task_id,submitted_at) VALUES (?,'thinking-cafe',?,'最初の内容','pending','review-task',?)"
          : "INSERT INTO editorial_member_profile_change_requests(id,email,proposed_display_name,proposed_bio,status,task_id,submitted_at) VALUES (?,?,'共通表示名','最初の内容','pending','review-task',?)",
      )
      .run(id, email, now);
    const base = fixture.env.REPORTS as D1Database;
    let intercepted = false;
    const wrap = (
      query: string,
      statement: D1PreparedStatement,
    ): D1PreparedStatement => ({
      bind: (...values) => wrap(query, statement.bind(...values)),
      first: async <T>() => {
        const snapshot = await statement.first<T>();
        if (
          !intercepted &&
          query.includes(`SELECT * FROM ${table} WHERE id=?`)
        ) {
          intercepted = true;
          fixture.db
            .prepare(
              `UPDATE ${table} SET ${bioColumn}='新しい内容',submitted_at='2026-10-05T10:00:01.000Z' WHERE id=?`,
            )
            .run(id);
        }
        return snapshot;
      },
      all: <T>() => statement.all<T>(),
      run: () => statement.run(),
    });
    const d1: D1Database = {
      prepare: (query) => wrap(query, base.prepare(query)),
      batch: <T>(statements: D1PreparedStatement[]) =>
        base.batch<T>(statements),
    };
    await fixture.request("/api/user/status", reviewer);
    const response = await worker.fetch(
      new Request(
        `https://admin.atlasez.test/api/admin/${kind === "project" ? "project-profile-change-requests" : "profile-change-requests"}/${id}`,
        {
          method: "PATCH",
          headers: {
            origin: "https://admin.atlasez.test",
            "content-type": "application/json",
            cookie: `atlasez_admin_session=isolated-${reviewer}`,
          },
          body: JSON.stringify({
            action: "approve",
            idempotencyKey: "independent-review-race",
          }),
        },
      ),
      { ...fixture.env, REPORTS: d1 } as never,
    );
    expect(response.status).toBe(409);
    expect(intercepted).toBe(true);
    expect(
      fixture.db
        .prepare(
          `SELECT status,${bioColumn} AS proposed_internal_bio FROM ${table} WHERE id=?`,
        )
        .get(id),
    ).toEqual({ status: "pending", proposed_internal_bio: "新しい内容" });
    expect(
      fixture.db
        .prepare(
          `SELECT COUNT(*) AS count FROM editorial_${kind === "project" ? "project_member_profiles" : "member_profiles"} WHERE email='member@atlasez.test'`,
        )
        .get(),
    ).toEqual({ count: 0 });
    expect(
      fixture.db
        .prepare("SELECT status FROM editorial_tasks WHERE id='review-task'")
        .get(),
    ).toEqual({ status: "open" });
  },
);

it.each(["project", "common"] as const)(
  "自己紹介の更新が承認と競合した場合に承認済みタスクを再開しない: %s",
  async (kind) => {
    const fixture = createAdminTestEnvironment();
    const email = "member@atlasez.test",
      now = "2026-10-05T10:00:00.000Z";
    fixture.db
      .prepare(
        "INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at) VALUES ('thinking-cafe',?,'member',?)",
      )
      .run(email, now);
    fixture.db
      .prepare(
        "INSERT INTO editorial_tasks(id,project_id,title,created_by,created_at,updated_at) VALUES ('profile-task','thinking-cafe','承認対象',?,?,?)",
      )
      .run(email, now, now);
    if (kind === "project")
      fixture.db
        .prepare(
          "INSERT INTO editorial_project_profile_change_requests(id,project_id,email,proposed_internal_bio,status,task_id,submitted_at) VALUES ('profile-request','thinking-cafe',?,'初回','pending','profile-task',?)",
        )
        .run(email, now);
    else {
      fixture.db
        .prepare(
          "INSERT INTO editorial_member_profiles(email,display_name,bio,avatar_url,updated_at) VALUES (?,'共通表示名','共通情報','https://example.test/avatar.png',?)",
        )
        .run(email, now);
      fixture.db
        .prepare(
          "INSERT INTO editorial_member_profile_change_requests(id,email,proposed_display_name,proposed_bio,status,task_id,submitted_at) VALUES ('profile-request',?,'共通表示名','初回','pending','profile-task',?)",
        )
        .run(email, now);
    }
    const base = fixture.env.REPORTS as D1Database;
    let intercepted = false;
    const wrap = (
      query: string,
      statement: D1PreparedStatement,
    ): D1PreparedStatement => ({
      bind: (...values) => wrap(query, statement.bind(...values)),
      first: async <T>() => {
        const snapshot = await statement.first<T>();
        if (
          !intercepted &&
          query.includes(
            `SELECT id,task_id,submitted_at FROM editorial_${kind === "project" ? "project" : "member"}_profile_change_requests`,
          )
        ) {
          intercepted = true;
          fixture.db
            .prepare(
              `UPDATE editorial_${kind === "project" ? "project" : "member"}_profile_change_requests SET status='approved' WHERE id='profile-request'`,
            )
            .run();
          fixture.db
            .prepare(
              "UPDATE editorial_tasks SET status='done' WHERE id='profile-task'",
            )
            .run();
        }
        return snapshot;
      },
      all: <T>() => statement.all<T>(),
      run: () => statement.run(),
    });
    const d1: D1Database = {
      prepare: (query) => wrap(query, base.prepare(query)),
      batch: <T>(statements: D1PreparedStatement[]) =>
        base.batch<T>(statements),
    };
    await fixture.request("/api/user/status", email);
    const response = await worker.fetch(
      new Request(
        `https://admin.atlasez.test/api/admin/${kind === "project" ? "project-profile" : "profile"}`,
        {
          method: "PUT",
          headers: {
            origin: "https://admin.atlasez.test",
            "content-type": "application/json",
            cookie: `atlasez_admin_session=isolated-${email}`,
          },
          body: JSON.stringify(
            kind === "project"
              ? {
                  projectId: "thinking-cafe",
                  internalBio: "変更後",
                }
              : { bio: "変更後" },
          ),
        },
      ),
      { ...fixture.env, REPORTS: d1 } as never,
    );
    expect(intercepted).toBe(true);
    expect(intercepted).toBe(true);
    expect(response.status, await response.clone().text()).toBe(409);
    expect(
      fixture.db
        .prepare("SELECT status FROM editorial_tasks WHERE id='profile-task'")
        .get(),
    ).toEqual({ status: "done" });
  },
);
