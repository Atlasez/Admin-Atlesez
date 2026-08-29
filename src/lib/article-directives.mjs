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

/**
 * Directive titles are normally plain text, but mathematics articles also
 * use titles such as `:::prop $G$ の群`.  A raw HTML title is not visited by
 * remark-math, so keep the title as MDAST inline nodes and let the shared
 * KaTeX pipeline render it with the article's macros.
 */
const titleNodes = (value) => {
  const nodes = [];
  const source = String(value ?? "");
  const pattern = /\$([^$\r\n]+)\$/g;
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor)
      nodes.push({ type: "text", value: source.slice(cursor, start) });
    nodes.push({
      type: "inlineMath",
      value: match[1],
      data: {
        hName: "code",
        hProperties: { className: ["language-math", "math-inline"] },
        hChildren: [{ type: "text", value: match[1] }],
      },
    });
    cursor = start + match[0].length;
  }
  if (cursor < source.length)
    nodes.push({ type: "text", value: source.slice(cursor) });
  return nodes.length ? nodes : [{ type: "text", value: source }];
};

const titleParagraph = (
  marker,
  { className, tagName = "p", preserveSource = false } = {},
) => {
  const properties =
    className && tagName !== "p" ? { className: [className] } : undefined;
  const children =
    className && tagName === "p"
      ? [
          {
            type: "html",
            value: `<span class="${escapeHtml(className)}"${preserveSource ? ` data-authored-statement-title="${escapeHtml(marker.title)}"` : ""}>`,
          },
          ...titleNodes(marker.title),
          { type: "html", value: "</span>" },
        ]
      : titleNodes(marker.title);
  return {
    type: "paragraph",
    data: {
      hName: tagName,
      ...(properties ? { hProperties: properties } : {}),
    },
    children,
  };
};

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
  if (
    !node.children.every(
      (child) => child.type === "text" || child.type === "inlineMath",
    )
  )
    return null;
  return node.children
    .map((child) =>
      child.type === "inlineMath" ? `$${child.value}$` : child.value,
    )
    .join("");
}

function directiveMarkup(marker) {
  const safeName = marker.name.replace(/[^a-z0-9_-]/g, "");
  const id = marker.id
    ? ` id="${escapeHtml(marker.id)}" data-statement-id="${escapeHtml(marker.id)}"`
    : "";
  if (marker.name === "proof") {
    return {
      open: `<details class="proof-details" data-directive="proof" open>`,
      title: titleParagraph(marker, { tagName: "summary" }),
      bodyOpen: `<div class="proof-details-inner">`,
      close: "</div></details>",
    };
  }

  if (marker.name === "folding") {
    return {
      open: `<details class="folding" data-directive="folding">`,
      title: titleParagraph(marker, { tagName: "summary" }),
      bodyOpen: `<div class="folding-content">`,
      close: "</div></details>",
    };
  }

  const semanticClass = SEMANTIC_CLASSES[marker.name];
  if (semanticClass) {
    return {
      open: `<section class="article-directive ${semanticClass}" data-directive="${safeName}"${id}>`,
      title: titleParagraph(marker, {
        className: "thmtitle",
        preserveSource: true,
      }),
      close: "</section>",
    };
  }

  return {
    open: `<section class="article-directive article-directive-${safeName}" data-directive="${safeName}">`,
    title: titleParagraph(marker, {
      className: "article-directive-title",
      tagName: "div",
    }),
    bodyOpen: `<div class="article-directive-body">`,
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
        if (markup.title) output.push(markup.title);
        if (markup.bodyOpen)
          output.push({ type: "html", value: markup.bodyOpen });
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
