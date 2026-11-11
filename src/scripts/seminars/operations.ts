import { seminarNumber } from "../../lib/seminar-fields";
import {
  api,
  bindForm,
  dateLabel,
  decisions,
  detailLink,
  html,
  post,
  privateProfile,
  publicDetails,
  section,
  statusLabels,
  type Proposal,
} from "./shared";

type Operations = {
  proposals: (Proposal & {
    profile: Record<string, string>;
    email: string;
    operationsNote: string;
  })[];
  imports: { number: number; title: string }[];
  feedback: {
    number: number;
    title: string;
    operations_note: string;
    email: string;
    created_at: string;
  }[];
};

export async function renderOperations(content: HTMLElement) {
  const { proposals, imports, feedback } = await api<Operations>("/operations");
  content.innerHTML =
    `<p role="status" data-operation-status tabindex="-1"></p>` +
    section(
      "proposals",
      "企画申請",
      proposals
        .map(
          (item) => `
      <details class="seminar-panel" ${item.status === "pending" ? "open" : ""}>
        <summary>No. ${seminarNumber(item.number)} ${html(item.title)} ・ ${statusLabels[item.status]}</summary>
        <p class="seminar-muted">申請日 ${dateLabel(item.createdAt)}</p>
        ${item.status === "approved" ? `<p>${detailLink({ ...item, title: "公開ページを開く" })}</p>` : ""}
        <h3>企画者情報</h3>${privateProfile(item.profile, item.email)}
        ${item.operationsNote ? `<h3>運営への連絡</h3><p class="seminar-prewrap">${html(item.operationsNote)}</p>` : ""}
        <h3>公開内容</h3>${publicDetails(item)}
        ${
          item.status === "pending"
            ? `<form data-review="${item.number}">${decisions()}</form>`
            : item.decisionNote
              ? `<p class="seminar-prewrap">${html(item.decisionNote)}</p>`
              : ""
        }
      </details>`,
        )
        .join(""),
      "企画申請はありません。",
    ) +
    section(
      "legacy",
      "旧サイト掲載ゼミの主催者登録",
      imports.length
        ? `
      <p>主催者の本人確認後、ログイン済みのアカウントのメールアドレスを登録してください。募集中のゼミは登録後に参加申請を受け付けます。</p>
      ${imports
        .map(
          (item) => `<details class="seminar-panel">
        <summary>No. ${seminarNumber(item.number)} ${html(item.title)}</summary>
        <p>${detailLink({ ...item, title: "公開ページを開く" })}</p>
        <form class="seminar-inline-form" data-host="${item.number}">
          <label>主催者のアカウント <input name="email" type="email" required maxlength="254" /></label>
          <button class="seminar-button" type="submit">主催者を登録</button><p role="status" data-form-message></p>
        </form>
      </details>`,
        )
        .join("")}`
        : "",
      "主催者未登録のゼミはありません。",
    ) +
    section(
      "feedback",
      "参加申請から運営への連絡",
      feedback
        .map(
          (item) => `
      <article class="seminar-panel"><h3>${detailLink(item)}</h3>
        <p class="seminar-muted">${dateLabel(item.created_at)} ・ ${html(item.email)}</p>
        <p class="seminar-prewrap">${html(item.operations_note)}</p>
      </article>`,
        )
        .join(""),
      "連絡はありません。",
    );

  const refresh = async () => {
    await renderOperations(content);
    const status = content.querySelector<HTMLElement>(
      "[data-operation-status]",
    );
    if (status) {
      status.textContent = "保存しました。";
      status.focus({ preventScroll: true });
    }
  };
  content
    .querySelectorAll<HTMLFormElement>("form[data-review]")
    .forEach((form) =>
      bindForm(form, async (fields, button) => {
        await post(`/${form.dataset.review}/review`, {
          decision: button instanceof HTMLButtonElement ? button.value : "",
          note: fields.get("note"),
        });
        await refresh();
      }),
    );
  content.querySelectorAll<HTMLFormElement>("form[data-host]").forEach((form) =>
    bindForm(form, async (fields) => {
      await post(`/${form.dataset.host}/host`, { email: fields.get("email") });
      await refresh();
    }),
  );
}
