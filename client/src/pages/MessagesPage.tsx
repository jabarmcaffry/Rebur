import BottomNav from "@/components/BottomNav";
import { useState } from "react";
import { Send, Search, MoreVertical } from "lucide-react";

const MOCK_CONVERSATIONS = [
  { id: 1, name: "Mia", avatar: "M", color: "from-pink-500 to-rose-600", lastMsg: "gg on the arena match!", time: "2m", unread: 2, online: true },
  { id: 2, name: "Leo", avatar: "L", color: "from-orange-400 to-amber-500", lastMsg: "Let's build something cool", time: "15m", unread: 0, online: true },
  { id: 3, name: "Zoe", avatar: "Z", color: "from-emerald-400 to-teal-600", lastMsg: "Check my new world!", time: "1h", unread: 0, online: true },
  { id: 4, name: "Kai", avatar: "K", color: "from-blue-400 to-indigo-600", lastMsg: "Want to collab?", time: "3h", unread: 1, online: false },
  { id: 5, name: "Sam", avatar: "S", color: "from-purple-400 to-violet-600", lastMsg: "Nice world design btw", time: "1d", unread: 0, online: false },
];

export default function MessagesPage() {
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  const filtered = MOCK_CONVERSATIONS.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const activeConv = MOCK_CONVERSATIONS.find(c => c.id === active);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0a0a0a]/95 backdrop-blur border-b border-[#1a1a1a] px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-bold">Messages</h1>
          <button className="w-9 h-9 rounded-full bg-[#1a1a1a] flex items-center justify-center">
            <MoreVertical className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search messages..."
            className="w-full bg-[#1a1a1a] text-white placeholder-gray-500 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none border border-[#2a2a2a] focus:border-violet-500/50"
          />
        </div>
      </div>

      {active !== null && activeConv ? (
        /* Chat view */
        <div className="flex flex-col h-[calc(100vh-140px)]">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1a1a1a]">
            <button onClick={() => setActive(null)} className="text-gray-400 text-sm">← Back</button>
            <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${activeConv.color} flex items-center justify-center font-bold text-sm`}>
              {activeConv.avatar}
            </div>
            <div>
              <p className="font-semibold text-sm">{activeConv.name}</p>
              <p className="text-xs text-gray-500">{activeConv.online ? "Online" : "Offline"}</p>
            </div>
          </div>
          <div className="flex-1 px-4 py-4 space-y-3 overflow-y-auto">
            <div className="flex gap-2">
              <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${activeConv.color} flex items-center justify-center font-bold text-xs shrink-0`}>
                {activeConv.avatar}
              </div>
              <div className="bg-[#1a1a1a] rounded-2xl rounded-tl-sm px-3 py-2 text-sm max-w-[70%]">
                {activeConv.lastMsg}
              </div>
            </div>
            <div className="flex justify-end">
              <div className="bg-violet-600 rounded-2xl rounded-tr-sm px-3 py-2 text-sm max-w-[70%]">
                Hey! How's it going?
              </div>
            </div>
          </div>
          <div className="px-4 py-3 border-t border-[#1a1a1a] flex gap-2">
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Message..."
              className="flex-1 bg-[#1a1a1a] rounded-full px-4 py-2 text-sm outline-none"
            />
            <button className="w-9 h-9 rounded-full bg-violet-600 flex items-center justify-center">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        /* Conversation list */
        <div className="px-4 pt-4 space-y-1">
          {filtered.map(conv => (
            <button
              key={conv.id}
              onClick={() => setActive(conv.id)}
              className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-[#141414] transition-colors text-left"
            >
              <div className="relative shrink-0">
                <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${conv.color} flex items-center justify-center font-bold text-lg`}>
                  {conv.avatar}
                </div>
                {conv.online && (
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-[#0a0a0a]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-sm">{conv.name}</span>
                  <span className="text-xs text-gray-500">{conv.time}</span>
                </div>
                <p className="text-sm text-gray-400 truncate">{conv.lastMsg}</p>
              </div>
              {conv.unread > 0 && (
                <div className="w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center text-[10px] font-bold shrink-0">
                  {conv.unread}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      <BottomNav />
    </div>
  );
}
