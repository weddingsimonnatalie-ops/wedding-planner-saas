"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Music, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { fetchApi } from "@/lib/fetch";
import { EmptyState } from "@/components/ui/EmptyState";
import { PlaylistModal } from "./PlaylistModal";

interface Playlist {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  _count: { tracks: number };
}

interface Props {
  initialPlaylists: Playlist[];
}

export function MusicList({ initialPlaylists }: Props) {
  const router = useRouter();
  const { can } = usePermissions();
  const [playlists, setPlaylists] = useState(initialPlaylists);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleCreate(data: { name: string; description?: string }) {
    const res = await fetchApi("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const { playlist } = await res.json();
      setPlaylists([...playlists, playlist]);
      setShowModal(false);
      showToast("Playlist created");
      router.refresh();
    }
  }

  async function handleUpdate(id: string, data: { name: string; description?: string }) {
    const res = await fetchApi(`/api/playlists/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const { playlist } = await res.json();
      setPlaylists(playlists.map((p) => (p.id === id ? playlist : p)));
      setEditingPlaylist(null);
      setShowModal(false);
      showToast("Playlist updated");
      router.refresh();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this playlist and all its tracks?")) return;
    const res = await fetchApi(`/api/playlists/${id}`, { method: "DELETE" });
    if (res.ok) {
      setPlaylists(playlists.filter((p) => p.id !== id));
      setExpandedId(null);
      showToast("Playlist deleted");
      router.refresh();
    }
  }

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (playlists.length === 0) {
    return (
      <>
        <EmptyState
          icon={Music}
          title="No playlists yet"
          description="Create playlists to organise your wedding music"
          actionLabel={can.editMusic ? "Create playlist" : undefined}
          onClick={can.editMusic ? () => setShowModal(true) : undefined}
        />
        {showModal && can.editMusic && (
          <PlaylistModal
            onClose={() => setShowModal(false)}
            onSubmit={handleCreate}
          />
        )}
        {toast && (
          <div className="fixed right-4 px-4 py-2.5 rounded-lg text-sm text-white bg-green-600 shadow-lg" style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            {toast}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="space-y-3">
      {playlists.map((playlist) => (
        <div key={playlist.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => toggleExpand(playlist.id)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Music className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">{playlist.name}</h3>
                {playlist.description && (
                  <p className="text-sm text-gray-500">{playlist.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">
                {playlist._count.tracks} track{playlist._count.tracks !== 1 ? "s" : ""}
              </span>
              {expandedId === playlist.id ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </div>
          </button>

          {expandedId === playlist.id && (
            <PlaylistContent
              playlistId={playlist.id}
              canEdit={can.editMusic}
              onEdit={() => {
                setEditingPlaylist(playlist);
                setShowModal(true);
              }}
              onDelete={() => handleDelete(playlist.id)}
            />
          )}
        </div>
      ))}

      {can.editMusic && (
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add playlist
        </button>
      )}

      {showModal && can.editMusic && (
        <PlaylistModal
          playlist={editingPlaylist}
          onClose={() => {
            setShowModal(false);
            setEditingPlaylist(null);
          }}
          onSubmit={(data) => {
            if (editingPlaylist) {
              handleUpdate(editingPlaylist.id, data);
            } else {
              handleCreate(data);
            }
          }}
        />
      )}

      {toast && (
        <div className="fixed right-4 px-4 py-2.5 rounded-lg text-sm text-white bg-green-600 shadow-lg" style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// Separate component for playlist content (tracks)
function PlaylistContent({
  playlistId,
  canEdit,
  onEdit,
  onDelete,
}: {
  playlistId: string;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [tracks, setTracks] = useState<
    Array<{ id: string; title: string; artist: string | null; durationSec: number | null; url: string | null; notes: string | null; sortOrder: number }>
  >([]);
  const [loading, setLoading] = useState(true);

  // Load tracks when expanded
  useEffect(() => {
    setLoading(true);
    fetchApi(`/api/playlists/${playlistId}`)
      .then((res) => res.json())
      .then((data) => {
        setTracks(data.playlist.tracks);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [playlistId]);

  if (loading) {
    return (
      <div className="border-t border-gray-100 p-4">
        <div className="animate-pulse space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-10 bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-100 p-4 space-y-2">
      {tracks.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">No tracks yet</p>
      ) : (
        tracks.map((track, index) => (
          <div key={track.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-50">
            <span className="text-sm text-gray-400 w-6 text-center">{index + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{track.title}</p>
              {track.artist && <p className="text-xs text-gray-500">{track.artist}</p>}
            </div>
            {track.durationSec && (
              <span className="text-xs text-gray-400">
                {Math.floor(track.durationSec / 60)}:{(track.durationSec % 60).toString().padStart(2, "0")}
              </span>
            )}
          </div>
        ))
      )}

      {canEdit && (
        <div className="flex gap-2 pt-2">
          <button
            onClick={onEdit}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Edit playlist
          </button>
          <button
            onClick={onDelete}
            className="text-xs text-red-500 hover:text-red-700"
          >
            Delete playlist
          </button>
        </div>
      )}
    </div>
  );
}