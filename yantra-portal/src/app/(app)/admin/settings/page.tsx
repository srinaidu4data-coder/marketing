import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { PageHeader, Card, Badge } from "@/components/ui";
import { SystemSettingsForm } from "@/components/settings-form";
import { getSystemConfig } from "@/lib/system-settings";
import { RESUME_LAYOUTS } from "@/lib/resume/templates";
import { getResendConfig } from "@/lib/email/resend";
import { getOpenAiConfig } from "@/lib/resume/openai-config";

const shortcuts = [
  {
    href: "/admin/email-activity",
    title: "Email activity",
    description: "To / From / Resend mode for every chain send.",
  },
  {
    href: "/admin/employees",
    title: "Employee profiles",
    description: "Staff accounts, roles, passwords, activate/deactivate.",
  },
  {
    href: "/admin/prompt",
    title: "Prompt template",
    description: "Active prompt body, version history, test mode.",
  },
  {
    href: "/admin/email-template",
    title: "Email template",
    description: "Subject and body templates for vendor emails.",
  },
  {
    href: "/admin/analytics",
    title: "Analytics & cost",
    description: "Pipeline KPIs, leaderboard, AI cost vs daily cap.",
  },
  {
    href: "/admin/queues",
    title: "Queues",
    description: "Background generation and email send queue status.",
  },
  {
    href: "/admin/allocations",
    title: "Allocations",
    description: "Candidate ↔ employee pool matrix.",
  },
];

export default async function AdminSettingsPage() {
  await requireAdmin();
  const config = await getSystemConfig();
  const email = getResendConfig();
  const openai = getOpenAiConfig();

  return (
    <div className="space-y-8 p-2 lg:p-4">
      <PageHeader
        title="System settings"
        description="Organization, resume defaults, resume engine policy (domain rules & templates), OpenAI, Resend email, and cost policy."
      />

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">OpenAI resume engine (required)</h2>
          <Badge status={openai.configured ? "SENT" : "FAILED"}>
            {openai.configured ? "configured" : "missing key"}
          </Badge>
        </div>
        <p className="text-sm text-slate-500">
          Every tailored resume is generated with the{" "}
          <strong>ACTIVE admin prompt</strong> +{" "}
          <strong>OpenAI Chat Completions</strong>. Without a real{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">OPENAI_API_KEY</code>, chain
          generation will fail on purpose (no silent non-AI output).
        </p>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded border bg-slate-50 p-3">
            <dt className="text-xs uppercase text-slate-500">OPENAI_API_KEY</dt>
            <dd className="mt-1 font-medium">
              {openai.configured
                ? "Configured (hidden)"
                : openai.reason || "Not set"}
            </dd>
          </div>
          <div className="rounded border bg-slate-50 p-3">
            <dt className="text-xs uppercase text-slate-500">Model / base URL</dt>
            <dd className="mt-1 font-mono text-xs">
              {openai.model}
              <br />
              {openai.baseUrl}
            </dd>
          </div>
        </dl>
        <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 text-[11px] text-slate-100">
{`# Vercel → Project → Settings → Environment Variables → Production
OPENAI_API_KEY=sk-proj-...your real key...
OPENAI_MODEL=gpt-4o-mini
# Optional Azure/proxy:
# OPENAI_BASE_URL=https://api.openai.com/v1
# Emergency only (not recommended):
# ALLOW_DETERMINISTIC_FALLBACK=true`}
        </pre>
        <Link
          href="/admin/prompt"
          className="inline-block text-sm font-medium text-sky-700 underline underline-offset-2"
        >
          Edit ACTIVE prompt template →
        </Link>
      </Card>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Resend email (Yantra-compatible)</h2>
          <Badge
            status={
              email.liveReady ? "SENT" : email.apiKeyPresent ? "READY" : "PENDING"
            }
          >
            {email.mode}
          </Badge>
        </div>
        <p className="text-sm text-slate-500">
          Non-secret settings are preconfigured for{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">contact.srsoftllc.com</code>.
          Add only <strong>RESEND_API_KEY</strong> on Vercel, then redeploy.
        </p>

        <ul className="space-y-1.5 text-sm">
          <li className="flex items-center gap-2">
            <span
              className={
                email.readiness.hasApiKey
                  ? "text-emerald-600"
                  : "text-amber-600"
              }
            >
              {email.readiness.hasApiKey ? "✓" : "○"}
            </span>
            <span>
              <strong>RESEND_API_KEY</strong>
              {email.readiness.hasApiKey
                ? " — configured"
                : " — waiting (add on Vercel when ready)"}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span
              className={
                email.readiness.fromConfigured
                  ? "text-emerald-600"
                  : "text-red-600"
              }
            >
              {email.readiness.fromConfigured ? "✓" : "×"}
            </span>
            <span>
              <strong>EMAIL_FROM</strong> — ready
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span
              className={
                email.readiness.dryRunOff ? "text-emerald-600" : "text-amber-600"
              }
            >
              {email.readiness.dryRunOff ? "✓" : "○"}
            </span>
            <span>
              <strong>EMAIL_DRY_RUN</strong> = {String(email.dryRun)}{" "}
              {email.readiness.dryRunOff ? "(live path)" : "(blocks real send)"}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span
              className={
                email.readiness.fromUsesVerifiedDomainHint
                  ? "text-emerald-600"
                  : "text-amber-600"
              }
            >
              {email.readiness.fromUsesVerifiedDomainHint ? "✓" : "○"}
            </span>
            <span>Domain looks production (not resend.dev sandbox)</span>
          </li>
        </ul>

        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded border bg-slate-50 p-3">
            <dt className="text-xs uppercase text-slate-500">EMAIL_FROM</dt>
            <dd className="mt-1 break-all font-mono text-xs">{email.from}</dd>
          </div>
          <div className="rounded border bg-slate-50 p-3">
            <dt className="text-xs uppercase text-slate-500">EMAIL_REPLY_TO</dt>
            <dd className="mt-1 break-all font-mono text-xs">
              {email.replyToDefault || "defaults to employee email on each send"}
            </dd>
          </div>
          <div className="rounded border bg-slate-50 p-3">
            <dt className="text-xs uppercase text-slate-500">CC / BCC</dt>
            <dd className="mt-1 text-xs">
              {email.ccDefault.length
                ? `cc=${email.ccDefault.join(", ")}`
                : "no default CC"}
              {" · "}
              {email.bccDefault.length
                ? `bcc=${email.bccDefault.join(", ")}`
                : "no BCC"}
            </dd>
          </div>
          <div className="rounded border bg-slate-50 p-3">
            <dt className="text-xs uppercase text-slate-500">Live ready</dt>
            <dd className="mt-1 text-xs font-medium">
              {email.liveReady
                ? "Yes — sends hit Resend"
                : "No — waiting on RESEND_API_KEY (or dry-run)"}
            </dd>
          </div>
        </dl>
        <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 text-[11px] text-slate-100">
{`# Only missing piece (Vercel → roleforge → Environment Variables)
RESEND_API_KEY=re_xxxxxxxx

# Already set for production:
# EMAIL_FROM=Role Forge <noreply@contact.srsoftllc.com>
# EMAIL_DRY_RUN=false
# Then redeploy.`}
        </pre>
        <Link
          href="/admin/email-activity"
          className="inline-block text-sm font-medium text-sky-700 underline underline-offset-2"
        >
          Open email activity log →
        </Link>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-medium">Configuration</h2>
        <p className="text-sm text-slate-500">
          These values are stored in <code className="rounded bg-slate-100 px-1 text-xs">SystemSetting</code>{" "}
          and used by the admin console and candidate defaults.
        </p>
        <div className="pt-2">
          <SystemSettingsForm
            config={config}
            layouts={RESUME_LAYOUTS.map((l) => ({ id: l.id, name: l.name }))}
          />
        </div>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Related management
        </h2>
        <nav className="grid gap-3 sm:grid-cols-2">
          {shortcuts.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg border p-4 transition-colors hover:bg-slate-50"
            >
              <h3 className="font-medium">
                {l.title} <span className="text-slate-400">Open →</span>
              </h3>
              <p className="mt-1 text-sm text-slate-500">{l.description}</p>
            </Link>
          ))}
        </nav>
      </section>
    </div>
  );
}
