type RetryRoot = ParentNode;

export type AdminLoadState = "loading" | "ready" | "error" | "empty";

const messageFor = (error: unknown, fallback: string) =>
  error instanceof Error && error.message.trim() ? error.message : fallback;

export const createAdminLoadRetry = (
  root: RetryRoot,
  load: () => Promise<unknown>,
  fallback: string,
  options: { scope?: string } = {},
) => {
  const noticeSelector = options.scope
    ? `[data-admin-load-error][data-admin-load-error-scope="${options.scope}"]`
    : "[data-admin-load-error]";
  const notice = root.querySelector<HTMLElement>(noticeSelector);
  const message = notice?.querySelector<HTMLElement>(
    "[data-admin-load-error-message]",
  );
  const button = notice?.querySelector<HTMLButtonElement>("[data-admin-retry]");
  const surface: Element =
    notice?.closest<HTMLElement>("[data-admin-load-surface]") ??
    root.querySelector<HTMLElement>("[data-admin-load-surface]") ??
    notice?.parentElement ??
    (root as Element);
  const stateElement = surface;
  const skeletons = stateElement.querySelectorAll<HTMLElement>(
    "[data-admin-load-skeleton]",
  );
  let retrying = false;

  const setState = (state: AdminLoadState) => {
    surface.setAttribute("data-admin-load-state", state);
    surface.setAttribute("aria-busy", String(state === "loading"));
    skeletons.forEach((skeleton) => {
      skeleton.hidden = state !== "loading";
    });
  };

  if (!notice || !message || !button) {
    return {
      begin: () => undefined,
      success: () => undefined,
      fail: (_error: unknown) => undefined,
      empty: () => undefined,
      setState: (_state: AdminLoadState) => undefined,
    };
  }

  const begin = () => {
    notice.hidden = true;
    button.disabled = true;
    setState("loading");
  };
  const success = () => {
    notice.hidden = true;
    button.disabled = false;
    setState("ready");
    retrying = false;
  };
  const fail = (error: unknown) => {
    message.textContent = messageFor(error, fallback);
    notice.hidden = false;
    button.disabled = false;
    setState("error");
    retrying = false;
  };

  const empty = (emptyMessage = "表示できるデータはありません。") => {
    setState("empty");
    const target = surface.querySelector<HTMLElement>(
      "[data-admin-empty-state]",
    );
    if (target) {
      target.textContent = emptyMessage;
      target.hidden = false;
    }
  };

  button.addEventListener("click", () => {
    if (retrying) return;
    retrying = true;
    button.disabled = true;
    setState("loading");
    message.textContent = "再試行中…";
    void load().catch(fail);
  });

  begin();
  return { begin, success, fail, empty, setState };
};
