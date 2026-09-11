import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../../src/admin-worker.ts", import.meta.url),
  "utf8",
);

describe("admin API baseline scope gate", () => {
  it("runs before every admin API dispatch except the intentional auth-status endpoint", () => {
    const handlerStart = source.indexOf("async function handleAdminRequest(");
    expect(handlerStart).toBeGreaterThanOrEqual(0);
    const handler = source.slice(handlerStart);
    const gateMarker = "// すべての管理APIは";
    const gateOffset = handler.indexOf(gateMarker);
    expect(gateOffset).toBeGreaterThanOrEqual(0);

    const beforeGate = handler.slice(0, gateOffset);
    const preGateAdminPaths = [
      ...beforeGate.matchAll(
        /url\.pathname\s*(?:===|startsWith\()\s*["`]([^"`]*\/api\/admin\/[^"`]*)/g,
      ),
    ].map((match) => match[1]);
    expect(preGateAdminPaths).toEqual(["/api/admin/auth-status"]);

    const gateBlock = handler.slice(gateOffset, gateOffset + 900);
    expect(gateBlock).toContain('url.pathname.startsWith("/api/admin/")');
    expect(gateBlock).toContain('url.pathname !== "/api/admin/profile"');
    expect(gateBlock).toContain("getAdminScope(request, env)");
    expect(gateBlock).toContain(
      "if (isResponse(baselineScope)) return baselineScope",
    );

    const firstDispatch = handler.indexOf(
      'if (url.pathname === "/api/admin/',
      gateOffset,
    );
    expect(firstDispatch).toBeGreaterThan(gateOffset);
  });
});
