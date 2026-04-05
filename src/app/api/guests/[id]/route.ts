export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, requireAdminOrRsvpManager } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { RsvpStatus } from "@prisma/client";
import { calculateRsvpStatus } from "@/lib/rsvpStatus";
import { apiJson } from "@/lib/api-response";
import { validateFields } from "@/lib/validation";

import { handleDbError } from "@/lib/db-error";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireRole(["ADMIN", "VIEWER", "RSVP_MANAGER"], _req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const guest = await withTenantContext(weddingId, (tx) =>
      tx.guest.findUnique({
        where: { id, weddingId },
        include: { table: { select: { id: true, name: true } } },
      })
    );

    if (!guest) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return apiJson(guest);

  } catch (error) {
    return handleDbError(error);
  }

}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAdminOrRsvpManager(req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const body = await req.json();
    const {
    firstName,
    lastName,
    email,
    phone,
    groupName,
    isChild,
    invitedToCeremony,
    invitedToReception,
    invitedToAfterparty,
    invitedToRehearsalDinner,
    notes,
    rsvpStatus,
    attendingCeremony,
    attendingReception,
    attendingAfterparty,
    attendingRehearsalDinner,
    mealChoice,
    dietaryNotes,
    } = body;

    if (!firstName?.trim() || !lastName?.trim()) {
      return NextResponse.json({ error: "First name and last name are required" }, { status: 400 });
    }

    // Validate field lengths
    const errors = validateFields([
      { value: firstName, field: "firstName", required: true },
      { value: lastName, field: "lastName", required: true },
      { value: email, field: "email" },
      { value: phone, field: "phone" },
      { value: groupName, field: "groupName" },
      { value: notes, field: "notes" },
      { value: dietaryNotes, field: "dietaryNotes" },
    ]);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    const invCeremony   = invitedToCeremony !== false;
    const invReception  = invitedToReception !== false;
    const invAfterparty = Boolean(invitedToAfterparty);
    const invRehearsalDinner = Boolean(invitedToRehearsalDinner);

    // If the guest has answered at least one invited event, auto-calculate status.
    // Otherwise fall back to the manually selected status (allows admin to set MAYBE/PENDING).
    const hasAnyAnswer =
    (invCeremony   && attendingCeremony   !== undefined && attendingCeremony   !== null) ||
    (invReception  && attendingReception  !== undefined && attendingReception  !== null) ||
    (invAfterparty && attendingAfterparty !== undefined && attendingAfterparty !== null) ||
    (invRehearsalDinner && attendingRehearsalDinner !== undefined && attendingRehearsalDinner !== null);

    const computedStatus = hasAnyAnswer
    ? calculateRsvpStatus(
          invCeremony, invReception, invAfterparty, invRehearsalDinner,
          attendingCeremony   ?? null,
          attendingReception  ?? null,
          attendingAfterparty ?? null,
          attendingRehearsalDinner ?? null,
        )
    : (rsvpStatus as RsvpStatus | undefined);

    const result = await withTenantContext(weddingId, async (tx) => {
      // Check for duplicate email (exclude current guest, scoped to this wedding)
      if (email?.trim()) {
        const existing = await tx.guest.findFirst({
          where: {
            email: email.trim(),
            weddingId,
            NOT: { id },
          },
        });
        if (existing) {
          return { duplicate: true, guest: null };
        }
      }

      // Validate mealChoice references an active meal option (if provided)
      if (mealChoice !== undefined && mealChoice !== null && mealChoice !== "") {
        const mealOption = await tx.mealOption.findFirst({
          where: { id: mealChoice, isActive: true },
        });
        if (!mealOption) {
          return { invalidMeal: true, guest: null };
        }
      }

      const guest = await tx.guest.update({
        where: { id, weddingId },
        data: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email?.trim() || null,
            phone: phone?.trim() || null,
            groupName: groupName?.trim() || null,
            isChild: Boolean(isChild),
            invitedToCeremony:   invCeremony,
            invitedToReception:  invReception,
            invitedToAfterparty: invAfterparty,
            invitedToRehearsalDinner: invRehearsalDinner,
            notes: notes?.trim() || null,
            ...(computedStatus !== undefined ? { rsvpStatus: computedStatus as RsvpStatus } : {}),
            ...(attendingCeremony        !== undefined ? { attendingCeremony }        : {}),
            ...(attendingReception       !== undefined ? { attendingReception }       : {}),
            ...(attendingAfterparty      !== undefined ? { attendingAfterparty }      : {}),
            ...(attendingRehearsalDinner !== undefined ? { attendingRehearsalDinner } : {}),
            ...(mealChoice   !== undefined ? { mealChoice: mealChoice || null }             : {}),
            ...(dietaryNotes !== undefined ? { dietaryNotes: dietaryNotes?.trim() || null } : {}),
        },
      });

      return { guest };
    });

    if (result.duplicate) {
      return NextResponse.json(
        { error: "A guest with this email already exists" },
        { status: 409 }
      );
    }
    if (result.invalidMeal) {
      return NextResponse.json({ error: "Invalid meal option" }, { status: 400 });
    }

    return NextResponse.json(result.guest);

  } catch (error) {
    return handleDbError(error);
  }

}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAdminOrRsvpManager(req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const body = await req.json();
    const { rsvpStatus, seatNumber } = body;

    if (rsvpStatus === undefined && seatNumber === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const result = await withTenantContext(weddingId, async (tx) => {
      // Fetch current guest for invitation flags (status override) and tableId (seat validation)
      const needsFetch = (rsvpStatus !== undefined && rsvpStatus !== "PARTIAL") || (seatNumber !== undefined && seatNumber !== null);
      const current = needsFetch
        ? await tx.guest.findUnique({
              where: { id, weddingId },
              select: { invitedToCeremony: true, invitedToReception: true, invitedToAfterparty: true, invitedToRehearsalDinner: true, tableId: true },
            })
        : null;

      // Derive attending fields from the override status (PARTIAL leaves them unchanged)
      let attendingOverride: Record<string, boolean | null> = {};
      if (rsvpStatus !== undefined && rsvpStatus !== "PARTIAL" && current) {
        if (rsvpStatus === "ACCEPTED") {
            attendingOverride = {
              attendingCeremony:        current.invitedToCeremony        ? true  : null,
              attendingReception:       current.invitedToReception       ? true  : null,
              attendingAfterparty:      current.invitedToAfterparty      ? true  : null,
              attendingRehearsalDinner: current.invitedToRehearsalDinner ? true  : null,
            };
        } else if (rsvpStatus === "DECLINED") {
            attendingOverride = {
              attendingCeremony:        current.invitedToCeremony        ? false : null,
              attendingReception:       current.invitedToReception       ? false : null,
              attendingAfterparty:      current.invitedToAfterparty      ? false : null,
              attendingRehearsalDinner: current.invitedToRehearsalDinner ? false : null,
            };
        } else {
            // PENDING — clear all attending fields
            attendingOverride = {
              attendingCeremony:        null,
              attendingReception:       null,
              attendingAfterparty:      null,
              attendingRehearsalDinner: null,
            };
        }
      }

      // Validate seatNumber if provided
      if (seatNumber !== undefined && seatNumber !== null && current?.tableId) {
        const table = await tx.table.findUnique({
            where: { id: current.tableId },
            select: { capacity: true },
        });
        if (table) {
            if (seatNumber < 1 || seatNumber > table.capacity) {
              return {
                error: `Seat number must be between 1 and ${table.capacity}`,
                status: 400,
              };
            }
            const conflict = await tx.guest.findFirst({
              where: { tableId: current.tableId, seatNumber, NOT: { id } },
              select: { firstName: true, lastName: true },
            });
            if (conflict) {
              return {
                error: `Seat ${seatNumber} is already taken by ${conflict.firstName} ${conflict.lastName}`,
                status: 400,
              };
            }
        }
      }

      const guest = await tx.guest.update({
        where: { id, weddingId },
        data: {
            ...(rsvpStatus !== undefined ? {
              rsvpStatus: rsvpStatus as RsvpStatus,
              isManualOverride: rsvpStatus !== "PENDING",
            } : {}),
            ...attendingOverride,
            ...(seatNumber !== undefined ? { seatNumber: seatNumber === null ? null : Number(seatNumber) } : {}),
        },
      });

      return { guest };
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.guest);

  } catch (error) {
    return handleDbError(error);
  }

}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAdminOrRsvpManager(_req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    await withTenantContext(weddingId, (tx) =>
      tx.guest.delete({ where: { id, weddingId } })
    );
    return NextResponse.json({ ok: true });

  } catch (error) {
    return handleDbError(error);
  }

}
