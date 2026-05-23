import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import BottomNav from "@/components/BottomNav";
import { Search, Flame, Star, Zap, Globe, ChevronRight, Users } from "lucide-react";
import type { Game } from "@shared/schema";

const CATEGORIES = ["All", "Popular", "New", "Action", "Social", "Creative", "Simulation"];

const MOCK_TRENDING = [
  { title: "Blade Arena", creator: "By RedSkull Studios", gradient: "from-red-700 via-red-500 to-orange-500" },
  { title: "Ocean Survivors", creator: "By DeepBlue", gradient: "from-cyan-600 via-blue-500 to-indigo-700" },
  { title: "Neon City Drift", creator: "By VoltX", gradient: "from-pink-500 via-purple-600 to-indigo-600" },
  { title: "Zombie Rush", creator: "By DarkCode", gradient: "from-green-700 via-lime-600 to-yellow-500" },
];

const MOCK_NEW = [
  { title: "Sky Tower", creator: "By BlueSky Dev", gradient: "from-sky-400 via-blue-500 to-indigo-600" },
  { title: "Dragon Quest", creator: "By FantasyMaker", gradient: "from-orange-500 via-red-500 to-pink-600" },
  { title: "Space Rush", creator: "By CosmicLab", gradient: "from-violet-600 via-purple-600 to-pink-500" },
  { title: "Farm Life", creator: "By GreenThumb", gradient: "from-green-400 via-emerald-500 to-teal-600" },
];

const MOCK_ACTION = [
  { title: "Street Fighter X", creator: "By PunchDev", gradient: "from-yellow-500 via-orange-600 to-red-600" },
  { title: "Shadow Strike", creator: "By NightCraft", gradient: "from-gray-700 via-slate-600 to-zinc-800" },
  { title: "Mech Wars", creator: "By SteelForge", gradient: "from-blue-700 via-cyan-600 to-teal-500" },
  { title: "Bounty Hunt", creator: "By OutlawStudio", gradient: "from-amber-600 via-yellow-500 to-lime-500" },
];

const TOP_CREATORS = [
  { name: "RedSkull Studio", followers: "12.4K", skin: "#f5c5a3", shirt: "#dc2626" },
  { name: "DeepBlue", followers: "8.1K", skin: "#ffdbac", shirt: "#0284c7" },
  { name: "VoltX", followers: "6.9K", skin: "#d4a76a", shirt: "#7c3aed" },
];

function GameCard({ title, creator, gradient, thumbnail, href = "/explore" }: {
  title: string;
  creator: string;
  gradient: string;
  thumbnail?: string | null;
  href?: string;
}) {
  return (
    <Link href={href} className="shrink-0 w-[47vw] max-w-[210px] snap-start">
      <div className={`w-full aspect-square rounded-2xl overflow-hidden bg-gradient-to-br ${gradient} relative`}>
        {thumbnail && (
          <img src={thumbnail} alt={title} className="w-full h-full object-cover absolute inset-0" />
        )}
      </div>
      <div className="mt-2 px-0.5">
        <p className="font-bold text-[15px] leading-tight truncate">{title}</p>
        <p className="text-[13px] text-gray-400 mt-0.5 truncate">{creator}</p>
      </div>
    </Link>
  );
}

function SectionHeader({ icon: Icon, title, color = "text-white" }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Icon className={`w-5 h-5 ${color}`} />
        <h2 className="text-[22px] font-bold">{title}</h2>
      </div>
      <button className="flex items-center gap-0.5 text-sm text-gray-400">
        See all <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function HScroll({ items }: { items: { title: string; creator: string; gradient: string }[] }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none snap-x snap-mandatory">
      {items.map(item => (
        <GameCard key={item.title} title={item.title} creator={item.creator} gradient={item.gradient} />
      ))}
    </div>
  );
}

export default function ExplorePage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  const { data: games = [], isLoading } = useQuery<Game[]>({
    queryKey: ["/api/games/published"],
  });

  const filtered = games.filter(g =>
    g.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-28">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-[#0a0a0a]/95 backdrop-blur px-4 pt-5 pb-3">
        <h1 className="text-[26px] font-bold mb-3">Explore</h1>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search experiences..."
            className="w-full bg-[#1a1a1a] text-white placeholder-gray-500 rounded-2xl pl-10 pr-4 py-3 text-sm outline-none border border-[#2a2a2a] focus:border-violet-500/50"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
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

      {search ? (
        /* Search results */
        <div className="px-4 pt-4">
          <p className="text-gray-400 text-sm mb-4">{filtered.length} results for "{search}"</p>
          {filtered.length > 0 ? (
            <div className="flex gap-4 flex-wrap">
              {filtered.map(g => (
                <GameCard
                  key={g.id}
                  title={g.title}
                  creator="Published"
                  gradient="from-violet-900/40 to-indigo-900/40"
                  thumbnail={g.thumbnail}
                  href={`/play/${g.id}`}
                />
              ))}
            </div>
          ) : (
            <div className="py-16 text-center">
              <Globe className="w-10 h-10 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-400">No results found</p>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* 🔥 Trending */}
          <div className="px-4 pt-5 mb-8">
            <SectionHeader icon={Flame} title="Trending" color="text-orange-400" />
            <HScroll items={MOCK_TRENDING} />
          </div>

          {/* Published (real) */}
          {games.length > 0 && (
            <div className="px-4 mb-8">
              <SectionHeader icon={Globe} title="On Platform" color="text-blue-400" />
              <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none snap-x">
                {games.map(g => (
                  <GameCard
                    key={g.id}
                    title={g.title}
                    creator="Published"
                    gradient="from-violet-900/40 to-indigo-900/40"
                    thumbnail={g.thumbnail}
                    href={`/play/${g.id}`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ⚡ New & Fresh */}
          <div className="px-4 mb-8">
            <SectionHeader icon={Zap} title="New & Fresh" color="text-yellow-400" />
            <HScroll items={MOCK_NEW} />
          </div>

          {/* Action */}
          <div className="px-4 mb-8">
            <SectionHeader icon={Star} title="Action" color="text-pink-400" />
            <HScroll items={MOCK_ACTION} />
          </div>

          {/* Top creators */}
          <div className="px-4 mb-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-violet-400" />
                <h2 className="text-[22px] font-bold">Top Creators</h2>
              </div>
            </div>
            <div className="space-y-3">
              {TOP_CREATORS.map((c, i) => (
                <div key={c.name} className="flex items-center gap-3 bg-[#141414] rounded-2xl p-3 border border-[#222]">
                  <span className="text-sm text-gray-500 w-5 shrink-0">#{i + 1}</span>
                  <div className="w-11 h-11 rounded-full overflow-hidden border border-[#333]">
                    <svg viewBox="0 0 100 100" width={44} height={44} style={{ borderRadius: "50%", overflow: "hidden" }}>
                      <circle cx="50" cy="50" r="50" fill="#111" />
                      <ellipse cx="50" cy="105" rx="48" ry="36" fill={c.shirt} />
                      <ellipse cx="12" cy="82" rx="20" ry="16" fill={c.shirt} />
                      <ellipse cx="88" cy="82" rx="20" ry="16" fill={c.shirt} />
                      <rect x="22" y="76" width="56" height="30" fill={c.shirt} />
                      <ellipse cx="50" cy="68" rx="8" ry="10" fill={c.skin} />
                      <circle cx="50" cy="50" r="22" fill={c.skin} />
                      <ellipse cx="50" cy="34" rx="22" ry="14" fill="#2a1a10" />
                      <rect x="28" y="34" width="44" height="8" fill="#2a1a10" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{c.name}</p>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Users className="w-3 h-3" />
                      {c.followers} followers
                    </div>
                  </div>
                  <button className="text-xs border border-[#333] px-3 py-1.5 rounded-full hover:border-violet-500 transition-colors">
                    Follow
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <BottomNav />
    </div>
  );
}
