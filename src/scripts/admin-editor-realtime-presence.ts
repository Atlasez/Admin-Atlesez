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

const hashHue = (value: string) => {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
};

function installPresenceStyles() {
  if (document.querySelector("style[data-editor-realtime-presence]")) return;
  const style = document.createElement("style");
  style.dataset.editorRealtimePresence = "true";
  style.textContent = `
    .writing-area { position: relative; }
    .realtime-cursor-layer {
      inset: 0;
      overflow: hidden;
      pointer-events: none;
      position: absolute;
      z-index: 12;
    }
    .realtime-cursor {
      --cursor-hue: 210;
      border-left: 2px solid hsl(var(--cursor-hue) 72% 45%);
      height: 1.45em;
      position: absolute;
      width: 0;
    }
    .realtime-cursor-label {
      background: hsl(var(--cursor-hue) 72% 45%);
      border-radius: .25rem .25rem .25rem 0;
      color: white;
      font-size: .65rem;
      font-weight: 800;
      left: -2px;
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
      position: absolute;
    }
    .collaboration-participant.is-editing::after {
      content: " 編集中";
      font-size: .65em;
      font-weight: 700;
      opacity: .7;
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
  const writingArea = root.querySelector<HTMLElement>(".writing-area");
  if (!form || !body || !writingArea) return;

  const layer = document.createElement("div");
  layer.className = "realtime-cursor-layer";
  layer.setAttribute("aria-hidden", "true");
  writingArea.append(layer);

  const mirror = document.createElement("div");
  mirror.setAttribute("aria-hidden", "true");
  Object.assign(mirror.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    visibility: "hidden",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    wordBreak: "break-word",
  });
  document.body.append(mirror);

  const marker = document.createElement("span");
  marker.textContent = "\u200b";

  let socket: WebSocket | null = null;
  let reconnectTimer = 0;
  let currentDocumentId = "";
  let ownEmail = "";
  let participants: PresenceParticipant[] = [];
  let destroyed = false;

  const syncMirrorStyle = () => {
    const style = getComputedStyle(body);
    const properties = [
      "boxSizing",
      "fontFamily",
      "fontSize",
      "fontStyle",
      "fontWeight",
      "letterSpacing",
      "lineHeight",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "borderTopWidth",
      "borderRightWidth",
      "borderBottomWidth",
      "borderLeftWidth",
    ] as const;
    for (const property of properties) mirror.style[property] = style[property];
    mirror.style.width = `${body.clientWidth}px`;
  };

  const caretCoordinates = (position: number) => {
    syncMirrorStyle();
    const safe = Math.max(0, Math.min(position, body.value.length));
    mirror.replaceChildren(document.createTextNode(body.value.slice(0, safe)), marker);
    const markerRect = marker.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    return {
      left: body.offsetLeft + markerRect.left - mirrorRect.left - body.scrollLeft,
      top: body.offsetTop + markerRect.top - mirrorRect.top - body.scrollTop,
      lineHeight: Number.parseFloat(getComputedStyle(body).lineHeight) || 20,
      bodyRect,
    };
  };

  const renderParticipants = () => {
    layer.replaceChildren();
    if (!currentDocumentId) return;
    const bodyLength = body.value.length;
    const visible = participants.filter(
      (participant) =>
        participant.email.toLowerCase() !== ownEmail.toLowerCase() &&
        participant.field === "body" &&
        participant.cursorStart !== null,
    );

    for (const participant of visible) {
      const start = Math.max(0, Math.min(participant.cursorStart ?? 0, bodyLength));
      const end = Math.max(0, Math.min(participant.cursorEnd ?? start, bodyLength));
      const hue = hashHue(participant.email || participant.sessionId);
      const caret = caretCoordinates(end);

      if (start !== end) {
        const selectionStart = caretCoordinates(Math.min(start, end));
        const selectionEnd = caretCoordinates(Math.max(start, end));
        const selection = document.createElement("span");
        selection.className = "realtime-selection";
        selection.style.setProperty("--cursor-hue", String(hue));
        selection.style.left = `${selectionStart.left}px`;
        selection.style.top = `${selectionStart.top}px`;
        selection.style.height = `${Math.max(selectionStart.lineHeight, selectionEnd.top - selectionStart.top + selectionEnd.lineHeight)}px`;
        selection.style.width = `${Math.max(10, body.clientWidth - selectionStart.left - 12)}px`;
        layer.append(selection);
      }

      const cursor = document.createElement("span");
      cursor.className = "realtime-cursor";
      cursor.style.setProperty("--cursor-hue", String(hue));
      cursor.style.left = `${caret.left}px`;
      cursor.style.top = `${caret.top}px`;
      cursor.style.height = `${caret.lineHeight}px`;

      const label = document.createElement("span");
      label.className = "realtime-cursor-label";
      label.textContent = participant.displayName || participant.email || "共同編集者";
      cursor.append(label);
      layer.append(cursor);
    }
  };

  const sendPresence = () => {
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

    nextSocket.addEventListener("open", sendPresence);
    nextSocket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      try {
        const payload = JSON.parse(event.data) as SessionMessage | PresenceMessage;
        if (payload.type === "session") {
          ownEmail = payload.email;
          sendPresence();
          return;
        }
        if (payload.type === "presence") {
          participants = payload.participants;
          renderParticipants();
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
    (form.elements.namedItem("documentId") as HTMLInputElement | null)?.value ?? "";

  const syncDocumentConnection = () => {
    const id = currentId();
    if (id !== currentDocumentId) connect(id);
  };

  const observer = new MutationObserver(syncDocumentConnection);
  observer.observe(form, { attributes: true, subtree: true });
  const interval = window.setInterval(syncDocumentConnection, 500);

  for (const eventName of ["input", "select", "keyup", "mouseup", "click", "focus"] as const) {
    body.addEventListener(eventName, () => {
      sendPresence();
      window.requestAnimationFrame(renderParticipants);
    });
  }
  body.addEventListener("blur", sendPresence);
  body.addEventListener("scroll", renderParticipants, { passive: true });
  window.addEventListener("resize", renderParticipants, { passive: true });

  syncDocumentConnection();

  document.addEventListener(
    "astro:before-swap",
    () => {
      destroyed = true;
      observer.disconnect();
      window.clearInterval(interval);
      window.clearTimeout(reconnectTimer);
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
