import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = new URL(
  "../../scripts/verify-deploy-context.mjs",
  import.meta.url,
);
const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { scripts: Record<string, string> };
const tempDirs: string[] = [];

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function createMainCheckout() {
  const root = mkdtempSync(join(tmpdir(), "atlasez-admin-deploy-guard-"));
  tempDirs.push(root);
  const checkout = join(root, "checkout");
  const remote = join(root, "remote.git");
  mkdirSync(checkout);
  git(checkout, "init", "-b", "main");
  git(checkout, "config", "user.name", "Deploy guard test");
  git(checkout, "config", "user.email", "deploy-guard-test@example.invalid");
  writeFileSync(join(checkout, "tracked.txt"), "main source\n");
  git(checkout, "add", "tracked.txt");
  git(checkout, "commit", "-m", "initial main commit");
  git(checkout, "init", "--bare", remote);
  git(checkout, "remote", "add", "admin", remote);
  git(checkout, "push", "--set-upstream", "admin", "main");
  // Push does not populate remote-tracking refs consistently across Git versions.
  git(checkout, "fetch", "admin", "main");
  git(
    checkout,
    "remote",
    "set-url",
    "admin",
    "https://github.com/Atlasez/Admin-Atlesez.git",
  );
  return { checkout, sha: git(checkout, "rev-parse", "HEAD") };
}

function runGuard(
  checkout: string,
  approvedSha: string | undefined,
  target = "admin",
) {
  try {
    const stdout = execFileSync("node", [script.pathname, target], {
      cwd: checkout,
      encoding: "utf8",
      env: {
        ...process.env,
        DEPLOY_MAIN_SHA: approvedSha,
      },
    });
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    const result = error as {
      status?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      code: result.status ?? 1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  }
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("admin local deploy context guard", () => {
  it("wires the guard and ADMIN build identity before the deploy command", () => {
    const deploy = packageJson.scripts["deploy:admin"];

    expect(deploy).toContain("scripts/verify-deploy-context.mjs admin");
    expect(deploy).toContain(
      "ATLASEZ_BUILD_TARGET=admin SITE_URL=https://admin.atlasez.org",
    );
    expect(deploy).toContain("npm run verify:build-info && wrangler deploy");
    expect(deploy.indexOf("verify-deploy-context.mjs admin")).toBeLessThan(
      deploy.indexOf("npm run build"),
    );
    expect(deploy.indexOf("npm run build")).toBeLessThan(
      deploy.indexOf("npm run verify:build-info"),
    );
    expect(deploy.indexOf("npm run verify:build-info")).toBeLessThan(
      deploy.indexOf("wrangler deploy"),
    );
  });

  it("allows a clean main checkout pinned to a commit on its remote main", () => {
    const { checkout, sha } = createMainCheckout();
    const result = runGuard(checkout, sha);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`main SHA ${sha}`);
  });

  it("requires an explicit approved SHA that exactly matches HEAD", () => {
    const { checkout, sha } = createMainCheckout();

    expect(runGuard(checkout, undefined).stderr).toContain("DEPLOY_MAIN_SHA");
    expect(runGuard(checkout, "a".repeat(40)).stderr).toContain("一致しません");
    expect(runGuard(checkout, sha.toUpperCase()).code).toBe(1);
  });

  it("rejects dirty and untracked files", () => {
    const { checkout, sha } = createMainCheckout();
    writeFileSync(join(checkout, "untracked.txt"), "not deployable\n");

    expect(runGuard(checkout, sha).stderr).toContain("未コミット変更");
  });

  it("rejects feature branches and detached checkouts", () => {
    const { checkout, sha } = createMainCheckout();
    git(checkout, "switch", "-c", "codex/not-main");
    expect(runGuard(checkout, sha).stderr).toContain("main branchからのみ");

    git(checkout, "switch", "--detach", sha);
    expect(runGuard(checkout, sha).stderr).toContain("detached HEAD");
  });

  it("rejects a local main commit that is not present in remote main", () => {
    const { checkout } = createMainCheckout();
    writeFileSync(join(checkout, "local-only.txt"), "not on remote main\n");
    git(checkout, "add", "local-only.txt");
    git(checkout, "commit", "-m", "local-only commit");
    const localSha = git(checkout, "rev-parse", "HEAD");

    expect(runGuard(checkout, localSha).stderr).toContain("remote main");
  });

  it("rejects a main branch tracking a non-canonical repository", () => {
    const { checkout, sha } = createMainCheckout();
    git(
      checkout,
      "remote",
      "set-url",
      "admin",
      "https://github.com/example/fork.git",
    );

    expect(runGuard(checkout, sha).stderr).toContain("Atlasez/Admin-Atlesez");
  });
});
