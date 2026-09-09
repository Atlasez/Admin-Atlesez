/**
 * Native multi-selects are difficult to discover on trackpads and touch
 * devices. Keep the native element as the source of truth, but expose the
 * same options as an accessible checkbox list inside the admin shell.
 */
const SELECTOR = '[data-admin-shell] select[multiple]:not([data-calendar-holiday-country])';

const syncFromNative = (select: HTMLSelectElement, list: HTMLElement, count: HTMLElement) => {
  const selected = new Set(Array.from(select.selectedOptions).map((option) => option.value));
  list.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((input) => {
    input.checked = selected.has(input.value);
  });
  count.textContent = `${selected.size}件選択中`;
};

const render = (select: HTMLSelectElement, list: HTMLElement, count: HTMLElement) => {
  const options = Array.from(select.options).filter((option) => !option.disabled && option.value);
  list.replaceChildren();
  if (!options.length) {
    list.textContent = '選択できる項目がありません。';
    count.textContent = '0件選択中';
    return;
  }
  for (const option of options) {
    const label = document.createElement('label');
    label.className = 'admin-multi-select-option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = option.value;
    input.checked = option.selected;
    input.disabled = option.disabled;
    input.addEventListener('change', () => {
      const nativeOption = Array.from(select.options).find((candidate) => candidate.value === input.value);
      if (!nativeOption) return;
      nativeOption.selected = input.checked;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      syncFromNative(select, list, count);
    });
    const text = document.createElement('span');
    text.textContent = option.textContent?.trim() || option.value;
    label.append(input, text);
    list.append(label);
  }
  syncFromNative(select, list, count);
};

const enhance = (select: HTMLSelectElement) => {
  if (select.dataset.multiEnhanced === 'true') return;
  select.dataset.multiEnhanced = 'true';
  const wrapper = document.createElement('div');
  wrapper.className = 'admin-multi-select';
  const list = document.createElement('div');
  list.className = 'admin-multi-select-options';
  list.setAttribute('role', 'group');
  const footer = document.createElement('div');
  footer.className = 'admin-multi-select-footer';
  const count = document.createElement('output');
  count.className = 'admin-multi-select-count';
  count.setAttribute('aria-live', 'polite');
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'admin-multi-select-clear';
  clear.textContent = '選択を解除';
  clear.addEventListener('click', () => {
    Array.from(select.options).forEach((option) => { option.selected = false; });
    select.dispatchEvent(new Event('change', { bubbles: true }));
    syncFromNative(select, list, count);
  });
  footer.append(count, clear);
  select.classList.add('admin-multi-select-native');
  select.setAttribute('aria-hidden', 'true');
  select.tabIndex = -1;
  select.parentElement?.insertBefore(wrapper, select);
  wrapper.append(list, footer);
  render(select, list, count);
  const observer = new MutationObserver(() => render(select, list, count));
  observer.observe(select, { childList: true, subtree: true });
};

const initialize = () => {
  document.querySelectorAll<HTMLSelectElement>(SELECTOR).forEach(enhance);
};

document.addEventListener('astro:page-load', initialize);
initialize();

export {};
