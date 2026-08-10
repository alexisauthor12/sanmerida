import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function promote() {
  await prisma.user.update({
    where: { email: "alexruizrondon@gmail.com" },
    data: { isMember: true }
  });
  console.log("Usuario Alexis ascendido a Miembro TEAM SAN.");
}

promote().finally(() => prisma.$disconnect());
