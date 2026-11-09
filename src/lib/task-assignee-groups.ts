export type TaskAssigneeMember = {
  email: string;
  display_name?: string;
  name?: string;
  subjects?: string[] | string;
  assigned_subjects?: string[] | string;
};

export type TaskAssigneeSubject = { slug: string; name: string };

export type TaskAssigneeGroup = {
  value: string;
  label: string;
  emails: string[];
};

const normalizeEmail = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const memberSubjects = (member: TaskAssigneeMember) => {
  const values = member.subjects ?? member.assigned_subjects ?? [];
  return new Set(
    (Array.isArray(values) ? values : values.split(","))
      .map((value) => String(value).trim().toLowerCase())
      .filter(Boolean),
  );
};

export function normalizeTaskAssigneeMembers<T extends TaskAssigneeMember>(
  members: T[],
): T[] {
  const normalized = new Map<string, T>();
  for (const member of members) {
    const email = normalizeEmail(member.email);
    if (!email) continue;
    const current = normalized.get(email);
    const nextName = String(member.display_name ?? member.name ?? "").trim();
    const currentName = String(
      current?.display_name ?? current?.name ?? "",
    ).trim();
    if (!current) {
      normalized.set(email, {
        ...member,
        email,
        assigned_subjects: [...memberSubjects(member)],
      });
      continue;
    }
    const selected = !currentName && nextName ? member : current;
    const subjects = new Set([
      ...memberSubjects(current),
      ...memberSubjects(member),
    ]);
    normalized.set(email, {
      ...selected,
      email,
      assigned_subjects: [...subjects],
    });
  }
  return [...normalized.values()];
}

/** Build named subject groups from permission metadata, including global reviewers. */
export function buildTaskAssigneeGroups(
  members: TaskAssigneeMember[],
  subjects: TaskAssigneeSubject[],
): TaskAssigneeGroup[] {
  const normalizedMembers = normalizeTaskAssigneeMembers(members);
  return subjects.flatMap(({ slug, name }) => {
    const key = slug.trim().toLowerCase();
    if (!key || !name.trim()) return [];
    const emails = normalizedMembers
      .filter((member) => {
        const assignedSubjects = memberSubjects(member);
        return assignedSubjects.has("*") || assignedSubjects.has(key);
      })
      .map((member) => normalizeEmail(member.email));
    if (!emails.length) return [];
    return [
      {
        value: `@subject:${key}`,
        label: `${name.trim()}担当全体（${emails.length}人）`,
        emails,
      },
    ];
  });
}

/** Expand selected group options to their current member emails for task creation. */
export function selectedTaskAssigneeEmails(
  select: HTMLSelectElement,
): string[] {
  const emails = new Set<string>();
  for (const option of Array.from(select.selectedOptions)) {
    if (!option.value) continue;
    if (option.dataset.assigneeEmails) {
      try {
        const groupEmails = JSON.parse(
          option.dataset.assigneeEmails,
        ) as unknown;
        if (Array.isArray(groupEmails))
          for (const value of groupEmails) {
            const email = normalizeEmail(value);
            if (email) emails.add(email);
          }
      } catch {
        // Invalid metadata is not treated as an assignee address.
      }
      continue;
    }
    const email = normalizeEmail(option.value);
    if (email && !email.startsWith("@subject:")) emails.add(email);
  }
  return [...emails];
}
