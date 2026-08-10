import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

try {
  const email = "alexruizrondon@gmail.com";
  const plainPassword = process.env.RESET_ACCOUNT_PASSWORD;

  if (!plainPassword) {
    throw new Error("Define RESET_ACCOUNT_PASSWORD en el entorno para ejecutar este script.");
  }

  const passwordHash = await bcrypt.hash(plainPassword, 12);

  await prisma.user.upsert({
    where: { email },
    update: {
      nombre: "Alexis",
      apellido: "Ruiz",
      telefono: "+584140000000",
      passwordHash,
      isMember: false,
    },
    create: {
      nombre: "Alexis",
      apellido: "Ruiz",
      email,
      telefono: "+584140000000",
      passwordHash,
      isMember: false,
    },
  });

  console.log("Usuario Alexis registrado/actualizado correctamente en portal Gestionar mi cuenta.");
} finally {
  await prisma.$disconnect();
}
