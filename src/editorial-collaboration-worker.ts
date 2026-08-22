import * as Y from "yjs";

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}

interface DurableObjectState {
  storage: DurableObjectStorage;
  acceptWebSocket(socket: WebSocket): void;
  getWebSockets(): WebSocket[];
  waitUntil(promise: Promise<unknown>): void;
}

interface Env {
  REPORTS: D1Database;
}

type CollaborationAttachment = {
  sessionId: string;
  email: string;
  displayName: string;
  field: string;
};

const collaborationAttachment = (
  socket: WebSocket,
): CollaborationAttachment => {
  const value = (
    socket as WebSocket & { deserializeAttachment?: () => unknown }
  ).deserializeAttachment?.();
  if (!value || typeof value !== "object")
    return { sessionId: "", email: "", displayName: "メンバー", field: "" };
  const attachment = value as Partial<CollaborationAttachment>;
  return {
    sessionId: attachment.sessionId ?? "",
    email: attachment.email ?? "",
    displayName: attachment.displayName ?? attachment.email ?? "メンバー",
    field: attachment.field ?? "",
  };
};

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

export class EditorialCollaborationRoom {
  private readonly yDocument = new Y.Doc();
  private initializedDocumentId = "";

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {
    this.yDocument.on("update", (update: Uint8Array, origin: unknown) => {
      for (const socket of this.state.getWebSockets())
        if (socket !== origin && socket.readyState === WebSocket.OPEN)
          socket.send(update);
      this.state.waitUntil(
        this.state.storage.put(
          "yjs-state",
          Y.encodeStateAsUpdate(this.yDocument),
        ),
      );
    });
  }

  private async initialize(documentId: string) {
    if (this.initializedDocumentId === documentId) return;
    const saved = await this.state.storage.get<ArrayBuffer | Uint8Array>(
      "yjs-state",
    );
    if (saved) Y.applyUpdate(this.yDocument, new Uint8Array(saved));
    else {
      const document = await this.env.REPORTS.prepare(
        "SELECT title, summary, body FROM editorial_documents WHERE id = ?",
      )
        .bind(documentId)
        .first<{ title: string; summary: string; body: string }>();
      if (!document) throw new Error("原稿が見つかりません。");
      this.yDocument.transact(() => {
        this.yDocument.getText("title").insert(0, document.title);
        this.yDocument.getText("summary").insert(0, document.summary);
        this.yDocument.getText("body").insert(0, document.body);
      }, "initial");
    }
    this.initializedDocumentId = documentId;
  }

  private broadcastPresence() {
    const participants = this.state
      .getWebSockets()
      .filter((socket) => socket.readyState === WebSocket.OPEN)
      .map(collaborationAttachment)
      .filter((item) => item.sessionId);
    const message = JSON.stringify({ type: "presence", participants });
    for (const socket of this.state.getWebSockets())
      if (socket.readyState === WebSocket.OPEN) socket.send(message);
  }

  async fetch(request: Request): Promise<Response> {
    await this.initialize(request.headers.get("x-atlasez-document-id") ?? "");
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
      return json({ error: "WebSocket接続が必要です。" }, 426);
    const Pair = (
      globalThis as unknown as {
        WebSocketPair: new () => { 0: WebSocket; 1: WebSocket };
      }
    ).WebSocketPair;
    const pair = new Pair();
    const client = pair[0];
    const server = pair[1] as WebSocket & {
      serializeAttachment?: (value: unknown) => void;
    };
    const encodedDisplayName = request.headers.get("x-atlasez-user-name") ?? "";
    let displayName = "メンバー";
    try {
      displayName = decodeURIComponent(encodedDisplayName) || displayName;
    } catch {
      /* invalid encoded names fall back to the generic label */
    }
    server.serializeAttachment?.({
      sessionId: crypto.randomUUID(),
      email: request.headers.get("x-atlasez-user-email") ?? "",
      displayName,
      field: "",
    } satisfies CollaborationAttachment);
    this.state.acceptWebSocket(server);
    server.send(Y.encodeStateAsUpdate(this.yDocument));
    this.broadcastPresence();
    return new Response(null, {
      status: 101,
      webSocket: client,
    } as ResponseInit & { webSocket: WebSocket });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") {
      Y.applyUpdate(this.yDocument, new Uint8Array(message), socket);
      return;
    }
    try {
      const payload = JSON.parse(message) as { type?: string; field?: unknown };
      if (payload.type !== "presence") return;
      const attachment = collaborationAttachment(socket);
      attachment.field =
        typeof payload.field === "string" ? payload.field.slice(0, 80) : "";
      (
        socket as WebSocket & { serializeAttachment?: (value: unknown) => void }
      ).serializeAttachment?.(attachment);
      this.broadcastPresence();
    } catch {
      /* malformed presence messages are ignored */
    }
  }

  webSocketClose() {
    this.broadcastPresence();
  }

  webSocketError() {
    this.broadcastPresence();
  }
}

export default {
  fetch() {
    return new Response("Not Found", { status: 404 });
  },
};
