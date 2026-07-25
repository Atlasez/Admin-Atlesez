import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import katex from "katex";
import "katex/contrib/mhchem";

const ROOT = "src/content/articles";
const macros = {
  "\\dv": "\\frac{\\mathrm{d}#1}{\\mathrm{d}#2}",
  "\\dvtwo": "\\frac{\\mathrm{d}^{2}#1}{\\mathrm{d}#2^{2}}",
  "\\dd": "\\,\\mathrm{d}#1",
  "\\vdot": "\\mathbin{\\cdot}",
  "\\divergence": "\\nabla\\mathbin{\\cdot}",
};

async function markdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory()
        ? markdownFiles(path)
        : path.endsWith(".md")
          ? [path]
          : [];
    }),
  );
  return nested.flat();
}

function lineAt(text, offset) {
  return text.slice(0, offset).split("\n").length;
}

const failures = [];
for (const file of await markdownFiles(ROOT)) {
  const text = await readFile(file, "utf8");
  const ranges = [];
  const blockPattern = /\$\$([\s\S]*?)\$\$/g;
  let match;
  while ((match = blockPattern.exec(text))) {
    ranges.push([match.index, blockPattern.lastIndex]);
    try {
      katex.renderToString(match[1], {
        displayMode: true,
        throwOnError: true,
        strict: "ignore",
        macros,
      });
    } catch (error) {
      failures.push(
        `${relative(".", file)}:${lineAt(text, match.index)}: ${error.message}`,
      );
    }
  }
  const withoutBlocks = [...text]
    .map((char, index) =>
      ranges.some(([start, end]) => index >= start && index < end) ? " " : char,
    )
    .join("");
  const inlinePattern = /(?<!\\)\$([^$\n]+?)(?<!\\)\$/g;
  while ((match = inlinePattern.exec(withoutBlocks))) {
    try {
      katex.renderToString(match[1], {
        displayMode: false,
        throwOnError: true,
        strict: "ignore",
        macros,
      });
    } catch (error) {
      failures.push(
        `${relative(".", file)}:${lineAt(text, match.index)}: ${error.message}`,
      );
    }
  }
  const prose = withoutBlocks.replace(inlinePattern, "");
  const rawCommand = /\\(?:begin|end)\{[^}]+\}/g;
  while ((match = rawCommand.exec(prose))) {
    failures.push(
      `${relative(".", file)}:${lineAt(text, match.index)}: math environment outside $ delimiters: ${match[0]}`,
    );
  }
}

if (failures.length) {
  console.error(
    `Math audit failed (${failures.length}):\n${failures.join("\n")}`,
  );
  process.exit(1);
}
console.log("Math audit passed: every delimited formula renders with KaTeX.");
