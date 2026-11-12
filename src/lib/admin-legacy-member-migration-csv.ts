export type LegacyMemberMigrationRow = {
  email: string;
  subjects: string[];
  projectManager: boolean;
  sourceNote: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const subjectPattern = /^[a-z0-9-]+$/;

function parseCsvRows(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (quoted) {
        quoted = false;
      } else if (!field) {
        quoted = true;
      } else {
        throw new Error("CSVの引用符の位置を確認してください。");
      }
      continue;
    }

    if (!quoted && character === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (!quoted && (character === "\n" || character === "\r")) {
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      continue;
    }

    field += character;
  }

  if (quoted) throw new Error("CSVの引用符が閉じていません。");
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

export function parseLegacyMemberMigrationCsv(
  input: string,
): LegacyMemberMigrationRow[] {
  const rows = parseCsvRows(input);
  if (rows.length < 2)
    throw new Error("見出し行と、1人以上の移行データを入力してください。");

  const headers = rows[0].map((value) => value.trim());
  const requiredHeaders = ["email", "subjects", "projectManager", "sourceNote"];
  if (
    headers.length !== requiredHeaders.length ||
    requiredHeaders.some((header, index) => headers[index] !== header)
  )
    throw new Error(
      "CSVの1行目は email,subjects,projectManager,sourceNote の順にしてください。",
    );

  if (rows.length - 1 > 50)
    throw new Error("一度に移行できるのは50人までです。");

  const seenEmails = new Set<string>();
  return rows.slice(1).map((cells, index) => {
    const line = index + 2;
    if (cells.length !== requiredHeaders.length)
      throw new Error(`CSV ${line}行目の列数が見出しと一致しません。`);

    const email = cells[0].trim().toLowerCase();
    if (!emailPattern.test(email))
      throw new Error(`CSV ${line}行目のメールアドレスを確認してください。`);
    if (seenEmails.has(email))
      throw new Error(`CSV ${line}行目でメールアドレスが重複しています。`);
    seenEmails.add(email);

    const subjects = Array.from(
      new Set(
        cells[1]
          .split(/[;|]/)
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    if (
      subjects.some(
        (subject) => subject !== "*" && !subjectPattern.test(subject),
      ) ||
      (subjects.includes("*") && subjects.length > 1)
    )
      throw new Error(`CSV ${line}行目の担当分野を確認してください。`);

    const managerValue = cells[2].trim().toLowerCase();
    if (!["true", "false", "yes", "no", "1", "0"].includes(managerValue))
      throw new Error(
        `CSV ${line}行目のprojectManagerは true/false（または yes/no）を指定してください。`,
      );
    const projectManager = ["true", "yes", "1"].includes(managerValue);
    const sourceNote = cells[3].trim();
    if (!sourceNote)
      throw new Error(
        `CSV ${line}行目に既存メンバーの確認根拠を入力してください。`,
      );
    if (!subjects.length && !projectManager)
      throw new Error(`CSV ${line}行目に移行する権限がありません。`);

    return { email, subjects, projectManager, sourceNote };
  });
}
