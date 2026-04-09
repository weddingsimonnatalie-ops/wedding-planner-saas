// ── Planner Types ─────────────────────────────────────────────────────────────

export type PlannerItemType = "event" | "task";

// ── Event (Appointment) Types ─────────────────────────────────────────────────

export interface PlannerCategory {
  id: string;
  name: string;
  colour: string;
}

export interface PlannerSupplier {
  id: string;
  name: string;
}

export interface PlannerUser {
  id: string;
  name: string | null;
  email: string;
}

export interface EventData {
  id: string;
  title: string;
  categoryId: string | null;
  category: PlannerCategory | null;
  date: string;
  location: string | null;
  notes: string | null;
  supplierId: string | null;
  reminderDays: number | null;
  supplier: PlannerSupplier | null;
  isCompleted: boolean;
  completedAt: string | null;
}

// ── Task Types ────────────────────────────────────────────────────────────────

export type TaskPriority = "HIGH" | "MEDIUM" | "LOW";
export type RecurringInterval = "DAILY" | "WEEKLY" | "FORTNIGHTLY" | "MONTHLY";

export interface TaskData {
  id: string;
  title: string;
  notes: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  completedAt: string | null;
  isCompleted: boolean;
  categoryId: string | null;
  category: PlannerCategory | null;
  assignedToId: string | null;
  assignedTo: PlannerUser | null;
  supplierId: string | null;
  supplier: PlannerSupplier | null;
  isRecurring: boolean;
  recurringInterval: RecurringInterval | null;
  recurringEndDate: string | null;
  createdAt: string;
  updatedAt: string;
}