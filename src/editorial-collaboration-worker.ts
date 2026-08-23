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
  cursorStart: number | null;
  cursorEnd: number | null;
  cursorAnchor: string | null;
  cursorHead: string | null;
};

const emptyAttachment = (): CollaborationAttachment => ({
  sessionId: "",
  email: "",
  displayName: "メンバー",
  field: "",
  cursorStart: null,
  cursorEnd: null,
  cursorAnchor: null,
  cursorHead: null,
});

const normalizeRelativeCursor = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 4096 || !/^[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return null;
  }
  return trimmed;
};

const collaborationAttachment = (
  socket: WebSocket,
): CollaborationAttachment => {
  const value = (
    socket as WebSocket & { deserializeAttachment?: () => unknown }
  ).deserializeAttachment?.();
  if (!value || typeof value !== "object") return emptyAttachment();
  const attachment = value as Partial<CollaborationAttachment>;
  return {
    sessionId: attachment.sessionId ?? "",
    email: attachment.email ?? "",
    displayName: attachment.displayName ?? attachment.email ?? "メンバー",
    field: attachment.field ?? "",
    cursorStart:
      typeof attachment.cursorStart === "number" ? attachment.cursorStart : null,
    cursorEnd:
      typeof attachment.cursorEnd === "number" ? attachment.cursorEnd : null,
    cursorAnchor: normalizeRelativeCursor(attachment.cursorAnchor),
    cursorHead: normalizeRelativeCursor(attachment.cursorHead),
  };
};

const normalizeCursor = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(240_000, Math.trunc(value)));
};

const mergeParticipants = (items: CollaborationAttachment[]) => {
  const merged = new Map<string, CollaborationAttachment>();
  for (const item of items) {
    const normalizedEmail = item.email.trim().toLowerCase();
    const normalizedName = item.displayName.trim().toLowerCase();
    const key = normalizedEmail || normalizedName || item.sessionId;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...item });
      continue;
    }

    if (item.email && !current.email) current.email = item.email;
    if (item.displayName && item.displayName !== "メンバー") {
      current.displayName = item.displayName;
    }
    if (item.field) current.field = item.field;

    const hasCursor =
      item.cursorStart !== null ||
      item.cursorEnd !== null ||
      item.cursorAnchor !== null ||
      item.cursorHead !== null;
    if (hasCursor) {
      current.sessionId = item.sessionId;
      current.cursorStart = item.cursorStart;
      current.cursorEnd = item.cursorEnd;
      current.cursorAnchor = item.cursorAnchor;
      current.cursorHead = item.cursorHead;
      if (item.field) current.field = item.field;
    }
  }
  return [...merged.values()];
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
      for (const socket of this.state.getWebSockets()) {
        if (socket !== origin && socket.readyState === WebSocket.OPEN) {
          socket.send(update);
        }
      }
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
    if (saved) {
      Y.applyUpdate(this.yDocument, new Uint8Array(saved));
    } else {
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
    const participants = mergeParticipants(
      this.state
        .getWebSockets()
        .filter((socket) => socket.readyState === WebSocket.OPEN)
        .map(collaborationAttachment)
        .filter((item) => item.sessionId),
    );
    const message = JSON.stringify({ type: "presence", participants });
    for (const socket of this.state.getWebSockets()) {
      if (socket.readyState === WebSocket.OPEN) socket.send(message);
    }
  }

  async fetch(request: Request): Promise<Response> {
    await this.initialize(request.headers.get("x-atlasez-document-id") ?? "");
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "WebSocket接続が必要です。" }, 426);
    }
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
    const attachment: CollaborationAttachment = {
      sessionId: crypto.randomUUID(),
      email: request.headers.get("x-atlasez-user-email") ?? "",
      displayName,
      field: "",
      cursorStart: null,
      cursorEnd: null,
      cursorAnchor: null,
      cursorHead: null,
    };
    server.serializeAttachment?.(attachment);
    this.state.acceptWebSocket(server);
    server.send(Y.encodeStateAsUpdate(this.yDocument));
    server.send(
      JSON.stringify({
        type: "session",
        sessionId: attachment.sessionId,
        email: attachment.email,
      }),
    );
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
      const payload = JSON.parse(message) as {
        type?: string;
        field?: unknown;
        cursorStart?: unknown;
        cursorEnd?: unknown;
        cursorAnchor?: unknown;
        cursorHead?: unknown;
      };
      if (payload.type !== "presence") return;
      const attachment = collaborationAttachment(socket);
      attachment.field =
        typeof payload.field === "string" ? payload.field.slice(0, 80) : "";
      attachment.cursorStart = normalizeCursor(payload.cursorStart);
      attachment.cursorEnd = normalizeCursor(payload.cursorEnd);
      attachment.cursorAnchor = normalizeRelativeCursor(payload.cursorAnchor);
      attachment.cursorHead = normalizeRelativeCursor(payload.cursorHead);
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
