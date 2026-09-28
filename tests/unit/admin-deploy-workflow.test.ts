import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

type VerificationWorkflow = {
  on?: Record<string, unknown>;
  jobs?: { verify?: { steps?: Array<{ run?: string }> } };
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

describe("ADMIN production verification workflow", () => {
  it("verifies every main merge and does not deploy from GitHub Actions", () => {
    expect(Object.keys(workflow.on ?? {})).toEqual([
      "push",
      "schedule",
      "workflow_dispatch",
    ]);
    expect(
      workflow.jobs?.verify?.steps?.some((step) =>
        step.run?.includes("scripts/verify-live-admin-production.mjs"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        new URL(
          "../../.github/workflows/deploy-admin-from-github.yml",
          import.meta.url,
        ),
      ),
    ).toBe(false);
  });
});
