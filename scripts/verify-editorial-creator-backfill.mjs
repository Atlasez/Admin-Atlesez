import { DatabaseSync } from "node:sqlite";
import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";

const path = process.argv[2];
const verifyApplied = process.argv[3] === "--verify-applied";
if (process.argv.length > 4 || (process.argv[3] && !verifyApplied))
  throw new Error("対応する追加引数は--verify-appliedだけです。");
if (!path?.startsWith("/"))
  throw new Error("所有者限定のD1 export絶対パスを指定してください。");
if (statSync(path).mode & 0o077)
  throw new Error("D1 exportにはchmod 600が必要です。");
const legacyImports = JSON.parse(
  readFileSync(
    new URL("./editorial-legacy-imports.json", import.meta.url),
    "utf8",
  ),
);
const db = new DatabaseSync(":memory:");
try {
  db.exec("PRAGMA foreign_keys=OFF");
  db.exec(readFileSync(path, "utf8"));
  const candidates = db
    .prepare(
      `SELECT d.id,c.identity_key FROM editorial_documents d
    JOIN editorial_article_catalog c ON c.document_id=d.id AND c.source_article_id=d.source_article_id
    WHERE d.document_kind='canonical' AND d.source_article_id IS NOT NULL
      AND substr(d.id,15,1)='5' AND substr(d.id,20,1) IN ('8','9','a','b')
      `,
    )
    .all();
  const ids = new Set();
  for (const row of candidates) {
    const digest = createHash("sha256").update(row.identity_key).digest();
    digest[6] = (digest[6] & 0x0f) | 0x50;
    digest[8] = (digest[8] & 0x3f) | 0x80;
    const hex = digest.subarray(0, 16).toString("hex");
    const expected = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    if (row.id !== expected)
      throw new Error(
        "取り込みIDの完全一致検証に失敗しました。migrationを停止してください。",
      );
    ids.add(row.id);
  }
  for (const legacy of legacyImports) {
    const document = db
      .prepare("SELECT * FROM editorial_documents WHERE id=?")
      .get(legacy.id);
    if (!document) continue;
    if (
      document.document_kind !== "canonical" ||
      document.source_article_id !== legacy.sourceArticleId ||
      document.created_at !== legacy.createdAt
    )
      throw new Error(
        "旧取り込み記事の確証metadataが一致しません。migrationを停止してください。",
      );
    if (
      !verifyApplied &&
      document.creator_kind !== "organization" &&
      createHash("sha256").update(document.body.trim()).digest("hex") !==
        legacy.sourceBodySha256
    )
      throw new Error(
        "旧取り込み記事の公開本文hashが一致しません。migrationを停止してください。",
      );
    ids.add(document.id);
  }
  if (!ids.size)
    throw new Error(
      "確証のある取り込み記事がありません。migrationを停止してください。",
    );
  const before = db
    .prepare("SELECT * FROM editorial_documents ORDER BY id")
    .all();
  const beforeCatalog = db
    .prepare("SELECT * FROM editorial_article_catalog ORDER BY path")
    .all();
  if (!verifyApplied) {
    const hasCreatorKind = db
      .prepare("PRAGMA table_info(editorial_documents)")
      .all()
      .some((column) => column.name === "creator_kind");
    if (!hasCreatorKind)
      db.exec(
        readFileSync(
          new URL(
            "../migrations/0124_editorial_document_creator_kind.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
    db.exec(
      readFileSync(
        new URL(
          "../migrations/0125_legacy_editorial_document_creators.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
  }
  const after = db
    .prepare("SELECT * FROM editorial_documents ORDER BY id")
    .all();
  if (after.length !== before.length)
    throw new Error("原稿件数が変化しました。");
  for (let index = 0; index < after.length; index++) {
    const { creator_kind: kind, ...remaining } = after[index];
    const { creator_kind: previousKind, ...previous } = before[index];
    if (verifyApplied && previousKind !== kind)
      throw new Error("検証中に作成主体が変化しました。");
    if (JSON.stringify(remaining) !== JSON.stringify(previous))
      throw new Error("作成主体以外の原稿データが変化しました。");
    if (kind !== (ids.has(after[index].id) ? "organization" : "person"))
      throw new Error("migrationの変更対象が一致しません。");
  }
  if (
    JSON.stringify(beforeCatalog) !==
    JSON.stringify(
      db.prepare("SELECT * FROM editorial_article_catalog ORDER BY path").all(),
    )
  )
    throw new Error("取り込み担当者の証跡が変化しました。");
  db.exec("PRAGMA foreign_keys=ON");
  if (
    db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" ||
    db.prepare("PRAGMA foreign_key_check").all().length
  )
    throw new Error("migration後の整合性検査に失敗しました。");
  console.log(
    JSON.stringify(
      {
        mode: verifyApplied ? "verify-applied" : "preflight",
        candidateIdSetSha256: createHash("sha256")
          .update([...ids].sort().join("\n"))
          .digest("hex"),
        verifiedImportedDocuments: ids.size,
        personalDocuments: after.length - ids.size,
        totalDocuments: after.length,
        otherDocumentFieldsUnchanged: true,
        catalogUnchanged: true,
        integrity: "ok",
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
}
