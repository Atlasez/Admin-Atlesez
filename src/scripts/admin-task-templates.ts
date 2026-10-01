import { readAdminApiJson } from "../lib/admin-api";
import { adminMutation, withAdminButtonLock } from "./admin-mutation";
import { createAdminLoadRetry } from "./admin-load-retry";
import type { TaskTemplate } from "../lib/admin-task-templates";
type Template = Omit<TaskTemplate, "owner_email" | "assignees_json"> & {
  assignees: string[];
};
type Data = {
  templates: Template[];
  email: string;
  projects: Array<{ id: string; name: string; role: string }>;
  members: Array<{ project_id: string; email: string; name: string }>;
  error?: string;
};
const esc = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
function initialize() {
  const root = document.querySelector<HTMLElement>("[data-task-templates]");
  if (!root || root.dataset.ready) return;
  root.dataset.ready = "true";
  const form = root.querySelector<HTMLFormElement>("[data-template-form]")!,
    list = root.querySelector<HTMLElement>("[data-template-list]")!,
    message = root.querySelector<HTMLOutputElement>("[data-template-message]")!,
    save = root.querySelector<HTMLButtonElement>("[data-template-save]")!;
  const field = <
    T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  >(
    name: string,
  ) => form.elements.namedItem(name) as T;
  let data: Data = { templates: [], projects: [], members: [], email: "" },
    editing: Template | undefined;
  const keys = new Map<string, string>();
  const controller = new AbortController();
  const setMessage = (error: unknown) => {
    message.value =
      error instanceof Error ? error.message : "操作できませんでした。";
  };
  const members = () => {
    const select = field<HTMLSelectElement>("assignees"),
      selected =
        editing?.assignees ??
        [...select.selectedOptions].map((option) => option.value);
    const project = field<HTMLSelectElement>("projectId").value;
    select.innerHTML = data.members
      .filter((member) => member.project_id === project)
      .map(
        (member) =>
          `<option value="${esc(member.email)}" ${selected.includes(member.email) ? "selected" : ""}>${esc(member.name)}</option>`,
      )
      .join("");
    if (data.projects.find((p) => p.id === project)?.role !== "manager") {
      for (const option of select.options)
        option.selected =
          option.value.toLowerCase() === data.email.toLowerCase();
      select.disabled = true;
    } else select.disabled = false;
  };
  const reset = () => {
    editing = undefined;
    form.reset();
    field<HTMLInputElement>("timezone").value =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo";
    save.textContent = "保存";
    field<HTMLInputElement>("anchorAt").required = false;
    field<HTMLInputElement>("enabled").disabled = true;
    members();
  };
  const render = () => {
    list.innerHTML = data.templates
      .map(
        (row) =>
          `<article class="template-entry"><h3>${esc(row.name)}</h3><p>${esc(row.title)} / ${esc(data.projects.find((p) => p.id === row.project_id)?.name ?? row.project_id)} / ${{ none: "手動のみ", daily: "毎日", weekly: "毎週", monthly: "毎月" }[row.schedule]}${row.enabled ? "（有効）" : "（停止）"}</p>${row.next_run_at && row.schedule !== "none" ? `<p>次回: ${esc(new Intl.DateTimeFormat("ja-JP", { timeZone: row.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(row.next_run_at)))} (${esc(row.timezone)})</p>` : ""}${row.last_error ? `<p role="status">${esc(row.last_error)}</p>` : ""}<div class="template-actions"><button type="button" data-template-edit="${esc(row.id)}">編集</button><button type="button" data-template-create="${esc(row.id)}">タスクを作成</button>${row.schedule !== "none" ? `<button type="button" data-template-toggle="${esc(row.id)}">${row.enabled ? "定期作成を停止" : "定期作成を再開"}</button>` : ""}${row.last_task_id ? `<a href="/admin/member-tasks/?focus=${encodeURIComponent(row.last_task_id)}">最後に作成したタスク</a>` : ""}</div></article>`,
      )
      .join("");
  };
  const load = async () => {
    retry.begin();
    const response = await fetch("/api/admin/task-templates", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
    const incoming = await readAdminApiJson<Data>(
      response,
      "テンプレートを読み込めませんでした。",
    );
    if (!response.ok)
      throw new Error(incoming.error || "テンプレートを読み込めませんでした。");
    if (!root.isConnected) return;
    data = incoming;
    const selected = field<HTMLSelectElement>("projectId").value;
    field<HTMLSelectElement>("projectId").innerHTML = data.projects
      .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
      .join("");
    if (data.projects.some((p) => p.id === selected))
      field<HTMLSelectElement>("projectId").value = selected;
    members();
    render();
    if (data.templates.length) retry.success();
    else retry.empty("保存したテンプレートはありません。");
  };
  const retry = createAdminLoadRetry(
    root,
    load,
    "テンプレートを読み込めませんでした。",
  );
  field<HTMLSelectElement>("projectId").addEventListener("change", () => {
    editing = editing ? { ...editing, assignees: [] } : undefined;
    members();
  });
  field<HTMLSelectElement>("schedule").addEventListener("change", () => {
    const scheduled = field<HTMLSelectElement>("schedule").value !== "none";
    field<HTMLInputElement>("anchorAt").required = scheduled;
    field<HTMLInputElement>("enabled").disabled = !scheduled;
    if (!scheduled) field<HTMLInputElement>("enabled").checked = false;
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void withAdminButtonLock(save, async () => {
      const payload = {
        name: field<HTMLInputElement>("name").value,
        title: field<HTMLInputElement>("title").value,
        details: field<HTMLTextAreaElement>("details").value,
        projectId: field<HTMLSelectElement>("projectId").value,
        assignees: [
          ...field<HTMLSelectElement>("assignees").selectedOptions,
        ].map((o) => o.value),
        dueAfterDays:
          field<HTMLInputElement>("dueAfterDays").value === ""
            ? null
            : Number(field<HTMLInputElement>("dueAfterDays").value),
        timezone: field<HTMLInputElement>("timezone").value,
        schedule: field<HTMLSelectElement>("schedule").value,
        anchorAt: field<HTMLInputElement>("anchorAt").value,
        enabled: field<HTMLInputElement>("enabled").checked,
        updatedAt: editing?.updated_at,
      };
      await adminMutation(
        `/api/admin/task-templates${editing ? `/${editing.id}` : ""}`,
        editing ? "PATCH" : "POST",
        payload,
        "テンプレートを保存できませんでした。",
      );
      reset();
      await load();
      message.value = "テンプレートを保存しました。";
    }).catch(setMessage);
  });
  root
    .querySelector<HTMLButtonElement>("[data-template-cancel]")!
    .addEventListener("click", reset);
  list.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>(
      "button",
    );
    if (!button) return;
    const id =
      button.dataset.templateEdit ||
      button.dataset.templateCreate ||
      button.dataset.templateToggle;
    const row = data.templates.find((t) => t.id === id);
    if (!row) return;
    if (button.dataset.templateEdit) {
      editing = row;
      for (const name of [
        "name",
        "title",
        "details",
        "projectId",
        "timezone",
        "schedule",
      ] as const)
        field<HTMLInputElement>(name).value = String(
          row[name === "projectId" ? "project_id" : name] ?? "",
        );
      field<HTMLInputElement>("dueAfterDays").value =
        row.due_after_days === null ? "" : String(row.due_after_days);
      field<HTMLInputElement>("anchorAt").value = row.anchor_at ?? "";
      field<HTMLInputElement>("anchorAt").required = row.schedule !== "none";
      field<HTMLInputElement>("enabled").checked = Boolean(row.enabled);
      field<HTMLInputElement>("enabled").disabled = row.schedule === "none";
      save.textContent = "変更を保存";
      members();
      field<HTMLInputElement>("name").focus();
      return;
    }
    void withAdminButtonLock(button, async () => {
      if (button.dataset.templateCreate) {
        const key = keys.get(row.id) || crypto.randomUUID();
        keys.set(row.id, key);
        await adminMutation(
          `/api/admin/task-templates/${row.id}/create`,
          "POST",
          { idempotencyKey: key },
          "タスクを作成できませんでした。",
        );
        keys.delete(row.id);
        await load();
        message.value = "タスクを作成しました。";
      } else {
        await adminMutation(
          `/api/admin/task-templates/${row.id}`,
          "PATCH",
          { enabled: !row.enabled, updatedAt: row.updated_at },
          "定期作成を変更できませんでした。",
        );
        await load();
        message.value = row.enabled
          ? "定期作成を停止しました。"
          : "定期作成を再開しました。";
      }
    }).catch(setMessage);
  });
  reset();
  void load().catch((error) => retry.fail(error));
  document.addEventListener("astro:before-swap", () => controller.abort(), {
    once: true,
  });
}
document.addEventListener("astro:page-load", initialize);
initialize();
