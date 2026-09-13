import { describe, expect, it } from "vitest";
import worker from "../../src/admin-worker";

class Statement {
  constructor(
    readonly query: string,
    private readonly allRows: (query: string) => unknown[] = () => [],
    private readonly firstRow: (query: string) => unknown | null = () => null,
  ) {}

  bind(..._values: unknown[]) {
    return this;
  }

  async all<T>() {
    return { results: this.allRows(this.query) as T[] };
  }

  async first<T>() {
    return this.firstRow(this.query) as T | null;
  }

  async run() {
    return { meta: { changes: 1 } };
  }
}

const localEnv = (
  allRows: (query: string) => unknown[],
  firstRow: (query: string) => unknown | null = () => null,
  batch: (statements: Statement[]) => Promise<unknown[]> = async () => [],
) => ({
  ADMIN_AUTH_MODE: "local",
  ADMIN_LOCAL_EMAIL: "manager@example.com",
  REPORTS: {
    prepare(query: string) {
      return new Statement(query, allRows, firstRow);
    },
    batch,
  },
  ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
});

describe("admin member-management API", () => {
  it("returns one aggregated roster model with a SQL-level total and all management facets", async () => {
    const prepared: string[] = [];
    const response = await worker.fetch(
      new Request(
        "http://localhost/api/admin/member-management?project=atlas&limit=1",
      ),
      localEnv((query) => {
        prepared.push(query);
        if (query.includes("WITH candidates AS"))
          return [
            {
              normalized_email: "editor@example.com",
              email: "Editor@Example.com",
              is_global: 0,
              is_member: 1,
              total_count: 4,
            },
          ];
        if (
          query.includes(
            "SELECT lower(email) AS email, subject FROM report_admin_permissions",
          )
        )
          return [
            { email: "editor@example.com", subject: "mathematics" },
            { email: "editor@example.com", subject: "physics" },
          ];
        if (query.includes("FROM editorial_member_profiles"))
          return [
            {
              email: "editor@example.com",
              display_name: "編集担当",
              university: "東京大学",
              year: "大学3年",
              interests: "数学",
              avatar_url: "/avatar.png",
              country: "JP",
              updated_at: "2026-09-13T00:00:00.000Z",
            },
          ];
        if (query.includes("FROM atlasez_project_memberships"))
          return [{ email: "editor@example.com", role: "member" }];
        if (query.includes("FROM editorial_workflow_roles"))
          return [
            {
              email: "editor@example.com",
              role: "subject-coordinator",
              subject: "physics",
            },
          ];
        if (query.includes("SELECT lower(a.email) AS email"))
          return [
            {
              email: "editor@example.com",
              id: "genre-1",
              kind: "genre",
              name: "統計",
              slug: "statistics",
            },
          ];
        if (query.includes("FROM atlasez_member_discord_accounts"))
          return [
            {
              email: "editor@example.com",
              discord_user_id: "123456789012345678",
            },
          ];
        if (query.includes("FROM atlasez_member_discord_role_assignments"))
          return [
            {
              email: "editor@example.com",
              discord_role_id: "987654321098765",
            },
          ];
        if (query.includes("FROM atlasez_discord_role_catalog"))
          return [
            {
              discord_role_id: "987654321098765",
              name: "編集担当",
              is_managed: 0,
            },
          ];
        return [];
      }) as never,
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({
      total: 4,
      limit: 1,
      canEdit: true,
      members: [
        {
          email: "Editor@Example.com",
          display_name: "編集担当",
          subjects: ["mathematics", "physics"],
          workflow_subjects: ["physics"],
          catalog_assignments: [
            { id: "genre-1", kind: "genre", slug: "statistics" },
          ],
          discord_user_id: "123456789012345678",
          discord_role_ids: ["987654321098765"],
        },
      ],
      discord_roles: [{ discord_role_id: "987654321098765", name: "編集担当" }],
    });
    expect(
      prepared.find((query) => query.includes("WITH candidates AS")),
    ).toContain("NOT");
  });

  it("writes workflow replacements in the same batch as profile and article access changes", async () => {
    let batched: Statement[] = [];
    const response = await worker.fetch(
      new Request("http://localhost/api/admin/member-management", {
        method: "PUT",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "editor@example.com",
          subjects: ["physics"],
          workflowSubjects: ["physics"],
          roleIds: [],
          university: "",
          year: "",
          interests: [],
        }),
      }),
      localEnv(
        (query) => {
          if (query.includes("SELECT subject FROM report_admin_permissions"))
            return [{ subject: "mathematics" }];
          if (
            query.includes(
              "SELECT discord_role_id,is_active FROM atlasez_member_discord_role_assignments",
            )
          )
            return [];
          if (
            query.includes(
              "SELECT role,subject FROM editorial_workflow_roles WHERE lower(email)",
            )
          )
            return [{ role: "subject-coordinator", subject: "mathematics" }];
          return [];
        },
        (query) =>
          query.includes("editorial_member_profiles")
            ? {
                university: "",
                year: "",
                interests: "",
                affiliation_type: "",
              }
            : null,
        async (statements) => {
          batched = statements;
          return [];
        },
      ) as never,
    );

    expect(response.status).toBe(200);
    expect(batched.map((statement) => statement.query)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("DELETE FROM report_admin_permissions"),
        expect.stringContaining("INSERT INTO report_admin_permissions"),
        expect.stringContaining(
          "INSERT OR IGNORE INTO editorial_workflow_roles",
        ),
        expect.stringContaining("DELETE FROM editorial_workflow_roles"),
      ]),
    );
  });

  it("keeps permissions and active Discord roles when a member update omits those fields", async () => {
    const writes: Array<{ query: string; values: unknown[] }> = [];
    class PartialUpdateStatement {
      private values: unknown[] = [];

      constructor(readonly query: string) {}

      bind(...values: unknown[]) {
        this.values = values;
        return this;
      }

      get boundValues() {
        return this.values;
      }

      async first<T>() {
        if (
          this.query.includes(
            "SELECT university,year,interests,affiliation_type",
          )
        )
          return {
            university: "東京大学",
            year: "大学3年",
            interests: "数学",
            affiliation_type: "",
          } as T;
        if (
          this.query.includes(
            "SELECT display_name,avatar_url,university,year,interests",
          )
        )
          return {
            display_name: "旧表示名",
            avatar_url: "",
            university: "東京大学",
            year: "大学3年",
            interests: "数学",
          } as T;
        return null as T | null;
      }

      async all<T>() {
        if (this.query.includes("SELECT subject FROM report_admin_permissions"))
          return { results: [{ subject: "mathematics" }] as T[] };
        if (
          this.query.includes(
            "SELECT discord_role_id,is_active FROM atlasez_member_discord_role_assignments",
          )
        )
          return {
            results: [
              { discord_role_id: "987654321098765", is_active: 1 },
            ] as T[],
          };
        if (this.query.includes("atlasez_discord_role_catalog"))
          return {
            results: [
              { discord_role_id: "987654321098765", is_managed: 0 },
            ] as T[],
          };
        return { results: [] as T[] };
      }

      async run() {
        writes.push({ query: this.query, values: this.values });
        return { meta: { changes: 1 } };
      }
    }

    const response = await worker.fetch(
      new Request("http://localhost/api/admin/member-management", {
        method: "PUT",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "Member@Example.com",
          displayName: "更新後の表示名",
        }),
      }),
      {
        ADMIN_AUTH_MODE: "local",
        ADMIN_LOCAL_EMAIL: "manager@example.com",
        REPORTS: {
          prepare: (query: string) => new PartialUpdateStatement(query),
          batch: async (statements: PartialUpdateStatement[]) => {
            statements.forEach((statement) =>
              writes.push({
                query: statement.query,
                values: statement.boundValues,
              }),
            );
            return [];
          },
        },
        ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
      } as never,
    );

    expect(response.status).toBe(200);
    expect(writes.map((write) => write.query)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("DELETE FROM report_admin_permissions"),
        expect.stringContaining("INSERT INTO report_admin_permissions"),
        expect.stringContaining(
          "UPDATE atlasez_member_discord_role_assignments",
        ),
      ]),
    );
    expect(
      writes.some(
        (write) =>
          write.query.includes("INSERT INTO report_admin_permissions") &&
          write.values.includes("mathematics"),
      ),
    ).toBe(true);
    expect(
      writes.some(
        (write) =>
          write.query.includes(
            "UPDATE atlasez_member_discord_role_assignments",
          ) && write.values.includes("987654321098765"),
      ),
    ).toBe(true);
  });

  it("archives only operational scopes and restores them from an immutable snapshot", async () => {
    let archiveBatch: Statement[] = [];
    const snapshotRows = (query: string) => {
      if (
        query.includes(
          "SELECT subject FROM report_admin_permissions WHERE lower",
        )
      )
        return [{ subject: "physics" }];
      if (query.includes("FROM editorial_workflow_roles WHERE lower"))
        return [
          {
            role: "subject-coordinator",
            subject: "physics",
            created_by: "manager@example.com",
            created_at: "2026-09-01T00:00:00.000Z",
          },
        ];
      if (query.includes("FROM admin_genre_role_assignments a"))
        return [
          {
            catalog_id: "genre-1",
            email: "editor@example.com",
            created_by: "manager@example.com",
            created_at: "2026-09-01T00:00:00.000Z",
          },
        ];
      if (
        query.includes(
          "FROM atlasez_project_memberships WHERE project_id='atlas'",
        )
      )
        return [
          {
            project_id: "atlas",
            email: "editor@example.com",
            role: "member",
            joined_at: "2026-09-01T00:00:00.000Z",
          },
        ];
      if (
        query.includes(
          "FROM atlasez_member_discord_role_assignments WHERE lower",
        )
      )
        return [
          {
            email: "editor@example.com",
            discord_role_id: "987654321098765",
            is_active: 1,
            assigned_at: "2026-09-01T00:00:00.000Z",
            assigned_by: "manager@example.com",
          },
        ];
      if (
        query.includes(
          "SELECT subject FROM report_admin_permissions WHERE email",
        )
      )
        return [{ subject: "physics" }];
      return [];
    };
    const archiveResponse = await worker.fetch(
      new Request("http://localhost/api/admin/member-management", {
        method: "PATCH",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "editor@example.com",
          action: "archive",
        }),
      }),
      localEnv(
        snapshotRows,
        () => null,
        async (statements) => {
          archiveBatch = statements;
          return [];
        },
      ) as never,
    );

    expect(archiveResponse.status).toBe(200);
    expect(archiveBatch.map((statement) => statement.query)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("INSERT INTO admin_member_lifecycle"),
        expect.stringContaining("DELETE FROM report_admin_permissions"),
        expect.stringContaining("DELETE FROM editorial_workflow_roles"),
        expect.stringContaining("DELETE FROM admin_genre_role_assignments"),
        expect.stringContaining("DELETE FROM atlasez_project_memberships"),
      ]),
    );

    const snapshot = JSON.stringify({
      version: 1,
      permissions: ["physics"],
      workflowRoles: [
        {
          role: "subject-coordinator",
          subject: "physics",
          created_by: "manager@example.com",
          created_at: "2026-09-01T00:00:00.000Z",
        },
      ],
      catalogAssignments: [
        {
          catalog_id: "genre-1",
          email: "editor@example.com",
          created_by: "manager@example.com",
          created_at: "2026-09-01T00:00:00.000Z",
        },
      ],
      atlasMembership: {
        project_id: "atlas",
        email: "editor@example.com",
        role: "member",
        joined_at: "2026-09-01T00:00:00.000Z",
      },
      discordRoles: [],
    });
    let restoreBatch: Statement[] = [];
    const restoreResponse = await worker.fetch(
      new Request("http://localhost/api/admin/member-management", {
        method: "PATCH",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "editor@example.com",
          action: "restore",
        }),
      }),
      localEnv(
        () => [],
        (query) =>
          query.includes("SELECT email,status,snapshot_json")
            ? {
                email: "editor@example.com",
                status: "archived",
                snapshot_json: snapshot,
                created_by: "manager@example.com",
                created_at: "2026-09-01T00:00:00.000Z",
                updated_by: "manager@example.com",
                updated_at: "2026-09-01T00:00:00.000Z",
                archived_by: "manager@example.com",
                archived_at: "2026-09-02T00:00:00.000Z",
              }
            : null,
        async (statements) => {
          restoreBatch = statements;
          return [];
        },
      ) as never,
    );
    expect(restoreResponse.status).toBe(200);
    expect(restoreBatch.map((statement) => statement.query)).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "INSERT OR IGNORE INTO report_admin_permissions",
        ),
        expect.stringContaining(
          "INSERT OR IGNORE INTO editorial_workflow_roles",
        ),
        expect.stringContaining(
          "UPDATE admin_member_lifecycle SET status='active'",
        ),
      ]),
    );
  });
});
