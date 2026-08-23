import * as Y from "yjs";
import {
  encodeRelativeCursorPosition,
  resolveRelativeCursorPosition,
} from "../lib/editorial-collaboration-presence";

type Participant = {
  sessionId: string;
  email: string;
  displayName: string;
  field: string;
  cursorStart: number | null;
  cursorEnd: number | null;
  cursorAnchor?: string | null;
  cursorHead?: string | null;
};

type PresenceMessage = {
  type: "presence";
  participants: Participant[];
};

type SessionMessage = {
  type: "session";
  sessionId: string;
  email: string;
};

type Rect = { left: number; top: number; width: number; height: number };

const hueFor = (value: string) => {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
};

const dedupeParticipants = (items: Participant[]) => {
  const merged = new Map<string, Participant>();
  for (const item of items) {
    const key =
      item.email.trim().toLowerCase() ||
      item.displayName.trim().toLowerCase() ||
      item.sessionId;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...item });
      continue;
    }
    if (item.displayName) current.displayName = item.displayName;
    if (item.email) current.email = item.email;
    if (item.field) current.field = item.field;
    if (
      item.cursorHead ||
      item.cursorAnchor ||
      item.cursorStart !== null ||
      item.cursorEnd !== null
    ) {
      current.sessionId = item.sessionId;
      current.cursorStart = item.cursorStart;
      current.cursorEnd = item.cursorEnd;
      current.cursorAnchor = item.cursorAnchor ?? null;
      current.cursorHead = item.cursorHead ?? null;
    }
  }
  return [...merged.values()];
};

function ensureStyles(doc: Document) {
  if (doc.querySelector("style[data-atlasez-realtime-cursors]")) return;
  const style = doc.createElement("style");
  style.dataset.atlasezRealtimeCursors = "true";
  style.textContent = `
    .atlasez-remote-cursor-layer {
      inset: 0;
      overflow: hidden;
      pointer-events: none;
      position: fixed;
      z-index: 2147483000;
    }
    .atlasez-remote-caret {
      --remote-hue: 210;
      border-left: 2px solid hsl(var(--remote-hue) 78% 48%);
      position: fixed;
      width: 0;
    }
    .atlasez-remote-caret-name {
      background: hsl(var(--remote-hue) 70% 43%);
      border-radius: .25rem .25rem .25rem 0;
      color: #fff;
      font: 700 11px/1.25 system-ui, sans-serif;
      left: -2px;
      max-width: 11rem;
      overflow: hidden;
      padding: 2px 5px;
      position: absolute;
      text-overflow: ellipsis;
      top: -17px;
      white-space: nowrap;
    }
    .atlasez-remote-selection {
      --remote-hue: 210;
      background: hsl(var(--remote-hue) 76% 55% / .22);
      border-radius: 2px;
      position: fixed;
    }
  `;
  doc.head.append(style);
}

function initializeRealtimeCursors() {
  const root = document.querySelector<HTMLElement>("[data-editor-workspace]");
  if (!root || root.dataset.realtimeCursorsV2 === "true") return;
  const form = root.querySelector<HTMLFormElement>("[data-document-form]");
  const textarea = root.querySelector<HTMLTextAreaElement>("[data-body]");
  if (!form || !textarea) return;
  root.dataset.realtimeCursorsV2 = "true";

  let socket: WebSocket | null = null;
  let reconnectTimer = 0;
  let currentDocumentId = "";
  let ownEmail = "";
  let ownSessionId = "";
  let participants: Participant[] = [];
  let destroyed = false;
  let lastPresenceSignature = "";
  let ydoc = new Y.Doc();
  let ybody = ydoc.getText("body");
  let layer: HTMLDivElement | null = null;
  let mirror: HTMLDivElement | null = null;
  let surfaceDocument: Document | null = null;

  const currentId = () =>
    (form.elements.namedItem("documentId") as HTMLInputElement | null)?.value ??
    "";

  const resetYDoc = () => {
    ydoc.destroy();
    ydoc = new Y.Doc();
    ybody = ydoc.getText("body");
  };

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

  const number = (value: string) => Number.parseFloat(value) || 0;

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

  const viewport = () => {
    const { win } = ensureSurface();
    const style = win.getComputedStyle(textarea);
    const rect = textarea.getBoundingClientRect();
    return {
      left: rect.left + number(style.borderLeftWidth),
      top: rect.top + number(style.borderTopWidth),
      right: rect.right - number(style.borderRightWidth),
      bottom: rect.bottom - number(style.borderBottomWidth),
    };
  };

  const toTextareaViewport = (rect: DOMRect, mirrorRect: DOMRect): Rect => {
    const textareaRect = textarea.getBoundingClientRect();
    return {
      left: textareaRect.left + rect.left - mirrorRect.left - textarea.scrollLeft,
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
    const mapped = toTextareaViewport(markerRect, mirrorRect);
    const lineHeight =
      number(win.getComputedStyle(textarea).lineHeight) || markerRect.height || 20;
    return { left: mapped.left, top: mapped.top, height: lineHeight };
  };

  const selectionRects = (start: number, end: number) => {
    const { doc } = ensureSurface();
    if (!mirror) return [] as Rect[];
    syncMirror();
    const from = Math.max(0, Math.min(start, end, textarea.value.length));
    const to = Math.max(from, Math.min(Math.max(start, end), textarea.value.length));
    if (from === to) return [] as Rect[];
    mirror.replaceChildren(doc.createTextNode(textarea.value.slice(0, from)));
    const selected = doc.createElement("span");
    selected.textContent = textarea.value.slice(from, to);
    mirror.append(selected);
    const mirrorRect = mirror.getBoundingClientRect();
    const bounds = viewport();
    return Array.from(selected.getClientRects())
      .map((rect) => toTextareaViewport(rect, mirrorRect))
      .map((rect) => {
        const left = Math.max(bounds.left, rect.left);
        const top = Math.max(bounds.top, rect.top);
        const right = Math.min(bounds.right, rect.left + rect.width);
        const bottom = Math.min(bounds.bottom, rect.top + rect.height);
        return right > left && bottom > top
          ? { left, top, width: right - left, height: bottom - top }
          : null;
      })
      .filter((rect): rect is Rect => rect !== null);
  };

  const resolvePosition = (participant: Participant, head: boolean) => {
    const relative = head ? participant.cursorHead : participant.cursorAnchor;
    const resolved = resolveRelativeCursorPosition(relative, ydoc, ybody);
    if (resolved !== null) return resolved;
    return head ? participant.cursorEnd : participant.cursorStart;
  };

  const render = () => {
    const { doc } = ensureSurface();
    if (!layer) return;
    layer.replaceChildren();
    const bounds = viewport();
    const length = textarea.value.length;
    const remote = dedupeParticipants(participants).filter((participant) => {
      const sameUser = ownEmail
        ? participant.email.toLowerCase() === ownEmail.toLowerCase()
        : participant.sessionId === ownSessionId;
      return !sameUser && participant.field === "body";
    });

    for (const participant of remote) {
      const rawHead = resolvePosition(participant, true);
      if (rawHead === null) continue;
      const rawAnchor = resolvePosition(participant, false) ?? rawHead;
      const head = Math.max(0, Math.min(rawHead, length));
      const anchor = Math.max(0, Math.min(rawAnchor, length));
      const hue = hueFor(participant.email || participant.sessionId);

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
        caret.left < bounds.left - 2 ||
        caret.left > bounds.right + 2 ||
        caret.top + caret.height <= bounds.top ||
        caret.top >= bounds.bottom
      ) {
        continue;
      }
      const line = doc.createElement("span");
      line.className = "atlasez-remote-caret";
      line.style.setProperty("--remote-hue", String(hue));
      line.style.left = `${caret.left}px`;
      line.style.top = `${Math.max(caret.top, bounds.top)}px`;
      line.style.height = `${Math.max(
        1,
        Math.min(caret.height, bounds.bottom - Math.max(caret.top, bounds.top)),
      )}px`;
      const name = doc.createElement("span");
      name.className = "atlasez-remote-caret-name";
      name.textContent = participant.displayName || participant.email || "共同編集者";
      line.append(name);
      layer.append(line);
    }
  };

  const relativePositions = (anchor: number, head: number) => {
    if (ybody.toString() !== textarea.value) return { anchor: null, head: null };
    return {
      anchor: encodeRelativeCursorPosition(ybody, anchor),
      head: encodeRelativeCursorPosition(ybody, head),
    };
  };

  const sendCurrentPresence = (force = false) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const active = textarea.ownerDocument.activeElement === textarea;
    const start = active ? textarea.selectionStart : -1;
    const end = active ? textarea.selectionEnd : -1;
    const direction = active ? textarea.selectionDirection : "none";
    const signature = `${active}:${start}:${end}:${direction}:${textarea.value.length}`;
    if (!force && signature === lastPresenceSignature) return;
    lastPresenceSignature = signature;
    if (!active) {
      socket.send(
        JSON.stringify({
          type: "presence",
          field: "",
          cursorStart: null,
          cursorEnd: null,
          cursorAnchor: null,
          cursorHead: null,
        }),
      );
      return;
    }
    const backward = direction === "backward";
    const anchor = backward ? end : start;
    const head = backward ? start : end;
    const relative = relativePositions(anchor, head);
    socket.send(
      JSON.stringify({
        type: "presence",
        field: "body",
        cursorStart: anchor,
        cursorEnd: head,
        cursorAnchor: relative.anchor,
        cursorHead: relative.head,
      }),
    );
  };

  const connect = (documentId: string) => {
    window.clearTimeout(reconnectTimer);
    socket?.close();
    socket = null;
    currentDocumentId = documentId;
    ownEmail = "";
    ownSessionId = "";
    participants = [];
    lastPresenceSignature = "";
    resetYDoc();
    render();
    if (!documentId || destroyed) return;

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const next = new WebSocket(
      `${protocol}//${location.host}/api/admin/editor/documents/${encodeURIComponent(documentId)}/collaboration`,
    );
    next.binaryType = "arraybuffer";
    socket = next;
    next.addEventListener("open", () => sendCurrentPresence(true));
    next.addEventListener("message", (event) => {
      if (event.data instanceof ArrayBuffer) {
        try {
          Y.applyUpdate(ydoc, new Uint8Array(event.data));
          sendCurrentPresence(true);
          render();
        } catch {
          // The primary editor socket remains authoritative for content sync.
        }
        return;
      }
      if (typeof event.data !== "string") return;
      try {
        const message = JSON.parse(event.data) as PresenceMessage | SessionMessage;
        if (message.type === "session") {
          ownEmail = message.email;
          ownSessionId = message.sessionId;
          sendCurrentPresence(true);
        } else if (message.type === "presence") {
          participants = message.participants;
          render();
        }
      } catch {
        // Ignore malformed presence packets.
      }
    });
    next.addEventListener("close", () => {
      if (!destroyed && currentDocumentId === documentId) {
        reconnectTimer = window.setTimeout(() => connect(documentId), 1200);
      }
    });
  };

  const poll = window.setInterval(() => {
    ensureSurface();
    const id = currentId();
    if (id !== currentDocumentId) connect(id);
    sendCurrentPresence();
    render();
  }, 50);

  textarea.addEventListener("scroll", render, { passive: true });
  textarea.addEventListener("input", () => {
    sendCurrentPresence(true);
    render();
  });
  textarea.addEventListener("focus", () => sendCurrentPresence(true));
  textarea.addEventListener("blur", () => sendCurrentPresence(true));
  window.addEventListener("resize", render, { passive: true });
  window.addEventListener("scroll", render, { passive: true });

  connect(currentId());

  document.addEventListener(
    "astro:before-swap",
    () => {
      destroyed = true;
      window.clearInterval(poll);
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
