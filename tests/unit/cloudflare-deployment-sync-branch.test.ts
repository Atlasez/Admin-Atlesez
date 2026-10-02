import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const script = fileURLToPath(
  new URL(
    "../../scripts/cloudflare-deployment-sync-branch.sh",
    import.meta.url,
  ),
);
const recordPath = "docs/deployments/cloudflare-latest.json";
let temporaryDirectory: string | undefined;

function command(binary: string, args: string[], cwd: string, env = {}) {
  const result = spawnSync(binary, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    throw new Error(
      `${binary} ${args.join(" ")} failed in ${cwd}\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

function git(directory: string, ...args: string[]) {
  return command("git", args, directory);
}

function commitFile(
  directory: string,
  file: string,
  contents: string,
  message: string,
) {
  const destination = join(directory, file);
  mkdirSync(resolve(destination, ".."), { recursive: true });
  writeFileSync(destination, contents);
  git(directory, "add", file);
  git(directory, "commit", "-m", message);
}

function initializeRepositories() {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "cloudflare-sync-branch-"));
  const remote = join(temporaryDirectory, "origin.git");
  const seed = join(temporaryDirectory, "seed");
  const runner = join(temporaryDirectory, "runner");

  command("git", ["init", "--bare", remote], temporaryDirectory);
  command("git", ["clone", remote, seed], temporaryDirectory);
  git(seed, "config", "user.name", "Workflow test");
  git(seed, "config", "user.email", "workflow-test@example.invalid");
  git(seed, "switch", "--create", "main");
  commitFile(seed, recordPath, '{"state":"stable"}\n', "initial audit record");
  git(seed, "push", "--set-upstream", "origin", "main");

  git(seed, "switch", "--create", "ops/cloudflare-deployment-sync");
  git(seed, "push", "--set-upstream", "origin", "HEAD");
  git(seed, "switch", "main");

  return { remote, runner, seed, temporaryDirectory };
}

function prepareRunner(runner: string, remote: string) {
  command(
    "git",
    ["clone", "--branch", "main", remote, runner],
    temporaryDirectory!,
  );
  git(runner, "config", "user.name", "Workflow test");
  git(runner, "config", "user.email", "workflow-test@example.invalid");
}

function runWorkflowScript(
  mode: "prepare" | "persist",
  directory: string,
  baseUpdated?: string,
) {
  const outputFile = join(temporaryDirectory!, `${mode}.output`);
  writeFileSync(outputFile, "");
  command("bash", [script, mode], directory, {
    BASE_UPDATED: baseUpdated,
    GITHUB_OUTPUT: outputFile,
  });
  return readFileSync(outputFile, "utf8").trim();
}

function remoteSyncSha(remote: string) {
  return command(
    "git",
    [
      "--git-dir",
      remote,
      "rev-parse",
      "refs/heads/ops/cloudflare-deployment-sync",
    ],
    temporaryDirectory!,
  );
}

afterEach(() => {
  if (temporaryDirectory)
    rmSync(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
});

describe("Cloudflare deployment sync branch workflow", () => {
  it("pushes main's merge even when the audit record is unchanged", () => {
    const { remote, runner, seed } = initializeRepositories();
    commitFile(seed, "app.txt", "main advanced\n", "advance main");
    git(seed, "push", "origin", "main");
    const mainSha = git(seed, "rev-parse", "main");

    prepareRunner(runner, remote);
    expect(runWorkflowScript("prepare", runner)).toBe("base_updated=true");
    expect(readFileSync(join(runner, recordPath), "utf8")).toBe(
      '{"state":"stable"}\n',
    );
    expect(runWorkflowScript("persist", runner, "true")).toBe("updated=true");
    expect(remoteSyncSha(remote)).toBe(git(runner, "rev-parse", "HEAD"));
    expect(
      spawnSync("git", [
        "--git-dir",
        remote,
        "merge-base",
        "--is-ancestor",
        mainSha,
        "refs/heads/ops/cloudflare-deployment-sync",
      ]).status,
    ).toBe(0);
  });

  it("skips the push and PR update when neither main nor the audit record changed", () => {
    const { remote, runner } = initializeRepositories();
    prepareRunner(runner, remote);
    expect(runWorkflowScript("prepare", runner)).toBe("base_updated=false");

    const previousSha = remoteSyncSha(remote);
    expect(runWorkflowScript("persist", runner, "false")).toBe("updated=false");
    expect(remoteSyncSha(remote)).toBe(previousSha);
  });

  it("commits and pushes a changed audit record", () => {
    const { remote, runner } = initializeRepositories();
    prepareRunner(runner, remote);
    expect(runWorkflowScript("prepare", runner)).toBe("base_updated=false");

    writeFileSync(join(runner, recordPath), '{"state":"changed"}\n');
    expect(runWorkflowScript("persist", runner, "false")).toBe("updated=true");
    const persistedFile = command(
      "git",
      [
        "--git-dir",
        remote,
        "show",
        `refs/heads/ops/cloudflare-deployment-sync:${recordPath}`,
      ],
      temporaryDirectory!,
    );
    expect(persistedFile).toBe('{"state":"changed"}');
  });
});
