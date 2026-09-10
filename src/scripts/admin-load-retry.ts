type RetryRoot = ParentNode;

const messageFor = (error: unknown, fallback: string) =>
  error instanceof Error && error.message.trim() ? error.message : fallback;

export const createAdminLoadRetry = (
  root: RetryRoot,
  load: () => Promise<unknown>,
  fallback: string,
) => {
  const notice = root.querySelector<HTMLElement>("[data-admin-load-error]");
  const message = root.querySelector<HTMLElement>(
    "[data-admin-load-error-message]",
  );
  const button = root.querySelector<HTMLButtonElement>("[data-admin-retry]");
  const surface: Element =
    root.querySelector<HTMLElement>("[data-admin-load-surface]") ??
    notice?.parentElement ??
    (root as Element);
  let retrying = false;

  if (!notice || !message || !button) {
    return {
      begin: () => undefined,
      success: () => undefined,
      fail: (_error: unknown) => undefined,
    };
  }

  const begin = () => {
    notice.hidden = true;
    button.disabled = true;
    surface.setAttribute("aria-busy", "true");
  };
  const success = () => {
    notice.hidden = true;
    button.disabled = false;
    surface.setAttribute("aria-busy", "false");
    retrying = false;
  };
  const fail = (error: unknown) => {
    message.textContent = messageFor(error, fallback);
    notice.hidden = false;
    button.disabled = false;
    surface.setAttribute("aria-busy", "false");
    retrying = false;
  };

  button.addEventListener("click", () => {
    if (retrying) return;
    retrying = true;
    button.disabled = true;
    surface.setAttribute("aria-busy", "true");
    message.textContent = "再試行中…";
    void load().catch(fail);
  });

  begin();
  return { begin, success, fail };
};
