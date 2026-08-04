"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createEmployee,
  updateEmployee,
  resetEmployeePassword,
  softDeleteEmployee,
  restoreEmployee,
  type EmployeeActionResult,
} from "@/app/actions/employees";
import { Button, Input, Label } from "@/components/ui";

function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {error}
    </div>
  );
}

function SuccessBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
      {message}
    </div>
  );
}

export function CreateEmployeeForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="mt-4 grid max-w-2xl gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          const res: EmployeeActionResult = await createEmployee(fd);
          if (!res.ok) {
            setError(res.error);
            return;
          }
          (e.target as HTMLFormElement).reset();
          router.refresh();
        });
      }}
    >
      <ErrorBanner error={error} />
      <div className="space-y-1">
        <Label htmlFor="emp-name">Name</Label>
        <Input id="emp-name" name="name" required placeholder="Sowmya" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="emp-email">Email</Label>
        <Input
          id="emp-email"
          name="email"
          type="email"
          required
          placeholder="sowmya@srsoftllc.com"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="emp-phone">Phone number</Label>
        <Input
          id="emp-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="+1 (555) 123-4567"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="emp-password">Temporary password</Label>
        <Input
          id="emp-password"
          name="password"
          type="password"
          required
          minLength={6}
          placeholder="Min 6 characters"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="emp-role">Role</Label>
        <select
          id="emp-role"
          name="role"
          defaultValue="EMPLOYEE"
          className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="EMPLOYEE">Employee</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>
      <Button type="submit" className="w-fit" disabled={pending}>
        {pending ? "Creating…" : "Create profile"}
      </Button>
    </form>
  );
}

export function EditEmployeeForm({
  employeeId,
  name,
  email,
  phone = "",
  role,
}: {
  employeeId: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="grid max-w-xl gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        setSuccess(null);
        start(async () => {
          const res = await updateEmployee(employeeId, fd);
          if (!res.ok) {
            setError(res.error);
            return;
          }
          setSuccess("Profile updated.");
          router.refresh();
        });
      }}
    >
      <ErrorBanner error={error} />
      <SuccessBanner message={success} />
      <div className="space-y-1">
        <Label htmlFor="edit-name">Name</Label>
        <Input id="edit-name" name="name" required defaultValue={name} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="edit-email">Email</Label>
        <Input id="edit-email" name="email" type="email" required defaultValue={email} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="edit-phone">Phone number</Label>
        <Input
          id="edit-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="+1 (555) 123-4567"
          defaultValue={phone || ""}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="edit-role">Role</Label>
        <select
          id="edit-role"
          name="role"
          defaultValue={role}
          className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="EMPLOYEE">Employee</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>
      <Button type="submit" className="w-fit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ employeeId }: { employeeId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="grid max-w-xl gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        setSuccess(null);
        start(async () => {
          const res = await resetEmployeePassword(employeeId, fd);
          if (!res.ok) {
            setError(res.error);
            return;
          }
          setSuccess("Password reset. Share the new password securely.");
          (e.target as HTMLFormElement).reset();
        });
      }}
    >
      <ErrorBanner error={error} />
      <SuccessBanner message={success} />
      <div className="space-y-1">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          name="password"
          type="password"
          required
          minLength={6}
          placeholder="Min 6 characters"
        />
      </div>
      <Button type="submit" variant="outline" className="w-fit" disabled={pending}>
        {pending ? "Resetting…" : "Reset password"}
      </Button>
    </form>
  );
}

export function EmployeeStatusActions({
  employeeId,
  deleted,
  isSelf,
}: {
  employeeId: string;
  deleted: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-3">
      <ErrorBanner error={error} />
      {deleted ? (
        <Button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            start(async () => {
              const res = await restoreEmployee(employeeId);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              router.refresh();
            });
          }}
        >
          {pending ? "Restoring…" : "Restore account"}
        </Button>
      ) : (
        <Button
          type="button"
          variant="destructive"
          disabled={pending || isSelf}
          title={isSelf ? "You cannot deactivate your own account" : undefined}
          onClick={() => {
            if (!confirm("Deactivate this account? They will not be able to sign in.")) return;
            setError(null);
            start(async () => {
              const res = await softDeleteEmployee(employeeId);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              router.refresh();
            });
          }}
        >
          {pending ? "Deactivating…" : "Deactivate account"}
        </Button>
      )}
      {isSelf ? (
        <p className="text-xs text-slate-500">You cannot deactivate the account you are signed in with.</p>
      ) : null}
    </div>
  );
}
