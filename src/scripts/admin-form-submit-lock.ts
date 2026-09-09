/**
 * 管理画面フォームの二重送信を防ぎ、送信中の状態を一貫して示す。
 * 解除関数は成功・失敗のどちらでも必ず呼び出す。
 */
export const lockAdminForm = (
  form: HTMLFormElement,
  submittingLabel?: string,
) => {
  const buttons = Array.from(
    form.querySelectorAll<HTMLButtonElement>('button[type="submit"]'),
  );
  const originalLabels = buttons.map((button) => button.textContent ?? "");
  const originalDisabled = buttons.map((button) => button.disabled);
  const previousBusy = form.getAttribute("aria-busy");
  const singleButton = buttons.length === 1;

  form.setAttribute("aria-busy", "true");
  buttons.forEach((button) => {
    button.disabled = true;
    if (submittingLabel && singleButton) button.textContent = submittingLabel;
  });

  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (previousBusy === null) form.removeAttribute("aria-busy");
    else form.setAttribute("aria-busy", previousBusy);
    buttons.forEach((button, index) => {
      button.disabled = originalDisabled[index] ?? false;
      button.textContent = originalLabels[index] ?? button.textContent;
    });
  };
};
