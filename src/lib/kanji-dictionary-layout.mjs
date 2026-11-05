const headingText = (node) => {
  if (!node || typeof node !== "object") return "";
  if (node.type === "text" || node.type === "inlineCode") {
    return String(node.value ?? "");
  }
  return Array.isArray(node.children)
    ? node.children.map(headingText).join("")
    : "";
};

const kanjiHeadingKind = (node) => {
  if (node?.type !== "heading" || node.depth !== 3) return null;
  const label = headingText(node).replace(/\s+/gu, "").trim();
  if (label === "【一字】") return "single";
  if (label === "【熟語】") return "compound";
  return null;
};

const tableCellText = (node) => {
  if (!node || typeof node !== "object") return "";
  if (node.type === "text" || node.type === "inlineCode") {
    return String(node.value ?? "");
  }
  return Array.isArray(node.children)
    ? node.children.map(tableCellText).join("")
    : "";
};

function markKanjiTables(nodes) {
  for (const node of nodes) {
    if (node?.type === "table" && node.children?.length > 1) {
      const header = node.children[0]?.children ?? [];
      const headers = header.map((cell) => tableCellText(cell).trim());
      if (
        headers.length === 2 &&
        ["漢字", "字"].includes(headers[0]) &&
        ["読み", "よみ"].includes(headers[1])
      ) {
        node.data ??= {};
        node.data.hProperties ??= {};
        const currentClasses = node.data.hProperties.className;
        const classes = Array.isArray(currentClasses)
          ? currentClasses
          : typeof currentClasses === "string"
            ? currentClasses.split(/\s+/u).filter(Boolean)
            : [];
        node.data.hProperties.className = [
          ...new Set([...classes, "kanji-character-table"]),
        ];

        const rows = node.children.slice(1);
        for (let index = 0; index < rows.length;) {
          const readingCell = rows[index]?.children?.[1];
          const reading = tableCellText(readingCell).trim();
          if (!reading || reading === "-") {
            index += 1;
            continue;
          }
          let end = index + 1;
          while (
            end < rows.length &&
            tableCellText(rows[end]?.children?.[1]).trim() === reading
          ) {
            end += 1;
          }
          if (end - index > 1) {
            readingCell.data ??= {};
            readingCell.data.hProperties ??= {};
            readingCell.data.hProperties.rowSpan = end - index;
            for (let duplicate = index + 1; duplicate < end; duplicate += 1) {
              rows[duplicate].children.splice(1, 1);
              rows[duplicate].data ??= {};
              rows[duplicate].data.hProperties ??= {};
              rows[duplicate].data.hProperties.className = [
                ...(Array.isArray(rows[duplicate].data.hProperties.className)
                  ? rows[duplicate].data.hProperties.className
                  : []),
                "kanji-reading-covered",
              ];
            }
          }
          index = end;
        }
      }
    }
  }
}

const makeColumn = (kind, children) => ({
  type: "paragraph",
  data: {
    hName: "section",
    hProperties: { className: ["kanji-entry-column", `kanji-entry-${kind}`] },
  },
  children,
});

const makeGrid = (firstKind, firstNodes, secondKind, secondNodes) => {
  const singleNodes = firstKind === "single" ? firstNodes : secondNodes;
  markKanjiTables(singleNodes);
  return {
    type: "paragraph",
    data: {
      hName: "div",
      hProperties: { className: ["kanji-entry-grid"] },
    },
    children: [
      makeColumn(firstKind, firstNodes),
      makeColumn(secondKind, secondNodes),
    ],
  };
};

/**
 * Turn adjacent 「一字」「熟語」 subsections in Kanji articles into a
 * responsive two-column dictionary layout. Markdown remains the source of
 * truth, so both the operator preview and public article keep the same content.
 */
export function remarkKanjiDictionaryLayout() {
  return (tree) => {
    const children = tree?.children;
    if (!Array.isArray(children)) return;

    for (let sectionStart = 0; sectionStart < children.length;) {
      if (
        children[sectionStart]?.type !== "heading" ||
        children[sectionStart].depth !== 2
      ) {
        sectionStart += 1;
        continue;
      }
      let sectionEnd = sectionStart + 1;
      while (
        sectionEnd < children.length &&
        !(
          children[sectionEnd]?.type === "heading" &&
          children[sectionEnd].depth === 2
        )
      ) {
        sectionEnd += 1;
      }

      const sectionNodes = children.slice(sectionStart + 1, sectionEnd);
      const headingIndexes = [];
      for (let index = 0; index < sectionNodes.length; index += 1) {
        if (
          sectionNodes[index]?.type === "heading" &&
          sectionNodes[index].depth === 3
        ) {
          headingIndexes.push(index);
        }
      }

      const output = [];
      let cursor = 0;
      let pairPosition = 0;
      while (pairPosition + 1 < headingIndexes.length) {
        const firstIndex = headingIndexes[pairPosition];
        const secondIndex = headingIndexes[pairPosition + 1];
        const firstKind = kanjiHeadingKind(sectionNodes[firstIndex]);
        const secondKind = kanjiHeadingKind(sectionNodes[secondIndex]);
        if (!firstKind || !secondKind || firstKind === secondKind) {
          pairPosition += 1;
          continue;
        }

        const thirdIndex =
          headingIndexes[pairPosition + 2] ?? sectionNodes.length;
        output.push(...sectionNodes.slice(cursor, firstIndex));
        output.push(
          makeGrid(
            firstKind,
            sectionNodes.slice(firstIndex, secondIndex),
            secondKind,
            sectionNodes.slice(secondIndex, thirdIndex),
          ),
        );
        cursor = thirdIndex;
        pairPosition += 2;
      }

      output.push(...sectionNodes.slice(cursor));
      children.splice(
        sectionStart + 1,
        sectionEnd - sectionStart - 1,
        ...output,
      );
      sectionStart += output.length + 1;
    }
  };
}

/** Remove GFM's padded empty reading cell from rows covered by a rowspan. */
export function rehypeKanjiDictionaryLayout() {
  return (tree) => {
    const visit = (node) => {
      if (!node || typeof node !== "object") return;
      if (node.type === "element" && node.tagName === "tr") {
        const rawClasses = node.properties?.className;
        const classes = Array.isArray(rawClasses)
          ? rawClasses.map(String)
          : typeof rawClasses === "string"
            ? rawClasses.split(/\s+/u).filter(Boolean)
            : [];
        if (classes.includes("kanji-reading-covered")) {
          let cellCount = 0;
          node.children = (node.children ?? []).filter((child) => {
            if (child?.type !== "element" || child.tagName !== "td")
              return true;
            cellCount += 1;
            return cellCount !== 2;
          });
        }
      }
      if (Array.isArray(node.children)) node.children.forEach(visit);
    };
    visit(tree);
  };
}
