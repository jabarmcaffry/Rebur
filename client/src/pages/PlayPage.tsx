import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import PlayMode from "@/components/PlayMode";
import type { Game, GameObject } from "@shared/schema";
import { getQueryFn } from "@/lib/queryClient";

/** True when this page is running inside an <iframe> on a third-party site. */
function useIsEmbedded() {
  const [embedded] = useState(() => {
    try { return window.self !== window.top; } catch { return true; }
  });
  return embedded;
}

/**
 * Floating sign-in prompt shown ONLY when the game is embedded on an external
 * site and the visitor is not yet logged in to Rebur.
 */
function EmbedLoginBanner({ gameId, onGuest }: { gameId: string; onGuest: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const loginUrl = `${window.location.origin}/auth?redirect=${encodeURIComponent(`/play/${gameId}`)}`;
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 bg-[#1a1a1a] border border-[#333] rounded-2xl px-4 py-2.5 shadow-xl">
      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center shrink-0">
        <span className="text-white font-bold text-[10px]">R</span>
      </div>
      <span className="text-sm text-gray-300">Playing as Guest</span>
      <a
        href={loginUrl}
        className="text-sm font-semibold text-violet-400 hover:text-violet-300 transition-colors"
      >
        Sign in with Rebur
      </a>
      <button
        onClick={() => { setDismissed(true); onGuest(); }}
        className="text-gray-600 hover:text-gray-400 text-lg leading-none ml-1"
        title="Continue as guest"
      >
        ×
      </button>
    </div>
  );
}

/**
 * Shown on the platform when the user is not logged in — prompts them to log
 * in and come back, or continue as Guest.
 */
function PlatformLoginPrompt({ gameId, onGuest }: { gameId: string; onGuest: () => void }) {
  const loginUrl = `/auth?redirect=${encodeURIComponent(`/play/${gameId}`)}`;
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="text-center space-y-4 p-6 max-w-sm">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center mx-auto">
          <span className="text-white font-bold text-xl">R</span>
        </div>
        <h2 className="text-white text-xl font-bold">Sign in to Rebur</h2>
        <p className="text-gray-400 text-sm">
          Log in to track your progress and play as your Rebur account.
        </p>
        <a
          href={loginUrl}
          className="block w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-colors"
        >
          Sign in with Rebur
        </a>
        <button
          onClick={onGuest}
          className="block w-full py-2.5 rounded-xl border border-[#333] text-gray-400 hover:text-white text-sm transition-colors"
        >
          Continue as Guest
        </button>
      </div>
    </div>
  );
}

export default function PlayPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const isEmbedded = useIsEmbedded();
  const [playAsGuest, setPlayAsGuest] = useState(false);

  // Check if the current visitor is logged in to Rebur (returns null if not)
  const { data: authUser, isLoading: authLoading } = useQuery<{ id: string; username: string } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 60_000,
  });

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

  if (authLoading || gameLoading || objLoading) {
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

  const isLoggedIn = !!authUser;
  const username = authUser?.username ?? "Guest";

  // On the platform (not embedded) + not logged in → show login prompt
  // (unless the user explicitly chose to continue as guest)
  if (!isLoggedIn && !isEmbedded && !playAsGuest) {
    return <PlatformLoginPrompt gameId={gameId!} onGuest={() => setPlayAsGuest(true)} />;
  }

  return (
    <div className="w-full h-screen">
      {/* Show a lightweight banner only when embedded and not logged in */}
      {!isLoggedIn && isEmbedded && (
        <EmbedLoginBanner gameId={gameId!} onGuest={() => setPlayAsGuest(true)} />
      )}
      <PlayMode
        objects={objects}
        scripts={[]}
        username={username}
        gameId={gameId!}
        onExit={() => { window.history.back(); }}
      />
    </div>
  );
}
