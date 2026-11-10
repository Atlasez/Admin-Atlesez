export type AdminStagingFixture = {
  key: string;
  email: string | null;
  auth: "unauthenticated" | "google-test-account";
  application: "none" | "reviewing" | "rejected" | "accepted";
  projectMemberships: Array<{
    projectId: string;
    role: "member" | "manager";
  }>;
  subjectRoles: Array<{
    role: "subject-coordinator";
    subject: string;
  }>;
  suspended: boolean;
  withdrawn: boolean;
};

/** Pseudonymous local-only identities. Never map these rows to real member data. */
export const ADMIN_STAGING_ACCOUNTS: readonly AdminStagingFixture[] = [
  {
    key: "unauthenticated",
    email: null,
    auth: "unauthenticated",
    application: "none",
    projectMemberships: [],
    subjectRoles: [],
    suspended: false,
    withdrawn: false,
  },
  {
    key: "applicant-reviewing",
    email: "applicant-reviewing@atlasez.test",
    auth: "google-test-account",
    application: "reviewing",
    projectMemberships: [],
    subjectRoles: [],
    suspended: false,
    withdrawn: false,
  },
  {
    key: "applicant-rejected",
    email: "applicant-rejected@atlasez.test",
    auth: "google-test-account",
    application: "rejected",
    projectMemberships: [],
    subjectRoles: [],
    suspended: false,
    withdrawn: false,
  },
  {
    key: "accepted-incomplete",
    email: "accepted-incomplete@atlasez.test",
    auth: "google-test-account",
    application: "accepted",
    projectMemberships: [{ projectId: "thinking-cafe", role: "member" }],
    subjectRoles: [],
    suspended: false,
    withdrawn: false,
  },
  {
    key: "member-multi-project",
    email: "member-multi-project@atlasez.test",
    auth: "google-test-account",
    application: "accepted",
    projectMemberships: [
      { projectId: "thinking-cafe", role: "member" },
      { projectId: "mathematics", role: "member" },
    ],
    subjectRoles: [],
    suspended: false,
    withdrawn: false,
  },
  {
    key: "project-manager",
    email: "project-manager@atlasez.test",
    auth: "google-test-account",
    application: "accepted",
    projectMemberships: [{ projectId: "thinking-cafe", role: "manager" }],
    subjectRoles: [],
    suspended: false,
    withdrawn: false,
  },
  {
    key: "subject-coordinator",
    email: "subject-coordinator@atlasez.test",
    auth: "google-test-account",
    application: "accepted",
    projectMemberships: [{ projectId: "mathematics", role: "member" }],
    subjectRoles: [{ role: "subject-coordinator", subject: "mathematics" }],
    suspended: false,
    withdrawn: false,
  },
  {
    key: "global-operator",
    email: "global-operator@atlasez.test",
    auth: "google-test-account",
    application: "accepted",
    projectMemberships: [],
    subjectRoles: [],
    suspended: false,
    withdrawn: false,
  },
  {
    key: "suspended-member",
    email: "suspended-member@atlasez.test",
    auth: "google-test-account",
    application: "accepted",
    projectMemberships: [{ projectId: "thinking-cafe", role: "member" }],
    subjectRoles: [],
    suspended: true,
    withdrawn: false,
  },
  {
    key: "withdrawn-member",
    email: "withdrawn-member@atlasez.test",
    auth: "google-test-account",
    application: "accepted",
    projectMemberships: [],
    subjectRoles: [],
    suspended: false,
    withdrawn: true,
  },
];
