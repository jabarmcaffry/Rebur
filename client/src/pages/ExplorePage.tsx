import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import BottomNav from "@/components/BottomNav";
import { Search, Play, Flame, Clock, Star, Globe, Users } from "lucide-react";
import type { Game } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES = ["All", "Popular", "New", "Action", "Social", "Creative", "Simulation"];

const MOCK_FEATURED = [
  { id: "m1", title: "Neon City Drift", plays: "12.4K", creator: "VoltX Studio", gradient: "from-pink-500 via-purple-500 to-indigo-600" },
  { id: "m2", title: "Blade Arena", plays: "8.9K", creator: "RedSkull Studio", gradient: "from-red-500 via-orange-500 to-amber-400" },
  { id: "m3", title: "Ocean Survivors", plays: "6.2K", creator: "DeepBlue", gradient: "from-cyan-500 via-blue-500 to-indigo-600" },
];

export default function ExplorePage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const { toast } = useToast();

  const { data: games = [], isLoading } = useQuery<Game[]>({
    queryKey: ["/api/games/published"],
  });

  const playMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/games/${id}/play`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games/published"] });
    },
  });

  const filtered = games.filter(g =>
    g.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0a0a0a]/95 backdrop-blur border-b border-[#1a1a1a] px-4 pt-4 pb-3">
        <h1 className="text-2xl font-bold mb-3">Explore</h1>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search experiences..."
            className="w-full bg-[#1a1a1a] text-white placeholder-gray-500 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none border border-[#2a2a2a] focus:border-violet-500/50"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                category === cat
                  ? "bg-violet-600 text-white"
                  : "bg-[#1a1a1a] text-gray-400 border border-[#2a2a2a]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4">
        {/* Featured — mock spotlight cards */}
        {!search && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-400" />
                <h2 className="font-semibold">Featured</h2>
              </div>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4">
              {MOCK_FEATURED.map(f => (
                <div key={f.id} className="shrink-0 w-56 rounded-2xl overflow-hidden border border-[#222]">
                  <div className={`h-32 bg-gradient-to-br ${f.gradient} flex items-end p-3`}>
                    <div>
                      <p className="font-bold text-sm drop-shadow">{f.title}</p>
                      <p className="text-xs text-white/70">by {f.creator}</p>
                    </div>
                  </div>
                  <div className="bg-[#141414] px-3 py-2 flex justify-between items-center">
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Play className="w-3 h-3" />
                      {f.plays}
                    </div>
                    <button className="text-xs bg-violet-600 hover:bg-violet-500 px-3 py-1 rounded-full font-medium transition-colors">
                      Play
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Real published games */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-400" />
              <h2 className="font-semibold">{search ? "Results" : "Published Experiences"}</h2>
            </div>
            {!search && (
              <span className="text-xs text-gray-500">{games.length} total</span>
            )}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-[#141414] rounded-2xl overflow-hidden animate-pulse">
                  <div className="h-28 bg-[#222]" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 bg-[#222] rounded w-3/4" />
                    <div className="h-3 bg-[#222] rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {filtered.map(game => (
                <div key={game.id} className="bg-[#141414] rounded-2xl overflow-hidden border border-[#222]">
                  <div className="h-28 bg-gradient-to-br from-violet-900/40 to-indigo-900/40 flex items-center justify-center relative">
                    {game.thumbnail ? (
                      <img src={game.thumbnail} alt={game.title} className="w-full h-full object-cover" />
                    ) : (
                      <Play className="w-8 h-8 text-violet-400/50" />
                    )}
                  </div>
                  <div className="p-3">
                    <p className="font-semibold text-sm truncate">{game.title}</p>
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Play className="w-3 h-3" />
                        {game.plays || 0}
                      </div>
                      <button
                        onClick={() => playMutation.mutate(game.id)}
                        className="text-[10px] bg-violet-600/80 hover:bg-violet-500 px-2.5 py-1 rounded-full font-medium transition-colors"
                      >
                        Play
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center">
              <Globe className="w-12 h-12 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">No experiences yet</p>
              <p className="text-sm text-gray-600 mt-1">
                {search ? "Try a different search" : "Be the first to publish!"}
              </p>
            </div>
          )}
        </div>

        {/* Mock trending section when no search */}
        {!search && (
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-4 h-4 text-yellow-400" />
              <h2 className="font-semibold">Top Creators</h2>
            </div>
            <div className="space-y-3">
              {[
                { name: "RedSkull Studio", followers: "12.4K", gradient: "from-red-500 to-orange-600" },
                { name: "DeepBlue", followers: "8.1K", gradient: "from-cyan-500 to-blue-600" },
                { name: "VoltX", followers: "6.9K", gradient: "from-yellow-400 to-orange-500" },
              ].map((creator, i) => (
                <div key={creator.name} className="flex items-center gap-3 bg-[#141414] rounded-2xl p-3 border border-[#222]">
                  <span className="text-sm text-gray-500 w-5">#{i + 1}</span>
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${creator.gradient} flex items-center justify-center font-bold text-sm`}>
                    {creator.name[0]}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{creator.name}</p>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Users className="w-3 h-3" />
                      {creator.followers} followers
                    </div>
                  </div>
                  <button className="text-xs border border-[#333] px-3 py-1.5 rounded-full hover:border-violet-500 transition-colors">
                    Follow
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
