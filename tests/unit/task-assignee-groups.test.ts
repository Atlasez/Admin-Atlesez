import { describe, expect, it } from "vitest";
import {
  buildTaskAssigneeGroups,
  normalizeTaskAssigneeMembers,
  selectedTaskAssigneeEmails,
  type TaskAssigneeMember,
} from "../../src/lib/task-assignee-groups";

describe("task assignee groups", () => {
  const members: TaskAssigneeMember[] = [
    {
      email: "math@example.com",
      display_name: "数学担当",
      subjects: "mathematics",
    },
    { email: "MATH@example.com", display_name: "", subjects: "" },
    { email: "all@example.com", display_name: "全分野担当", subjects: "*" },
    {
      email: "history@example.com",
      display_name: "歴史担当",
      subjects: "history",
    },
  ];

  it("deduplicates case variants and includes global reviewers in each subject group", () => {
    expect(normalizeTaskAssigneeMembers(members)).toHaveLength(3);
    expect(
      buildTaskAssigneeGroups(members, [
        { slug: "mathematics", name: "数学" },
        { slug: "history", name: "歴史" },
      ]),
    ).toEqual([
      {
        value: "@subject:mathematics",
        label: "数学担当全体（2人）",
        emails: ["math@example.com", "all@example.com"],
      },
      {
        value: "@subject:history",
        label: "歴史担当全体（2人）",
        emails: ["all@example.com", "history@example.com"],
      },
    ]);
  });

  it("expands selected groups and individual tags without duplicate addresses", () => {
    const select = {
      selectedOptions: [
        {
          value: "@subject:mathematics",
          dataset: {
            assigneeEmails: '["math@example.com","all@example.com"]',
          },
        },
        { value: "MATH@example.com", dataset: {} },
        { value: "other@example.com", dataset: {} },
      ],
    } as unknown as HTMLSelectElement;
    expect(selectedTaskAssigneeEmails(select)).toEqual([
      "math@example.com",
      "all@example.com",
      "other@example.com",
    ]);
  });
});
