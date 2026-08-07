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
  Plus,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { PRODUCT_NAME, PRODUCT_NAME_SHORT } from "@/lib/brand";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type NavGroup = { label?: string; items: NavItem[] };

const adminGroups: NavGroup[] = [
  {
    items: [
      { href: "/admin", label: "Overview", icon: LayoutDashboard },
      { href: "/admin/chains", label: "Chains", icon: Link2 },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/admin/employees", label: "Employees", icon: UserCog },
      { href: "/admin/candidates", label: "Candidates", icon: Users },
      { href: "/admin/allocations", label: "Allocations", icon: UserCheck },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/admin/prompt", label: "Prompt", icon: MessageSquareText },
      { href: "/admin/prompt-lab", label: "Prompt Lab", icon: MessageSquareText },
      { href: "/admin/bullet-bank", label: "Bullet bank", icon: MessageSquareText },
      { href: "/admin/tool-bank", label: "Tool bank", icon: MessageSquareText },
      { href: "/admin/email-template", label: "Email", icon: Mail },
      { href: "/admin/email-activity", label: "Email log", icon: ListOrdered },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/admin/queues", label: "Queues", icon: ListOrdered },
      { href: "/admin/settings", label: "Settings", icon: Settings },
      { href: "/profile", label: "Profile", icon: User },
    ],
  },
];

const employeeGroups: NavGroup[] = [
  {
    items: [
      { href: "/", label: "Home", icon: Home },
      { href: "/chains", label: "Chains", icon: Link2 },
      { href: "/chains/new", label: "New chain", icon: Plus },
      { href: "/profile", label: "Profile", icon: User },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

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
  const groups = role === "ADMIN" ? adminGroups : employeeGroups;
  const homeHref = role === "ADMIN" ? "/admin" : "/";

  const NavBody = () => (
    <>
      <div className="flex h-[60px] items-center gap-2.5 px-5">
        <Link
          href={homeHref}
          className="group flex items-center gap-2.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3]/30"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-b from-[#2c2c2e] to-[#1d1d1f] text-white shadow-soft">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-[#1d1d1f]">
            {PRODUCT_NAME}
          </span>
        </Link>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        {groups.map((group, gi) => (
          <div key={gi}>
            {group.label ? (
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
                {group.label}
              </p>
            ) : null}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-[10px] px-3 py-[9px] text-[13.5px] tracking-tight transition-all duration-200 ease-apple",
                      active
                        ? "bg-black/[0.06] font-semibold text-[#1d1d1f]"
                        : "font-medium text-[#6e6e73] hover:bg-black/[0.04] hover:text-[#1d1d1f]"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-[17px] w-[17px] shrink-0 transition-colors",
                        active ? "text-[#1d1d1f]" : "text-[#86868b]"
                      )}
                      strokeWidth={active ? 2.1 : 1.75}
                    />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-2 border-t border-black/[0.06] p-3">
        <div className="rounded-[12px] bg-black/[0.03] px-3 py-2.5">
          <p className="truncate text-[13px] font-semibold tracking-tight text-[#1d1d1f]">
            {userName || "User"}
          </p>
          <p className="mt-0.5 text-[11px] font-medium capitalize text-[#86868b]">
            {role.toLowerCase()}
          </p>
        </div>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="inline-flex h-10 w-full items-center gap-2.5 rounded-[10px] px-3 text-[13px] font-medium text-[#6e6e73] transition-colors duration-200 hover:bg-black/[0.04] hover:text-[#1d1d1f]"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.75} />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#f5f5f7] text-[#1d1d1f]">
      {/* Desktop sidebar — quiet, floating feel */}
      <aside className="hidden w-[232px] shrink-0 flex-col border-r border-black/[0.06] bg-[#fafafa] lg:flex">
        <NavBody />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="rf-glass sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-black/[0.06] px-4 lg:h-[52px] lg:px-8">
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#6e6e73] transition-colors hover:bg-black/[0.05] lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span className="text-[15px] font-semibold tracking-tight lg:hidden">
            {PRODUCT_NAME_SHORT}
          </span>
          <div className="flex-1" />
          {role === "EMPLOYEE" ? (
            <Link
              href="/chains/new"
              className="hidden items-center gap-1.5 rounded-full bg-[#0071e3] px-3.5 py-1.5 text-[12.5px] font-semibold text-white shadow-soft transition-colors hover:bg-[#0077ed] sm:inline-flex"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
              New chain
            </Link>
          ) : null}
          <span className="hidden max-w-[160px] truncate text-[13px] font-medium text-[#6e6e73] sm:inline">
            {userName}
          </span>
        </header>

        {/* Mobile drawer */}
        {open ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/20 backdrop-blur-[3px] transition-opacity"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 flex w-[min(280px,88vw)] flex-col bg-[#fafafa] shadow-float animate-in slide-in-from-left">
              <NavBody />
            </aside>
          </div>
        ) : null}

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1100px] px-4 py-7 sm:px-6 lg:px-10 lg:py-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
