import {
  phaseLabels,
  profileFields,
  recruitmentLabels,
  seminarFields,
  seminarNumber,
} from "../../lib/seminar-fields";

export type CatalogItem = {
  number: number;
  title: string;
  details: Record<string, string>;
  recruitment: keyof typeof recruitmentLabels;
  phase: keyof typeof phaseLabels;
  acceptingApplications: boolean;
  sourceUrl: string | null;
};

export type RequestStatus = "pending" | "approved" | "rejected";
export type Proposal = CatalogItem & {
  status: RequestStatus;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string;
};

export const statusLabels = {
  pending: "審査待ち",
  approved: "承認済み",
  rejected: "見送り",
};

export const html = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => {
    const escapes: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return escapes[character];
  });

export const urlFor = (page: string, number: number) =>
  `/seminars/${page}/?number=${number}`;

export const loginUrl = () =>
  `/auth/google/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`;

export const numberFromUrl = () => {
  const value = new URLSearchParams(location.search).get("number") ?? "";
  return /^\d{1,10}$/.test(value) ? Number(value) : 0;
};

export async function api<T>(path = "", init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/seminars${path}`, {
    cache: "no-store",
    ...init,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const message =
      response.status === 401
        ? "ログインが必要です。"
        : (data?.error ??
          "データを取得できませんでした。時間をおいてお試しください。");
    throw new Error(message);
  }
  return data as T;
}

export const post = (path: string, data: unknown, method = "POST") =>
  api(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });

export const publicDetails = (item: CatalogItem) =>
  `<dl class="seminar-details">${seminarFields
    .filter(({ key }) => key !== "remarks" || item.details[key])
    .map(
      ({ key, label }) =>
        `<div class="${["description", "purpose", "goals", "method"].includes(key) ? "seminar-full" : ""}"><dt>${label}</dt><dd>${html(item.details[key] || "掲載情報なし")}</dd></div>`,
    )
    .join("")}</dl>`;

export const privateProfile = (
  profile: Record<string, string>,
  email: string,
) =>
  `<dl class="seminar-details"><div><dt>メールアドレス</dt><dd>${html(email)}</dd></div>${profileFields
    .filter(({ key }) => profile[key])
    .map(
      ({ key, label }) =>
        `<div><dt>${label}</dt><dd>${html(profile[key])}</dd></div>`,
    )
    .join("")}</dl>`;

export const empty = (message: string) =>
  `<p class="seminar-muted">${html(message)}</p>`;

export const section = (
  id: string,
  title: string,
  content: string,
  fallback: string,
) =>
  `<section class="seminar-block" id="${id}" aria-labelledby="${id}-heading"><h2 id="${id}-heading">${title}</h2><div class="seminar-stack">${content || empty(fallback)}</div></section>`;

export const detailLink = (item: Pick<CatalogItem, "number" | "title">) =>
  `<a href="${urlFor("detail", item.number)}">${html(item.title)}</a> <span class="seminar-number">No. ${seminarNumber(item.number)}</span>`;

export const workspaceLink = (
  item: Pick<CatalogItem, "number" | "title">,
  hash = "",
) =>
  `<a href="${urlFor("workspace", item.number)}${hash}">${html(item.title)}</a>`;

export const dateLabel = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("ja-JP", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Tokyo",
      }).format(new Date(value))
    : "";

export const selects = (values: Record<string, string>, selected: string) =>
  Object.entries(values)
    .filter(([key]) => key !== "unknown" || key === selected)
    .map(
      ([key, value]) =>
        `<option value="${key}" ${key === selected ? "selected" : ""} ${key === "unknown" ? "disabled" : ""}>${html(value)}</option>`,
    )
    .join("");

export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "処理できませんでした。時間をおいてお試しください。";

export function bindForm(
  form: HTMLFormElement,
  submit: (data: FormData, button: HTMLElement | null) => Promise<unknown>,
) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (form.dataset.sending) return;
    const status = form.querySelector<HTMLElement>("[data-form-message]");
    const buttons = [...form.querySelectorAll<HTMLButtonElement>("button")];
    form.dataset.sending = "true";
    if (status) status.textContent = "送信中…";
    buttons.forEach((button) => {
      button.disabled = true;
    });
    try {
      await submit(new FormData(form), event.submitter);
      if (status) status.textContent = "保存しました。";
    } catch (error) {
      if (status) status.textContent = errorMessage(error);
    } finally {
      delete form.dataset.sending;
      buttons.forEach((button) => {
        button.disabled = false;
      });
    }
  });
}

export const decisions = () => `
  <label>申請者へのメッセージ <textarea name="note" maxlength="2000" rows="2"></textarea></label>
  <div class="seminar-actions">
    <button class="seminar-button" type="submit" value="approved">承認する</button>
    <button class="seminar-button danger" type="submit" value="rejected">見送る</button>
    <p role="status" data-form-message></p>
  </div>`;
