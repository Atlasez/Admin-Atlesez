const DIRECTIVE_LABELS = {
  defi: "定義",
  definition: "定義",
  thm: "定理",
  theorem: "定理",
  prop: "命題",
  proposition: "命題",
  cor: "系",
  corollary: "系",
  lemma: "補題",
  proof: "証明",
  example: "例",
  exercise: "演習",
  remark: "補足",
  note: "注",
  warning: "注意",
  tip: "ヒント",
};

const SEMANTIC_CLASSES = {
  defi: "defi",
  definition: "defi",
  thm: "thm",
  theorem: "thm",
  prop: "prop",
  proposition: "prop",
  cor: "cor",
  corollary: "cor",
  lemma: "lemma",
  example: "example",
};

const escapeHtml = (value) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );

export function parseArticleDirectiveMarker(value) {
  const match = /^\s*(:{3,4})\s*([A-Za-z][A-Za-z0-9_-]*)(?:\s+(.+?))?\s*$/.exec(
    value,
  );
  if (!match) return null;
  const name = match[2].toLowerCase();
  const rawTitle = (match[3] ?? "")
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/^['"]|['"]$/g, "");
  const idMatch = /\s*\{#([A-Za-z][A-Za-z0-9_-]*)\}\s*$/.exec(rawTitle);
  const title = (idMatch ? rawTitle.slice(0, idMatch.index) : rawTitle).trim();
  return {
    fence: match[1],
    name,
    title: title || DIRECTIVE_LABELS[name] || name,
    id: idMatch?.[1] ?? "",
  };
}

export function isArticleDirectiveClose(value, minimumLength = 3) {
  const match = /^\s*(:{3,4})\s*$/.exec(value);
  return Boolean(match && match[1].length >= minimumLength);
}

function paragraphText(node) {
  if (!node || node.type !== "paragraph" || !Array.isArray(node.children))
    return null;
  if (!node.children.every((child) => child.type === "text")) return null;
  return node.children.map((child) => child.value).join("");
}

function directiveMarkup(marker) {
  const safeName = marker.name.replace(/[^a-z0-9_-]/g, "");
  const title = escapeHtml(marker.title);
  const id = marker.id
    ? ` id="${escapeHtml(marker.id)}" data-statement-id="${escapeHtml(marker.id)}"`
    : "";
  if (marker.name === "proof") {
    return {
      open: `<details class="proof-details" data-directive="proof" open><summary>${title}</summary><div class="proof-details-inner">`,
      close: "</div></details>",
    };
  }

  const semanticClass = SEMANTIC_CLASSES[marker.name];
  if (semanticClass) {
    return {
      open: `<section class="article-directive ${semanticClass}" data-directive="${safeName}"${id}><p><span class="thmtitle">${title}</span></p>`,
      close: "</section>",
    };
  }

  return {
    open: `<section class="article-directive article-directive-${safeName}" data-directive="${safeName}"><div class="article-directive-title">${title}</div><div class="article-directive-body">`,
    close: "</div></section>",
  };
}

/**
 * Shared fenced-directive transform for Atlas article Markdown.
 *
 * The plugin emits raw HTML boundaries into MDAST. Astro's unified Markdown
 * processor already runs remark-rehype with allowDangerousHtml followed by
 * rehype-raw, so Markdown nodes between the boundaries become children of the
 * same article box in both the public page and the admin preview.
 */
export function remarkArticleDirectives() {
  return (tree) => {
    if (!tree || tree.type !== "root" || !Array.isArray(tree.children)) return;

    const output = [];
    const stack = [];
    for (const node of tree.children) {
      const text = paragraphText(node);
      const marker = text === null ? null : parseArticleDirectiveMarker(text);
      if (marker) {
        const markup = directiveMarkup(marker);
        output.push({ type: "html", value: markup.open });
        stack.push({ fenceLength: marker.fence.length, close: markup.close });
        continue;
      }

      const active = stack.at(-1);
      if (
        active &&
        text !== null &&
        isArticleDirectiveClose(text, active.fenceLength)
      ) {
        output.push({ type: "html", value: active.close });
        stack.pop();
        continue;
      }

      output.push(node);
    }

    while (stack.length)
      output.push({ type: "html", value: stack.pop().close });
    tree.children = output;
  };
}
