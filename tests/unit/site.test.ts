import { describe, it, expect, afterEach } from "vitest";
import { applyUrl, withBase } from "../../src/lib/site";

const originalAdminOrigin = process.env.ADMIN_ORIGIN;

afterEach(() => {
  if (originalAdminOrigin === undefined) delete process.env.ADMIN_ORIGIN;
  else process.env.ADMIN_ORIGIN = originalAdminOrigin;
});

describe("applyUrl", () => {
  it("ADMIN_ORIGIN があれば管理Workerの絶対URLを返す", () => {
    process.env.ADMIN_ORIGIN = "https://admin.example.com";
    expect(applyUrl()).toBe("https://admin.example.com/apply/");
  });

  it("クエリを保ったまま管理Workerへ向ける", () => {
    process.env.ADMIN_ORIGIN = "https://admin.example.com";
    expect(applyUrl("?project=atlas")).toBe(
      "https://admin.example.com/apply/?project=atlas",
    );
  });

  it("末尾スラッシュや前後の空白を取り除く", () => {
    process.env.ADMIN_ORIGIN = "  https://admin.example.com/  ";
    expect(applyUrl()).toBe("https://admin.example.com/apply/");
  });

  it("未設定なら同一オリジンへフォールバックする", () => {
    delete process.env.ADMIN_ORIGIN;
    expect(applyUrl()).toBe(withBase("/apply/"));
  });

  it("空文字だけの指定はフォールバック扱いにする", () => {
    process.env.ADMIN_ORIGIN = "   ";
    expect(applyUrl()).toBe(withBase("/apply/"));
  });
});
