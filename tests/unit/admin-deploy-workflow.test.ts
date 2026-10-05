import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

type Step = {
  name?: string;
  run?: string;
  uses?: string;
  if?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
};
type Workflow = {
  name?: string;
  on?: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs?: Record<
    string,
    {
      if?: string;
      environment?: unknown;
      "timeout-minutes"?: number;
      env?: Record<string, string>;
      steps?: Step[];
    }
  >;
};
const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const verificationSource = source(
  ".github/workflows/verify-admin-production.yml",
);
const verification = parse(verificationSource) as Workflow;
const buildSource = source(".github/workflows/deploy-admin-from-github.yml");
const build = parse(buildSource) as Workflow;
const commands = (workflow: Workflow) =>
  Object.values(workflow.jobs ?? {})
    .flatMap((job) => job.steps ?? [])
    .map((step) => step.run ?? "")
    .join("\n");

// Execute the workflow's actual shell loop with local command fixtures. Nothing
// contacts GitHub/Cloudflare or waits for real Workers Builds in these tests.
function exerciseVerificationLoop(
  mainResponses: string[],
  verifierExitCode: number,
) {
  const directory = mkdtempSync(join(tmpdir(), "atlasez-deploy-verifier-"));
  const expected = "a".repeat(40);
  const run = verification.jobs?.verify?.steps?.find((step) =>
    step.run?.includes("scripts/verify-live-admin-production.mjs"),
  )?.run;
  if (!run) throw new Error("Production verification loop is missing");
  try {
    writeFileSync(join(directory, "responses"), mainResponses.join("\n"));
    for (const [name, body] of Object.entries({
      gh: `count=0
if [ -f "$FIXTURE_DIRECTORY/gh-count" ]; then count=$(cat "$FIXTURE_DIRECTORY/gh-count"); fi
count=$((count + 1))
echo "$count" > "$FIXTURE_DIRECTORY/gh-count"
sed -n "\${count}p" "$FIXTURE_DIRECTORY/responses"`,
      node: `echo "$EXPECTED_COMMIT" >> "$FIXTURE_DIRECTORY/verifications"
exit "$FIXTURE_VERIFIER_EXIT"`,
      git: `echo "$*" >> "$FIXTURE_DIRECTORY/git-calls"`,
      sleep: `echo "$*" >> "$FIXTURE_DIRECTORY/sleeps"`,
    })) {
      writeFileSync(join(directory, name), `#!/bin/sh\n${body}\n`, {
        mode: 0o700,
      });
    }
    const result = spawnSync("bash", ["-c", run], {
      encoding: "utf8",
      timeout: 5_000,
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        EXPECTED_COMMIT: expected,
        GITHUB_REPOSITORY: "Atlasez/Admin-Atlesez",
        FIXTURE_DIRECTORY: directory,
        FIXTURE_VERIFIER_EXIT: String(verifierExitCode),
      },
    });
    const lines = (name: string) => {
      try {
        return readFileSync(join(directory, name), "utf8").trim().split("\n");
      } catch {
        return [];
      }
    };
    return {
      status: result.status,
      error: result.error,
      output: `${result.stdout}\n${result.stderr}`,
      verifications: lines("verifications"),
      sleeps: lines("sleeps"),
      gitCalls: lines("git-calls"),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("ADMIN Workers Builds-only production policy", () => {
  it("keeps the previous deployment workflow identity but removes every live write and production gate", () => {
    expect(build.name).toBe("Verify ADMIN build only");
    expect(build.on?.workflow_run).toEqual({
      workflows: ["CI"],
      types: ["completed"],
    });
    expect(build.on).not.toHaveProperty("workflow_dispatch");
    expect(Object.keys(build.jobs ?? {})).toEqual(["verify"]);
    expect(build.permissions).toEqual({ contents: "read" });
    for (const job of Object.values(build.jobs ?? {})) {
      expect(job.environment).toBeUndefined();
      expect(job.if).toContain("github.event.workflow_run.event == 'push'");
      expect(job.if).toContain(
        "github.event.workflow_run.head_branch == 'main'",
      );
      expect(job.if).toContain(
        "github.event.workflow_run.head_repository.full_name == github.repository",
      );
      expect(job.if).toContain(
        "github.event.workflow_run.conclusion == 'success'",
      );
    }
    expect(buildSource).not.toContain("secrets.");
    expect(buildSource).not.toContain("CLOUDFLARE_API_TOKEN");
    expect(buildSource).not.toContain("CLOUDFLARE_DEPLOY_API_TOKEN");
    expect(commands(build)).not.toContain("npm run deploy:admin");
    expect(commands(build)).not.toContain("d1 migrations apply");
    const wranglerLines = commands(build)
      .split("\n")
      .filter((line) => line.includes("wrangler"));
    expect(wranglerLines).toEqual([
      "npx wrangler deploy --dry-run --config wrangler.admin.jsonc --keep-vars",
    ]);
  });

  it("preserves all target, identity, CI, dry-run and artifact checks", () => {
    for (const required of [
      "npm ci",
      "npm run verify:deploy-config",
      "npm run check",
      "npm run lint",
      "npm test",
      "npm run format:check",
      "npm run verify:build-info",
      "node scripts/validate-content.mjs",
      "npm run audit:math",
    ])
      expect(commands(build)).toContain(required);
    const steps = build.jobs?.verify?.steps ?? [];
    const buildStep = steps.find((step) => step.name === "Build ADMIN assets");
    expect(buildStep?.env).toMatchObject({
      ATLASEZ_BUILD_TARGET: "admin",
      SITE_URL: "https://admin.atlasez.org",
      BASE_PATH: "/",
      CF_BRANCH: "main",
    });
    expect(buildStep?.env?.CF_COMMIT_SHA).toBe(
      "${{ github.event.workflow_run.head_sha || github.sha }}",
    );
    const identity =
      steps.find((step) => step.name === "Verify ADMIN build metadata")?.run ??
      "";
    for (const invariant of [
      'info.repository !== "Atlasez/Admin-Atlesez"',
      "info.commit !== process.env.BUILD_SHA",
      'info.ref !== "main"',
      'info.target !== "admin"',
    ])
      expect(identity).toContain(invariant);
    expect(
      steps.find((step) => step.uses === "actions/upload-artifact@v4")?.with,
    ).toMatchObject({
      path: "dist/",
      "if-no-files-found": "error",
      "retention-days": 7,
    });
  });

  it("verifies fixed production on schedule and dispatch without workflow dependencies or active-run skips", () => {
    expect(Object.keys(verification.on ?? {})).toEqual([
      "schedule",
      "workflow_dispatch",
    ]);
    expect(verification.on?.schedule).toEqual([{ cron: "*/15 * * * *" }]);
    expect(verification.permissions).toEqual({ contents: "read" });
    expect(verificationSource).not.toContain("actions/workflows");
    expect(verificationSource).not.toContain("skip=true");
    expect(verificationSource).not.toContain("steps.main.outputs.skip");
    expect(verificationSource).not.toContain("Deploy ADMIN from GitHub");
    expect(verificationSource).not.toContain("secrets.");
    const steps = verification.jobs?.verify?.steps ?? [];
    expect(steps[0]?.run).toContain("git/ref/heads/main");
    expect(steps[1]?.with?.["fetch-depth"]).toBe(0);
    const live = steps.find((step) =>
      step.run?.includes("scripts/verify-live-admin-production.mjs"),
    );
    expect(live?.env).toMatchObject({
      BUILD_INFO_URL: "https://admin.atlasez.org/build-info.json",
      ALLOW_AUDIT_ONLY_ADVANCE: "true",
    });
    expect(live?.run).toContain("git fetch --quiet origin main");
    expect(live?.run).toContain('export EXPECTED_COMMIT="$latest_main"');
    expect(live?.run).toContain('[ "$confirmed_main" = "$EXPECTED_COMMIT" ]');
  });

  it("bounds build delay and fails truthfully after every unsuccessful verification", () => {
    expect(verification.jobs?.verify?.["timeout-minutes"]).toBe(20);
    const run = commands(verification);
    expect(run).toContain("for attempt in $(seq 1 15)");
    expect(run).toContain('if [ "$attempt" -lt 15 ]');
    expect(run).toContain("sleep 60");
    expect(run.trim()).toMatch(/exit 1$/);
    expect(run).not.toContain("承認待ち");
    expect(run).not.toContain("照合を後続");
    expect(run).not.toContain("wrangler");
  });

  it("runs all 15 failed comparisons and exits unsuccessfully without a pending-run shortcut", () => {
    const result = exerciseVerificationLoop(Array(15).fill("a".repeat(40)), 1);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.verifications).toHaveLength(15);
    expect(result.sleeps).toEqual(Array(14).fill("60"));
    expect(result.output).toContain("最大14分待ってもmainと照合できません");
  });

  it("succeeds only after the live verifier passes and main is rechecked", () => {
    const result = exerciseVerificationLoop(Array(2).fill("a".repeat(40)), 0);
    expect(result.error).toBeUndefined();
    expect(result.status, result.output).toBe(0);
    expect(result.verifications).toEqual(["a".repeat(40)]);
    expect(result.sleeps).toEqual([]);
  });

  it("rechecks an advancing main rather than reporting an older comparison as current", () => {
    const first = "a".repeat(40);
    const next = "b".repeat(40);
    const result = exerciseVerificationLoop([first, next, next, next], 0);
    expect(result.error).toBeUndefined();
    expect(result.status, result.output).toBe(0);
    expect(result.verifications).toEqual([first, next]);
    expect(result.sleeps).toEqual(["60"]);
    expect(result.gitCalls).toEqual([
      "fetch --quiet origin main",
      `cat-file -e ${next}^{commit}`,
    ]);
  });

  it("preserves PR and main CI validation without a second production writer", () => {
    const ci = parse(source(".github/workflows/ci.yml")) as Workflow;
    expect(ci.name).toBe("CI");
    expect(ci.on?.push).toEqual({ branches: ["main"] });
    expect(ci.on).toHaveProperty("pull_request");
    expect(commands(ci)).toContain("npm run verify:deploy-config");
    expect(commands(ci)).toContain("npm run verify:build-info");
    expect(commands(ci)).toContain("npx playwright test");
    expect(commands(ci)).not.toMatch(/wrangler\s+deploy/);
    expect(source(".github/workflows/ci.yml")).not.toContain(
      "CLOUDFLARE_DEPLOY_API_TOKEN",
    );
  });

  it("preserves the read-only Cloudflare deployment auditor", () => {
    const audit = parse(
      source(".github/workflows/cloudflare-deployment-sync.yml"),
    ) as Workflow;
    expect(audit.on?.schedule).toEqual([{ cron: "*/15 * * * *" }]);
    expect(commands(audit)).toContain("npm run audit:cloudflare-deployments");
    expect(commands(audit)).not.toMatch(
      /wrangler\s+(deploy|versions\s+upload|d1)/,
    );
    expect(
      source(".github/workflows/cloudflare-deployment-sync.yml"),
    ).not.toContain("CLOUDFLARE_DEPLOY_API_TOKEN");
  });

  it("keeps mandatory docs aligned with main-only Builds and migration prerequisites", () => {
    for (const path of [
      "AGENTS.md",
      "docs/ADMIN_DEPLOYMENT_POLICY.md",
      "docs/ADMIN_CHANGE_WORKFLOW.md",
      "docs/ADMIN_KNOWLEDGE_BASE.md",
      "docs/DEPLOYMENT.md",
    ]) {
      const text = source(path);
      expect(text, path).toContain("Cloudflare Workers Builds");
      expect(text, path).toContain("main");
      expect(text, path).toContain("migration");
      expect(text, path).not.toContain(
        "production Environment承認を受けるGitHub Actions deploy workflow",
      );
      expect(text, path).not.toContain(
        "Cloudflare Workers Buildsを接続・併用しない",
      );
    }
    expect(source("docs/ADMIN_DEPLOYMENT_POLICY.md")).toContain(
      "0127・0128・0129が未適用なら初回Buildを開始しない",
    );
  });
});
