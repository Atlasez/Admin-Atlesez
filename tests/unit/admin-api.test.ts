import { describe, expect, it } from "vitest";
import { readAdminApiJson } from "../../src/lib/admin-api";

describe("admin API response reader", () => {
  it("returns typed JSON responses", async () => {
    const data = await readAdminApiJson<{ ok: boolean }>(
      Response.json({ ok: true }),
      "読み込めませんでした。",
    );
    expect(data).toEqual({ ok: true });
  });

  it("does not expose an HTML error response as a JSON parse exception", async () => {
    const response = new Response("<!DOCTYPE html><title>Error</title>", {
      status: 500,
      headers: { "content-type": "text/html" },
    });
    await expect(
      readAdminApiJson(response, "プロフィール情報を読み込めませんでした。"),
    ).rejects.toThrow("プロフィール情報を読み込めませんでした。（HTTP 500）");
  });
});
