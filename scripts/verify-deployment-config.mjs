import { readFile } from "node:fs/promises";

const targets = [
  {
    file: "wrangler.jsonc",
    values: [
      '"account_id": "812021e62fa20465950b61be55dfe064"',
      '"name": "atlasez01"',
      '"pattern": "atlasez.org/*"',
      '"pattern": "www.atlasez.org/*"',
      '"database_id": "d5112a62-7ed6-49c8-b6a2-18ee2dbab678"',
    ],
  },
  {
    file: "wrangler.admin.jsonc",
    values: [
      '"account_id": "812021e62fa20465950b61be55dfe064"',
      '"name": "atlasez-admin"',
      '"pattern": "admin.atlasez.org"',
      '"preview_urls": false',
      '"workers_dev": false',
      '"PUBLIC_ANALYTICS_ORIGIN": "https://atlasez.org"',
      '"database_id": "d5112a62-7ed6-49c8-b6a2-18ee2dbab678"',
    ],
  },
];

const failures = [];
for (const target of targets) {
  const source = await readFile(target.file, "utf8");
  for (const value of target.values) {
    if (!source.includes(value)) failures.push(`${target.file}: ${value}`);
  }
}

if (failures.length > 0) {
  console.error(
    "Cloudflare本番ターゲットの検証に失敗しました。誤ったWorkerへデプロイしないでください。\n",
  );
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  "Cloudflare本番ターゲットを検証しました: atlasez01 / atlasez-admin",
);
