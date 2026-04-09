export type DashboardPresetId = "classic" | "actions-first" | "budget-focus" | "organized";

export type DashboardRow = {
  /** Optional section header for the "Organized" preset */
  header?: string;
  /** Section IDs to render in this grid row */
  sections: string[];
  /** Grid column spans per section (defaults to equal split). Maps to lg:col-span-N. */
  spans?: number[];
};

export type DashboardPreset = {
  id: DashboardPresetId;
  name: string;
  description: string;
  rows: DashboardRow[];
};

export const DASHBOARD_PRESETS: DashboardPreset[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Summary stats first, then details",
    rows: [
      { sections: ["quickStats"] },
      { sections: ["guestSummary", "budgetOverview"], spans: [2, 1] },
      { sections: ["meals", "suppliers"], spans: [2, 1] },
      { sections: ["budgetCategories"] },
      { sections: ["payments"] },
      { sections: ["appointments", "tasks"] },
    ],
  },
  {
    id: "actions-first",
    name: "Actions First",
    description: "Urgent items and payments at the top",
    rows: [
      { sections: ["payments"] },
      { sections: ["tasks", "appointments"] },
      { sections: ["budgetOverview", "budgetCategories"], spans: [2, 1] },
      { sections: ["quickStats"] },
      { sections: ["guestSummary", "meals"], spans: [2, 1] },
      { sections: ["suppliers"] },
    ],
  },
  {
    id: "budget-focus",
    name: "Budget Focus",
    description: "Wedding countdown and budget health lead",
    rows: [
      { sections: ["countdownHero", "budgetOverview"] },
      { sections: ["payments", "budgetCategories"], spans: [2, 1] },
      { sections: ["tasks", "appointments"] },
      { sections: ["quickStats"] },
      { sections: ["guestSummary", "meals"], spans: [2, 1] },
      { sections: ["suppliers"] },
    ],
  },
  {
    id: "organized",
    name: "Organized",
    description: "Grouped sections: At a Glance, Needs Attention, Progress",
    rows: [
      { header: "At a Glance", sections: ["quickStats"] },
      { header: "Needs Attention", sections: ["payments"] },
      { header: "Needs Attention", sections: ["tasks", "appointments"] },
      { header: "Progress", sections: ["budgetOverview", "budgetCategories"], spans: [2, 1] },
      { header: "Progress", sections: ["guestSummary", "meals"], spans: [2, 1] },
      { header: "Progress", sections: ["suppliers"] },
    ],
  },
];