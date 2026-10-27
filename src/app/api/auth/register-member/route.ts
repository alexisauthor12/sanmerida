import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { encryptMemberKey } from "@/lib/member-credentials.mjs";
import { prisma } from "@/lib/prisma";
import { getMotoBySlug } from "@/data/motos";
import { getSessionUser } from "@/lib/session";

type RegisterMemberPayload = {
  nombre?: string;
  apellido?: string;
  email?: string;
  telefono?: string;
  cedula?: string;
  direccion?: string;
  ocupacion?: string;
  empresa?: string;
  operationalGroup?: string;
  references?: string;
  ubicacionLat?: number;
  ubicacionLng?: number;
  referenciaLat?: number;
  referenciaLng?: number;
  referencia2Lat?: number;
  referencia2Lng?: number;
  motoSlug?: string;
  omitCertificateOrigin?: boolean;
  omitLicencia?: boolean;
  contractType?: string;
  planName?: string;
  termMonths?: number;
  installmentCount?: number;
  monthlyAmount?: number;
  contractStartDate?: string;
  paymentMethod?: string;
  paymentBank?: string;
  paymentReference?: string;
  paymentAmount?: number;
  paymentDate?: string;
  payLater?: boolean;
  motoUnitPrice?: number;
  username?: string;
  encryptedKey?: string;
};

const MEMBER_KEY_PATTERN = /^SAN-MEMBER-[A-Z0-9]{6}$/;

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function slugifyUsernamePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildExpectedUsername(nombre: string, apellido: string) {
  return `@${slugifyUsernamePart(nombre)}-${slugifyUsernamePart(apellido)}`.replace(/-+/g, "-");
}

/** Convierte un valor de coordenada a número válido; devuelve NaN si no aplica. */
function parseCoordinate(value: unknown) {
  if (value === undefined || value === null || value === "") return Number.NaN;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();

    if (!sessionUser?.userId) {
      return NextResponse.json({ ok: false, message: "Debes iniciar sesión para registrar miembros." }, { status: 401 });
    }

    if (sessionUser.isMember) {
      return NextResponse.json({ ok: false, message: "Tu perfil no tiene permisos para registrar miembros." }, { status: 403 });
    }

    const body = (await request.json()) as RegisterMemberPayload;

  const nombre = body.nombre?.trim() ?? "";
  const apellido = body.apellido?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  const telefono = body.telefono?.trim() ?? "";
  const cedula = body.cedula?.trim() ?? "";
  const direccion = body.direccion?.trim() ?? "";
  const ocupacion = body.ocupacion?.trim() ?? "";
  const empresa = body.empresa?.trim() ?? "";
  const operationalGroup = body.operationalGroup?.trim() ?? "";
  const references = body.references?.trim() ?? "";
  const ubicacionLat = parseCoordinate(body.ubicacionLat);
  const ubicacionLng = parseCoordinate(body.ubicacionLng);
  const referenciaLat = parseCoordinate(body.referenciaLat);
  const referenciaLng = parseCoordinate(body.referenciaLng);
  const referencia2Lat = parseCoordinate(body.referencia2Lat);
  const referencia2Lng = parseCoordinate(body.referencia2Lng);
  const hasUbicacion = Number.isFinite(ubicacionLat) && Number.isFinite(ubicacionLng);
  const hasReferencia = Number.isFinite(referenciaLat) && Number.isFinite(referenciaLng);
  const hasReferencia2 = Number.isFinite(referencia2Lat) && Number.isFinite(referencia2Lng);
  const motoSlug = body.motoSlug?.trim() ?? "";
  const omitCertificateOrigin = body.omitCertificateOrigin === true;
  const omitLicencia = body.omitLicencia === true;
  const contractType = body.contractType?.trim() ?? "";
  const planName = body.planName?.trim() ?? "";
  const termMonths = Number(body.termMonths ?? 0);
  const installmentCount = Math.max(0, Math.round(Number(body.installmentCount ?? 0)));
  const monthlyAmount = Number(body.monthlyAmount ?? 0);
  const contractStartDate = body.contractStartDate?.trim() ?? "";
  const paymentMethod = body.paymentMethod?.trim() ?? "";
  const paymentBank = body.paymentBank?.trim() ?? "";
  const paymentReference = body.paymentReference?.trim() ?? "";
  const paymentAmount = Number(body.paymentAmount ?? 0);
  const paymentDate = body.paymentDate?.trim() ?? "";
  const payLater = body.payLater === true;
  const motoUnitPrice = Number(body.motoUnitPrice ?? 0);
  const username = body.username?.trim().toLowerCase() ?? "";
  const encryptedKey = body.encryptedKey?.trim().toUpperCase() ?? "";

  if (
    !nombre ||
    !apellido ||
    !email ||
    !telefono ||
    !cedula ||
    !direccion ||
    !ocupacion ||
    !empresa ||
    !operationalGroup ||
    !motoSlug ||
    !contractType ||
    !planName ||
    !contractStartDate ||
    !username ||
    !encryptedKey ||
    termMonths <= 0 ||
    monthlyAmount <= 0
  ) {
    return NextResponse.json(
      { ok: false, message: "Completa el flujo completo: datos, documentos, contrato, pago y credenciales." },
      { status: 400 },
    );
  }

  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false, message: "Ingresa un correo electrónico válido." }, { status: 400 });
  }

  if (!/^Grupo\s(0[1-9]|[1-9][0-9]|100)$/.test(operationalGroup)) {
    return NextResponse.json({ ok: false, message: "Selecciona un grupo válido entre Grupo 01 y Grupo 100." }, { status: 400 });
  }

  if (!MEMBER_KEY_PATTERN.test(encryptedKey)) {
    return NextResponse.json(
      { ok: false, message: "La clave encriptada debe cumplir el formato SAN-MEMBER-XXXXXX." },
      { status: 400 },
    );
  }

  const expectedUsername = buildExpectedUsername(nombre, apellido).toLowerCase();
  if (username !== expectedUsername) {
    return NextResponse.json(
      { ok: false, message: `El usuario debe coincidir con ${expectedUsername}.` },
      { status: 400 },
    );
  }

  const selectedMoto = getMotoBySlug(motoSlug);
  if (!selectedMoto) {
    return NextResponse.json({ ok: false, message: "Selecciona una moto válida para el expediente." }, { status: 400 });
  }

  if (!payLater && (!paymentMethod || !paymentBank || !paymentReference || !paymentDate || paymentAmount <= 0)) {
    return NextResponse.json(
      { ok: false, message: "Completa los datos del pago inicial o usa la opción pagar después." },
      { status: 400 },
    );
  }

  if (!payLater && paymentAmount < monthlyAmount) {
    return NextResponse.json(
      {
        ok: false,
        message: `El pago inicial debe cubrir al menos la primera cuota (${monthlyAmount.toFixed(2)} USD).`,
      },
      { status: 400 },
    );
  }

  const parsedPaymentDate = payLater ? null : new Date(paymentDate);
  if (!payLater && (!parsedPaymentDate || Number.isNaN(parsedPaymentDate.getTime()))) {
    return NextResponse.json({ ok: false, message: "La fecha de pago inicial es inválida." }, { status: 400 });
  }

  const motoNameParts = selectedMoto.nombre.trim().split(/\s+/);
  const motoMarca = motoNameParts[0] ?? selectedMoto.nombre;
  const motoModelo = selectedMoto.nombre;

  const baseRequiredAssets = [
    { assetType: "DOCUMENT", documentKey: "identidad", variant: "NORMAL" },
    { assetType: "DOCUMENT", documentKey: "identidad", variant: "SCANNED" },
    { assetType: "DOCUMENT", documentKey: "rif", variant: "NORMAL" },
    { assetType: "DOCUMENT", documentKey: "rif", variant: "SCANNED" },
    { assetType: "DOCUMENT", documentKey: "selfie", variant: "NORMAL" },
    { assetType: "DOCUMENT", documentKey: "selfie", variant: "SCANNED" },
    { assetType: "CONTRACT", documentKey: "principal", variant: "NORMAL" },
    { assetType: "CONTRACT", documentKey: "principal", variant: "SCANNED" },
  ] as const;

  const certificateAssets = [
    { assetType: "DOCUMENT", documentKey: "certificado-origen", variant: "NORMAL" },
    { assetType: "DOCUMENT", documentKey: "certificado-origen", variant: "SCANNED" },
  ] as const;

  const licenciaAssets = [
    { assetType: "DOCUMENT", documentKey: "licencia", variant: "NORMAL" },
    { assetType: "DOCUMENT", documentKey: "licencia", variant: "SCANNED" },
  ] as const;

  const requiredAssets = [
    ...baseRequiredAssets,
    ...(omitLicencia ? [] : licenciaAssets),
    ...(omitCertificateOrigin ? [] : certificateAssets),
  ];

  const profile = await prisma.memberProfile.findUnique({
    where: { cedula },
    include: { assets: true },
  });

  if (!profile) {
    return NextResponse.json(
      { ok: false, message: "No existe expediente para esa cédula. Carga primero documentos y contrato." },
      { status: 400 },
    );
  }

  const missing = requiredAssets.filter((requiredAsset) => {
    return !profile.assets.some(
      (asset) =>
        asset.assetType === requiredAsset.assetType &&
        asset.documentKey === requiredAsset.documentKey &&
        asset.variant === requiredAsset.variant,
    );
  });

  if (missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        message: "Falta expediente digital completo: se requieren documentos y contratos normal + escaneado.",
      },
      { status: 400 },
    );
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return NextResponse.json(
      { ok: false, message: "Ya existe una cuenta registrada con este correo." },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(encryptedKey, 12);

  // La clave también queda en el expediente, cifrada y de forma reversible,
  // para que el administrador pueda consultarla al buscar al miembro.
  const memberKeyCipher = await encryptMemberKey(encryptedKey, process.env.AUTH_SECRET ?? "");

  const createdUser = await prisma.user.create({
    data: {
      nombre,
      apellido,
      email,
      telefono,
      passwordHash,
      isMember: true,
    },
  });

  const updatedProfile = await prisma.memberProfile.update({
    where: { cedula },
    data: {
      userId: createdUser.id,
      nombre,
      apellido,
      email,
      telefono,
      direccion,
      ocupacion,
      empresa,
      operationalGroup,
      references,
      ubicacionLat: hasUbicacion ? ubicacionLat : null,
      ubicacionLng: hasUbicacion ? ubicacionLng : null,
      ubicacionLink: hasUbicacion
        ? `https://www.google.com/maps?q=${ubicacionLat.toFixed(6)},${ubicacionLng.toFixed(6)}`
        : null,
      referenciaLat: hasReferencia ? referenciaLat : null,
      referenciaLng: hasReferencia ? referenciaLng : null,
      referenciaLink: hasReferencia
        ? `https://www.google.com/maps?q=${referenciaLat.toFixed(6)},${referenciaLng.toFixed(6)}`
        : null,
      referencia2Lat: hasReferencia2 ? referencia2Lat : null,
      referencia2Lng: hasReferencia2 ? referencia2Lng : null,
      referencia2Link: hasReferencia2
        ? `https://www.google.com/maps?q=${referencia2Lat.toFixed(6)},${referencia2Lng.toFixed(6)}`
        : null,
      username: expectedUsername,
      memberKeyCipher,
      memberKeyIssuedAt: memberKeyCipher ? new Date() : null,
      motoSlug: selectedMoto.slug,
      motoMarca,
      motoModelo,
      motoImagen: selectedMoto.imagen,
      motoUnitPrice: motoUnitPrice > 0 ? motoUnitPrice : null,
      contractType,
      planName,
      termMonths,
      installmentCount: installmentCount > 0 ? installmentCount : null,
      monthlyAmount,
      contractStartDate,
      paymentMethod: payLater ? "Pagar después" : paymentMethod,
      paymentBank: payLater ? "Pendiente" : paymentBank,
      paymentReference: payLater ? `PEND-${cedula}` : paymentReference,
      paymentAmount: payLater ? 0 : paymentAmount,
      paymentDate: payLater ? null : paymentDate,
    },
  });

  if (!payLater && parsedPaymentDate) {
    const existingFirstInstallment = await prisma.installmentPayment.findFirst({
      where: {
        profileId: updatedProfile.id,
        installmentNumber: 1,
      },
      select: { id: true },
    });

    if (existingFirstInstallment) {
      await prisma.installmentPayment.update({
        where: { id: existingFirstInstallment.id },
        data: {
          amount: monthlyAmount,
          paymentDate: parsedPaymentDate,
          reference: paymentReference,
          bank: paymentBank,
          method: paymentMethod,
          note: `Primera cuota ajustada al registrar expediente. Pago recibido: ${paymentAmount.toFixed(2)} USD.`,
          createdByUserId: String(sessionUser.userId ?? ""),
        },
      });
    } else {
      await prisma.installmentPayment.create({
        data: {
          profileId: updatedProfile.id,
          installmentNumber: 1,
          amount: monthlyAmount,
          paymentDate: parsedPaymentDate,
          reference: paymentReference,
          bank: paymentBank,
          method: paymentMethod,
          note: `Primera cuota registrada automáticamente al crear el expediente. Pago recibido: ${paymentAmount.toFixed(2)} USD.`,
          createdByUserId: String(sessionUser.userId ?? ""),
        },
      });
    }
  }

    return NextResponse.json({
      ok: true,
      message: "Miembro registrado correctamente con expediente completo.",
      credentials: {
        username: expectedUsername,
        encryptedKey,
      },
    });
  } catch (error) {
    console.error("register-member error", error);
    return NextResponse.json(
      {
        ok: false,
        message: "Error interno al registrar el miembro. Verifica la configuración del servidor y Prisma.",
      },
      { status: 500 },
    );
  }
}
