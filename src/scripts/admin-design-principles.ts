import { readAdminApiJson } from "../lib/admin-api";
import type {
  DesignPrincipleCategory,
  DesignPrincipleSourceDraft,
  DesignPrincipleStatus,
} from "../lib/admin-design-principles";
import { adminMutation, withAdminButtonLock } from "./admin-mutation";
import { createAdminLoadRetry } from "./admin-load-retry";

type Principle = {
  id: string;
  title: string;
  category: DesignPrincipleCategory;
  statement: string;
  rationale: string;
  status: DesignPrincipleStatus;
  updated_at: string;
  sources: DesignPrincipleSourceDraft[];
};
type ApiData = { principles: Principle[]; error?: string };
const categoryLabels: Record<DesignPrincipleCategory, string> = {
  selection: "入力・選択",
  information: "情報設計",
  feedback: "状態・フィードバック",
  accessibility: "アクセシビリティ",
  consistency: "一貫性・拡張性",
  other: "その他",
};
const statusLabels: Record<DesignPrincipleStatus, string> = {
  candidate: "候補",
  active: "運用中",
  archived: "アーカイブ",
};

function initialize() {
  const root = document.querySelector<HTMLElement>("[data-design-principles]");
  if (!root || root.dataset.ready) return;
  root.dataset.ready = "true";
  const form = root.querySelector<HTMLFormElement>("[data-principle-form]")!;
  const list = root.querySelector<HTMLElement>("[data-principle-list]")!;
  const sources = root.querySelector<HTMLElement>("[data-source-list]")!;
  const message = root.querySelector<HTMLOutputElement>(
    "[data-principle-message]",
  )!;
  const save = root.querySelector<HTMLButtonElement>("[data-save-principle]")!;
  const heading = root.querySelector<HTMLElement>("[data-editor-heading]")!;
  const count = root.querySelector<HTMLElement>("[data-principle-count]")!;
  const categoryFilter = root.querySelector<HTMLSelectElement>(
    "[data-filter-category]",
  )!;
  const statusFilter = root.querySelector<HTMLSelectElement>(
    "[data-filter-status]",
  )!;
  let principles: Principle[] = [];

  const field = <
    T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  >(
    name: string,
  ) => form.elements.namedItem(name) as T;
  const addSourceRow = (
    source: DesignPrincipleSourceDraft = { label: "", href: "", excerpt: "" },
  ) => {
    const row = document.createElement("div");
    row.className = "source-row";
    row.dataset.principleSource = "";
    const label = document.createElement("label");
    label.textContent = "フィードバック名";
    const labelInput = document.createElement("input");
    labelInput.dataset.sourceLabel = "";
    labelInput.maxLength = 160;
    labelInput.required = true;
    labelInput.value = source.label;
    label.append(labelInput);
    const href = document.createElement("label");
    href.textContent = "ADMIN内URL";
    const hrefInput = document.createElement("input");
    hrefInput.dataset.sourceHref = "";
    hrefInput.type = "text";
    hrefInput.maxLength = 2_000;
    hrefInput.required = true;
    hrefInput.placeholder = "/admin/editor/?document=...#feedback";
    hrefInput.value = source.href;
    href.append(hrefInput);
    const excerptLabel = document.createElement("label");
    excerptLabel.textContent = "要点・抜粋（任意）";
    const excerpt = document.createElement("textarea");
    excerpt.dataset.sourceExcerpt = "";
    excerpt.maxLength = 800;
    excerpt.rows = 2;
    excerpt.value = source.excerpt;
    excerptLabel.append(excerpt);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary-button";
    remove.dataset.removeSource = "";
    remove.textContent = "削除";
    remove.setAttribute("aria-label", "この元フィードバックを削除");
    remove.addEventListener("click", () => {
      if (sources.children.length <= 1) return;
      row.remove();
      refreshSourceButtons();
    });
    row.append(label, href, excerptLabel, remove);
    sources.append(row);
    refreshSourceButtons();
  };
  const refreshSourceButtons = () => {
    const disabled = sources.children.length <= 1;
    sources
      .querySelectorAll<HTMLButtonElement>("[data-remove-source]")
      .forEach((button) => {
        button.disabled = disabled;
      });
  };
  const readSources = (): DesignPrincipleSourceDraft[] =>
    Array.from(
      sources.querySelectorAll<HTMLElement>("[data-principle-source]"),
      (row) => ({
        label:
          row.querySelector<HTMLInputElement>("[data-source-label]")?.value ??
          "",
        href:
          row.querySelector<HTMLInputElement>("[data-source-href]")?.value ??
          "",
        excerpt:
          row.querySelector<HTMLTextAreaElement>("[data-source-excerpt]")
            ?.value ?? "",
      }),
    );
  const reset = () => {
    form.reset();
    field<HTMLInputElement>("id").value = "";
    field<HTMLInputElement>("updatedAt").value = "";
    sources.replaceChildren();
    addSourceRow();
    heading.textContent = "設計原則を追加";
    save.textContent = "保存";
    message.value = "";
  };
  const render = () => {
    const category = categoryFilter.value;
    const status = statusFilter.value;
    const filtered = principles.filter(
      (principle) =>
        (category === "all" || principle.category === category) &&
        (status === "all" || principle.status === status),
    );
    count.textContent = `${filtered.length}件を表示（全${principles.length}件）`;
    list.replaceChildren();
    if (!filtered.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = principles.length
        ? "条件に一致する設計原則はありません。"
        : "設計原則はまだ登録されていません。上のフォームから追加できます。";
      list.append(empty);
      return;
    }
    for (const principle of filtered) {
      const card = document.createElement("article");
      card.className = "principle-card";
      const header = document.createElement("header");
      const title = document.createElement("h3");
      title.textContent = principle.title;
      const actions = document.createElement("div");
      actions.className = "principle-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "secondary-button";
      edit.textContent = "編集";
      edit.addEventListener("click", () => {
        field<HTMLInputElement>("id").value = principle.id;
        field<HTMLInputElement>("updatedAt").value = principle.updated_at;
        field<HTMLInputElement>("title").value = principle.title;
        field<HTMLSelectElement>("category").value = principle.category;
        field<HTMLSelectElement>("status").value = principle.status;
        field<HTMLTextAreaElement>("statement").value = principle.statement;
        field<HTMLTextAreaElement>("rationale").value = principle.rationale;
        sources.replaceChildren();
        principle.sources.forEach(addSourceRow);
        heading.textContent = "設計原則を編集";
        save.textContent = "変更を保存";
        message.value = "";
        form.scrollIntoView({ behavior: "smooth", block: "start" });
        field<HTMLInputElement>("title").focus({ preventScroll: true });
      });
      actions.append(edit);
      header.append(title, actions);
      const meta = document.createElement("div");
      meta.className = "principle-meta";
      for (const label of [
        categoryLabels[principle.category],
        statusLabels[principle.status],
      ]) {
        const tag = document.createElement("span");
        tag.textContent = label;
        meta.append(tag);
      }
      const statement = document.createElement("p");
      statement.className = "principle-statement";
      statement.textContent = principle.statement;
      card.append(header, meta, statement);
      if (principle.rationale) {
        const rationale = document.createElement("p");
        rationale.className = "principle-rationale";
        rationale.textContent = principle.rationale;
        card.append(rationale);
      }
      const sourceList = document.createElement("div");
      sourceList.className = "principle-sources";
      const sourceHeading = document.createElement("strong");
      sourceHeading.textContent = `元フィードバック（${principle.sources.length}件）`;
      sourceList.append(sourceHeading);
      for (const source of principle.sources) {
        const sourceEntry = document.createElement("div");
        sourceEntry.className = "principle-source";
        const link = document.createElement("a");
        link.className = "source-link";
        link.href = source.href;
        link.textContent = source.label;
        sourceEntry.append(link);
        if (source.excerpt) {
          const excerpt = document.createElement("p");
          excerpt.textContent = source.excerpt;
          sourceEntry.append(excerpt);
        }
        sourceList.append(sourceEntry);
      }
      card.append(sourceList);
      list.append(card);
    }
  };
  const load = async () => {
    retry.begin();
    const response = await fetch("/api/admin/design-principles", {
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = await readAdminApiJson<ApiData>(
      response,
      "設計原則を読み込めませんでした。",
    );
    if (!response.ok)
      throw new Error(data.error || "設計原則を読み込めませんでした。");
    if (!root.isConnected) return;
    principles = data.principles;
    render();
    retry.success();
  };
  const retry = createAdminLoadRetry(
    root,
    load,
    "設計原則を読み込めませんでした。",
  );
  root
    .querySelector<HTMLButtonElement>("[data-add-source]")!
    .addEventListener("click", () => addSourceRow());
  root
    .querySelector<HTMLButtonElement>("[data-reset-principle]")!
    .addEventListener("click", reset);
  categoryFilter.addEventListener("change", render);
  statusFilter.addEventListener("change", render);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void withAdminButtonLock(save, async () => {
      const id = field<HTMLInputElement>("id").value;
      const payload = {
        title: field<HTMLInputElement>("title").value,
        category: field<HTMLSelectElement>("category").value,
        status: field<HTMLSelectElement>("status").value,
        statement: field<HTMLTextAreaElement>("statement").value,
        rationale: field<HTMLTextAreaElement>("rationale").value,
        sources: readSources(),
        ...(id
          ? { updatedAt: field<HTMLInputElement>("updatedAt").value }
          : {}),
      };
      await adminMutation(
        `/api/admin/design-principles${id ? `/${id}` : ""}`,
        id ? "PATCH" : "POST",
        payload,
        "設計原則を保存できませんでした。",
      );
      reset();
      await load();
      message.value = "設計原則を保存しました。";
    }).catch((error: unknown) => {
      message.value =
        error instanceof Error
          ? error.message
          : "設計原則を保存できませんでした。";
    });
  });
  reset();
  void load().catch((error: unknown) => retry.fail(error));
}

document.addEventListener("astro:page-load", initialize);
initialize();
