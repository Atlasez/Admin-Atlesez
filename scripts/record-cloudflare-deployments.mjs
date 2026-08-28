import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

const workers = [
  {
    name: "atlasez-admin",
    config: "wrangler.admin.jsonc",
    buildInfoUrl: "https://admin.atlasez.org/build-info.json",
  },
  {
    name: "atlasez01",
    config: "wrangler.jsonc",
    buildInfoUrl: "https://atlasez.org/build-info.json",
  },
];

function wrangler(args) {
  try {
    const output = execFileSync(
      "npx",
      ["--yes", "wrangler@4.127.0", ...args, "--json"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, CI: "true" },
      },
    );
    return JSON.parse(output);
  } catch (error) {
    const message =
      error?.stderr?.toString().trim() || error?.message || "unknown error";
    return { error: message };
  }
}

async function publicBuildInfo(url) {
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      // A 404 or an HTML error page is intentionally recorded as missing metadata.
    }
    return {
      url,
      status: response.status,
      sha: typeof body?.commit === "string" ? body.commit : null,
      ref: typeof body?.ref === "string" ? body.ref : null,
      target: typeof body?.target === "string" ? body.target : null,
      builtAt: typeof body?.builtAt === "string" ? body.builtAt : null,
    };
  } catch (error) {
    return {
      url,
      status: null,
      error: error?.message || "request failed",
      sha: null,
      ref: null,
      target: null,
      builtAt: null,
    };
  }
}

const snapshot = {
  schemaVersion: 1,
  purpose: "Cloudflare本番Deploymentの監査記録。コードの正本はGitHub main。",
  generatedBy: "scripts/record-cloudflare-deployments.mjs",
  workers: [],
};

for (const worker of workers) {
  const args = [
    "deployments",
    "status",
    "--config",
    worker.config,
    "--name",
    worker.name,
  ];
  const status = wrangler(args);
  const history = wrangler([
    "deployments",
    "list",
    "--config",
    worker.config,
    "--name",
    worker.name,
  ]);
  snapshot.workers.push({
    name: worker.name,
    config: worker.config,
    production: status,
    recentDeployments: Array.isArray(history) ? history : [],
    buildInfo: await publicBuildInfo(worker.buildInfoUrl),
  });
}

await mkdir("docs/deployments", { recursive: true });
await writeFile(
  "docs/deployments/cloudflare-latest.json",
  `${JSON.stringify(snapshot, null, 2)}\n`,
);
console.log(
  "Cloudflare Deploymentの読み取り記録をdocs/deployments/cloudflare-latest.jsonへ出力しました。",
);
