/**
 * Keep the native multi-select as the source of truth. Large assignee lists
 * use a searchable tag picker; smaller multi-selects keep the checkbox view.
 */
const SELECTOR =
  "[data-admin-shell] select[multiple]:not([data-calendar-holiday-country])";

const syncFromNative = (
  select: HTMLSelectElement,
  list: HTMLElement,
  count: HTMLElement,
) => {
  const selected = new Set(
    Array.from(select.selectedOptions).map((option) => option.value),
  );
  list
    .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    .forEach((input) => {
      input.checked = selected.has(input.value);
    });
  count.textContent = `${selected.size}件選択中`;
};

const render = (
  select: HTMLSelectElement,
  list: HTMLElement,
  count: HTMLElement,
  renderedOptions: { signature: string | null },
) => {
  const options = Array.from(select.options).filter(
    (option) => !option.disabled && option.value,
  );
  const signature = JSON.stringify(
    options.map((option) => ({
      value: option.value,
      label: option.textContent?.trim() || option.value,
      disabled: option.disabled,
    })),
  );
  if (renderedOptions.signature === signature) {
    syncFromNative(select, list, count);
    return;
  }
  renderedOptions.signature = signature;
  list.replaceChildren();
  if (!options.length) {
    list.textContent = "選択できる項目がありません。";
    count.textContent = "0件選択中";
    return;
  }
  for (const option of options) {
    const label = document.createElement("label");
    label.className = "admin-multi-select-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = option.value;
    input.checked = option.selected;
    input.disabled = option.disabled;
    input.addEventListener("change", () => {
      const nativeOption = Array.from(select.options).find(
        (candidate) => candidate.value === input.value,
      );
      if (!nativeOption) return;
      nativeOption.selected = input.checked;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      syncFromNative(select, list, count);
    });
    const text = document.createElement("span");
    text.textContent = option.textContent?.trim() || option.value;
    label.append(input, text);
    list.append(label);
  }
  syncFromNative(select, list, count);
};

const visibleOptions = (select: HTMLSelectElement) =>
  Array.from(select.options).filter(
    (option) => !option.disabled && option.value,
  );

const optionLabel = (option: HTMLOptionElement) =>
  option.textContent?.trim() || option.value;

const enhanceTagSelect = (select: HTMLSelectElement) => {
  if (select.dataset.multiEnhanced === "true") return;
  select.dataset.multiEnhanced = "true";
  const wrapper = document.createElement("div");
  wrapper.className = "admin-tag-select";
  const chips = document.createElement("div");
  chips.className = "admin-tag-select-chips";
  chips.setAttribute("role", "list");
  chips.setAttribute("aria-label", "選択中の項目");
  const input = document.createElement("input");
  input.type = "search";
  input.className = "admin-tag-select-input";
  input.autocomplete = "off";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.placeholder =
    select.dataset.searchPlaceholder || "名前・メール・グループ名で検索";
  input.setAttribute(
    "aria-label",
    select.dataset.selectionLabel || "候補を検索",
  );
  const requiredSelection = select.required;
  if (requiredSelection) input.setAttribute("aria-required", "true");
  const describedBy = select.getAttribute("aria-describedby");
  if (describedBy) input.setAttribute("aria-describedby", describedBy);
  select.required = false;
  const list = document.createElement("div");
  list.className = "admin-tag-select-options";
  list.setAttribute("role", "listbox");
  list.id = `admin-tag-options-${crypto.randomUUID()}`;
  input.setAttribute("aria-controls", list.id);
  list.hidden = true;
  const control = document.createElement("div");
  control.className = "admin-tag-select-control";
  control.append(input, list);
  const footer = document.createElement("div");
  footer.className = "admin-tag-select-footer";
  const count = document.createElement("output");
  count.className = "admin-tag-select-count";
  count.setAttribute("aria-live", "polite");
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "admin-tag-select-clear";
  clear.textContent = "すべて解除";
  footer.append(count, clear);
  select.classList.add("admin-multi-select-native");
  select.setAttribute("aria-hidden", "true");
  select.tabIndex = -1;
  select.parentElement?.insertBefore(wrapper, select);
  wrapper.append(chips, control, footer);

  const chipNodes = new Map<
    string,
    { root: HTMLSpanElement; label: HTMLSpanElement }
  >();
  const resultNodes = new Map<string, HTMLButtonElement>();
  const selectedValueSet = () =>
    new Set(Array.from(select.selectedOptions, (option) => option.value));
  let activeIndex = -1;
  let open = false;

  const setOpen = (next: boolean) => {
    open = next;
    list.hidden = !open;
    input.setAttribute("aria-expanded", String(open));
  };

  const reconcileOrder = (parent: HTMLElement, nodes: HTMLElement[]) => {
    nodes.forEach((node, index) => {
      const current = parent.children.item(index);
      if (current !== node) parent.insertBefore(node, current);
    });
  };

  const renderChips = () => {
    input.disabled = select.disabled;
    input.setAttribute(
      "aria-required",
      String(requiredSelection && !select.disabled),
    );
    const selected = Array.from(select.selectedOptions).filter(
      (option) => option.value,
    );
    const selectedValues = new Set(selected.map((option) => option.value));
    for (const [value, node] of chipNodes) {
      if (selectedValues.has(value)) continue;
      node.root.remove();
      chipNodes.delete(value);
    }
    const ordered: HTMLSpanElement[] = [];
    for (const option of selected) {
      let node = chipNodes.get(option.value);
      if (!node) {
        const root = document.createElement("span");
        root.className = "admin-tag-select-chip";
        root.setAttribute("role", "listitem");
        const label = document.createElement("span");
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "admin-tag-select-remove";
        remove.textContent = "×";
        remove.addEventListener("click", () => {
          const current = visibleOptions(select).find(
            (candidate) => candidate.value === option.value,
          );
          if (!current) return;
          current.selected = false;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          input.focus();
          sync();
        });
        root.append(label, remove);
        node = { root, label };
        chipNodes.set(option.value, node);
      }
      const labelText = optionLabel(option);
      if (node.label.textContent !== labelText)
        node.label.textContent = labelText;
      const remove = node.root.querySelector<HTMLButtonElement>(
        ".admin-tag-select-remove",
      )!;
      remove.setAttribute("aria-label", `${labelText}を解除`);
      remove.disabled = select.disabled;
      ordered.push(node.root);
    }
    reconcileOrder(chips, ordered);
    count.textContent = `${selected.length}件選択中`;
    clear.disabled = select.disabled || selected.length === 0;
    input.setCustomValidity(
      requiredSelection && !select.disabled && selected.length === 0
        ? "1つ以上選択してください。"
        : "",
    );
  };

  const renderResults = () => {
    const selected = selectedValueSet();
    const query = input.value.trim().toLocaleLowerCase();
    const matches = visibleOptions(select).filter((option) => {
      if (selected.has(option.value)) return false;
      const label =
        `${optionLabel(option)} ${option.value}`.toLocaleLowerCase();
      return !query || label.includes(query);
    });
    const maxResults = query ? 20 : 12;
    const visible = matches.slice(0, maxResults);
    const visibleValues = new Set(visible.map((option) => option.value));
    for (const [value, node] of resultNodes) {
      if (visibleValues.has(value)) continue;
      node.remove();
      resultNodes.delete(value);
    }
    const ordered: HTMLButtonElement[] = [];
    for (const option of visible) {
      let node = resultNodes.get(option.value);
      if (!node) {
        node = document.createElement("button");
        node.type = "button";
        node.className = "admin-tag-select-option";
        node.setAttribute("role", "option");
        node.setAttribute("aria-selected", "false");
        node.addEventListener("pointerdown", (event) => event.preventDefault());
        node.addEventListener("click", () => {
          const current = visibleOptions(select).find(
            (candidate) => candidate.value === option.value,
          );
          if (!current || current.disabled) return;
          const exclusive = current.dataset.selectionExclusive === "true";
          if (exclusive) {
            for (const candidate of Array.from(select.options))
              candidate.selected = false;
          } else {
            for (const candidate of Array.from(select.options))
              if (candidate.dataset.selectionExclusive === "true")
                candidate.selected = false;
          }
          current.selected = true;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          input.value = "";
          activeIndex = -1;
          sync();
          input.focus();
        });
        resultNodes.set(option.value, node);
      }
      const labelText = optionLabel(option);
      if (node.textContent !== labelText) node.textContent = labelText;
      node.disabled = select.disabled || option.disabled;
      ordered.push(node);
    }
    reconcileOrder(list, ordered);
    const active = ordered[activeIndex];
    for (const node of ordered)
      node.setAttribute("aria-selected", String(node === active));
    input.removeAttribute("aria-activedescendant");
    if (active) {
      active.id ||= `admin-tag-option-${crypto.randomUUID()}`;
      input.setAttribute("aria-activedescendant", active.id);
    }
    const hint = list.querySelector<HTMLElement>(".admin-tag-select-hint");
    if (hint) hint.remove();
    if (matches.length > maxResults) {
      const more = document.createElement("p");
      more.className = "admin-tag-select-hint";
      more.textContent = `${matches.length}件中${visible.length}件を表示。名前やメールで絞り込んでください。`;
      list.append(more);
    } else if (!visible.length) {
      const empty = document.createElement("p");
      empty.className = "admin-tag-select-hint";
      empty.textContent = query
        ? "候補が見つかりません。"
        : "追加できる候補はありません。";
      list.append(empty);
    }
  };

  const sync = () => {
    renderChips();
    renderResults();
  };
  input.addEventListener("focus", () => {
    setOpen(true);
    renderResults();
  });
  input.addEventListener("input", () => {
    activeIndex = -1;
    setOpen(true);
    renderResults();
  });
  input.addEventListener("keydown", (event) => {
    const options = Array.from(
      list.querySelectorAll<HTMLButtonElement>(".admin-tag-select-option"),
    );
    if (event.key === "ArrowDown" && options.length) {
      event.preventDefault();
      activeIndex = (activeIndex + 1) % options.length;
      renderResults();
    } else if (event.key === "ArrowUp" && options.length) {
      event.preventDefault();
      activeIndex = activeIndex <= 0 ? options.length - 1 : activeIndex - 1;
      renderResults();
    } else if (event.key === "Enter" && open && options.length) {
      event.preventDefault();
      options[activeIndex < 0 ? 0 : activeIndex]?.click();
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      activeIndex = -1;
      renderResults();
    } else if (
      event.key === "Backspace" &&
      !input.value &&
      select.selectedOptions.length
    ) {
      const last = Array.from(select.selectedOptions).at(-1);
      if (last) {
        last.selected = false;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        sync();
      }
    }
  });
  wrapper.addEventListener("focusout", (event) => {
    if (
      event.relatedTarget instanceof Node &&
      wrapper.contains(event.relatedTarget)
    )
      return;
    setOpen(false);
  });
  clear.addEventListener("click", () => {
    for (const option of Array.from(select.options)) option.selected = false;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    sync();
  });
  select.addEventListener("change", sync);
  const observer = new MutationObserver(() => {
    activeIndex = -1;
    sync();
  });
  observer.observe(select, {
    attributes: true,
    attributeFilter: ["disabled"],
    childList: true,
    subtree: true,
    characterData: true,
  });
  sync();
};

const enhance = (select: HTMLSelectElement) => {
  if (select.dataset.multiEnhanced === "true") return;
  if (select.dataset.selectionMode === "tags") {
    enhanceTagSelect(select);
    return;
  }
  select.dataset.multiEnhanced = "true";
  const wrapper = document.createElement("div");
  wrapper.className = "admin-multi-select";
  const list = document.createElement("div");
  list.className = "admin-multi-select-options";
  list.setAttribute("role", "group");
  const footer = document.createElement("div");
  footer.className = "admin-multi-select-footer";
  const count = document.createElement("output");
  count.className = "admin-multi-select-count";
  count.setAttribute("aria-live", "polite");
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "admin-multi-select-clear";
  clear.textContent = "選択を解除";
  clear.addEventListener("click", () => {
    Array.from(select.options).forEach((option) => {
      option.selected = false;
    });
    select.dispatchEvent(new Event("change", { bubbles: true }));
    syncFromNative(select, list, count);
  });
  footer.append(count, clear);
  select.classList.add("admin-multi-select-native");
  select.setAttribute("aria-hidden", "true");
  select.tabIndex = -1;
  select.parentElement?.insertBefore(wrapper, select);
  wrapper.append(list, footer);
  const renderedOptions = { signature: null as string | null };
  render(select, list, count, renderedOptions);
  const observer = new MutationObserver(() =>
    render(select, list, count, renderedOptions),
  );
  observer.observe(select, { childList: true, subtree: true });
};

const initialize = () => {
  document.querySelectorAll<HTMLSelectElement>(SELECTOR).forEach(enhance);
};

document.addEventListener("astro:page-load", initialize);
initialize();

export {};
