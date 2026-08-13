import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const base = "https://www.mext.go.jp";
const files = [
  "/content/20260529-mxt_chousa01-000011635_2.csv",
  "/content/20260529-mxt_chousa01-000011635_4.csv",
  "/content/20260529-mxt_chousa01-000011635_6.csv",
];
const institutions = new Map();
for (const file of files) {
  const response = await fetch(base + file);
  if (!response.ok)
    throw new Error(`学校コード一覧を取得できませんでした: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const csv = new TextDecoder("shift-jis").decode(bytes);
  for (const row of csv.split(/\r?\n/).slice(2)) {
    const columns = row
      .match(/(?:"(?:[^"]|"")*"|[^,]*)(?:,|$)/g)
      ?.slice(0, -1)
      .map((value) =>
        value
          .replace(/,$/, "")
          .replace(/^"|"$/g, "")
          .replaceAll('""', '"')
          .replace(/\s+/g, " ")
          .trim(),
      );
    const code = columns?.[0];
    const name = columns?.[5];
    if (code && name) institutions.set(code, { code, name });
  }
}
const output = [...institutions.values()].sort((a, b) =>
  a.name.localeCompare(b.name, "ja"),
);
const destination = "public/data/institutions.json";
await mkdir(dirname(destination), { recursive: true });
await writeFile(
  destination,
  JSON.stringify({
    source: "文部科学省 学校コード（令和7年5月1日時点・令和8年5月20日更新）",
    updatedAt: new Date().toISOString(),
    institutions: output,
  }),
  "utf8",
);
console.log(`学校候補 ${output.length}件を ${destination} に保存しました。`);
