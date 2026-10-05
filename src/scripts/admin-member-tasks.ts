import { readAdminApiJson } from "../lib/admin-api";
import { formatTaskDeadline } from "../lib/task-deadline";
import { createAdminLoadRetry } from "./admin-load-retry";

type Project = { id: string; name: string; role: string };
type Member = { project_id: string; email: string; display_name: string };
type Task = {
  id: string;
  project_id: string;
  subject?: string | null;
  assignee_email?: string | null;
  assignee_display_name?: string;
  assigned_to_me?: boolean;
  created_by_me?: boolean;
  can_update?: boolean;
  created_by?: string;
  task_kind?: string;
  title: string;
  details?: string;
  status: string;
  due_at?: string | null;
  due_timezone?: string;
  archived_at?: string | null;
  is_test_data?: number;
};
type Data = {
  scope?: { email?: string; isManager?: boolean; memberAccess?: boolean };
  projects?: Project[];
  members?: Member[];
  tasks?: Task[];
  summary?: { total: number; open: number; doing: number; done: number };
  pagination?: { nextCursor?: string | null; hasMore?: boolean };
  error?: string;
};
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );

function initialize() {
  const root = document.querySelector<HTMLElement>("[data-member-tasks]");
  if (!root || root.dataset.ready) return;
  root.dataset.ready = "true";
  const get = <T extends Element>(selector: string) =>
    root.querySelector<T>(selector)!;
  const list = get<HTMLElement>("[data-list]");
  const projectSelect = get<HTMLSelectElement>("[data-project]");
  const assigneeSelect = get<HTMLSelectElement>("[data-assignee]");
  const message = get<HTMLOutputElement>("[data-message]");
  const search = get<HTMLInputElement>("[data-task-search]");
  const statusFilter = get<HTMLSelectElement>("[data-status-filter]");
  const dueFilter = get<HTMLSelectElement>("[data-due-filter]");
  const showArchived = get<HTMLInputElement>("[data-show-archived]");
  const showTestData = get<HTMLInputElement>("[data-show-test]");
  const createTestData = get<HTMLInputElement>("[data-create-test]");
  const createTestLabel = get<HTMLElement>("[data-create-test-label]");
  const loadMore = get<HTMLButtonElement>("[data-task-load-more]");
  let data: Data = {};
  const initialParams = new URLSearchParams(location.search);
  const initialView = initialParams.get("view");
  let filter = ["all", "created", "assigned"].includes(initialView ?? "")
    ? initialView!
    : "assigned";
  let selectedProjects: Set<string> | null = initialParams.has("project")
    ? new Set(initialParams.getAll("project"))
    : null;
  for (const [select, name] of [
    [statusFilter, "status"],
    [dueFilter, "due"],
  ] as const) {
    const value = initialParams.get(name);
    if (value && [...select.options].some((option) => option.value === value))
      select.value = value;
  }
  let nextCursor: string | null = null;
  let requestVersion = 0;
  let controller: AbortController | undefined;
  let loadingMore = false;
  let searchTimer: number | undefined;
  let focusId = new URLSearchParams(location.search).get("focus");
  if (focusId) filter = "all";
  const assignedToMe = (task: Task) =>
    task.assigned_to_me ??
    ((task.task_kind === "feedback" && task.assignee_email === "*") ||
      (task.assignee_email ?? "")
        .toLowerCase()
        .split(",")
        .map((value) => value.trim())
        .includes((data.scope?.email ?? "").toLowerCase()));
  const updateAssignees = () => {
    const project = data.projects?.find(
      (item) => item.id === projectSelect.value,
    );
    const label = assigneeSelect.closest("label");
    if (label)
      label.hidden = !data.scope?.isManager && project?.role !== "manager";
    createTestLabel.hidden =
      !data.scope?.isManager && project?.role !== "manager";
    const selected = new Set(
      [...assigneeSelect.selectedOptions].map((option) => option.value),
    );
    assigneeSelect.innerHTML =
      '<option value="" disabled>担当者を選択</option>' +
      (data.members ?? [])
        .filter((member) => member.project_id === projectSelect.value)
        .map(
          (member) =>
            `<option value="${escape(member.email)}" ${selected.has(member.email) ? "selected" : ""}>${escape(member.display_name)}</option>`,
        )
        .join("");
  };
  const query = () => {
    const params = new URLSearchParams({
      includeArchived: showArchived.checked ? "1" : "0",
      includeTestData: showTestData.checked ? "1" : "0",
      limit: "50",
      view: filter,
      q: search.value.trim(),
      status: statusFilter.value,
      due: dueFilter.value,
      timezone:
        Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo",
    });
    if (selectedProjects) {
      for (const id of selectedProjects) params.append("project", id);
      if (!selectedProjects.size) params.append("project", "");
    }
    if (focusId) params.set("focus", focusId);
    return params;
  };
  const updateViewButtons = () =>
    root
      .querySelectorAll<HTMLButtonElement>("[data-filter]")
      .forEach((button) => {
        const selected = button.dataset.filter === filter;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
  const render = () => {
    const projects = new Map(
      (data.projects ?? []).map((project) => [project.id, project]),
    );
    const rows = (data.tasks ?? []).filter(
      (task) =>
        (!selectedProjects || selectedProjects.has(task.project_id)) &&
        (showArchived.checked || !task.archived_at) &&
        (filter === "all" ||
          (filter === "assigned" && assignedToMe(task)) ||
          (filter === "created" &&
            (task.created_by_me ?? task.created_by === data.scope?.email))),
    );
    const summary = data.summary ?? {
      total: rows.length,
      open: rows.filter((task) => task.status === "open").length,
      doing: rows.filter((task) => task.status === "doing").length,
      done: rows.filter((task) => task.status === "done").length,
    };
    for (const key of ["total", "open", "doing", "done"] as const)
      get<HTMLElement>(`[data-summary-${key}]`).textContent = String(
        summary[key] ?? 0,
      );
    get<HTMLElement>("[data-result-count]").textContent = data.summary
      ? `${summary.total}件中 ${rows.length}件を表示`
      : `${rows.length}件`;
    get<HTMLElement>("[data-project-filter-count]").textContent =
      `${selectedProjects?.size ?? projects.size}/${projects.size}プロジェクト選択中`;
    get<HTMLElement>("[data-task-pagination]").hidden = !nextCursor;
    get<HTMLElement>("[data-task-pagination-summary]").textContent = nextCursor
      ? `${data.tasks?.length ?? 0}件を読み込み済み`
      : "";
    loadMore.disabled = loadingMore;
    loadMore.textContent = loadingMore ? "読み込み中…" : "さらに読み込む";
    list.innerHTML =
      rows
        .map((task) => {
          const project = projects.get(task.project_id);
          const statusLabel =
            task.status === "open"
              ? "未着手"
              : task.status === "doing"
                ? "進行中"
                : "完了";
          const assignee =
            task.assignee_display_name ??
            (task.assignee_email === "*"
              ? "分野担当者全員"
              : (task.assignee_email ?? "")
                  .split(",")
                  .map(
                    (email) =>
                      data.members?.find(
                        (member) =>
                          member.project_id === task.project_id &&
                          member.email === email.trim(),
                      )?.display_name ?? email.trim(),
                  )
                  .filter(Boolean)
                  .join("、"));
          let approvalLink = "";
          if (
            project?.role === "manager" &&
            task.subject === "project-profile-change"
          )
            approvalLink =
              task.project_id === "atlas"
                ? '<a class="approval-link" href="/admin/profile-requests/?section=atlas">メンバー情報の承認 →</a>'
                : `<a class="approval-link" href="/admin/project-profile-requests/?project=${encodeURIComponent(task.project_id)}">運営内自己紹介の承認 →</a>`;
          if (
            project?.role === "manager" &&
            task.subject === "member-profile-change"
          )
            approvalLink =
              '<a class="approval-link" href="/admin/profile-requests/">メンバー情報の承認 →</a>';
          const editable = task.can_update === true;
          const archiveAction = !editable
            ? ""
            : task.archived_at
              ? `<button type="button" class="status-button task-archive-button" data-archive-task="${escape(task.id)}" data-archive-next="false">復元</button>`
              : task.status === "done"
                ? `<button type="button" class="status-button task-archive-button" data-archive-task="${escape(task.id)}" data-archive-next="true">アーカイブ</button>`
                : "";
          const manager = Boolean(
            data.scope?.isManager || project?.role === "manager",
          );
          const testToggle = manager
            ? `<button type="button" class="status-button" data-test-task="${escape(task.id)}" data-test-next="${task.is_test_data ? "false" : "true"}">${task.is_test_data ? "通常タスクに戻す" : "テスト用に設定"}</button>`
            : "";
          return `<article class="task status-${escape(task.status)} ${task.archived_at ? "is-archived" : ""}${focusId === task.id ? " is-focused" : ""}" data-task-id="${escape(task.id)}" ${focusId === task.id ? 'tabindex="-1"' : ""}><div class="task-body"><div class="task-title"><span class="status-dot" aria-hidden="true"></span><h3>${escape(task.title)}</h3>${task.is_test_data ? '<span class="badge badge-status">テストデータ</span>' : ""}${task.archived_at ? '<span class="badge badge-status">アーカイブ済み</span>' : ""}</div><div class="task-meta"><span class="badge">${task.task_kind === "feedback" ? "フィードバック依頼" : "タスク依頼"}</span><span class="badge">${escape(project?.name ?? task.project_id)}</span><span class="badge badge-status">${statusLabel}</span>${assignee ? `<span class="badge">担当: ${escape(assignee)}</span>` : ""}</div>${task.details ? `<p>${escape(task.details)}</p>` : ""}${task.due_at ? `<p>期限: ${escape(formatTaskDeadline(task.due_at, task.due_timezone || "Asia/Tokyo"))}</p>` : ""}${approvalLink}<a href="/admin/task-detail/?task=${encodeURIComponent(task.id)}">詳細・引き継ぎ →</a></div>${
            editable
              ? `<div class="task-actions"><label class="status-control"><span>進捗</span><select aria-label="${escape(task.title)}の状態" data-task-status="${escape(task.id)}">${[
                  ["open", "未着手"],
                  ["doing", "進行中"],
                  ["done", "完了"],
                ]
                  .map(
                    ([value, label]) =>
                      `<option value="${value}" ${task.status === value ? "selected" : ""}>${label}</option>`,
                  )
                  .join(
                    "",
                  )}</select></label><button type="button" class="status-button" data-save-status="${escape(task.id)}">状態を保存</button>${archiveAction}${testToggle}</div>`
              : '<div class="task-actions"><span class="badge">閲覧のみ</span></div>'
          }</article>`;
        })
        .join("") ||
      '<p class="empty">表示対象のタスクはありません。検索条件を確認してください。</p>';
    if (focusId) {
      const focused = list.querySelector<HTMLElement>(
        `[data-task-id="${CSS.escape(focusId)}"]`,
      );
      if (focused)
        requestAnimationFrame(() => {
          focused.scrollIntoView({ behavior: "smooth", block: "center" });
          focused.focus({ preventScroll: true });
        });
    }
  };
  const retry = createAdminLoadRetry(
    root,
    () => load(),
    "タスクを読み込めませんでした。",
  );
  const load = async () => {
    controller?.abort();
    controller = new AbortController();
    const version = ++requestVersion;
    const signal = controller.signal;
    nextCursor = null;
    loadingMore = false;
    retry.begin();
    try {
      const response = await fetch(`/api/admin/member-tasks?${query()}`, {
        credentials: "same-origin",
        cache: "no-store",
        signal,
      });
      const loaded = await readAdminApiJson<Data>(
        response,
        "タスクを読み込めませんでした。",
      );
      if (signal.aborted || version !== requestVersion) return;
      if (!response.ok)
        throw new Error(loaded.error ?? "タスクを読み込めませんでした。");
      data = loaded;
      nextCursor = loaded.pagination?.nextCursor ?? null;
      const selectedProject = projectSelect.value;
      projectSelect.innerHTML = (data.projects ?? [])
        .map(
          (project) =>
            `<option value="${escape(project.id)}">${escape(project.name)}</option>`,
        )
        .join("");
      if (data.projects?.some((project) => project.id === selectedProject))
        projectSelect.value = selectedProject;
      if (selectedProjects)
        selectedProjects = new Set(
          [...selectedProjects].filter((id) =>
            data.projects?.some((project) => project.id === id),
          ),
        );
      get<HTMLElement>("[data-project-filters]").innerHTML = (
        data.projects ?? []
      )
        .map(
          (project) =>
            `<label><input type="checkbox" data-project-filter value="${escape(project.id)}" ${!selectedProjects || selectedProjects.has(project.id) ? "checked" : ""} />${escape(project.name)}</label>`,
        )
        .join("");
      updateAssignees();
      render();
      retry.success();
    } catch (error) {
      if (!signal.aborted && version === requestVersion) retry.fail(error);
    }
  };
  const filtersChanged = () => {
    focusId = null;
    window.clearTimeout(searchTimer);
    void load();
  };
  search.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(filtersChanged, 300);
  });
  statusFilter.addEventListener("change", filtersChanged);
  dueFilter.addEventListener("change", filtersChanged);
  showArchived.addEventListener("change", filtersChanged);
  showTestData.addEventListener("change", filtersChanged);
  get<HTMLButtonElement>("[data-apply-filters]").addEventListener(
    "click",
    filtersChanged,
  );
  get<HTMLButtonElement>("[data-clear-filters]").addEventListener(
    "click",
    () => {
      search.value = "";
      statusFilter.value = "all";
      dueFilter.value = "all";
      filter = "assigned";
      selectedProjects = null;
      updateViewButtons();
      filtersChanged();
    },
  );
  get<HTMLElement>("[data-project-filters]").addEventListener("change", () => {
    selectedProjects = new Set(
      [
        ...root.querySelectorAll<HTMLInputElement>(
          "[data-project-filter]:checked",
        ),
      ].map((input) => input.value),
    );
    filtersChanged();
  });
  root.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((button) =>
    button.addEventListener("click", () => {
      filter = button.dataset.filter ?? "assigned";
      updateViewButtons();
      filtersChanged();
    }),
  );
  projectSelect.addEventListener("change", updateAssignees);
  get<HTMLButtonElement>("[data-scroll-create]").addEventListener(
    "click",
    () => {
      get<HTMLElement>("[data-create-panel]").scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      get<HTMLInputElement>("[data-title]").focus({ preventScroll: true });
    },
  );
  loadMore.addEventListener("click", async () => {
    if (loadingMore || !nextCursor) return;
    const version = requestVersion;
    const params = query();
    params.set("cursor", nextCursor);
    loadingMore = true;
    render();
    try {
      const response = await fetch(`/api/admin/member-tasks?${params}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const loaded = await readAdminApiJson<Data>(
        response,
        "追加のタスクを読み込めませんでした。",
      );
      if (version !== requestVersion) return;
      if (!response.ok)
        throw new Error(loaded.error ?? "追加のタスクを読み込めませんでした。");
      const existing = new Set(data.tasks?.map((task) => task.id));
      data = {
        ...loaded,
        tasks: [
          ...(data.tasks ?? []),
          ...(loaded.tasks ?? []).filter((task) => !existing.has(task.id)),
        ],
      };
      nextCursor = loaded.pagination?.nextCursor ?? null;
    } catch (error) {
      if (version === requestVersion)
        message.value =
          error instanceof Error
            ? error.message
            : "追加のタスクを読み込めませんでした。";
    } finally {
      if (version === requestVersion) {
        loadingMore = false;
        render();
      }
    }
  });
  const mutate = async (
    button: HTMLButtonElement,
    path: string,
    method: string,
    payload: unknown,
    success: string,
    done?: () => void,
  ) => {
    if (button.disabled) return;
    button.disabled = true;
    message.value = "保存中…";
    try {
      const response = await fetch(path, {
        method,
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await readAdminApiJson<{ error?: string }>(
        response,
        "更新できませんでした。",
      );
      if (!response.ok)
        throw new Error(result.error ?? "更新できませんでした。");
      message.value = success;
      done?.();
      await load();
    } catch (error) {
      message.value =
        error instanceof Error ? error.message : "更新できませんでした。";
    } finally {
      button.disabled = false;
    }
  };
  get<HTMLButtonElement>("[data-create]").addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    void mutate(
      button,
      "/api/admin/operations/tasks",
      "POST",
      {
        projectId: projectSelect.value,
        title: get<HTMLInputElement>("[data-title]").value,
        assigneeEmails: [...assigneeSelect.selectedOptions]
          .map((option) => option.value)
          .filter(Boolean),
        dueAt: get<HTMLInputElement>("[data-due]").value,
        dueTimezone: get<HTMLSelectElement>("[data-timezone]").value,
        details: get<HTMLTextAreaElement>("[data-details]").value,
        isTestData: createTestData.checked,
      },
      "タスクを追加しました。",
      () => {
        get<HTMLInputElement>("[data-title]").value = "";
        get<HTMLTextAreaElement>("[data-details]").value = "";
        createTestData.checked = false;
        [...assigneeSelect.options].forEach((option) => {
          option.selected = false;
        });
      },
    );
  });
  list.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-archive-task], [data-save-status], [data-test-task]",
    );
    if (!button || button.disabled) return;
    const archiveId = button.dataset.archiveTask;
    const testId = button.dataset.testTask;
    const archive = button.dataset.archiveNext === "true";
    if (
      archiveId &&
      archive &&
      !confirm("完了タスクを一覧からアーカイブします。監査履歴は保持されます。")
    )
      return;
    const id = archiveId ?? testId ?? button.dataset.saveStatus!;
    if (!data.tasks?.some((task) => task.id === id && task.can_update === true))
      return;
    const payload = testId
      ? { isTestData: button.dataset.testNext === "true" }
      : archiveId
        ? { archived: archive }
        : {
            status: list.querySelector<HTMLSelectElement>(
              `[data-task-status="${CSS.escape(id)}"]`,
            )?.value,
          };
    void mutate(
      button,
      `/api/admin/operations/tasks/${encodeURIComponent(id)}`,
      "PATCH",
      payload,
      archiveId
        ? archive
          ? "アーカイブしました。"
          : "復元しました。"
        : "状態を更新しました。",
    );
  });
  updateViewButtons();
  void load();
  document.addEventListener(
    "astro:before-swap",
    () => {
      controller?.abort();
      window.clearTimeout(searchTimer);
      requestVersion += 1;
    },
    { once: true },
  );
}
document.addEventListener("astro:page-load", initialize);
initialize();
