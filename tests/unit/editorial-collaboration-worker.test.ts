import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { EditorialCollaborationRoom } from "../../src/editorial-collaboration-worker";

describe("editorial collaboration initialization", () => {
  it("does not insert the same D1 document twice when connections race", async () => {
    let storageReads = 0;
    const storage = {
      get: vi.fn(async () => {
        storageReads += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return undefined;
      }),
      put: vi.fn(async () => undefined),
    };
    const state = {
      storage,
      acceptWebSocket: vi.fn(),
      getWebSockets: vi.fn(() => []),
      waitUntil: vi.fn(),
    };
    const database = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => ({
            title: "タイトル",
            summary: "要約",
            body: "本文",
          })),
        })),
      })),
    };
    const room = new EditorialCollaborationRoom(state, {
      REPORTS: database,
    } as never);

    await Promise.all([
      (
        room as unknown as { initialize: (id: string) => Promise<void> }
      ).initialize("document-1"),
      (
        room as unknown as { initialize: (id: string) => Promise<void> }
      ).initialize("document-1"),
    ]);

    const yDocument = (
      room as unknown as {
        yDocument: { getText: (name: string) => { toString: () => string } };
      }
    ).yDocument;
    expect(storageReads).toBe(1);
    expect(database.prepare).toHaveBeenCalledTimes(1);
    expect(yDocument.getText("body").toString()).toBe("本文");
  });

  it("coalesces rapid document updates into one snapshot write", async () => {
    const storage = {
      get: vi.fn(async () => undefined),
      put: vi.fn(async () => undefined),
    };
    const state = {
      storage,
      acceptWebSocket: vi.fn(),
      getWebSockets: vi.fn(() => []),
      waitUntil: vi.fn(),
    };
    const room = new EditorialCollaborationRoom(state, {
      REPORTS: {} as never,
    } as never);
    const yDocument = (
      room as unknown as { yDocument: { getText: (name: string) => Y.Text } }
    ).yDocument;

    yDocument.getText("body").insert(0, "a");
    yDocument.getText("body").insert(1, "b");
    yDocument.getText("body").insert(2, "c");
    await new Promise((resolve) => setTimeout(resolve, 140));

    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(yDocument.getText("body").toString()).toBe("abc");
  });

  it("does not treat the presence-only connection as a document writer", () => {
    const storage = {
      get: vi.fn(async () => undefined),
      put: vi.fn(async () => undefined),
    };
    const state = {
      storage,
      acceptWebSocket: vi.fn(),
      getWebSockets: vi.fn(() => []),
      waitUntil: vi.fn(),
    };
    const room = new EditorialCollaborationRoom(state, {
      REPORTS: {} as never,
    } as never);
    const source = new Y.Doc();
    source.getText("body").insert(0, "presence must not write");
    const presenceSocket = {
      deserializeAttachment: () => ({ mode: "presence" }),
    } as unknown as WebSocket;

    room.webSocketMessage(
      presenceSocket,
      Y.encodeStateAsUpdate(source).buffer as ArrayBuffer,
    );

    const yDocument = (
      room as unknown as { yDocument: { getText: (name: string) => Y.Text } }
    ).yDocument;
    expect(yDocument.getText("body").toString()).toBe("");
    source.destroy();
  });
});
