import { execFileSync } from "node:child_process";

const target = process.argv[2];
const failures = [];

if (!new Set(["admin", "public"]).has(target)) {
  failures.push("対象は admin または public を明示してください。");
}

function git(args) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const head = git(["rev-parse", "HEAD"]);
const branch = git(["symbolic-ref", "--quiet", "--short", "HEAD"]);
const dirty = git(["status", "--porcelain", "--untracked-files=all"]);
const approvedSha = process.env.DEPLOY_MAIN_SHA?.trim() ?? "";

if (!/^[0-9a-f]{40}$/.test(head)) {
  failures.push("GitのHEAD SHAを取得できません。");
}
if (!/^[0-9a-f]{40}$/.test(approvedSha)) {
  failures.push(
    "DEPLOY_MAIN_SHAに、デプロイを承認したmainの40桁SHAを指定してください。",
  );
} else if (head !== approvedSha) {
  failures.push(`HEAD (${head}) と承認SHA (${approvedSha}) が一致しません。`);
}
if (dirty) {
  failures.push("作業ツリーに未コミット変更があります。");
}
if (target === "admin" && branch !== "main") {
  failures.push(
    `現在のbranchは ${branch || "detached HEAD"} です。admin deployはmain branchからのみ実行できます。`,
  );
}

if (target === "admin" && branch === "main") {
  const upstream = git([
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "main@{upstream}",
  ]);
  const upstreamRef = upstream
    ? git(["rev-parse", "--symbolic-full-name", upstream])
    : "";
  const upstreamRemote = upstream.endsWith("/main")
    ? upstream.slice(0, -"/main".length)
    : "";
  const remoteUrl = upstreamRemote
    ? git(["remote", "get-url", upstreamRemote])
    : "";
  const normalizedRemoteUrl = remoteUrl
    .trim()
    .replace(/^git@github\.com:/i, "github.com/")
    .replace(/^ssh:\/\/git@github\.com\//i, "github.com/")
    .replace(/^https?:\/\/github\.com\//i, "github.com/")
    .replace(/\.git$/i, "")
    .toLowerCase();

  if (
    !upstream ||
    !upstreamRef.startsWith("refs/remotes/") ||
    !upstream.endsWith("/main") ||
    normalizedRemoteUrl !== "github.com/atlasez/admin-atlesez"
  ) {
    failures.push(
      "正本リポジトリAtlasez/Admin-Atlesezのmain remote-tracking upstreamを確認できません。remote設定とfetchを確認してください。",
    );
  } else {
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", head, upstream], {
        stdio: "ignore",
      });
    } catch {
      failures.push(
        `HEAD (${head}) はremote main (${upstream})由来ではありません。`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error(
    "本番デプロイを停止しました。mainの固定SHA・clean worktree・明示承認が必要です。",
  );
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`本番デプロイ対象を確認しました: ${target} / main SHA ${head}`);
