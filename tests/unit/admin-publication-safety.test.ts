import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../../src/admin-worker.ts", import.meta.url),
  "utf8",
);

describe("editorial publication safety contracts", () => {
  it("uses compare-and-set writes after deployment verification", () => {
    const deployStart = source.indexOf('if (run.state === "deploy_pending")');
    const deployEnd = source.indexOf(
      'if (run.state === "queued" || run.state === "retry_wait")',
      deployStart,
    );
    expect(deployStart).toBeGreaterThanOrEqual(0);
    expect(deployEnd).toBeGreaterThan(deployStart);
    const deployBlock = source.slice(deployStart, deployEnd);

    // Proposal promotion, canonical publication, and unpublication must all
    // guard the write with the snapshot's updated_at value.
    expect(
      deployBlock.match(/WHERE id\s*=\s*\?\s+AND updated_at\s*=\s*\?/g) ?? [],
    ).toHaveLength(4);
    expect(deployBlock).toContain("batchChangeCount(batchResults, 0)");
    expect(deployBlock).toContain("batchChangeCount(batchResults, 1)");
    expect(deployBlock).toContain(
      'error_code: "publication_compare_and_set_failed"',
    );
  });

  it("keeps every admin API behind the shared scope gate", () => {
    const handlerStart = source.indexOf("async function handleAdminRequest(");
    expect(handlerStart).toBeGreaterThanOrEqual(0);
    const handler = source.slice(handlerStart);
    const gateOffset = handler.indexOf("// すべての管理APIは");
    expect(gateOffset).toBeGreaterThanOrEqual(0);
    const gateBlock = handler.slice(gateOffset, gateOffset + 1_000);
    expect(gateBlock).toContain("getAdminScope(request, env)");
    expect(gateBlock).toContain('url.pathname !== "/api/admin/profile"');
    expect(source).toContain("async function requireAdminScope(");
    expect(source).toContain("resolveCachedAdminScope(request, env)");
    expect(source).toContain("documentVisibilityFor(scope)");
  });
});
