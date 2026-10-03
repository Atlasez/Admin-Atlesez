import { appendFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { classifyAdminDeployment } from "./lib/admin-deployment-classifier.mjs";

const targetCommit = process.env.TARGET_COMMIT?.trim();
if (!/^[0-9a-f]{40}$/.test(targetCommit ?? "")) {
  throw new Error("TARGET_COMMIT must be a 40-character commit SHA");
}

let deployRequired = true;
let reason = "live-build-info-unavailable";

try {
  const url = new URL(
    process.env.BUILD_INFO_URL || "https://admin.atlasez.org/build-info.json",
  );
  url.searchParams.set("deployment_check", `${Date.now()}`);
  const response = await fetch(url, {
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buildInfo = await response.json();

  if (
    buildInfo.repository !== "Atlasez/Admin-Atlesez" ||
    buildInfo.target !== "admin" ||
    !/^[0-9a-f]{40}$/.test(buildInfo.commit ?? "")
  ) {
    throw new Error("live build-info identity is invalid");
  }

  const liveCommit = buildInfo.commit;
  const ancestryCheck =
    liveCommit === targetCommit
      ? null
      : spawnSync(
          "git",
          ["merge-base", "--is-ancestor", liveCommit, targetCommit],
          { stdio: "ignore" },
        );
  const liveIsAncestor =
    liveCommit === targetCommit || ancestryCheck?.status === 0;
  const changedFiles =
    liveIsAncestor && liveCommit !== targetCommit
      ? execFileSync("git", ["diff", "--name-only", liveCommit, targetCommit], {
          encoding: "utf8",
        })
          .split("\n")
          .filter(Boolean)
      : [];

  ({ deployRequired, reason } = classifyAdminDeployment({
    liveCommit,
    targetCommit,
    changedFiles,
    liveIsAncestor,
  }));
} catch (error) {
  console.warn(
    `Could not classify live ADMIN state; deployment stays enabled: ${error.message}`,
  );
}

console.log(JSON.stringify({ deployRequired, reason, targetCommit }, null, 2));
if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `deploy_required=${deployRequired}\nreason=${reason}\n`,
  );
}
