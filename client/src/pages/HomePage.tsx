import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import BottomNav from "@/components/BottomNav";
import AvatarPortrait, { FriendPortrait } from "@/components/AvatarPortrait";
import { getAvatarConfig } from "@/lib/avatarConfig";
import { useAuth } from "@/hooks/useAuth";
import { Plus, Gamepad2, LogOut, Globe, ChevronRight } from "lucide-react";
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
  { name: "Mia", online: true },
  { name: "Leo", online: true },
  { name: "Zoe", online: true },
  { name: "Kai", online: true },
  { name: "Sam", online: false },
  { name: "Ava", online: true },
];

const MOCK_CONTINUE = [
  { title: "Blade Arena", creator: "RedSkull Studios", gradient: "from-red-700 via-red-500 to-orange-500", accent: "#ef4444" },
  { title: "Ocean Survivors", creator: "By DeepBlue", gradient: "from-cyan-600 via-blue-500 to-indigo-700", accent: "#06b6d4" },
  { title: "Neon City Drift", creator: "By VoltX", gradient: "from-pink-500 via-purple-600 to-indigo-600", accent: "#a855f7" },
  { title: "Zombie Rush", creator: "By DarkCode", gradient: "from-green-700 via-lime-600 to-yellow-500", accent: "#84cc16" },
];

const MOCK_RECOMMENDED = [
  { title: "Sky Tower", creator: "BlueSky Dev", gradient: "from-sky-400 via-blue-500 to-indigo-600" },
  { title: "Dragon Quest", creator: "FantasyMaker", gradient: "from-orange-500 via-red-500 to-pink-600" },
  { title: "Space Rush", creator: "CosmicLab", gradient: "from-violet-600 via-purple-600 to-pink-500" },
  { title: "Farm Life", creator: "GreenThumb", gradient: "from-green-400 via-emerald-500 to-teal-600" },
];

/** Large horizontal-scroll game card matching the screenshot style */
function GameCard({ title, creator, gradient, thumbnail, gameId, onClick }: {
  title: string;
  creator: string;
  gradient: string;
  thumbnail?: string | null;
  gameId?: string;
  onClick?: () => void;
}) {
  const inner = (
    <div className="shrink-0 w-[47vw] max-w-[210px]" onClick={onClick}>
      <div className={`w-full aspect-square rounded-2xl overflow-hidden bg-gradient-to-br ${gradient} relative`}>
        {thumbnail && (
          <img src={thumbnail} alt={title} className="w-full h-full object-cover absolute inset-0" />
        )}
      </div>
      <div className="mt-2 px-0.5">
        <p className="font-bold text-[15px] leading-tight truncate">{title}</p>
        <p className="text-[13px] text-gray-400 mt-0.5 truncate">{creator}</p>
      </div>
    </div>
  );
  if (gameId) return <Link href={`/editor/${gameId}`}>{inner}</Link>;
  return inner;
}

function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-[22px] font-bold">{title}</h2>
      {onSeeAll && (
        <button onClick={onSeeAll} className="flex items-center gap-0.5 text-sm text-gray-400">
          See all <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function HScrollSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none snap-x snap-mandatory">
      {children}
    </div>
  );
}

export default function HomePage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const avatarCfg = getAvatarConfig();

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
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-28">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 pt-5 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm">R</span>
          </div>
          <div>
            <p className="font-bold text-[17px] leading-tight">Rebur</p>
            <p className="text-xs text-gray-500 leading-tight">Home</p>
          </div>
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
            className="w-9 h-9 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center"
          >
            <LogOut className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </header>

      {/* Welcome section */}
      <div className="px-4 mt-4 mb-6 flex items-center gap-4">
        <div className="relative shrink-0">
          <a href="/profile" className="block w-[72px] h-[72px] rounded-full border-2 border-[#333] overflow-hidden hover:border-blue-500 transition-colors">
            <AvatarPortrait
              skinColor={avatarCfg.skinColor}
              shirtColor={avatarCfg.shirtColor}
              pantsColor={avatarCfg.pantsColor}
              size={72}
            />
          </a>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-gray-400 font-semibold mb-0.5">Welcome back</p>
          <h1 className="text-[28px] font-bold leading-tight">{displayName}!</h1>
        </div>
      </div>

      {/* Friends online row */}
      <div className="px-4 mb-8">
        <div className="flex gap-4 overflow-x-auto scrollbar-none pb-1">
          {MOCK_FRIENDS.map(friend => (
            <div key={friend.name} className="flex flex-col items-center gap-1.5 shrink-0">
              <div className="relative">
                <div className="w-[70px] h-[70px] rounded-full overflow-hidden border-[2.5px] border-[#333]">
                  <FriendPortrait name={friend.name} size={70} />
                </div>
                {friend.online && (
                  <span className="absolute bottom-1 right-1 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-[#0a0a0a]" />
                )}
              </div>
              <span className="text-[13px] text-gray-300 font-medium">{friend.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* My Experiences */}
      <div className="px-4 mb-8">
        <SectionHeader title="My Experiences" onSeeAll={() => {}} />
        {isLoading ? (
          <HScrollSection>
            {[1, 2].map(i => (
              <div key={i} className="shrink-0 w-[47vw] max-w-[210px]">
                <div className="w-full aspect-square rounded-2xl bg-[#1a1a1a] animate-pulse" />
                <div className="mt-2 space-y-1.5">
                  <div className="h-4 bg-[#1a1a1a] rounded w-3/4 animate-pulse" />
                  <div className="h-3 bg-[#1a1a1a] rounded w-1/2 animate-pulse" />
                </div>
              </div>
            ))}
          </HScrollSection>
        ) : games.length > 0 ? (
          <HScrollSection>
            {games.map(game => (
              <GameCard
                key={game.id}
                title={game.title}
                creator={"By me"}
                gradient="from-violet-900/60 to-indigo-900/60"
                thumbnail={game.thumbnail}
                gameId={game.id}
              />
            ))}
            {/* Create new card */}
            <div
              className="shrink-0 w-[47vw] max-w-[210px] cursor-pointer"
              onClick={() => setCreateOpen(true)}
            >
              <div className="w-full aspect-square rounded-2xl border-2 border-dashed border-[#2a2a2a] hover:border-violet-500/50 flex flex-col items-center justify-center gap-2 transition-colors">
                <div className="w-10 h-10 rounded-full bg-[#1a1a1a] flex items-center justify-center">
                  <Plus className="w-5 h-5 text-gray-500" />
                </div>
                <span className="text-xs text-gray-500">New</span>
              </div>
              <div className="mt-2 px-0.5">
                <p className="font-bold text-[15px]">Create New</p>
                <p className="text-[13px] text-gray-400">Start building</p>
              </div>
            </div>
          </HScrollSection>
        ) : (
          <div
            className="flex flex-col items-center py-10 border-2 border-dashed border-[#1f1f1f] rounded-2xl cursor-pointer hover:border-violet-500/30 transition-colors"
            onClick={() => setCreateOpen(true)}
          >
            <Gamepad2 className="w-10 h-10 text-gray-700 mb-3" />
            <p className="text-sm text-gray-400 font-medium">No experiences yet</p>
            <p className="text-xs text-gray-600 mt-1 mb-4">Tap Create to build your first world</p>
            <div className="bg-violet-600 text-white text-sm px-5 py-2 rounded-full font-medium">
              <Plus className="w-4 h-4 inline mr-1" />Create
            </div>
          </div>
        )}
      </div>

      {/* Continue playing */}
      <div className="px-4 mb-8">
        <SectionHeader title="Continue playing" onSeeAll={() => setLocation("/explore")} />
        <HScrollSection>
          {MOCK_CONTINUE.map(item => (
            <Link key={item.title} href="/explore">
              <GameCard
                title={item.title}
                creator={item.creator}
                gradient={item.gradient}
              />
            </Link>
          ))}
        </HScrollSection>
      </div>

      {/* Recommended for you */}
      <div className="px-4 mb-4">
        <SectionHeader title="Recommended for you" onSeeAll={() => setLocation("/explore")} />
        <HScrollSection>
          {MOCK_RECOMMENDED.map(item => (
            <Link key={item.title} href="/explore">
              <GameCard
                title={item.title}
                creator={item.creator}
                gradient={item.gradient}
              />
            </Link>
          ))}
        </HScrollSection>
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
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
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
