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
const legacyMigration = "0125_legacy_editorial_document_creators.sql";
type LegacyImport = {
  id: string;
  sourceArticleId: string;
  subject: string;
  category: string;
  locale: string;
  slug: string;
  createdAt: string;
  sourceCommit: string;
  sourcePath: string;
  sourceBodySha256: string;
};
const legacyImports = JSON.parse(
  readFileSync(
    new URL("../../scripts/editorial-legacy-imports.json", import.meta.url),
    "utf8",
  ),
) as LegacyImport[];
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

const sqlString = (value: string) => `'${value.replaceAll("'", "''")}'`;

function publicLegacyFixture(entry: LegacyImport) {
  const markdown = readFileSync(
    new URL(
      `../fixtures/editorial-legacy-imports/${entry.slug}.md.txt`,
      import.meta.url,
    ),
    "utf8",
  );
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match)
    throw new Error("Published evidence must include YAML frontmatter");
  return { frontmatter: match[1], body: match[2].trim() };
}

function legacyDocumentSql(
  entry: LegacyImport,
  overrides: Partial<LegacyImport> & {
    documentKind?: string;
    body?: string;
  } = {},
) {
  const item = { ...entry, ...overrides };
  return `INSERT INTO editorial_documents
    (id,document_kind,source_article_id,subject,category,locale,slug,title,concept_id,body,status,created_by,updated_by,created_at,updated_at)
    VALUES (${[item.id, item.documentKind ?? "canonical", item.sourceArticleId, item.subject, item.category, item.locale, item.slug, "保持する記事", "math.overview.fixture", item.body ?? publicLegacyFixture(entry).body, "approved", "registering-actor@example.com", "latest-editor@example.com", item.createdAt, "2026-09-01T00:00:00Z"].map(sqlString).join(",")});`;
}

function legacySnapshotSql(creatorApplied = false, legacyApplied = false) {
  const baseId = adoptionId("ja/mathematics/ring-theory/preflight");
  let sql = preflightExport(baseId);
  for (let index = 1; index < 161; index++) {
    const slug = `imported-${index}`;
    const identity = `ja/mathematics/ring-theory/${slug}`;
    const id = adoptionId(identity);
    sql += `INSERT INTO editorial_documents(id,source_article_id,subject,category,locale,slug,title,concept_id,created_by,updated_by,created_at,updated_at)
      VALUES (${sqlString(id)},${sqlString(`source-${slug}`)},'mathematics','ring-theory','ja',${sqlString(slug)},'運営原稿','math.ring-theory.fixture','actor@example.com','editor@example.com','2026-08-31T00:00:00Z','2026-09-01T00:00:00Z');
      INSERT INTO editorial_article_catalog(path,identity_key,repository,locale,subject,category,slug,source_article_id,title,document_id,last_seen_at)
      VALUES (${sqlString(`src/content/articles/ja/mathematics/ring-theory/${slug}.md`)},${sqlString(identity)},'Atlasez/Admin-Atlesez','ja','mathematics','ring-theory',${sqlString(slug)},${sqlString(`source-${slug}`)},'運営原稿',${sqlString(id)},'2026-09-01T00:00:00Z');`;
  }
  sql += legacyImports.map((entry) => legacyDocumentSql(entry)).join("\n");
  if (creatorApplied)
    sql += readFileSync(new URL(creatorMigration, migrationDirectory), "utf8");
  if (legacyApplied)
    sql += readFileSync(new URL(legacyMigration, migrationDirectory), "utf8");
  return sql;
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

describe("verified legacy public article imports", () => {
  it("pins three public Git sources and matches their published article identity and complete trimmed body hashes", () => {
    expect(legacyImports.map((entry) => entry.id).sort()).toEqual([
      "403ffac6-4b84-410d-957f-038b416d6f59",
      "d00e20a1-1dd8-4bcb-99a7-13ee9bf780e8",
      "d6ff9e83-7f01-4734-bffe-6b94b52b0d06",
    ]);
    for (const entry of legacyImports) {
      expect(entry.sourceCommit).toBe(
        "fae16b9828c8f9942c41b77d9230c6f0722229f7",
      );
      expect(entry.sourcePath).toBe(
        `src/content/articles/${entry.locale}/${entry.subject}/${entry.category}/${entry.slug}.md`,
      );
      expect(entry.sourceBodySha256).toMatch(/^[a-f0-9]{64}$/);
      expect(new Date(entry.createdAt).toISOString()).toBe(entry.createdAt);
      const { frontmatter, body } = publicLegacyFixture(entry);
      const metadata = new Map(
        [...frontmatter.matchAll(/^([A-Za-z]+):\s*(.*?)\s*$/gm)].map(
          (match) => [match[1], match[2]],
        ),
      );
      expect(metadata.get("articleId")).toBe(entry.sourceArticleId);
      expect(metadata.get("status")).toBe("published");
      for (const field of ["subject", "category", "locale", "slug"] as const)
        expect(metadata.get(field)).toBe(entry[field]);
      expect(createHash("sha256").update(body).digest("hex")).toBe(
        entry.sourceBodySha256,
      );
      expect(Date.parse(metadata.get("updatedAt") ?? "")).toBeLessThan(
        Date.parse(entry.createdAt),
      );
    }
  });

  it("0125 changes only three proven imports and preserves every previous column and the catalog", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(legacySnapshotSql(true));
      const personId = "12345678-1234-4234-8234-123456789abc";
      const proposalId = "22345678-1234-4234-8234-123456789abc";
      db.exec(
        legacyDocumentSql(legacyImports[0], {
          id: personId,
          slug: "personal-linked",
          sourceArticleId: "other-personal-source",
        }),
      );
      db.exec(
        legacyDocumentSql(legacyImports[0], {
          id: proposalId,
          slug: "personal-proposal",
          documentKind: "update-proposal",
        }),
      );
      const before = db
        .prepare("SELECT * FROM editorial_documents ORDER BY id")
        .all();
      const catalogBefore = db
        .prepare("SELECT * FROM editorial_article_catalog ORDER BY path")
        .all();
      db.exec(
        readFileSync(new URL(legacyMigration, migrationDirectory), "utf8"),
      );
      const after = db
        .prepare("SELECT * FROM editorial_documents ORDER BY id")
        .all();
      expect(
        after.map(({ creator_kind: _kind, ...remaining }) => remaining),
      ).toEqual(
        before.map(({ creator_kind: _kind, ...remaining }) => remaining),
      );
      for (const row of after) {
        const previous = before.find((item) => item.id === row.id)!;
        expect(row.creator_kind).toBe(
          legacyImports.some((entry) => entry.id === row.id)
            ? "organization"
            : previous.creator_kind,
        );
      }
      expect(
        db
          .prepare("SELECT * FROM editorial_article_catalog ORDER BY path")
          .all(),
      ).toEqual(catalogBefore);
      expect(
        db
          .prepare(
            "SELECT creator_kind FROM editorial_documents WHERE id IN (?,?)",
          )
          .all(personId, proposalId),
      ).toEqual([{ creator_kind: "person" }, { creator_kind: "person" }]);
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it.each([false, true])(
    "preflight simulates all remaining migrations with creator column already applied=%s",
    (creatorApplied) => {
      const result = JSON.parse(
        runBackfillFixture(legacySnapshotSql(creatorApplied)),
      );
      expect(result).toMatchObject({
        mode: "preflight",
        verifiedImportedDocuments: 164,
        personalDocuments: 0,
        totalDocuments: 164,
        otherDocumentFieldsUnchanged: true,
        catalogUnchanged: true,
        integrity: "ok",
      });
      const applied = JSON.parse(
        runBackfillFixture(legacySnapshotSql(true, true), ["--verify-applied"]),
      );
      expect(applied).toMatchObject({
        mode: "verify-applied",
        verifiedImportedDocuments: 164,
        candidateIdSetSha256: result.candidateIdSetSha256,
        integrity: "ok",
      });
    },
  );

  it("a different UUIDv4 personal document with the same source and date is excluded", () => {
    const personalId = "12345678-1234-4234-8234-123456789abc";
    const sql = `${legacySnapshotSql(true)}
      DELETE FROM editorial_documents WHERE id=${sqlString(legacyImports[0].id)};
      ${legacyDocumentSql(legacyImports[0], { id: personalId })}`;
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(sql);
      db.exec(
        readFileSync(new URL(legacyMigration, migrationDirectory), "utf8"),
      );
      expect(
        db
          .prepare("SELECT creator_kind FROM editorial_documents WHERE id=?")
          .get(personalId),
      ).toEqual({ creator_kind: "person" });
      expect(JSON.parse(runBackfillFixture(sql))).toMatchObject({
        verifiedImportedDocuments: 163,
        personalDocuments: 1,
        totalDocuments: 164,
      });
    } finally {
      db.close();
    }
  });

  it("applied verification requires all legacy imports to be organization without changing person rows", () => {
    const sql = `${legacySnapshotSql(true, true)} UPDATE editorial_documents SET creator_kind='person' WHERE id=${sqlString(legacyImports[0].id)};`;
    expect(() => runBackfillFixture(sql, ["--verify-applied"])).toThrow(
      /migrationの変更対象が一致しません/,
    );
  });

  it.each([
    { column: "source_article_id", value: "wrong-source" },
    { column: "created_at", value: "2026-08-31T00:00:00.000Z" },
    { column: "document_kind", value: "update-proposal" },
  ])(
    "preflight stops when the known legacy ID has conflicting $column",
    ({ column, value }) => {
      const sql = `${legacySnapshotSql(true)} UPDATE editorial_documents SET ${column}=${sqlString(value)} WHERE id=${sqlString(legacyImports[0].id)};`;
      expect(() => runBackfillFixture(sql)).toThrow(
        /確証metadataが一致しません/,
      );
    },
  );

  it("preflight stops before correcting a legacy import whose body does not match its public proof", () => {
    const sql = `${legacySnapshotSql(true)} UPDATE editorial_documents SET body='unproven edited content' WHERE id=${sqlString(legacyImports[0].id)};`;
    expect(() => runBackfillFixture(sql)).toThrow(/公開本文hashが一致しません/);
  });

  it("after correction permits later article editing while continuing to validate ID and source provenance", () => {
    const sql = `${legacySnapshotSql(true, true)} UPDATE editorial_documents SET body='later approved edits' WHERE id=${sqlString(legacyImports[0].id)};`;
    expect(JSON.parse(runBackfillFixture(sql))).toMatchObject({
      verifiedImportedDocuments: 164,
      otherDocumentFieldsUnchanged: true,
    });
    expect(
      JSON.parse(runBackfillFixture(sql, ["--verify-applied"])),
    ).toMatchObject({ verifiedImportedDocuments: 164, integrity: "ok" });
  });
});
