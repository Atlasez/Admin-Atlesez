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
  mode: "document" | "presence";
  cursorStart: number | null;
  cursorEnd: number | null;
  cursorAnchor: string | null;
  cursorHead: string | null;
};

type RealtimePublicationRun = {
  id: string;
  action: "publish" | "unpublish";
  state: string;
  attempt: number;
  pull_request_number: number | null;
  pull_request_url: string | null;
  branch: string | null;
  head_sha: string | null;
  merge_sha: string | null;
  last_check_at: string | null;
  next_attempt_at: string | null;
  error_code: string | null;
  error_message: string | null;
  failure_kind: string | null;
  check_name: string | null;
  check_url: string | null;
  diagnostic_url: string | null;
  failure_detail: string | null;
  failure_step: string | null;
  failure_file: string | null;
  failure_line: number | null;
  failure_column: number | null;
  failure_suggestion: string | null;
  updated_at: string;
};

type RealtimeDocumentChange = {
  changeVersion: number;
  status: string;
  publicationStage: string | null;
  publishedAt: boolean;
  publishedAtValue: string | null;
  updatedAt: string;
  publicationPrNumber: number | null;
  publicationPrUrl: string | null;
  publicationBranch: string | null;
  publicationAction: "publish" | "unpublish" | null;
  publicationRequestedAt: string | null;
  publicationRunState: string | null;
  publicationRun: RealtimePublicationRun | null;
};

const emptyAttachment = (): CollaborationAttachment => ({
  sessionId: "",
  email: "",
  displayName: "メンバー",
  field: "",
  mode: "document",
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
    mode: attachment.mode === "presence" ? "presence" : "document",
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
    if (item.mode === "presence") current.mode = item.mode;

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

const activeParticipants = (state: DurableObjectState) =>
  mergeParticipants(
    state
      .getWebSockets()
      .filter((socket) => socket.readyState === WebSocket.OPEN)
      .map(collaborationAttachment)
      .filter((item) => item.sessionId),
  );

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const readDocumentChange = async (
  database: D1Database,
  documentId: string,
): Promise<RealtimeDocumentChange | null> => {
  const document = await database
    .prepare(
      `SELECT status, publication_review_stage, published_at, updated_at,
              publication_pr_number, publication_pr_url, publication_branch,
              publication_action, publication_requested_at
       FROM editorial_documents WHERE id = ?`,
    )
    .bind(documentId)
    .first<{
      status: string;
      publication_review_stage: string | null;
      published_at: string | null;
      updated_at: string;
      publication_pr_number: number | null;
      publication_pr_url: string | null;
      publication_branch: string | null;
      publication_action: "publish" | "unpublish" | null;
      publication_requested_at: string | null;
    }>();
  if (!document) return null;
  const publicationRun = await database
    .prepare(
      `SELECT id, action, state, attempt, pull_request_number,
              pull_request_url, branch, head_sha, merge_sha, last_check_at,
              next_attempt_at, error_code, error_message, failure_kind,
              check_name, check_url, diagnostic_url, failure_detail,
              failure_step, failure_file, failure_line, failure_column,
              failure_suggestion, updated_at
       FROM editorial_publication_runs
       WHERE document_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(documentId)
    .first<RealtimePublicationRun>();
  return {
    changeVersion: Math.max(
      Date.parse(document.updated_at),
      publicationRun?.updated_at ? Date.parse(publicationRun.updated_at) : 0,
    ),
    status: document.status,
    publicationStage: document.publication_review_stage,
    publishedAt: Boolean(document.published_at),
    publishedAtValue: document.published_at,
    updatedAt: document.updated_at,
    publicationPrNumber: document.publication_pr_number,
    publicationPrUrl: document.publication_pr_url,
    publicationBranch: document.publication_branch,
    publicationAction: document.publication_action,
    publicationRequestedAt: document.publication_requested_at,
    publicationRunState: publicationRun?.state ?? null,
    publicationRun: publicationRun ?? null,
  };
};

export class EditorialCollaborationRoom {
  private readonly yDocument = new Y.Doc();
  private initializedDocumentId = "";
  private initializationPromise: Promise<void> | null = null;
  private persistencePromise: Promise<void> | null = null;
  private persistenceVersion = 0;
  private persistedVersion = 0;

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
      this.schedulePersistence();
    });
  }

  private schedulePersistence() {
    this.persistenceVersion += 1;
    if (this.persistencePromise) return;

    const persistence = new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    })
      .then(async () => {
        const versionAtEncode = this.persistenceVersion;
        await this.state.storage.put(
          "yjs-state",
          Y.encodeStateAsUpdate(this.yDocument),
        );
        this.persistedVersion = Math.max(
          this.persistedVersion,
          versionAtEncode,
        );
      })
      .catch(() => {
        // A later update will retry persistence. Live WebSocket delivery is
        // independent from the write-behind snapshot.
      })
      .finally(() => {
        if (this.persistencePromise === persistence) {
          this.persistencePromise = null;
          if (this.persistenceVersion > this.persistedVersion) {
            this.schedulePersistence();
          }
        }
      });
    this.persistencePromise = persistence;
    this.state.waitUntil(persistence);
  }

  private async initialize(documentId: string) {
    if (this.initializedDocumentId === documentId) return;
    if (this.initializationPromise) {
      await this.initializationPromise;
      if (this.initializedDocumentId !== documentId)
        throw new Error("別の原稿が同じ共同編集室を使用しています。");
      return;
    }

    const initialization = (async () => {
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
    })();
    this.initializationPromise = initialization;
    try {
      await initialization;
    } finally {
      if (this.initializationPromise === initialization)
        this.initializationPromise = null;
    }
  }

  private broadcastPresence() {
    const participants = activeParticipants(this.state);
    const message = JSON.stringify({ type: "presence", participants });
    for (const socket of this.state.getWebSockets()) {
      if (socket.readyState === WebSocket.OPEN) socket.send(message);
    }
  }

  private broadcastCommentChange() {
    const message = JSON.stringify({ type: "comments-changed" });
    for (const socket of this.state.getWebSockets()) {
      if (socket.readyState === WebSocket.OPEN) socket.send(message);
    }
  }

  private broadcastDocumentChange(payload: Record<string, unknown>) {
    const message = JSON.stringify({ type: "document-changed", ...payload });
    for (const socket of this.state.getWebSockets()) {
      if (socket.readyState === WebSocket.OPEN) socket.send(message);
    }
  }

  async fetch(request: Request): Promise<Response> {
    // 一覧画面から現在接続中のメンバーだけを取得する。GETでは原稿本文を
    // 初期化せず、接続中のWebSocketがない原稿のDOを不必要に読み込まない。
    if (
      request.method === "GET" &&
      request.headers.get("upgrade")?.toLowerCase() !== "websocket"
    )
      return json({ participants: activeParticipants(this.state) });
    await this.initialize(request.headers.get("x-atlasez-document-id") ?? "");
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      if (request.method !== "POST")
        return json({ error: "WebSocket接続または通知POSTが必要です。" }, 426);
      const payload = (await request.json().catch(() => null)) as {
        type?: unknown;
        status?: unknown;
        publicationStage?: unknown;
        changeVersion?: unknown;
        publishedAt?: unknown;
        publishedAtValue?: unknown;
        updatedAt?: unknown;
        publicationPrNumber?: unknown;
        publicationPrUrl?: unknown;
        publicationBranch?: unknown;
        publicationAction?: unknown;
        publicationRequestedAt?: unknown;
        publicationRunState?: unknown;
        publicationRun?: unknown;
      } | null;
      if (payload?.type === "comments-changed") {
        this.broadcastCommentChange();
        return json({ ok: true });
      }
      if (payload?.type !== "document-changed" || typeof payload.status !== "string")
        return json({ error: "未知の通知です。" }, 400);
      this.broadcastDocumentChange({
        ...(typeof payload.changeVersion === "number"
          ? { changeVersion: payload.changeVersion }
          : {}),
        status: payload.status,
        publicationStage:
          typeof payload.publicationStage === "string"
            ? payload.publicationStage
            : null,
        publishedAt: payload.publishedAt === true,
        publishedAtValue:
          typeof payload.publishedAtValue === "string"
            ? payload.publishedAtValue
            : null,
        updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : "",
        publicationPrNumber:
          typeof payload.publicationPrNumber === "number"
            ? payload.publicationPrNumber
            : null,
        publicationPrUrl:
          typeof payload.publicationPrUrl === "string"
            ? payload.publicationPrUrl
            : null,
        publicationBranch:
          typeof payload.publicationBranch === "string"
            ? payload.publicationBranch
            : null,
        publicationAction:
          payload.publicationAction === "publish" ||
          payload.publicationAction === "unpublish"
            ? payload.publicationAction
            : null,
        publicationRequestedAt:
          typeof payload.publicationRequestedAt === "string"
            ? payload.publicationRequestedAt
            : null,
        publicationRunState:
          typeof payload.publicationRunState === "string"
            ? payload.publicationRunState
            : null,
        publicationRun:
          payload.publicationRun && typeof payload.publicationRun === "object"
            ? payload.publicationRun
            : null,
      });
      return json({ ok: true });
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
      mode:
        new URL(request.url).searchParams.get("mode") === "presence"
          ? "presence"
          : "document",
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
    const currentDocumentChange = await readDocumentChange(
      this.env.REPORTS,
      request.headers.get("x-atlasez-document-id") ?? "",
    );
    if (currentDocumentChange) {
      server.send(
        JSON.stringify({ type: "document-changed", ...currentDocumentChange }),
      );
    }
    this.broadcastPresence();
    return new Response(null, {
      status: 101,
      webSocket: client,
    } as ResponseInit & { webSocket: WebSocket });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") {
      if (collaborationAttachment(socket).mode === "presence") return;
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
      attachment.mode = attachment.mode === "presence" ? "presence" : "document";
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
