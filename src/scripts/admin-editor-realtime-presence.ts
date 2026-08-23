type PresenceParticipant = {
  sessionId: string;
  email: string;
  displayName: string;
  field: string;
  cursorStart: number | null;
  cursorEnd: number | null;
};

type SessionMessage = {
  type: "session";
  sessionId: string;
  email: string;
};

type PresenceMessage = {
  type: "presence";
  participants: PresenceParticipant[];
};

type ViewportRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const hashHue = (value: string) => {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
};

export function dedupePresenceParticipants(
  items: PresenceParticipant[],
): PresenceParticipant[] {
  const merged = new Map<string, PresenceParticipant>();
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
    if (item.email && !current.email) current.email = item.email;
    if (item.displayName) current.displayName = item.displayName;
    if (item.field) current.field = item.field;
    if (item.cursorStart !== null || item.cursorEnd !== null) {
      current.sessionId = item.sessionId;
      current.cursorStart = item.cursorStart;
      current.cursorEnd = item.cursorEnd;
    }
  }
  return [...merged.values()];
}

function installPresenceStyles() {
  if (document.querySelector("style[data-editor-realtime-presence]")) return;
  const style = document.createElement("style");
  style.dataset.editorRealtimePresence = "true";
  style.textContent = `
    .realtime-cursor-layer {
      inset: 0;
      overflow: hidden;
      pointer-events: none;
      position: fixed;
      z-index: 80;
    }
    .realtime-cursor {
      --cursor-hue: 210;
      border-left: 3px solid hsl(var(--cursor-hue) 72% 48%);
      position: fixed;
      width: 0;
    }
    .realtime-cursor-label {
      background: hsl(var(--cursor-hue) 72% 45%);
      border-radius: .25rem .25rem .25rem 0;
      color: white;
      font-size: .65rem;
      font-weight: 800;
      left: -3px;
      line-height: 1.2;
      max-width: 11rem;
      overflow: hidden;
      padding: .18rem .35rem;
      position: absolute;
      text-overflow: ellipsis;
      top: -1.45rem;
      white-space: nowrap;
    }
    .realtime-selection {
      --cursor-hue: 210;
      background: hsl(var(--cursor-hue) 72% 55% / .22);
      border-radius: .15rem;
      position: fixed;
    }
  `;
  document.head.append(style);
}

function initializeRealtimePresence() {
  const root = document.querySelector<HTMLElement>("[data-editor-workspace]");
  if (!root || root.dataset.realtimePresenceReady === "true") return;
  root.dataset.realtimePresenceReady = "true";
  installPresenceStyles();

  const form = root.querySelector<HTMLFormElement>("[data-document-form]");
  const body = root.querySelector<HTMLTextAreaElement>("[data-body]");
  const participantList = root.querySelector<HTMLElement>(
    "[data-collaboration-participants]",
  );
  const collaborationState = root.querySelector<HTMLElement>(
    "[data-collaboration-state]",
  );
  if (!form || !body) return;

  const layer = document.createElement("div");
  layer.className = "realtime-cursor-layer";
  layer.setAttribute("aria-hidden", "true");
  document.body.append(layer);

  const mirror = document.createElement("div");
  mirror.setAttribute("aria-hidden", "true");
  Object.assign(mirror.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    visibility: "hidden",
    whiteSpace: "pre-wrap",
    overflow: "visible",
    pointerEvents: "none",
  });
  document.body.append(mirror);

  let socket: WebSocket | null = null;
  let reconnectTimer = 0;
  let presenceFrame = 0;
  let renderFrame = 0;
  let currentDocumentId = "";
  let ownEmail = "";
  let participants: PresenceParticipant[] = [];
  let destroyed = false;

  const syncParticipantChips = () => {
    if (!participantList) return;
    const seen = new Set<string>();
    for (const chip of Array.from(participantList.children)) {
      if (!(chip instanceof HTMLElement)) continue;
      const titleKey = chip.title.trim().toLowerCase();
      const textName = (chip.textContent ?? "")
        .split("・", 1)[0]
        .trim()
        .toLowerCase();
      const key = titleKey || textName;
      if (key && seen.has(key)) {
        chip.remove();
        continue;
      }
      if (key) seen.add(key);
    }
    if (collaborationState) {
      const count = participantList.children.length;
      if (count > 0) {
        collaborationState.textContent = `同時編集: ${count}人が接続中`;
      }
    }
  };

  const borderNumber = (value: string) => Number.parseFloat(value) || 0;

  const syncMirrorStyle = () => {
    const style = getComputedStyle(body);
    const copy = [
      "direction",
      "fontFamily",
      "fontSize",
      "fontStyle",
      "fontWeight",
      "fontVariant",
      "letterSpacing",
      "lineHeight",
      "textAlign",
      "textIndent",
      "textTransform",
      "wordSpacing",
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
    for (const property of copy) mirror.style[property] = style[property];

    const horizontalBorder =
      borderNumber(style.borderLeftWidth) + borderNumber(style.borderRightWidth);
    mirror.style.boxSizing = "border-box";
    mirror.style.width = `${body.clientWidth + horizontalBorder}px`;
    mirror.style.height = "auto";
    mirror.style.minHeight = "0";
    mirror.style.whiteSpace = "pre-wrap";
  };

  const bodyViewport = () => {
    const bodyRect = body.getBoundingClientRect();
    const style = getComputedStyle(body);
    const left = bodyRect.left + borderNumber(style.borderLeftWidth);
    const top = bodyRect.top + borderNumber(style.borderTopWidth);
    const right = bodyRect.right - borderNumber(style.borderRightWidth);
    const bottom = bodyRect.bottom - borderNumber(style.borderBottomWidth);
    return { left, top, right, bottom };
  };

  const clipRect = (rect: ViewportRect): ViewportRect | null => {
    const viewport = bodyViewport();
    const left = Math.max(rect.left, viewport.left);
    const top = Math.max(rect.top, viewport.top);
    const right = Math.min(rect.left + rect.width, viewport.right);
    const bottom = Math.min(rect.top + rect.height, viewport.bottom);
    if (right <= left || bottom <= top) return null;
    return { left, top, width: right - left, height: bottom - top };
  };

  const mirrorRectToViewport = (rect: DOMRect, mirrorRect: DOMRect) => {
    const bodyRect = body.getBoundingClientRect();
    return {
      left: bodyRect.left + (rect.left - mirrorRect.left) - body.scrollLeft,
      top: bodyRect.top + (rect.top - mirrorRect.top) - body.scrollTop,
      width: rect.width,
      height: rect.height,
    };
  };

  const caretCoordinates = (position: number) => {
    syncMirrorStyle();
    const safe = Math.max(0, Math.min(position, body.value.length));
    mirror.replaceChildren();
    mirror.append(document.createTextNode(body.value.slice(0, safe)));

    // Always measure a zero-width marker at the caret itself. Using the next
    // character here is wrong when that character is a newline: its box is
    // laid out on the following visual line and makes the remote caret appear
    // one line too low.
    const marker = document.createElement("span");
    marker.textContent = "\u200b";
    mirror.append(marker);

    const markerRect = marker.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    const measured = mirrorRectToViewport(markerRect, mirrorRect);
    const style = getComputedStyle(body);
    const lineHeight = borderNumber(style.lineHeight) || markerRect.height || 20;
    return {
      left: measured.left,
      top: measured.top,
      lineHeight,
    };
  };

  const selectionCoordinates = (start: number, end: number) => {
    syncMirrorStyle();
    const from = Math.max(0, Math.min(start, end, body.value.length));
    const to = Math.max(from, Math.min(Math.max(start, end), body.value.length));
    if (from === to) return [] as ViewportRect[];

    mirror.replaceChildren();
    mirror.append(document.createTextNode(body.value.slice(0, from)));
    const selected = document.createElement("span");
    selected.textContent = body.value.slice(from, to);
    mirror.append(selected);

    const mirrorRect = mirror.getBoundingClientRect();
    return Array.from(selected.getClientRects())
      .map((rect) => mirrorRectToViewport(rect, mirrorRect))
      .map(clipRect)
      .filter((rect): rect is ViewportRect => Boolean(rect));
  };

  const renderParticipants = () => {
    layer.replaceChildren();
    if (!currentDocumentId || body.hidden || !body.isConnected) return;
    const bodyLength = body.value.length;
    const viewport = bodyViewport();
    const visible = participants.filter(
      (participant) =>
        participant.email.toLowerCase() !== ownEmail.toLowerCase() &&
        participant.field === "body" &&
        participant.cursorStart !== null,
    );

    for (const participant of visible) {
      const start = Math.max(
        0,
        Math.min(participant.cursorStart ?? 0, bodyLength),
      );
      const end = Math.max(
        0,
        Math.min(participant.cursorEnd ?? start, bodyLength),
      );
      const hue = hashHue(participant.email || participant.sessionId);

      if (start !== end) {
        for (const rect of selectionCoordinates(start, end)) {
          const selection = document.createElement("span");
          selection.className = "realtime-selection";
          selection.style.setProperty("--cursor-hue", String(hue));
          selection.style.left = `${rect.left}px`;
          selection.style.top = `${rect.top}px`;
          selection.style.width = `${Math.max(1, rect.width)}px`;
          selection.style.height = `${Math.max(1, rect.height)}px`;
          layer.append(selection);
        }
      }

      const caret = caretCoordinates(end);
      const caretBottom = caret.top + caret.lineHeight;
      if (
        caret.left < viewport.left - 1 ||
        caret.left > viewport.right + 1 ||
        caretBottom <= viewport.top ||
        caret.top >= viewport.bottom
      ) {
        continue;
      }

      const cursor = document.createElement("span");
      cursor.className = "realtime-cursor";
      cursor.style.setProperty("--cursor-hue", String(hue));
      cursor.style.left = `${caret.left}px`;
      cursor.style.top = `${Math.max(caret.top, viewport.top)}px`;
      cursor.style.height = `${Math.min(
        caret.lineHeight,
        viewport.bottom - Math.max(caret.top, viewport.top),
      )}px`;

      const label = document.createElement("span");
      label.className = "realtime-cursor-label";
      label.textContent =
        participant.displayName || participant.email || "共同編集者";
      cursor.append(label);
      layer.append(cursor);
    }
    syncParticipantChips();
  };

  const scheduleRender = () => {
    if (renderFrame) return;
    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = 0;
      renderParticipants();
    });
  };

  const sendPresenceNow = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const active = document.activeElement === body;
    socket.send(
      JSON.stringify({
        type: "presence",
        field: active ? "body" : "",
        cursorStart: active ? body.selectionStart : null,
        cursorEnd: active ? body.selectionEnd : null,
      }),
    );
  };

  const schedulePresence = () => {
    if (presenceFrame) return;
    presenceFrame = window.requestAnimationFrame(() => {
      presenceFrame = 0;
      sendPresenceNow();
      renderParticipants();
    });
  };

  const connect = (documentId: string) => {
    if (destroyed) return;
    window.clearTimeout(reconnectTimer);
    socket?.close();
    socket = null;
    ownEmail = "";
    participants = [];
    layer.replaceChildren();
    currentDocumentId = documentId;
    if (!documentId) return;

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const nextSocket = new WebSocket(
      `${protocol}//${location.host}/api/admin/editor/documents/${encodeURIComponent(documentId)}/collaboration`,
    );
    socket = nextSocket;
    nextSocket.binaryType = "arraybuffer";

    nextSocket.addEventListener("open", sendPresenceNow);
    nextSocket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      try {
        const payload = JSON.parse(event.data) as
          | SessionMessage
          | PresenceMessage;
        if (payload.type === "session") {
          ownEmail = payload.email;
          sendPresenceNow();
          return;
        }
        if (payload.type === "presence") {
          participants = dedupePresenceParticipants(payload.participants);
          scheduleRender();
        }
      } catch {
        // malformed presence messages are ignored
      }
    });
    nextSocket.addEventListener("close", () => {
      if (destroyed || currentDocumentId !== documentId) return;
      reconnectTimer = window.setTimeout(() => connect(documentId), 1500);
    });
  };

  const currentId = () =>
    (form.elements.namedItem("documentId") as HTMLInputElement | null)?.value ??
    "";

  const syncDocumentConnection = () => {
    const id = currentId();
    if (id !== currentDocumentId) connect(id);
  };

  const observer = new MutationObserver(syncDocumentConnection);
  observer.observe(form, { attributes: true, subtree: true });
  const chipObserver = participantList
    ? new MutationObserver(syncParticipantChips)
    : null;
  chipObserver?.observe(participantList!, { childList: true });
  const interval = window.setInterval(syncDocumentConnection, 500);

  for (const eventName of [
    "input",
    "select",
    "keyup",
    "mouseup",
    "click",
    "focus",
  ] as const) {
    body.addEventListener(eventName, schedulePresence);
  }

  const onSelectionChange = () => {
    if (document.activeElement === body) schedulePresence();
  };
  document.addEventListener("selectionchange", onSelectionChange);
  body.addEventListener("pointermove", (event) => {
    if (event.buttons) schedulePresence();
  });
  body.addEventListener("blur", () => {
    if (presenceFrame) {
      window.cancelAnimationFrame(presenceFrame);
      presenceFrame = 0;
    }
    sendPresenceNow();
    scheduleRender();
  });
  body.addEventListener("scroll", scheduleRender, { passive: true });
  window.addEventListener("resize", scheduleRender, { passive: true });
  window.addEventListener("scroll", scheduleRender, { passive: true });

  syncDocumentConnection();

  document.addEventListener(
    "astro:before-swap",
    () => {
      destroyed = true;
      observer.disconnect();
      chipObserver?.disconnect();
      document.removeEventListener("selectionchange", onSelectionChange);
      window.clearInterval(interval);
      window.clearTimeout(reconnectTimer);
      if (presenceFrame) window.cancelAnimationFrame(presenceFrame);
      if (renderFrame) window.cancelAnimationFrame(renderFrame);
      socket?.close();
      mirror.remove();
      layer.remove();
    },
    { once: true },
  );
}

if (typeof document !== "undefined") {
  document.addEventListener("astro:page-load", initializeRealtimePresence);
  initializeRealtimePresence();
}
