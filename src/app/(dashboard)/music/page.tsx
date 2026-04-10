export const dynamic = "force-dynamic";

import { requireServerContext } from "@/lib/server-context";
import { prisma } from "@/lib/prisma";
import { MusicList } from "@/components/music/MusicList";
import { Music, Crown } from "lucide-react";
import { getMusicBlockReason } from "@/lib/permissions";

export default async function MusicPage() {
  const ctx = await requireServerContext(["ADMIN", "VIEWER", "RSVP_MANAGER"]);

  const wedding = await prisma.wedding.findUnique({
    where: { id: ctx.weddingId },
    select: { subscriptionStatus: true },
  });

  const status = wedding?.subscriptionStatus ?? "FREE";
  const reason = getMusicBlockReason(status);

  if (reason) {
    return (
      <div className="flex flex-col">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
            <Music className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Music</h1>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <Crown className="w-12 h-12 text-primary mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Upgrade to access Music</h2>
          <p className="text-gray-500 mb-4">
            Create playlists, search for songs, and organise your wedding music. Available on the paid plan.
          </p>
          <a
            href="/billing"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            <Crown className="w-4 h-4" />
            Upgrade now
          </a>
        </div>
      </div>
    );
  }

  const playlists = await prisma.playlist.findMany({
    where: { weddingId: ctx.weddingId },
    include: {
      _count: { select: { tracks: true } },
    },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div className="flex flex-col">
      <MusicList initialPlaylists={playlists} />
      <a
        href="https://www.deezer.com"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-8 flex items-center justify-center gap-2 text-gray-500 hover:text-gray-700 transition-colors"
      >
        <span className="text-sm">Powered by</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/static/deezer-logo.svg"
          alt="Deezer"
          className="h-6 w-auto"
        />
      </a>
    </div>
  );
}