const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
      character
    ] ?? character),
  );

const splitTrailingPunctuation = (value: string) => {
  const match = value.match(/[。、,.;:!?]+$/u);
  return match
    ? { clean: value.slice(0, -match[0].length), trailing: match[0] }
    : { clean: value, trailing: "" };
};

const isSafeLink = (value: string) => /^https?:\/\//i.test(value);

/** Render the small, intentionally supported subset of Markdown links used in profiles. */
export const renderSafeLinks = (value: string) => {
  const tokens: string[] = [];
  const addLink = (label: string, destination: string, trailing = "") => {
    const { clean, trailing: punctuation } = splitTrailingPunctuation(destination);
    if (!isSafeLink(clean)) return escapeHtml(`[${label}](${destination})`);
    const displayedLabel = label === destination ? clean : label;
    const index = tokens.push(
      `<a href="${escapeHtml(clean)}" target="_blank" rel="noopener noreferrer">${escapeHtml(displayedLabel)}</a>`,
    ) - 1;
    return `\u0000${index}\u0000${escapeHtml(trailing || punctuation)}`;
  };

  let text = value.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi,
    (_match, label: string, destination: string) => addLink(label, destination),
  );
  text = text.replace(/https?:\/\/[^\s<\u0000]+/gi, (destination) =>
    addLink(destination, destination),
  );
  return escapeHtml(text).replace(/\u0000(\d+)\u0000/g, (_match, index: string) =>
    tokens[Number(index)] ?? "",
  );
};
