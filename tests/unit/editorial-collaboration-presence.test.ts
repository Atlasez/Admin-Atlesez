import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import {
  encodeRelativeCursorPosition,
  resolveRelativeCursorPosition,
} from "../../src/lib/editorial-collaboration-presence";

describe("editorial collaboration relative cursors", () => {
  it("keeps the caret attached to the same Yjs position when text is inserted before it", () => {
    const doc = new Y.Doc();
    const body = doc.getText("body");
    body.insert(0, "alpha\nbeta");

    const encoded = encodeRelativeCursorPosition(body, 8);
    expect(resolveRelativeCursorPosition(encoded, doc, body)).toBe(8);

    body.insert(0, "prefix\n");
    expect(resolveRelativeCursorPosition(encoded, doc, body)).toBe(15);
  });

  it("returns null for a relative position belonging to another Y.Text", () => {
    const doc = new Y.Doc();
    const body = doc.getText("body");
    const title = doc.getText("title");
    body.insert(0, "body");
    title.insert(0, "title");

    const encoded = encodeRelativeCursorPosition(title, 2);
    expect(resolveRelativeCursorPosition(encoded, doc, body)).toBeNull();
  });
});
