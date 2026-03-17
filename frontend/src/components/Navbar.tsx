"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, User as UserIcon, Settings, BarChart3, Briefcase, FileSignature } from "lucide-react";
import { getUser, logout } from "@/lib/auth";
import { User } from "@/types";

export default function Navbar() {
  const pathname = usePathname();
  const [user, setUserState] = useState<User | null>(null);

  useEffect(() => {
    setUserState(getUser());
  }, []);

  if (!user) return null;

  const NavLink = ({ href, icon: Icon, label }: { href: string; icon: any; label: string }) => {
    const isActive = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        href={href}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
          isActive
            ? "bg-white/10 text-white"
            : "text-muted hover:text-white hover:bg-white/5"
        }`}
      >
        <Icon className="w-4 h-4" />
        <span className="hidden sm:inline">{label}</span>
      </Link>
    );
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-border">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href={user.role === "admin" ? "/admin" : "/dashboard"} className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <span className="text-black font-bold text-lg">AI</span>
            </div>
            <span className="font-bold hidden sm:inline">Interview Trainer</span>
          </Link>

          <div className="flex items-center gap-1">
            {user.role === "admin" ? (
              <>
                <NavLink href="/admin" icon={BarChart3} label="Dashboard" />
                <NavLink href="/admin/roles" icon={Briefcase} label="Roles" />
                <NavLink href="/admin/questions" icon={FileSignature} label="Questions" />
              </>
            ) : (
              <>
                <NavLink href="/dashboard" icon={UserIcon} label="Dashboard" />
                <NavLink href="/reports" icon={BarChart3} label="Reports" />
                <NavLink href="/settings" icon={Settings} label="Settings" />
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-sm font-medium">{user.name}</span>
            <span className="text-xs text-muted capitalize">{user.role}</span>
          </div>
          <button
            onClick={logout}
            className="p-2 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </nav>
  );
}
