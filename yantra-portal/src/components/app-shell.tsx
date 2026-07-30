"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Link2,
  MessageSquareText,
  Mail,
  BarChart3,
  Home,
  User,
  LogOut,
  Menu,
  X,
  Settings,
  ListOrdered,
  UserCog,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { PRODUCT_NAME } from "@/lib/brand";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const adminNav: NavItem[] = [
  { href: "/admin", label: "Admin Console", icon: LayoutDashboard },
  { href: "/admin/employees", label: "Employees", icon: UserCog },
  { href: "/admin/candidates", label: "Candidates", icon: Users },
  { href: "/admin/allocations", label: "Allocations", icon: UserCheck },
  { href: "/admin/chains", label: "Chains", icon: Link2 },
  { href: "/admin/prompt", label: "Prompt", icon: MessageSquareText },
  { href: "/admin/email-template", label: "Email Template", icon: Mail },
  { href: "/admin/email-activity", label: "Email Activity", icon: Mail },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/queues", label: "Queues", icon: ListOrdered },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/profile", label: "Profile", icon: User },
];

const employeeNav: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/chains", label: "Your Chains", icon: Link2 },
  { href: "/chains/new", label: "New Chain", icon: MessageSquareText },
  { href: "/profile", label: "Profile", icon: User },
];

export function AppShell({
  role,
  userName,
  children,
}: {
  role: string;
  userName?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const nav = role === "ADMIN" ? adminNav : employeeNav;

  const NavLinks = () => (
    <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto p-3">
      {nav.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : item.href === "/admin"
              ? pathname === "/admin"
              : pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active ? "bg-slate-100 font-medium text-slate-900" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-white text-slate-900">
      <aside className="hidden w-64 shrink-0 border-r bg-white lg:flex lg:flex-col">
        <div className="flex h-14 items-center border-b px-4">
          <Link
            href={role === "ADMIN" ? "/admin" : "/"}
            className="text-xl font-semibold tracking-tight"
          >
            {PRODUCT_NAME}
          </Link>
        </div>
        <NavLinks />
        <div className="border-t p-3">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="inline-flex h-9 w-full items-center justify-start gap-3 rounded-md px-4 text-sm text-slate-500 hover:bg-slate-100"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center border-b px-4 lg:px-6">
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-100 lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span className="ml-2 text-lg font-bold tracking-tight lg:hidden">{PRODUCT_NAME}</span>
          <div className="flex-1" />
          <span className="text-sm text-slate-500">{userName}</span>
        </header>

        {open ? (
          <div className="border-b bg-white lg:hidden">
            <NavLinks />
          </div>
        ) : null}

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
