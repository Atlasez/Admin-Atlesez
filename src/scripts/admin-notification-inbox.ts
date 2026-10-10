import { adminMutation, withAdminButtonLock } from "./admin-mutation";
import {
  notificationKinds,
  importantKinds,
  type NotificationPreferences,
} from "../lib/admin-notification-features";

import { createAdminLoadRetry } from "./admin-load-retry";

type Notification = {
  id: string;
  kind?: string;
  title: string;
  detail: string;
  href: string;
  updatedAt?: string;
  read: boolean;
  importance?: "important" | "normal";
};
type ResponseData = {
  notifications?: Notification[];
  preferences?: NotificationPreferences;
  notificationsTruncated?: boolean;
  nextCursor?: string | null;
  legacyReminderNormalizationPending?: boolean;
  legacyReminderNormalizationFailed?: boolean;
};

const initNotificationInbox = () => {
  const root = document.querySelector<HTMLElement>("[data-notification-inbox]");
  if (!root || root.dataset.initialized === "true") return;
  root.dataset.initialized = "true";
  const list = root.querySelector<HTMLElement>("[data-notification-list]")!;
  const unreadCount = root.querySelector<HTMLElement>("[data-unread-count]")!;
  const visibleCount = root.querySelector<HTMLElement>("[data-visible-count]")!;
  const pagination = root.querySelector<HTMLElement>(
    "[data-notification-pagination]",
  )!;
  const paginationSummary = root.querySelector<HTMLElement>(
    "[data-pagination-summary]",
  )!;
  const loadMore = root.querySelector<HTMLButtonElement>("[data-load-more]")!;
  const truncation = root.querySelector<HTMLElement>(
    "[data-notification-truncation]",
  )!;
  const legacyReminderStatus = root.querySelector<HTMLElement>(
    "[data-legacy-reminder-status]",
  )!;
  const legacyReminderFailed = root.querySelector<HTMLElement>(
    "[data-legacy-reminder-failed]",
  )!;
  const markAll = root.querySelector<HTMLButtonElement>(
    "[data-mark-all-notifications-read]",
  )!;
  const escape = (value: unknown) =>
    String(value ?? "").replace(
      /[&<>\"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character] ?? character,
    );
  const labels: Record<string, string> = {
    comment: "コメント",
    mention: "メンション",
    review: "フィードバック依頼",
    "feedback-request": "フィードバック依頼",
    "task-request": "タスク依頼",
    application: "応募",
    approved: "フィードバック完了",
    published: "公開",
    "publication-ready": "公開準備完了",
    "publication-review": "公開審査",
    "publication-review-returned": "公開審査から差し戻し",
    "task-reminder": "リマインダー",
  };
  const formatTime = (value?: string) => {
    if (!value || Number.isNaN(new Date(value).getTime())) return "";
    return new Intl.DateTimeFormat("ja-JP", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  };
  const safeHref = (value: string) => {
    try {
      const url = new URL(value, location.origin);
      return url.origin === location.origin &&
        url.pathname.startsWith("/admin/")
        ? `${url.pathname}${url.search}${url.hash}`
        : "/admin/notifications/";
    } catch {
      return "/admin/notifications/";
    }
  };
  let rows: Notification[] = [];
  let unreadTotal = 0;
  let notificationsTruncated = false;
  let legacyReminderNormalizationPending = false;
  let legacyReminderNormalizationFailed = false;
  let nextCursor: string | null = null;
  let requestGeneration = 0;
  let filter: "all" | "unread" | "important" | "snoozed" = "all";
  let preferences: NotificationPreferences = {
    available: false,
    mutedKinds: [],
    summaryEnabled: true,
  };
  const summary = root.querySelector<HTMLElement>(
    "[data-notification-digest]",
  )!;
  const settings = root.querySelector<HTMLFormElement>(
    "[data-notification-settings]",
  )!;
  const settingsMessage = root.querySelector<HTMLOutputElement>(
    "[data-notification-settings-message]",
  )!;
  settings.querySelector<HTMLElement>("[data-notification-kinds]")!.innerHTML =
    notificationKinds
      .map(
        (kind) =>
          `<label><input type="checkbox" name="kind" value="${kind}" checked /> ${labels[kind]}</label>`,
      )
      .join("");

  const render = () => {
    const visible = rows;
    const groups = new Map<string, { total: number; unread: number }>();
    for (const row of rows) {
      const key = labels[row.kind ?? ""] ?? "通知";
      const group = groups.get(key) ?? { total: 0, unread: 0 };
      group.total++;
      if (!row.read) group.unread++;
      groups.set(key, group);
    }
    summary.hidden = !preferences.summaryEnabled || !rows.length;
    summary.innerHTML = `<h3>表示中の通知の要約</h3><ul>${[...groups].map(([label, count]) => `<li>${escape(label)}: ${count.total}件（未読${count.unread}件）</li>`).join("")}</ul>`;
    settings.querySelector<HTMLInputElement>(
      '[name="summaryEnabled"]',
    )!.checked = preferences.summaryEnabled;
    settings
      .querySelectorAll<HTMLInputElement>('[name="kind"]')
      .forEach((input) => {
        input.checked = !preferences.mutedKinds.includes(input.value);
      });
    settings.querySelector<HTMLFieldSetElement>("fieldset")!.disabled =
      !preferences.available;

    unreadCount.textContent = `${unreadTotal}${notificationsTruncated && unreadTotal ? "+" : ""}`;
    visibleCount.textContent = `${rows.length}${notificationsTruncated ? "+" : ""}件を表示`;
    markAll.hidden = unreadTotal === 0 && !notificationsTruncated;
    markAll.disabled = legacyReminderNormalizationPending;
    legacyReminderStatus.hidden = !legacyReminderNormalizationPending;
    legacyReminderFailed.hidden = !legacyReminderNormalizationFailed;
    root
      .querySelectorAll<HTMLButtonElement>("[data-notification-filter]")
      .forEach((button) => {
        const active = button.dataset.notificationFilter === filter;
        button.setAttribute("aria-pressed", String(active));
      });
    if (!visible.length) {
      list.innerHTML = "";
      retry.empty(
        filter === "unread"
          ? "未読の通知はありません。"
          : "通知はまだありません。",
      );
    } else {
      list.innerHTML = visible
        .map(
          (item) => `
          <article class="notification-row${item.read ? " is-read" : " is-unread"}">
            <div class="notification-row-main">
              <div class="notification-row-meta"><span>${escape(labels[item.kind ?? ""] ?? "通知")}</span>${(item.importance ?? (importantKinds.has(item.kind ?? "") ? "important" : "normal")) === "important" ? "<strong>要対応</strong>" : ""}${item.updatedAt ? `<time datetime="${escape(item.updatedAt)}">${escape(formatTime(item.updatedAt))}</time>` : ""}</div>
              <a class="notification-title" href="${escape(safeHref(item.href))}" data-notification-open="${escape(item.id)}">${escape(item.title)}</a>
              <p>${escape(item.detail)}</p>
            </div>
            <div class="notification-row-state">${item.read ? "既読" : `<button type="button" data-notification-read="${escape(item.id)}">既読にする</button>`}${preferences.available ? `<button type="button" data-notification-snooze="${escape(item.id)}">${filter === "snoozed" ? "再表示する" : "1時間後に再表示"}</button>` : ""}</div>
          </article>`,
        )
        .join("");
      retry.success();
    }
    truncation.hidden = !notificationsTruncated;
    truncation.textContent = "新しい通知を先に表示しています。";
    pagination.hidden = nextCursor === null;
    paginationSummary.textContent = `${rows.length}${notificationsTruncated ? "+" : ""}件`;
  };

  const load = async (append = false) => {
    if (!append) retry.begin();
    const generation = append ? requestGeneration : ++requestGeneration;
    const requestFilter = filter;
    const cursor = append ? nextCursor : null;
    if (append && cursor === null) return;
    let response: Response;
    try {
      const parameters = new URLSearchParams({ limit: "100" });
      if (cursor) parameters.set("cursor", cursor);
      if (requestFilter === "unread") parameters.set("unreadOnly", "true");
      if (requestFilter === "important")
        parameters.set("importance", "important");
      if (requestFilter === "snoozed") parameters.set("snoozedOnly", "true");
      response = await fetch(`/api/admin/notifications?${parameters}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
    } catch (error) {
      if (generation !== requestGeneration || requestFilter !== filter) return;
      throw error;
    }
    if (generation !== requestGeneration || requestFilter !== filter) return;
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.includes("application/json"))
      throw new Error(
        response.status === 401
          ? "ログイン状態を確認してください。"
          : "通知を読み込めませんでした。",
      );
    const data = (await response.json()) as ResponseData;
    if (generation !== requestGeneration || requestFilter !== filter) return;
    if (!Array.isArray(data.notifications))
      throw new Error("通知の形式を確認できませんでした。");
    preferences = data.preferences ?? preferences;
    const incoming = data.notifications;
    rows = append ? [...rows, ...incoming] : incoming;
    unreadTotal = rows.filter((item) => !item.read).length;
    notificationsTruncated = data.notificationsTruncated === true;
    nextCursor = typeof data.nextCursor === "string" ? data.nextCursor : null;
    legacyReminderNormalizationPending =
      data.legacyReminderNormalizationPending === true;
    legacyReminderNormalizationFailed =
      data.legacyReminderNormalizationFailed === true;
    render();
  };
  const retry = createAdminLoadRetry(
    root,
    () => load(),
    "通知を読み込めませんでした。",
    { scope: "notification-inbox" },
  );

  const setRead = async (ids: string[] = [], all = false) => {
    let cursor: string | null = null;
    do {
      const response = await fetch("/api/admin/notifications/read", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          all ? { all: true, ...(cursor ? { cursor } : {}) } : { ids },
        ),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: unknown;
        } | null;
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "通知を既読にできませんでした。",
        );
      }
      if (all) {
        const data = (await response.json()) as { nextCursor?: unknown };
        const nextCursor =
          typeof data.nextCursor === "string" ? data.nextCursor : null;
        if (nextCursor && nextCursor === cursor)
          throw new Error("通知の一括既読処理を続行できませんでした。");
        cursor = nextCursor;
      }
    } while (all && cursor);
    await load();
  };

  root
    .querySelectorAll<HTMLButtonElement>("[data-notification-filter]")
    .forEach((button) =>
      button.addEventListener("click", () => {
        const selected = button.dataset.notificationFilter;
        const nextFilter =
          selected === "unread" ||
          selected === "important" ||
          selected === "snoozed"
            ? selected
            : "all";
        if (nextFilter === filter) return;
        filter = nextFilter;
        requestGeneration += 1;
        rows = [];
        nextCursor = null;
        void load().catch((error) => retry.fail(error));
      }),
    );
  settings.addEventListener("submit", (event) => {
    event.preventDefault();
    const button =
      settings.querySelector<HTMLButtonElement>('[type="submit"]')!;
    void withAdminButtonLock(button, async () => {
      const mutedKinds = [
        ...settings.querySelectorAll<HTMLInputElement>('[name="kind"]'),
      ]
        .filter((input) => !input.checked)
        .map((input) => input.value);
      await adminMutation(
        "/api/admin/notifications/preferences",
        "PUT",
        {
          mutedKinds,
          summaryEnabled: settings.querySelector<HTMLInputElement>(
            '[name="summaryEnabled"]',
          )!.checked,
        },
        "通知設定を保存できませんでした。",
      );
      await load();
      settingsMessage.value = "通知設定を保存しました。";
    }).catch((error) => {
      settingsMessage.value =
        error instanceof Error
          ? error.message
          : "通知設定を保存できませんでした。";
    });
  });
  list.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>(
      "[data-notification-snooze]",
    );
    if (!button) return;
    void withAdminButtonLock(button, async () => {
      await adminMutation(
        "/api/admin/notifications/snooze",
        "POST",
        {
          id: button.dataset.notificationSnooze,
          until:
            filter === "snoozed"
              ? null
              : new Date(Date.now() + 3600000).toISOString(),
        },
        "再表示の設定を保存できませんでした。",
      );
      await load();
    }).catch((error) => retry.fail(error));
  });
  markAll.addEventListener("click", () => {
    void setRead([], true).catch((error) => retry.fail(error));
  });
  loadMore.addEventListener("click", () => {
    loadMore.disabled = true;
    void load(true)
      .catch((error) => retry.fail(error))
      .finally(() => {
        loadMore.disabled = false;
      });
  });
  list.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>(
      "[data-notification-read]",
    );
    if (button) {
      void setRead([button.dataset.notificationRead ?? ""]).catch((error) =>
        retry.fail(error),
      );
      return;
    }
    const link = target.closest<HTMLAnchorElement>("[data-notification-open]");
    if (
      !link ||
      link.dataset.opened ||
      (event instanceof MouseEvent &&
        (event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey))
    )
      return;
    event.preventDefault();
    link.dataset.opened = "true";
    void setRead([link.dataset.notificationOpen ?? ""])
      .catch(() => undefined)
      .finally(() => {
        window.location.assign(link.href);
      });
  });
  void load().catch((error) => retry.fail(error));
};

document.addEventListener("astro:page-load", initNotificationInbox);
initNotificationInbox();
