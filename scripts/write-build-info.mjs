import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const commit =
  process.env.CF_COMMIT_SHA ||
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  gitCommit() ||
  "unknown";

await mkdir("public", { recursive: true });
await writeFile(
  "public/build-info.json",
  `${JSON.stringify(
    {
      repository: process.env.GITHUB_REPOSITORY ?? "Atlasez/Admin-Atlesez",
      commit: commit || "unknown",
      ref:
        process.env.GITHUB_REF_NAME ??
        process.env.CF_BRANCH ??
        process.env.CF_PAGES_BRANCH ??
        "unknown",
      target: process.env.ATLASEZ_BUILD_TARGET ?? "unknown",
      builtAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
);
