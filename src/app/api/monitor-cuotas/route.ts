import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildAssetUrl } from "@/lib/asset-paths.mjs";
import {
  buildInstallments,
  buildPaidAmountMap,
  normalizeMoney,
  parseIsoOrNow,
  resolveInstallmentTotal,
  resolveIntervalDays,
  toDmy,
} from "@/lib/installment-schedule.mjs";
import {
  decryptMemberKey,
  encryptMemberKey,
  generateMemberKey,
  isMemberKey,
} from "@/lib/member-credentials.mjs";
import { ADMIN_ACCESS_COOKIE_NAME, verifyAdminAccessToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type MonitorClient = {
  id: string;
  nombre: string;
  documento: string;
  telefono: string;
  agencia: string;
  gestor: string;
  estado: "Al día" | "Con atraso" | "Riesgo";
  cuotasPendientes: number;
  cuotasVencidas: number;
  saldo: number;
  proximoVencimiento: string;
};

type MonitorInstallment = {
  id: string;
  clientId: string;
  semana: number;
  numero: number;
  tipo: "Regular" | "Fuera de semana";
  vence: string;
  monto: number;
  recargo: number;
  estado: "Pendiente" | "Vencida" | "Por vencer" | "Pagada";
};

type MonitorContract = {
  id: string;
  tipo: string;
  fecha: string;
  monto: number;
  estado: string;
  archivo: string;
};

type MonitorDocument = {
  id: string;
  nombre: string;
  tipo: string;
  fecha: string;
  archivo: string;
  /** "Digitalizado" si se sirve el escaneo generado; "Original" si es el archivo subido. */
  variante?: string;
};

type MonitorProfile = {
  clientId: string;
  cedula: string;
  nombre: string;
  apellido: string;
  username: string;
  credenciales: {
    usuario: string;
    clave: string;
    disponible: boolean;
    emitidaEn: string;
  };
  fotoPersona: string;
  fotoCedula: string;
  fotoRif: string;
  direccion: string;
  ocupacion: string;
  empresa: string;
  references: string;
  ubicacionLink: string;
  referenciaLink: string;
  ubicacionLat: number | null;
  ubicacionLng: number | null;
  referenciaLat: number | null;
  referenciaLng: number | null;
  referencia2Lat: number | null;
  referencia2Lng: number | null;
  fechaIngreso: string;
  motoMarca: string;
  motoModelo: string;
  motoImagen: string;
  plan: string;
  cuotaMensual: number;
  cuotasTotales: number;
  cuotasPagadas: number;
  totalAbonado: number;
  contratos: MonitorContract[];
  documentos: MonitorDocument[];
};

type MonitorPaymentRecord = {
  id: string;
  installmentNumber: number;
  amount: number;
  paymentDate: string;
  reference: string;
  bank: string;
  method: string;
  note: string;
  createdAt: string;
};

type MonitorAdvanceRecord = {
  id: string;
  amount: number;
  paymentDate: string;
  reference: string;
  bank: string;
  method: string;
  note: string;
  createdAt: string;
};

type RegisterPaymentPayload = {
  cedula?: string;
  installmentNumber?: number;
  amount?: number;
  paymentDate?: string;
  reference?: string;
  bank?: string;
  method?: string;
  note?: string;
  kind?: "installment" | "advance" | "credentials";
  memberKey?: string;
};

type LocalPaymentRecord = {
  id: string;
  installmentNumber: number;
  amount: number;
  paymentDate: Date;
  reference: string;
  bank: string;
  method: string;
  note: string;
  createdAt: Date;
};

type LocalAdvanceRecord = {
  id: string;
  amount: number;
  paymentDate: Date;
  reference: string;
  bank: string;
  method: string;
  note: string;
  createdAt: Date;
};

const localMonitorStore = new Map<string, {
  startDate: Date;
  installmentPayments: LocalPaymentRecord[];
  advancePayments: LocalAdvanceRecord[];
}>();

const FALLBACK_IMAGE = "/Documentos/Identificacion principal.jpeg";

function sanitizeCedula(value: string) {
  return value.replace(/\D/g, "");
}

function parseDmy(value: string) {
  const [day, month, year] = value.split("/").map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1);
}

function getLocalStoreByCedula(cedula: string) {
  const key = sanitizeCedula(cedula);
  if (!key) return null;

  const existing = localMonitorStore.get(key);
  if (existing) return existing;

  const startDate = new Date();

  const seeded = {
    startDate,
    installmentPayments: [] as LocalPaymentRecord[],
    advancePayments: [] as LocalAdvanceRecord[],
  };

  localMonitorStore.set(key, seeded);
  return seeded;
}

function getInstallmentNumberFromAdvanceMeta(note: string, reference: string) {
  const match =
    note.match(/cuota objetivo\s*#\s*(\d+)/i) ||
    note.match(/cuota\s*#\s*(\d+)/i) ||
    reference.match(/ABN-C\s*0*(\d+)/i) ||
    reference.match(/C\s*0*(\d+)/i);

  if (!match) return 0;
  const installmentNumber = Number(match[1]);
  return Number.isFinite(installmentNumber) ? installmentNumber : 0;
}

function calculateAdvanceMaxAmount(params: { installmentTotal: number; alreadyAdvanced: number }) {
  const installmentTotal = normalizeMoney(params.installmentTotal);
  const alreadyAdvanced = normalizeMoney(params.alreadyAdvanced);
  const remaining = Math.max(0, normalizeMoney(installmentTotal - alreadyAdvanced));
  const lessThanFullCap = Math.max(0, normalizeMoney(remaining - 0.01));
  const safetyCap = normalizeMoney(installmentTotal * 0.8);
  return Math.max(0, normalizeMoney(Math.min(lessThanFullCap, safetyCap)));
}

// Las funciones de calendario de cuotas (toDmy, parseIsoOrNow, normalizeMoney,
// resolveInstallmentTotal, resolveIntervalDays, buildPaidAmountMap y
// buildInstallments) viven en `src/lib/installment-schedule.mjs` para que el
// panel del miembro y el monitor usen exactamente los mismos calculos.


/**
 * Resuelve la URL protegida del archivo de un expediente. Los documentos ya no
 * se sirven como estaticos de `public/uploads`: `buildAssetUrl` los envia al
 * endpoint autenticado `/api/member-files/file`.
 */
function findAssetPath(
  assets: Array<{ assetType: "DOCUMENT" | "CONTRACT"; documentKey: string; variant: "NORMAL" | "SCANNED"; filePath: string }>,
  assetType: "DOCUMENT" | "CONTRACT",
  documentKey: string,
  preferredVariant: "NORMAL" | "SCANNED" = "SCANNED"
) {
  const secondaryVariant = preferredVariant === "SCANNED" ? "NORMAL" : "SCANNED";

  const filePath =
    assets.find((item) => item.assetType === assetType && item.documentKey === documentKey && item.variant === preferredVariant)?.filePath ||
    assets.find((item) => item.assetType === assetType && item.documentKey === documentKey && item.variant === secondaryVariant)?.filePath;

  return filePath ? buildAssetUrl(filePath) : FALLBACK_IMAGE;
}

// (resolveIntervalDays, buildPaidAmountMap y buildInstallments ya no se definen
// aqui: se importan de `src/lib/installment-schedule.mjs`.)


async function mapProfile(
  profile: {
  id: string;
  cedula: string;
  nombre: string | null;
  apellido: string | null;
  telefono: string | null;
  direccion: string | null;
  ocupacion: string | null;
  empresa: string | null;
  username: string | null;
  memberKeyCipher: string | null;
  memberKeyIssuedAt: Date | null;
  operationalGroup: string | null;
  motoSlug: string | null;
  motoMarca: string | null;
  motoModelo: string | null;
  motoImagen: string | null;
  motoUnitPrice: number | null;
  planName: string | null;
  contractType: string | null;
  contractStartDate: string | null;
  paymentDate: string | null;
  references: string | null;
  ubicacionLink: string | null;
  referenciaLink: string | null;
  ubicacionLat: number | null;
  ubicacionLng: number | null;
  referenciaLat: number | null;
  referenciaLng: number | null;
  referencia2Lat: number | null;
  referencia2Lng: number | null;
  monthlyAmount: number | null;
  termMonths: number | null;
  installmentCount: number | null;
  createdAt: Date;
  updatedAt: Date;
  installmentPayments: Array<{
    id: string;
    installmentNumber: number;
    amount: number;
    paymentDate: Date;
    reference: string;
    bank: string;
    method: string;
    note: string | null;
    createdAt: Date;
  }>;
  advancePayments: Array<{
    id: string;
    amount: number;
    paymentDate: Date;
    reference: string;
    bank: string;
    method: string;
    note: string | null;
    createdAt: Date;
  }>;
  assets: Array<{
    id: string;
    assetType: "DOCUMENT" | "CONTRACT";
    documentKey: string;
    variant: "NORMAL" | "SCANNED";
    filePath: string;
    fileName: string;
    createdAt: Date;
  }>;
  },
  options: { includeCredentials?: boolean } = {},
) {
  const clientId = `mp-${profile.id}`;
  // La clave del miembro solo se descifra para consultas administrativas.
  const memberKey = options.includeCredentials
    ? await decryptMemberKey(profile.memberKeyCipher, process.env.AUTH_SECRET ?? "")
    : null;
  const fullName = `${profile.nombre ?? ""} ${profile.apellido ?? ""}`.trim() || `Cliente ${profile.cedula}`;
  const cuotaMensual = Number(profile.monthlyAmount ?? 55);
  const cuotasTotales = resolveInstallmentTotal(profile.planName, profile.termMonths, profile.installmentCount);

  const paidAmountByNumber = buildPaidAmountMap(
    profile.installmentPayments
      .filter((payment) => payment.installmentNumber > 0 && payment.installmentNumber <= cuotasTotales)
      .map((payment) => ({ installmentNumber: payment.installmentNumber, amount: payment.amount })),
  );

  const startDate = parseIsoOrNow(profile.contractStartDate ?? profile.createdAt.toISOString());
  const installments = buildInstallments({
    clientId,
    cuotaMensual,
    total: cuotasTotales,
    startDate,
    intervalDays: resolveIntervalDays(profile.planName, cuotasTotales),
    paidAmountByNumber,
  });

  const cuotasPagadas = installments.filter((item) => item.estado === "Pagada").length;

  const totalAbonado = normalizeMoney(profile.advancePayments.reduce((acc, item) => acc + item.amount, 0));
  const totalPagadoCuotas = normalizeMoney(profile.installmentPayments.reduce((acc, item) => acc + item.amount, 0));

  const cuotasVencidas = installments.filter((item) => item.estado === "Vencida").length;
  const cuotasPendientes = installments.filter((item) => item.estado !== "Pagada").length;
  // El "saldo que debe" = total del plan (contrato) - pagos de cuotas - abonos.
  const deudaPlan = normalizeMoney(
    installments.reduce((acc, item) => acc + item.monto + item.recargo, 0),
  );
  const saldoConAbonos = Math.max(0, normalizeMoney(deudaPlan - totalPagadoCuotas - totalAbonado));

  const nextDue = installments.find((item) => item.estado !== "Pagada")?.vence ?? "—";
  const estado: MonitorClient["estado"] = cuotasVencidas >= 3 ? "Riesgo" : cuotasVencidas > 0 ? "Con atraso" : "Al día";

  // Un expediente guarda hasta DOS archivos por documento: el original subido
  // (NORMAL) y el escaneo generado (SCANNED). Antes se listaban los dos y con el
  // nombre tecnico ("Documento selfie"). Ahora el panel muestra UNA fila por tipo
  // de documento, con nombre legible y prefiriendo la version digitalizada.
  const NOMBRES_DOCUMENTO: Record<string, string> = {
    identidad: "Cédula de identidad",
    rif: "RIF",
    licencia: "Licencia de conducir",
    "certificado-origen": "Certificado de origen",
    selfie: "Selfie de validación",
  };

  const TIPOS_DOCUMENTO: Record<string, string> = {
    identidad: "Identificación",
    selfie: "Identificación",
    rif: "Tributario",
    licencia: "Personal",
    "certificado-origen": "Vehículo",
  };

  const ORDEN_DOCUMENTO = ["identidad", "rif", "licencia", "certificado-origen", "selfie"];

  const documentosPorTipo = new Map<string, (typeof profile.assets)[number]>();

  for (const asset of profile.assets) {
    if (asset.assetType !== "DOCUMENT") continue;

    const clave = asset.documentKey.trim().toLowerCase();
    const actual = documentosPorTipo.get(clave);

    if (!actual) {
      documentosPorTipo.set(clave, asset);
      continue;
    }

    const puntajeActual = actual.variant === "SCANNED" ? 1 : 0;
    const puntajeCandidato = asset.variant === "SCANNED" ? 1 : 0;

    if (
      puntajeCandidato > puntajeActual ||
      (puntajeCandidato === puntajeActual && asset.createdAt.getTime() > actual.createdAt.getTime())
    ) {
      documentosPorTipo.set(clave, asset);
    }
  }

  const documents: MonitorDocument[] = [...documentosPorTipo.entries()]
    .sort(([claveA], [claveB]) => {
      const posicionA = ORDEN_DOCUMENTO.indexOf(claveA);
      const posicionB = ORDEN_DOCUMENTO.indexOf(claveB);

      return (
        (posicionA === -1 ? ORDEN_DOCUMENTO.length : posicionA) -
        (posicionB === -1 ? ORDEN_DOCUMENTO.length : posicionB)
      );
    })
    .map(([clave, asset]) => ({
      id: asset.id,
      nombre: NOMBRES_DOCUMENTO[clave] ?? clave.replace(/-/g, " ").replace(/^\w/, (letra) => letra.toUpperCase()),
      tipo: TIPOS_DOCUMENTO[clave] ?? "Soporte",
      fecha: toDmy(asset.createdAt),
      archivo: buildAssetUrl(asset.filePath),
      variante: asset.variant === "SCANNED" ? "Digitalizado" : "Original",
    }));

  const contracts: MonitorContract[] = profile.assets
    .filter((asset) => asset.assetType === "CONTRACT")
    .map((asset) => ({
      id: asset.id,
      tipo: profile.contractType || "Contrato",
      fecha: toDmy(profile.contractStartDate || profile.updatedAt),
      monto: cuotaMensual * cuotasTotales,
      estado: "Vigente",
      archivo: buildAssetUrl(asset.filePath),
    }));

  const monitorClient: MonitorClient = {
    id: clientId,
    nombre: fullName,
    documento: `V-${profile.cedula}`,
    telefono: profile.telefono || "No registrado",
    agencia: profile.operationalGroup || "Grupo 01",
    gestor: "Gestor asignado por agencia",
    estado,
    cuotasPendientes,
    cuotasVencidas,
    saldo: saldoConAbonos,
    proximoVencimiento: nextDue,
  };

  const monitorProfile: MonitorProfile = {
    clientId,
    cedula: profile.cedula,
    nombre: profile.nombre || "No registrado",
    apellido: profile.apellido || "No registrado",
    username: profile.username || "No registrado",
    credenciales: {
      usuario: profile.username || "No registrado",
      clave: memberKey || "",
      disponible: Boolean(memberKey),
      emitidaEn: profile.memberKeyIssuedAt ? toDmy(profile.memberKeyIssuedAt) : "No registrada",
    },
    fotoPersona: findAssetPath(profile.assets, "DOCUMENT", "selfie", "NORMAL"),
    fotoCedula: findAssetPath(profile.assets, "DOCUMENT", "identidad", "NORMAL"),
    fotoRif: findAssetPath(profile.assets, "DOCUMENT", "rif", "NORMAL"),
    direccion: profile.direccion || "No registrado",
    ocupacion: profile.ocupacion || "No registrado",
    empresa: profile.empresa || "No registrado",
    references: profile.references || "No registradas",
    ubicacionLink: profile.ubicacionLink || "",
    referenciaLink: profile.referenciaLink || "",
    ubicacionLat: profile.ubicacionLat ?? null,
    ubicacionLng: profile.ubicacionLng ?? null,
    referenciaLat: profile.referenciaLat ?? null,
    referenciaLng: profile.referenciaLng ?? null,
    referencia2Lat: profile.referencia2Lat ?? null,
    referencia2Lng: profile.referencia2Lng ?? null,
    fechaIngreso: toDmy(profile.createdAt),
    motoMarca: profile.motoMarca || "Por asignar",
    motoModelo: profile.motoModelo || "Por asignar",
    motoImagen: profile.motoImagen || FALLBACK_IMAGE,
    plan: profile.planName || "Plan empresarial",
    cuotaMensual,
    cuotasTotales,
    cuotasPagadas,
    totalAbonado,
    contratos: contracts,
    documentos: documents,
  };

  const paymentRecords: MonitorPaymentRecord[] = profile.installmentPayments
    .sort((a, b) => b.paymentDate.getTime() - a.paymentDate.getTime())
    .map((item) => ({
      id: item.id,
      installmentNumber: item.installmentNumber,
      amount: normalizeMoney(item.amount),
      paymentDate: toDmy(item.paymentDate),
      reference: item.reference,
      bank: item.bank,
      method: item.method,
      note: item.note || "",
      createdAt: item.createdAt.toISOString(),
    }));

  const advanceRecords: MonitorAdvanceRecord[] = profile.advancePayments
    .sort((a, b) => b.paymentDate.getTime() - a.paymentDate.getTime())
    .map((item) => ({
      id: item.id,
      amount: normalizeMoney(item.amount),
      paymentDate: toDmy(item.paymentDate),
      reference: item.reference,
      bank: item.bank,
      method: item.method,
      note: item.note || "",
      createdAt: item.createdAt.toISOString(),
    }));

  return {
    client: monitorClient,
    profile: monitorProfile,
    installments,
    paymentRecords,
    advanceRecords,
  };
}

async function ensureMonitorAccess() {
  const isProduction = process.env.NODE_ENV === "production";
  const sessionUser = await getSessionUser();

  if (!sessionUser?.userId) {
    return NextResponse.json({ ok: false, message: "Debes iniciar sesión para monitorear cuotas." }, { status: 401 });
  }

  if (sessionUser.isMember && isProduction) {
    return NextResponse.json({ ok: false, message: "Tu perfil no tiene permisos para monitoreo administrativo." }, { status: 403 });
  }

  const adminToken = (await cookies()).get(ADMIN_ACCESS_COOKIE_NAME)?.value;

  if (!adminToken && isProduction) {
    return NextResponse.json({ ok: false, message: "Debes validar licencia administrativa para continuar." }, { status: 403 });
  }

  let adminVerified = false;

  if (adminToken) {
    try {
      const adminAccess = await verifyAdminAccessToken(adminToken);
      const hasAdminAccess =
        adminAccess.scope === "admin_access" &&
        adminAccess.userId.length > 0 &&
        adminAccess.userId === String(sessionUser.userId ?? "");

      if (!hasAdminAccess) {
        return NextResponse.json({ ok: false, message: "Acceso administrativo inválido o expirado." }, { status: 403 });
      }

      adminVerified = true;
    } catch {
      return NextResponse.json({ ok: false, message: "Acceso administrativo inválido o expirado." }, { status: 403 });
    }
  }

  // En desarrollo se conserva el acceso sin licencia (comportamiento previo),
  // de modo que las credenciales se exponen con el mismo nivel de privilegio
  // que ya exige este endpoint.
  return { sessionUser, adminVerified: adminVerified || !isProduction };
}

export async function GET(request: Request) {
  const access = await ensureMonitorAccess();
  if (access instanceof NextResponse) {
    return access;
  }

  const { searchParams } = new URL(request.url);
  const cedula = sanitizeCedula(searchParams.get("cedula") ?? "");

  try {
    if (cedula) {
      const profile = await prisma.memberProfile.findUnique({
        where: { cedula },
        include: {
          assets: true,
          installmentPayments: true,
          advancePayments: true,
        },
      });

      if (!profile) {
        return NextResponse.json({ ok: true, found: false, message: "No existe expediente para esa cédula." });
      }

      const mapped = await mapProfile(profile, { includeCredentials: access.adminVerified });
      return NextResponse.json({
        ok: true,
        found: true,
        client: mapped.client,
        profile: mapped.profile,
        installments: mapped.installments,
        paymentRecords: mapped.paymentRecords,
        advancePayments: mapped.advanceRecords,
      });
    }

    const profiles = await prisma.memberProfile.findMany({
      include: {
        assets: true,
        installmentPayments: true,
        advancePayments: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    const mapped = await Promise.all(profiles.map((profile: any) => mapProfile(profile)));
    const mappedClients = mapped.map((item: any) => item.client);
    const mappedProfiles = Object.fromEntries(mapped.map((item: any) => [item.client.id, item.profile]));
    const mappedInstallments = mapped.flatMap((item: any) => item.installments);

    return NextResponse.json({
      ok: true,
      clients: mappedClients,
      profiles: mappedProfiles,
      installments: mappedInstallments,
    });
  } catch {
    return NextResponse.json({ ok: false, message: "No fue posible cargar el monitoreo administrativo." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await ensureMonitorAccess();
  if (access instanceof NextResponse) {
    return access;
  }

  let movementKind: "installment" | "advance" | "credentials" = "installment";
  let fallbackPayload: {
    cedula: string;
    kind: "installment" | "advance";
    amount: number;
    reference: string;
    bank: string;
    method: string;
    note: string;
    paymentDate: Date;
    installmentNumber: number;
  } | null = null;

  try {
    const body = (await request.json()) as RegisterPaymentPayload;
    const cedula = sanitizeCedula(body.cedula ?? "");
    const kind = body.kind ?? "installment";
    movementKind = kind;

    // Gestión de credenciales del expediente: el administrador puede generar o
    // rotar la clave SAN-MEMBER-XXXXXX del miembro. Queda guardada cifrada en el
    // expediente y, si el miembro ya tiene cuenta, también actualiza su acceso.
    if (kind === "credentials") {
      if (!access.adminVerified) {
        return NextResponse.json(
          { ok: false, message: "Necesitas licencia administrativa para gestionar credenciales." },
          { status: 403 },
        );
      }

      if (!cedula) {
        return NextResponse.json(
          { ok: false, message: "Debes indicar la cédula del miembro." },
          { status: 400 },
        );
      }

      const profile = await prisma.memberProfile.findUnique({
        where: { cedula },
        select: { id: true, userId: true, username: true, nombre: true, apellido: true },
      });

      if (!profile) {
        return NextResponse.json({ ok: false, message: "No existe expediente para esa cédula." }, { status: 404 });
      }

      const requestedKey = String(body.memberKey ?? "").trim().toUpperCase();
      const memberKey = isMemberKey(requestedKey) ? requestedKey : generateMemberKey();
      const memberKeyCipher = await encryptMemberKey(memberKey, process.env.AUTH_SECRET ?? "");

      if (!memberKeyCipher) {
        return NextResponse.json(
          { ok: false, message: "No fue posible cifrar la credencial. Verifica AUTH_SECRET en el servidor." },
          { status: 500 },
        );
      }

      await prisma.memberProfile.update({
        where: { id: profile.id },
        data: { memberKeyCipher, memberKeyIssuedAt: new Date() },
      });

      if (profile.userId) {
        await prisma.user.update({
          where: { id: profile.userId },
          data: { passwordHash: await bcrypt.hash(memberKey, 12) },
        });
      }

      return NextResponse.json({
        ok: true,
        message: requestedKey
          ? "Clave guardada en el expediente. El acceso del miembro no cambió."
          : profile.userId
            ? "Clave nueva generada y guardada en el expediente. El acceso del miembro quedó actualizado."
            : "Clave guardada en el expediente. El miembro todavía no tiene cuenta de usuario vinculada.",
        credentials: {
          username: profile.username ?? "",
          memberKey,
        },
      });
    }
    const amount = Number(body.amount ?? 0);
    const reference = String(body.reference ?? "").trim();
    const bank = String(body.bank ?? "").trim();
    const method = String(body.method ?? "").trim();
    const note = String(body.note ?? "").trim();
    const paymentDate = parseIsoOrNow(body.paymentDate ?? undefined);
    const installmentNumber = Number(body.installmentNumber ?? 0);

    fallbackPayload = {
      cedula,
      kind,
      amount,
      reference,
      bank,
      method,
      note,
      paymentDate,
      installmentNumber,
    };

    if (!cedula) {
      return NextResponse.json({ ok: false, message: "Debes indicar la cédula." }, { status: 400 });
    }

    if (amount <= 0 || !reference || !bank || !method) {
      return NextResponse.json({ ok: false, message: "Completa monto, referencia, banco y método." }, { status: 400 });
    }

    const profile = await prisma.memberProfile.findUnique({
      where: { cedula },
      include: {
        installmentPayments: true,
        advancePayments: true,
      },
    });
    if (!profile) {
      return NextResponse.json({ ok: false, message: "No existe expediente para esa cédula." }, { status: 404 });
    }

    if (kind === "advance") {
      const installmentNumberForAdvance = getInstallmentNumberFromAdvanceMeta(note, reference);
      if (installmentNumberForAdvance <= 0) {
        return NextResponse.json({ ok: false, message: "El abono debe indicar una cuota objetivo válida." }, { status: 400 });
      }

      const paidAmountByNumber = buildPaidAmountMap(profile.installmentPayments);
      const cuotaMensual = Number(profile.monthlyAmount ?? 75);
      const cuotasTotales = resolveInstallmentTotal(profile.planName, profile.termMonths, profile.installmentCount);
      const startDate = parseIsoOrNow(profile.contractStartDate ?? profile.createdAt.toISOString());
      const installments = buildInstallments({
        clientId: `mp-${profile.id}`,
        cuotaMensual,
        total: cuotasTotales,
        startDate,
        intervalDays: resolveIntervalDays(profile.planName, cuotasTotales),
        paidAmountByNumber,
      });
      const targetInstallment = installments.find((item: any) => item.numero === installmentNumberForAdvance);
      if (!targetInstallment) {
        return NextResponse.json({ ok: false, message: "No existe esa cuota objetivo para el abono." }, { status: 400 });
      }

      const totalAbonadoCuota = normalizeMoney(
        profile.advancePayments
          .filter((item: any) => getInstallmentNumberFromAdvanceMeta(item.note || "", item.reference || "") === installmentNumberForAdvance)
          .reduce((acc: any, item: any) => acc + item.amount, 0)
      );
      const installmentTotal = normalizeMoney(targetInstallment.monto + targetInstallment.recargo);
      const maxAdvance = calculateAdvanceMaxAmount({ installmentTotal, alreadyAdvanced: totalAbonadoCuota });

      if (maxAdvance <= 0 || amount > maxAdvance + 0.0001) {
        return NextResponse.json(
          {
            ok: false,
            message: `Abono inválido para cuota #${installmentNumberForAdvance}. Máximo permitido: ${maxAdvance.toFixed(2)} USD. Si deseas completar la cuota, usa Registrar pago de cuota.`,
          },
          { status: 400 }
        );
      }

      await prisma.advancePayment.create({
        data: {
          profileId: profile.id,
          amount: normalizeMoney(amount),
          paymentDate,
          reference,
          bank,
          method,
          note: note || null,
          createdByUserId: String(access.sessionUser.userId ?? ""),
        },
      });
    } else {
      if (installmentNumber <= 0) {
        return NextResponse.json({ ok: false, message: "Indica el número de cuota a registrar." }, { status: 400 });
      }

      const existingInstallmentPayment = profile.installmentPayments.find((item: any) => item.installmentNumber === installmentNumber);
      if (existingInstallmentPayment) {
        return NextResponse.json({ ok: false, message: `La cuota #${installmentNumber} ya tiene pago completo registrado.` }, { status: 400 });
      }

      const paidAmountByNumber = buildPaidAmountMap(profile.installmentPayments);
      const cuotaMensual = Number(profile.monthlyAmount ?? 75);
      const cuotasTotales = resolveInstallmentTotal(profile.planName, profile.termMonths, profile.installmentCount);
      const startDate = parseIsoOrNow(profile.contractStartDate ?? profile.createdAt.toISOString());
      const installments = buildInstallments({
        clientId: `mp-${profile.id}`,
        cuotaMensual,
        total: cuotasTotales,
        startDate,
        intervalDays: resolveIntervalDays(profile.planName, cuotasTotales),
        paidAmountByNumber,
      });
      const targetInstallment = installments.find((item: any) => item.numero === installmentNumber);
      if (!targetInstallment) {
        return NextResponse.json({ ok: false, message: "No existe esa cuota en el plan." }, { status: 400 });
      }

      const totalAbonadoCuota = normalizeMoney(
        profile.advancePayments
          .filter((item: any) => getInstallmentNumberFromAdvanceMeta(item.note || "", item.reference || "") === installmentNumber)
          .reduce((acc: any, item: any) => acc + item.amount, 0)
      );
      const montoCuota = normalizeMoney(targetInstallment.monto + targetInstallment.recargo);
      const restanteCuota = Math.max(0, normalizeMoney(montoCuota - totalAbonadoCuota));

      if (amount > restanteCuota + 0.0001) {
        return NextResponse.json(
          { ok: false, message: `Sobrepago detectado en cuota #${installmentNumber}. Restante permitido: ${restanteCuota.toFixed(2)} USD.` },
          { status: 400 }
        );
      }

      await prisma.installmentPayment.create({
        data: {
          profileId: profile.id,
          installmentNumber,
          amount: normalizeMoney(amount),
          paymentDate,
          reference,
          bank,
          method,
          note: note || null,
          createdByUserId: String(access.sessionUser.userId ?? ""),
        },
      });
    }

    return NextResponse.json({ ok: true, message: kind === "advance" ? "Abono registrado correctamente." : "Pago de cuota registrado correctamente." });
  } catch {
    return NextResponse.json({ ok: false, message: "No fue posible registrar el movimiento." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const access = await ensureMonitorAccess();
  if (access instanceof NextResponse) {
    return access;
  }

  const { searchParams } = new URL(request.url);
  const cedula = sanitizeCedula(searchParams.get("cedula") ?? "");
  const installmentNumber = Number(searchParams.get("installmentNumber") ?? 0);

  if (!cedula) {
    return NextResponse.json({ ok: false, message: "Debes indicar la cédula del participante a eliminar." }, { status: 400 });
  }

  try {
    if (installmentNumber > 0) {
      const profile = await prisma.memberProfile.findUnique({
        where: { cedula },
        select: {
          id: true,
          installmentPayments: {
            select: { id: true, installmentNumber: true },
          },
        },
      });

      if (!profile) {
        return NextResponse.json({ ok: false, message: "No existe expediente para esa cédula." }, { status: 404 });
      }

      const paymentRecord = profile.installmentPayments.find((item: any) => item.installmentNumber === installmentNumber);
      if (!paymentRecord) {
        return NextResponse.json({ ok: false, message: `La cuota #${installmentNumber} no tiene un pago registrado para revertir.` }, { status: 404 });
      }

      await prisma.installmentPayment.delete({ where: { id: paymentRecord.id } });

      return NextResponse.json({
        ok: true,
        message: `Pago de la cuota #${installmentNumber} revertido correctamente.`,
      });
    }

    const profile = await prisma.memberProfile.findUnique({
      where: { cedula },
      select: { id: true, nombre: true, apellido: true },
    });

    if (!profile) {
      return NextResponse.json({ ok: false, message: "No existe un participante con esa cédula." }, { status: 404 });
    }

    await prisma.memberProfile.delete({ where: { id: profile.id } });

    return NextResponse.json({
      ok: true,
      message: `Participante eliminado correctamente: ${profile.nombre ?? ""} ${profile.apellido ?? ""}`.trim(),
    });
  } catch {
    return NextResponse.json({ ok: false, message: "No fue posible eliminar el participante." }, { status: 500 });
  }
}
