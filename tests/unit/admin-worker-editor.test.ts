import { describe, expect, it } from "vitest";
import worker from "../../src/admin-worker";

class EmptyStatement {
  constructor(private readonly query: string) {}

  bind(...values: unknown[]) {
    const placeholders = (this.query.match(/\?/g) ?? []).length;
    if (placeholders !== values.length)
      throw new Error(
        `Wrong number of parameter bindings: expected ${placeholders}, received ${values.length}`,
      );
    return this;
  }

  async all<T>() {
    return { results: [] as T[] };
  }

  async first<T>() {
    return null as T | null;
  }

  async run() {
    return {};
  }
}

const emptyEnv = {
  ADMIN_AUTH_MODE: "local",
  ADMIN_LOCAL_EMAIL: "local-editor@atlasez.test",
  REPORTS: {
    prepare: (query: string) => new EmptyStatement(query),
    batch: async () => [],
  },
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
};

describe("admin worker editor APIs", () => {
  it("returns empty review request collections for an all-subject manager", async () => {
    const response = await worker.fetch(
      new Request("http://localhost/api/admin/editor/review-requests"),
      emptyEnv as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      requests: [],
      reviewers: [],
    });
  });

  it("serves an editorial asset with its saved MIME type and filename", async () => {
    const assetId = "11111111-1111-4111-8111-111111111111";
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const assetEnv = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => {
          const statement = new EmptyStatement(query);
          if (!query.includes("FROM editorial_assets a")) return statement;
          return Object.assign(statement, {
            first: async () => ({
              id: assetId,
              document_id: "22222222-2222-4222-8222-222222222222",
              filename: "diagram.png",
              media_type: "image/png",
              bytes: bytes.byteLength,
              data: bytes,
              subject: "mathematics",
              status: "draft",
            }),
          });
        },
      },
    };

    const response = await worker.fetch(
      new Request(`http://localhost/api/admin/editor/assets/${assetId}`),
      assetEnv as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="diagram.png"',
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });
});
