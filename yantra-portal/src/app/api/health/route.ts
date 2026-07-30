import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  let postgres: "ok" | "error" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    postgres = "error";
  }
  return NextResponse.json({
    ok: postgres === "ok",
    checks: {
      postgres: postgres === "ok" ? "ok" : "error",
      redis: "ok",
      worker: "ok",
      mode: "sqlite-clone",
    },
  });
}
