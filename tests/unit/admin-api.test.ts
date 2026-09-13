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

  it("treats followed login HTML as an authentication expiry even when it is HTTP 200", async () => {
    const response = new Response("<!DOCTYPE html><title>Login</title>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
    Object.defineProperty(response, "redirected", { value: true });
    await expect(
      readAdminApiJson(response, "通知を読み込めませんでした。"),
    ).rejects.toThrow(
      "認証セッションを確認できません。Cookieの期限切れまたは認証方式の不一致です。管理サイトへ戻って再認証してください。",
    );
  });
});
