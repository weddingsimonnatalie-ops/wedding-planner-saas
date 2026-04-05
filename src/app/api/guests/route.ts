export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, requireAdminOrRsvpManager } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { RsvpStatus } from "@prisma/client";
import { apiJson } from "@/lib/api-response";
import { validateFields } from "@/lib/validation";

import { handleDbError } from "@/lib/db-error";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN", "VIEWER", "RSVP_MANAGER"], req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const { searchParams } = req.nextUrl;
    const status = searchParams.get("status");
    const group = searchParams.get("group");
    const search = searchParams.get("search");
    const tableAssigned = searchParams.get("tableAssigned");
    const tableId = searchParams.get("tableId");
    const event = searchParams.get("event");
    const meal = searchParams.get("meal");
    const dietary = searchParams.get("dietary");

    // Optional pagination
    const skip = searchParams.get("skip") ? parseInt(searchParams.get("skip")!, 10) : undefined;
    const take = searchParams.get("take") ? parseInt(searchParams.get("take")!, 10) : undefined;

    // Validate pagination parameters
    if (skip !== undefined && (isNaN(skip) || skip < 0)) {
      return NextResponse.json({ error: "Invalid skip parameter" }, { status: 400 });
    }
    if (take !== undefined && (isNaN(take) || take < 1 || take > 500)) {
      return NextResponse.json({ error: "Invalid take parameter (must be 1-500)" }, { status: 400 });
    }

    const overrideStatuses = { in: ["ACCEPTED", "PARTIAL"] };
    const eventFilter: Record<string, unknown> =
        event === "invited_ceremony"   ? { invitedToCeremony: true }
        : event === "invited_reception"  ? { invitedToReception: true }
        : event === "invited_afterparty" ? { invitedToAfterparty: true }
        : event === "invited_rehearsal_dinner" ? { invitedToRehearsalDinner: true }
        : event === "attending_ceremony"  ? { invitedToCeremony: true,  OR: [{ attendingCeremony: true },  { attendingCeremony: null,  rsvpStatus: overrideStatuses }] }
        : event === "attending_reception" ? { invitedToReception: true, OR: [{ attendingReception: true }, { attendingReception: null, rsvpStatus: overrideStatuses }] }
        : event === "attending_afterparty"? { invitedToAfterparty: true,OR: [{ attendingAfterparty: true },{ attendingAfterparty: null,rsvpStatus: overrideStatuses }] }
        : event === "attending_rehearsal_dinner"? { invitedToRehearsalDinner: true,OR: [{ attendingRehearsalDinner: true },{ attendingRehearsalDinner: null,rsvpStatus: overrideStatuses }] }
        : event === "not_attending_ceremony"   ? { invitedToCeremony: true,  attendingCeremony: false }
        : event === "not_attending_reception"  ? { invitedToReception: true, attendingReception: false }
        : event === "not_attending_afterparty" ? { invitedToAfterparty: true,attendingAfterparty: false }
        : event === "not_attending_rehearsal_dinner" ? { invitedToRehearsalDinner: true,attendingRehearsalDinner: false }
        : {};

    const where: Record<string, unknown> = {
      weddingId,
      ...(status && status !== "ALL" ? { rsvpStatus: status as RsvpStatus } : {}),
      ...(group === "none" ? { OR: [{ groupName: null }, { groupName: "" }] } : group ? { groupName: group } : {}),
      ...(tableId ? { tableId } : tableAssigned === "yes" ? { tableId: { not: null } } : tableAssigned === "no" ? { tableId: null } : {}),
      ...eventFilter,
      ...(meal === "none" ? { mealChoice: null } : meal ? { mealChoice: meal } : {}),
      ...(dietary === "has_notes" ? { dietaryNotes: { not: null }, NOT: { dietaryNotes: "" } } : dietary === "no_notes" ? { OR: [{ dietaryNotes: null }, { dietaryNotes: "" }] } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" as const } },
              { lastName: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const result = await withTenantContext(weddingId, async (tx) => {
      // Get total count for pagination metadata
      const total = await tx.guest.count({ where });

      const guests = await tx.guest.findMany({
          where,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            groupName: true,
            isChild: true,
            rsvpStatus: true,
            isManualOverride: true,
            rsvpToken: true,
            invitedToCeremony: true,
            invitedToReception: true,
            invitedToAfterparty: true,
            invitedToRehearsalDinner: true,
            attendingCeremony: true,
            attendingReception: true,
            attendingAfterparty: true,
            attendingRehearsalDinner: true,
            mealChoice: true,
            dietaryNotes: true,
            seatNumber: true,
            tableId: true,
            unsubscribedAt: true,
            table: { select: { id: true, name: true } },
          },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          ...(skip !== undefined ? { skip } : {}),
          ...(take !== undefined ? { take } : {}),
      });

      return { guests, total };
    });

    // Return with pagination metadata if paginated, otherwise return array for backwards compatibility
    if (skip !== undefined || take !== undefined) {
      return apiJson({
        guests: result.guests,
        total: result.total,
        hasMore: take !== undefined ? skip! + result.guests.length < result.total : false,
      });
    }

    return apiJson(result.guests);

  } catch (error) {
    return handleDbError(error);
  }

}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
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
    ]);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    const guest = await withTenantContext(weddingId, async (tx) => {
      // Check for duplicate email (scoped to this wedding)
      if (email?.trim()) {
          const existing = await tx.guest.findFirst({
              where: { email: email.trim(), weddingId },
          });
          if (existing) {
              return null; // signal duplicate
          }
      }

      return tx.guest.create({
          data: {
            weddingId,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email?.trim() || null,
            phone: phone?.trim() || null,
            groupName: groupName?.trim() || null,
            isChild: Boolean(isChild),
            invitedToCeremony: invitedToCeremony !== false,
            invitedToReception: invitedToReception !== false,
            invitedToAfterparty: Boolean(invitedToAfterparty),
            invitedToRehearsalDinner: Boolean(invitedToRehearsalDinner),
            notes: notes?.trim() || null,
          },
      });
    });

    if (guest === null) {
      return NextResponse.json(
          { error: "A guest with this email already exists" },
          { status: 409 }
      );
    }

    return NextResponse.json(guest, { status: 201 });

  } catch (error) {
    return handleDbError(error);
  }

}
