import {
  phaseLabels,
  recruitmentLabels,
  seminarNumber,
} from "../../lib/seminar-fields";
import { createAdminLoadRetry } from "../admin-load-retry";
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
  statusLabels,
  urlFor,
  type Proposal,
} from "./shared";

type ReviewProposal = Proposal & {
  profile: Record<string, string>;
  email: string;
  operationsNote: string;
};

type Operations = {
  proposals: ReviewProposal[];
  imports: { number: number; title: string }[];
  feedback: {
    number: number;
    title: string;
    operations_note: string;
    email: string;
    created_at: string;
  }[];
};

const empty = (message: string) =>
  `<p class="seminar-review-empty seminar-muted">${html(message)}</p>`;

function proposalEntry(item: ReviewProposal, open: boolean) {
  return `<details class="seminar-review-entry" name="seminar-proposals" ${open ? "open" : ""}>
    <summary>${html(item.title)} ・ <span class="seminar-review-state" data-state="${item.status}">${statusLabels[item.status]}</span></summary>
    <div class="seminar-review-body">
      <p class="seminar-meta">ゼミ番号 ${seminarNumber(item.number)} ・ 申請日 ${dateLabel(item.createdAt)}</p>
      ${item.status === "approved" ? `<p><a href="${urlFor("detail", item.number)}">公開ページを見る</a></p>` : ""}
      <section><h3>企画者情報</h3>${privateProfile(item.profile, item.email)}</section>
      ${item.operationsNote ? `<section><h3>運営への連絡</h3><p class="seminar-prewrap">${html(item.operationsNote)}</p></section>` : ""}
      <section>
        <h3>公開内容</h3>
        <p class="seminar-meta">${recruitmentLabels[item.recruitment]} ・ ${phaseLabels[item.phase]}</p>
        ${publicDetails(item)}
      </section>
      ${
        item.status === "pending"
          ? `<form data-review="${item.number}">${decisions()}</form>`
          : item.decisionNote
            ? `<section><h3>申請者への連絡</h3><p class="seminar-prewrap">${html(item.decisionNote)}</p></section>`
            : ""
      }
    </div>
  </details>`;
}

export function initializeSeminarReview() {
  const root = document.querySelector<HTMLElement>("[data-seminar-review]");
  if (!root || root.dataset.initialized) return;
  const content = root.querySelector<HTMLElement>("[data-review-content]");
  const proposals = root.querySelector<HTMLElement>("[data-review-proposals]");
  const legacy = root.querySelector<HTMLElement>("[data-review-legacy]");
  const feedback = root.querySelector<HTMLElement>("[data-review-feedback]");
  const filter = root.querySelector<HTMLSelectElement>("[data-review-status]");
  const count = root.querySelector<HTMLElement>("[data-review-count]");
  const message = root.querySelector<HTMLElement>("[data-operation-status]");
  if (
    !content ||
    !proposals ||
    !legacy ||
    !feedback ||
    !filter ||
    !count ||
    !message
  )
    return;
  root.dataset.initialized = "true";
  let data: Operations;

  const renderProposals = () => {
    const rows = data.proposals.filter(
      (item) => !filter.value || item.status === filter.value,
    );
    const firstPending = rows.find((item) => item.status === "pending");
    count.textContent = `審査待ち ${data.proposals.filter((item) => item.status === "pending").length}件`;
    proposals.innerHTML =
      rows.map((item) => proposalEntry(item, item === firstPending)).join("") ||
      empty(
        filter.value
          ? "この状態の企画申請はありません。"
          : "企画申請はありません。",
      );
    proposals
      .querySelectorAll<HTMLFormElement>("form[data-review]")
      .forEach((form) =>
        bindForm(form, async (fields, button) => {
          const decision =
            button instanceof HTMLButtonElement ? button.value : "";
          await post(`/${form.dataset.review}/review`, {
            decision,
            note: fields.get("note"),
          });
          await refresh(
            decision === "approved"
              ? "企画を承認し、公開しました。"
              : "企画を見送りました。",
          );
        }),
      );
  };

  const load = async () => {
    retry.begin();
    data = await api<Operations>("/operations");
    renderProposals();
    legacy.innerHTML = data.imports.length
      ? `<p class="seminar-muted">本人確認を済ませ、主催者がログインに使ったメールアドレスを登録してください。</p>
        ${data.imports
          .map(
            (
              item,
            ) => `<details class="seminar-review-entry" name="seminar-hosts">
          <summary>${seminarNumber(item.number)} ${html(item.title)}</summary>
          <div class="seminar-review-body">
            <p><a href="${urlFor("detail", item.number)}">公開ページを見る</a></p>
            <form class="seminar-inline-form" data-host="${item.number}">
              <label>主催者のメールアドレス <input name="email" type="email" required maxlength="254" /></label>
              <button class="button" type="submit">主催者を登録</button><p role="status" data-form-message></p>
            </form>
          </div>
        </details>`,
          )
          .join("")}`
      : empty("主催者未登録のゼミはありません。");
    legacy
      .querySelectorAll<HTMLFormElement>("form[data-host]")
      .forEach((form) =>
        bindForm(form, async (fields) => {
          await post(`/${form.dataset.host}/host`, {
            email: fields.get("email"),
          });
          await refresh("主催者を登録しました。");
        }),
      );
    feedback.innerHTML =
      data.feedback
        .map(
          (item) => `<article class="seminar-review-entry seminar-review-body">
      <h3>${detailLink(item)}</h3>
      <p class="seminar-meta">${dateLabel(item.created_at)} ・ ${html(item.email)}</p>
      <p class="seminar-prewrap">${html(item.operations_note)}</p>
    </article>`,
        )
        .join("") || empty("連絡はありません。");
    content.hidden = false;
    retry.success();
  };
  const retry = createAdminLoadRetry(
    root,
    load,
    "ゼミの企画申請を読み込めませんでした。",
  );
  const refresh = async (text: string) => {
    message.textContent = text;
    message.focus({ preventScroll: true });
    await load().catch(retry.fail);
  };
  filter.addEventListener("change", renderProposals);
  void load().catch(retry.fail);
}
