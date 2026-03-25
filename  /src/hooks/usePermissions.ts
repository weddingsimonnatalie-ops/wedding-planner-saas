"use client";

import { useSession } from "@/lib/auth-client";
import { can } from "@/lib/permissions";
import { UserRole } from "@prisma/client";

// Extended user type with custom fields from our Better Auth config
interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  twoFactorEnabled: boolean;
  sessionVersion: number;
}

export function usePermissions() {
  const { data: session, isPending } = useSession();

  // Cast to include our custom fields, default to VIEWER while loading or if no session
  const user = session?.user as SessionUser | undefined;
  const role: UserRole = user?.role ?? "VIEWER";

  return {
    role,
    isLoading: isPending,
    can: {
      editGuests: can.editGuests(role),
      deleteGuests: can.deleteGuests(role),
      manageRsvp: can.manageRsvp(role),
      editSeating: can.editSeating(role),
      editSuppliers: can.editSuppliers(role),
      editPayments: can.editPayments(role),
      manageSettings: can.manageSettings(role),
      manageUsers: can.manageUsers(role),
      importExportGuests: can.importExportGuests(role),
      editAppointments: can.editAppointments(role),
      editTasks: can.editTasks(role),
      completeTasks: can.completeTasks(role),
      viewTasks: can.viewTasks(role),
    },
    isAdmin: role === "ADMIN",
    isViewer: role === "VIEWER",
    isRsvpManager: role === "RSVP_MANAGER",
  };
}