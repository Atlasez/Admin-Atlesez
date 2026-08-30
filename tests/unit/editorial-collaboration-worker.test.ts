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

  it("broadcasts workflow changes to connected editor tabs", () => {
    const socket = { readyState: 1, send: vi.fn() } as unknown as WebSocket;
    const state = {
      storage: {
        get: vi.fn(async () => undefined),
        put: vi.fn(async () => undefined),
      },
      acceptWebSocket: vi.fn(),
      getWebSockets: vi.fn(() => [socket]),
      waitUntil: vi.fn(),
    };
    const room = new EditorialCollaborationRoom(state, {
      REPORTS: {} as never,
    } as never);

    vi.stubGlobal("WebSocket", { OPEN: 1 });
    (
      room as unknown as {
        broadcastDocumentChange: (payload: Record<string, unknown>) => void;
      }
    ).broadcastDocumentChange({
      status: "in-review",
      publicationStage: "project-leader",
      publishedAt: false,
      updatedAt: "2026-08-31T00:00:00.000Z",
      publicationRunState: null,
    });

    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "document-changed",
        status: "in-review",
        publicationStage: "project-leader",
        publishedAt: false,
        updatedAt: "2026-08-31T00:00:00.000Z",
        publicationRunState: null,
      }),
    );
    vi.unstubAllGlobals();
  });

  it("sends the current publication state immediately when a tab reconnects", async () => {
    const send = vi.fn();
    const socket = {
      readyState: 1,
      send,
      serializeAttachment: vi.fn(),
    } as unknown as WebSocket;
    const state = {
      storage: {
        get: vi.fn(async () => undefined),
        put: vi.fn(async () => undefined),
      },
      acceptWebSocket: vi.fn(),
      getWebSockets: vi.fn(() => [socket]),
      waitUntil: vi.fn(),
    };
    const database = {
      prepare: vi.fn((query: string) => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => {
            if (query.includes("SELECT title, summary, body")) {
              return { title: "タイトル", summary: "要約", body: "本文" };
            }
            if (query.includes("FROM editorial_documents")) {
              return {
                status: "approved",
                publication_review_stage: null,
                published_at: null,
                updated_at: "2026-08-31T02:00:00.000Z",
                publication_pr_number: 321,
                publication_pr_url:
                  "https://github.com/Atlasez/Atlasez01/pull/321",
                publication_branch: "editorial/test-run",
                publication_action: "publish",
                publication_requested_at: "2026-08-31T02:00:00.000Z",
              };
            }
            return {
              id: "run-1",
              action: "publish",
              state: "failed",
              attempt: 2,
              pull_request_number: 321,
              pull_request_url: "https://github.com/Atlasez/Atlasez01/pull/321",
              branch: "editorial/test-run",
              head_sha: "abc123",
              merge_sha: null,
              last_check_at: "2026-08-31T02:00:00.000Z",
              next_attempt_at: null,
              error_code: "ci_failed",
              error_message: "CIが失敗しました。",
              failure_kind: "ci",
              check_name: "verify",
              check_url:
                "https://github.com/Atlasez/Atlasez01/actions/runs/999",
              diagnostic_url: null,
              failure_detail: "検証に失敗しました。",
              failure_step: "npm run check",
              failure_file: "src/content/articles/test.md",
              failure_line: 12,
              failure_column: null,
              failure_suggestion: "記事を修正してください。",
              updated_at: "2026-08-31T02:00:01.000Z",
            };
          }),
        })),
      })),
    };
    class Pair {
      0 = {} as WebSocket;
      1 = socket;
    }
    class UpgradeResponse {
      readonly status: number;

      constructor(_body: unknown, init?: ResponseInit) {
        this.status = init?.status ?? 200;
      }
    }
    vi.stubGlobal("WebSocket", { OPEN: 1 });
    vi.stubGlobal("WebSocketPair", Pair);
    vi.stubGlobal("Response", UpgradeResponse);
    const room = new EditorialCollaborationRoom(state, {
      REPORTS: database,
    } as never);

    const response = await room.fetch(
      new Request("https://example.com/collaboration", {
        headers: {
          upgrade: "websocket",
          "x-atlasez-document-id": "document-1",
          "x-atlasez-user-email": "alice@example.com",
        },
      }),
    );

    expect(response.status).toBe(101);
    const messages = send.mock.calls
      .map(([message]) => (typeof message === "string" ? message : null))
      .filter((message): message is string => Boolean(message))
      .map(
        (message) =>
          JSON.parse(message) as {
            type?: string;
            publicationRun?: { state?: string };
          },
      );
    expect(messages).toContainEqual(
      expect.objectContaining({
        type: "document-changed",
        publicationRun: expect.objectContaining({ state: "failed" }),
      }),
    );
    vi.unstubAllGlobals();
  });
});
