export const dynamic = "force-dynamic";

import { requireServerContext } from "@/lib/server-context";
import { prisma } from "@/lib/prisma";
import { MusicList } from "@/components/music/MusicList";

export default async function MusicPage() {
  const ctx = await requireServerContext(["ADMIN", "VIEWER", "RSVP_MANAGER"]);
  const { weddingId } = ctx;

  const playlists = await prisma.playlist.findMany({
    where: { weddingId },
    include: {
      _count: { select: { tracks: true } },
    },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Music</h1>
      <MusicList initialPlaylists={playlists} />
    </div>
  );
}