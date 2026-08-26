// CommonMark treats a strong delimiter immediately followed by Japanese text
// as non-closing in some cases. Existing articles rely on this compatibility.
const JAPANESE_STRONG_PATTERN = /\*\*([^*\n]+)\*\*(?=[\p{L}\p{N}、。！？])/gu;

export function remarkJapaneseStrong() {
  return (tree) => {
    const visit = (node) => {
      if (!Array.isArray(node?.children)) return;
      const next = [];
      for (const child of node.children) {
        if (child?.type === "text" && typeof child.value === "string") {
          let cursor = 0;
          let matched = false;
          for (const match of child.value.matchAll(JAPANESE_STRONG_PATTERN)) {
            matched = true;
            const start = match.index ?? 0;
            if (start > cursor) next.push({ type: "text", value: child.value.slice(cursor, start) });
            next.push({ type: "strong", children: [{ type: "text", value: match[1] }] });
            cursor = start + match[0].length;
          }
          if (matched) {
            if (cursor < child.value.length) next.push({ type: "text", value: child.value.slice(cursor) });
            continue;
          }
        }
        visit(child);
        next.push(child);
      }
      node.children = next;
    };
    visit(tree);
  };
}
