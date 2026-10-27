"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
const API_BASE =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? ""
    : process.env.NEXT_PUBLIC_API_BASE || "";
import { MOTOS } from "@/data/motos";
import { buildAssetUrl } from "@/lib/asset-paths.mjs";
import { scanModeForDocument } from "@/lib/document-scan.mjs";
import { buildScannedPdf, detectFaceCropFromImage, fetchAssetBlob, scanImageBlob } from "@/lib/document-scanner";
import { FINANCING_PLAN_NAME, computeFinancing, isFinancingPlan } from "@/lib/moto-financing.mjs";
import LocationField from "@/app/components/LocationField";
import SavedLocationPreview from "@/app/components/SavedLocationPreview";
import AvisoTratamientoDatos from "@/app/components/AvisoTratamientoDatos";

type MemberOnboardingForm = {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  cedula: string;
  direccion: string;
  ocupacion: string;
  empresa: string;
  operationalGroup: string;
  references: string;
  ubicacionLat: string;
  ubicacionLng: string;
  referenciaLat: string;
  referenciaLng: string;
  referencia2Lat: string;
  referencia2Lng: string;
  motoSlug: string;
  motoUnitPrice: string;
  omitCertificateOrigin: boolean;
  omitLicencia: boolean;
  contractType: string;
  planName: string;
  termMonths: string;
  installmentCount: string;
  monthlyAmount: string;
  contractStartDate: string;
  paymentMethod: string;
  paymentBank: string;
  paymentReference: string;
  paymentAmount: string;
  paymentDate: string;
  payLater: boolean;
  username: string;
  encryptedKey: string;
};

type AssetType = "DOCUMENT" | "CONTRACT";
type AssetVariant = "NORMAL" | "SCANNED";
type ScanMode = "normal" | "clean";
type AssetRecord = {
  fileName: string;
  filePath: string;
  mimeType?: string;
  pdfPath?: string;
  ocrPreview?: string;
  ocrConfidence?: number | null;
  ocrTextPath?: string;
};

const EMPRESA_OPTIONS = [
  "San Merida Sede Principal",
  "San Merida Sede Barinas",
] as const;

const stepLabels = [
  "Datos personales",
  "Documentos",
  "Contratos",
  "Pago",
  "Credenciales",
] as const;

const initialForm: MemberOnboardingForm = {
  nombre: "",
  apellido: "",
  email: "",
  telefono: "",
  cedula: "",
  direccion: "",
  ocupacion: "",
  empresa: "San Merida Sede Principal",
  operationalGroup: "Grupo 01",
  references: "",
  ubicacionLat: "",
  ubicacionLng: "",
  referenciaLat: "",
  referenciaLng: "",
  referencia2Lat: "",
  referencia2Lng: "",
  motoSlug: "",
  motoUnitPrice: "",
  omitCertificateOrigin: false,
  omitLicencia: false,
  contractType: "Compraventa financiada",
  planName: "Plan de 26 cuotas",
  termMonths: "12",
  installmentCount: "",
  monthlyAmount: "75",
  contractStartDate: "",
  paymentMethod: "Transferencia",
  paymentBank: "Banco de Venezuela",
  paymentReference: "",
  paymentAmount: "120",
  paymentDate: "",
  payLater: false,
  username: "",
  encryptedKey: "",
};

const documentDefinitions = [
  { key: "identidad", label: "Documento de identidad" },
  { key: "rif", label: "RIF" },
  { key: "licencia", label: "Licencia de conducir" },
  { key: "certificado-origen", label: "Certificado de origen" },
  { key: "selfie", label: "Selfie de validacion" },
] as const;

/**
 * Documentos que el cliente puede no tener el día del registro:
 * se pueden omitir por ahora y cargar después.
 */
type OmitFlag = "omitCertificateOrigin" | "omitLicencia";

const OMITABLE_DOCUMENTS: Record<string, OmitFlag> = {
  "certificado-origen": "omitCertificateOrigin",
  licencia: "omitLicencia",
};

const contractDefinitions = [
  { key: "principal", label: "Contrato principal" },
] as const;

// Configuracion de financiamiento por modelo de moto (viene del panel admin).
type FinancingModel = {
  slug: string;
  nombre: string;
  precioBase: number;
  porcentajeInicial: number;
  cuotasQuincenales: number;
  montoCuota: number;
  activo: boolean;
  cuotaSugerida: number;
  cuota: number;
  inicial: number;
  saldo: number;
  meses: number;
};

const FINANCING_PLANS = [
  {
    id: "plan-26",
    kind: "fixed",
    label: "26 Cuotas Cada 15 dias",
    planName: "Plan de 26 cuotas (cada 15 días)",
    termMonths: "12",
    monthlyAmount: "75",
  },
  {
    id: "plan-83",
    kind: "fixed",
    label: "83 Cuotas Cada 7 dias",
    planName: "Plan de 83 cuotas",
    termMonths: "12",
    monthlyAmount: "17",
  },
  {
    // 50% inicial + cuotas quincenales: la duracion y el monto salen de la
    // configuracion guardada por modelo de moto (panel admin).
    id: "plan-financiamiento",
    kind: "financing",
    label: "Financiamiento 50% (quincenal)",
    planName: FINANCING_PLAN_NAME,
    termMonths: "12",
    monthlyAmount: "",
  },
] as const;

const REGISTER_MEMBER_DRAFT_KEY = "san-register-member-draft-v1";
const OPERATIONAL_GROUPS = Array.from({ length: 100 }, (_, index) => {
  const number = index + 1;
  return `Grupo ${String(number).padStart(2, "0")}`;
});

function slugifyUsernamePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildUsername(nombre: string, apellido: string) {
  if (!nombre.trim() || !apellido.trim()) return "@";
  const base = `${slugifyUsernamePart(nombre)}-${slugifyUsernamePart(apellido)}`.replace(/-+/g, "-");
  return `@${base}`;
}

function generateMemberKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (item) => chars[item % chars.length]).join("");
  return `SAN-MEMBER-${suffix}`;
}

function isImageAsset(asset?: AssetRecord) {
  if (!asset) return false;
  if (asset.mimeType?.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(asset.fileName || asset.filePath);
}

/** True cuando el archivo seleccionado ya es un PDF (no se puede escanear con canvas). */
function isPdfFile(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/**
 * URL del PDF digital derivado de un escaneo. `filePath` guarda la clave del
 * archivo en el almacenamiento, por lo que se traduce con `buildAssetUrl`.
 */
function getPdfPath(asset?: AssetRecord) {
  if (!asset) return null;
  if (asset.pdfPath) return buildAssetUrl(asset.pdfPath);
  if (/\.pdf$/i.test(asset.filePath)) return buildAssetUrl(asset.filePath);
  const extMatch = asset.filePath.match(/\.[^./]+$/);
  if (!extMatch) return buildAssetUrl(`${asset.filePath}.pdf`);
  return buildAssetUrl(`${asset.filePath.slice(0, -extMatch[0].length)}.pdf`);
}

export default function RegisterMemberPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<MemberOnboardingForm>(initialForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [registrationCompleted, setRegistrationCompleted] = useState(false);
  const [loading, setLoading] = useState(false);
  // Consentimiento del aviso de tratamiento de datos (docs/SEGURIDAD_INTEGRAL.md
  // 10.2, punto 6). Se pide en el ultimo paso, antes de crear la cuenta: el
  // expediente guarda cedula, direccion, ubicacion y documentos del titular.
  const [consentimiento, setConsentimiento] = useState(false);
  const [assets, setAssets] = useState<Record<string, AssetRecord>>({});
  // Configuracion de financiamiento por modelo (precio, inicial, cuotas, monto).
  const [financingBySlug, setFinancingBySlug] = useState<Record<string, FinancingModel>>({});
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [scanningKey, setScanningKey] = useState<string | null>(null);
  const [pickLabels, setPickLabels] = useState<Record<string, string>>({});
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [hoveredBox, setHoveredBox] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const expectedUsername = useMemo(() => buildUsername(form.nombre, form.apellido), [form.nombre, form.apellido]);
  const selectedMoto = useMemo(() => MOTOS.find((moto) => moto.slug === form.motoSlug) ?? null, [form.motoSlug]);

  // Resumen en vivo del financiamiento (usa lo que hay escrito en el formulario).
  const selectedFinancing = useMemo(() => {
    if (!isFinancingPlan(form.planName)) {
      return null;
    }

    const config = financingBySlug[form.motoSlug];

    if (!config) {
      return null;
    }

    return computeFinancing({
      precioBase: Number(form.motoUnitPrice || config.precioBase),
      porcentajeInicial: config.porcentajeInicial,
      cuotasQuincenales: Number(form.installmentCount || config.cuotasQuincenales),
      montoCuota: Number(form.monthlyAmount || config.montoCuota),
    });
  }, [
    financingBySlug,
    form.installmentCount,
    form.monthlyAmount,
    form.motoSlug,
    form.motoUnitPrice,
    form.planName,
  ]);
  const clienteUbicacion = useMemo(
    () =>
      form.ubicacionLat && form.ubicacionLng
        ? { lat: Number(form.ubicacionLat), lng: Number(form.ubicacionLng) }
        : null,
    [form.ubicacionLat, form.ubicacionLng]
  );
  const referenciaUbicacion = useMemo(
    () =>
      form.referenciaLat && form.referenciaLng
        ? { lat: Number(form.referenciaLat), lng: Number(form.referenciaLng) }
        : null,
    [form.referenciaLat, form.referenciaLng]
  );
  const referencia2Ubicacion = useMemo(
    () =>
      form.referencia2Lat && form.referencia2Lng
        ? { lat: Number(form.referencia2Lat), lng: Number(form.referencia2Lng) }
        : null,
    [form.referencia2Lat, form.referencia2Lng]
  );

  useEffect(() => {
    if (!draftReady) return;

    const groupFromQuery = new URLSearchParams(window.location.search).get("group")?.trim();
    if (!groupFromQuery) return;
    if (!OPERATIONAL_GROUPS.includes(groupFromQuery)) return;

    setForm((current) => ({
      ...current,
      operationalGroup: groupFromQuery,
    }));
  }, [draftReady]);

  // Carga la configuracion de financiamiento por modelo (la edita el admin).
  useEffect(() => {
    let cancelled = false;

    const loadFinancing = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/financing-motos`);
        const data = (await response.json()) as { ok: boolean; models?: FinancingModel[] };

        if (cancelled || !response.ok || !data.ok || !data.models) {
          return;
        }

        setFinancingBySlug(Object.fromEntries(data.models.map((model) => [model.slug, model])));
      } catch {
        // Si falla, el plan de financiamiento avisa en pantalla que falta configurar.
      }
    };

    void loadFinancing();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(REGISTER_MEMBER_DRAFT_KEY);

      if (raw) {
        const parsed = JSON.parse(raw) as {
          form?: Partial<MemberOnboardingForm>;
          assets?: Record<string, AssetRecord>;
          step?: number;
        };

        if (parsed.form) {
          setForm((current) => ({ ...current, ...parsed.form }));
        }

        if (parsed.assets && typeof parsed.assets === "object") {
          setAssets(parsed.assets);
        }

        if (typeof parsed.step === "number" && parsed.step >= 1 && parsed.step <= 5) {
          setStep(parsed.step);
        }
      }
    } catch {
      // Ignore invalid draft payloads and start fresh.
    } finally {
      setDraftReady(true);
    }
  }, []);

  useEffect(() => {
    if (!draftReady) return;

    try {
      window.localStorage.setItem(
        REGISTER_MEMBER_DRAFT_KEY,
        JSON.stringify({
          form,
          assets,
          step,
          updatedAt: Date.now(),
        }),
      );
    } catch {
      // Ignore storage quota issues without blocking registration flow.
    }
  }, [draftReady, form, assets, step]);

  // Aplica el plan de financiamiento (50% inicial + cuotas quincenales) con la
  // configuracion guardada para el modelo de moto seleccionado.
  const applyFinancingPlan = (motoSlug: string, current: MemberOnboardingForm): MemberOnboardingForm => {
    const config = financingBySlug[motoSlug];

    if (!config) {
      return { ...current, planName: FINANCING_PLAN_NAME, installmentCount: "" };
    }

    const detail = computeFinancing({
      precioBase: config.precioBase,
      porcentajeInicial: config.porcentajeInicial,
      cuotasQuincenales: config.cuotasQuincenales,
      montoCuota: config.montoCuota,
    });

    return {
      ...current,
      planName: FINANCING_PLAN_NAME,
      installmentCount: String(detail.cuotasQuincenales),
      termMonths: String(Math.max(1, Math.round(detail.meses))),
      monthlyAmount: detail.cuota > 0 ? String(detail.cuota) : current.monthlyAmount,
      motoUnitPrice: current.motoUnitPrice.trim() ? current.motoUnitPrice : String(detail.precioBase),
    };
  };

  const updateField = (field: keyof MemberOnboardingForm, value: string) => {
    setError("");
    setSuccess("");
    setForm((current) => ({ ...current, [field]: value }));
  };

  /** Marca o desmarca la omisión temporal de un documento (licencia, certificado de origen). */
  const setDocumentOmission = (field: OmitFlag, value: boolean) => {
    setError("");
    setSuccess("");
    setForm((current) => ({
      ...current,
      omitCertificateOrigin: field === "omitCertificateOrigin" ? value : current.omitCertificateOrigin,
      omitLicencia: field === "omitLicencia" ? value : current.omitLicencia,
    }));
  };

  /** ¿Ese documento está omitido temporalmente? */
  const isDocumentOmitted = (documentKey: string) => {
    const field = OMITABLE_DOCUMENTS[documentKey];
    if (!field) return false;
    return field === "omitCertificateOrigin" ? form.omitCertificateOrigin : form.omitLicencia;
  };

  const getAssetKey = (assetType: AssetType, documentKey: string, variant: AssetVariant) =>
    `${assetType}:${documentKey}:${variant}`;

  const sanitizeCedula = (value: string) => value.replace(/\D/g, "");

  const hasAsset = (assetType: AssetType, documentKey: string, variant: AssetVariant) =>
    Boolean(assets[getAssetKey(assetType, documentKey, variant)]);

  const setFileInputRef = (key: string) => (element: HTMLInputElement | null) => {
    fileInputRefs.current[key] = element;
  };

  const openFileDialog = (key: string) => {
    fileInputRefs.current[key]?.click();
  };

  const handleDropUpload = (
    event: React.DragEvent<HTMLDivElement>,
    hoverKey: string,
    assetType: AssetType,
    documentKey: string,
    variant: AssetVariant
  ) => {
    event.preventDefault();
    setHoveredBox((current) => (current === hoverKey ? null : current));
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void uploadAsset(file, assetType, documentKey, variant);
    }
  };

  const loadExistingProfile = async () => {
    const cedula = sanitizeCedula(form.cedula);

    if (!cedula) {
      setError("Ingresa la cédula para consultar el expediente.");
      return;
    }

    setLoadingProfile(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`${API_BASE}/api/member-files/profile?cedula=${cedula}`);
      const data = (await response.json()) as {
        ok: boolean;
        found?: boolean;
        message?: string;
        profile?: {
          nombre?: string;
          apellido?: string;
          email?: string;
          telefono?: string;
          direccion?: string;
          ocupacion?: string;
          empresa?: string;
          operationalGroup?: string;
          references?: string;
          ubicacionLat?: number | null;
          ubicacionLng?: number | null;
          referenciaLat?: number | null;
          referenciaLng?: number | null;
          referencia2Lat?: number | null;
          referencia2Lng?: number | null;
          motoSlug?: string;
          motoUnitPrice?: number;
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
          username?: string;
          assets?: Array<{ assetType: AssetType; documentKey: string; variant: AssetVariant; fileName: string; filePath: string; mimeType: string }>;
        };
      };

      if (!response.ok || !data.ok) {
        setError(data.message || "No se pudo consultar el expediente.");
        return;
      }

      if (!data.found || !data.profile) {
        setSuccess("No existe expediente previo para esta cédula. Continúa con un registro nuevo.");
        return;
      }

      setForm((current) => ({
        ...current,
        cedula,
        nombre: data.profile?.nombre ?? current.nombre,
        apellido: data.profile?.apellido ?? current.apellido,
        email: data.profile?.email ?? current.email,
        telefono: data.profile?.telefono ?? current.telefono,
        direccion: data.profile?.direccion ?? current.direccion,
        ocupacion: data.profile?.ocupacion ?? current.ocupacion,
        empresa: data.profile?.empresa?.trim() ? data.profile.empresa : current.empresa,
        operationalGroup: data.profile?.operationalGroup ?? current.operationalGroup,
        references: data.profile?.references ?? current.references,
        ubicacionLat: data.profile?.ubicacionLat != null ? String(data.profile.ubicacionLat) : current.ubicacionLat,
        ubicacionLng: data.profile?.ubicacionLng != null ? String(data.profile.ubicacionLng) : current.ubicacionLng,
        referenciaLat: data.profile?.referenciaLat != null ? String(data.profile.referenciaLat) : current.referenciaLat,
        referenciaLng: data.profile?.referenciaLng != null ? String(data.profile.referenciaLng) : current.referenciaLng,
        referencia2Lat: data.profile?.referencia2Lat != null ? String(data.profile.referencia2Lat) : current.referencia2Lat,
        referencia2Lng: data.profile?.referencia2Lng != null ? String(data.profile.referencia2Lng) : current.referencia2Lng,
        motoSlug: data.profile?.motoSlug ?? current.motoSlug,
        motoUnitPrice: data.profile?.motoUnitPrice ? String(data.profile.motoUnitPrice) : current.motoUnitPrice,
        contractType: data.profile?.contractType ?? current.contractType,
        planName: data.profile?.planName ?? current.planName,
        termMonths: data.profile?.termMonths ? String(data.profile.termMonths) : current.termMonths,
        installmentCount: data.profile?.installmentCount ? String(data.profile.installmentCount) : current.installmentCount,
        monthlyAmount: data.profile?.monthlyAmount ? String(data.profile.monthlyAmount) : current.monthlyAmount,
        contractStartDate: data.profile?.contractStartDate ?? current.contractStartDate,
        paymentMethod: data.profile?.paymentMethod ?? current.paymentMethod,
        paymentBank: data.profile?.paymentBank ?? current.paymentBank,
        paymentReference: data.profile?.paymentReference ?? current.paymentReference,
        paymentAmount: data.profile?.paymentAmount ? String(data.profile.paymentAmount) : current.paymentAmount,
        paymentDate: data.profile?.paymentDate ?? current.paymentDate,
        username: data.profile?.username ?? current.username,
      }));

      const nextAssets: Record<string, AssetRecord> = {};
      for (const asset of data.profile.assets ?? []) {
        nextAssets[getAssetKey(asset.assetType, asset.documentKey, asset.variant)] = {
          fileName: asset.fileName,
          filePath: asset.filePath,
          mimeType: asset.mimeType,
        };
      }
      setAssets(nextAssets);
      setSuccess("Expediente encontrado y cargado. Puedes continuar el flujo donde lo dejaste.");
    } catch {
      setError("No se pudo conectar para consultar expediente.");
    } finally {
      setLoadingProfile(false);
    }
  };

  const uploadAsset = async (file: File, assetType: AssetType, documentKey: string, variant: AssetVariant) => {
    if (!form.cedula.trim()) {
      setError("Primero completa la cedula en Datos personales para poder afiliar documentos.");
      return;
    }

    setError("");
    const key = getAssetKey(assetType, documentKey, variant);
    setUploadingKey(key);

    try {
      const body = new FormData();
      body.append("cedula", form.cedula);
      body.append("assetType", assetType);
      body.append("documentKey", documentKey);
      body.append("variant", variant);
      body.append("file", file);

      const response = await fetch(`${API_BASE}/api/member-files/upload`, {
        method: "POST",
        body,
      });

      const data = (await response.json()) as {
        ok: boolean;
        message: string;
        asset?: { fileName: string; filePath: string; mimeType?: string };
        autoSelfie?: { fileName: string; filePath: string; mimeType?: string };
        pdfPath?: string | null;
        ocr?: {
          preview?: string | null;
          confidence?: number | null;
          textPath?: string | null;
        };
      };

      if (!response.ok || !data.ok || !data.asset) {
        if (response.status === 401) {
          setError("Tu sesión expiró. Vuelve a iniciar sesión y sube el documento de nuevo.");
          window.setTimeout(() => {
            window.location.href = "/login";
          }, 2500);
          return;
        }

        setError(data.message || "No se pudo subir el archivo.");
        return;
      }

      const uploadedAsset = data.asset;

      const nextAssets: Record<string, AssetRecord> = {
        [key]: {
          fileName: uploadedAsset.fileName,
          filePath: uploadedAsset.filePath,
          mimeType: uploadedAsset.mimeType,
          pdfPath: data.pdfPath || undefined,
          ocrPreview: data.ocr?.preview || undefined,
          ocrConfidence: data.ocr?.confidence ?? null,
          ocrTextPath: data.ocr?.textPath || undefined,
        },
      };

      if (data.autoSelfie) {
        nextAssets[getAssetKey("DOCUMENT", "selfie", "NORMAL")] = {
          fileName: data.autoSelfie.fileName,
          filePath: data.autoSelfie.filePath,
          mimeType: data.autoSelfie.mimeType,
        };
      }

      setAssets((current) => ({
        ...current,
        ...nextAssets,
      }));

      const omittableField = assetType === "DOCUMENT" ? OMITABLE_DOCUMENTS[documentKey] : undefined;
      if (omittableField) {
        setDocumentOmission(omittableField, false);
      }

      // Escaneo automatico: al subir el documento "normal" se genera solo la
      // version escaneada (y su PDF digital), sin que nadie pulse botones.
      if (variant === "NORMAL") {
        if (isPdfFile(file)) {
          // Un PDF ya es un documento digital: se registra tambien como escaneado.
          await uploadAsset(file, assetType, documentKey, "SCANNED");
        } else {
          await scanAndUpload(assetType, documentKey, file, { silent: true });

          // La selfie que extrae el servidor de la cedula tambien se escanea sola.
          if (data.autoSelfie) {
            try {
              const selfieSource = await fetchAssetBlob(buildAssetUrl(data.autoSelfie.filePath));
              await scanAndUpload("DOCUMENT", "selfie", selfieSource, { silent: true });
            } catch {
              // Si no se puede leer, la selfie se puede subir escaneada a mano.
            }
          } else if (assetType === "DOCUMENT" && documentKey === "identidad") {
            // En produccion el servidor no puede extraer la selfie (no tiene
            // `sharp`): se detecta la cara en el navegador y se sube sola.
            const detected = await detectFaceCropFromImage(file);
            if (detected) {
              await uploadDetectedSelfie(detected.blob, detected.confidence);
            }
          }
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setError(`No se pudo subir el documento: ${detail}`);
    } finally {
      setUploadingKey(null);
    }
  };

  /**
   * Escanea en el navegador y sube la version SCANNED junto con su PDF digital.
   * El algoritmo es el de `@/lib/document-scan.mjs` (mismo que se verifica con
   * los documentos reales desde Node).
   */
  const scanAndUpload = async (
    assetType: AssetType,
    documentKey: string,
    source: Blob,
    options: { intensity?: ScanMode; silent?: boolean } = {},
  ) => {
    if (!form.cedula.trim()) {
      setError("Completa la cedula antes de escanear documentos.");
      return;
    }

    const mode = scanModeForDocument(documentKey) as "documento" | "foto";
    const intensity: ScanMode = options.intensity ?? (mode === "foto" ? "normal" : "clean");
    const key = getAssetKey(assetType, documentKey, "SCANNED");

    setError("");
    setScanningKey(key);

    try {
      const scanned = await scanImageBlob(source, { mode, intensity });
      const pdf = await buildScannedPdf(await scanned.blob.arrayBuffer(), scanned.width, scanned.height);

      const body = new FormData();
      body.append("cedula", form.cedula);
      body.append("assetType", assetType);
      body.append("documentKey", documentKey);
      body.append("variant", "SCANNED");
      body.append("file", scanned.blob, `scan-${documentKey}.jpg`);
      body.append("pdf", pdf, `scan-${documentKey}.pdf`);

      const response = await fetch(`${API_BASE}/api/member-files/upload`, {
        method: "POST",
        body,
      });

      const data = (await response.json()) as {
        ok: boolean;
        message?: string;
        asset?: { fileName: string; filePath: string; mimeType?: string };
        pdfPath?: string | null;
      };

      if (!response.ok || !data.ok || !data.asset) {
        setError(data.message || "No se pudo guardar el escaneo del documento.");
        return;
      }

      const uploaded = data.asset;

      setAssets((current) => ({
        ...current,
        [key]: {
          fileName: uploaded.fileName,
          filePath: uploaded.filePath,
          mimeType: uploaded.mimeType,
          pdfPath: data.pdfPath || undefined,
        },
      }));

      if (!options.silent) {
        setSuccess(
          `Escaneo generado (${mode === "foto" ? "foto" : "documento"} · ${intensity === "clean" ? "limpio" : "normal"}).`,
        );
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setError(`No se pudo escanear el documento (${detail}). Puedes subir el escaneado manual.`);
    } finally {
      setScanningKey(null);
    }
  };

  /**
   * Vuelve a escanear un documento a partir de su version "normal" ya cargada
   * (botones "Escaneo normal" / "Escaneo limpio").
   */
  const generateScannedFromNormal = async (assetType: AssetType, documentKey: string, scanMode: ScanMode = "clean") => {
    if (!form.cedula.trim()) {
      setError("Completa la cedula antes de digitalizar documentos.");
      return;
    }

    const normalAsset = assets[getAssetKey(assetType, documentKey, "NORMAL")];

    if (!normalAsset) {
      setError("Primero debes subir el documento normal para poder escanearlo.");
      return;
    }

    setError("");
    setSuccess("");

    try {
      const source = await fetchAssetBlob(buildAssetUrl(normalAsset.filePath));
      await scanAndUpload(assetType, documentKey, source, { intensity: scanMode });
    } catch {
      setError("No se pudo leer el documento original para escanearlo.");
    }
  };

  /**
   * Sube la selfie detectada automaticamente desde la cedula y la escanea.
   */
  const uploadDetectedSelfie = async (blob: Blob, confidence: number) => {
    if (!form.cedula.trim()) return;

    try {
      const body = new FormData();
      body.append("cedula", form.cedula);
      body.append("assetType", "DOCUMENT");
      body.append("documentKey", "selfie");
      body.append("variant", "NORMAL");
      body.append("file", blob, "selfie-detectada-cedula.jpg");

      const response = await fetch(`${API_BASE}/api/member-files/upload`, {
        method: "POST",
        body,
      });

      const data = (await response.json()) as {
        ok: boolean;
        asset?: { fileName: string; filePath: string; mimeType?: string };
      };

      if (!response.ok || !data.ok || !data.asset) return;

      setAssets((current) => ({
        ...current,
        [getAssetKey("DOCUMENT", "selfie", "NORMAL")]: {
          fileName: data.asset!.fileName,
          filePath: data.asset!.filePath,
          mimeType: data.asset!.mimeType,
        },
      }));

      // La selfie tambien se escanea (modo foto, a color).
      await scanAndUpload("DOCUMENT", "selfie", blob, { silent: true });

      setSuccess(`Selfie de validación detectada automáticamente desde la cédula (${Math.round(confidence * 100)}% de confianza).`);
    } catch {
      // Si falla, el usuario puede subir la selfie manualmente.
    }
  };

  const deleteAsset = async (assetType: AssetType, documentKey: string, variant: AssetVariant) => {
    const cedula = sanitizeCedula(form.cedula);
    const key = getAssetKey(assetType, documentKey, variant);

    if (!cedula) {
      setAssets((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      return;
    }

    setDeletingKey(key);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`${API_BASE}/api/member-files/upload`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cedula,
          assetType,
          documentKey,
          variant,
        }),
      });

      const data = (await response.json()) as { ok: boolean; message?: string };

      if (!response.ok || !data.ok) {
        setError(data.message || "No se pudo eliminar el archivo.");
        return;
      }

      setAssets((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });

      setSuccess(data.message || "Archivo eliminado correctamente.");
    } catch {
      setError("No se pudo conectar para eliminar el archivo.");
    } finally {
      setDeletingKey(null);
    }
  };

  const validateStep = (currentStep: number) => {
    if (currentStep === 1) {
      return (
        form.nombre.trim() &&
        form.apellido.trim() &&
        form.email.trim() &&
        form.telefono.trim() &&
        form.cedula.trim() &&
        form.direccion.trim() &&
        form.ocupacion.trim() &&
        form.empresa.trim() &&
        form.operationalGroup.trim()
        && form.motoSlug.trim()
      );
    }

    if (currentStep === 2) {
      return documentDefinitions.every((doc) => {
        if (isDocumentOmitted(doc.key)) return true;
        return hasAsset("DOCUMENT", doc.key, "NORMAL") && hasAsset("DOCUMENT", doc.key, "SCANNED");
      });
    }

    if (currentStep === 3) {
      return (
        contractDefinitions.every((contract) => hasAsset("CONTRACT", contract.key, "NORMAL") && hasAsset("CONTRACT", contract.key, "SCANNED")) &&
        form.contractType.trim() &&
        form.planName.trim() &&
        Number(form.termMonths) > 0 &&
        Number(form.monthlyAmount) > 0 &&
        form.contractStartDate.trim()
      );
    }

    if (currentStep === 4) {
      if (form.payLater) {
        return true;
      }

      return (
        form.paymentMethod.trim() &&
        form.paymentBank.trim() &&
        form.paymentReference.trim() &&
        Number(form.paymentAmount) > 0 &&
        form.paymentDate.trim()
      );
    }

    if (currentStep === 5) {
      return form.username.trim() === expectedUsername && /^SAN-MEMBER-[A-Z0-9]{6}$/.test(form.encryptedKey.trim());
    }

    return true;
  };

  const goNext = () => {
    if (!validateStep(step)) {
      setError("Completa los datos requeridos de este paso para continuar.");
      return;
    }

    if (step === 4 && !form.username.trim()) {
      setForm((current) => ({
        ...current,
        username: expectedUsername,
        encryptedKey: current.encryptedKey || generateMemberKey(),
      }));
    }

    setStep((current) => Math.min(5, current + 1));
  };

  const goBack = () => {
    setError("");
    setStep((current) => Math.max(1, current - 1));
  };

  const goBackOrDashboard = () => {
    setError("");

    if (registrationCompleted) {
      clearDraft();
      window.location.href = "/admin";
      return;
    }

    if (!registrationCompleted && step > 1) {
      setStep((current) => Math.max(1, current - 1));
      return;
    }

    window.location.href = "/admin";
  };

  const clearDraft = () => {
    setForm(initialForm);
    setAssets({});
    setStep(1);
    setError("");
    setSuccess("");
    setRegistrationCompleted(false);
    setUploadingKey(null);
    setHoveredBox(null);

    try {
      window.localStorage.removeItem(REGISTER_MEMBER_DRAFT_KEY);
    } catch {
      // Ignore storage cleanup issues.
    }
  };

  const handleSubmit = async () => {
    if (!validateStep(5)) {
      setError("Verifica usuario y clave encriptada antes de registrar.");
      return;
    }

    if (!consentimiento) {
      setError("Debes confirmar el aviso de tratamiento de datos antes de registrar.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`${API_BASE}/api/auth/register-member`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          username: form.username.trim().toLowerCase(),
          encryptedKey: form.encryptedKey.trim().toUpperCase(),
          omitCertificateOrigin: form.omitCertificateOrigin,
          omitLicencia: form.omitLicencia,
          payLater: form.payLater,
          motoUnitPrice: Number(form.motoUnitPrice || 0),
          termMonths: Number(form.termMonths),
          installmentCount: Number(form.installmentCount || 0) || undefined,
          monthlyAmount: Number(form.monthlyAmount),
          paymentAmount: Number(form.paymentAmount),
          ubicacionLat: form.ubicacionLat ? Number(form.ubicacionLat) : undefined,
          ubicacionLng: form.ubicacionLng ? Number(form.ubicacionLng) : undefined,
          referenciaLat: form.referenciaLat ? Number(form.referenciaLat) : undefined,
          referenciaLng: form.referenciaLng ? Number(form.referenciaLng) : undefined,
          referencia2Lat: form.referencia2Lat ? Number(form.referencia2Lat) : undefined,
          referencia2Lng: form.referencia2Lng ? Number(form.referencia2Lng) : undefined,
          consentimiento,
        }),
      });

      const isJson = response.headers.get("content-type")?.includes("application/json");
      const data = (isJson
        ? await response.json()
        : {
            ok: response.ok,
            message: (await response.text()) || "Error inesperado del servidor.",
          }) as {
        ok: boolean;
        message: string;
        credentials?: { username: string; encryptedKey: string };
      };

      if (!response.ok || !data.ok) {
        setError(data.message || "No se pudo registrar el miembro.");
        return;
      }

      setSuccess(data.message);
      setRegistrationCompleted(true);
      setForm((current) => ({
        ...current,
        username: data.credentials?.username ?? current.username,
        encryptedKey: data.credentials?.encryptedKey ?? current.encryptedKey,
      }));

      try {
        window.localStorage.removeItem(REGISTER_MEMBER_DRAFT_KEY);
      } catch {
        // Ignore storage cleanup issues.
      }
    } catch (error) {
      if (error instanceof Error && error.message) {
        setError(`Error de conexión: ${error.message}`);
      } else {
        setError("No se pudo conectar con el servidor.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Orden de las tarjetas del paso 4: "Registrar pago ahora" va de primero y es
  // el modo por defecto (form.payLater arranca en false).
  const paymentModeOptions = [
    {
      key: "now",
      active: !form.payLater,
      label: "Registrar pago ahora",
      hint: "Al registrar el pago, la cuota #1 queda pagada y solvente.",
      selectedClass: "border-emerald-500 bg-emerald-50 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]",
      idleClass: "border-zinc-200 bg-white hover:border-emerald-300",
      dotClass: "border-emerald-600 bg-emerald-600 text-white",
      labelClass: "text-emerald-900",
      badgeClass: "bg-emerald-600",
      onClick: () => setForm((current) => ({ ...current, payLater: false })),
    },
    {
      key: "later",
      active: form.payLater,
      label: "Pagar después",
      hint: "La cuota #1 queda pendiente para que el admin la registre luego.",
      selectedClass: "border-amber-500 bg-amber-50 shadow-[0_0_0_3px_rgba(245,158,11,0.18)]",
      idleClass: "border-zinc-200 bg-white hover:border-amber-300",
      dotClass: "border-amber-600 bg-amber-500 text-white",
      labelClass: "text-amber-900",
      badgeClass: "bg-amber-500",
      onClick: () => {
        const cedulaLabel = form.cedula.trim() || "SIN-CEDULA";
        setForm((current) => ({
          ...current,
          payLater: true,
          paymentMethod: "Pagar después",
          paymentBank: "Pendiente",
          paymentReference: `PEND-${cedulaLabel}`,
          paymentAmount: "0",
          paymentDate: current.contractStartDate || new Date().toISOString().slice(0, 10),
        }));
      },
    },
  ];


  return (
    <main className="min-h-screen bg-[#f3f4f6] px-4 py-8 text-zinc-900 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="mb-3">
            <button
              type="button"
              onClick={goBackOrDashboard}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              {registrationCompleted || step === 1 ? "Regresar al inicio del registro" : "Regresar al paso anterior"}
            </button>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            TEAM SAN · Registro de miembros
            <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold tracking-normal text-emerald-700">
              escáner v2
            </span>
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Registro del Expediente</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Secuencia ordenada: datos personales, documentos, contratos, pago y credenciales de acceso.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {stepLabels.map((label, index) => {
              const current = index + 1;
              const active = step === current;
              const done = step > current;
              return (
                <span
                  key={label}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    active ? "bg-zinc-900 text-white" : done ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"
                  }`}
                >
                  {current}. {label}
                </span>
              );
            })}
            <button
              type="button"
              onClick={clearDraft}
              className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              Limpiar borrador
            </button>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-2xl border border-zinc-200 bg-white p-5">
            {error ? (
              <p className="mb-4 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                {error}
              </p>
            ) : null}
            {success ? (
              <p className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                {success}
              </p>
            ) : null}
            {scanningKey ? (
              <p className="mb-4 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700">
                Escaneando automáticamente… el documento se está digitalizando.
              </p>
            ) : null}
            {uploadingKey ? (
              <p className="mb-4 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                Procesando carga: {uploadingKey}
              </p>
            ) : null}
            {step === 1 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <input className="rounded-xl border border-zinc-200 px-4 py-3" placeholder="Nombre" value={form.nombre} onChange={(e) => updateField("nombre", e.target.value)} />
                <input className="rounded-xl border border-zinc-200 px-4 py-3" placeholder="Apellido" value={form.apellido} onChange={(e) => updateField("apellido", e.target.value)} />
                <input className="rounded-xl border border-zinc-200 px-4 py-3" placeholder="Correo" type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} />
                <input className="rounded-xl border border-zinc-200 px-4 py-3" placeholder="Telefono" value={form.telefono} onChange={(e) => updateField("telefono", e.target.value)} />
                <div className="space-y-2">
                  <input className="w-full rounded-xl border border-zinc-200 px-4 py-3" placeholder="Cedula" value={form.cedula} onChange={(e) => updateField("cedula", e.target.value)} />
                  <button
                    type="button"
                    onClick={() => void loadExistingProfile()}
                    disabled={loadingProfile}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                  >
                    {loadingProfile ? "Consultando..." : "Consultar expediente por cedula"}
                  </button>
                </div>
                <input className="rounded-xl border border-zinc-200 px-4 py-3" placeholder="Ocupacion" value={form.ocupacion} onChange={(e) => updateField("ocupacion", e.target.value)} />
                <input className="rounded-xl border border-zinc-200 px-4 py-3 sm:col-span-2" placeholder="Direccion" value={form.direccion} onChange={(e) => updateField("direccion", e.target.value)} />
                <div className="sm:col-span-2">
                  <LocationField
                    title="Ubicación del cliente"
                    hint="Abre el mapa, busca la dirección o usa tu GPS y guarda el punto exacto del cliente."
                    value={clienteUbicacion}
                    allowInternational
                    onSave={(point, address) => {
                      updateField("ubicacionLat", point ? String(point.lat) : "");
                      updateField("ubicacionLng", point ? String(point.lng) : "");
                      if (address) updateField("direccion", address);
                    }}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Empresa</label>
                  <select
                    className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm"
                    value={form.empresa}
                    onChange={(e) => updateField("empresa", e.target.value)}
                  >
                    {EMPRESA_OPTIONS.map((empresa) => (
                      <option key={empresa} value={empresa}>
                        {empresa}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  className="rounded-xl border border-zinc-200 px-4 py-3 sm:col-span-2 min-h-24"
                  placeholder="Referencias (familiares, comerciales o personales)"
                  value={form.references}
                  onChange={(e) => updateField("references", e.target.value)}
                />
                <div className="sm:col-span-2">
                  <LocationField
                    title="Ubicación de la referencia 1"
                    hint="Abre el mapa y guarda el punto donde vive o está la primera referencia."
                    value={referenciaUbicacion}
                    onSave={(point) => {
                      updateField("referenciaLat", point ? String(point.lat) : "");
                      updateField("referenciaLng", point ? String(point.lng) : "");
                    }}
                  />
                </div>
                <div className="sm:col-span-2">
                  <LocationField
                    title="Ubicación de la referencia 2"
                    hint="Abre el mapa y guarda el punto donde vive o está la segunda referencia."
                    value={referencia2Ubicacion}
                    onSave={(point) => {
                      updateField("referencia2Lat", point ? String(point.lat) : "");
                      updateField("referencia2Lng", point ? String(point.lng) : "");
                    }}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Activo solicitado por el cliente</label>
                  <select
                    className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm"
                    value={form.motoSlug}
                    onChange={(e) => {
                      const slug = e.target.value;
                      setForm((current) => {
                        const next = { ...current, motoSlug: slug };
                        return isFinancingPlan(current.planName) ? applyFinancingPlan(slug, next) : next;
                      });
                    }}
                  >
                    <option value="">Selecciona modelo de moto</option>
                    {MOTOS.map((moto) => (
                      <option key={moto.slug} value={moto.slug}>
                        {moto.nombre} · {moto.categoria}
                      </option>
                    ))}
                  </select>
                  {form.motoSlug ? (
                    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                      <Image
                        src={MOTOS.find((moto) => moto.slug === form.motoSlug)?.imagen || "/Documentos/Identificacion principal.jpeg"}
                        alt="Moto seleccionada"
                        width={120}
                        height={80}
                        className="h-16 w-24 rounded-lg border border-zinc-200 object-cover"
                      />
                      <div>
                        <p className="text-sm font-semibold text-zinc-900">{MOTOS.find((moto) => moto.slug === form.motoSlug)?.nombre || "Modelo seleccionado"}</p>
                        <p className="text-xs text-zinc-600">{MOTOS.find((moto) => moto.slug === form.motoSlug)?.descripcion || "Activo registrado para expediente"}</p>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Precio real de la moto (USD)</label>
                      <input
                        className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm"
                        placeholder="Ej: 1850"
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.motoUnitPrice}
                        onChange={(e) => updateField("motoUnitPrice", e.target.value)}
                      />
                    </div>
                    <div className="text-xs text-zinc-500">Precio editable para control administrativo.</div>
                  </div>

                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Plan de financiamiento</label>
                    <select
                      className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm"
                      value={form.planName}
                      onChange={(e) => {
                        const selected = FINANCING_PLANS.find((plan) => plan.planName === e.target.value);
                        if (!selected) {
                          updateField("planName", e.target.value);
                          return;
                        }

                        if (selected.kind === "financing") {
                          setForm((current) => applyFinancingPlan(current.motoSlug, current));
                          return;
                        }

                        setForm((current) => ({
                          ...current,
                          planName: selected.planName,
                          termMonths: "12",
                          installmentCount: "",
                          monthlyAmount: current.monthlyAmount.trim() ? current.monthlyAmount : selected.monthlyAmount,
                        }));
                      }}
                    >
                      <option value="">Selecciona el plan</option>
                      {FINANCING_PLANS.map((plan) => (
                        <option key={plan.id} value={plan.planName}>
                          {plan.label}
                        </option>
                      ))}
                    </select>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Monto por cuota (USD)</label>
                        <input
                          className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm"
                          placeholder="Ej: 75"
                          type="number"
                          min={1}
                          value={form.monthlyAmount}
                          onChange={(e) => updateField("monthlyAmount", e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Duración (meses)</label>
                        <input
                          className="w-full rounded-xl border border-zinc-200 bg-zinc-100 px-4 py-3 text-sm text-zinc-700"
                          type="number"
                          min={1}
                          value={form.termMonths}
                          onChange={(e) => updateField("termMonths", e.target.value)}
                        />
                      </div>
                    </div>
                    {isFinancingPlan(form.planName) ? (
                      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                        <p className="font-semibold">Financiamiento 50% + cuotas quincenales (cada 15 días)</p>
                        {selectedFinancing ? (
                          <>
                            <p className="mt-1">
                              Precio <span className="font-semibold">${selectedFinancing.precioBase.toFixed(2)}</span> ·
                              Inicial {selectedFinancing.porcentajeInicial}%{" "}
                              <span className="font-semibold">${selectedFinancing.inicial.toFixed(2)}</span> · Saldo{" "}
                              <span className="font-semibold">${selectedFinancing.saldo.toFixed(2)}</span>
                            </p>
                            <p className="mt-1">
                              <span className="font-semibold">{selectedFinancing.cuotasQuincenales} cuotas</span> de{" "}
                              <span className="font-semibold">${selectedFinancing.cuota.toFixed(2)}</span> · duración aprox.{" "}
                              {selectedFinancing.meses} meses
                            </p>
                          </>
                        ) : (
                          <p className="mt-1 font-semibold">
                            {form.motoSlug
                              ? "Este modelo no tiene financiamiento configurado. Pídele al admin que lo configure en el panel."
                              : "Selecciona primero el modelo de moto para cargar su financiamiento."}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-zinc-500">La duración viene predeterminada en 1 año (12 meses). Puedes ajustar el monto según el caso.</p>
                    )}
                    <div className="mt-3">
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Grupo operativo</label>
                      <select
                        className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm"
                        value={form.operationalGroup}
                        onChange={(e) => updateField("operationalGroup", e.target.value)}
                      >
                        {Array.from({ length: 100 }, (_, index) => `Grupo ${String(index + 1).padStart(2, "0")}`).map((groupName) => (
                          <option key={`register-group-${groupName}`} value={groupName}>
                            {groupName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                {documentDefinitions.map((doc) => {
                  const normalAsset = assets[getAssetKey("DOCUMENT", doc.key, "NORMAL")];
                  const scannedAsset = assets[getAssetKey("DOCUMENT", doc.key, "SCANNED")];
                  const normalKey = `doc-${doc.key}-normal`;
                  const scannedKey = `doc-${doc.key}-scanned`;
                  const normalInputKey = `${normalKey}-input`;
                  const scannedInputKey = `${scannedKey}-input`;
                  const omissionField = OMITABLE_DOCUMENTS[doc.key];
                  const documentOmitted = isDocumentOmitted(doc.key);

                  return (
                    <div key={doc.key} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                      <p className="text-sm font-semibold text-zinc-900">
                        {doc.label}
                        {documentOmitted ? (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                            Omitido
                          </span>
                        ) : null}
                      </p>
                      {omissionField ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setDocumentOmission(omissionField, !documentOmitted)}
                            className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
                              documentOmitted
                                ? "border-amber-300 bg-amber-50 text-amber-700"
                                : "border-zinc-300 bg-white text-zinc-700"
                            }`}
                          >
                            {documentOmitted ? "Omitido por ahora" : "Omitir por ahora"}
                          </button>
                          <p className="text-xs text-zinc-500">Si el cliente no lo tiene hoy, puedes continuar y cargarlo después.</p>
                        </div>
                      ) : null}
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => openFileDialog(normalInputKey)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openFileDialog(normalInputKey);
                            }
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            setHoveredBox(normalKey);
                          }}
                          onDragLeave={() => setHoveredBox((current) => (current === normalKey ? null : current))}
                          onDrop={(event) => handleDropUpload(event, normalKey, "DOCUMENT", doc.key, "NORMAL")}
                          onMouseEnter={() => setHoveredBox(normalKey)}
                          onMouseLeave={() => setHoveredBox((current) => (current === normalKey ? null : current))}
                          className={`rounded-lg border bg-white p-3 transition-all duration-200 ${
                            hoveredBox === normalKey
                              ? "border-emerald-400 shadow-[0_0_0_2px_rgba(16,185,129,0.25),0_12px_32px_rgba(16,185,129,0.18)] -translate-y-0.5"
                              : "border-zinc-200 hover:border-emerald-300 hover:shadow-[0_10px_26px_rgba(16,185,129,0.14)]"
                          }`}
                        >
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Normal</p>
                          <p className="mt-2 text-xs text-zinc-500">Haz clic en este cuadro o arrastra el archivo aqui.</p>
                          <input
                            type="file"
                            ref={setFileInputRef(normalInputKey)}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) {
                                setPickLabels((current) => ({
                                  ...current,
                                  [normalInputKey]: `${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB)`,
                                }));
                                void uploadAsset(file, "DOCUMENT", doc.key, "NORMAL");
                              }
                              event.target.value = "";
                            }}
                            className="hidden"
                          />
                          <p className="mt-2 text-xs text-zinc-600">
                            {normalAsset
                              ? `Cargado: ${normalAsset.fileName}`
                              : pickLabels[normalInputKey]
                                ? `Seleccionado: ${pickLabels[normalInputKey]} — subiendo…`
                                : "Sin cargar"}
                          </p>
                          {normalAsset ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void deleteAsset("DOCUMENT", doc.key, "NORMAL");
                              }}
                              disabled={deletingKey === getAssetKey("DOCUMENT", doc.key, "NORMAL")}
                              className="mt-2 rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                            >
                              {deletingKey === getAssetKey("DOCUMENT", doc.key, "NORMAL") ? "Eliminando..." : "Eliminar archivo"}
                            </button>
                          ) : null}
                          {documentOmitted ? <p className="mt-2 text-xs font-semibold text-amber-700">Documento omitido temporalmente.</p> : null}
                          {normalAsset ? (
                            <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100">
                              {isImageAsset(normalAsset) ? (
                                <Image src={buildAssetUrl(normalAsset.filePath)} alt={`Vista previa ${doc.label}`} width={640} height={320} unoptimized className="h-40 w-full object-cover" />
                              ) : (
                                <div className="flex h-24 items-center justify-center px-3 text-xs text-zinc-600">Archivo cargado correctamente.</div>
                              )}
                            </div>
                          ) : null}
                        </div>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => void generateScannedFromNormal("DOCUMENT", doc.key, doc.key === "rif" ? "clean" : "normal")}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              void generateScannedFromNormal("DOCUMENT", doc.key, doc.key === "rif" ? "clean" : "normal");
                            }
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            setHoveredBox(scannedKey);
                          }}
                          onDragLeave={() => setHoveredBox((current) => (current === scannedKey ? null : current))}
                          onDrop={(event) => handleDropUpload(event, scannedKey, "DOCUMENT", doc.key, "SCANNED")}
                          onMouseEnter={() => setHoveredBox(scannedKey)}
                          onMouseLeave={() => setHoveredBox((current) => (current === scannedKey ? null : current))}
                          className={`rounded-lg border bg-white p-3 transition-all duration-200 ${
                            hoveredBox === scannedKey
                              ? "border-sky-400 shadow-[0_0_0_2px_rgba(14,165,233,0.22),0_12px_32px_rgba(14,165,233,0.18)] -translate-y-0.5"
                              : "border-zinc-200 hover:border-sky-300 hover:shadow-[0_10px_26px_rgba(14,165,233,0.14)]"
                          }`}
                        >
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Escaneado</p>
                          <p className="mt-2 text-xs text-zinc-500">Se genera automáticamente al subir el documento normal.</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <input
                              type="file"
                              ref={setFileInputRef(scannedInputKey)}
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) void uploadAsset(file, "DOCUMENT", doc.key, "SCANNED");
                                event.target.value = "";
                              }}
                              className="hidden"
                            />
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openFileDialog(scannedInputKey);
                              }}
                              className="rounded-lg border border-zinc-300 px-2 py-1 text-xs"
                            >
                              Subir escaneado manual
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void generateScannedFromNormal("DOCUMENT", doc.key, "normal");
                              }}
                              className="rounded-lg border border-zinc-300 px-2 py-1 text-xs"
                            >
                              Escaneo normal
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void generateScannedFromNormal("DOCUMENT", doc.key, "clean");
                              }}
                              className="rounded-lg border border-zinc-300 px-2 py-1 text-xs"
                            >
                              Escaneo limpio
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-zinc-600">{scannedAsset ? `Cargado: ${scannedAsset.fileName}` : "Sin cargar"}</p>
                          {scannedAsset ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void deleteAsset("DOCUMENT", doc.key, "SCANNED");
                              }}
                              disabled={deletingKey === getAssetKey("DOCUMENT", doc.key, "SCANNED")}
                              className="mt-2 rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                            >
                              {deletingKey === getAssetKey("DOCUMENT", doc.key, "SCANNED") ? "Eliminando..." : "Eliminar archivo"}
                            </button>
                          ) : null}
                          {documentOmitted ? <p className="mt-2 text-xs font-semibold text-amber-700">Escaneo omitido temporalmente.</p> : null}
                          {scannedAsset ? (
                            <a
                              href={getPdfPath(scannedAsset) ?? "#"}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(event) => event.stopPropagation()}
                              className="mt-2 inline-flex rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                            >
                              Ver PDF digital
                            </a>
                          ) : null}
                          {scannedAsset?.ocrPreview ? (
                            <p className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-[11px] text-zinc-600">
                              OCR {scannedAsset.ocrConfidence ? `(${scannedAsset.ocrConfidence.toFixed(1)}%)` : ""}: {scannedAsset.ocrPreview}
                            </p>
                          ) : null}
                          {scannedAsset?.ocrTextPath ? (
                            <a
                              href={scannedAsset.ocrTextPath}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(event) => event.stopPropagation()}
                              className="mt-2 inline-flex rounded-lg border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                            >
                              Ver texto OCR
                            </a>
                          ) : null}
                          {scannedAsset ? (
                            <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100">
                              {isImageAsset(scannedAsset) ? (
                                <Image src={buildAssetUrl(scannedAsset.filePath)} alt={`Vista previa escaneada ${doc.label}`} width={640} height={320} unoptimized className="h-40 w-full object-cover" />
                              ) : (
                                <div className="flex h-24 items-center justify-center px-3 text-xs text-zinc-600">Archivo escaneado registrado.</div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                {contractDefinitions.map((contract) => {
                  const normalAsset = assets[getAssetKey("CONTRACT", contract.key, "NORMAL")];
                  const scannedAsset = assets[getAssetKey("CONTRACT", contract.key, "SCANNED")];
                  const normalKey = `contract-${contract.key}-normal`;
                  const scannedKey = `contract-${contract.key}-scanned`;
                  const normalInputKey = `${normalKey}-input`;
                  const scannedInputKey = `${scannedKey}-input`;

                  return (
                    <div key={contract.key} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                      <p className="text-sm font-semibold text-zinc-900">{contract.label}</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => openFileDialog(normalInputKey)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openFileDialog(normalInputKey);
                            }
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            setHoveredBox(normalKey);
                          }}
                          onDragLeave={() => setHoveredBox((current) => (current === normalKey ? null : current))}
                          onDrop={(event) => handleDropUpload(event, normalKey, "CONTRACT", contract.key, "NORMAL")}
                          onMouseEnter={() => setHoveredBox(normalKey)}
                          onMouseLeave={() => setHoveredBox((current) => (current === normalKey ? null : current))}
                          className={`rounded-lg border bg-white p-3 transition-all duration-200 ${
                            hoveredBox === normalKey
                              ? "border-emerald-400 shadow-[0_0_0_2px_rgba(16,185,129,0.25),0_12px_32px_rgba(16,185,129,0.18)] -translate-y-0.5"
                              : "border-zinc-200 hover:border-emerald-300 hover:shadow-[0_10px_26px_rgba(16,185,129,0.14)]"
                          }`}
                        >
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Contrato normal</p>
                          <p className="mt-2 text-xs text-zinc-500">Haz clic en este cuadro o arrastra el archivo aqui.</p>
                          <input
                            type="file"
                            ref={setFileInputRef(normalInputKey)}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void uploadAsset(file, "CONTRACT", contract.key, "NORMAL");
                              event.target.value = "";
                            }}
                            className="hidden"
                          />
                          <p className="mt-2 text-xs text-zinc-600">{normalAsset ? `Cargado: ${normalAsset.fileName}` : "Sin cargar"}</p>
                          {normalAsset ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void deleteAsset("CONTRACT", contract.key, "NORMAL");
                              }}
                              disabled={deletingKey === getAssetKey("CONTRACT", contract.key, "NORMAL")}
                              className="mt-2 rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                            >
                              {deletingKey === getAssetKey("CONTRACT", contract.key, "NORMAL") ? "Eliminando..." : "Eliminar archivo"}
                            </button>
                          ) : null}
                          {normalAsset ? (
                            <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100">
                              {isImageAsset(normalAsset) ? (
                                <Image src={buildAssetUrl(normalAsset.filePath)} alt={`Vista previa ${contract.label}`} width={640} height={320} unoptimized className="h-40 w-full object-cover" />
                              ) : (
                                <div className="flex h-24 items-center justify-center px-3 text-xs text-zinc-600">Contrato normal cargado.</div>
                              )}
                            </div>
                          ) : null}
                        </div>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => void generateScannedFromNormal("CONTRACT", contract.key, "clean")}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              void generateScannedFromNormal("CONTRACT", contract.key, "clean");
                            }
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            setHoveredBox(scannedKey);
                          }}
                          onDragLeave={() => setHoveredBox((current) => (current === scannedKey ? null : current))}
                          onDrop={(event) => handleDropUpload(event, scannedKey, "CONTRACT", contract.key, "SCANNED")}
                          onMouseEnter={() => setHoveredBox(scannedKey)}
                          onMouseLeave={() => setHoveredBox((current) => (current === scannedKey ? null : current))}
                          className={`rounded-lg border bg-white p-3 transition-all duration-200 ${
                            hoveredBox === scannedKey
                              ? "border-sky-400 shadow-[0_0_0_2px_rgba(14,165,233,0.22),0_12px_32px_rgba(14,165,233,0.18)] -translate-y-0.5"
                              : "border-zinc-200 hover:border-sky-300 hover:shadow-[0_10px_26px_rgba(14,165,233,0.14)]"
                          }`}
                        >
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Contrato escaneado</p>
                          <p className="mt-2 text-xs text-zinc-500">Se genera automáticamente al subir el contrato normal.</p>
                          <input
                            type="file"
                            ref={setFileInputRef(scannedInputKey)}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void uploadAsset(file, "CONTRACT", contract.key, "SCANNED");
                              event.target.value = "";
                            }}
                            className="hidden"
                          />
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openFileDialog(scannedInputKey);
                              }}
                              className="rounded-lg border border-zinc-300 px-2 py-1 text-xs"
                            >
                              Subir escaneado manual
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void generateScannedFromNormal("CONTRACT", contract.key, "normal");
                              }}
                              className="rounded-lg border border-zinc-300 px-2 py-1 text-xs"
                            >
                              Escaneo normal
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void generateScannedFromNormal("CONTRACT", contract.key, "clean");
                              }}
                              className="rounded-lg border border-zinc-300 px-2 py-1 text-xs"
                            >
                              Escaneo limpio
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-zinc-600">{scannedAsset ? `Cargado: ${scannedAsset.fileName}` : "Sin cargar"}</p>
                          {scannedAsset ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void deleteAsset("CONTRACT", contract.key, "SCANNED");
                              }}
                              disabled={deletingKey === getAssetKey("CONTRACT", contract.key, "SCANNED")}
                              className="mt-2 rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                            >
                              {deletingKey === getAssetKey("CONTRACT", contract.key, "SCANNED") ? "Eliminando..." : "Eliminar archivo"}
                            </button>
                          ) : null}
                          {scannedAsset ? (
                            <a
                              href={getPdfPath(scannedAsset) ?? "#"}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(event) => event.stopPropagation()}
                              className="mt-2 inline-flex rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                            >
                              Ver PDF digital
                            </a>
                          ) : null}
                          {scannedAsset?.ocrPreview ? (
                            <p className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-[11px] text-zinc-600">
                              OCR {scannedAsset.ocrConfidence ? `(${scannedAsset.ocrConfidence.toFixed(1)}%)` : ""}: {scannedAsset.ocrPreview}
                            </p>
                          ) : null}
                          {scannedAsset?.ocrTextPath ? (
                            <a
                              href={scannedAsset.ocrTextPath}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(event) => event.stopPropagation()}
                              className="mt-2 inline-flex rounded-lg border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                            >
                              Ver texto OCR
                            </a>
                          ) : null}
                          {scannedAsset ? (
                            <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100">
                              {isImageAsset(scannedAsset) ? (
                                <Image src={buildAssetUrl(scannedAsset.filePath)} alt={`Vista previa escaneada ${contract.label}`} width={640} height={320} unoptimized className="h-40 w-full object-cover" />
                              ) : (
                                <div className="flex h-24 items-center justify-center px-3 text-xs text-zinc-600">Contrato escaneado registrado.</div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="grid gap-4 sm:grid-cols-2">
                <input className="rounded-xl border border-zinc-200 px-4 py-3 sm:col-span-2" placeholder="Tipo de contrato" value={form.contractType} onChange={(e) => updateField("contractType", e.target.value)} />
                <input className="rounded-xl border border-zinc-200 px-4 py-3 sm:col-span-2" placeholder="Plan" value={form.planName} onChange={(e) => updateField("planName", e.target.value)} />
                <input className="rounded-xl border border-zinc-200 px-4 py-3" placeholder="Plazo (meses)" type="number" min={1} value={form.termMonths} onChange={(e) => updateField("termMonths", e.target.value)} />
                <input className="rounded-xl border border-zinc-200 px-4 py-3" placeholder="Monto mensual" type="number" min={1} value={form.monthlyAmount} onChange={(e) => updateField("monthlyAmount", e.target.value)} />
                <input className="rounded-xl border border-zinc-200 px-4 py-3 sm:col-span-2" placeholder="Inicio de contrato" type="date" value={form.contractStartDate} onChange={(e) => updateField("contractStartDate", e.target.value)} />
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Forma de registrar el pago inicial
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${
                        form.payLater ? "bg-amber-500" : "bg-emerald-600"
                      }`}
                    >
                      {form.payLater ? "Pagar después" : "Pago ahora"}
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {paymentModeOptions.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        aria-pressed={option.active}
                        onClick={option.onClick}
                        className={`relative flex items-start gap-3 rounded-xl border-2 p-4 text-left transition ${
                          option.active ? option.selectedClass : option.idleClass
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold ${
                            option.active ? option.dotClass : "border-zinc-300 bg-white text-transparent"
                          }`}
                        >
                          ✓
                        </span>
                        <span className="pr-20">
                          <span className={`block text-sm font-semibold ${option.active ? option.labelClass : "text-zinc-800"}`}>
                            {option.label}
                          </span>
                          <span className="mt-1 block text-xs text-zinc-500">{option.hint}</span>
                        </span>
                        {option.active ? (
                          <span className={`absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${option.badgeClass}`}>
                            Seleccionado
                          </span>
                        ) : null}
                      </button>
                    ))}

                  </div>
                </div>
                {form.payLater ? (
                  <p className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                    Estás en modo «pagar después»: los datos de pago no se usan (la cuota #1 queda pendiente).
                  </p>
                ) : null}

                <input className={`rounded-xl border border-zinc-200 px-4 py-3 ${form.payLater ? "bg-zinc-100 text-zinc-400" : ""}`} placeholder="Metodo de pago" disabled={form.payLater} value={form.paymentMethod} onChange={(e) => updateField("paymentMethod", e.target.value)} />
                <input className={`rounded-xl border border-zinc-200 px-4 py-3 ${form.payLater ? "bg-zinc-100 text-zinc-400" : ""}`} placeholder="Banco" disabled={form.payLater} value={form.paymentBank} onChange={(e) => updateField("paymentBank", e.target.value)} />
                <input className={`rounded-xl border border-zinc-200 px-4 py-3 ${form.payLater ? "bg-zinc-100 text-zinc-400" : ""}`} placeholder="Referencia" disabled={form.payLater} value={form.paymentReference} onChange={(e) => updateField("paymentReference", e.target.value)} />
                <input className={`rounded-xl border border-zinc-200 px-4 py-3 ${form.payLater ? "bg-zinc-100 text-zinc-400" : ""}`} placeholder="Monto pagado" type="number" min={0} disabled={form.payLater} value={form.paymentAmount} onChange={(e) => updateField("paymentAmount", e.target.value)} />
                <input className={`rounded-xl border border-zinc-200 px-4 py-3 sm:col-span-2 ${form.payLater ? "bg-zinc-100 text-zinc-400" : ""}`} placeholder="Fecha de pago" type="date" disabled={form.payLater} value={form.paymentDate} onChange={(e) => updateField("paymentDate", e.target.value)} />
                {form.payLater ? (
                  <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Registro configurado en modo <span className="font-semibold">pagar después</span>: la cuota #1 quedará pendiente para que el admin la registre manualmente.
                  </div>
                ) : (
                  <div className="sm:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    Al registrar este pago inicial, la <span className="font-semibold">cuota #1</span> quedará marcada como <span className="font-semibold">pagada y solvente</span> en el expediente.
                  </div>
                )}
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4">
                <input className="w-full rounded-xl border border-zinc-200 px-4 py-3" placeholder="Usuario" value={form.username} onChange={(e) => updateField("username", e.target.value.toLowerCase())} />
                <input className="w-full rounded-xl border border-zinc-200 px-4 py-3" placeholder="Clave encriptada SAN-MEMBER-XXXXXX" value={form.encryptedKey} onChange={(e) => updateField("encryptedKey", e.target.value.toUpperCase())} />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => updateField("username", expectedUsername)}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  >
                    Usar usuario sugerido {expectedUsername}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateField("encryptedKey", generateMemberKey())}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  >
                    Generar clave segura
                  </button>
                </div>
                <p className="text-xs text-zinc-500">Formato requerido: SAN-MEMBER-XXXXXX</p>
              </div>
            )}

            {registrationCompleted ? (
              <button
                type="button"
                onClick={() => {
                  clearDraft();
                }}
                className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
              >
                Ir al inicio del registro
              </button>
            ) : null}

            {step === 5 && !registrationCompleted ? (
              <div className="mt-5">
                <AvisoTratamientoDatos
                  aceptado={consentimiento}
                  onChange={(valor) => {
                    setConsentimiento(valor);
                    setError("");
                  }}
                />
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={goBack} disabled={step === 1} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm disabled:opacity-40">
                Anterior
              </button>

              {step < 5 ? (
                <button type="button" onClick={goNext} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">
                  Siguiente
                </button>
              ) : (
                <button type="button" onClick={handleSubmit} disabled={loading || !consentimiento} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-70">
                  {loading ? "Registrando miembro..." : "Finalizar registro"}
                </button>
              )}
            </div>
          </article>

          <aside className="space-y-4">
            <article className="rounded-2xl border border-zinc-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Expediente consolidado</p>
              <div className="mt-3 space-y-2 text-sm text-zinc-700">
                <p><span className="text-zinc-500">Persona:</span> {form.nombre || "-"} {form.apellido || ""}</p>
                <p><span className="text-zinc-500">Cedula:</span> {form.cedula || "-"}</p>
                <p><span className="text-zinc-500">Número:</span> {form.telefono || "-"}</p>
                <p><span className="text-zinc-500">Empresa:</span> {form.empresa || "-"}</p>
                <p><span className="text-zinc-500">Grupo operativo:</span> {form.operationalGroup || "Grupo 01"}</p>
                <p><span className="text-zinc-500">Referencias:</span> {form.references || "-"}</p>
                <div>
                  <p>
                    <span className="text-zinc-500">Ubicación del cliente:</span>{" "}
                    {clienteUbicacion ? "Guardada" : "Sin registrar"}
                  </p>
                  {clienteUbicacion ? (
                    <div className="mt-2">
                      <SavedLocationPreview
                        label="Ubicación del cliente"
                        lat={clienteUbicacion.lat}
                        lng={clienteUbicacion.lng}
                      />
                    </div>
                  ) : null}
                </div>
                <div>
                  <p>
                    <span className="text-zinc-500">Ubicación de la referencia 1:</span>{" "}
                    {referenciaUbicacion ? "Guardada" : "Sin registrar"}
                  </p>
                  {referenciaUbicacion ? (
                    <div className="mt-2">
                      <SavedLocationPreview
                        label="Ubicación de la referencia 1"
                        lat={referenciaUbicacion.lat}
                        lng={referenciaUbicacion.lng}
                      />
                    </div>
                  ) : null}
                </div>
                <div>
                  <p>
                    <span className="text-zinc-500">Ubicación de la referencia 2:</span>{" "}
                    {referencia2Ubicacion ? "Guardada" : "Sin registrar"}
                  </p>
                  {referencia2Ubicacion ? (
                    <div className="mt-2">
                      <SavedLocationPreview
                        label="Ubicación de la referencia 2"
                        lat={referencia2Ubicacion.lat}
                        lng={referencia2Ubicacion.lng}
                      />
                    </div>
                  ) : null}
                </div>
                <p><span className="text-zinc-500">Activo solicitado:</span> {selectedMoto?.nombre || "-"}</p>
                <p><span className="text-zinc-500">Precio real moto:</span> {form.motoUnitPrice ? `$${Number(form.motoUnitPrice).toFixed(2)}` : "No definido"}</p>
                <p><span className="text-zinc-500">Contrato:</span> {form.contractType || "-"}</p>
                <p><span className="text-zinc-500">Plan:</span> {form.planName || "-"}</p>
                <p><span className="text-zinc-500">Pago:</span> {form.paymentMethod || "-"} · {form.paymentReference || "-"}</p>
                <p><span className="text-zinc-500">Usuario final:</span> {form.username || expectedUsername}</p>
                <p className="break-all"><span className="text-zinc-500">Clave final:</span> {form.encryptedKey || "SAN-MEMBER-XXXXXX"}</p>
                <p>
                  <span className="text-zinc-500">Documentos digitales:</span>{" "}
                  {
                    documentDefinitions.filter((doc) => {
                      if (isDocumentOmitted(doc.key)) return true;
                      return hasAsset("DOCUMENT", doc.key, "NORMAL") && hasAsset("DOCUMENT", doc.key, "SCANNED");
                    }).length
                  }/{documentDefinitions.length}
                </p>
                <p>
                  <span className="text-zinc-500">Contratos digitales:</span>{" "}
                  {contractDefinitions.filter((contract) => hasAsset("CONTRACT", contract.key, "NORMAL") && hasAsset("CONTRACT", contract.key, "SCANNED")).length}/{contractDefinitions.length}
                </p>
              </div>
            </article>

            <article className="rounded-2xl border border-zinc-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Credenciales finales</p>
              <p className="mt-3 text-sm"><span className="text-zinc-500">Usuario:</span> {form.username || expectedUsername}</p>
              <p className="mt-1 text-sm break-all"><span className="text-zinc-500">Clave:</span> {form.encryptedKey || "SAN-MEMBER-XXXXXX"}</p>
              <Link href="/member-login" className="mt-4 inline-flex rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-800">
                Ir a Administrar mis cuentas
              </Link>
            </article>
          </aside>
        </section>
      </div>
    </main>
  );
}
