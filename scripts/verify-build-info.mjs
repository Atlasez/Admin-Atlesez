import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

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

const expected =
  process.env.EXPECTED_COMMIT_SHA ?? process.env.GITHUB_SHA ?? gitCommit();
const info = JSON.parse(await readFile("dist/build-info.json", "utf8"));

if (!expected || expected === "unknown") {
  throw new Error("期待するGit commit SHAを解決できませんでした。");
}
if (info.commit !== expected) {
  throw new Error(
    `build-info.jsonのcommitが不一致です: expected=${expected}, actual=${info.commit}`,
  );
}
if (!/^[0-9a-f]{40}$/i.test(info.commit)) {
  throw new Error(
    `build-info.jsonのcommitがSHA-1形式ではありません: ${info.commit}`,
  );
}

console.log(`build-info.jsonを検証しました: ${info.commit}`);
