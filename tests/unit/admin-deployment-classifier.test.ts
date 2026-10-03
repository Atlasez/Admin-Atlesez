import { describe, expect, it } from "vitest";
import { classifyAdminDeployment } from "../../scripts/lib/admin-deployment-classifier.mjs";

const previous = "a".repeat(40);
const target = "b".repeat(40);

describe("classifyAdminDeployment", () => {
  it("skips deployment when the live build already matches the target", () => {
    expect(
      classifyAdminDeployment({
        liveCommit: target,
        liveRef: "main",
        targetCommit: target,
        changedFiles: [],
        liveIsAncestor: true,
      }),
    ).toEqual({ deployRequired: false, reason: "already-deployed" });
  });

  it("skips deployment for a change limited to the generated audit record", () => {
    expect(
      classifyAdminDeployment({
        liveCommit: previous,
        liveRef: "main",
        targetCommit: target,
        changedFiles: ["docs/deployments/cloudflare-latest.json"],
        liveIsAncestor: true,
      }),
    ).toEqual({ deployRequired: false, reason: "audit-record-only" });
  });

  it("deploys when any file besides the audit record changed", () => {
    expect(
      classifyAdminDeployment({
        liveCommit: previous,
        liveRef: "main",
        targetCommit: target,
        changedFiles: [
          "docs/deployments/cloudflare-latest.json",
          "src/pages/admin/portal.astro",
        ],
        liveIsAncestor: true,
      }),
    ).toEqual({ deployRequired: true, reason: "site-change" });
  });

  it("deploys when a rename includes a path besides the audit record", () => {
    expect(
      classifyAdminDeployment({
        liveCommit: previous,
        liveRef: "main",
        targetCommit: target,
        changedFiles: [
          "docs/deployments/cloudflare-latest.json",
          "src/pages/admin/portal.astro",
        ],
        liveIsAncestor: true,
      }),
    ).toEqual({ deployRequired: true, reason: "site-change" });
  });

  it("deploys when the prior build is not an ancestor or history is unknown", () => {
    expect(
      classifyAdminDeployment({
        liveCommit: previous,
        liveRef: "main",
        targetCommit: target,
        changedFiles: ["docs/deployments/cloudflare-latest.json"],
        liveIsAncestor: false,
      }),
    ).toEqual({ deployRequired: true, reason: "unrelated-or-unknown-history" });
  });

  it("deploys when the live build is not from main", () => {
    expect(
      classifyAdminDeployment({
        liveCommit: target,
        liveRef: "codex/preview",
        targetCommit: target,
        changedFiles: [],
        liveIsAncestor: true,
      }),
    ).toEqual({ deployRequired: true, reason: "invalid-live-build-ref" });
  });

  it("deploys when either commit identity is malformed", () => {
    expect(
      classifyAdminDeployment({
        liveCommit: "unknown",
        liveRef: "main",
        targetCommit: target,
        changedFiles: [],
        liveIsAncestor: false,
      }),
    ).toEqual({ deployRequired: true, reason: "missing-or-invalid-sha" });
  });
});
