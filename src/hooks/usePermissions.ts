"use client";

import { useSession } from "@/lib/auth-client";
import { useWedding } from "@/context/WeddingContext";
import { can } from "@/lib/permissions";
import { UserRole } from "@prisma/client";

export function usePermissions() {
  const { data: session, isPending } = useSession();
  const { role: weddingRole } = useWedding();

  // Role comes from the wedding context (per-wedding, not per-user)
  const role: UserRole = weddingRole ?? "VIEWER";

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