import { Link, useRoute } from "wouter";
import { Home, Compass, User, MessageSquare, Bell } from "lucide-react";

interface NavItem {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  center?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/home", icon: Home, label: "Home" },
  { href: "/explore", icon: Compass, label: "Explore" },
  { href: "/avatar", icon: User, label: "Avatar", center: true },
  { href: "/messages", icon: MessageSquare, label: "Messages" },
  { href: "/alerts", icon: Bell, label: "Alerts" },
];

function NavLink({ item }: { item: NavItem }) {
  const [active] = useRoute(item.href);
  const Icon = item.icon;

  if (item.center) {
    return (
      <Link href={item.href} className="flex flex-col items-center gap-1 relative -top-3">
        <div
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all ${
            active
              ? "bg-gradient-to-br from-violet-500 to-indigo-600 shadow-violet-500/40"
              : "bg-gradient-to-br from-violet-600 to-indigo-700 shadow-violet-600/30"
          }`}
        >
          <Icon className="w-6 h-6 text-white" />
        </div>
        <span className={`text-[10px] font-medium ${active ? "text-violet-400" : "text-gray-500"}`}>
          {item.label}
        </span>
      </Link>
    );
  }

  return (
    <Link href={item.href} className="flex flex-col items-center gap-1 py-2 px-3 flex-1">
      <Icon className={`w-5 h-5 transition-colors ${active ? "text-white" : "text-gray-500"}`} />
      <span className={`text-[10px] font-medium transition-colors ${active ? "text-white" : "text-gray-500"}`}>
        {item.label}
      </span>
    </Link>
  );
}

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#111111] border-t border-[#222] flex items-end justify-around px-2 pb-safe">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} item={item} />
      ))}
    </nav>
  );
}
