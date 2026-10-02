import { DatabaseSync } from "node:sqlite";
import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";

const path = process.argv[2];
if (!path) throw new Error("SQL exportの絶対パスを指定してください。");
if (!path.startsWith("/")) throw new Error("絶対パスを指定してください。");
if (statSync(path).mode & 0o077)
  throw new Error(
    "SQL exportは所有者だけが読める権限（chmod 600）にしてください。",
  );
const source = readFileSync(path);
const db = new DatabaseSync(":memory:");
try {
  // Exportの作成順は親テーブルより子テーブルが先になる場合がある。
  // 取込中のFKチェックを止め、全テーブル復元後に全件を検査する。
  db.exec("PRAGMA foreign_keys=OFF");
  db.exec(source.toString("utf8"));
  db.exec("PRAGMA foreign_keys=ON");
  const integrity = db.prepare("PRAGMA integrity_check").all();
  const foreignKeys = db.prepare("PRAGMA foreign_key_check").all();
  if (integrity.length !== 1 || integrity[0].integrity_check !== "ok")
    throw new Error("復元したデータベースの整合性検査に失敗しました。");
  if (foreignKeys.length)
    throw new Error(
      `外部キー検査で${foreignKeys.length}件の不整合を検出しました。`,
    );
  const tableCount = db
    .prepare(
      "SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .get().total;
  console.log(
    JSON.stringify(
      {
        integrity: "ok",
        foreignKeyViolations: 0,
        tableCount,
        bytes: source.length,
        sha256: createHash("sha256").update(source).digest("hex"),
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
}
