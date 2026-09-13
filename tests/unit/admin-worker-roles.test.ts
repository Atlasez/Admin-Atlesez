import { describe, expect, it } from "vitest";
import worker from "../../src/admin-worker";

type Role = {
  id: string;
  project_id: string;
  kind: "role";
  slug: string;
  name: string;
  description: string;
  permission_scope?: string;
  created_by: string;
  created_at: string;
  status: "active" | "archived";
  updated_by: string;
  updated_at: string;
};

const roleEnv = (
  roles: Role[],
  globalAdmin = true,
  preparedQueries: string[] = [],
) => ({
  ADMIN_AUTH_MODE: "cloudflare-access",
  ADMIN_PRIMARY_EMAIL: "primary@example.com",
  REPORTS: {
    prepare(query: string) {
      preparedQueries.push(query);
      let values: unknown[] = [];
      return {
        bind(...bound: unknown[]) {
          values = bound;
          return this;
        },
        async all<T>() {
          if (query.includes("SELECT subject FROM report_admin_permissions"))
            return { results: (globalAdmin ? [{ subject: "*" }] : []) as T[] };
          if (
            query.includes("SELECT role, subject FROM editorial_workflow_roles")
          )
            return { results: [] as T[] };
          if (
            query.includes(
              "FROM admin_genre_role_catalog WHERE project_id='atlas'",
            )
          )
            return { results: roles as T[] };
          if (query.includes("FROM admin_genre_role_assignments"))
            return { results: [] as T[] };
          return { results: [] as T[] };
        },
        async first<T>() {
          if (
            query.includes(
              "SELECT id FROM admin_genre_role_catalog WHERE id=? AND project_id='atlas' AND status='active'",
            )
          )
            return (roles.find(
              (role) => role.id === values[0] && role.status === "active",
            ) ?? null) as T | null;
          if (
            query.includes(
              "SELECT id,project_id,kind,slug,name,description,permission_scope,created_by,created_at,status,updated_by,updated_at FROM admin_genre_role_catalog WHERE id=?",
            )
          )
            return (roles.find((role) => role.id === values[0]) ??
              null) as T | null;
          if (
            query.includes(
              "SELECT id,kind,name,slug FROM admin_genre_role_catalog",
            )
          )
            return (roles.find((role) => role.id === values[0]) ??
              null) as T | null;
          return null as T | null;
        },
        async run() {
          if (query.includes("INSERT INTO admin_genre_role_catalog")) {
            const [
              id,
              projectId,
              kind,
              slug,
              name,
              description,
              permissionScope,
              email,
              now,
              status,
              updatedBy,
              updatedAt,
            ] = values as [
              string,
              string,
              "role",
              string,
              string,
              string,
              string,
              string,
              string,
              "active",
              string,
              string,
            ];
            roles.push({
              id,
              project_id: projectId,
              kind,
              slug,
              name,
              description,
              permission_scope: permissionScope,
              created_by: email,
              created_at: now,
              status,
              updated_by: updatedBy,
              updated_at: updatedAt,
            });
          }
          if (query.includes("UPDATE admin_genre_role_catalog SET status=")) {
            const role = roles.find((item) => item.id === values.at(-1));
            if (role) {
              role.status = query.includes("status='archived'")
                ? "archived"
                : (values[0] as Role["status"]);
              role.updated_by = String(
                query.includes("status='archived'") ? values[0] : values[1],
              );
              role.updated_at = String(
                query.includes("status='archived'") ? values[1] : values[2],
              );
            }
          }
          if (
            query.includes(
              "UPDATE admin_genre_role_catalog\n         SET slug=",
            )
          ) {
            const role = roles.find((item) => item.id === values[6]);
            if (role) {
              role.slug = String(values[0]);
              role.name = String(values[1]);
              role.description = String(values[2]);
              role.permission_scope = String(values[3]);
              role.updated_by = String(values[4]);
              role.updated_at = String(values[5]);
            }
          }
          return { meta: { changes: 1 } };
        },
      };
    },
    async batch() {
      return [];
    },
  },
  ASSETS: { fetch: async () => new Response("protected", { status: 200 }) },
});

const request = (method: string, body?: Record<string, unknown>) =>
  new Request("https://admin.example/api/admin/genre-role-catalog", {
    method,
    headers: {
      "Cf-Access-Authenticated-User-Email": "manager@example.com",
      origin: "https://admin.example",
      "content-type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

const assignmentDeleteRequest = (catalogId: string, email: string) =>
  new Request(
    `https://admin.example/api/admin/genre-role-catalog/assignments?catalogId=${catalogId}&email=${encodeURIComponent(email)}`,
    {
      method: "DELETE",
      headers: {
        "Cf-Access-Authenticated-User-Email": "manager@example.com",
        origin: "https://admin.example",
      },
    },
  );

describe("admin genre-role catalog lifecycle", () => {
  it("creates, edits, archives, and restores a role without losing its assignment catalog row", async () => {
    const roles: Role[] = [];
    const env = roleEnv(roles);
    const created = await worker.fetch(
      request("POST", {
        kind: "role",
        slug: "sns",
        name: "SNS担当",
        description: "SNS運用",
        permissionScope: "SNS告知のみ",
      }),
      env as never,
    );
    expect(created.status).toBe(201);
    const id = roles[0].id;

    const updated = await worker.fetch(
      request("PATCH", {
        id,
        action: "update",
        slug: "public-relations",
        name: "広報担当",
        description: "公開告知",
        permissionScope: "SNS告知のみ",
      }),
      env as never,
    );
    expect(updated.status).toBe(200);
    expect(roles[0]).toMatchObject({
      slug: "public-relations",
      name: "広報担当",
      description: "公開告知",
      permission_scope: "SNS告知のみ",
    });

    const archived = await worker.fetch(
      request("PATCH", { id, action: "archive" }),
      env as never,
    );
    expect(archived.status).toBe(200);
    expect(roles[0].status).toBe("archived");
    const restored = await worker.fetch(
      request("PATCH", { id, action: "restore" }),
      env as never,
    );
    expect(restored.status).toBe(200);
    expect(roles[0].status).toBe("active");
  });

  it("rejects catalog changes for users without the global-admin scope", async () => {
    const response = await worker.fetch(
      request("POST", { kind: "role", slug: "sns", name: "SNS担当" }),
      roleEnv([], false) as never,
    );
    expect(response.status).toBe(403);
  });

  it("generates a stable slug from the display name when the optional slug is omitted", async () => {
    const roles: Role[] = [];
    const response = await worker.fetch(
      request("POST", { kind: "role", name: "Public Relations" }),
      roleEnv(roles) as never,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      kind: "role",
      name: "Public Relations",
      slug: "role-public-relations",
    });
    expect(roles[0]?.slug).toBe("role-public-relations");
  });

  it("keeps the legacy DELETE endpoint recoverable by archiving instead of deleting", async () => {
    const roles: Role[] = [
      {
        id: "role-1",
        project_id: "atlas",
        kind: "role",
        slug: "sns",
        name: "SNS担当",
        description: "SNS運用",
        created_by: "manager@example.com",
        created_at: "2026-09-12T00:00:00.000Z",
        status: "active",
        updated_by: "manager@example.com",
        updated_at: "2026-09-12T00:00:00.000Z",
      },
    ];
    const response = await worker.fetch(
      new Request(
        "https://admin.example/api/admin/genre-role-catalog?id=role-1",
        {
          method: "DELETE",
          headers: {
            "Cf-Access-Authenticated-User-Email": "manager@example.com",
          },
        },
      ),
      roleEnv(roles) as never,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      status: "archived",
      compatibilityDelete: true,
    });
    expect(roles[0]?.status).toBe("archived");
  });

  it("scopes assignment deletion to the atlas catalog", async () => {
    const preparedQueries: string[] = [];
    const response = await worker.fetch(
      assignmentDeleteRequest("role-1", "member@example.com"),
      roleEnv([], true, preparedQueries) as never,
    );

    expect(response.status).toBe(200);
    expect(
      preparedQueries.find((query) =>
        query.includes("DELETE FROM admin_genre_role_assignments"),
      ),
    ).toContain("project_id='atlas'");
  });
});
