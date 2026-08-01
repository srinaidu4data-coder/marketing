"use client";

import { getSession, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { Button, Input, Label } from "@/components/ui";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";
import { Sparkles } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    if (res?.error) {
      setLoading(false);
      setError("Invalid email or password");
      return;
    }
    const session = await getSession();
    const role = session?.user?.role;
    let dest = callbackUrl || (role === "ADMIN" ? "/admin" : "/");
    if (role === "ADMIN" && (dest === "/" || dest.startsWith("/chains"))) {
      dest = "/admin";
    }
    if (role === "EMPLOYEE" && dest.startsWith("/admin")) {
      dest = "/";
    }
    router.push(dest);
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f5f5f7] px-5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(0,113,227,0.12),transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/2 h-64 w-[40rem] -translate-x-1/2 rounded-full bg-white/60 blur-3xl"
      />

      <div className="relative w-full max-w-[400px]">
        <div className="mb-9 flex flex-col items-center text-center">
          <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-[16px] bg-gradient-to-b from-[#2c2c2e] to-[#1d1d1f] text-white shadow-float">
            <Sparkles className="h-6 w-6" strokeWidth={1.75} />
          </span>
          <h1 className="text-[28px] font-semibold tracking-[-0.022em] text-[#1d1d1f]">
            {PRODUCT_NAME}
          </h1>
          <p className="mt-1.5 text-[15px] text-[#6e6e73]">{PRODUCT_TAGLINE}</p>
        </div>

        <div className="rounded-3xl border border-black/[0.06] bg-white/90 p-8 shadow-float backdrop-blur-xl">
          <h2 className="text-[21px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
            Sign in
          </h2>
          <p className="mt-1 text-[14px] leading-relaxed text-[#86868b]">
            Use your work email to continue.
          </p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error ? (
              <div
                role="alert"
                className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-[13px] font-medium text-red-700 ring-1 ring-inset ring-red-500/15"
              >
                {error}
              </div>
            ) : null}

            <Button
              type="submit"
              variant="soft"
              size="lg"
              className="mt-2 w-full"
              disabled={loading}
            >
              {loading ? "Signing in…" : "Continue"}
            </Button>
          </form>
        </div>

        <p className="mt-8 text-center text-[12px] text-[#86868b]">
          Protected workspace · authorized staff only
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7] text-[14px] text-[#86868b]">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
