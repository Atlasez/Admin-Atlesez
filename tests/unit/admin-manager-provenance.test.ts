import { expect, it } from "vitest";
import { createAdminTestEnvironment } from "../helpers/admin-test-environment";
import {
  handleManagerGrants,
  planAtlasManagerRevocation,
  permissionDerivedAtlasManagerStatements,
} from "../../src/lib/admin-manager-provenance";
import type { D1Database } from "../../src/lib/admin-database";

const now = "2026-10-05T00:00:00.000Z";
function member(
  fixture: ReturnType<typeof createAdminTestEnvironment>,
  email: string,
  role = "member",
  project = "atlas",
) {
  fixture.db
    .prepare(
      "INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at) VALUES (?,?,?,?)",
    )
    .run(project, email, role, now);
  fixture.db
    .prepare(
      "INSERT OR IGNORE INTO editorial_member_profiles(email,display_name,bio,updated_at) VALUES (?,?,'基本プロフィール',?)",
    )
    .run(email, email, now);
  fixture.db
    .prepare(
      "INSERT INTO editorial_project_member_profiles(project_id,email,internal_bio,updated_at) VALUES (?,?,'自己紹介',?)",
    )
    .run(project, email, now);
}
it("自動付与されたAtlas管理者は全分野権限取消と同じbatchで降格し、別所属と通常利用を維持する", async () => {
  const f = createAdminTestEnvironment(),
    email = "derived@atlasez.test",
    db = f.env.REPORTS as D1Database;
  member(f, email);
  member(f, "independent@atlasez.test", "manager");
  f.db
    .prepare(
      "INSERT INTO report_admin_permissions(email,subject) VALUES (?,'*')",
    )
    .run(email);
  await db.batch(permissionDerivedAtlasManagerStatements(db, email, true));
  expect(
    f.db
      .prepare("SELECT role FROM atlasez_project_memberships WHERE email=?")
      .get(email),
  ).toEqual({ role: "manager" });
  expect(
    f.db
      .prepare(
        "SELECT source FROM atlasez_project_manager_grants WHERE email=?",
      )
      .get(email),
  ).toEqual({ source: "permission" });
  const plan = await planAtlasManagerRevocation(
    db,
    email,
    true,
    undefined,
    "global@atlasez.test",
  );
  expect(plan.disposition).toBe("revoked");
  await db.batch([
    db
      .prepare("DELETE FROM report_admin_permissions WHERE email=?")
      .bind(email),
    ...plan.statements,
  ]);
  expect(
    f.db
      .prepare("SELECT role FROM atlasez_project_memberships WHERE email=?")
      .get(email),
  ).toEqual({ role: "member" });
  expect(
    await (await f.request("/api/user/status", email)).json(),
  ).toMatchObject({ stage: "MEMBER" });
  expect(
    (await f.request("/api/admin/applications?project=atlas", email)).status,
  ).toBe(403);
  expect(
    f.db
      .prepare(
        "SELECT COUNT(*) AS count FROM admin_audit_log WHERE target_id=?",
      )
      .get(email),
  ).toEqual({ count: 1 });
});
it("独立任命は全分野権限取消で降格しない。付与元未確認は選択なしでは変更も通知もしない", async () => {
  const f = createAdminTestEnvironment(),
    db = f.env.REPORTS as D1Database;
  for (const email of ["explicit@atlasez.test", "legacy@atlasez.test"])
    member(f, email, "manager");
  f.db
    .prepare(
      "INSERT INTO atlasez_project_manager_grants(project_id,email,source,granted_by,granted_at) VALUES ('atlas',?,'explicit','global@atlasez.test',?)",
    )
    .run("explicit@atlasez.test", now);
  expect(
    (
      await planAtlasManagerRevocation(
        db,
        "explicit@atlasez.test",
        true,
        undefined,
        "global@atlasez.test",
      )
    ).disposition,
  ).toBe("preserved");
  const unknown = await planAtlasManagerRevocation(
    db,
    "legacy@atlasez.test",
    true,
    undefined,
    "global@atlasez.test",
  );
  expect(unknown.error).toContain("付与元が未確認");
  expect(unknown.statements).toEqual([]);
  const preserve = await planAtlasManagerRevocation(
    db,
    "legacy@atlasez.test",
    true,
    "preserve",
    "global@atlasez.test",
  );
  await db.batch(preserve.statements);
  expect(
    f.db
      .prepare(
        "SELECT source FROM atlasez_project_manager_grants WHERE email='legacy@atlasez.test'",
      )
      .get(),
  ).toEqual({ source: "explicit" });
});
it("ロール任命は古いrevision・担当外・停止中から保護し、メール・記事権限を付与しない", async () => {
  const f = createAdminTestEnvironment(),
    db = f.env.REPORTS as D1Database,
    email = "appoint@atlasez.test";
  member(f, email, "member", "thinking-cafe");
  const body = {
    projectId: "thinking-cafe",
    email,
    role: "manager",
    expectedRole: "member",
    expectedSource: "none",
    revision: 0,
  };
  const request = (value: unknown, origin = "https://admin.atlasez.test") =>
    new Request("https://admin.atlasez.test/api/admin/project-manager-grants", {
      method: "PATCH",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(value),
    });
  expect(
    (
      await handleManagerGrants(
        request(body, "https://outside.test"),
        db,
        "global@atlasez.test",
      )
    ).status,
  ).toBe(403);
  expect(
    (await handleManagerGrants(request(body), db, "global@atlasez.test"))
      .status,
  ).toBe(200);
  expect(
    (
      await handleManagerGrants(
        request({ ...body, role: "member" }),
        db,
        "global@atlasez.test",
      )
    ).status,
  ).toBe(409);
  expect(
    f.db
      .prepare("SELECT role FROM atlasez_project_memberships WHERE email=?")
      .get(email),
  ).toEqual({ role: "manager" });
  expect(
    (await f.request("/api/admin/project-manager-grants", email)).status,
  ).toBe(403);
  expect(
    f.db
      .prepare(
        "SELECT COUNT(*) AS count FROM report_admin_permissions WHERE email=?",
      )
      .get(email),
  ).toEqual({ count: 0 });
  expect(
    f.db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_application_email_deliveries",
      )
      .get(),
  ).toEqual({ count: 0 });
});
it("Atlasの活動休止は記事権限を停止し、別の有効所属は利用を維持する", async () => {
  const f = createAdminTestEnvironment(),
    email = "paused@atlasez.test";
  member(f, email);
  member(f, email, "member", "thinking-cafe");
  f.db
    .prepare(
      "INSERT INTO report_admin_permissions(email,subject) VALUES (?,'mathematics')",
    )
    .run(email);
  f.db
    .prepare(
      "INSERT INTO atlasez_project_member_lifecycle(project_id,email,state,role_snapshot,last_request_id,updated_at) VALUES ('atlas',?,'paused','member','isolated-paused',?)",
    )
    .run(email, now);
  expect(
    await (await f.request("/api/user/status", email)).json(),
  ).toMatchObject({ stage: "MEMBER" });
  expect((await f.request("/api/admin/editor/documents", email)).status).toBe(
    403,
  );
  expect((await f.request("/api/admin/member-tasks", email)).status).toBe(200);
});
