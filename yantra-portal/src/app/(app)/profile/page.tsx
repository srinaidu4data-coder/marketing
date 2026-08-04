import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";

export default async function ProfilePage() {
  const sessionUser = await requireUser();
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { name: true, email: true, phone: true, role: true },
  });
  const name = user?.name || sessionUser.name;
  const email = user?.email || sessionUser.email;
  const phone = user?.phone || "";
  const role = user?.role || sessionUser.role;

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
            <div className="font-medium">{name}</div>
          </div>
          <div>
            <div className="text-slate-500">Email</div>
            <div className="font-medium">{email}</div>
          </div>
          <div>
            <div className="text-slate-500">Phone</div>
            <div className="font-medium">{phone?.trim() ? phone : "—"}</div>
          </div>
          <div>
            <div className="text-slate-500">Role</div>
            <div className="font-medium">
              {role === "ADMIN" ? "Admin" : "Employee"}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
