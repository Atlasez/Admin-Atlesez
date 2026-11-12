import {
  phaseLabels,
  profileFields,
  recruitmentLabels,
  seminarFields,
  seminarNumber,
} from "../../lib/seminar-fields";
import {
  api,
  errorMessage,
  html,
  post,
  urlFor,
  type CatalogItem,
  type SeminarSession,
} from "./shared";

const textareaFields = new Set([
  "affiliation",
  "clubs",
  "purpose",
  "description",
  "goals",
  "method",
  "materials",
  "prerequisites",
  "conditions",
  "remarks",
]);

function profileControl(field: (typeof profileFields)[number]) {
  const required = "required" in field && field.required;
  const inputType = field.key === "birthday" ? "date" : "text";
  const choices =
    field.key === "affiliationType"
      ? [
          "大学等（大学、大学院、短期大学、高等専門学校、専門学校）",
          "高等学校",
          "中学校",
          "中等教育学校",
          "浪人生",
          "社会人",
          "無職",
        ]
      : field.key === "discovery"
        ? [
            "SNSを見て",
            "Atlasezホームページを見て",
            "学習サイトを見て",
            "Atlasezが実施したイベントに参加して",
            "友達に紹介されて",
            "その他",
          ]
        : [];
  const hint =
    field.key === "registration"
      ? "旧サイトの参加番号をお持ちの場合に入力してください。"
      : field.key === "affiliation"
        ? "所属先は正式名称で入力してください。"
        : field.key === "clubs"
          ? "参加している団体がなければ空欄で構いません。"
          : "";
  const control = choices.length
    ? `<select id="profile-${field.key}" name="${field.key}" ${required ? "required" : ""}><option value="">選択してください</option>${choices.map((choice) => `<option value="${html(choice)}">${html(choice)}</option>`).join("")}</select>`
    : textareaFields.has(field.key)
      ? `<textarea id="profile-${field.key}" name="${field.key}" maxlength="${field.limit}" rows="3" ${required ? "required" : ""}></textarea>`
      : `<input id="profile-${field.key}" name="${field.key}" type="${inputType}" maxlength="${field.limit}" ${required ? "required" : ""} />`;
  return `<label for="profile-${field.key}">${html(field.label)}${required ? "（必須）" : "（任意）"}${control}${hint ? `<span class="seminar-muted">${html(hint)}</span>` : ""}</label>`;
}

function profileSection(email: string) {
  return `<fieldset>
    <legend>基本情報</legend>
    <p>連絡用メールアドレス：<strong>${html(email || "Googleアカウント")}</strong></p>
    <p class="seminar-muted">Googleログインで本人確認を行います。旧サイトでの参加登録は不要です。個人情報は本人確認とゼミの参加・企画管理に限って使用します。</p>
    <div class="seminar-form-grid">${profileFields.map(profileControl).join("")}</div>
  </fieldset>`;
}

function options(values: Record<string, string>, selected: string) {
  return Object.entries(values)
    .filter(([value]) => value !== "unknown")
    .map(
      ([value, label]) =>
        `<option value="${value}" ${value === selected ? "selected" : ""}>${html(label)}</option>`,
    )
    .join("");
}

function seminarDetailFields() {
  return seminarFields
    .map((field) => {
      const { key, label, limit } = field;
      const required = !("optional" in field);
      const control = textareaFields.has(key)
        ? `<textarea id="detail-${key}" name="${key}" maxlength="${limit}" rows="4" ${required ? "required" : ""}></textarea>`
        : `<input id="detail-${key}" name="${key}" maxlength="${limit}" ${required ? "required" : ""} />`;
      return `<label class="${["description", "purpose", "goals", "method", "materials", "prerequisites", "conditions", "remarks"].includes(key) ? "seminar-full" : ""}" for="detail-${key}">${html(label)}${required ? "（必須）" : "（任意）"}${control}</label>`;
    })
    .join("");
}

function enumField(
  id: string,
  name: string,
  label: string,
  values: Record<string, string>,
  selected: string,
) {
  return `<label for="${id}">${label}<select id="${id}" name="${name}" required>${options(values, selected)}</select></label>`;
}

function submitHandler(
  form: HTMLFormElement,
  save: (fields: FormData) => Promise<void>,
) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (form.dataset.sending) return;
    const status = form.querySelector<HTMLElement>("[data-form-message]");
    const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
    form.dataset.sending = "true";
    if (status) status.textContent = "送信中…";
    if (button) button.disabled = true;
    try {
      await save(new FormData(form));
    } catch (error) {
      if (status) status.textContent = errorMessage(error);
    } finally {
      delete form.dataset.sending;
      if (button) button.disabled = false;
    }
  });
}

function proposalForm(email: string) {
  const submissionKey = crypto.randomUUID();
  return `<form class="seminar-form" data-proposal-form>
    ${profileSection(email)}
    <fieldset>
      <legend>企画内容 1</legend>
      <div class="seminar-form-grid">
        <label for="proposal-title" class="seminar-full">ゼミ名（必須）<input id="proposal-title" name="title" maxlength="160" required /></label>
        ${enumField("proposal-recruitment", "recruitment", "募集状況", recruitmentLabels, "open")}
        ${enumField("proposal-phase", "phase", "実施状況", phaseLabels, "planned")}
        ${seminarDetailFields()}
      </div>
    </fieldset>
    <fieldset>
      <legend>企画内容 2</legend>
      <label for="operations-note">プラットフォーム運営への連絡（任意・非公開）<textarea id="operations-note" name="operationsNote" maxlength="2000" rows="4"></textarea></label>
    </fieldset>
    <input type="hidden" name="submissionKey" value="${submissionKey}" />
    <div class="seminar-actions"><button class="button" type="submit">企画を送信する</button><p role="status" data-form-message></p></div>
    <p class="seminar-muted">送信後、運営が内容を確認します。承認後はゼミ一覧に公開され、企画状況は参加者ページで確認できます。</p>
  </form>`;
}

export function renderProposalForm(
  content: HTMLElement,
  session: SeminarSession,
) {
  content.innerHTML = proposalForm(session.email ?? "");
  const form = content.querySelector<HTMLFormElement>("[data-proposal-form]");
  if (!form) return;
  submitHandler(form, async (fields) => {
    const result = await post<{ number: number }>(
      "/proposals",
      Object.fromEntries(fields.entries()),
    );
    content.innerHTML = `<section class="seminar-block" role="status"><h2>企画を受け付けました</h2><p>ゼミ番号 ${seminarNumber(result.number)} の企画を運営へ送りました。承認後、一般用ページに公開されます。</p><p><a class="button" href="/seminars/member/">参加者ページで状態を確認する</a></p><p><a href="/seminars/">ゼミ一覧へ戻る</a></p></section>`;
  });
}

function joinForm(email: string, item: CatalogItem) {
  return `<section class="seminar-entry">
    <h2>${html(item.title)}</h2>
    <p class="seminar-meta">ゼミ番号 ${seminarNumber(item.number)}</p>
    <p><a href="${urlFor("detail", item.number)}">ゼミの詳細を確認する</a></p>
  </section>
  <form class="seminar-form" data-join-form>
    ${profileSection(email)}
    <fieldset>
      <legend>参加内容</legend>
      <label for="host-note">ゼミ主催者へ伝えたいこと・聞きたいこと（任意）<textarea id="host-note" name="hostNote" maxlength="2000" rows="4"></textarea></label>
      <label for="join-operations-note">プラットフォーム運営への連絡（任意・非公開）<textarea id="join-operations-note" name="operationsNote" maxlength="2000" rows="4"></textarea></label>
    </fieldset>
    <div class="seminar-actions"><button class="button" type="submit">参加を申請する</button><p role="status" data-form-message></p></div>
    <p class="seminar-muted">申請は主催者へ送られます。承認後に参加者ページを利用できます。回答には時間がかかる場合があります。</p>
  </form>`;
}

export async function renderJoinForm(
  content: HTMLElement,
  session: SeminarSession,
) {
  const value = new URLSearchParams(location.search).get("number") ?? "";
  if (!/^\d{1,10}$/.test(value))
    throw new Error("参加するゼミ番号を確認してください。");
  const number = Number(value);
  const item = await api<CatalogItem>(`/${number}`);
  if (!item.acceptingApplications) {
    content.innerHTML = `<section class="seminar-block"><h2>現在、参加申請を受け付けていません</h2><p><a href="${urlFor("detail", number)}">${html(item.title)}の詳細へ戻る</a></p></section>`;
    return;
  }
  try {
    const dashboard = await api<{
      memberships: { number: number; title: string }[];
      applications: { number: number; title: string; status: string }[];
    }>("/dashboard");
    const membership = dashboard.memberships.find(
      (row) => row.number === number,
    );
    if (membership) {
      content.innerHTML = `<section class="seminar-block"><h2>すでに参加しています</h2><p>${html(item.title)}の活動ページから予定や資料を確認できます。</p><p><a class="button" href="${urlFor("workspace", number)}">参加者用ページを開く</a></p></section>`;
      return;
    }
    const application = dashboard.applications.find(
      (row) => row.number === number && row.status === "pending",
    );
    if (application) {
      content.innerHTML = `<section class="seminar-block"><h2>参加申請は確認中です</h2><p>${html(item.title)}の主催者からの連絡をお待ちください。</p><p><a class="button button-secondary" href="/seminars/member/">参加者ページで状況を見る</a></p></section>`;
      return;
    }
  } catch {
    // フォームの送信時に、サーバー側でも参加資格と重複を確認する。
  }
  content.innerHTML = joinForm(session.email ?? "", item);
  const form = content.querySelector<HTMLFormElement>("[data-join-form]");
  if (!form) return;
  submitHandler(form, async (fields) => {
    await post(`/${number}/join`, Object.fromEntries(fields.entries()));
    content.innerHTML = `<section class="seminar-block" role="status"><h2>参加申請を受け付けました</h2><p>${html(item.title)}の主催者へ申請を送りました。承認後、参加者ページから活動に参加できます。</p><p><a class="button" href="/seminars/member/">参加者ページで状態を確認する</a></p></section>`;
  });
}
