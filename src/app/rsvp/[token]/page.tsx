export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { withTenantContext } from "@/lib/tenant";
import { notFound } from "next/navigation";
import { Heart } from "lucide-react";
import { RsvpForm } from "@/components/rsvp/RsvpForm";

export default async function RsvpPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Guest lookup by rsvpToken — globally unique, no weddingId needed for the lookup itself
  const guest = await prisma.guest.findUnique({
    where: { rsvpToken: token },
  });

  if (!guest) notFound();

  // Scope meal options and wedding config to this guest's wedding
  const weddingId = guest.weddingId;
  const [mealOptions, wedding] = await withTenantContext(weddingId, (tx) =>
    Promise.all([
      tx.mealOption.findMany({
        where: { weddingId, isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      tx.wedding.findUnique({
        where: { id: weddingId },
        select: { coupleName: true, weddingDate: true, venueName: true, themeHue: true },
      }),
    ])
  );

  const weddingDate = wedding?.weddingDate
    ? new Date(wedding.weddingDate).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const themeHue = wedding?.themeHue ?? 330;

  return (
    <>
    <style dangerouslySetInnerHTML={{ __html: `:root { --primary: ${themeHue} 60% 55%; --ring: ${themeHue} 60% 55%; }` }} />
    <div className="min-h-screen bg-gradient-to-br from-rose-50 to-pink-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-lg">
        <div className="flex flex-col items-center pt-6 pb-4 px-4 sm:px-8">
          <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center mb-3">
            <Heart className="w-6 h-6 text-white fill-white" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">
            {wedding?.coupleName ?? "You're Invited!"}
          </h1>
          {weddingDate && (
            <p className="text-sm text-gray-500 mt-1">{weddingDate}</p>
          )}
          {wedding?.venueName && (
            <p className="text-sm text-gray-400">{wedding.venueName}</p>
          )}
        </div>

        <div className="px-4 pb-6 sm:px-8 sm:pb-8">
          <p className="text-center text-gray-600 mb-6">
            Hi <strong>{guest.firstName} {guest.lastName}</strong>, please let us know if you can make it.
          </p>

          <RsvpForm
            token={token}
            guest={{
              firstName: guest.firstName,
              lastName: guest.lastName,
              rsvpStatus: guest.rsvpStatus,
              rsvpRespondedAt: guest.rsvpRespondedAt?.toISOString() ?? null,
              invitedToCeremony: guest.invitedToCeremony,
              invitedToReception: guest.invitedToReception,
              invitedToAfterparty: guest.invitedToAfterparty,
              attendingCeremony: guest.attendingCeremony,
              attendingReception: guest.attendingReception,
              attendingAfterparty: guest.attendingAfterparty,
              attendingCeremonyMaybe: guest.attendingCeremonyMaybe,
              attendingReceptionMaybe: guest.attendingReceptionMaybe,
              attendingAfterpartyMaybe: guest.attendingAfterpartyMaybe,
              mealChoice: guest.mealChoice,
              dietaryNotes: guest.dietaryNotes,
            }}
            mealOptions={mealOptions}
          />
        </div>
      </div>
    </div>
    </>
  );
}
