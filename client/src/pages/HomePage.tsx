import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/hooks/useAuth";
import { Plus, Play, Gamepad2, LogOut, Pencil, Globe, Clock } from "lucide-react";
import type { Game } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const MOCK_FRIENDS = [
  { name: "Mia", color: "from-pink-500 to-rose-600", online: true },
  { name: "Leo", color: "from-orange-400 to-amber-500", online: true },
  { name: "Zoe", color: "from-emerald-400 to-teal-600", online: true },
  { name: "Kai", color: "from-blue-400 to-indigo-600", online: true },
  { name: "Sam", color: "from-purple-400 to-violet-600", online: false },
];

const MOCK_RECOMMENDED = [
  { title: "Neon City Drift", creator: "VoltX", plays: "12.4K", gradient: "from-pink-500 via-purple-600 to-indigo-700" },
  { title: "Blade Arena", creator: "RedSkull", plays: "8.9K", gradient: "from-red-600 via-orange-500 to-amber-400" },
  { title: "Ocean Survivors", creator: "DeepBlue", plays: "6.2K", gradient: "from-cyan-500 via-blue-600 to-indigo-700" },
  { title: "Zombie Rush", creator: "DarkCode", plays: "5.1K", gradient: "from-green-800 via-lime-700 to-yellow-600" },
];

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "Never";
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function HomePage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const { data: games = [], isLoading } = useQuery<Game[]>({
    queryKey: ["/api/games"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; description: string }) => {
      const res = await apiRequest("POST", "/api/games", data);
      return await res.json();
    },
    onSuccess: (game: Game) => {
      queryClient.invalidateQueries({ queryKey: ["/api/games"] });
      setCreateOpen(false);
      setTitle("");
      setDescription("");
      setLocation(`/editor/${game.id}`);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create experience", variant: "destructive" });
    },
  });

  const displayName = user?.firstName || user?.email?.split("@")[0] || "Creator";

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-24">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-[#0a0a0a]/95 backdrop-blur border-b border-[#1a1a1a] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center">
            <span className="text-white font-bold text-xs">R</span>
          </div>
          <span className="font-bold text-lg tracking-tight">Rebur</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-4 py-2 rounded-full text-sm font-semibold transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Create
          </button>
          <button
            onClick={() => logout()}
            className="w-9 h-9 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="px-4 pt-5">
        {/* Welcome */}
        <div className="mb-6 flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center shrink-0">
            <span className="text-2xl font-bold">{displayName[0].toUpperCase()}</span>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500 font-medium">Welcome back</p>
            <h1 className="text-2xl font-bold">{displayName}!</h1>
          </div>
        </div>

        {/* Friends online */}
        <div className="mb-6">
          <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-none">
            {MOCK_FRIENDS.map(friend => (
              <div key={friend.name} className="flex flex-col items-center gap-1.5 shrink-0">
                <div className="relative">
                  <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${friend.color} flex items-center justify-center font-bold text-lg border-2 border-[#0a0a0a]`}>
                    {friend.name[0]}
                  </div>
                  {friend.online && (
                    <span className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-[#0a0a0a]" />
                  )}
                </div>
                <span className="text-xs text-gray-400">{friend.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* My Experiences */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-base">My Experiences</h2>
            <span className="text-xs text-gray-500">{games.length} total</span>
          </div>

          {isLoading ? (
            <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1 -mx-4 px-4">
              {[1, 2].map(i => (
                <div key={i} className="shrink-0 w-44 bg-[#141414] rounded-2xl overflow-hidden animate-pulse border border-[#222]">
                  <div className="h-28 bg-[#222]" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 bg-[#222] rounded w-3/4" />
                    <div className="h-3 bg-[#222] rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : games.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2 -mx-4 px-4">
              {games.map(game => (
                <Link key={game.id} href={`/editor/${game.id}`} className="shrink-0 w-44 bg-[#141414] rounded-2xl overflow-hidden border border-[#222] hover:border-[#333] transition-colors active:scale-95">
                  <div className="h-28 bg-gradient-to-br from-violet-900/30 to-indigo-900/30 flex items-center justify-center">
                    {game.thumbnail ? (
                      <img src={game.thumbnail} alt={game.title} className="w-full h-full object-cover" />
                    ) : (
                      <Gamepad2 className="w-10 h-10 text-violet-400/30" />
                    )}
                  </div>
                  <div className="p-3">
                    <p className="font-semibold text-sm truncate">{game.title}</p>
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex items-center gap-1 text-[10px] text-gray-500">
                        <Clock className="w-2.5 h-2.5" />
                        {formatDate(game.updatedAt)}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-gray-500">
                        {game.isPublished && <Globe className="w-2.5 h-2.5 text-green-400" />}
                        <Pencil className="w-2.5 h-2.5" />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
              {/* Create new */}
              <button
                onClick={() => setCreateOpen(true)}
                className="shrink-0 w-44 bg-[#141414] rounded-2xl overflow-hidden border border-dashed border-[#333] hover:border-violet-500/50 flex flex-col items-center justify-center gap-2 h-[148px] transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-[#222] flex items-center justify-center">
                  <Plus className="w-5 h-5 text-gray-400" />
                </div>
                <span className="text-xs text-gray-500">New Experience</span>
              </button>
            </div>
          ) : (
            <div className="bg-[#141414] rounded-2xl p-6 text-center border border-dashed border-[#2a2a2a]">
              <Gamepad2 className="w-10 h-10 text-gray-700 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-300 mb-1">No experiences yet</p>
              <p className="text-xs text-gray-500 mb-4">Tap Create to build your first world</p>
              <button
                onClick={() => setCreateOpen(true)}
                className="bg-violet-600 hover:bg-violet-500 text-white text-sm px-4 py-2 rounded-full font-medium transition-colors"
              >
                <Plus className="w-4 h-4 inline mr-1" />
                Create
              </button>
            </div>
          )}
        </div>

        {/* Recommended */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-base">Recommended for you</h2>
            <Link href="/explore" className="text-xs text-violet-400">See all &gt;</Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {MOCK_RECOMMENDED.map(item => (
              <Link key={item.title} href="/explore" className="bg-[#141414] rounded-2xl overflow-hidden border border-[#222] active:scale-95 transition-transform">
                <div className={`h-24 bg-gradient-to-br ${item.gradient} flex items-end p-2`}>
                  <Play className="w-6 h-6 text-white/60" />
                </div>
                <div className="p-2.5">
                  <p className="font-semibold text-xs truncate">{item.title}</p>
                  <p className="text-[10px] text-gray-500">By {item.creator}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-[#141414] border-[#2a2a2a] text-white mx-4 rounded-2xl">
          <DialogHeader>
            <DialogTitle>Create Experience</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm text-gray-300">Name</Label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="My Awesome World"
                className="mt-1.5 bg-[#1a1a1a] border-[#2a2a2a] text-white"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-sm text-gray-300">Description (optional)</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="A place where..."
                className="mt-1.5 bg-[#1a1a1a] border-[#2a2a2a] text-white resize-none"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setCreateOpen(false)}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => createMutation.mutate({ title, description })}
              disabled={!title.trim() || createMutation.isPending}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold disabled:opacity-50 transition-all"
            >
              {createMutation.isPending ? "Creating..." : "Create & Open"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}
