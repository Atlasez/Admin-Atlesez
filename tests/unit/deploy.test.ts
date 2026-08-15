import { describe, it, expect, afterEach, vi } from "vitest";

const KEYS = ["NOINDEX", "SITE_URL", "CF_PAGES", "CF_PAGES_BRANCH"] as const;
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

/** IS_PRODUCTION_DEPLOY はモジュール読み込み時に確定するため、都度読み直す */
const evaluate = async (
  vars: Partial<Record<(typeof KEYS)[number], string>>,
) => {
  for (const key of KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(vars)) process.env[key] = value;
  vi.resetModules();
  const { IS_PRODUCTION_DEPLOY } = await import("../../src/lib/deploy");
  return IS_PRODUCTION_DEPLOY;
};

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("IS_PRODUCTION_DEPLOY", () => {
  it("SITE_URL があれば本番扱いにする", async () => {
    expect(await evaluate({ SITE_URL: "https://example.com" })).toBe(true);
  });

  it("NOINDEX=1 は SITE_URL より優先して検索対象から外す", async () => {
    expect(
      await evaluate({ SITE_URL: "https://example.com", NOINDEX: "1" }),
    ).toBe(false);
  });

  it("NOINDEX=true でも同じ扱いにする", async () => {
    expect(
      await evaluate({ SITE_URL: "https://example.com", NOINDEX: "true" }),
    ).toBe(false);
  });

  it("NOINDEX=1 は Cloudflare の main ビルドも検索対象から外す", async () => {
    expect(
      await evaluate({
        CF_PAGES: "1",
        CF_PAGES_BRANCH: "main",
        NOINDEX: "1",
      }),
    ).toBe(false);
  });

  it("Cloudflare の main ビルドは本番扱いにする", async () => {
    expect(await evaluate({ CF_PAGES: "1", CF_PAGES_BRANCH: "main" })).toBe(
      true,
    );
  });

  it("Cloudflare の main 以外はプレビュー扱いにする", async () => {
    expect(
      await evaluate({ CF_PAGES: "1", CF_PAGES_BRANCH: "feature/x" }),
    ).toBe(false);
  });

  it("何も指定がなければプレビュー扱いにする", async () => {
    expect(await evaluate({})).toBe(false);
  });
});
