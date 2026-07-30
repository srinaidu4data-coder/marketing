import { requireUser } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-2 lg:p-4">
      <PageHeader
        title="Profile"
        description="Your account details — contact your admin to update."
      />
      <Card className="space-y-4">
        <h2 className="font-medium">Account</h2>
        <div className="grid gap-3 text-sm">
          <div>
            <div className="text-slate-500">Name</div>
            <div className="font-medium">{user.name}</div>
          </div>
          <div>
            <div className="text-slate-500">Email</div>
            <div className="font-medium">{user.email}</div>
          </div>
          <div>
            <div className="text-slate-500">Role</div>
            <div className="font-medium">
              {user.role === "ADMIN" ? "Admin" : "Employee"}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
