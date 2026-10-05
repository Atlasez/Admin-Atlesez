import { expect, it } from "vitest";
import { createAdminTestEnvironment } from "../helpers/admin-test-environment";

it("プロフィール未入力の担当責任者の受入フォローはAPIと直接ページの認可が一致する", async () => {
  const { db, request } = createAdminTestEnvironment();
  const email = "unfinished-manager@example.test",
    now = new Date().toISOString();
  db.prepare(
    "INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at) VALUES ('thinking-cafe',?,'manager',?)",
  ).run(email, now);
  expect(
    (await request("/api/admin/member-intake?project=thinking-cafe", email))
      .status,
  ).toBe(200);
  expect(
    (await request("/admin/member-intake/?project=thinking-cafe", email))
      .status,
  ).toBe(200);
  expect(
    (await request("/admin/member-intake/?project=atlas", email)).status,
  ).toBe(403);
  expect((await request("/admin/member-intake/", email)).status).toBe(403);
  expect(
    (await request("/api/admin/member-intake?project=thinking-cafe", email, {}))
      .status,
  ).toBe(403);
  db.prepare(
    "INSERT INTO atlasez_project_member_lifecycle(project_id,email,state,role_snapshot,last_request_id,updated_at) VALUES ('thinking-cafe',?,'paused','manager','isolated',?)",
  ).run(email, now);
  expect(
    (await request("/api/admin/member-intake?project=thinking-cafe", email))
      .status,
  ).toBe(403);
  expect(
    (await request("/admin/member-intake/?project=thinking-cafe", email))
      .status,
  ).toBe(403);
  expect(
    (await request("/api/admin/developer/diagnostics", email)).status,
  ).toBe(403);
});

it("直接追加した通常メンバーは本人情報と所属自己紹介を開け、休止後は再開手続きだけを継続できる", async () => {
  const { db, request } = createAdminTestEnvironment();
  const email = "direct-member@example.test",
    now = new Date().toISOString();
  db.prepare(
    "INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at) VALUES ('thinking-cafe',?,'member',?)",
  ).run(email, now);
  db.prepare(
    "INSERT INTO editorial_member_profiles(email,display_name,bio,updated_at) VALUES (?,'直接参加メンバー','共通情報',?)",
  ).run(email, now);
  db.prepare(
    "INSERT INTO editorial_project_member_profiles(project_id,email,internal_bio,updated_at) VALUES ('thinking-cafe',?,'所属自己紹介',?)",
  ).run(email, now);
  for (const path of [
    "/admin/member-profile/",
    "/api/admin/profile",
    "/admin/workspace/?project=thinking-cafe",
    "/api/admin/project-profile?project=thinking-cafe",
    "/admin/introductions/?project=thinking-cafe",
    "/admin/thinking-cafe/",
    "/admin/member-tasks/?project=thinking-cafe",
    "/admin/member-calendar/?project=thinking-cafe",
  ])
    expect((await request(path, email)).status, path).toBe(200);
  expect(
    (await request("/admin/member-intake/?project=thinking-cafe", email))
      .status,
  ).toBe(403);
  db.prepare(
    "INSERT INTO atlasez_project_member_lifecycle(project_id,email,state,role_snapshot,last_request_id,updated_at) VALUES ('thinking-cafe',?,'paused','member','isolated',?)",
  ).run(email, now);
  for (const path of [
    "/admin/workspace/?project=thinking-cafe",
    "/api/admin/project-introductions?project=thinking-cafe",
    "/admin/thinking-cafe/",
  ])
    expect((await request(path, email)).status, path).toBe(403);
  expect(
    (await request("/admin/procedures/?project=thinking-cafe", email)).status,
  ).toBe(200);
  const procedures = await request(
    "/api/admin/member-procedures?project=thinking-cafe",
    email,
  );
  expect(procedures.status).toBe(200);
  expect(await procedures.json()).toMatchObject({
    project: { state: "paused" },
    canReview: false,
  });
  expect(await (await request("/api/admin/my-intake", email)).json()).toEqual({
    entries: [],
  });
});
