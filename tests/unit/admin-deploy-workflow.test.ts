import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

type DeploymentWorkflow = {
  on?: Record<
    string,
    {
      inputs?: Record<
        string,
        { default?: unknown; required?: boolean; type?: string }
      >;
    }
  >;
  jobs?: { deploy?: { if?: string } };
};

const workflow = parse(
  readFileSync(
    new URL(
      "../../.github/workflows/deploy-admin-from-github.yml",
      import.meta.url,
    ),
    "utf8",
  ),
) as DeploymentWorkflow;

describe("ADMIN production deploy workflow", () => {
  it("runs only when manually dispatched with explicit confirmation on main", () => {
    expect(Object.keys(workflow.on ?? {})).toEqual(["workflow_dispatch"]);
    expect(workflow.on?.workflow_dispatch?.inputs?.confirm_main).toEqual({
      description: "mainの内容を本番へ反映することを確認しました",
      required: true,
      type: "boolean",
      default: false,
    });
    expect(workflow.jobs?.deploy?.if).toBe(
      "github.ref == 'refs/heads/main' && inputs.confirm_main == true",
    );
  });
});
