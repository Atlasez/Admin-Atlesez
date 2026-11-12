import {
  phaseLabels,
  recruitmentLabels,
  seminarNumber,
} from "../../lib/seminar-fields";
import {
  api,
  bindForm,
  dateLabel,
  decisions,
  detailLink,
  empty,
  html,
  numberFromUrl,
  post,
  privateProfile,
  seminarApiUrl,
  section,
  selects,
  statusLabels,
  workspaceLink,
  urlFor,
  type CatalogItem,
  type Proposal,
  type RequestStatus,
} from "./shared";

type Activity = {
  id: string;
  number: number;
  seminar_title: string;
  phase: string;
  kind: "event" | "task" | "poll" | "notice";
  title: string;
  description: string;
  due_at: string | null;
  completed_at: string | null;
  options: string[];
  choice: number | null;
  assignee: string | null;
  canComplete: number;
  counts: Record<string, number>;
};
type Application = {
  number: number;
  title: string;
  status: RequestStatus;
  created_at: string;
  decided_at: string | null;
  decision_note: string;
};
type HostApplication = {
  id: string;
  applicant_id: string;
  profile: Record<string, string>;
  host_note: string;
  status: RequestStatus;
  created_at: string;
  email: string;
};
type Membership = Pick<CatalogItem, "number" | "title" | "phase"> & {
  isHost: boolean;
};
type Dashboard = {
  memberships: Membership[];
  proposals: Proposal[];
  applications: Application[];
  activities: Activity[];
};
type Material = {
  id: string;
  filename: string;
  bytes: number;
  created_at: string;
  canManage: number;
};
type Workspace = {
  seminar: CatalogItem;
  isHost: boolean;
  activities: Activity[];
  materials: Material[];
  applications: HostApplication[];
};

const kinds = {
  event: "開催予定",
  task: "準備・担当",
  poll: "日程調整",
  notice: "重要な連絡",
};
const datetime = (row: Activity) => (row.due_at ? dateLabel(row.due_at) : "");
const pollOpen = (row: Activity, now: string) =>
  !row.completed_at &&
  row.phase !== "ended" &&
  (!row.due_at || row.due_at > now);

function activityCard(
  row: Activity,
  options: { workspace: boolean; isHost?: boolean; now: string },
) {
  const { workspace, isHost, now } = options;
  const poll = row.kind === "poll";
  const voting = poll && pollOpen(row, now);
  const meta = [
    row.due_at ? `${row.kind === "event" ? "" : "期限 "}${datetime(row)}` : "",
    row.assignee ? `担当 ${row.assignee}` : "",
    row.kind === "task" && row.completed_at ? "完了" : "",
    poll
      ? voting
        ? row.choice === null
          ? "未回答"
          : "回答済み"
        : "回答締切"
      : "",
  ]
    .filter(Boolean)
    .join(" ・ ");
  return `<article class="seminar-entry" id="activity-${html(row.id)}">
    <h3>${html(row.title)}</h3>
    ${!workspace ? `<p class="seminar-muted">${workspaceLink({ number: row.number, title: row.seminar_title }, `#activity-${row.id}`)}</p>` : ""}
    ${meta ? `<p class="seminar-muted">${html(meta)}</p>` : ""}
    ${row.description ? `<p class="seminar-prewrap">${html(row.description)}</p>` : ""}
    ${workspace && poll ? `<ul class="seminar-list">${row.options.map((name, i) => `<li>${html(name)} ・ ${row.counts[i] ?? 0}票${i === row.choice ? "（自分の回答）" : ""}</li>`).join("")}</ul>` : ""}
    ${
      workspace && voting
        ? `<form class="seminar-vote" data-activity="${html(row.id)}">
      <label>日程候補 <select name="choice" required>
        <option value="">選択してください</option>
        ${row.options.map((name, i) => `<option value="${i}" ${row.choice === i ? "selected" : ""}>${html(name)}</option>`).join("")}
      </select></label>
      <button class="button" type="submit">回答を保存</button><p role="status" data-form-message></p>
    </form>`
        : ""
    }
    ${
      workspace &&
      ((row.kind === "task" &&
        row.canComplete &&
        !row.completed_at &&
        row.phase !== "ended") ||
        (voting && isHost))
        ? `<form class="seminar-actions" data-activity="${html(row.id)}">
        <button class="button button-secondary" type="submit">${poll ? "回答を締め切る" : "完了にする"}</button><p role="status" data-form-message></p>
      </form>`
        : ""
    }
  </article>`;
}

export async function renderDashboard(content: HTMLElement) {
  const { memberships, proposals, applications, activities } =
    await api<Dashboard>("/dashboard");
  const now = new Date().toISOString();
  const current = memberships.filter((item) => item.phase !== "ended");
  const past = memberships.filter((item) => item.phase === "ended");
  const upcoming = activities
    .filter(
      (row) =>
        row.kind === "event" &&
        row.due_at &&
        row.due_at >= now &&
        row.phase !== "ended",
    )
    .reverse();
  const tasks = activities.filter(
    (row) => row.kind === "task" && !row.completed_at && row.phase !== "ended",
  );
  const polls = activities.filter(
    (row) => row.kind === "poll" && row.choice === null && pollOpen(row, now),
  );
  const notices = activities.filter(
    (row) => row.kind === "notice" && row.phase !== "ended",
  );
  const previous = activities.filter(
    (row) =>
      row.phase === "ended" ||
      (row.kind === "event" && row.due_at && row.due_at < now) ||
      (row.kind === "task" && row.completed_at) ||
      (row.kind === "poll" && !pollOpen(row, now)),
  );
  const cards = (rows: Activity[]) =>
    rows.map((row) => activityCard(row, { workspace: false, now })).join("");
  const membershipCard = (item: Membership) =>
    `<article class="seminar-entry"><h3>${workspaceLink(item)}</h3><p class="seminar-muted">番号 ${seminarNumber(item.number)} ・ ${phaseLabels[item.phase]}${item.isHost ? " ・ 主催" : ""}</p></article>`;
  const statuses = [
    ...proposals.map((item) => ({
      ...item,
      kind: "企画",
      date: item.createdAt,
      note: item.decisionNote,
    })),
    ...applications.map((item) => ({
      ...item,
      kind: "参加申請",
      date: item.created_at,
      note: item.decision_note,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  content.innerHTML = [
    section(
      "memberships",
      "参加中のゼミ",
      current.map(membershipCard).join(""),
      "参加中のゼミはありません。",
    ),
    `<div class="seminar-columns">
      <div>
        ${section("upcoming", "次回予定", cards(upcoming), "予定はありません。")}
        ${section("preparation", "準備・担当", cards(tasks), "対応が必要な項目はありません。")}
      </div>
      <div>
        ${section("polls", "回答待ちの日程調整", cards(polls), "未回答の日程調整はありません。")}
        ${section("notices", "重要な連絡", cards(notices), "重要な連絡はありません。")}
      </div>
    </div>`,
    section(
      "submissions",
      "参加申請・企画の状況",
      statuses
        .map(
          (item) => `
      <article class="seminar-entry"><div class="seminar-row"><h3>${item.kind === "参加申請" || item.status === "approved" ? detailLink(item) : html(item.title)}</h3>
      <span class="seminar-state">${item.kind} ・ ${statusLabels[item.status]}</span></div>
      <p class="seminar-muted">申請日 ${dateLabel(item.date)}</p>${item.note ? `<p class="seminar-prewrap">${html(item.note)}</p>` : ""}</article>`,
        )
        .join(""),
      "申請はありません。",
    ),
    section(
      "history",
      "過去の活動",
      past.map(membershipCard).join("") + cards(previous),
      "過去の活動はありません。",
    ),
  ].join("");
}

function hostControls(data: Workspace) {
  const { seminar, applications } = data;
  const assignees = applications
    .filter((row) => row.status === "approved")
    .map(
      (row) =>
        `<option value="${html(row.applicant_id)}">${html(row.profile.name)}（${html(row.email)}）</option>`,
    )
    .join("");
  return `
    ${section(
      "settings",
      "募集・実施状況",
      `<form class="seminar-entry" data-action="settings">
      <div class="seminar-form-grid">
        <label>募集状況 <select name="recruitment">${selects(recruitmentLabels, seminar.recruitment)}</select></label>
        <label>実施状況 <select name="phase">${selects(phaseLabels, seminar.phase)}</select></label>
      </div>
      <div class="seminar-actions"><button class="button button-secondary" type="submit">状況を保存</button><p role="status" data-form-message></p></div>
    </form>`,
      "",
    )}
    ${section(
      "applications",
      "参加申請の審査",
      applications
        .map(
          (row) => `
      <details class="seminar-entry" ${row.status === "pending" ? "open" : ""}>
        <summary>${html(row.profile.name)} ・ ${statusLabels[row.status]}</summary>
        <p class="seminar-muted">申請日 ${dateLabel(row.created_at)}</p>
        ${privateProfile(row.profile, row.email)}
        ${row.host_note ? `<p class="seminar-prewrap">${html(row.host_note)}</p>` : ""}
        ${row.status === "pending" ? `<form data-action="applications/${html(row.id)}" data-decision>${decisions()}</form>` : ""}
      </details>`,
        )
        .join(""),
      "参加申請はありません。",
    )}
    ${
      seminar.phase !== "ended"
        ? section(
            "create",
            "活動を追加",
            `<form class="seminar-entry" data-action="activities">
      <div class="seminar-form-grid">
        <label>種類 <select name="kind">${selects(kinds, "event")}</select></label>
        <label>件名（必須） <input required name="title" maxlength="160" /></label>
        <label data-activity-date><span data-date-label>開催日時（日本時間・必須）</span><input type="datetime-local" name="when" required /></label>
        <label data-activity-assignee hidden>担当 <select name="assignee"><option value="">全員</option>${assignees}</select></label>
        <label class="seminar-full" data-activity-options hidden>候補（2〜12件・1行に1件） <textarea name="options" maxlength="2000" rows="4"></textarea></label>
        <label class="seminar-full">詳細 <textarea name="description" maxlength="3000" rows="3"></textarea></label>
      </div>
      <div class="seminar-actions"><button class="button" type="submit">活動を追加する</button><p role="status" data-form-message></p></div>
    </form>`,
            "",
          )
        : ""
    }`;
}

function materialSection(data: Workspace) {
  const { materials, seminar } = data;
  return section(
    "materials",
    "共有資料",
    `
    ${
      seminar.phase !== "ended"
        ? `<form class="seminar-entry" data-upload>
      <label>資料ファイル（1 MB以下） <input type="file" name="file" required /></label>
      <div class="seminar-actions"><button class="button" type="submit">アップロード</button><p role="status" data-form-message></p></div>
    </form>`
        : ""
    }
    ${
      materials
        .map(
          (file) => `<article class="seminar-entry">
      <div class="seminar-row"><h3><a href="${seminarApiUrl("/" + seminar.number + "/materials/" + file.id)}" download>${html(file.filename)}</a></h3>
      <p class="seminar-muted">${Math.max(1, Math.ceil(file.bytes / 1000))} KB ・ ${dateLabel(file.created_at)}</p></div>
      ${
        file.canManage
          ? `<details><summary>資料を管理</summary><form class="seminar-inline-form" data-material="${html(file.id)}">
        <label>ファイル名 <input name="filename" value="${html(file.filename)}" maxlength="160" required /></label>
        <button class="button button-secondary" value="rename" type="submit">名前を変更</button>
        <button class="button seminar-danger" value="delete" type="submit" formnovalidate>削除</button>
        <p role="status" data-form-message></p>
      </form></details>`
          : ""
      }
    </article>`,
        )
        .join("") || empty("共有資料はありません。")
    }`,
    "",
  );
}

export async function renderWorkspace(content: HTMLElement) {
  const number = numberFromUrl();
  if (!number) throw new Error("ゼミ番号が指定されていません。");
  const base = `/${number}`;
  const data = await api<Workspace>(`${base}/workspace`);
  const { seminar, isHost, activities } = data;
  const now = new Date().toISOString();
  const inHistory = (row: Activity) =>
    seminar.phase === "ended" ||
    (row.kind === "event" && !!row.due_at && row.due_at < now) ||
    (row.kind === "task" && !!row.completed_at) ||
    (row.kind === "poll" && !pollOpen(row, now));
  const cards = (rows: Activity[]) =>
    rows
      .map((row) => activityCard(row, { workspace: true, isHost, now }))
      .join("");
  document.title = `${seminar.title}の活動 | ゼミプラットフォーム`;
  content.innerHTML = `
    <header class="seminar-page-head">
      <h1>${html(seminar.title)}</h1>
      <p class="seminar-meta">ゼミ番号 ${seminarNumber(number)} ・ ${isHost ? "主催者" : "参加者"}</p>
      <p><a href="${urlFor("detail", number)}">公開ページを見る</a></p>
      <p data-workspace-status role="status" tabindex="-1"></p>
    </header>
    ${isHost ? hostControls(data) : ""}
    ${Object.entries(kinds)
      .map(([kind, label]) =>
        section(
          kind,
          label,
          cards(
            activities.filter((row) => row.kind === kind && !inHistory(row)),
          ),
          "登録はありません。",
        ),
      )
      .join("")}
    ${materialSection(data)}
    ${section("history", "過去の活動", cards(activities.filter(inHistory)), "過去の活動はありません。")}`;

  const refresh = async () => {
    await renderWorkspace(content);
    const status = content.querySelector<HTMLElement>(
      "[data-workspace-status]",
    );
    if (status) {
      status.textContent = "保存しました。";
      status.focus({ preventScroll: true });
    }
  };
  const kind = content.querySelector<HTMLSelectElement>('[name="kind"]');
  kind?.addEventListener("change", () => {
    const form = kind.form;
    if (!form) return;
    const date = form.querySelector<HTMLElement>("[data-activity-date]");
    const label = form.querySelector<HTMLElement>("[data-date-label]");
    const when = form.querySelector<HTMLInputElement>('[name="when"]');
    const assignee = form.querySelector<HTMLElement>(
      "[data-activity-assignee]",
    );
    const choices = form.querySelector<HTMLElement>("[data-activity-options]");
    if (date) date.hidden = kind.value === "notice";
    if (label)
      label.textContent =
        kind.value === "event"
          ? "開催日時（日本時間・必須）"
          : "回答・準備の期限（日本時間）";
    if (when) {
      when.required = kind.value === "event";
      when.disabled = kind.value === "notice";
    }
    if (assignee) assignee.hidden = kind.value !== "task";
    if (choices) choices.hidden = kind.value !== "poll";
  });
  content
    .querySelectorAll<HTMLFormElement>("form[data-action]")
    .forEach((form) =>
      bindForm(form, async (fields, button) => {
        const body = Object.fromEntries(fields);
        await post(`${base}/${form.dataset.action}`, {
          ...body,
          dueAt: body.when ? `${String(body.when)}+09:00` : "",
          decision: button instanceof HTMLButtonElement ? button.value : "",
        });
        await refresh();
      }),
    );
  content
    .querySelectorAll<HTMLFormElement>("form[data-activity]")
    .forEach((form) =>
      bindForm(form, async (fields) => {
        await post(
          `${base}/activities/${form.dataset.activity}`,
          fields.has("choice")
            ? { choice: Number(fields.get("choice")) }
            : { complete: true },
        );
        await refresh();
      }),
    );
  const upload = content.querySelector<HTMLFormElement>("form[data-upload]");
  if (upload)
    bindForm(upload, async (fields) => {
      const file = fields.get("file");
      if (!(file instanceof File) || !file.size || file.size > 1_000_000)
        throw new Error("1 MB以下のファイルを選んでください。");
      await api(`${base}/materials`, {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-seminar-filename": encodeURIComponent(file.name),
        },
        body: file,
      });
      await refresh();
    });
  content
    .querySelectorAll<HTMLFormElement>("form[data-material]")
    .forEach((form) =>
      bindForm(form, async (fields, button) => {
        const path = `${base}/materials/${form.dataset.material}`;
        if (button instanceof HTMLButtonElement && button.value === "delete") {
          if (!window.confirm("この資料を削除しますか？")) return;
          await api(path, { method: "DELETE" });
        } else {
          await post(path, { filename: fields.get("filename") }, "PATCH");
        }
        await refresh();
      }),
    );
}
