import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import PlayMode from "@/components/PlayMode";
import type { Game, GameObject } from "@shared/schema";

function GuestSignInBanner({ gameId }: { gameId: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 bg-[#1a1a1a] border border-[#333] rounded-2xl px-4 py-2.5 shadow-xl">
      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center shrink-0">
        <span className="text-white font-bold text-[10px]">R</span>
      </div>
      <span className="text-sm text-gray-300">Playing as Guest</span>
      <a
        href={`/auth?redirect=/play/${gameId}`}
        className="text-sm font-semibold text-violet-400 hover:text-violet-300 transition-colors"
      >
        Sign in with Rebur
      </a>
      <button
        onClick={() => setDismissed(true)}
        className="text-gray-600 hover:text-gray-400 text-lg leading-none ml-1"
      >
        ×
      </button>
    </div>
  );
}

export default function PlayPage() {
  const { gameId } = useParams<{ gameId: string }>();

  const { data: game, isLoading: gameLoading } = useQuery<Game>({
    queryKey: [`/api/games/${gameId}`],
    queryFn: async () => {
      const res = await fetch(`/api/games/${gameId}`);
      if (!res.ok) throw new Error("Game not found");
      return res.json();
    },
  });

  const { data: objects = [], isLoading: objLoading } = useQuery<GameObject[]>({
    queryKey: [`/api/games/${gameId}/objects`],
    queryFn: async () => {
      const res = await fetch(`/api/games/${gameId}/objects`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  if (gameLoading || objLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-white text-sm">Loading experience...</div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center text-white">
          <p className="text-xl font-bold mb-2">Experience not found</p>
          <a href="/explore" className="text-violet-400 text-sm">Browse experiences</a>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen">
      <GuestSignInBanner gameId={gameId!} />
      <PlayMode
        objects={objects}
        scripts={[]}
        username="Guest"
        gameId={gameId!}
        onExit={() => { window.history.back(); }}
      />
    </div>
  );
}
