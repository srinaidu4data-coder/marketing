"use client";

import { getSession, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { Button, Input, Label } from "@/components/ui";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";

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
    // Avoid sending admin to employee home or employee to admin
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-xl border bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{PRODUCT_NAME}</h1>
          <p className="mt-1 text-sm text-slate-500">{PRODUCT_TAGLINE}</p>
        </div>
        <h2 className="mb-6 text-xl font-semibold">Sign in</h2>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
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
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <div className="mt-6 rounded-md bg-slate-50 p-3 text-xs text-slate-500">
          <p className="font-medium text-slate-700">Demo accounts</p>
          <p className="mt-1">Admin: admin@srsoft.com / admin123</p>
          <p>Employee: sowmya@srsoftllc.com / employee123</p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
