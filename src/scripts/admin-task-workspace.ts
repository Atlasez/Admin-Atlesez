import { readAdminApiJson } from "../lib/admin-api";
import { createAdminLoadRetry } from "./admin-load-retry";
import type { ChecklistItem } from "../lib/admin-task-workspace";

type Dependency = {
  id: string | null;
  title: string;
  status: string;
  available: boolean;
};
type WorkspaceData = {
  task: {
    id: string;
    title: string;
    status: string;
    updatedAt: string;
    assigneeEmails: string[];
  };
  workspace: {
    summary: string;
    nextAction: string;
    waitingFor: string;
    documentId: string | null;
    documentRestricted?: boolean;
    checklist: ChecklistItem[];
    revision: number;
  };
  dependencies: Dependency[];
  candidates: Array<{ id: string; title: string; status: string }>;
  members: Array<{ email: string; name: string }>;
  history: Array<{
    summary: string;
    next_action: string;
    waiting_for: string;
    created_at: string;
    reassigned: number;
  }>;
  canEdit: boolean;
  canAssign: boolean;
};
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
const initialize = () => {
  const root = document.querySelector<HTMLElement>("[data-task-workspace]");
  if (!root || root.dataset.ready) return;
  root.dataset.ready = "true";
  const get = <T extends Element = HTMLElement>(selector: string) =>
    root.querySelector<T>(selector)!;
  const form = get<HTMLFormElement>("[data-workspace-form]"),
    message = get<HTMLOutputElement>("[data-workspace-message]"),
    save = get<HTMLButtonElement>("[data-save-workspace]");
  const field = (name: string) =>
    form.elements.namedItem(name) as HTMLInputElement;
  const assignees = form.elements.namedItem("assignees") as HTMLSelectElement;
  const taskId = new URLSearchParams(location.search).get("task") ?? "";
  let data: WorkspaceData,
    checklist: ChecklistItem[] = [],
    dependencies: Dependency[] = [],
    dirty = false,
    edits = 0,
    saving = false,
    loading = false;
  const markDirty = () => {
    dirty = true;
    edits++;
    message.value = "未保存の変更があります。";
  };
  const api = async <T>(url: string, options?: RequestInit) => {
    const response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
    });
    const body = await readAdminApiJson<T & { error?: string }>(
      response,
      "タスク詳細を取得・保存できませんでした。",
    );
    if (!response.ok)
      throw new Error(body.error ?? "タスク詳細を取得・保存できませんでした。");
    return body;
  };
  const renderChecklist = () => {
    get("[data-checklist-count]").textContent =
      `${checklist.filter((item) => item.done).length}/${checklist.length}件完了`;
    get("[data-checklist]").innerHTML =
      checklist
        .map(
          (item) =>
            `<li><label><input type="checkbox" data-item-id="${item.id}" ${item.done ? "checked" : ""} ${data.canEdit ? "" : "disabled"} />${escape(item.label)}</label>${data.canEdit ? `<button type="button" data-remove-item="${item.id}" aria-label="${escape(item.label)}を削除">削除</button>` : ""}</li>`,
        )
        .join("") || "<li>確認項目はありません。</li>";
  };
  const renderDependencies = () => {
    get("[data-dependencies]").innerHTML =
      dependencies
        .map(
          (item) =>
            `<li><span class="dependency-label">${item.id ? `<a href="/admin/task-detail/?task=${encodeURIComponent(item.id)}">${escape(item.title)}</a>` : escape(item.title)} — ${item.status === "done" ? "完了" : item.status === "unknown" ? "状態を確認できません" : "対応待ち"}</span>${data.canEdit && item.id ? `<button type="button" data-remove-dependency="${item.id}" aria-label="${escape(item.title)}を前提から外す">外す</button>` : ""}</li>`,
        )
        .join("") || "<li>前提タスクはありません。</li>";
  };
  const candidates = (rows: WorkspaceData["candidates"]) => {
    get<HTMLSelectElement>("[data-dependency-choice]").innerHTML =
      '<option value="">タスクを選択</option>' +
      rows
        .filter((row) => !dependencies.some((item) => item.id === row.id))
        .map(
          (row) =>
            `<option value="${row.id}" data-status="${escape(row.status)}">${escape(row.title)}</option>`,
        )
        .join("");
  };
  const load = async () => {
    if (loading || saving) return;
    if (dirty && !window.confirm("未保存の変更を破棄して再読み込みしますか？"))
      return;
    loading = true;
    save.disabled = true;
    retry.begin();
    try {
      if (!/^[0-9a-f-]{36}$/i.test(taskId))
        throw new Error("タスク管理からタスクを選択してください。");
      data = await api<WorkspaceData>(`/api/admin/task-workspaces/${taskId}`);
      const workspace = data.workspace;
      get("[data-task-title]").textContent = data.task.title;
      field("summary").value = workspace.summary;
      field("nextAction").value = workspace.nextAction;
      field("waitingFor").value = workspace.waitingFor;
      field("documentUrl").value = workspace.documentId
        ? `/admin/editor/?document=${workspace.documentId}`
        : "";
      const link = get<HTMLAnchorElement>("[data-document-link]");
      link.hidden = !workspace.documentId;
      if (workspace.documentId) link.href = field("documentUrl").value;
      field("handoff").checked = false;
      checklist = workspace.checklist.map((item) => ({ ...item }));
      dependencies = data.dependencies.map((item) => ({ ...item }));
      // Retain restricted references instead of offering a save that would drop them.
      if (
        workspace.documentRestricted ||
        dependencies.some((item) => !item.available)
      )
        data.canEdit = false;
      get("[data-access-note]").textContent = data.canEdit
        ? "担当者・依頼者と運営内運営が編集できます。"
        : "このタスクは閲覧のみです。権限や参照先の変更は運営内運営へ確認してください。";
      form.hidden = false;
      form
        .querySelectorAll<
          | HTMLInputElement
          | HTMLTextAreaElement
          | HTMLSelectElement
          | HTMLButtonElement
        >("input,textarea,select,button")
        .forEach((element) => {
          element.disabled = !data.canEdit;
        });
      get<HTMLButtonElement>("[data-reload-workspace]").disabled = false;
      get("[data-assignment-panel]").hidden = !data.canAssign;
      assignees.innerHTML = data.members
        .map(
          (member) =>
            `<option value="${escape(member.email)}" ${data.task.assigneeEmails.includes(member.email.toLowerCase()) ? "selected" : ""}>${escape(member.name)}</option>`,
        )
        .join("");
      renderChecklist();
      renderDependencies();
      candidates(data.candidates);
      get("[data-handoff-history]").innerHTML =
        data.history
          .map(
            (row) =>
              `<article class="history-entry"><h3>${escape(new Date(row.created_at).toLocaleString("ja-JP"))}${row.reassigned ? "・担当変更" : ""}</h3><p>現在の状況: ${escape(row.summary)}</p><p>次にすること: ${escape(row.next_action)}</p>${row.waiting_for ? `<p>判断・対応待ち: ${escape(row.waiting_for)}</p>` : ""}</article>`,
          )
          .join("") || "<p>引き継ぎ記録はありません。</p>";
      dirty = false;
      message.value = "";
      retry.success();
    } catch (error) {
      message.value =
        error instanceof Error ? error.message : "読み込めませんでした。";
      retry.fail(error);
    } finally {
      loading = false;
      save.disabled = !data?.canEdit;
    }
  };
  const retry = createAdminLoadRetry(
    root,
    load,
    "タスク詳細を読み込めませんでした。",
  );
  form.addEventListener("input", (event) => {
    if ((event.target as Element).matches("[name],[data-item-id]")) markDirty();
  });
  get("[data-checklist]").addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    const item = checklist.find((item) => item.id === input.dataset.itemId);
    if (item) item.done = input.checked;
    get("[data-checklist-count]").textContent =
      `${checklist.filter((item) => item.done).length}/${checklist.length}件完了`;
  });
  const addItem = () => {
    const input = get<HTMLInputElement>("[data-new-item]");
    if (!input.value.trim() || checklist.length >= 30) return;
    checklist.push({
      id: crypto.randomUUID(),
      label: input.value.trim(),
      done: false,
    });
    input.value = "";
    renderChecklist();
    markDirty();
  };
  get("[data-add-item]").addEventListener("click", addItem);
  get("[data-new-item]").addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key === "Enter") {
      event.preventDefault();
      addItem();
    }
  });
  get("[data-checklist]").addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>(
      "[data-remove-item]",
    );
    if (!button) return;
    checklist = checklist.filter(
      (item) => item.id !== button.dataset.removeItem,
    );
    renderChecklist();
    markDirty();
  });
  get("[data-dependencies]").addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>(
      "[data-remove-dependency]",
    );
    if (!button) return;
    dependencies = dependencies.filter(
      (item) => item.id !== button.dataset.removeDependency,
    );
    renderDependencies();
    markDirty();
  });
  get("[data-search-dependencies]").addEventListener("click", async () => {
    const button = get<HTMLButtonElement>("[data-search-dependencies]");
    button.disabled = true;
    try {
      const result = await api<WorkspaceData>(
        `/api/admin/task-workspaces/${taskId}?q=${encodeURIComponent(get<HTMLInputElement>("[data-dependency-search]").value)}`,
      );
      candidates(result.candidates);
    } catch (error) {
      message.value =
        error instanceof Error ? error.message : "検索できませんでした。";
    } finally {
      button.disabled = !data.canEdit;
    }
  });
  get("[data-add-dependency]").addEventListener("click", () => {
    const choice = get<HTMLSelectElement>("[data-dependency-choice]");
    const option = choice.selectedOptions[0];
    if (
      !option?.value ||
      dependencies.length >= 20 ||
      dependencies.some((item) => item.id === option.value)
    )
      return;
    dependencies.push({
      id: option.value,
      title: option.textContent ?? "",
      status: option.dataset.status ?? "open",
      available: true,
    });
    renderDependencies();
    option.remove();
    markDirty();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving || !data.canEdit) return;
    const editVersion = edits;
    try {
      let documentId = "";
      const documentUrl = field("documentUrl").value.trim();
      if (documentUrl) {
        const url = new URL(documentUrl, location.origin);
        if (
          ![location.origin, "https://admin.atlasez.org"].includes(
            url.origin,
          ) ||
          !/^\/admin\/editor\/?$/.test(url.pathname)
        )
          throw new Error("運営サイトの記事編集URLを指定してください。");
        documentId = url.searchParams.get("document") ?? "";
        if (!/^[0-9a-f-]{36}$/i.test(documentId))
          throw new Error("関連原稿のURLを確認してください。");
      }
      const selected = [...assignees.selectedOptions]
        .map((option) => option.value)
        .sort();
      const assignedChanged =
        data.canAssign &&
        JSON.stringify(selected) !==
          JSON.stringify([...data.task.assigneeEmails].sort());
      const body = {
        summary: field("summary").value,
        nextAction: field("nextAction").value,
        waitingFor: field("waitingFor").value,
        documentId,
        checklist,
        dependencyIds: dependencies.map((item) => item.id),
        revision: data.workspace.revision,
        expectedUpdatedAt: data.task.updatedAt,
        handoff: field("handoff").checked,
        ...(assignedChanged ? { assigneeEmails: selected } : {}),
      };
      saving = true;
      save.disabled = true;
      message.value = "保存しています…";
      const result = await api<{ revision: number; updatedAt: string }>(
        `/api/admin/task-workspaces/${taskId}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      data.workspace.revision = result.revision;
      data.task.updatedAt = result.updatedAt;
      if (assignedChanged) data.task.assigneeEmails = selected;
      if (edits === editVersion) {
        dirty = false;
        saving = false;
        await load();
        message.value = "保存しました。";
      } else {
        message.value = "送信した内容を保存しました。追加入力は未保存です。";
      }
    } catch (error) {
      message.value =
        error instanceof Error ? error.message : "保存できませんでした。";
    } finally {
      saving = false;
      save.disabled = !data.canEdit;
    }
  });
  get("[data-reload-workspace]").addEventListener("click", () => void load());
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (root.isConnected && (dirty || saving)) {
      event.preventDefault();
    }
  };
  window.addEventListener("beforeunload", beforeUnload);
  document.addEventListener(
    "click",
    (event) => {
      if (
        !root.isConnected ||
        (!dirty && !saving) ||
        !(event.target as Element).closest("a[href]")
      )
        return;
      if (!window.confirm("未保存の変更があります。保存せず移動しますか？")) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  void load();
};
document.addEventListener("astro:page-load", initialize);
initialize();
