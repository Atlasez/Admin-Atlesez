import { expect, it } from "vitest";
import { createAdminTestEnvironment } from "../helpers/admin-test-environment";

const hkuEmail = "hku.myoon.log34@gmail.com";
const batchId = "b44cd0c1-e0c2-41a8-94ba-74e081a3160a";
const migrationMember = {
  email: hkuEmail,
  subjects: ["chemistry"],
  projectManager: true,
  sourceNote: "既存の運営・Atlasezメンバー。運営サイト作成のフィードバック要員",
};

it("既存メンバー移行はプロフィール未完了でも化学担当と独立任命を保存し、Discordに触れない", async () => {
  const fixture = createAdminTestEnvironment();
  const normalGrant = await fixture.request(
    "/api/admin/report-admin-permissions",
    "global@atlasez.test",
    { email: hkuEmail, subjects: ["chemistry"] },
  );
  expect(normalGrant.status).toBe(409);
  expect(await normalGrant.json()).toMatchObject({ code: "INTRO_INCOMPLETE" });

  const previewResponse = await fixture.request(
    "/api/admin/member-migrations",
    "global@atlasez.test",
    {
      mode: "preview",
      batchId,
      confirmedExistingMembers: true,
      members: [migrationMember],
    },
  );
  expect(previewResponse.status).toBe(200);
  const preview = (await previewResponse.json()) as {
    members: Array<Record<string, unknown>>;
  };
  expect(preview.members[0]).toMatchObject({
    email: hkuEmail,
    addedSubjects: ["chemistry"],
    resultingProjectRole: "manager",
    hasPublicIntro: false,
    hasProjectIntro: false,
    discordSync: "skipped",
  });
  expect(
    fixture.db
      .prepare(
        "SELECT COUNT(*) AS count FROM report_admin_permissions WHERE lower(email)=lower(?)",
      )
      .get(hkuEmail),
  ).toEqual({ count: 0 });
  expect(
    fixture.db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_project_memberships WHERE lower(email)=lower(?)",
      )
      .get(hkuEmail),
  ).toEqual({ count: 0 });

  const applyResponse = await fixture.request(
    "/api/admin/member-migrations",
    "global@atlasez.test",
    {
      mode: "apply",
      batchId,
      confirmedExistingMembers: true,
      members: [{ ...migrationMember, expected: preview.members[0].expected }],
    },
  );
  expect(applyResponse.status).toBe(200);
  expect(await applyResponse.json()).toMatchObject({
    ok: true,
    discordSync: "skipped",
    results: [
      {
        email: hkuEmail,
        status: "migrated",
        addedSubjects: ["chemistry"],
        projectManager: true,
        profileIntroPending: true,
        discordSync: "skipped",
      },
    ],
  });
  expect(
    fixture.db
      .prepare(
        "SELECT subject FROM report_admin_permissions WHERE lower(email)=lower(?)",
      )
      .all(hkuEmail),
  ).toEqual([{ subject: "chemistry" }]);
  expect(
    fixture.db
      .prepare(
        "SELECT role FROM atlasez_project_memberships WHERE project_id='atlas' AND lower(email)=lower(?)",
      )
      .get(hkuEmail),
  ).toEqual({ role: "manager" });
  expect(
    fixture.db
      .prepare(
        "SELECT source,granted_by,review_required FROM atlasez_project_manager_grants WHERE project_id='atlas' AND lower(email)=lower(?)",
      )
      .get(hkuEmail),
  ).toEqual({
    source: "explicit",
    granted_by: "global@atlasez.test",
    review_required: 0,
  });
  expect(
    fixture.db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_member_discord_accounts WHERE lower(email)=lower(?)",
      )
      .get(hkuEmail),
  ).toEqual({ count: 0 });
  expect(
    fixture.db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_member_discord_role_assignments WHERE lower(email)=lower(?)",
      )
      .get(hkuEmail),
  ).toEqual({ count: 0 });
  expect(
    fixture.db
      .prepare(
        "SELECT COUNT(*) AS count FROM editorial_member_profiles WHERE lower(email)=lower(?)",
      )
      .get(hkuEmail),
  ).toEqual({ count: 0 });
  expect(
    fixture.db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_member_applications WHERE lower(email)=lower(?)",
      )
      .get(hkuEmail),
  ).toEqual({ count: 0 });
  const audit = fixture.db
    .prepare(
      "SELECT details_json FROM admin_audit_log WHERE target_id=? ORDER BY created_at DESC",
    )
    .all(hkuEmail)
    .map((row) =>
      JSON.parse(String((row as { details_json: string }).details_json)),
    );
  expect(audit).toContainEqual(
    expect.objectContaining({
      migrationType: "legacy_member_import",
      batchId,
      sourceNote: migrationMember.sourceNote,
      afterSubjects: ["chemistry"],
      afterProjectRole: "manager",
      managerAppointment: "explicit",
      profileIntroPending: true,
      discordSync: "skipped",
    }),
  );
});

it("移行には全体管理者・同一origin・既存所属の確認が必要", async () => {
  const fixture = createAdminTestEnvironment();
  const body = {
    mode: "preview",
    batchId,
    confirmedExistingMembers: true,
    members: [migrationMember],
  };
  expect(
    (
      await fixture.request(
        "/api/admin/member-migrations",
        "operator@atlasez.test",
        body,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await fixture.request(
        "/api/admin/member-migrations",
        "global@atlasez.test",
        body,
        "https://outside.example",
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await fixture.request(
        "/api/admin/member-migrations",
        "global@atlasez.test",
        {
          ...body,
          confirmedExistingMembers: false,
        },
      )
    ).status,
  ).toBe(400);
});

it("プレビュー後の権限状態が変わったら移行を止める", async () => {
  const fixture = createAdminTestEnvironment();
  const previewResponse = await fixture.request(
    "/api/admin/member-migrations",
    "global@atlasez.test",
    {
      mode: "preview",
      batchId,
      confirmedExistingMembers: true,
      members: [migrationMember],
    },
  );
  const preview = (await previewResponse.json()) as {
    members: Array<Record<string, unknown>>;
  };
  fixture.db
    .prepare(
      "INSERT INTO report_admin_permissions(email,subject) VALUES (?,'mathematics')",
    )
    .run(hkuEmail);
  const applyResponse = await fixture.request(
    "/api/admin/member-migrations",
    "global@atlasez.test",
    {
      mode: "apply",
      batchId,
      confirmedExistingMembers: true,
      members: [{ ...migrationMember, expected: preview.members[0].expected }],
    },
  );
  expect(applyResponse.status).toBe(409);
  expect(await applyResponse.json()).toMatchObject({ code: "STALE_PREVIEW" });
  expect(
    fixture.db
      .prepare(
        "SELECT subject FROM report_admin_permissions WHERE lower(email)=lower(?) ORDER BY subject",
      )
      .all(hkuEmail),
  ).toEqual([{ subject: "mathematics" }]);
  expect(
    fixture.db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_project_memberships WHERE lower(email)=lower(?)",
      )
      .get(hkuEmail),
  ).toEqual({ count: 0 });
});
