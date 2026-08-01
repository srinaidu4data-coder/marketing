import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Soft Apple-like status pills */
export function statusBadgeClass(status: string) {
  const s = status.toUpperCase();
  if (s === "SENT" || s === "ACTIVE")
    return "bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/15";
  if (s === "READY")
    return "bg-sky-500/10 text-sky-800 ring-1 ring-inset ring-sky-500/15";
  if (s === "PARTIAL")
    return "bg-amber-500/10 text-amber-900 ring-1 ring-inset ring-amber-500/20";
  if (s === "FAILED")
    return "bg-red-500/10 text-red-700 ring-1 ring-inset ring-red-500/15";
  if (s === "GENERATING" || s === "SENDING")
    return "bg-amber-500/10 text-amber-800 ring-1 ring-inset ring-amber-500/15";
  if (s === "DRAFT" || s === "PENDING")
    return "bg-black/[0.04] text-[#6e6e73] ring-1 ring-inset ring-black/[0.06]";
  return "bg-black/[0.04] text-[#6e6e73] ring-1 ring-inset ring-black/[0.06]";
}
