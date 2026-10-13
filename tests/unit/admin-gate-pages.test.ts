import { describe, expect, it } from "vitest";
import {
  adminAuthErrorPage,
  adminLoggedOutPage,
  adminLoginPage,
  adminNotFoundPage,
  adminServerErrorPage,
  prefersAdminHtml,
  safeRetryPath,
} from "../../src/lib/admin-gate-pages";

const requestWith = (accept?: string) =>
  new Request("https://admin.example/", {
    headers: accept ? { accept } : {},
  });

describe("admin gate pages", () => {
  it("prefers HTML only when the browser accepts HTML ahead of JSON", () => {
    expect(prefersAdminHtml(requestWith())).toBe(false);
    expect(prefersAdminHtml(requestWith("application/json"))).toBe(false);
    expect(prefersAdminHtml(requestWith("*/*"))).toBe(false);
    expect(
      prefersAdminHtml(
        requestWith(
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ),
      ),
    ).toBe(true);
    expect(
      prefersAdminHtml(requestWith("application/json, text/html;q=0.8")),
    ).toBe(false);
  });

  it("escapes untrusted auth failure text", () => {
    const html = adminAuthErrorPage(`<script>alert("x")</script>`);
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("uses the approved copy and a safe reload path", () => {
    expect(adminLoginPage("/admin/portal/")).toContain(
      "パスワードはありません",
    );
    expect(adminLoginPage("/admin/portal/")).toContain("start=1");
    expect(adminNotFoundPage()).toContain("ページが見つかりません");
    expect(adminNotFoundPage()).not.toContain("Google Sites");
    expect(adminServerErrorPage("req-1", "/admin/portal/")).toContain("req-1");
    expect(adminLoggedOutPage()).toContain("管理サイトへ戻る");
    expect(
      safeRetryPath(new URL("https://admin.example/admin/portal/?q=1")),
    ).toBe("/admin/portal/?q=1");
    expect(safeRetryPath(new URL("https://admin.example//evil"))).toBe("/");
  });
});
