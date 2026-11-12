import { expect, it } from "vitest";
import { parseLegacyMemberMigrationCsv } from "../../src/lib/admin-legacy-member-migration-csv";

it("既存メンバーCSVを分野権限と独立任命に分けて解析する", () => {
  expect(
    parseLegacyMemberMigrationCsv(
      '\uFEFFemail,subjects,projectManager,sourceNote\r\nhku@example.org,chemistry,true,"既存運営, サイト作成フィードバック"\r\n',
    ),
  ).toEqual([
    {
      email: "hku@example.org",
      subjects: ["chemistry"],
      projectManager: true,
      sourceNote: "既存運営, サイト作成フィードバック",
    },
  ]);
});

it("全分野権限は単独指定し、移行根拠を必須にする", () => {
  expect(
    parseLegacyMemberMigrationCsv(
      "email,subjects,projectManager,sourceNote\na@example.org,*,false,既存名簿",
    )[0].subjects,
  ).toEqual(["*"]);
  expect(() =>
    parseLegacyMemberMigrationCsv(
      "email,subjects,projectManager,sourceNote\na@example.org,chemistry,true,",
    ),
  ).toThrow("確認根拠");
  expect(() =>
    parseLegacyMemberMigrationCsv(
      "email,subjects,projectManager,sourceNote\na@example.org,chemistry;*,false,既存名簿",
    ),
  ).toThrow("担当分野");
});

it("不正な列・重複アドレス・不正な管理者フラグを拒否する", () => {
  expect(() =>
    parseLegacyMemberMigrationCsv(
      "email,projectManager,subjects,sourceNote\na@example.org,false,chemistry,既存名簿",
    ),
  ).toThrow("email,subjects");
  expect(() =>
    parseLegacyMemberMigrationCsv(
      "email,subjects,projectManager,sourceNote\na@example.org,chemistry,true,既存名簿\nA@example.org,math,false,既存名簿",
    ),
  ).toThrow("重複");
  expect(() =>
    parseLegacyMemberMigrationCsv(
      "email,subjects,projectManager,sourceNote\na@example.org,chemistry,manager,既存名簿",
    ),
  ).toThrow("projectManager");
});
