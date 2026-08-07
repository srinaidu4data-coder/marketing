import { cn, statusBadgeClass } from "@/lib/utils";
import {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  forwardRef,
} from "react";

export function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "destructive" | "secondary" | "soft";
  size?: "default" | "sm" | "lg" | "icon";
}) {
  const variants: Record<string, string> = {
    default:
      "bg-[#1d1d1f] text-white shadow-soft hover:bg-black active:scale-[0.98]",
    soft:
      "bg-[#0071e3] text-white shadow-soft hover:bg-[#0077ed] active:scale-[0.98]",
    outline:
      "border border-black/[0.08] bg-white text-[#1d1d1f] shadow-soft hover:bg-[#fafafa] hover:border-black/[0.12]",
    ghost: "text-[#6e6e73] hover:bg-black/[0.04] hover:text-[#1d1d1f]",
    destructive:
      "bg-[#ff3b30] text-white shadow-soft hover:bg-[#ff453a] active:scale-[0.98]",
    secondary: "bg-black/[0.05] text-[#1d1d1f] hover:bg-black/[0.08]",
  };
  const sizes: Record<string, string> = {
    default: "h-10 px-4 text-[13.5px]",
    sm: "h-8 px-3 text-[12.5px]",
    lg: "h-12 px-6 text-[15px]",
    icon: "h-10 w-10",
  };
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium tracking-tight transition-all duration-200 ease-apple disabled:pointer-events-none disabled:opacity-40",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "flex h-11 w-full rounded-xl border border-black/[0.08] bg-white px-3.5 text-[15px] text-[#1d1d1f] shadow-soft placeholder:text-[#86868b] transition-all duration-200 ease-apple",
        "hover:border-black/[0.14] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#0071e3]/25 focus-visible:border-[#0071e3]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
});

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "flex min-h-[120px] w-full rounded-xl border border-black/[0.08] bg-white px-3.5 py-3 text-[15px] text-[#1d1d1f] shadow-soft placeholder:text-[#86868b] transition-all duration-200 ease-apple",
        "hover:border-black/[0.14] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#0071e3]/25 focus-visible:border-[#0071e3]",
        className
      )}
      {...props}
    />
  );
}

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "text-[13px] font-medium tracking-tight text-[#6e6e73]",
        className
      )}
      {...props}
    />
  );
}

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-black/[0.06] bg-white p-5 shadow-soft sm:p-6",
        className
      )}
      {...props}
    />
  );
}

export function Badge({
  status,
  children,
}: {
  status: string;
  children?: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-tight",
        statusBadgeClass(status)
      )}
      role="status"
      aria-label={`Status: ${status}`}
    >
      {children || status}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.022em] text-[#1d1d1f] sm:text-[32px]">
          {title}
        </h1>
        {description ? (
          <div className="max-w-2xl text-[15px] leading-relaxed text-[#6e6e73]">
            {description}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-black/[0.08] bg-white/70 px-6 py-20 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-black/[0.04] text-[#86868b]">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          aria-hidden
        >
          <path d="M4 7h16M4 12h10M4 17h14" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-[15px] font-semibold tracking-tight text-[#1d1d1f]">
        {title}
      </p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-[#86868b]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

/** Large metric for overview dashboards */
export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <Card className="!p-5">
      <div className="rf-kicker">{label}</div>
      <div className="mt-2 text-[2rem] font-semibold leading-none tracking-[-0.03em] text-[#1d1d1f]">
        {value}
      </div>
      {hint ? (
        <div className="mt-2 text-[12.5px] leading-snug text-[#86868b]">{hint}</div>
      ) : null}
    </Card>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="rf-kicker mb-3">{children}</h2>;
}
