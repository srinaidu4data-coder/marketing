import { PrismaClient } from "@prisma/client";
import { DEFAULT_PROMPT } from "../src/lib/constants";

const prisma = new PrismaClient();

async function main() {
  const active = await prisma.promptVersion.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  if (active) {
    await prisma.promptVersion.update({
      where: { id: active.id },
      data: { content: DEFAULT_PROMPT },
    });
    console.log("Updated ACTIVE prompt", active.id.slice(0, 8));
  } else {
    await prisma.promptVersion.create({
      data: { content: DEFAULT_PROMPT, status: "ACTIVE", tested: true },
    });
    console.log("Created ACTIVE prompt");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
