const initialize = () => {
  const content = document.querySelector<HTMLElement>(
    "[data-member-modal-content]",
  );
  if (!content || content.dataset.changePreviewReady) return;
  content.dataset.changePreviewReady = "true";
  const attach = () => {
    const select = content.querySelector<HTMLSelectElement>(
      "[data-modal-permission-subjects]",
    );
    if (!select || select.dataset.changePreviewReady) return;
    select.dataset.changePreviewReady = "true";
    const normalize = (values: string[]) =>
      values.includes("*") ? ["*"] : values;
    const original = normalize(
      [...select.selectedOptions].map((option) => option.value),
    );
    const labels = new Map(
      [...select.options].map((option) => [
        option.value,
        option.textContent ?? option.value,
      ]),
    );
    const summary = document.createElement("section");
    summary.className = "member-modal__section member-modal__wide";
    summary.setAttribute("aria-label", "担当権限の変更案");
    summary.setAttribute("aria-live", "polite");
    select.closest("label")?.after(summary);
    const update = () => {
      const next = normalize(
        [...select.selectedOptions].map((option) => option.value),
      );
      const added = next.filter((value) => !original.includes(value)),
        removed = original.filter((value) => !next.includes(value));
      summary.replaceChildren();
      const heading = document.createElement("h3");
      heading.textContent = "担当権限の変更案";
      summary.append(heading);
      for (const [label, values] of [
        ["追加", added],
        ["解除", removed],
        ["変更後の担当権限", next],
      ] as const) {
        const row = document.createElement("p");
        row.textContent = `${label}: ${values.map((value) => labels.get(value) ?? value).join("、") || "なし"}`;
        summary.append(row);
      }
      const note = document.createElement("small");
      note.textContent =
        "担当権限の保存内容を表示しています。公開審査の担当は別設定です。Discord同期後の実効権限は、保存後に「実効権限」で確認できます。";
      summary.append(note);
    };
    select.addEventListener("change", update);
    update();
  };
  new MutationObserver(attach).observe(content, { childList: true });
  attach();
};
document.addEventListener("astro:page-load", initialize);
initialize();
