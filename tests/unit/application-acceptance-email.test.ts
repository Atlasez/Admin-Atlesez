import { expect, it } from "vitest";
import { applicationAcceptanceEmail } from "../../src/lib/application-acceptance-email";

it("describes the real acceptance path in Japanese and English", () => {
  const japanese = applicationAcceptanceEmail("学習サイト「アトラス」", false);
  expect(japanese.subject).toContain("参加が承認されました");
  expect(japanese.textBody).toContain("同じGoogleアカウント");
  expect(japanese.textBody).toContain(
    "https://admin.atlasez.org/admin/portal/",
  );
  expect(japanese.textBody).toContain(
    "https://admin.atlasez.org/admin/getting-started/",
  );
  expect(japanese.textBody).toContain("自己紹介を保存したあと");
  expect(japanese.textBody).not.toContain("チュートリアル");
  expect(japanese.htmlBody).toContain("ポータル");
  expect(japanese.htmlBody).not.toContain("Connect Discord");

  const english = applicationAcceptanceEmail("Atlas", true, "Atlas");
  expect(english.textBody).toContain("same Google account");
  expect(english.textBody).toContain("https://admin.atlasez.org/admin/portal/");
  expect(english.textBody).toContain(
    "https://admin.atlasez.org/admin/getting-started/",
  );
  expect(english.textBody).not.toMatch(/tutorial/i);
  expect(english.htmlBody).toContain("getting-started");
});
