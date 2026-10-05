import { expect, it } from "vitest";
import { createAdminTestEnvironment } from "../helpers/admin-test-environment";
import {
  handleManagerGrants,
  planAtlasManagerRevocation,
  planDiscordAtlasManagerRevocation,
  resolveAtlasManagerDisposition,
} from "../../src/lib/admin-manager-provenance";
import type {
  D1Database,
  D1PreparedStatement,
} from "../../src/lib/admin-database";

it.each(["explicit", "none"] as const)(
  "二人の責任者の同時降格でも同じtransaction内の後任確認で一人を維持する: %s",
  async (source) => {
    const fixture = createAdminTestEnvironment();
    const base = fixture.env.REPORTS as D1Database;
    for (const email of ["first@atlasez.test", "second@atlasez.test"]) {
      fixture.db
        .prepare(
          "INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at) VALUES ('thinking-cafe',?,'manager','2026-10-05T00:00:00Z')",
        )
        .run(email);
      if (source === "explicit")
        fixture.db
          .prepare(
            "INSERT INTO atlasez_project_manager_grants(project_id,email,source,granted_by,granted_at) VALUES ('thinking-cafe',?,'explicit','global@atlasez.test','2026-10-05T00:00:00Z')",
          )
          .run(email);
    }
    let preflights = 0;
    let release: () => void = () => undefined;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const wrap = (
      query: string,
      statement: D1PreparedStatement,
    ): D1PreparedStatement => ({
      bind: (...values) => wrap(query, statement.bind(...values)),
      first: async <T>() => {
        const snapshot = await statement.first<T>();
        if (
          query.includes("lower(m.email)!=lower(?)") &&
          query.includes("LIMIT 1")
        ) {
          preflights += 1;
          if (preflights === 2) release();
          await barrier;
        }
        return snapshot;
      },
      all: <T>() => statement.all<T>(),
      run: () => statement.run(),
    });
    let queued = Promise.resolve();
    const db: D1Database = {
      prepare: (query) => wrap(query, base.prepare(query)),
      batch: <T>(statements: D1PreparedStatement[]) => {
        const result = queued.then(() => base.batch<T>(statements));
        queued = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      },
    };
    const demote = (email: string) =>
      handleManagerGrants(
        new Request(
          "https://admin.atlasez.test/api/admin/project-manager-grants",
          {
            method: "PATCH",
            headers: {
              origin: "https://admin.atlasez.test",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              projectId: "thinking-cafe",
              email,
              role: "member",
              expectedRole: "manager",
              expectedSource: source,
              revision: 0,
            }),
          },
        ),
        db,
        "global@atlasez.test",
      );
    const responses = await Promise.all([
      demote("first@atlasez.test"),
      demote("second@atlasez.test"),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(
      fixture.db
        .prepare(
          "SELECT COUNT(*) AS count FROM atlasez_project_memberships WHERE project_id='thinking-cafe' AND role='manager'",
        )
        .get(),
    ).toEqual({ count: 1 });
    expect(
      fixture.db.prepare("SELECT COUNT(*) AS count FROM admin_audit_log").get(),
    ).toEqual({ count: 1 });
  },
);

function atlasManager(source?: "legacy" | "explicit" | "permission") {
  const fixture = createAdminTestEnvironment();
  fixture.db
    .prepare(
      "INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at) VALUES ('atlas','manager@atlasez.test','manager','2026-10-05T00:00:00Z')",
    )
    .run();
  if (source)
    fixture.db
      .prepare(
        "INSERT INTO atlasez_project_manager_grants(project_id,email,source,granted_by,granted_at) VALUES ('atlas','manager@atlasez.test',?,'global@atlasez.test','2026-10-05T00:00:00Z')",
      )
      .run(source);
  return { ...fixture, d1: fixture.env.REPORTS as D1Database };
}

it.each([undefined, "legacy"] as const)(
  "Discordで付与元未確認の責任者を保留し連続同期では監査を重複させない: %s",
  async (source) => {
    const fixture = atlasManager(source);
    const plan = await planDiscordAtlasManagerRevocation(
      fixture.d1,
      "manager@atlasez.test",
    );
    expect(plan.reviewRequired).toBe(true);
    await fixture.d1.batch(plan.statements);
    const repeated = await planDiscordAtlasManagerRevocation(
      fixture.d1,
      "manager@atlasez.test",
    );
    expect(repeated).toEqual({ reviewRequired: true, statements: [] });
    expect(
      fixture.db
        .prepare(
          "SELECT role FROM atlasez_project_memberships WHERE project_id='atlas'",
        )
        .get(),
    ).toEqual({ role: "manager" });
    expect(
      fixture.db
        .prepare(
          "SELECT source,review_required FROM atlasez_project_manager_grants WHERE project_id='atlas'",
        )
        .get(),
    ).toEqual({ source: "legacy", review_required: 1 });
    expect(
      fixture.db.prepare("SELECT COUNT(*) AS count FROM admin_audit_log").get(),
    ).toEqual({ count: 1 });
  },
);

it.each(["explicit", "permission"] as const)(
  "独立任命と権限由来の責任者は未確認扱いで保留しない: %s",
  async (source) => {
    const fixture = atlasManager(source);
    expect(
      await planDiscordAtlasManagerRevocation(
        fixture.d1,
        "manager@atlasez.test",
      ),
    ).toEqual({ reviewRequired: false, statements: [] });
  },
);

it("権限取消の計画後に独立任命された場合は実際の維持結果と監査を返す", async () => {
  const fixture = atlasManager("permission");
  const plan = await planAtlasManagerRevocation(
    fixture.d1,
    "manager@atlasez.test",
    true,
    undefined,
    "global@atlasez.test",
  );
  expect(plan.disposition).toBe("revoked");
  fixture.db
    .prepare(
      "UPDATE atlasez_project_manager_grants SET source='explicit' WHERE project_id='atlas'",
    )
    .run();
  await fixture.d1.batch(plan.statements);
  expect(
    await resolveAtlasManagerDisposition(
      fixture.d1,
      "manager@atlasez.test",
      plan.disposition,
    ),
  ).toBe("preserved");
  const details = fixture.db
    .prepare("SELECT details_json FROM admin_audit_log")
    .get();
  expect(JSON.parse(String(details?.details_json))).toMatchObject({
    requestedDisposition: "revoked",
    resultingRole: "manager",
    resultingSource: "explicit",
  });
});

it("二つの同期計画が競合しても保留開始の監査は一度だけ記録する", async () => {
  const fixture = atlasManager("legacy");
  const first = await planDiscordAtlasManagerRevocation(
    fixture.d1,
    "manager@atlasez.test",
  );
  const second = await planDiscordAtlasManagerRevocation(
    fixture.d1,
    "manager@atlasez.test",
  );
  await fixture.d1.batch(first.statements);
  await fixture.d1.batch(second.statements);
  expect(
    fixture.db.prepare("SELECT COUNT(*) AS count FROM admin_audit_log").get(),
  ).toEqual({ count: 1 });
});

it("Atlas休止中は全分野権限と責任者任命が残っていても記事・権限APIを利用できない", async () => {
  const fixture = atlasManager("explicit");
  fixture.db
    .prepare(
      "INSERT INTO report_admin_permissions(email,subject) VALUES ('manager@atlasez.test','*')",
    )
    .run();
  fixture.db
    .prepare(
      "INSERT INTO atlasez_project_member_lifecycle(project_id,email,state,role_snapshot,last_request_id,updated_at) VALUES ('atlas','manager@atlasez.test','paused','manager','paused-test','2026-10-05T00:00:00Z')",
    )
    .run();
  fixture.db
    .prepare(
      "INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at) VALUES ('thinking-cafe','manager@atlasez.test','member','2026-10-05T00:00:00Z')",
    )
    .run();
  expect(
    await (
      await fixture.request("/api/user/status", "manager@atlasez.test")
    ).json(),
  ).toMatchObject({ stage: "ONBOARDING" });
  for (const path of [
    "/api/admin/editor/documents",
    "/api/admin/permissions",
    "/api/admin/project-manager-grants",
  ]) {
    expect((await fixture.request(path, "manager@atlasez.test")).status).toBe(
      403,
    );
  }
});
