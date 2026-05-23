import BottomNav from "@/components/BottomNav";
import { Bell, Heart, MessageSquare, UserPlus, Play, Check } from "lucide-react";
import { useState } from "react";

const MOCK_ALERTS = [
  { id: 1, type: "like", icon: Heart, color: "text-pink-400 bg-pink-400/10", user: "Mia", action: "liked your experience", target: "Space Runner", time: "2m", read: false },
  { id: 2, type: "message", icon: MessageSquare, color: "text-blue-400 bg-blue-400/10", user: "Leo", action: "sent you a message", target: "", time: "15m", read: false },
  { id: 3, type: "follow", icon: UserPlus, color: "text-violet-400 bg-violet-400/10", user: "Zoe", action: "started following you", target: "", time: "1h", read: true },
  { id: 4, type: "play", icon: Play, color: "text-green-400 bg-green-400/10", user: "Kai", action: "played your experience", target: "City Drift", time: "3h", read: true },
  { id: 5, type: "like", icon: Heart, color: "text-pink-400 bg-pink-400/10", user: "Sam", action: "liked your experience", target: "Ocean World", time: "1d", read: true },
  { id: 6, type: "follow", icon: UserPlus, color: "text-violet-400 bg-violet-400/10", user: "Alex", action: "started following you", target: "", time: "2d", read: true },
];

const AVATAR_COLORS = ["from-pink-500 to-rose-600", "from-orange-400 to-amber-500", "from-emerald-400 to-teal-600", "from-blue-400 to-indigo-600", "from-purple-400 to-violet-600", "from-yellow-400 to-orange-500"];

export default function AlertsPage() {
  const [alerts, setAlerts] = useState(MOCK_ALERTS);

  const unreadCount = alerts.filter(a => !a.read).length;

  const markAllRead = () => setAlerts(a => a.map(x => ({ ...x, read: true })));

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0a0a0a]/95 backdrop-blur border-b border-[#1a1a1a] px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Alerts</h1>
            {unreadCount > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">{unreadCount} new</p>
            )}
          </div>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="flex items-center gap-1.5 text-xs text-violet-400 border border-violet-500/30 px-3 py-1.5 rounded-full hover:bg-violet-500/10 transition-colors">
              <Check className="w-3 h-3" />
              Mark all read
            </button>
          )}
        </div>
      </div>

      <div className="px-4 pt-4">
        {alerts.length === 0 ? (
          <div className="py-20 text-center">
            <Bell className="w-12 h-12 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">No alerts yet</p>
            <p className="text-sm text-gray-600 mt-1">We'll notify you about activity on your account</p>
          </div>
        ) : (
          <div className="space-y-1">
            {alerts.map((alert, i) => {
              const Icon = alert.icon;
              const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
              return (
                <button
                  key={alert.id}
                  onClick={() => setAlerts(a => a.map(x => x.id === alert.id ? { ...x, read: true } : x))}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-colors text-left ${
                    alert.read ? "hover:bg-[#111]" : "bg-[#141414] hover:bg-[#1a1a1a]"
                  }`}
                >
                  <div className="relative shrink-0">
                    <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${color} flex items-center justify-center font-bold text-sm`}>
                      {alert.user[0]}
                    </div>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full ${alert.color} flex items-center justify-center border-2 border-[#0a0a0a]`}>
                      <Icon className="w-2.5 h-2.5" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-semibold">{alert.user}</span>{" "}
                      <span className="text-gray-400">{alert.action}</span>
                      {alert.target && <span className="font-medium"> {alert.target}</span>}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{alert.time} ago</p>
                  </div>
                  {!alert.read && (
                    <div className="w-2 h-2 rounded-full bg-violet-500 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
