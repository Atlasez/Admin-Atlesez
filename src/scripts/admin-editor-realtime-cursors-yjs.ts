import * as Y from "yjs";
import {
  encodeRelativeCursorPosition,
  resolveRelativeCursorPosition,
} from "../lib/editorial-collaboration-presence";

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

type Member = {
  sessionId?: string;
  email?: string;
  displayName?: string;
  field?: string;
  cursorStart?: number | null;
  cursorEnd?: number | null;
  cursorAnchor?: string | null;
  cursorHead?: string | null;
};
type Rect = { left: number; top: number; width: number; height: number };
const REMOTE = "remote-update";

function hueFor(value: string): number {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}

function ensureCursorStyles(doc: Document): void {
  if (doc.querySelector("style[data-yjs-remote-cursors]")) return;
  const style = doc.createElement("style");
  style.dataset.yjsRemoteCursors = "true";
  style.textContent = `
    .yjs-remote-cursor-layer{inset:0;overflow:hidden;pointer-events:none;position:fixed;z-index:2147483000}
    .yjs-remote-caret{--h:210;border-left:2px solid hsl(var(--h) 78% 48%);position:fixed;width:0}
    .yjs-remote-caret-label{background:hsl(var(--h) 70% 43%);border-radius:.25rem .25rem .25rem 0;color:#fff;font:700 11px/1.25 system-ui,sans-serif;left:-2px;max-width:11rem;overflow:hidden;padding:2px 5px;position:absolute;text-overflow:ellipsis;top:-17px;white-space:nowrap}
    .yjs-remote-selection{--h:210;background:hsl(var(--h) 76% 55%/.22);border-radius:2px;position:fixed}
  `;
  doc.head.append(style);
}

function initialize(): void {
  const root = document.querySelector<HTMLElement>("[data-editor-workspace]");
  const form = root?.querySelector<HTMLFormElement>("[data-document-form]");
  const textarea = root?.querySelector<HTMLTextAreaElement>("[data-body]");
  if (!root || !form || !textarea || root.dataset.yjsRemoteCursors === "true")
    return;
  root.dataset.yjsRemoteCursors = "true";

  let documentId = "";
  let socket: WebSocket | null = null;
  let reconnectTimer = 0;
  let destroyed = false;
  let ownEmail = "";
  let ownName = "共同編集者";
  let serverSessionId = "";
  let lastSignature = "";
  let ydoc = new Y.Doc();
  let ybody = ydoc.getText("body");
  let remoteCursors = new Map<string, CursorState>();
  let layer: HTMLDivElement | null = null;
  let mirror: HTMLDivElement | null = null;
  let surface: Document | null = null;

  const currentDocumentId = () =>
    (form.elements.namedItem("documentId") as HTMLInputElement | null)?.value ??
    "";

  const ensureSurface = () => {
    const doc = textarea.ownerDocument;
    const win = doc.defaultView ?? window;
    if (surface === doc && layer?.isConnected && mirror?.isConnected) {
      return { doc, win };
    }
    layer?.remove();
    mirror?.remove();
    ensureCursorStyles(doc);
    layer = doc.createElement("div");
    layer.className = "yjs-remote-cursor-layer";
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
    surface = doc;
    return { doc, win };
  };

  const px = (value: string) => Number.parseFloat(value) || 0;

  const syncMirror = () => {
    const { win } = ensureSurface();
    if (!mirror) return;
    const computed = win.getComputedStyle(textarea);
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
    for (const property of properties)
      mirror.style[property] = computed[property];
    mirror.style.width = `${textarea.offsetWidth}px`;
    mirror.style.minHeight = `${textarea.offsetHeight}px`;
    mirror.style.height = "auto";
  };

  const viewport = () => {
    const { win } = ensureSurface();
    const computed = win.getComputedStyle(textarea);
    const rect = textarea.getBoundingClientRect();
    return {
      left: rect.left + px(computed.borderLeftWidth),
      top: rect.top + px(computed.borderTopWidth),
      right: rect.right - px(computed.borderRightWidth),
      bottom: rect.bottom - px(computed.borderBottomWidth),
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

  const caret = (position: number) => {
    const { doc, win } = ensureSurface();
    if (!mirror) return null;
    syncMirror();
    const safe = Math.max(0, Math.min(position, textarea.value.length));
    mirror.replaceChildren(doc.createTextNode(textarea.value.slice(0, safe)));
    const marker = doc.createElement("span");
    marker.textContent = "\u200b";
    mirror.append(marker);
    const markerRect = marker.getBoundingClientRect();
    const mapped = mapRect(markerRect, mirror.getBoundingClientRect());
    return {
      left: mapped.left,
      top: mapped.top,
      height: px(win.getComputedStyle(textarea).lineHeight) || 20,
    };
  };

  const selectionRects = (start: number, end: number): Rect[] => {
    const { doc } = ensureSurface();
    if (!mirror || start === end) return [];
    syncMirror();
    const from = Math.max(0, Math.min(start, end, textarea.value.length));
    const to = Math.max(
      from,
      Math.min(Math.max(start, end), textarea.value.length),
    );
    mirror.replaceChildren(doc.createTextNode(textarea.value.slice(0, from)));
    const selected = doc.createElement("span");
    selected.textContent = textarea.value.slice(from, to);
    mirror.append(selected);
    const mirrorRect = mirror.getBoundingClientRect();
    const bounds = viewport();
    return Array.from(selected.getClientRects())
      .map((rect) => mapRect(rect, mirrorRect))
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

  const resolve = (state: CursorState, head: boolean): number => {
    const relative = head ? state.relativeHead : state.relativeAnchor;
    return (
      resolveRelativeCursorPosition(relative, ydoc, ybody) ??
      (head ? state.head : state.anchor)
    );
  };

  const render = () => {
    const { doc } = ensureSurface();
    if (!layer) return;
    layer.replaceChildren();
    const now = Date.now();
    const bounds = viewport();
    for (const state of remoteCursors.values()) {
      if (
        state.id === serverSessionId ||
        (ownEmail && state.email.toLowerCase() === ownEmail.toLowerCase()) ||
        !state.active ||
        now - state.updatedAt > 12_000
      ) {
        continue;
      }
      const head = Math.max(
        0,
        Math.min(resolve(state, true), textarea.value.length),
      );
      const anchor = Math.max(
        0,
        Math.min(resolve(state, false), textarea.value.length),
      );
      const hue = hueFor(state.email || state.id);
      for (const rect of selectionRects(anchor, head)) {
        const selection = doc.createElement("span");
        selection.className = "yjs-remote-selection";
        selection.style.setProperty("--h", String(hue));
        selection.style.left = `${rect.left}px`;
        selection.style.top = `${rect.top}px`;
        selection.style.width = `${Math.max(1, rect.width)}px`;
        selection.style.height = `${Math.max(1, rect.height)}px`;
        layer.append(selection);
      }
      const position = caret(head);
      if (
        !position ||
        position.left < bounds.left - 2 ||
        position.left > bounds.right + 2 ||
        position.top + position.height <= bounds.top ||
        position.top >= bounds.bottom
      ) {
        continue;
      }
      const line = doc.createElement("span");
      line.className = "yjs-remote-caret";
      line.style.setProperty("--h", String(hue));
      line.style.left = `${position.left}px`;
      line.style.top = `${Math.max(position.top, bounds.top)}px`;
      line.style.height = `${Math.max(
        1,
        Math.min(
          position.height,
          bounds.bottom - Math.max(position.top, bounds.top),
        ),
      )}px`;
      const label = doc.createElement("span");
      label.className = "yjs-remote-caret-label";
      label.textContent = state.name || "共同編集者";
      line.append(label);
      layer.append(line);
    }
  };

  const resetYDoc = () => {
    ydoc.destroy();
    ydoc = new Y.Doc();
    ybody = ydoc.getText("body");
    remoteCursors = new Map();
  };

  const publish = (heartbeat = false) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const active = textarea.ownerDocument.activeElement === textarea;
    const start = active ? textarea.selectionStart : 0;
    const end = active ? textarea.selectionEnd : start;
    const backward = active && textarea.selectionDirection === "backward";
    const anchor = backward ? end : start;
    const head = backward ? start : end;
    const signature = `${active}:${anchor}:${head}:${textarea.value.length}:${ownEmail}:${ownName}`;
    if (!heartbeat && signature === lastSignature) return;
    lastSignature = signature;
    const inSync = ybody.toString() === textarea.value;
    const state: CursorState = {
      id: serverSessionId || "local",
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
    socket.send(
      JSON.stringify({
        type: "presence",
        field: active ? "body" : "",
        cursorStart: active ? anchor : null,
        cursorEnd: active ? head : null,
        cursorAnchor: active ? state.relativeAnchor : null,
        cursorHead: active ? state.relativeHead : null,
      }),
    );
  };

  const updateRemoteCursors = (members: Member[]) => {
    remoteCursors = new Map(
      members
        .filter((member): member is Member & { sessionId: string } =>
          Boolean(member.sessionId),
        )
        .map((member) => [
          member.sessionId,
          {
            id: member.sessionId,
            email: member.email ?? "",
            name: member.displayName ?? "共同編集者",
            active: member.field === "body",
            anchor: member.cursorStart ?? 0,
            head: member.cursorEnd ?? member.cursorStart ?? 0,
            relativeAnchor: member.cursorAnchor ?? null,
            relativeHead: member.cursorHead ?? null,
            updatedAt: Date.now(),
          },
        ]),
    );
    render();
  };

  const updateIdentity = (members: Member[]) => {
    const before = `${ownEmail}\n${ownName}`;
    const own = members.find(
      (member) =>
        (serverSessionId && member.sessionId === serverSessionId) ||
        (ownEmail && member.email?.toLowerCase() === ownEmail.toLowerCase()),
    );
    if (own?.email) ownEmail = own.email;
    if (own?.displayName) ownName = own.displayName;
    if (`${ownEmail}\n${ownName}` !== before) publish(true);
  };

  const connect = (nextId: string) => {
    window.clearTimeout(reconnectTimer);
    socket?.close();
    socket = null;
    documentId = nextId;
    ownEmail = "";
    ownName = "共同編集者";
    serverSessionId = "";
    lastSignature = "";
    resetYDoc();
    render();
    if (!nextId || destroyed) return;

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const next = new WebSocket(
      `${protocol}//${location.host}/api/admin/editor/documents/${encodeURIComponent(nextId)}/collaboration?mode=presence`,
    );
    next.binaryType = "arraybuffer";
    socket = next;
    next.addEventListener("open", () => publish(true));
    next.addEventListener("message", (event) => {
      if (event.data instanceof ArrayBuffer) {
        try {
          Y.applyUpdate(ydoc, new Uint8Array(event.data), REMOTE);
          render();
        } catch {
          // Main editor socket remains authoritative for document text.
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
          const before = ownEmail;
          serverSessionId = message.sessionId ?? "";
          ownEmail = message.email ?? ownEmail;
          if (ownEmail !== before) publish(true);
        } else if (
          message.type === "presence" &&
          Array.isArray(message.participants)
        ) {
          updateIdentity(message.participants);
          updateRemoteCursors(message.participants);
        }
      } catch {
        // Cursor sync itself does not depend on JSON presence packets.
      }
    });
    next.addEventListener("close", () => {
      if (!destroyed && documentId === nextId) {
        reconnectTimer = window.setTimeout(() => connect(nextId), 1200);
      }
    });
  };

  resetYDoc();
  const syncConnection = () => {
    const id = currentDocumentId();
    if (id !== documentId) connect(id);
  };
  const poll = window.setInterval(() => {
    syncConnection();
    publish();
    render();
  }, 50);
  const heartbeat = window.setInterval(() => publish(true), 2500);
  const observer = new MutationObserver(syncConnection);
  observer.observe(form, { attributes: true, subtree: true });
  textarea.addEventListener("scroll", render, { passive: true });
  window.addEventListener("scroll", render, { passive: true });
  window.addEventListener("resize", render, { passive: true });
  syncConnection();

  document.addEventListener(
    "astro:before-swap",
    () => {
      destroyed = true;
      observer.disconnect();
      window.clearInterval(poll);
      window.clearInterval(heartbeat);
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
  document.addEventListener("astro:page-load", initialize);
  initialize();
}
