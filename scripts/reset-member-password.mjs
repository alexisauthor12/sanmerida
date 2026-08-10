import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const MEMBER_KEY_PATTERN = /^SAN-MEMBER-[A-Z0-9]{6}$/;

async function main() {
  const email = process.env.RESET_MEMBER_EMAIL?.trim().toLowerCase() || "alexruizrondon@gmail.com";
  const plainPassword = process.env.RESET_MEMBER_KEY;

  if (!plainPassword) {
    throw new Error("Define RESET_MEMBER_KEY en el entorno para ejecutar este script.");
  }

  if (!MEMBER_KEY_PATTERN.test(plainPassword)) {
    throw new Error("La clave debe cumplir el formato SAN-MEMBER-XXXXXX");
  }

  const passwordHash = await bcrypt.hash(plainPassword, 12);

  const existing = await prisma.user.findUnique({ where: { email } });

  if (!existing) {
    await prisma.user.create({
      data: {
        nombre: "Alexis",
        apellido: "Ruiz",
        email,
        telefono: "0000000000",
        passwordHash,
        isMember: true,
      },
    });
    console.log("Cuenta creada y clave encriptada establecida.");
    return;
  }

  await prisma.user.update({
    where: { email },
    data: { passwordHash, isMember: true },
  });

  console.log("Clave encriptada restablecida correctamente.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
