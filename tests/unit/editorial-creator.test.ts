import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  editorialCreatorName,
  ORGANIZATION_CREATOR_LABEL,
} from "../../src/lib/editorial-creator";

const migrationDirectory = new URL("../../migrations/", import.meta.url);
const creatorMigration = "0124_editorial_document_creator_kind.sql";
const backfillScript = fileURLToPath(
  new URL(
    "../../scripts/verify-editorial-creator-backfill.mjs",
    import.meta.url,
  ),
);

function adoptionId(identity: string) {
  const digest = createHash("sha256").update(identity).digest();
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function beforeCreatorMigration() {
  const db = new DatabaseSync(":memory:");
  for (const file of readdirSync(migrationDirectory)
    .filter((file) => file.endsWith(".sql") && file < creatorMigration)
    .sort()) {
    db.exec(readFileSync(new URL(file, migrationDirectory), "utf8"));
  }
  return db;
}

function seed(
  db: DatabaseSync,
  slug: string,
  options: {
    kind?: "canonical" | "update-proposal";
    id?: string;
    catalog?: boolean;
    source?: string | null;
    catalogSource?: string;
    catalogIdentity?: string;
    registered?: boolean;
  } = {},
) {
  const identity = `ja/mathematics/ring-theory/${slug}`;
  const id = options.id ?? adoptionId(identity);
  const source =
    options.source === undefined ? `article-${slug}` : options.source;
  db.prepare(
    `INSERT INTO editorial_documents
    (id,document_kind,source_article_id,locale,subject,category,slug,title,concept_id,body,status,created_by,updated_by,created_at,updated_at)
    VALUES (?,?,?,'ja','mathematics','ring-theory',?,?,?,'保持する本文','approved','registrar@example.com','reviewer@example.com','2026-08-30T00:00:00Z','2026-09-01T00:00:00Z')`,
  ).run(
    id,
    options.kind ?? "canonical",
    source,
    slug,
    `記事${slug}`,
    `math.ring.${slug}`,
  );
  if (options.catalog !== false) {
    db.prepare(
      `INSERT INTO editorial_article_catalog
      (path,identity_key,repository,locale,subject,category,slug,source_article_id,title,document_id,last_seen_at,registered_at,registered_by,registration_method)
      VALUES (?,?,'Atlasez/Admin-Atlesez','ja','mathematics','ring-theory',?,?,?,?,'2026-09-01T00:00:00Z',?,'registrar@example.com','legacy-backfill')`,
    ).run(
      `src/content/articles/jpn/mathematics/ring-theory/${slug}.md`,
      options.catalogIdentity ?? identity,
      slug,
      options.catalogSource ?? source,
      `記事${slug}`,
      id,
      options.registered === false ? null : "2026-08-30T00:00:00Z",
    );
  }
  return id;
}

function applyCreatorMigration(db: DatabaseSync) {
  db.exec(readFileSync(new URL(creatorMigration, migrationDirectory), "utf8"));
}

function preflightExport(id: string) {
  const schema = readdirSync(migrationDirectory)
    .filter((file) => file.endsWith(".sql") && file < creatorMigration)
    .sort()
    .map((file) => readFileSync(new URL(file, migrationDirectory), "utf8"))
    .join("\n");
  return `${schema}
    INSERT INTO editorial_documents(id,source_article_id,subject,category,locale,slug,title,concept_id,created_by,updated_by,created_at,updated_at)
    VALUES ('${id}','source-preflight','mathematics','overview','ja','preflight','検証原稿','math.overview.preflight','actor@example.com','actor@example.com','2026-08-30T00:00:00Z','2026-09-01T00:00:00Z');
    INSERT INTO editorial_article_catalog(path,identity_key,repository,locale,subject,category,slug,source_article_id,title,document_id,last_seen_at)
    VALUES ('src/content/articles/jpn/mathematics/ring-theory/preflight.md','ja/mathematics/ring-theory/preflight','Atlasez/Admin-Atlesez','ja','mathematics','ring-theory','preflight','source-preflight','検証原稿','${id}','2026-09-01T00:00:00Z');`;
}

function runBackfillFixture(sql: string, extraArguments: string[] = []) {
  const directory = mkdtempSync(join(tmpdir(), "editorial-creator-test-"));
  try {
    const path = join(directory, "fixture.sql");
    writeFileSync(path, sql, { mode: 0o600 });
    return execFileSync(
      process.execPath,
      [backfillScript, path, ...extraArguments],
      { encoding: "utf8", stdio: "pipe" },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("article creation identity", () => {
  it("shows the organization while retaining the registering actor", () => {
    const document = {
      creator_kind: "organization" as const,
      created_by: "registrar@example.com",
      created_by_display_name: "登録担当者",
    };
    expect(editorialCreatorName(document)).toBe(ORGANIZATION_CREATOR_LABEL);
    expect(document.created_by).toBe("registrar@example.com");
  });
  it("preserves personal creator names and existing fallbacks", () => {
    expect(
      editorialCreatorName({
        creator_kind: "person",
        created_by: "author@example.com",
        created_by_display_name: " 著者名 ",
      }),
    ).toBe("著者名");
    expect(editorialCreatorName({ created_by: "author@example.com" })).toBe(
      "author",
    );
    expect(editorialCreatorName({ created_by: "system" })).toBe("system");
    expect(editorialCreatorName({})).toBe("未設定");
  });
  it("backfills only adopted canonical documents while preserving every operational field", () => {
    const db = beforeCreatorMigration();
    try {
      const adopted = Array.from({ length: 161 }, (_, index) =>
        seed(db, `adopted-${index}`, { registered: index !== 0 }),
      );
      const excluded = [
        seed(db, "personal-linked", {
          id: "12345678-1234-4234-8234-123456789abc",
        }),
        seed(db, "update-proposal", { kind: "update-proposal" }),
        seed(db, "unlinked", { catalog: false }),
        seed(db, "source-mismatch", { catalogSource: "other-article" }),
        seed(db, "without-source", { source: null }),
        seed(db, "wrong-variant", {
          id: "12345678-1234-5234-4234-123456789abc",
        }),
      ];
      // Genuine imported documents may be moved after adoption: their original
      // catalog identity still proves the deterministic ID during preflight.
      db.prepare(
        "UPDATE editorial_documents SET category='overview' WHERE id=?",
      ).run(adopted[1]);
      const before = db
        .prepare("SELECT * FROM editorial_documents ORDER BY id")
        .all();
      const catalogBefore = db
        .prepare("SELECT * FROM editorial_article_catalog ORDER BY path")
        .all();
      applyCreatorMigration(db);
      const rows = db
        .prepare("SELECT * FROM editorial_documents ORDER BY id")
        .all();
      expect(rows.map(({ creator_kind: _creator, ...rest }) => rest)).toEqual(
        before,
      );
      expect(
        db
          .prepare("SELECT * FROM editorial_article_catalog ORDER BY path")
          .all(),
      ).toEqual(catalogBefore);
      const kinds = new Map(rows.map((row) => [row.id, row.creator_kind]));
      expect(adopted.every((id) => kinds.get(id) === "organization")).toBe(
        true,
      );
      expect(excluded.every((id) => kinds.get(id) === "person")).toBe(true);
      expect(
        rows.filter((row) => row.creator_kind === "organization"),
      ).toHaveLength(161);
      expect(rows.filter((row) => row.creator_kind === "person")).toHaveLength(
        excluded.length,
      );
    } finally {
      db.close();
    }
  });
  it("defaults future personal documents and proposals to person and rejects unknown creator kinds", () => {
    const db = beforeCreatorMigration();
    try {
      applyCreatorMigration(db);
      const person = seed(db, "new-person", {
        id: "12345678-1234-4234-8234-123456789abc",
      });
      const proposal = seed(db, "new-proposal", { kind: "update-proposal" });
      expect(
        db
          .prepare("SELECT creator_kind FROM editorial_documents WHERE id=?")
          .get(person),
      ).toEqual({ creator_kind: "person" });
      expect(
        db
          .prepare("SELECT creator_kind FROM editorial_documents WHERE id=?")
          .get(proposal),
      ).toEqual({ creator_kind: "person" });
      expect(() =>
        db
          .prepare(
            "UPDATE editorial_documents SET creator_kind='unknown' WHERE id=?",
          )
          .run(person),
      ).toThrow(/CHECK/);
    } finally {
      db.close();
    }
  });
  it("preflight verifies the original catalog identity after an article move", () => {
    const directory = mkdtempSync(join(tmpdir(), "editorial-creator-test-"));
    try {
      const path = join(directory, "fixture.sql");
      writeFileSync(
        path,
        preflightExport(adoptionId("ja/mathematics/ring-theory/preflight")),
        { mode: 0o600 },
      );
      const output = execFileSync(
        process.execPath,
        [
          fileURLToPath(
            new URL(
              "../../scripts/verify-editorial-creator-backfill.mjs",
              import.meta.url,
            ),
          ),
          path,
        ],
        { encoding: "utf8" },
      );
      expect(JSON.parse(output)).toMatchObject({
        verifiedImportedDocuments: 1,
        otherDocumentFieldsUnchanged: true,
        catalogUnchanged: true,
        integrity: "ok",
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("preflight stops when a version-5 shaped ID does not match the complete identity hash", () => {
    const directory = mkdtempSync(join(tmpdir(), "editorial-creator-test-"));
    try {
      const path = join(directory, "fixture.sql");
      writeFileSync(
        path,
        preflightExport("12345678-1234-5234-8234-123456789abc"),
        { mode: 0o600 },
      );
      expect(() =>
        execFileSync(
          process.execPath,
          [
            fileURLToPath(
              new URL(
                "../../scripts/verify-editorial-creator-backfill.mjs",
                import.meta.url,
              ),
            ),
            path,
          ],
          { encoding: "utf8", stdio: "pipe" },
        ),
      ).toThrow(/完全一致検証に失敗/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("verifies an applied migration without applying it again and reports the candidate ID set", () => {
    const id = adoptionId("ja/mathematics/ring-theory/preflight");
    const sql = `${preflightExport(id)}
      ${readFileSync(new URL(creatorMigration, migrationDirectory), "utf8")}
      INSERT INTO editorial_documents(id,subject,category,slug,title,concept_id,created_by,updated_by,created_at,updated_at)
      VALUES ('12345678-1234-4234-8234-123456789abc','mathematics','overview','person','個人原稿','math.overview.person','person@example.com','person@example.com','2026-08-30T00:00:00Z','2026-09-01T00:00:00Z');`;
    expect(
      JSON.parse(runBackfillFixture(sql, ["--verify-applied"])),
    ).toMatchObject({
      mode: "verify-applied",
      candidateIdSetSha256: createHash("sha256").update(id).digest("hex"),
      verifiedImportedDocuments: 1,
      personalDocuments: 1,
      totalDocuments: 2,
      otherDocumentFieldsUnchanged: true,
      catalogUnchanged: true,
      integrity: "ok",
    });
  });
  it("applied verification stops when a proven import remains person", () => {
    const sql = `${preflightExport(adoptionId("ja/mathematics/ring-theory/preflight"))}
      ${readFileSync(new URL(creatorMigration, migrationDirectory), "utf8")}
      UPDATE editorial_documents SET creator_kind='person';`;
    expect(() => runBackfillFixture(sql, ["--verify-applied"])).toThrow(
      /migrationの変更対象が一致しません/,
    );
  });
  it("applied verification rejects a snapshot before the creator column exists", () => {
    expect(() =>
      runBackfillFixture(
        preflightExport(adoptionId("ja/mathematics/ring-theory/preflight")),
        ["--verify-applied"],
      ),
    ).toThrow(/migrationの変更対象が一致しません/);
  });
  it("applied verification stops on a forged candidate even when it claims organization", () => {
    const sql = `${preflightExport("12345678-1234-5234-8234-123456789abc")}
      ${readFileSync(new URL(creatorMigration, migrationDirectory), "utf8")}`;
    expect(() => runBackfillFixture(sql, ["--verify-applied"])).toThrow(
      /完全一致検証に失敗/,
    );
  });
  it.each([
    { extra: ["--unknown"] },
    { extra: ["--verify-applied", "--unknown"] },
    { extra: ["--verify-applied", "--verify-applied"] },
  ])("rejects unrecognized or surplus arguments: $extra", ({ extra }) => {
    expect(() => runBackfillFixture("", extra)).toThrow(
      /対応する追加引数は--verify-appliedだけ/,
    );
  });
});
