import { describe, expect, it } from "vitest";
import {
  assertSafeTikzSource,
  normalizeTikzLibraries,
  normalizeTikzPackages,
} from "../../src/lib/tikz-policy.mjs";
import { renderTikzSource } from "../../src/lib/tikz-renderer.mjs";

describe("TikZ server renderer policy", () => {
  it("accepts bundled packages and libraries only", () => {
    expect(normalizeTikzPackages(["pgfplots", "amsmath:intlimits"])).toEqual([
      { name: "pgfplots", options: "" },
      { name: "amsmath", options: "intlimits" },
    ]);
    expect(normalizeTikzLibraries(["arrows.meta", "calc"])).toEqual([
      "arrows.meta",
      "calc",
    ]);
    expect(() => normalizeTikzPackages(["minted"])).toThrow();
    expect(() => normalizeTikzLibraries(["external"])).toThrow();
  });

  it("rejects file and shell access", () => {
    expect(() => assertSafeTikzSource("\\input{secret}")).toThrow();
    expect(() => assertSafeTikzSource("\\write18{touch /tmp/x}")).toThrow();
  });

  it("renders a TikZ block to sanitized SVG", async () => {
    const result = await renderTikzSource(
      "\\begin{tikzpicture}\\draw[->] (0,0)--(2,0);\\end{tikzpicture}",
      { libraries: ["arrows.meta"] },
    );
    expect(result.svg).toMatch(/^<svg(?:\s|>)/);
    expect(result.svg).toMatch(
      /@import url\(https:\/\/cdn\.jsdelivr\.net\/npm\/node-tikzjax@1\.0\.5\/css\/fonts\.css\)/,
    );
    expect(result.svg).not.toMatch(/<script|foreignObject/i);
    expect(result.hash).toHaveLength(64);
  });
});
