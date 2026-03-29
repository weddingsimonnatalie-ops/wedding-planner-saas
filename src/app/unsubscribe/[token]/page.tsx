import { prisma } from "@/lib/prisma";
import { withTenantContext } from "@/lib/tenant";

// Public page — no auth required
// Returns HTML page (not JSON) since users click this link in email
export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  try {
    // Find guest by rsvpToken
    const guest = await prisma.guest.findUnique({
      where: { rsvpToken: token },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        unsubscribedAt: true,
        weddingId: true,
      },
    });

    if (!guest) {
      return getNotFoundContent();
    }

    // Get wedding for couple name
    const wedding = await withTenantContext(guest.weddingId, (tx) =>
      tx.wedding.findUnique({
        where: { id: guest.weddingId },
        select: { coupleName: true },
      })
    );

    // Already unsubscribed?
    if (guest.unsubscribedAt) {
      return getAlreadyUnsubscribedContent(guest.firstName, wedding?.coupleName);
    }

    // Set unsubscribedAt
    await prisma.guest.update({
      where: { id: guest.id },
      data: { unsubscribedAt: new Date() },
    });

    return getSuccessContent(guest.firstName, wedding?.coupleName);
  } catch (error) {
    console.error("[unsubscribe] Error:", error);
    return getErrorContent();
  }
}

function getSuccessContent(firstName: string, coupleName?: string | null) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl border border-gray-200 p-8 text-center">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">You&apos;re unsubscribed</h1>
        <p className="text-gray-600">
          {firstName ? `${firstName}, you` : 'You'} will no longer receive RSVP reminder emails from {coupleName || 'the wedding organisers'}.
        </p>
        <p className="text-sm text-gray-400 mt-4">
          They can still contact you directly if needed.
        </p>
      </div>
    </div>
  );
}

function getAlreadyUnsubscribedContent(firstName: string, coupleName?: string | null) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl border border-gray-200 p-8 text-center">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Already unsubscribed</h1>
        <p className="text-gray-600">
          {firstName ? `${firstName}, you` : 'You'} have already unsubscribed from RSVP reminder emails from {coupleName || 'the wedding organisers'}.
        </p>
        <p className="text-sm text-gray-400 mt-4">
          They can still contact you directly if needed.
        </p>
      </div>
    </div>
  );
}

function getNotFoundContent() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl border border-gray-200 p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Link expired</h1>
        <p className="text-gray-600">
          This unsubscribe link is no longer valid. If you need to unsubscribe, please contact the wedding organisers directly.
        </p>
      </div>
    </div>
  );
}

function getErrorContent() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl border border-gray-200 p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h1>
        <p className="text-gray-600">
          We couldn&apos;t process your unsubscribe request. Please try again later or contact the wedding organisers directly.
        </p>
      </div>
    </div>
  );
}