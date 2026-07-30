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
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function statusBadgeClass(status: string) {
  const s = status.toUpperCase();
  if (s === "SENT") return "bg-emerald-100 text-emerald-800";
  if (s === "READY") return "bg-blue-100 text-blue-800";
  if (s === "FAILED") return "bg-red-100 text-red-800";
  if (s === "GENERATING" || s === "SENDING") return "bg-amber-100 text-amber-800";
  if (s === "ACTIVE") return "bg-emerald-100 text-emerald-800";
  if (s === "DRAFT") return "bg-slate-100 text-slate-700";
  return "bg-slate-100 text-slate-700";
}
