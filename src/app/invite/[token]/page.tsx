import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { Heart, XCircle } from "lucide-react";
import { AcceptInviteClient } from "./AcceptInviteClient";

type Params = { params: Promise<{ token: string }> };

function ErrorPage({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 to-pink-100 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-7 h-7 text-red-500" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Invite not valid</h1>
          <p className="text-sm text-gray-500">{message}</p>
        </div>
      </div>
    </div>
  );
}

export default async function InvitePage({ params }: Params) {
  const { token } = await params;

  const [invite, session] = await Promise.all([
    prisma.weddingInvite.findUnique({
      where: { token },
      select: {
        id: true,
        token: true,
        email: true,
        role: true,
        expiresAt: true,
        usedAt: true,
        wedding: { select: { coupleName: true } },
      },
    }),
    getSession(),
  ]);

  if (!invite) {
    return <ErrorPage message="This invite link is invalid or doesn't exist." />;
  }
  if (invite.usedAt) {
    return <ErrorPage message="This invite link has already been used." />;
  }
  if (invite.expiresAt < new Date()) {
    return <ErrorPage message="This invite link has expired. Please ask for a new one." />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 to-pink-100 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 bg-primary rounded-full flex items-center justify-center mb-4">
              <Heart className="w-7 h-7 text-white fill-white" />
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 text-center">
              Join {invite.wedding.coupleName}&apos;s wedding
            </h1>
            <p className="text-sm text-gray-500 mt-1 text-center">
              You&apos;ve been invited to help plan the wedding
            </p>
          </div>

          <AcceptInviteClient
            token={token}
            coupleName={invite.wedding.coupleName}
            role={invite.role}
            inviteEmail={invite.email ?? null}
            isLoggedIn={!!session}
            loggedInEmail={session?.user.email ?? null}
          />
        </div>
      </div>
    </div>
  );
}
