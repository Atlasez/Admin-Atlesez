import * as Y from "yjs";
import {
  encodeRelativeCursorPosition,
  resolveRelativeCursorPosition,
} from "../lib/editorial-collaboration-presence";

type Member = {
  sessionId?: string;
  email?: string;
  displayName?: string;
};

type CursorState = {
  id: string;
  email: string;
  name: string;
  active: boolean;
  anchor: number;
  head: number;
  relativeAnchor: string | null;
  relativeHead: string | null;
  updatedAt: number;
};

type Rect = { left: number; top: number; width: number; height: number };
const LOCAL_CURSOR_ORIGIN = "atlasez-local-cursor";
const REMOTE_ORIGIN = "atlasez-remote-update";
const STALE_AFTER_MS = 12_000;

const hueFor = (value: string) => {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
};

function parseCursorState(value: unknown): CursorState | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as Partial<CursorState>;
    if (!parsed.id || typeof parsed.id !== "string") return null;
    return {
      id: parsed.id,
      email: typeof parsed.email === "string" ? parsed.email : "",
      name: typeof parsed.name === "string" ? parsed.name : "共同編集者",
      active: parsed.active === true,
      anchor: typeof parsed.anchor === "number" ? parsed.anchor : 0,
      head: typeof parsed.head === "number" ? parsed.head : 0,
      relativeAnchor:
        typeof parsed.relativeAnchor === "string"
          ? parsed.relativeAnchor
          : null,
      relativeHead:
        typeof parsed.relativeHead === "string" ? parsed.relativeHead : null,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

function ensureStyles(doc: Document) {
  if (doc.querySelector("style[data-atlasez-realtime-cursors]")) return;
  const style = doc.createElement("style");
  style.dataset.atlasezRealtimeCursors = "true";
  style.textContent = `
    .atlasez-remote-cursor-layer{inset:0;overflow:hidden;pointer-events:none;position:fixed;z-index:2147483000}
    .atlasez-remote-caret{--remote-hue:210;border-left:2px solid hsl(var(--remote-hue) 78% 48%);position:fixed;width:0}
    .atlasez-remote-caret-name{background:hsl(var(--remote-hue) 70% 43%);border-radius:.25rem .25rem .25rem 0;color:#fff;font:700 11px/1.25 system-ui,sans-serif;left:-2px;max-width:11rem;overflow:hidden;padding:2px 5px;position:absolute;text-overflow:ellipsis;top:-17px;white-space:nowrap}
    .atlasez-remote-selection{--remote-hue:210;background:hsl(var(--remote-hue) 76% 55%/.22);border-radius:2px;position:fixed}
  `;
  doc.head.append(style);
}

function initializeRealtimeCursors() {
  const root = document.querySelector<HTMLElement>("[data-editor-workspace]");
  const form = root?.querySelector<HTMLFormElement>("[data-document-form]");
  const textarea = root?.querySelector<HTMLTextAreaElement>("[data-body]");
  if (
    !root ||
    !form ||
    !textarea ||
    root.dataset.realtimeCursorsV3 === "true"
  ) {
    return;
  }
  root.dataset.realtimeCursorsV3 = "true";

  const localId = crypto.randomUUID();
  let socket: WebSocket | null = null;
  let documentId = "";
  let destroyed = false;
  let ownEmail = "";
  let ownName = "共同編集者";
  let serverSessionId = "";
  let reconnectTimer = 0;
  let ydoc = new Y.Doc();
  let ybody = ydoc.getText("body");
  let cursors = ydoc.getMap<string>("editor-cursors");
  let layer: HTMLDivElement | null = null;
  let mirror: HTMLDivElement | null = null;
  let surfaceDocument: Document | null = null;
  let lastSignature = "";

  const currentId = () =>
    (form.elements.namedItem("documentId") as HTMLInputElement | null)?.value ??
    "";

  const ensureSurface = () => {
    const doc = textarea.ownerDocument;
    if (surfaceDocument === doc && layer?.isConnected && mirror?.isConnected) {
      return { doc, win: doc.defaultView ?? window };
    }
    layer?.remove();
    mirror?.remove();
    ensureStyles(doc);
    layer = doc.createElement("div");
    layer.className = "atlasez-remote-cursor-layer";
    layer.setAttribute("aria-hidden", "true");
    mirror = doc.createElement("div");
    mirror.setAttribute("aria-hidden", "true");
    Object.assign(mirror.style, {
      position: "fixed",
      left: "-100000px",
      top: "0",
      visibility: "hidden",
      pointerEvents: "none",
      overflow: "visible",
      whiteSpace: "pre-wrap",
      wordWrap: "break-word",
    });
    doc.body.append(layer, mirror);
    surfaceDocument = doc;
    return { doc, win: doc.defaultView ?? window };
  };

  const px = (value: string) => Number.parseFloat(value) || 0;
  const syncMirror = () => {
    const { win } = ensureSurface();
    if (!mirror) return;
    const style = win.getComputedStyle(textarea);
    const properties = [
      "boxSizing",
      "fontFamily",
      "fontSize",
      "fontStyle",
      "fontWeight",
      "fontVariant",
      "lineHeight",
      "letterSpacing",
      "wordSpacing",
      "textTransform",
      "textIndent",
      "textAlign",
      "direction",
      "tabSize",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "borderTopWidth",
      "borderRightWidth",
      "borderBottomWidth",
      "borderLeftWidth",
      "borderTopStyle",
      "borderRightStyle",
      "borderBottomStyle",
      "borderLeftStyle",
      "overflowWrap",
      "wordBreak",
    ] as const;
    for (const property of properties) mirror.style[property] = style[property];
    mirror.style.width = `${textarea.offsetWidth}px`;
    mirror.style.minHeight = `${textarea.offsetHeight}px`;
    mirror.style.height = "auto";
  };

  const bounds = () => {
    const { win } = ensureSurface();
    const style = win.getComputedStyle(textarea);
    const rect = textarea.getBoundingClientRect();
    return {
      left: rect.left + px(style.borderLeftWidth),
      top: rect.top + px(style.borderTopWidth),
      right: rect.right - px(style.borderRightWidth),
      bottom: rect.bottom - px(style.borderBottomWidth),
    };
  };

  const mapRect = (rect: DOMRect, mirrorRect: DOMRect): Rect => {
    const textareaRect = textarea.getBoundingClientRect();
    return {
      left:
        textareaRect.left + rect.left - mirrorRect.left - textarea.scrollLeft,
      top: textareaRect.top + rect.top - mirrorRect.top - textarea.scrollTop,
      width: rect.width,
      height: rect.height,
    };
  };

  const caretRect = (position: number) => {
    const { doc, win } = ensureSurface();
    if (!mirror) return null;
    syncMirror();
    const safe = Math.max(0, Math.min(position, textarea.value.length));
    mirror.replaceChildren(doc.createTextNode(textarea.value.slice(0, safe)));
    const marker = doc.createElement("span");
    marker.textContent = "\u200b";
    mirror.append(marker);
    const markerRect = marker.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    const mapped = mapRect(markerRect, mirrorRect);
    const lineHeight = px(win.getComputedStyle(textarea).lineHeight) || 20;
    return { left: mapped.left, top: mapped.top, height: lineHeight };
  };

  const selectionRects = (start: number, end: number) => {
    const { doc } = ensureSurface();
    if (!mirror) return [] as Rect[];
    syncMirror();
    const from = Math.max(0, Math.min(start, end, textarea.value.length));
    const to = Math.max(
      from,
      Math.min(Math.max(start, end), textarea.value.length),
    );
    if (from === to) return [] as Rect[];
    mirror.replaceChildren(doc.createTextNode(textarea.value.slice(0, from)));
    const selected = doc.createElement("span");
    selected.textContent = textarea.value.slice(from, to);
    mirror.append(selected);
    const mirrorRect = mirror.getBoundingClientRect();
    const viewport = bounds();
    return Array.from(selected.getClientRects())
      .map((rect) => mapRect(rect, mirrorRect))
      .map((rect) => {
        const left = Math.max(viewport.left, rect.left);
        const top = Math.max(viewport.top, rect.top);
        const right = Math.min(viewport.right, rect.left + rect.width);
        const bottom = Math.min(viewport.bottom, rect.top + rect.height);
        return right > left && bottom > top
          ? { left, top, width: right - left, height: bottom - top }
          : null;
      })
      .filter((rect): rect is Rect => rect !== null);
  };

  const resolve = (state: CursorState, head: boolean) => {
    const relative = head ? state.relativeHead : state.relativeAnchor;
    const relativeIndex = resolveRelativeCursorPosition(relative, ydoc, ybody);
    if (relativeIndex !== null) return relativeIndex;
    return head ? state.head : state.anchor;
  };

  const render = () => {
    const { doc } = ensureSurface();
    if (!layer) return;
    layer.replaceChildren();
    const viewport = bounds();
    const now = Date.now();
    const states = [...cursors.values()]
      .map(parseCursorState)
      .filter((state): state is CursorState => Boolean(state))
      .filter(
        (state) =>
          state.id !== localId &&
          state.active &&
          now - state.updatedAt < STALE_AFTER_MS,
      );

    for (const state of states) {
      const rawHead = resolve(state, true);
      const rawAnchor = resolve(state, false);
      const head = Math.max(0, Math.min(rawHead, textarea.value.length));
      const anchor = Math.max(0, Math.min(rawAnchor, textarea.value.length));
      const hue = hueFor(state.email || state.id);
      for (const rect of selectionRects(anchor, head)) {
        const selection = doc.createElement("span");
        selection.className = "atlasez-remote-selection";
        selection.style.setProperty("--remote-hue", String(hue));
        selection.style.left = `${rect.left}px`;
        selection.style.top = `${rect.top}px`;
        selection.style.width = `${Math.max(1, rect.width)}px`;
        selection.style.height = `${Math.max(1, rect.height)}px`;
        layer.append(selection);
      }
      const caret = caretRect(head);
      if (!caret) continue;
      if (
        caret.left < viewport.left - 2 ||
        caret.left > viewport.right + 2 ||
        caret.top + caret.height <= viewport.top ||
        caret.top >= viewport.bottom
      ) {
        continue;
      }
      const line = doc.createElement("span");
      line.className = "atlasez-remote-caret";
      line.style.setProperty("--remote-hue", String(hue));
      line.style.left = `${caret.left}px`;
      line.style.top = `${Math.max(caret.top, viewport.top)}px`;
      line.style.height = `${Math.max(
        1,
        Math.min(
          caret.height,
          viewport.bottom - Math.max(caret.top, viewport.top),
        ),
      )}px`;
      const name = doc.createElement("span");
      name.className = "atlasez-remote-caret-name";
      name.textContent = state.name || "共同編集者";
      line.append(name);
      layer.append(line);
    }
  };

  const updateIdentity = (members: Member[]) => {
    const own = members.find(
      (member) =>
        (serverSessionId && member.sessionId === serverSessionId) ||
        (ownEmail && member.email?.toLowerCase() === ownEmail.toLowerCase()),
    );
    if (own?.email) ownEmail = own.email;
    if (own?.displayName) ownName = own.displayName;
  };

  const publishCursor = (force = false) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const active = textarea.ownerDocument.activeElement === textarea;
    const start = active ? textarea.selectionStart : 0;
    const end = active ? textarea.selectionEnd : start;
    const backward = active && textarea.selectionDirection === "backward";
    const anchor = backward ? end : start;
    const head = backward ? start : end;
    const signature = `${active}:${anchor}:${head}:${textarea.value.length}:${ownName}:${ownEmail}`;
    if (!force && signature === lastSignature) return;
    lastSignature = signature;
    const inSync = ybody.toString() === textarea.value;
    const state: CursorState = {
      id: localId,
      email: ownEmail,
      name: ownName,
      active,
      anchor,
      head,
      relativeAnchor: inSync
        ? encodeRelativeCursorPosition(ybody, anchor)
        : null,
      relativeHead: inSync ? encodeRelativeCursorPosition(ybody, head) : null,
      updatedAt: Date.now(),
    };
    ydoc.transact(() => {
      cursors.set(localId, JSON.stringify(state));
    }, LOCAL_CURSOR_ORIGIN);

    // Keep the legacy field-only presence message for the participant list.
    // Cursor coordinates themselves travel in the Yjs binary update above.
    socket.send(
      JSON.stringify({ type: "presence", field: active ? "body" : "" }),
    );
  };

  const removeCursor = () => {
    if (!cursors.has(localId)) return;
    ydoc.transact(() => cursors.delete(localId), LOCAL_CURSOR_ORIGIN);
  };

  const resetDoc = () => {
    ydoc.destroy();
    ydoc = new Y.Doc();
    ybody = ydoc.getText("body");
    cursors = ydoc.getMap<string>("editor-cursors");
    cursors.observe(render);
    ydoc.on("update", (update, origin) => {
      if (
        origin === LOCAL_CURSOR_ORIGIN &&
        socket?.readyState === WebSocket.OPEN
      ) {
        socket.send(update);
      }
    });
  };

  const connect = (nextDocumentId: string) => {
    window.clearTimeout(reconnectTimer);
    socket?.close();
    socket = null;
    documentId = nextDocumentId;
    ownEmail = "";
    ownName = "共同編集者";
    serverSessionId = "";
    lastSignature = "";
    resetDoc();
    render();
    if (!documentId || destroyed) return;

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const next = new WebSocket(
      `${protocol}//${location.host}/api/admin/editor/documents/${encodeURIComponent(documentId)}/collaboration`,
    );
    next.binaryType = "arraybuffer";
    socket = next;
    next.addEventListener("open", () => publishCursor(true));
    next.addEventListener("message", (event) => {
      if (event.data instanceof ArrayBuffer) {
        try {
          Y.applyUpdate(ydoc, new Uint8Array(event.data), REMOTE_ORIGIN);
          publishCursor(true);
          render();
        } catch {
          // Ignore malformed collaboration updates.
        }
        return;
      }
      if (typeof event.data !== "string") return;
      try {
        const message = JSON.parse(event.data) as {
          type?: string;
          sessionId?: string;
          email?: string;
          participants?: Member[];
        };
        if (message.type === "session") {
          serverSessionId = message.sessionId ?? "";
          ownEmail = message.email ?? ownEmail;
          publishCursor(true);
        } else if (
          message.type === "presence" &&
          Array.isArray(message.participants)
        ) {
          updateIdentity(message.participants);
          publishCursor(true);
        }
      } catch {
        // Legacy or malformed string packets are not required for cursor sync.
      }
    });
    next.addEventListener("close", () => {
      if (!destroyed && documentId === nextDocumentId) {
        reconnectTimer = window.setTimeout(() => connect(nextDocumentId), 1200);
      }
    });
  };

  resetDoc();
  const syncConnection = () => {
    const id = currentId();
    if (id !== documentId) connect(id);
  };
  const poll = window.setInterval(() => {
    syncConnection();
    publishCursor();
    render();
  }, 50);
  const heartbeat = window.setInterval(() => publishCursor(true), 2500);
  const staleCleanup = window.setInterval(() => {
    const now = Date.now();
    const stale = [...cursors.entries()]
      .filter(
        ([id, raw]) =>
          id !== localId &&
          now - (parseCursorState(raw)?.updatedAt ?? 0) > 60_000,
      )
      .map(([id]) => id);
    if (stale.length) {
      ydoc.transact(
        () => stale.forEach((id) => cursors.delete(id)),
        LOCAL_CURSOR_ORIGIN,
      );
    }
  }, 15_000);

  const observer = new MutationObserver(syncConnection);
  observer.observe(form, { attributes: true, subtree: true });
  textarea.addEventListener("scroll", render, { passive: true });
  window.addEventListener("resize", render, { passive: true });
  window.addEventListener("scroll", render, { passive: true });
  syncConnection();

  document.addEventListener(
    "astro:before-swap",
    () => {
      destroyed = true;
      removeCursor();
      observer.disconnect();
      window.clearInterval(poll);
      window.clearInterval(heartbeat);
      window.clearInterval(staleCleanup);
      window.clearTimeout(reconnectTimer);
      socket?.close();
      ydoc.destroy();
      layer?.remove();
      mirror?.remove();
    },
    { once: true },
  );
}

if (typeof document !== "undefined") {
  document.addEventListener("astro:page-load", initializeRealtimeCursors);
  initializeRealtimeCursors();
}
