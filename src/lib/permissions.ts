import { UserRole } from "@prisma/client";

export const can = {
  // Page access
  accessSuppliers: (role: UserRole) => role === "ADMIN" || role === "VIEWER",
  accessPayments: (role: UserRole) => role === "ADMIN" || role === "VIEWER",
  accessSettings: (role: UserRole) => role === "ADMIN",
  accessAppointments: (_role: UserRole) => true, // all roles
  accessSeating: (_role: UserRole) => true, // all roles — but VIEWER/RSVP read only

  // Guest actions
  editGuests: (role: UserRole) => role === "ADMIN" || role === "RSVP_MANAGER",
  deleteGuests: (role: UserRole) => role === "ADMIN" || role === "RSVP_MANAGER",
  manageRsvp: (role: UserRole) => role === "ADMIN" || role === "RSVP_MANAGER",
  importExportGuests: (role: UserRole) =>
    role === "ADMIN" || role === "RSVP_MANAGER",

  // Seating actions
  editSeating: (role: UserRole) => role === "ADMIN",

  // Supplier actions
  editSuppliers: (role: UserRole) => role === "ADMIN",
  editPayments: (role: UserRole) => role === "ADMIN",

  // Budget
  accessBudget: (role: UserRole) => role === "ADMIN" || role === "VIEWER",
  editBudget: (role: UserRole) => role === "ADMIN",

  // Appointments
  editAppointments: (role: UserRole) => role === "ADMIN",

  // Settings and user management
  manageUsers: (role: UserRole) => role === "ADMIN",
  manageSettings: (role: UserRole) => role === "ADMIN",

  // Tasks
  editTasks: (role: UserRole) => role === "ADMIN",
  completeTasks: (role: UserRole) => role === "ADMIN" || role === "RSVP_MANAGER",
  viewTasks: (_role: UserRole) => true,

  // Planner (unified Events + Tasks)
  accessPlanner: (_role: UserRole) => true,
  editPlannerEvents: (role: UserRole) => role === "ADMIN",
  editPlannerTasks: (role: UserRole) => role === "ADMIN",
  completePlannerTasks: (role: UserRole) => role === "ADMIN" || role === "RSVP_MANAGER",

  // Timeline
  editTimeline: (role: UserRole) => role === "ADMIN",
  viewTimeline: (_role: UserRole) => true,
};

// Role display helpers
export const roleLabel = (role: UserRole) => {
  switch (role) {
    case "ADMIN":
      return "Admin";
    case "VIEWER":
      return "Viewer";
    case "RSVP_MANAGER":
      return "RSVP Manager";
  }
};

export const roleColour = (role: UserRole) => {
  switch (role) {
    case "ADMIN":
      return "purple";
    case "VIEWER":
      return "blue";
    case "RSVP_MANAGER":
      return "green";
  }
};
