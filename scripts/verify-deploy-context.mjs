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
const dirty = git(["status", "--porcelain"]);
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
if (branch && branch !== "main") {
  failures.push(
    `現在のbranchは ${branch} です。mainまたはdetached HEADから実行してください。`,
  );
}

if (failures.length > 0) {
  console.error(
    "本番デプロイを停止しました。mainの固定SHA・clean worktree・明示承認が必要です。",
  );
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`本番デプロイ対象を確認しました: ${target} / main SHA ${head}`);
