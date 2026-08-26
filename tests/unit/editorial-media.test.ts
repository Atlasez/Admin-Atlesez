import { describe, expect, it } from "vitest";
import {
  editorialAssetIsReferenced,
  editorialAssetIdsIn,
  editorialLatexNamesIn,
  replaceEditorialLatexReferences,
  publicEditorialAssetPath,
  replaceEditorialAssetMarkers,
  sanitizeEditorialFilename,
  sanitizeEditorialLatexName,
  uniqueEditorialFilename,
} from "../../src/lib/editorial-media";
import {
  editorialImageStyle,
  editorialImageUrlWithWidth,
  normalizeEditorialImageWidth,
} from "../../src/lib/editorial-image.mjs";

const firstId = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";
const documentId = "00000000-0000-4000-8000-000000000010";

describe("editorial media markers", () => {
  it("extracts valid asset ids once and ignores malformed markers", () => {
    expect(
      editorialAssetIdsIn(
        `asset://${firstId} asset://${firstId} asset://not-an-id asset://${secondId}`,
      ),
    ).toEqual([firstId, secondId]);
  });

  it("turns markers into public image links under the document directory", () => {
    const asset = { id: firstId, documentId, filename: "diagram.png" };
    const publicPath = publicEditorialAssetPath(asset);
    expect(
      replaceEditorialAssetMarkers(
        `![図](asset://${firstId})\n![ ](asset://${firstId})`,
        new Map([[firstId, asset]]),
      ),
    ).toBe(`![図](${publicPath})\n![diagram.png](${publicPath})`);
  });

  it("keeps a selected image width while replacing an editorial marker", () => {
    const asset = { id: firstId, documentId, filename: "diagram.png" };
    expect(
      replaceEditorialAssetMarkers(
        `![図](asset://${firstId}?width=60%)`,
        new Map([[firstId, asset]]),
      ),
    ).toBe(`![図](/images/editorial/${documentId}/diagram.png?width=60%)`);
    expect(
      replaceEditorialAssetMarkers(
        `![図](asset://${firstId}?width=73%)`,
        new Map([[firstId, asset]]),
      ),
    ).toBe(`![図](/images/editorial/${documentId}/diagram.png?width=73%)`);
  });

  it("accepts arbitrary safe percentage widths for Markdown and SVG assets", () => {
    expect(normalizeEditorialImageWidth("73%")).toBe("73%");
    expect(normalizeEditorialImageWidth("0%")).toBe("");
    expect(normalizeEditorialImageWidth("101%")).toBe("");
    expect(
      editorialImageUrlWithWidth("/images/editorial/doc/diagram.svg", "73%"),
    ).toBe("/images/editorial/doc/diagram.svg?width=73%");
    expect(editorialImageStyle("73%")).toBe("width:73%;max-width:100%;");
  });

  it("keeps unresolved markers so publishing can reject them", () => {
    const source = `![図](asset://${secondId})`;
    expect(
      replaceEditorialAssetMarkers(
        source,
        new Map([
          [
            firstId,
            {
              id: firstId,
              documentId,
              filename: "diagram.png",
            },
          ],
        ]),
      ),
    ).toBe(source);
  });

  it("sanitizes uploaded names and preserves a safe extension", () => {
    expect(sanitizeEditorialFilename("../diagram final.png", "image/png")).toBe(
      "diagram-final.png",
    );
    expect(sanitizeEditorialFilename("", "image/jpeg")).toBe("image.jpg");
    expect(sanitizeEditorialFilename("diagram.svg", "image/svg+xml")).toBe(
      "diagram.svg",
    );
    expect(
      uniqueEditorialFilename("diagram.png", ["Diagram.PNG", "diagram-2.png"]),
    ).toBe("diagram-3.png");
  });

  it("creates a safe reusable LaTeX name", () => {
    expect(sanitizeEditorialLatexName("group diagram", "diagram.png")).toBe(
      "group-diagram",
    );
    expect(sanitizeEditorialLatexName("", "123 diagram.png")).toBe(
      "asset-123-diagram",
    );
    expect(sanitizeEditorialLatexName("_diagram", "diagram.png")).toBe(
      "asset-_diagram",
    );
    expect(editorialLatexNamesIn("\\includegraphics{group-diagram}\n")).toEqual(
      ["group-diagram"],
    );
    expect(
      replaceEditorialLatexReferences(
        "\\includegraphics[width=0.8\\linewidth]{group-diagram}",
        new Map([
          [
            "group-diagram",
            {
              id: firstId,
              documentId,
              filename: "diagram.png",
              latexName: "group-diagram",
              alt: "群の図",
            },
          ],
        ]),
      ),
    ).toContain(
      `![群の図](/images/editorial/${documentId}/diagram.png?width=80%)`,
    );
  });

  it("checks only current body references across internal and published URLs", () => {
    const asset = {
      id: firstId,
      documentId,
      filename: "diagram final.png",
      latexName: "diagram-final",
    };
    expect(editorialAssetIsReferenced(`![図](asset://${firstId})`, asset)).toBe(
      true,
    );
    expect(
      editorialAssetIsReferenced(
        `![図](/images/editorial/${documentId}/diagram%20final.png)`,
        asset,
      ),
    ).toBe(true);
    expect(
      editorialAssetIsReferenced(
        `![旧版](/images/editorial/${secondId}/diagram%20final.png)`,
        asset,
      ),
    ).toBe(false);
    expect(
      editorialAssetIsReferenced("本文から画像を削除しました。", asset),
    ).toBe(false);
  });
});
