import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

type VerificationWorkflow = {
  on?: Record<string, unknown>;
  jobs?: {
    verify?: {
      steps?: Array<{
        run?: string;
        with?: { "fetch-depth"?: number };
        env?: Record<string, string>;
      }>;
    };
  };
};

type DeploymentWorkflow = {
  on?: {
    workflow_run?: { workflows?: string[]; types?: string[] };
  };
  jobs?: {
    verify?: {
      outputs?: Record<string, string>;
      steps?: Array<{ run?: string; id?: string }>;
      if?: string;
    };
    deploy?: {
      environment?: string;
      env?: Record<string, string>;
      needs?: string | string[];
      steps?: Array<{
        env?: Record<string, string>;
        name?: string;
        run?: string;
      }>;
      if?: string;
    };
  };
};

const workflow = parse(
  readFileSync(
    new URL(
      "../../.github/workflows/verify-admin-production.yml",
      import.meta.url,
    ),
    "utf8",
  ),
) as VerificationWorkflow;

const deploymentWorkflow = parse(
  readFileSync(
    new URL(
      "../../.github/workflows/deploy-admin-from-github.yml",
      import.meta.url,
    ),
    "utf8",
  ),
) as DeploymentWorkflow;

describe("ADMIN production verification workflow", () => {
  it("verifies completed deployments and skips active deploys", () => {
    expect(Object.keys(workflow.on ?? {})).toEqual([
      "workflow_run",
      "schedule",
      "workflow_dispatch",
    ]);
    expect(workflow.on?.workflow_run).toEqual({
      workflows: ["Deploy ADMIN from GitHub"],
      types: ["completed"],
      branches: ["main"],
    });
    expect(workflow.jobs?.verify?.steps?.[0]?.run).toContain(
      'select(.status != "completed")',
    );
    expect(
      workflow.jobs?.verify?.steps?.some((step) =>
        step.run?.includes("scripts/verify-live-admin-production.mjs"),
      ),
    ).toBe(true);
    const liveVerification = workflow.jobs?.verify?.steps?.find((step) =>
      step.run?.includes("scripts/verify-live-admin-production.mjs"),
    );
    expect(liveVerification?.env?.ALLOW_AUDIT_ONLY_ADVANCE).toBe("true");
    expect(workflow.jobs?.verify?.steps?.[1]?.with?.["fetch-depth"]).toBe(0);
  });

  it("deploys only verified main builds behind the production environment gate", () => {
    expect(deploymentWorkflow.on?.workflow_run?.workflows).toEqual(["CI"]);
    expect(deploymentWorkflow.on?.workflow_run?.types).toEqual(["completed"]);
    expect(deploymentWorkflow.on).not.toHaveProperty("workflow_dispatch");

    for (const jobCondition of [
      deploymentWorkflow.jobs?.verify?.if ?? "",
      deploymentWorkflow.jobs?.deploy?.if ?? "",
    ]) {
      expect(jobCondition).toContain(
        "github.event.workflow_run.event == 'push'",
      );
      expect(jobCondition).toContain(
        "github.event.workflow_run.head_branch == 'main'",
      );
      expect(jobCondition).toContain(
        "github.event.workflow_run.head_repository.full_name == github.repository",
      );
      expect(jobCondition).toContain(
        "github.event.workflow_run.conclusion == 'success'",
      );
    }

    expect(deploymentWorkflow.jobs?.deploy?.needs).toBe("verify");
    expect(deploymentWorkflow.jobs?.verify?.outputs?.deploy_required).toBe(
      "${{ steps.classify.outputs.deploy_required }}",
    );
    expect(deploymentWorkflow.jobs?.deploy?.if).toContain(
      "needs.verify.outputs.deploy_required == 'true'",
    );
    expect(
      deploymentWorkflow.jobs?.verify?.steps?.some(
        (step) =>
          step.id === "classify" &&
          step.run === "node scripts/classify-admin-deployment.mjs",
      ),
    ).toBe(true);
    expect(deploymentWorkflow.jobs?.deploy?.environment).toBe("production");
    expect(deploymentWorkflow.jobs?.deploy?.env).not.toHaveProperty(
      "CLOUDFLARE_API_TOKEN",
    );

    const verifyCommands = (deploymentWorkflow.jobs?.verify?.steps ?? [])
      .map((step) => step.run ?? "")
      .join("\n");
    const deployCommands = (deploymentWorkflow.jobs?.deploy?.steps ?? [])
      .map((step) => step.run ?? "")
      .join("\n");

    expect(verifyCommands).toContain("npm run verify:deploy-config");
    expect(verifyCommands).toContain("npm run check");
    expect(verifyCommands).toContain("npm run lint");
    expect(verifyCommands).toContain("npm test");
    expect(verifyCommands).toContain("npm run format:check");
    expect(verifyCommands).toContain("npm run verify:build-info");
    expect(verifyCommands).toContain("wrangler deploy --dry-run");
    expect(deployCommands).toContain(
      "wrangler deploy --config wrangler.admin.jsonc --keep-vars",
    );
    expect(deployCommands).toContain("wrangler deployments status");
    expect(deployCommands).toContain("npm run verify:live-admin-production");
    const deploySteps = deploymentWorkflow.jobs?.deploy?.steps ?? [];
    const deployStepIndex = deploySteps.findIndex(
      (step) => step.name === "Deploy ADMIN Worker",
    );
    const mainGuardIndex = deploySteps.findIndex(
      (step) => step.name === "Confirm main has not advanced before deployment",
    );
    expect(mainGuardIndex).toBeGreaterThanOrEqual(0);
    expect(mainGuardIndex).toBeLessThan(deployStepIndex);
    expect(deploySteps[deployStepIndex]?.env?.CLOUDFLARE_API_TOKEN).toBe(
      "${{ secrets.CLOUDFLARE_DEPLOY_API_TOKEN }}",
    );
    expect(
      deploySteps.find(
        (step) => step.name === "Verify 100 percent production traffic",
      )?.env?.CLOUDFLARE_API_TOKEN,
    ).toBe("${{ secrets.CLOUDFLARE_DEPLOY_API_TOKEN }}");
    expect(`${verifyCommands}\n${deployCommands}`).not.toContain(
      "d1 migrations apply",
    );
    expect(
      existsSync(
        new URL(
          "../../.github/workflows/deploy-admin-from-github.yml",
          import.meta.url,
        ),
      ),
    ).toBe(true);
  });
});
