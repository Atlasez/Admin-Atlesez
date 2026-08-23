import * as Y from "yjs";

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
};

const base64ToBytes = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

export function encodeRelativeCursorPosition(
  text: Y.Text,
  index: number,
  assoc = 0,
): string {
  const safe = Math.max(0, Math.min(Math.trunc(index), text.length));
  const relative = Y.createRelativePositionFromTypeIndex(text, safe, assoc);
  return bytesToBase64(Y.encodeRelativePosition(relative));
}

export function resolveRelativeCursorPosition(
  encoded: string | null | undefined,
  doc: Y.Doc,
  expectedText: Y.Text,
): number | null {
  if (!encoded) return null;
  try {
    const relative = Y.decodeRelativePosition(base64ToBytes(encoded));
    const absolute = Y.createAbsolutePositionFromRelativePosition(relative, doc);
    if (!absolute || absolute.type !== expectedText) return null;
    return Math.max(0, Math.min(absolute.index, expectedText.length));
  } catch {
    return null;
  }
}
