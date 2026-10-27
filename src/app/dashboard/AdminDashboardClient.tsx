"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import SavedLocationPreview, { MissingLocationPreview } from "@/app/components/SavedLocationPreview";
import AuditoriaView from "./AuditoriaView";
import { computeFinancing, isFinancingPlan } from "@/lib/moto-financing.mjs";
import {
  Activity,
  Bell,
  BriefcaseBusiness,
  UserPlus,
  LayoutDashboard,
  X,
  FileCheck2,
  Landmark,
  LogOut,
  Search,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  Users,
  Wallet,
  CalendarClock,
  Phone,
  TriangleAlert,
  Newspaper,
} from "lucide-react";

const API_BASE =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? ""
    : process.env.NEXT_PUBLIC_API_BASE || "";
const GROUP_CAPACITY = 26;
const GROUP_CAPACITY_83 = 83;

type AdminUser = {
  userId?: string;
  email: string;
  nombre: string;
  isMember: boolean;
};

type Instrument = {
  symbol: string;
  value: number;
  change: number;
  trend: "up" | "down";
  series: number[];
  format: "decimal4" | "decimal2" | "percent2";
};

type MarketFeedItem = {
  id: string;
  label: string;
  value: string;
  change: number;
};

type AgencyMarketRow = {
  agency: string;
  state: string;
  brand: string;
  model: string;
  priceUsd: number;
  variation: number;
  stock: number;
};

type MovementPoint = {
  slot: string;
  index: number;
};

type CuotaMonitorClient = {
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

type CuotaMonitorInstallment = {
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

type CuotaMonitorContract = {
  id: string;
  tipo: string;
  fecha: string;
  monto: number;
  estado: string;
  archivo: string;
};

type CuotaMonitorDocument = {
  id: string;
  nombre: string;
  tipo: string;
  fecha: string;
  archivo: string;
  variante?: string;
};

/** Publicacion del feed de la empresa (noticias y videos). */
type AdminNewsPost = {
  id: string;
  titulo: string;
  resumen: string;
  contenido: string;
  categoria: string;
  imagenUrl: string;
  videoUrl: string;
  autor: string;
  destacado: boolean;
  publicado: boolean;
  fecha: string;
  fechaIso: string;
};

const NOVEDAD_VACIA = {
  id: "",
  titulo: "",
  resumen: "",
  contenido: "",
  categoria: "Corporativo",
  imagenUrl: "",
  videoUrl: "",
  destacado: false,
  publicado: true,
};

const CATEGORIAS_NOVEDAD = ["Corporativo", "Modelos", "Promociones", "Pagos", "Eventos", "Video"];

type CuotaMonitorProfile = {
  clientId: string;
  cedula: string;
  nombre?: string;
  apellido?: string;
  username?: string;
  credenciales?: {
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
  references?: string;
  ubicacionLink?: string;
  referenciaLink?: string;
  ubicacionLat?: number | null;
  ubicacionLng?: number | null;
  referenciaLat?: number | null;
  referenciaLng?: number | null;
  referencia2Lat?: number | null;
  referencia2Lng?: number | null;
  fechaIngreso: string;
  motoMarca: string;
  motoModelo: string;
  motoImagen: string;
  plan: string;
  cuotaMensual: number;
  cuotasTotales: number;
  cuotasPagadas: number;
  totalAbonado?: number;
  contratos: CuotaMonitorContract[];
  documentos: CuotaMonitorDocument[];
};

// Configuracion editable del financiamiento por modelo de moto.
type FinancingModelRow = {
  slug: string;
  nombre: string;
  categoria: string;
  guardado: boolean;
  precioBase: number;
  porcentajeInicial: number;
  cuotasQuincenales: number;
  montoCuota: number;
  activo: boolean;
};

type MonitorPaymentRecordApi = {
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

type MonitorAdvancePaymentApi = {
  id: string;
  amount: number;
  paymentDate: string;
  reference: string;
  bank: string;
  method: string;
  note: string;
  createdAt: string;
};

type ManualPaymentMethod = "Transferencia" | "Pago móvil" | "Zelle" | "Efectivo" | "Débito";

type ManualPaymentRecord = {
  cuotaNumero: number;
  fecha: string;
  referencia: string;
  banco: string;
  metodo: ManualPaymentMethod;
  observacion: string;
  monto: number;
  registradoEn: string;
};

type DocumentViewerField = {
  label: string;
  value: string;
};

type InstallmentPaymentDetail = {
  cuotaNumero: number;
  estado: string;
  fechaPago: string;
  metodo: string;
  banco: string;
  referencia: string;
  montoBase: number;
  recargo: number;
  totalAbonado: number;
  total: number;
  registradoEn: string;
  origen: "Histórico" | "Manual";
  observacion: string;
  vencimiento: string;
};

const revenueData = [
  { month: "Ene", ingresos: 12400, morosidad: 3100 },
  { month: "Feb", ingresos: 13700, morosidad: 2800 },
  { month: "Mar", ingresos: 14200, morosidad: 2500 },
  { month: "Abr", ingresos: 15600, morosidad: 2100 },
  { month: "May", ingresos: 16900, morosidad: 1900 },
  { month: "Jun", ingresos: 17800, morosidad: 1700 },
];

const fleetData = [
  { zone: "Mérida", operativas: 74, taller: 6, reserva: 9, disponibilidad: 92.4, sla: 98.2, contratos: 28, ingreso: 28400, kmMes: 18420 },
  { zone: "Caracas", operativas: 59, taller: 12, reserva: 7, disponibilidad: 85.6, sla: 95.1, contratos: 24, ingreso: 31750, kmMes: 22870 },
  { zone: "Valencia", operativas: 43, taller: 9, reserva: 5, disponibilidad: 84.8, sla: 94.6, contratos: 19, ingreso: 19860, kmMes: 16340 },
  { zone: "Maracay", operativas: 31, taller: 5, reserva: 4, disponibilidad: 88.9, sla: 96.8, contratos: 13, ingreso: 14540, kmMes: 11820 },
  { zone: "Barinas", operativas: 26, taller: 7, reserva: 3, disponibilidad: 81.3, sla: 93.4, contratos: 11, ingreso: 12720, kmMes: 9640 },
];

const fleetAvailabilityTrend = [
  { month: "Oct", disponibilidad: 87.8, sla: 94.7, costos: 14200 },
  { month: "Nov", disponibilidad: 88.9, sla: 95.2, costos: 13640 },
  { month: "Dic", disponibilidad: 89.6, sla: 95.9, costos: 13180 },
  { month: "Ene", disponibilidad: 90.8, sla: 96.4, costos: 12840 },
  { month: "Feb", disponibilidad: 91.7, sla: 96.9, costos: 12490 },
  { month: "Mar", disponibilidad: 90.9, sla: 96.2, costos: 13360 },
];

const fleetMaintenanceTickets = [
  { id: "MT-2401", unit: "SAN-CCS-018", zone: "Caracas", type: "Frenos y kit de arrastre", priority: "Alta", eta: "6 h", provider: "Moto Servicio Capital", cost: 420, status: "En ejecución" },
  { id: "MT-2404", unit: "SAN-BNS-007", zone: "Barinas", type: "Revisión eléctrica", priority: "Alta", eta: "1 día", provider: "Electro Moto Andes", cost: 310, status: "Esperando repuesto" },
  { id: "MT-2410", unit: "SAN-MRD-042", zone: "Mérida", type: "Mantenimiento preventivo 20.000 km", priority: "Media", eta: "4 h", provider: "Taller Central Mérida", cost: 185, status: "Programado" },
  { id: "MT-2416", unit: "SAN-VLC-015", zone: "Valencia", type: "Cambio de cauchos", priority: "Media", eta: "8 h", provider: "Ruedas Industriales", cost: 260, status: "En ejecución" },
  { id: "MT-2422", unit: "SAN-MCY-011", zone: "Maracay", type: "Ajuste de suspensión", priority: "Baja", eta: "3 h", provider: "Moto Track Center", cost: 120, status: "Programado" },
];

const fleetCriticalUnits = [
  { unit: "SAN-CCS-018", zone: "Caracas", model: "Honda XR 190", operator: "José Rivas", contract: "Logística Capital", status: "Siniestralidad alta", odometer: "28.410 km", fuel: "41%", nextService: "08/03/2026", risk: "Alto" },
  { unit: "SAN-BNS-007", zone: "Barinas", model: "Bera SBR 150", operator: "Andrés Paredes", contract: "Agroinsumos La Villa", status: "En taller correctivo", odometer: "19.880 km", fuel: "67%", nextService: "07/03/2026", risk: "Alto" },
  { unit: "SAN-MRD-042", zone: "Mérida", model: "Yamaha XTZ 150", operator: "Luis Moreno", contract: "Farmacia Los Andes", status: "Preventivo hoy", odometer: "20.040 km", fuel: "82%", nextService: "06/03/2026", risk: "Medio" },
  { unit: "SAN-VLC-015", zone: "Valencia", model: "Suzuki GN 125", operator: "María Colina", contract: "Distribuidora Centro", status: "Disponibilidad parcial", odometer: "24.600 km", fuel: "58%", nextService: "10/03/2026", risk: "Medio" },
  { unit: "SAN-MCY-011", zone: "Maracay", model: "Empire Horse 150", operator: "Carlos Peña", contract: "Abastos del Centro", status: "Operativa con seguimiento", odometer: "17.330 km", fuel: "74%", nextService: "12/03/2026", risk: "Bajo" },
];

const fleetComplianceBoard = [
  { label: "Pólizas por vencer", value: 7, note: "3 unidades vencen antes de 10 días", tone: "amber" },
  { label: "GPS fuera de línea", value: 4, note: "2 equipos concentrados en Caracas", tone: "rose" },
  { label: "Documentación al día", value: 289, note: "96.3% del parque con expedientes completos", tone: "emerald" },
  { label: "Auditorías cerradas", value: 12, note: "Sin hallazgos críticos en la semana", tone: "sky" },
];

const fleetExecutiveAlerts = [
  "Caracas concentra el mayor volumen de taller abierto y requiere redistribución de unidades de respaldo.",
  "Mérida mantiene la mejor disponibilidad operativa y puede absorber rutas extraordinarias esta semana.",
  "El costo correctivo de marzo subió por repuestos de frenos y suspensión en unidades comerciales.",
  "Se recomienda cerrar 4 tickets de prioridad alta antes del próximo corte de contratos corporativos.",
];

const contracts = [
  {
    id: "SAN-CT-221",
    client: "Comercial Los Andes",
    company: "Comercial Los Andes C.A.",
    representative: "Rafael Mendoza",
    representativeCedula: "18422109",
    associatedCedulas: ["32464663"],
    role: "Director general",
    photo: "/Documentos/Identificacion principal.jpeg",
    contractFile: "/Documentos/Contratos.jpeg",
    annexFile: "/Documentos/Contratos escaniado.jpeg",
    amountUsd: 12500,
    status: "Aprobado",
    unit: "Yamaha XTZ 150 · 12 unidades",
    segment: "Retail corporativo",
    zone: "Mérida",
    executive: "Daniela Peña",
    signedAt: "12/01/2026",
    renewalAt: "12/01/2027",
    termMonths: 12,
    documentsPct: 100,
    billingCycle: "Mensual",
    risk: "Bajo",
    legalStage: "Protocolizado",
    signatures: [
      { name: "Rafael Mendoza", role: "Representante legal", side: "Cliente", status: "Firmado", date: "12/01/2026" },
      { name: "Mariana Rojas", role: "Consultora jurídica SAN", side: "SAN", status: "Firmado", date: "12/01/2026" },
    ],
    clauses: ["Garantía mobiliaria registrada", "Cobertura de mantenimiento preventivo", "Facturación mensual"],
    legalNote: "Expediente completo y con anexos suscritos por ambas partes.",
  },
  {
    id: "SAN-CT-228",
    client: "Distribuidora El Vigía",
    company: "Distribuidora El Vigía 2020, C.A.",
    representative: "Alexandra Molina",
    representativeCedula: "20118432",
    associatedCedulas: [],
    role: "Apoderada mercantil",
    photo: "/Documentos/Identificacion principal.jpeg",
    contractFile: "/Documentos/Contratos escaniado.jpeg",
    annexFile: "/Documentos/Contratos.jpeg",
    amountUsd: 8240,
    status: "Pendiente",
    unit: "Bera SBR 150 · 8 unidades",
    segment: "Distribución",
    zone: "Mérida",
    executive: "Miguel Dávila",
    signedAt: "18/02/2026",
    renewalAt: "18/02/2027",
    termMonths: 12,
    documentsPct: 82,
    billingCycle: "Quincenal",
    risk: "Medio",
    legalStage: "Pendiente de firma comercial",
    signatures: [
      { name: "Alexandra Molina", role: "Apoderada mercantil", side: "Cliente", status: "Firmado", date: "18/02/2026" },
      { name: "Miguel Dávila", role: "Ejecutivo corporativo", side: "SAN", status: "Pendiente", date: "—" },
    ],
    clauses: ["Cronograma quincenal", "Penalidad por mora comercial", "Acta de entrega pendiente"],
    legalNote: "Falta cierre de firma interna y validación final del cronograma financiero.",
  },
  {
    id: "SAN-CT-235",
    client: "Servicios Andinos 24",
    company: "Servicios Andinos 24, S.R.L.",
    representative: "Luis Gerardo Peña",
    representativeCedula: "17653284",
    associatedCedulas: [],
    role: "Socio administrador",
    photo: "/Documentos/Identificacion principal.jpeg",
    contractFile: "/Documentos/Contratos.jpeg",
    annexFile: "/Documentos/Contratos escaniado.jpeg",
    amountUsd: 15930,
    status: "Aprobado",
    unit: "Honda XR 190 · 10 unidades",
    segment: "Servicio técnico",
    zone: "Caracas",
    executive: "Laura Contreras",
    signedAt: "03/02/2026",
    renewalAt: "03/02/2027",
    termMonths: 18,
    documentsPct: 96,
    billingCycle: "Mensual",
    risk: "Bajo",
    legalStage: "Vigente con anexos",
    signatures: [
      { name: "Luis Gerardo Peña", role: "Socio administrador", side: "Cliente", status: "Firmado", date: "03/02/2026" },
      { name: "Laura Contreras", role: "Gerencia comercial SAN", side: "SAN", status: "Firmado", date: "03/02/2026" },
    ],
    clauses: ["Cobertura multi-sede", "Mantenimiento por kilometraje", "Seguro incluido en canon"],
    legalNote: "Contrato operativo sin observaciones y con vigencia extendida a 18 meses.",
  },
  {
    id: "SAN-CT-240",
    client: "Flota Industrial Occidente",
    company: "Flota Industrial Occidente, C.A.",
    representative: "Carmen Villasmil",
    representativeCedula: "22318041",
    associatedCedulas: [],
    role: "Gerente de compras",
    photo: "/Documentos/Identificacion principal.jpeg",
    contractFile: "/Documentos/Contratos escaniado.jpeg",
    annexFile: "/Documentos/Contratos.jpeg",
    amountUsd: 22170,
    status: "Revisión",
    unit: "Suzuki GN 125 · 15 unidades",
    segment: "Industrial",
    zone: "Valencia",
    executive: "José Dugarte",
    signedAt: "27/02/2026",
    renewalAt: "27/02/2027",
    termMonths: 24,
    documentsPct: 74,
    billingCycle: "Mensual",
    risk: "Medio",
    legalStage: "Observaciones jurídicas abiertas",
    signatures: [
      { name: "Carmen Villasmil", role: "Gerente de compras", side: "Cliente", status: "Firmado", date: "27/02/2026" },
      { name: "José Dugarte", role: "Dirección comercial SAN", side: "SAN", status: "En revisión", date: "—" },
    ],
    clauses: ["Anexo de garantías pendiente", "Ajuste de cláusula de reposición", "Entrega escalonada por lote"],
    legalNote: "Se requiere subsanar observación sobre cobertura de reposición y anexar garantía financiera.",
  },
  {
    id: "SAN-CT-244",
    client: "Logística Capital Express",
    company: "Logística Capital Express, S.A.",
    representative: "María Fernanda Ruiz",
    representativeCedula: "19288415",
    associatedCedulas: [],
    role: "Directora de operaciones",
    photo: "/Documentos/Identificacion principal.jpeg",
    contractFile: "/Documentos/Contratos.jpeg",
    annexFile: "/Documentos/Contratos escaniado.jpeg",
    amountUsd: 28640,
    status: "Aprobado",
    unit: "Honda XR 190 · 18 unidades",
    segment: "Última milla",
    zone: "Caracas",
    executive: "Daniela Peña",
    signedAt: "22/02/2026",
    renewalAt: "22/02/2027",
    termMonths: 24,
    documentsPct: 100,
    billingCycle: "Mensual",
    risk: "Bajo",
    legalStage: "Vigente y desembolsado",
    signatures: [
      { name: "María Fernanda Ruiz", role: "Directora de operaciones", side: "Cliente", status: "Firmado", date: "22/02/2026" },
      { name: "Daniela Peña", role: "Directora corporativa SAN", side: "SAN", status: "Firmado", date: "22/02/2026" },
    ],
    clauses: ["Despliegue por fases", "SLA premium", "Mantenimiento correctivo prioritario"],
    legalNote: "Cuenta estratégica priorizada por dirección con contrato completamente firmado y protocolizado.",
  },
  {
    id: "SAN-CT-251",
    client: "Agroinsumos La Villa",
    company: "Agroinsumos La Villa, C.A.",
    representative: "Nelson Paredes",
    representativeCedula: "16870231",
    associatedCedulas: [],
    role: "Administrador",
    photo: "/Documentos/Identificacion principal.jpeg",
    contractFile: "/Documentos/Contratos escaniado.jpeg",
    annexFile: "/Documentos/Contratos.jpeg",
    amountUsd: 11480,
    status: "Pendiente",
    unit: "Empire Horse 150 · 9 unidades",
    segment: "Agroindustrial",
    zone: "Barinas",
    executive: "Miguel Dávila",
    signedAt: "01/03/2026",
    renewalAt: "01/03/2027",
    termMonths: 12,
    documentsPct: 69,
    billingCycle: "Mensual",
    risk: "Alto",
    legalStage: "En comité de crédito",
    signatures: [
      { name: "Nelson Paredes", role: "Administrador", side: "Cliente", status: "Firmado", date: "01/03/2026" },
      { name: "Comité de crédito SAN", role: "Validación de riesgo", side: "SAN", status: "Pendiente", date: "—" },
    ],
    clauses: ["Garantía agrocomercial", "Validación de flujo 2025", "Cobertura de seguro por confirmar"],
    legalNote: "El expediente presenta brechas documentales y está condicionado al cierre del análisis financiero.",
  },
];

const contractCompanyLedger = [
  { label: "Contratos históricos", value: 148, note: "Acumulado corporativo desde el inicio de operación" },
  { label: "Contratos vigentes", value: 126, note: "Relaciones activas con soporte jurídico y comercial" },
  { label: "Contratos 2026", value: 19, note: "Cierres formalizados durante el ejercicio actual" },
  { label: "Firmas registradas", value: 264, note: "Firmas entre cliente, SAN y anexos complementarios" },
];

const contractLegalDesk = [
  { title: "Matriz societaria verificada", detail: "94% de clientes con poderes mercantiles y RIF actualizados.", tone: "emerald" },
  { title: "Observaciones abiertas", detail: "3 expedientes requieren adenda, garantía o actualización de firmas.", tone: "amber" },
  { title: "Expedientes en resguardo", detail: "Todos los contratos aprobados tienen respaldo escaneado y folio interno.", tone: "sky" },
];

const contractRevenueTrend = [
  { month: "Oct", cartera: 68200, cierres: 5, renovaciones: 2 },
  { month: "Nov", cartera: 71450, cierres: 6, renovaciones: 3 },
  { month: "Dic", cartera: 75620, cierres: 7, renovaciones: 3 },
  { month: "Ene", cartera: 81240, cierres: 8, renovaciones: 4 },
  { month: "Feb", cartera: 86930, cierres: 9, renovaciones: 4 },
  { month: "Mar", cartera: 98960, cierres: 10, renovaciones: 5 },
];

const contractApprovalQueue = [
  { id: "AP-041", client: "Flota Industrial Occidente", stage: "Revisión legal", owner: "Consultoría Jurídica", sla: "6 h", blocker: "Anexo de garantías", priority: "Alta" },
  { id: "AP-044", client: "Agroinsumos La Villa", stage: "Validación financiera", owner: "Tesorería", sla: "1 día", blocker: "Estados financieros 2025", priority: "Alta" },
  { id: "AP-047", client: "Distribuidora El Vigía", stage: "Firma comercial", owner: "Dirección comercial", sla: "4 h", blocker: "Ajuste de cronograma", priority: "Media" },
  { id: "AP-051", client: "Grupo Centro Logístico", stage: "Comité de crédito", owner: "Riesgo", sla: "2 días", blocker: "Scoring sectorial", priority: "Media" },
];

const contractRenewalBoard = [
  { client: "Comercial Los Andes", renewalAt: "12/01/2027", value: 12500, probability: 92, executive: "Daniela Peña", health: "Sólido" },
  { client: "Servicios Andinos 24", renewalAt: "03/02/2027", value: 15930, probability: 88, executive: "Laura Contreras", health: "Sólido" },
  { client: "Logística Capital Express", renewalAt: "22/02/2027", value: 28640, probability: 84, executive: "Daniela Peña", health: "Estable" },
  { client: "Agroinsumos La Villa", renewalAt: "01/03/2027", value: 11480, probability: 58, executive: "Miguel Dávila", health: "En riesgo" },
];

const contractExecutiveAlerts = [
  "Dos expedientes corporativos siguen bloqueados por anexos de garantías y retrasan el cierre de marzo.",
  "La cartera contractual crece con fuerza en Caracas, pero exige mayor capacidad legal para sostener el ritmo de aprobación.",
  "El segmento agroindustrial presenta la mayor fricción documental y requiere seguimiento comercial reforzado.",
  "Las renovaciones de alto valor se concentran en cuentas con comportamiento estable y alto potencial de upsell.",
];

const alertsBase = [
  "Riesgo alto en cartera de zona Caracas por retraso > 20 días.",
  "Unidad TX-200 #A33 en mantenimiento preventivo finalizado.",
  "Contrato SAN-CT-240 requiere segunda firma digital.",
  "Tesorería confirma cierre de lote de cobros 09:30 AM.",
];

const initialInstruments: Instrument[] = [
  { symbol: "CUOTA/ACT", value: 1.0854, change: 0.2, trend: "up", series: [30, 33, 31, 36, 44, 42], format: "decimal4" },
  { symbol: "MORA/RIESGO", value: 1.2671, change: -0.1, trend: "down", series: [44, 41, 43, 35, 32, 30], format: "decimal4" },
  { symbol: "PAGO/HORA", value: 148.12, change: 0.5, trend: "up", series: [20, 25, 27, 35, 41, 45], format: "decimal2" },
  { symbol: "COBRO/BANK", value: 0.658, change: -0.3, trend: "down", series: [38, 36, 30, 30, 24, 21], format: "decimal4" },
  { symbol: "META MENSUAL", value: 2024.5, change: 1.1, trend: "up", series: [16, 24, 31, 29, 36, 38], format: "decimal2" },
  { symbol: "PROM. CUOTA", value: 22.84, change: 0.8, trend: "up", series: [18, 22, 27, 26, 29, 32], format: "decimal2" },
  { symbol: "DEUDA TOTAL", value: 73.2, change: -1.5, trend: "down", series: [45, 36, 39, 30, 24, 27], format: "decimal2" },
  { symbol: "RIESGO 10Y", value: 4.12, change: -0.04, trend: "down", series: [42, 36, 34, 39, 30, 25], format: "percent2" },
];

const allocationData = [
  { name: "Cobranza", value: 38, color: "#22c55e" },
  { name: "Garantía", value: 26, color: "#16a34a" },
  { name: "Mora", value: 21, color: "#ef4444" },
  { name: "Operación", value: 15, color: "#b91c1c" },
];

const liquidityData = [
  { name: "Transferencia", value: 52, color: "#22c55e" },
  { name: "Pago móvil", value: 30, color: "#16a34a" },
  { name: "Zelle", value: 10, color: "#ef4444" },
  { name: "Efectivo", value: 8, color: "#b91c1c" },
];

const initialTreasuryFlow = [
  { slot: "09:00", ingresos: 8.2, egresos: 4.1 },
  { slot: "10:00", ingresos: 9.1, egresos: 4.6 },
  { slot: "11:00", ingresos: 8.8, egresos: 4.4 },
  { slot: "12:00", ingresos: 10.2, egresos: 4.9 },
  { slot: "13:00", ingresos: 9.9, egresos: 5.1 },
  { slot: "14:00", ingresos: 10.6, egresos: 5.2 },
];

const initialMotoMarketFeed: MarketFeedItem[] = [
  { id: "mk-1", label: "Yamaha / Prom. nacional", value: "$2,940", change: 0.8 },
  { id: "mk-2", label: "Bera / 150cc", value: "$1,480", change: -0.6 },
  { id: "mk-3", label: "Empire / Utilitaria", value: "$1,920", change: 0.4 },
  { id: "mk-4", label: "Suzuki / Distribución", value: "$3,180", change: 1.1 },
  { id: "mk-5", label: "Kawasaki / Alta gama", value: "$6,240", change: -0.5 },
  { id: "mk-6", label: "Honda / Ciudad", value: "$2,860", change: 0.9 },
  { id: "mk-7", label: "Keeway / Comercial", value: "$1,760", change: -0.3 },
];

const initialAgencyMarketRows: AgencyMarketRow[] = [
  { agency: "SAN Motors Mérida", state: "Mérida", brand: "Yamaha", model: "FZ 2.0", priceUsd: 3250, variation: 1.4, stock: 18 },
  { agency: "SAN Motors Caracas", state: "Caracas", brand: "Honda", model: "CB 190R", priceUsd: 4120, variation: -0.9, stock: 11 },
  { agency: "SAN Motors Valencia", state: "Carabobo", brand: "Suzuki", model: "GN 125", priceUsd: 2680, variation: -1.2, stock: 26 },
  { agency: "SAN Motors Maracaibo", state: "Zulia", brand: "Bera", model: "BR-150", priceUsd: 1710, variation: 0.6, stock: 31 },
  { agency: "SAN Motors Barinas", state: "Barinas", brand: "Empire", model: "Horse 150", priceUsd: 1890, variation: -0.7, stock: 23 },
  { agency: "SAN Motors Lechería", state: "Anzoátegui", brand: "Keeway", model: "RK 200", priceUsd: 2240, variation: 0.5, stock: 15 },
];

const releaseBaseData = [
  { year: "2020", actual: 820, survey: 860 },
  { year: "2021", actual: 900, survey: 880 },
  { year: "2022", actual: 980, survey: 950 },
  { year: "2023", actual: 1120, survey: 1080 },
  { year: "2024", actual: 1210, survey: 1185 },
  { year: "2025", actual: 1290, survey: 1268 },
];

const initialMovementSeries: MovementPoint[] = [
  { slot: "09:00", index: 4769.8 },
  { slot: "10:00", index: 4781.2 },
  { slot: "11:00", index: 4758.4 },
  { slot: "12:00", index: 4729.6 },
  { slot: "13:00", index: 4746.1 },
  { slot: "14:00", index: 4780.3 },
  { slot: "15:00", index: 4839.8 },
];

const cuotaMonitorClients: CuotaMonitorClient[] = [
  {
    id: "cl-001",
    nombre: "José Hernández",
    documento: "V-32.464.663",
    telefono: "0412-815-2201",
    agencia: "SAN Mérida Centro",
    gestor: "Mariana Uzcátegui",
    estado: "Con atraso",
    cuotasPendientes: 7,
    cuotasVencidas: 2,
    saldo: 1180,
    proximoVencimiento: "14/03/2026",
  },
  {
    id: "cl-002",
    nombre: "Andrea Suárez",
    documento: "V-18.230.144",
    telefono: "0414-630-9921",
    agencia: "SAN Ejido",
    gestor: "Carlos Rivas",
    estado: "Al día",
    cuotasPendientes: 4,
    cuotasVencidas: 0,
    saldo: 540,
    proximoVencimiento: "21/03/2026",
  },
  {
    id: "cl-003",
    nombre: "Pedro Colina",
    documento: "V-9.443.512",
    telefono: "0424-703-4450",
    agencia: "SAN El Vigía",
    gestor: "Mariana Uzcátegui",
    estado: "Riesgo",
    cuotasPendientes: 9,
    cuotasVencidas: 4,
    saldo: 1725,
    proximoVencimiento: "10/03/2026",
  },
  {
    id: "cl-004",
    nombre: "Lucía Montilla",
    documento: "V-22.019.334",
    telefono: "0416-508-1198",
    agencia: "SAN Mérida Centro",
    gestor: "Joel Briceño",
    estado: "Con atraso",
    cuotasPendientes: 6,
    cuotasVencidas: 1,
    saldo: 960,
    proximoVencimiento: "12/03/2026",
  },
  {
    id: "cl-005",
    nombre: "Karla Peña",
    documento: "V-16.272.809",
    telefono: "0426-776-0042",
    agencia: "SAN Tovar",
    gestor: "Carlos Rivas",
    estado: "Al día",
    cuotasPendientes: 3,
    cuotasVencidas: 0,
    saldo: 430,
    proximoVencimiento: "25/03/2026",
  },
  {
    id: "cl-006",
    nombre: "Alexis Ruiz",
    documento: "V-32.146.663",
    telefono: "0424-555-1280",
    agencia: "SAN Ejido",
    gestor: "Daniela Rojas",
    estado: "Al día",
    cuotasPendientes: 2,
    cuotasVencidas: 0,
    saldo: 210,
    proximoVencimiento: "28/03/2026",
  },
  {
    id: "cl-007",
    nombre: "María Fernanda Gil",
    documento: "V-25.881.420",
    telefono: "0414-222-8741",
    agencia: "SAN Mérida Centro",
    gestor: "Joel Briceño",
    estado: "Con atraso",
    cuotasPendientes: 5,
    cuotasVencidas: 2,
    saldo: 880,
    proximoVencimiento: "11/03/2026",
  },
  {
    id: "cl-008",
    nombre: "Luis Quintero",
    documento: "V-19.774.531",
    telefono: "0412-908-7732",
    agencia: "SAN Tovar",
    gestor: "Carlos Rivas",
    estado: "Al día",
    cuotasPendientes: 3,
    cuotasVencidas: 0,
    saldo: 360,
    proximoVencimiento: "30/03/2026",
  },
  {
    id: "cl-009",
    nombre: "Ana Rosales",
    documento: "V-21.448.992",
    telefono: "0426-331-9840",
    agencia: "SAN El Vigía",
    gestor: "Mariana Uzcátegui",
    estado: "Riesgo",
    cuotasPendientes: 8,
    cuotasVencidas: 3,
    saldo: 1490,
    proximoVencimiento: "09/03/2026",
  },
  {
    id: "cl-010",
    nombre: "Daniel Vivas",
    documento: "V-28.104.667",
    telefono: "0416-778-2140",
    agencia: "SAN Mérida Centro",
    gestor: "Daniela Rojas",
    estado: "Al día",
    cuotasPendientes: 4,
    cuotasVencidas: 0,
    saldo: 495,
    proximoVencimiento: "02/04/2026",
  },
  {
    id: "cl-011",
    nombre: "Carmen Albarrán",
    documento: "V-17.630.281",
    telefono: "0414-960-0014",
    agencia: "SAN Ejido",
    gestor: "Carlos Rivas",
    estado: "Con atraso",
    cuotasPendientes: 6,
    cuotasVencidas: 1,
    saldo: 730,
    proximoVencimiento: "13/03/2026",
  },
  {
    id: "cl-012",
    nombre: "Roberto Salas",
    documento: "V-14.552.603",
    telefono: "0424-118-4092",
    agencia: "SAN Tovar",
    gestor: "Joel Briceño",
    estado: "Al día",
    cuotasPendientes: 1,
    cuotasVencidas: 0,
    saldo: 120,
    proximoVencimiento: "18/04/2026",
  },
];

const cuotaMonitorInstallments: CuotaMonitorInstallment[] = [
  { id: "c001", clientId: "cl-001", semana: 9, numero: 9, tipo: "Regular", vence: "14/03/2026", monto: 35, recargo: 0, estado: "Por vencer" },
  { id: "c002", clientId: "cl-001", semana: 10, numero: 10, tipo: "Regular", vence: "21/03/2026", monto: 40, recargo: 0, estado: "Pendiente" },
  { id: "c003", clientId: "cl-001", semana: 11, numero: 11, tipo: "Regular", vence: "28/03/2026", monto: 40, recargo: 0, estado: "Pendiente" },
  { id: "c004", clientId: "cl-001", semana: 12, numero: 12, tipo: "Regular", vence: "04/04/2026", monto: 40, recargo: 0, estado: "Pendiente" },
  { id: "c005", clientId: "cl-001", semana: 13, numero: 13, tipo: "Regular", vence: "11/04/2026", monto: 30, recargo: 0, estado: "Pendiente" },
  { id: "c006", clientId: "cl-003", semana: 22, numero: 22, tipo: "Regular", vence: "08/03/2026", monto: 55, recargo: 0, estado: "Por vencer" },
  { id: "c007", clientId: "cl-003", semana: 23, numero: 23, tipo: "Regular", vence: "15/03/2026", monto: 55, recargo: 0, estado: "Pendiente" },
  { id: "c008", clientId: "cl-003", semana: 24, numero: 24, tipo: "Regular", vence: "22/03/2026", monto: 50, recargo: 0, estado: "Pendiente" },
  { id: "c009", clientId: "cl-004", semana: 31, numero: 31, tipo: "Regular", vence: "12/03/2026", monto: 35, recargo: 0, estado: "Por vencer" },
  { id: "c010", clientId: "cl-004", semana: 32, numero: 32, tipo: "Regular", vence: "19/03/2026", monto: 35, recargo: 0, estado: "Pendiente" },
  { id: "c011", clientId: "cl-002", semana: 14, numero: 14, tipo: "Regular", vence: "21/03/2026", monto: 30, recargo: 0, estado: "Por vencer" },
  { id: "c012", clientId: "cl-005", semana: 18, numero: 18, tipo: "Regular", vence: "25/03/2026", monto: 30, recargo: 0, estado: "Por vencer" },
];

const cuotaMonitorProfiles: Record<string, CuotaMonitorProfile> = {
  "cl-001": {
    clientId: "cl-001",
    cedula: "32464663",
    fotoPersona: "/Documentos/Identificacion principal.jpeg",
    fotoCedula: "/Documentos/Cedula de Identidad .jpeg",
    fotoRif: "/Documentos/Documentos RiF.jpeg",
    direccion: "Av. Las Américas, Mérida · Residencias El Parque, piso 2",
    ocupacion: "Supervisor de logística",
    empresa: "Transporte Andino, C.A.",
    fechaIngreso: "12/01/2025",
    motoMarca: "Escuda",
    motoModelo: "EM200",
    motoImagen: "/Documentos/escuda-em200.png",
    plan: "Plan Productivo 24 meses",
    cuotaMensual: 85,
    cuotasTotales: 24,
    cuotasPagadas: 17,
    contratos: [
      { id: "SAN-MER-CT-441", tipo: "Compraventa financiada", fecha: "12/01/2025", monto: 2040, estado: "Vigente", archivo: "/Documentos/Contratos.jpeg" },
      { id: "SAN-MER-ANX-441A", tipo: "Anexo de garantía", fecha: "12/01/2025", monto: 0, estado: "Firmado", archivo: "/Documentos/Contratos escaniado.jpeg" },
    ],
    documentos: [
      { id: "DOC-01", nombre: "Factura de compra", tipo: "Fiscal", fecha: "12/01/2025", archivo: "/Documentos/Factura.jpeg" },
      { id: "DOC-02", nombre: "RIF vigente", tipo: "Tributario", fecha: "10/02/2026", archivo: "/Documentos/Documentos RiF.jpeg" },
      { id: "DOC-03", nombre: "Cédula de identidad", tipo: "Identificación", fecha: "12/01/2025", archivo: "/Documentos/Foto de la cedula.jpeg" },
    ],
  },
  "cl-002": {
    clientId: "cl-002",
    cedula: "18230144",
    fotoPersona: "/Documentos/Identificacion principal.jpeg",
    fotoCedula: "/Documentos/Cedula de Identidad .jpeg",
    fotoRif: "/Documentos/Documentos RiF.jpeg",
    direccion: "Sector Montalbán, Ejido · Casa 14",
    ocupacion: "Comerciante",
    empresa: "Inversiones La Rivera",
    fechaIngreso: "08/06/2025",
    motoMarca: "Bera",
    motoModelo: "GBR 200",
    motoImagen: "/Bera GBR 200cc.png",
    plan: "Plan Comercial 18 meses",
    cuotaMensual: 78,
    cuotasTotales: 18,
    cuotasPagadas: 14,
    contratos: [
      { id: "SAN-EJD-CT-217", tipo: "Compraventa financiada", fecha: "08/06/2025", monto: 1690, estado: "Vigente", archivo: "/Documentos/Contratos.jpeg" },
    ],
    documentos: [
      { id: "DOC-11", nombre: "Factura de compra", tipo: "Fiscal", fecha: "08/06/2025", archivo: "/Documentos/Factura.jpeg" },
      { id: "DOC-12", nombre: "RIF vigente", tipo: "Tributario", fecha: "12/01/2026", archivo: "/Documentos/Documentos RiF.jpeg" },
    ],
  },
  "cl-003": {
    clientId: "cl-003",
    cedula: "9443512",
    fotoPersona: "/Documentos/Identificacion principal.jpeg",
    fotoCedula: "/Documentos/Cedula de Identidad .jpeg",
    fotoRif: "/Documentos/Documentos RiF.jpeg",
    direccion: "Urb. El Bosque, El Vigía · Torre B apto 6",
    ocupacion: "Técnico mecánico",
    empresa: "Servicios del Sur 24",
    fechaIngreso: "19/03/2024",
    motoMarca: "TX",
    motoModelo: "TX 200",
    motoImagen: "/TX 200.png",
    plan: "Plan Industrial 30 meses",
    cuotaMensual: 92,
    cuotasTotales: 30,
    cuotasPagadas: 21,
    contratos: [
      { id: "SAN-VIG-CT-080", tipo: "Compraventa financiada", fecha: "19/03/2024", monto: 2380, estado: "En revisión", archivo: "/Documentos/Contratos escaniado.jpeg" },
    ],
    documentos: [
      { id: "DOC-21", nombre: "Cédula de identidad", tipo: "Identificación", fecha: "19/03/2024", archivo: "/Documentos/Foto de la cedula.jpeg" },
      { id: "DOC-22", nombre: "Factura", tipo: "Fiscal", fecha: "19/03/2024", archivo: "/Documentos/Factura.jpeg" },
    ],
  },
  "cl-004": {
    clientId: "cl-004",
    cedula: "22019334",
    fotoPersona: "/Documentos/Identificacion principal.jpeg",
    fotoCedula: "/Documentos/Cedula de Identidad .jpeg",
    fotoRif: "/Documentos/Documentos RiF.jpeg",
    direccion: "Av. Urdaneta, Mérida · Centro",
    ocupacion: "Asistente administrativa",
    empresa: "Distribuidora Occidente",
    fechaIngreso: "15/09/2025",
    motoMarca: "Keeway",
    motoModelo: "Xpress II",
    motoImagen: "/eK Xpress II.png",
    plan: "Plan Emprendedor 20 meses",
    cuotaMensual: 74,
    cuotasTotales: 20,
    cuotasPagadas: 14,
    contratos: [
      { id: "SAN-MER-CT-384", tipo: "Compraventa financiada", fecha: "15/09/2025", monto: 1580, estado: "Vigente", archivo: "/Documentos/Contratos.jpeg" },
    ],
    documentos: [
      { id: "DOC-31", nombre: "RIF vigente", tipo: "Tributario", fecha: "15/09/2025", archivo: "/Documentos/Documentos RiF.jpeg" },
    ],
  },
  "cl-005": {
    clientId: "cl-005",
    cedula: "16272809",
    fotoPersona: "/Documentos/Identificacion principal.jpeg",
    fotoCedula: "/Documentos/Cedula de Identidad .jpeg",
    fotoRif: "/Documentos/Documentos RiF.jpeg",
    direccion: "Calle 7, Tovar · Local 3",
    ocupacion: "Emprendedora",
    empresa: "KP Comercial",
    fechaIngreso: "04/11/2025",
    motoMarca: "House",
    motoModelo: "II SE",
    motoImagen: "/HOUSE II SE.png",
    plan: "Plan PyME 16 meses",
    cuotaMensual: 68,
    cuotasTotales: 16,
    cuotasPagadas: 13,
    contratos: [
      { id: "SAN-TOV-CT-113", tipo: "Compraventa financiada", fecha: "04/11/2025", monto: 1415, estado: "Vigente", archivo: "/Documentos/Contratos.jpeg" },
    ],
    documentos: [
      { id: "DOC-41", nombre: "Factura", tipo: "Fiscal", fecha: "04/11/2025", archivo: "/Documentos/Factura.jpeg" },
    ],
  },
  "cl-006": {
    clientId: "cl-006",
    cedula: "32146663",
    fotoPersona: "/Documentos/Identificacion principal.jpeg",
    fotoCedula: "/Documentos/Cedula de Identidad .jpeg",
    fotoRif: "/Documentos/Documentos RiF.jpeg",
    direccion: "Ejido · Residencias Campo Claro, torre 1",
    ocupacion: "Analista administrativo",
    empresa: "Grupo Ruiz Servicios",
    fechaIngreso: "18/10/2025",
    motoMarca: "Bera",
    motoModelo: "GBR 200",
    motoImagen: "/Bera GBR 200cc.png",
    plan: "Plan Ejecutivo 14 meses",
    cuotaMensual: 70,
    cuotasTotales: 14,
    cuotasPagadas: 12,
    contratos: [
      { id: "SAN-EJD-CT-332", tipo: "Compraventa financiada", fecha: "18/10/2025", monto: 1290, estado: "Vigente", archivo: "/Documentos/Contratos.jpeg" },
    ],
    documentos: [
      { id: "DOC-51", nombre: "Factura", tipo: "Fiscal", fecha: "18/10/2025", archivo: "/Documentos/Factura.jpeg" },
      { id: "DOC-52", nombre: "RIF vigente", tipo: "Tributario", fecha: "05/01/2026", archivo: "/Documentos/Documentos RiF.jpeg" },
    ],
  },
  "cl-007": {
    clientId: "cl-007",
    cedula: "25881420",
    fotoPersona: "/Documentos/Identificacion principal.jpeg",
    fotoCedula: "/Documentos/Cedula de Identidad .jpeg",
    fotoRif: "/Documentos/Documentos RiF.jpeg",
    direccion: "Mérida · Urbanización Humboldt, casa 18",
    ocupacion: "Coordinadora de ventas",
    empresa: "Distribuciones MG 2024",
    fechaIngreso: "06/07/2025",
    motoMarca: "House",
    motoModelo: "II SE",
    motoImagen: "/HOUSE II SE.png",
    plan: "Plan Comercial 18 meses",
    cuotaMensual: 73,
    cuotasTotales: 18,
    cuotasPagadas: 11,
    contratos: [
      { id: "SAN-MER-CT-552", tipo: "Compraventa financiada", fecha: "06/07/2025", monto: 1510, estado: "Vigente", archivo: "/Documentos/Contratos.jpeg" },
    ],
    documentos: [
      { id: "DOC-61", nombre: "Factura", tipo: "Fiscal", fecha: "06/07/2025", archivo: "/Documentos/Factura.jpeg" },
      { id: "DOC-62", nombre: "Cédula de identidad", tipo: "Identificación", fecha: "06/07/2025", archivo: "/Documentos/Cedula de Identidad .jpeg" },
    ],
  },
  "cl-008": {
    clientId: "cl-008",
    cedula: "19774531",
    fotoPersona: "/Documentos/Identificacion principal.jpeg",
    fotoCedula: "/Documentos/Cedula de Identidad .jpeg",
    fotoRif: "/Documentos/Documentos RiF.jpeg",
    direccion: "Tovar · Sector El Llano, casa 5",
    ocupacion: "Técnico de campo",
    empresa: "Servicios Quintero C.A.",
    fechaIngreso: "24/09/2025",
    motoMarca: "Escuda",
    motoModelo: "EM200",
    motoImagen: "/Documentos/escuda-em200.png",
    plan: "Plan Productivo 15 meses",
    cuotaMensual: 66,
    cuotasTotales: 15,
    cuotasPagadas: 12,
    contratos: [
      { id: "SAN-TOV-CT-210", tipo: "Compraventa financiada", fecha: "24/09/2025", monto: 1360, estado: "Vigente", archivo: "/Documentos/Contratos.jpeg" },
    ],
    documentos: [
      { id: "DOC-71", nombre: "Factura", tipo: "Fiscal", fecha: "24/09/2025", archivo: "/Documentos/Factura.jpeg" },
      { id: "DOC-72", nombre: "RIF vigente", tipo: "Tributario", fecha: "11/02/2026", archivo: "/Documentos/Documentos RiF.jpeg" },
    ],
  },
  "cl-009": {
    clientId: "cl-009",
    cedula: "21448992",
    fotoPersona: "/Documentos/Identificacion principal.jpeg",
    fotoCedula: "/Documentos/Cedula de Identidad .jpeg",
    fotoRif: "/Documentos/Documentos RiF.jpeg",
    direccion: "El Vigía · Av. Don Pepe Rojas, local 2",
    ocupacion: "Emprendedora",
    empresa: "Rosales Repuestos",
    fechaIngreso: "12/05/2025",
    motoMarca: "TX",
    motoModelo: "TX 200",
    motoImagen: "/TX 200.png",
    plan: "Plan Industrial 24 meses",
    cuotaMensual: 88,
    cuotasTotales: 24,
    cuotasPagadas: 13,
    contratos: [
      { id: "SAN-VIG-CT-144", tipo: "Compraventa financiada", fecha: "12/05/2025", monto: 2110, estado: "Vigente", archivo: "/Documentos/Contratos escaniado.jpeg" },
    ],
    documentos: [
      { id: "DOC-81", nombre: "Factura", tipo: "Fiscal", fecha: "12/05/2025", archivo: "/Documentos/Factura.jpeg" },
      { id: "DOC-82", nombre: "RIF vigente", tipo: "Tributario", fecha: "22/01/2026", archivo: "/Documentos/Documentos RiF.jpeg" },
    ],
  },
  "cl-010": {
    clientId: "cl-010",
    cedula: "28104667",
    fotoPersona: "/Documentos/Identificacion principal.jpeg",
    fotoCedula: "/Documentos/Cedula de Identidad .jpeg",
    fotoRif: "/Documentos/Documentos RiF.jpeg",
    direccion: "Mérida · Av. Las Tapias, edificio 4",
    ocupacion: "Asesor comercial",
    empresa: "Vivas Trading Group",
    fechaIngreso: "03/12/2025",
    motoMarca: "Keeway",
    motoModelo: "Xpress II",
    motoImagen: "/eK Xpress II.png",
    plan: "Plan Ejecutivo 18 meses",
    cuotaMensual: 77,
    cuotasTotales: 18,
    cuotasPagadas: 14,
    contratos: [
      { id: "SAN-MER-CT-601", tipo: "Compraventa financiada", fecha: "03/12/2025", monto: 1640, estado: "Vigente", archivo: "/Documentos/Contratos.jpeg" },
    ],
    documentos: [
      { id: "DOC-91", nombre: "Factura", tipo: "Fiscal", fecha: "03/12/2025", archivo: "/Documentos/Factura.jpeg" },
      { id: "DOC-92", nombre: "Cédula de identidad", tipo: "Identificación", fecha: "03/12/2025", archivo: "/Documentos/Cedula de Identidad .jpeg" },
    ],
  },
  "cl-011": {
    clientId: "cl-011",
    cedula: "17630281",
    fotoPersona: "/Documentos/Identificacion principal.jpeg",
    fotoCedula: "/Documentos/Cedula de Identidad .jpeg",
    fotoRif: "/Documentos/Documentos RiF.jpeg",
    direccion: "Ejido · Sector La Vega, casa 7",
    ocupacion: "Contadora",
    empresa: "Albarrán Consultores",
    fechaIngreso: "14/08/2025",
    motoMarca: "House",
    motoModelo: "II SE",
    motoImagen: "/HOUSE II SE.png",
    plan: "Plan PyME 18 meses",
    cuotaMensual: 69,
    cuotasTotales: 18,
    cuotasPagadas: 11,
    contratos: [
      { id: "SAN-EJD-CT-410", tipo: "Compraventa financiada", fecha: "14/08/2025", monto: 1450, estado: "Vigente", archivo: "/Documentos/Contratos.jpeg" },
    ],
    documentos: [
      { id: "DOC-101", nombre: "Factura", tipo: "Fiscal", fecha: "14/08/2025", archivo: "/Documentos/Factura.jpeg" },
      { id: "DOC-102", nombre: "RIF vigente", tipo: "Tributario", fecha: "16/01/2026", archivo: "/Documentos/Documentos RiF.jpeg" },
    ],
  },
  "cl-012": {
    clientId: "cl-012",
    cedula: "14552603",
    fotoPersona: "/Documentos/Identificacion principal.jpeg",
    fotoCedula: "/Documentos/Cedula de Identidad .jpeg",
    fotoRif: "/Documentos/Documentos RiF.jpeg",
    direccion: "Tovar · Urb. Los Pinos, quinta 9",
    ocupacion: "Transportista",
    empresa: "Salas Encomiendas",
    fechaIngreso: "09/01/2026",
    motoMarca: "Escuda",
    motoModelo: "EM200",
    motoImagen: "/Documentos/escuda-em200.png",
    plan: "Plan Logístico 12 meses",
    cuotaMensual: 64,
    cuotasTotales: 12,
    cuotasPagadas: 11,
    contratos: [
      { id: "SAN-TOV-CT-208", tipo: "Compraventa financiada", fecha: "09/01/2026", monto: 1190, estado: "Vigente", archivo: "/Documentos/Contratos.jpeg" },
    ],
    documentos: [
      { id: "DOC-111", nombre: "Factura", tipo: "Fiscal", fecha: "09/01/2026", archivo: "/Documentos/Factura.jpeg" },
      { id: "DOC-112", nombre: "Cédula de identidad", tipo: "Identificación", fecha: "09/01/2026", archivo: "/Documentos/Cedula de Identidad .jpeg" },
    ],
  },
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function moveSeries(series: number[], direction: "up" | "down") {
  const last = series[series.length - 1];
  const drift = direction === "up" ? 2 : -2;
  const next = clamp(last + drift + (Math.random() * 6 - 3), 10, 90);
  return [...series.slice(1), Number(next.toFixed(2))];
}

function sparklinePath(points: number[]) {
  const width = 220;
  const height = 52;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  return points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((point - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");
}

function formatInstrumentValue(instrument: Instrument) {
  if (instrument.format === "decimal4") {
    return instrument.value.toFixed(4);
  }

  if (instrument.format === "percent2") {
    return `${instrument.value.toFixed(2)}%`;
  }

  return instrument.value.toFixed(2);
}

function formatMoneyUSD(value: number) {
  return new Intl.NumberFormat("es-VE", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function normalizeCedula(value: string) {
  return value.replace(/\D/g, "");
}

// Formato de las claves de miembro: SAN-MEMBER-XXXXXX (6 caracteres A-Z/0-9).
const MEMBER_KEY_INPUT_PATTERN = /^SAN-MEMBER-[A-Z0-9]{6}$/;

function isCiclon83Plan(profile?: { cuotasTotales?: number; plan?: string } | null) {
  if (!profile) return false;
  if (Number(profile.cuotasTotales ?? 0) >= GROUP_CAPACITY_83) return true;
  return (profile.plan ?? "").toLowerCase().includes("83") || (profile.plan ?? "").toLowerCase().includes("ciclon");
}

function parseDateDMY(value: string) {
  const [day, month, year] = value.split("/").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function formatDateDMY(date: Date) {
  return new Intl.DateTimeFormat("es-VE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function addMonthsToDateLabel(value: string, monthsToAdd: number) {
  const nextDate = parseDateDMY(value);
  nextDate.setMonth(nextDate.getMonth() + monthsToAdd);
  return formatDateDMY(nextDate);
}

function formatIsoDateToDMY(value: string) {
  if (!value) return "—";

  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function daysOverdue(dmy: string) {
  const due = parseDateDMY(dmy);
  if (Number.isNaN(due.getTime())) return 0;

  return Math.floor((Date.now() - due.getTime()) / 86400000);
}

function ClientAvatar({
  name,
  photo,
  tone,
}: {
  name: string;
  photo?: string;
  tone: string;
}) {
  const [failed, setFailed] = useState(false);
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "—";
  const showPhoto = Boolean(photo) && !failed;

  return (
    <span
      className={`relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-sm font-semibold text-white ${tone}`}
    >
      {showPhoto ? (
        <Image
          src={photo as string}
          alt={name}
          width={48}
          height={48}
          unoptimized
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        initials
      )}
    </span>
  );
}

type MonitorFocusGroup = "atraso" | "aldia" | "todos";

function MonitorFocusPanel({
  group,
  clients,
  profiles,
  installments,
  search,
  onSearchChange,
  onClose,
  onOpenClient,
}: {
  group: MonitorFocusGroup;
  clients: CuotaMonitorClient[];
  profiles: Record<string, CuotaMonitorProfile>;
  installments: CuotaMonitorInstallment[];
  search: string;
  onSearchChange: (value: string) => void;
  onClose: () => void;
  onOpenClient: (clientId: string, target: "cuotas" | "expediente") => void;
}) {
  const totalVencidas = clients.reduce((acc, client) => acc + client.cuotasVencidas, 0);
  const saldoTotal = clients.reduce((acc, client) => acc + client.saldo, 0);
  const isAtraso = group === "atraso";
  const isAlDia = group === "aldia";
  const panelTitle = isAtraso ? "Clientes con retraso" : isAlDia ? "Clientes al día" : "Todos los clientes";

  function clientCedula(client: CuotaMonitorClient) {
    return profiles[client.id]?.cedula?.trim() || client.documento;
  }

  function handleExportCsv() {
    const header = ["Nombre", "Cedula", "Estado", "CuotasVencidas", "CuotasPendientes", "SaldoUSD", "ProximoVencimiento", "Telefono", "Grupo", "Gestor"];
    const rows = clients.map((client) => [
      client.nombre,
      clientCedula(client),
      client.estado,
      String(client.cuotasVencidas),
      String(client.cuotasPendientes),
      String(client.saldo),
      client.proximoVencimiento,
      client.telefono,
      client.agencia,
      client.gestor,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `monitor-${group}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handlePrint() {
    const rowsHtml = clients
      .map((client) => {
        const vencidas = installments
          .filter((item) => item.clientId === client.id && item.estado === "Vencida")
          .sort((first, second) => first.numero - second.numero)
          .map((item) => {
            const days = daysOverdue(item.vence);
            const style =
              days > 30
                ? "background:#dc2626;color:#fff;"
                : "background:#fee2e2;color:#b91c1c;";
            return `<span style="display:inline-block;margin:2px;padding:2px 6px;border-radius:999px;font-size:11px;${style}">#${item.numero} · ${item.vence}${days > 30 ? ` · ${days}d` : ""}</span>`;
          })
          .join("");

        return `<tr>
          <td>${escapeHtml(client.nombre)}</td>
          <td>${escapeHtml(clientCedula(client))}</td>
          <td>${escapeHtml(client.estado)}</td>
          <td style="text-align:center">${client.cuotasVencidas}</td>
          <td style="text-align:center">${client.cuotasPendientes}</td>
          <td style="text-align:right">${formatMoneyUSD(client.saldo)}</td>
          <td>${escapeHtml(client.proximoVencimiento)}</td>
          <td>${vencidas || "—"}</td>
        </tr>`;
      })
      .join("");

    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(panelTitle)}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#18181b}
        h1{font-size:18px;margin:0 0 4px}
        p.sub{margin:0 0 16px;color:#52525b;font-size:12px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #d4d4d8;padding:6px 8px;vertical-align:top}
        th{background:#f4f4f5;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
      </style></head><body>
      <h1>${escapeHtml(panelTitle)}</h1>
      <p class="sub">${clients.length} clientes · ${totalVencidas} cuotas vencidas · ${formatMoneyUSD(saldoTotal)} en cartera · Generado: ${new Date().toLocaleString("es-VE")}</p>
      <table><thead><tr><th>Cliente</th><th>Cédula</th><th>Estado</th><th>Vencidas</th><th>Pendientes</th><th>Saldo</th><th>Próx. venc.</th><th>Cuotas vencidas</th></tr></thead><tbody>${rowsHtml}</tbody></table>
      </body></html>`;

    const win = window.open("", "_blank", "width=1024,height=768");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-zinc-950/80 p-2 backdrop-blur-sm sm:p-6">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl">
        <header
          className={`flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 p-4 sm:p-5 ${
            isAtraso
              ? "bg-gradient-to-r from-rose-50 to-white"
              : isAlDia
                ? "bg-gradient-to-r from-emerald-50 to-white"
                : "bg-gradient-to-r from-sky-50 to-white"
          }`}
        >
          <div className="flex items-start gap-3">
            <span
              className={`flex h-11 w-11 items-center justify-center rounded-2xl text-white ${
                isAtraso ? "bg-rose-600" : isAlDia ? "bg-emerald-600" : "bg-sky-600"
              }`}
            >
              {isAtraso ? (
                <TriangleAlert className="h-5 w-5" />
              ) : isAlDia ? (
                <ShieldCheck className="h-5 w-5" />
              ) : (
                <Users className="h-5 w-5" />
              )}
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                {isAtraso ? "Con atraso · Atención" : isAlDia ? "Al día · Solvente" : "Cartera completa"}
              </p>
              <h3 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
                {isAtraso ? "Clientes con retraso" : isAlDia ? "Clientes al día" : "Todos los clientes"}
              </h3>
              <p className="mt-1 text-sm text-zinc-600">
                {clients.length} clientes · {totalVencidas} cuotas vencidas · {formatMoneyUSD(saldoTotal)} en cartera
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
            >
              Exportar CSV
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800"
            >
              Imprimir / PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar panel"
              className="rounded-xl border border-zinc-300 bg-white p-2 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 sm:px-5">
          <label className="flex flex-1 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">
            <Search className="h-4 w-4 text-zinc-400" />
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Buscar por nombre, cédula, grupo o gestor"
              className="w-full bg-transparent outline-none"
            />
          </label>
          <span className="text-xs font-medium text-zinc-500">Ordenado por cuotas vencidas</span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          {clients.length === 0 ? (
            <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-zinc-500">
              No hay clientes en este grupo.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {clients.map((client) => {
                const profile = profiles[client.id];
                const vencidas = installments
                  .filter((item) => item.clientId === client.id && item.estado === "Vencida")
                  .sort((first, second) => first.numero - second.numero);
                const cedula = profile?.cedula?.trim() || client.documento;
                const enRiesgo = client.estado === "Riesgo";
                const badgeTone = enRiesgo
                  ? "bg-rose-100 text-rose-700"
                  : client.estado === "Con atraso"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-emerald-100 text-emerald-700";
                const avatarTone = enRiesgo
                  ? "bg-rose-600"
                  : client.estado === "Con atraso"
                    ? "bg-amber-500"
                    : "bg-emerald-600";

                return (
                  <article
                    key={`monitor-focus-${client.id}`}
                    className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 hover:shadow-md"
                  >
                    <div className="flex items-start gap-3">
                      <ClientAvatar name={client.nombre} photo={profile?.fotoPersona} tone={avatarTone} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-zinc-900">{client.nombre}</p>
                        <p className="mt-0.5 text-xs text-zinc-500">C.I. {cedula}</p>
                        <p className="mt-1 text-[11px] text-zinc-400">
                          {client.agencia} · Gestor: {client.gestor}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${badgeTone}`}>
                        {client.estado}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-rose-50 px-2 py-2">
                        <p className="text-lg font-semibold text-rose-700">{client.cuotasVencidas}</p>
                        <p className="text-[10px] uppercase tracking-wide text-rose-600/80">Vencidas</p>
                      </div>
                      <div className="rounded-xl bg-amber-50 px-2 py-2">
                        <p className="text-lg font-semibold text-amber-700">{client.cuotasPendientes}</p>
                        <p className="text-[10px] uppercase tracking-wide text-amber-600/80">Pendientes</p>
                      </div>
                      <div className="rounded-xl bg-zinc-50 px-2 py-2">
                        <p className="text-lg font-semibold text-zinc-900">{formatMoneyUSD(client.saldo)}</p>
                        <p className="text-[10px] uppercase tracking-wide text-zinc-500">Saldo</p>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1.5 text-xs text-zinc-600">
                      <p className="flex items-center gap-2">
                        <CalendarClock className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                        Próx. vencimiento:{" "}
                        <span className="font-medium text-zinc-900">{client.proximoVencimiento}</span>
                      </p>
                      <p className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                        {client.telefono || "—"}
                      </p>
                      {vencidas.length > 0 ? (
                        <div className="flex items-start gap-2">
                          <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
                          <div>
                            <span>Cuotas vencidas:</span>
                            <span className="mt-1 flex flex-wrap gap-1">
                              {vencidas.map((item) => {
                                const days = daysOverdue(item.vence);
                                const critical = days > 30;

                                return (
                                  <span
                                    key={`venc-${client.id}-${item.id}`}
                                    title={critical ? `${days} días de atraso` : undefined}
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                      critical ? "bg-red-600 text-white" : "bg-rose-100 text-rose-700"
                                    }`}
                                  >
                                    #{item.numero} · {item.vence}
                                    {critical ? ` · ${days}d` : ""}
                                  </span>
                                );
                              })}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="flex items-center gap-2 text-emerald-600">
                          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                          Sin cuotas vencidas
                        </p>
                      )}
                    </div>

                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenClient(client.id, "cuotas")}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800"
                      >
                        Ver cuotas <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenClient(client.id, "expediente")}
                        className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
                      >
                        Expediente
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboardClient({ user }: { user: AdminUser }) {
  const [clock, setClock] = useState<Date | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [alerts, setAlerts] = useState(alertsBase);
  const [activeSection, setActiveSection] = useState("resumen");
  const [instruments, setInstruments] = useState<Instrument[]>(initialInstruments);
  const [treasuryFlow, setTreasuryFlow] = useState(initialTreasuryFlow);
  const [recoveryRate, setRecoveryRate] = useState(91.8);
  const [cashCoverage, setCashCoverage] = useState(2.4);
  const [motoMarketFeed, setMotoMarketFeed] = useState<MarketFeedItem[]>(initialMotoMarketFeed);
  const [agencyMarketRows, setAgencyMarketRows] = useState<AgencyMarketRow[]>(initialAgencyMarketRows);
  const [releaseLive, setReleaseLive] = useState({ actual: 1359, survey: 1330, prior: 1311, revised: 1309 });
  const [movementSeries, setMovementSeries] = useState<MovementPoint[]>(initialMovementSeries);
  const [selectedMonitorClientId, setSelectedMonitorClientId] = useState("");
  const [selectedInstallments, setSelectedInstallments] = useState<string[]>([]);
  const [chargeOnlyAdvance, setChargeOnlyAdvance] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState(30);
  const [monitorCedulaSearch, setMonitorCedulaSearch] = useState("");
  const [monitorPortfolioSearch, setMonitorPortfolioSearch] = useState("");
  const [monitorSearchError, setMonitorSearchError] = useState("");
  // Aviso cuando los expedientes no se pudieron cargar (para no confundir con
  // "no hay expedientes": los datos NUNCA se eliminan solos).
  const [monitorLoadError, setMonitorLoadError] = useState("");

  // Feed de la empresa: noticias y videos que ven los miembros.
  const [newsPosts, setNewsPosts] = useState<AdminNewsPost[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState("");
  const [newsMessage, setNewsMessage] = useState("");
  const [newsSaving, setNewsSaving] = useState(false);
  const [newsForm, setNewsForm] = useState({ ...NOVEDAD_VACIA });

  const cargarNovedades = useCallback(async () => {
    setNewsLoading(true);
    setNewsError("");

    try {
      const response = await fetch(`${API_BASE}/api/noticias`, { cache: "no-store" });
      const data = (await response.json()) as { ok?: boolean; posts?: AdminNewsPost[]; message?: string };

      if (!response.ok || !data.ok) {
        setNewsError(data.message || "No se pudieron cargar las novedades.");
        return;
      }

      setNewsPosts(data.posts ?? []);
    } catch {
      setNewsError("No se pudo conectar con el servidor.");
    } finally {
      setNewsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeSection === "novedades") void cargarNovedades();
  }, [activeSection, cargarNovedades]);

  const guardarNovedad = async (event: FormEvent) => {
    event.preventDefault();
    setNewsSaving(true);
    setNewsMessage("");

    try {
      const editando = Boolean(newsForm.id);
      const response = await fetch(`${API_BASE}/api/noticias`, {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newsForm),
      });
      const data = (await response.json()) as { ok?: boolean; message?: string };

      if (!response.ok || !data.ok) {
        setNewsMessage(data.message || "No se pudo guardar la novedad.");
        return;
      }

      setNewsMessage(editando ? "Novedad actualizada." : "Novedad publicada.");
      setNewsForm({ ...NOVEDAD_VACIA });
      await cargarNovedades();
    } catch {
      setNewsMessage("No se pudo conectar con el servidor.");
    } finally {
      setNewsSaving(false);
    }
  };

  const alternarPublicado = async (post: AdminNewsPost) => {
    try {
      const response = await fetch(`${API_BASE}/api/noticias`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: post.id, publicado: !post.publicado }),
      });

      if (!response.ok) return;

      await cargarNovedades();
    } catch {
      // Si falla, la lista queda igual: no se pierde nada.
    }
  };

  const eliminarNovedad = async (post: AdminNewsPost) => {
    try {
      const response = await fetch(`${API_BASE}/api/noticias?id=${encodeURIComponent(post.id)}`, { method: "DELETE" });

      if (!response.ok) return;

      setNewsMessage("Novedad eliminada.");
      await cargarNovedades();
    } catch {
      // Idem: sin cambios si falla la conexion.
    }
  };
  const [monitorSearchLoading, setMonitorSearchLoading] = useState(false);
  const [monitorTab, setMonitorTab] = useState<"operaciones" | "expediente">("operaciones");
  const [monitorClientsData, setMonitorClientsData] = useState<CuotaMonitorClient[]>([]);
  const [monitorProfilesData, setMonitorProfilesData] = useState<Record<string, CuotaMonitorProfile>>({});
  const [monitorInstallmentsData, setMonitorInstallmentsData] = useState<CuotaMonitorInstallment[]>([]);
  const [monitorFocusGroup, setMonitorFocusGroup] = useState<"atraso" | "aldia" | "todos" | null>(null);
  const [monitorFocusSearch, setMonitorFocusSearch] = useState("");
  const [credentialsBusyCedula, setCredentialsBusyCedula] = useState("");
  const [credentialsNotice, setCredentialsNotice] = useState("");
  const [credentialsError, setCredentialsError] = useState("");
  const [credentialsDraft, setCredentialsDraft] = useState("");
  // Financiamiento por modelo de moto (50% inicial + cuotas quincenales).
  const [financingModels, setFinancingModels] = useState<FinancingModelRow[]>([]);
  const [financingBusy, setFinancingBusy] = useState(false);
  const [financingLoading, setFinancingLoading] = useState(false);
  const [financingNotice, setFinancingNotice] = useState("");
  const [financingError, setFinancingError] = useState("");
  const [selectedContractId, setSelectedContractId] = useState(contracts[0].id);
  const [selectedContractCedula, setSelectedContractCedula] = useState(contracts[0].representativeCedula);
  const [contractCedulaSearch, setContractCedulaSearch] = useState("");
  const [contractSearchError, setContractSearchError] = useState("");
  const [contractTab, setContractTab] = useState<"portafolio" | "expediente">("portafolio");

  const clockTimeText = isHydrated && clock ? clock.toLocaleTimeString("es-VE") : "--:--:--";
  const clockDateText = isHydrated && clock ? clock.toLocaleDateString("es-VE") : "--/--/----";

  const [manualPaidCuotasByClient, setManualPaidCuotasByClient] = useState<Record<string, number[]>>({});
  const [manualPaymentRecordsByClient, setManualPaymentRecordsByClient] = useState<Record<string, ManualPaymentRecord[]>>({});
  const [advancePaymentsByClient, setAdvancePaymentsByClient] = useState<Record<string, MonitorAdvancePaymentApi[]>>({});
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentModalCuota, setPaymentModalCuota] = useState<number | null>(null);
  const [paymentDetailModal, setPaymentDetailModal] = useState<InstallmentPaymentDetail | null>(null);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({
    cuotaNumero: 1,
    monto: "",
    fecha: new Date().toISOString().slice(0, 10),
    observacion: "",
  });
  const [documentViewer, setDocumentViewer] = useState<{
    title: string;
    subtitle: string;
    image: string;
    summary: string;
    fields: DocumentViewerField[];
  } | null>(null);
  const [groupParticipantsModal, setGroupParticipantsModal] = useState<string | null>(null);
  const [groupSearchTerm, setGroupSearchTerm] = useState("");
  const [groupCarouselStart, setGroupCarouselStart] = useState(0);
  const [groupBreakdownStart, setGroupBreakdownStart] = useState(0);
  const [groupSearchTerm83, setGroupSearchTerm83] = useState("");
  const [groupCarouselStart83, setGroupCarouselStart83] = useState(0);
  const [pendingDeleteParticipantId, setPendingDeleteParticipantId] = useState<string | null>(null);
  const [pendingDeleteStep, setPendingDeleteStep] = useState<1 | 2>(1);
  const [deletingParticipantId, setDeletingParticipantId] = useState("");
  const [participantActionError, setParticipantActionError] = useState("");
  const [participantActionNotice, setParticipantActionNotice] = useState("");
  const [paymentForm, setPaymentForm] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    referencia: "",
    banco: "Banco de Venezuela",
    metodo: "Transferencia" as ManualPaymentMethod,
    observacion: "",
  });

  const releaseChartData = [
    ...releaseBaseData,
    { year: "2026", actual: releaseLive.actual, survey: releaseLive.survey },
  ];

  const movementStats = useMemo(() => {
    const start = movementSeries[0]?.index ?? 0;
    const end = movementSeries[movementSeries.length - 1]?.index ?? 0;
    const net = end - start;
    const percent = start ? (net / start) * 100 : 0;
    const up = agencyMarketRows.filter((row) => row.variation > 0).length;
    const down = agencyMarketRows.filter((row) => row.variation < 0).length;
    const unchanged = agencyMarketRows.length - up - down;

    return {
      start,
      end,
      net,
      percent,
      up,
      down,
      unchanged,
      current: Math.round((up / Math.max(agencyMarketRows.length, 1)) * 1000),
    };
  }, [movementSeries, agencyMarketRows]);

  const movers = useMemo(() => {
    const sorted = [...agencyMarketRows].sort((first, second) => second.variation - first.variation);

    return {
      leaders: sorted.slice(0, 6),
      laggards: [...sorted].reverse().slice(0, 6),
    };
  }, [agencyMarketRows]);

  const monitorClientsSource = useMemo(
    () => monitorClientsData,
    [monitorClientsData]
  );
  const monitorProfilesSource = useMemo(
    () => monitorProfilesData,
    [monitorProfilesData]
  );
  const monitorInstallmentsSource = useMemo(
    () => monitorInstallmentsData,
    [monitorInstallmentsData]
  );

  const fallbackMonitorClient: CuotaMonitorClient = {
    id: "",
    nombre: "Sin cliente seleccionado",
    documento: "—",
    telefono: "—",
    agencia: "—",
    gestor: "—",
    estado: "Al día",
    cuotasPendientes: 0,
    cuotasVencidas: 0,
    saldo: 0,
    proximoVencimiento: "—",
  };

  const fallbackMonitorProfile: CuotaMonitorProfile = {
    clientId: "",
    cedula: "",
    fotoPersona: "/Documentos/Identificacion principal.jpeg",
    fotoCedula: "/Documentos/Identificacion principal.jpeg",
    fotoRif: "/Documentos/Identificacion principal.jpeg",
    direccion: "No registrado",
    ocupacion: "No registrado",
    empresa: "No registrado",
    references: "No registradas",
    fechaIngreso: "01/01/2026",
    motoMarca: "Por asignar",
    motoModelo: "Por asignar",
    motoImagen: "/Documentos/Identificacion principal.jpeg",
    plan: "Sin plan",
    cuotaMensual: 0,
    cuotasTotales: 0,
    cuotasPagadas: 0,
    totalAbonado: 0,
    contratos: [],
    documentos: [],
  };

  const selectedMonitorClient = useMemo(
    () => monitorClientsSource.find((client) => client.id === selectedMonitorClientId) ?? monitorClientsSource[0] ?? fallbackMonitorClient,
    [selectedMonitorClientId, monitorClientsSource]
  );

  const currentClientInstallments = useMemo(
    () => monitorInstallmentsSource.filter((item) => item.clientId === selectedMonitorClient.id),
    [selectedMonitorClient.id, monitorInstallmentsSource]
  );

  const selectedMonitorProfile = useMemo(
    () => monitorProfilesSource[selectedMonitorClient.id] ?? fallbackMonitorProfile,
    [selectedMonitorClient.id, monitorProfilesSource]
  );

  const selectedInstallmentRows = useMemo(
    () => currentClientInstallments.filter((item) => selectedInstallments.includes(item.id)),
    [currentClientInstallments, selectedInstallments]
  );
  const cuotasTotalesPlan = useMemo(() => {
    return Math.max(selectedMonitorProfile.cuotasTotales || 0, currentClientInstallments.length || 0, 26);
  }, [selectedMonitorProfile.cuotasTotales, currentClientInstallments.length]);
  const manualPaidCuotas = useMemo(
    () => manualPaidCuotasByClient[selectedMonitorClient.id] ?? [],
    [manualPaidCuotasByClient, selectedMonitorClient.id]
  );
  const manualPaymentRecords = useMemo(
    () => manualPaymentRecordsByClient[selectedMonitorClient.id] ?? [],
    [manualPaymentRecordsByClient, selectedMonitorClient.id]
  );
  const currentAdvancePayments = useMemo(
    () => advancePaymentsByClient[selectedMonitorClient.id] ?? [],
    [advancePaymentsByClient, selectedMonitorClient.id]
  );

  const cuotaMonitorStats = useMemo(() => {
    const totalClientes = monitorClientsSource.length;
    const clientesAlDia = monitorClientsSource.filter((client) => client.estado === "Al día").length;
    const clientesEnAtraso = monitorClientsSource.filter((client) => client.estado !== "Al día").length;
    const totalVencidas = monitorClientsSource.reduce((acc, client) => acc + client.cuotasVencidas, 0);
    const carteraActiva = monitorClientsSource.reduce((acc, client) => acc + client.saldo, 0);

    return {
      totalClientes,
      clientesAlDia,
      clientesEnAtraso,
      totalVencidas,
      carteraActiva,
    };
  }, [monitorClientsSource]);

  // --- Panel a pantalla completa por grupo (Con atraso / Al día / Todos) ---
  const monitorFocusClients = useMemo(() => {
    if (!monitorFocusGroup) return [] as CuotaMonitorClient[];

    const rows = monitorClientsSource.filter((client) =>
      monitorFocusGroup === "atraso"
        ? client.estado !== "Al día"
        : monitorFocusGroup === "aldia"
          ? client.estado === "Al día"
          : true
    );

    const rawTerm = monitorFocusSearch.trim().toLowerCase();
    const digitsTerm = normalizeCedula(monitorFocusSearch);

    const filtered = rawTerm
      ? rows.filter((client) => {
          const profile = monitorProfilesSource[client.id];
          const haystack = `${client.nombre} ${client.documento} ${profile?.cedula ?? ""} ${client.agencia} ${client.gestor}`.toLowerCase();

          return (
            haystack.includes(rawTerm) ||
            (digitsTerm.length > 0 && normalizeCedula(client.documento).includes(digitsTerm))
          );
        })
      : rows;

    return [...filtered].sort(
      (first, second) =>
        second.cuotasVencidas - first.cuotasVencidas || second.saldo - first.saldo
    );
  }, [monitorFocusGroup, monitorFocusSearch, monitorClientsSource, monitorProfilesSource]);

  // Nota: el cálculo de vencidas/saldo por cliente se realiza dentro de MonitorFocusPanel.

  const selectedRecargoTotal = selectedInstallmentRows.reduce((acc, item) => acc + item.recargo, 0);
  const selectedMontoBase = selectedInstallmentRows.reduce((acc, item) => acc + item.monto, 0);
  const totalCobro = chargeOnlyAdvance ? advanceAmount : selectedMontoBase + selectedRecargoTotal;
  const nombresCiudadano = selectedMonitorProfile.nombre?.trim() || selectedMonitorClient.nombre.trim().split(/\s+/).slice(0, 2).join(" ") || "No registrado";
  const apellidosCiudadano = selectedMonitorProfile.apellido?.trim() || "No registrado";
  const documentoNormalizado = selectedMonitorProfile.cedula.replace(/\D/g, "");
  const codigoExpediente = `SAN-${selectedMonitorClient.agencia.slice(0, 3).toUpperCase()}-${documentoNormalizado}`;
  const facturaPrincipal = useMemo(
    () => selectedMonitorProfile.documentos.find((doc) => /factura/i.test(doc.nombre)),
    [selectedMonitorProfile.documentos]
  );
  const rifDocumentoRecord = useMemo(
    () => selectedMonitorProfile.documentos.find((doc) => /rif|tribut/i.test(`${doc.nombre} ${doc.tipo}`)) ?? null,
    [selectedMonitorProfile.documentos]
  );
  const documentosComplementarios = useMemo(
    () => selectedMonitorProfile.documentos.filter((doc) => !/factura/i.test(doc.nombre)),
    [selectedMonitorProfile.documentos]
  );
  // Días entre cuotas: plan de 83 cuotas = SEMANAL (7); plan de 26 cuotas = QUINCENAL (15).
  const intervaloDiasPlan =
    isCiclon83Plan(selectedMonitorProfile) || cuotasTotalesPlan >= 83 ? 7 : 15;

  const cronogramaCompletoCuotas = useMemo(() => {
    const now = new Date();
    const startDate = parseDateDMY(selectedMonitorProfile.fechaIngreso);
    const installmentsByNumber = new Map(currentClientInstallments.map((item) => [item.numero, item]));

    return Array.from({ length: cuotasTotalesPlan }, (_, index) => {
      const cuotaNumero = index + 1;
      const cuotaData = installmentsByNumber.get(cuotaNumero);
      const registradaManual = manualPaidCuotas.includes(cuotaNumero);

      const dueDate = cuotaData
        ? parseDateDMY(cuotaData.vence)
        : new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + index * intervaloDiasPlan);
      const dueTs = dueDate.getTime();
      const nowTs = now.getTime();

      const lateDays = (nowTs - dueTs) / (1000 * 60 * 60 * 24);

      const estado: "Pendiente" | "Vencida" | "Por vencer" | "Pagada" = registradaManual
        ? "Pagada"
        : cuotaData?.estado
          ?? (lateDays > 30
            ? "Vencida"
            : lateDays > 20
              ? "Por vencer"
              : "Pendiente");

      const recargo = cuotaData?.recargo ?? (estado === "Vencida" ? Number((selectedMonitorProfile.cuotaMensual * 0.08).toFixed(2)) : 0);
      const vence = cuotaData?.vence ?? formatDateDMY(dueDate);
      const montoBase = selectedMonitorProfile.cuotaMensual;

      return {
        id: `${selectedMonitorClient.id}-cuota-${cuotaNumero}`,
        numero: cuotaNumero,
        vence,
        montoBase,
        recargo,
        total: montoBase + recargo,
        estado,
        registradaManual,
        observacion:
          estado === "Pagada"
            ? cuotaNumero === 1
              ? "Cuota de ingreso solventada. Habilita acceso al sistema."
              : registradaManual
                ? "Pago registrado manualmente desde el expediente."
                : "Cuota liquidada y aplicada al expediente."
            : estado === "Por vencer"
                ? "Cuota activa próxima a su fecha de pago."
                : "Cuota pendiente por cobrar en el plan actual.",
      };
    });
  }, [currentClientInstallments, manualPaidCuotas, selectedMonitorClient.id, selectedMonitorProfile, cuotasTotalesPlan]);
  const cuotasVencidasCronograma = cronogramaCompletoCuotas.filter((item) => item.estado === "Vencida").length;
  const cuotasPagadasCronograma = cronogramaCompletoCuotas.filter((item) => item.estado === "Pagada").length;
  const cuotasRestantes = cronogramaCompletoCuotas.filter((item) => item.estado !== "Pagada").length;
  const abonosPorCuota = useMemo(() => {
    return currentAdvancePayments.reduce<Record<number, number>>((acc, abono) => {
      const note = abono.note || "";
      const reference = abono.reference || "";
      const match =
        note.match(/cuota objetivo\s*#\s*(\d+)/i) ||
        note.match(/cuota\s*#\s*(\d+)/i) ||
        reference.match(/ABN-C\s*0*(\d+)/i) ||
        reference.match(/C\s*0*(\d+)/i);
      if (!match) return acc;

      const cuotaNumero = Number(match[1]);
      if (!Number.isFinite(cuotaNumero) || cuotaNumero <= 0 || cuotaNumero > cuotasTotalesPlan) return acc;

      acc[cuotaNumero] = Number(((acc[cuotaNumero] ?? 0) + abono.amount).toFixed(2));
      return acc;
    }, {});
  }, [currentAdvancePayments, cuotasTotalesPlan]);
  const paymentModalCuotaData = useMemo(
    () => cronogramaCompletoCuotas.find((item) => item.numero === paymentModalCuota) ?? null,
    [cronogramaCompletoCuotas, paymentModalCuota]
  );
  const paymentModalAbonado = useMemo(() => {
    if (!paymentModalCuota) return 0;
    return Number((abonosPorCuota[paymentModalCuota] ?? 0).toFixed(2));
  }, [abonosPorCuota, paymentModalCuota]);
  const paymentModalMontoRegistrar = useMemo(() => {
    if (!paymentModalCuotaData) return 0;
    return Math.max(0, Number((paymentModalCuotaData.total - paymentModalAbonado).toFixed(2)));
  }, [paymentModalCuotaData, paymentModalAbonado]);
  const pagoAcumulado = cronogramaCompletoCuotas.filter((item) => item.estado === "Pagada").reduce((acc, item) => acc + item.total, 0);
  const totalAbonadoAplicado = Number((selectedMonitorProfile.totalAbonado ?? currentAdvancePayments.reduce((acc, item) => acc + item.amount, 0)).toFixed(2));
  // El "saldo que debe" usa el MISMO cálculo del monitor (evita discrepancias entre vistas).
  const deudaProyecto = Math.max(0, Number(selectedMonitorClient.saldo ?? 0));
  const clienteSolvente = cuotasRestantes === 0 || (selectedMonitorClient.estado === "Al día" && cuotasVencidasCronograma === 0);
  const ultimoPagoManual = [...manualPaymentRecords].sort((first, second) => second.fecha.localeCompare(first.fecha))[0];
  const ultimaCuotaPagada = [...cronogramaCompletoCuotas]
    .filter((item) => item.estado === "Pagada")
    .sort((first, second) => second.numero - first.numero)[0];
  const fechaUltimoPago = ultimoPagoManual?.fecha
    ? formatIsoDateToDMY(ultimoPagoManual.fecha)
    : ultimaCuotaPagada?.vence ?? "Sin registro";
  const metodoUltimoPago = ultimoPagoManual?.metodo ?? (cuotasPagadasCronograma > 0 ? "Transferencia" : "No registrado");
  const cuotaActualSugerida = useMemo(() => {
    const primeraPendiente = cronogramaCompletoCuotas.find((item) => item.estado !== "Pagada");
    return primeraPendiente?.numero ?? cuotasTotalesPlan;
  }, [cronogramaCompletoCuotas, cuotasTotalesPlan]);
  const advanceModalMaxAmount = useMemo(() => {
    const cuota = cronogramaCompletoCuotas.find((item) => item.numero === advanceForm.cuotaNumero);
    if (!cuota) return 0;

    const totalCuota = Number((cuota.total ?? 0).toFixed(2));
    const yaAbonado = Number((abonosPorCuota[advanceForm.cuotaNumero] ?? 0).toFixed(2));
    const restante = Math.max(0, Number((totalCuota - yaAbonado).toFixed(2)));
    const limiteMenorQuePagoCompleto = Math.max(0, Number((restante - 0.01).toFixed(2)));
    const limiteSeguridad = Number((totalCuota * 0.8).toFixed(2));
    return Math.max(0, Number(Math.min(limiteMenorQuePagoCompleto, limiteSeguridad).toFixed(2)));
  }, [abonosPorCuota, advanceForm.cuotaNumero, cronogramaCompletoCuotas]);
  const nivelRiesgoCliente = clienteSolvente
    ? "Bajo"
    : cuotasVencidasCronograma >= 3 || selectedMonitorClient.estado === "Riesgo"
      ? "Alto"
      : cuotasVencidasCronograma >= 1 || selectedMonitorClient.estado === "Con atraso"
        ? "Medio"
        : "Bajo";
  const participantRealtimeEntries = useMemo(() => {
    return monitorClientsSource.map((client, index) => {
      const profile = monitorProfilesSource[client.id];
      const planType = isCiclon83Plan(profile) ? "83" : "26";
      const groupCapacity = planType === "83" ? GROUP_CAPACITY_83 : GROUP_CAPACITY;
      const totalCompromisos = Math.max(client.cuotasPendientes + client.cuotasVencidas + 1, 1);
      const cumplimiento = Math.round(clamp(((totalCompromisos - client.cuotasPendientes) / totalCompromisos) * 100, 0, 100));
      const grupo = client.agencia?.trim() || `Grupo ${String(Math.floor(index / groupCapacity) + 1).padStart(2, "0")}`;
      const iniciales = client.nombre
        .split(" ")
        .slice(0, 2)
        .map((part) => part[0])
        .join("");
      const colorClase = client.estado === "Al día"
        ? "bg-emerald-600 hover:bg-emerald-500 border-emerald-400/50"
        : client.estado === "Con atraso"
          ? "bg-amber-600 hover:bg-amber-500 border-amber-300/40"
          : "bg-red-700 hover:bg-red-600 border-red-300/40";

      return {
        ...client,
        grupo,
        planType,
        groupCapacity,
        cumplimiento,
        iniciales,
        liveLabel: client.estado === "Al día" ? "Solvente" : client.estado,
        colorClase,
      };
    });
  }, [monitorClientsSource, monitorProfilesSource]);
  const participantGroupSummaries = useMemo(() => {
    const grouped = participantRealtimeEntries
      .filter((item) => item.planType === "26")
      .reduce<Record<string, { grupo: string; total: number; activos: number; mora: number; cartera: number }>>((acc, item) => {
      if (!acc[item.grupo]) {
        acc[item.grupo] = { grupo: item.grupo, total: 0, activos: 0, mora: 0, cartera: 0 };
      }

      acc[item.grupo].total += 1;
      acc[item.grupo].activos += item.estado === "Al día" ? 1 : 0;
      acc[item.grupo].mora += item.estado === "Al día" ? 0 : 1;
      acc[item.grupo].cartera += item.saldo;
      return acc;
    }, {});

    return Object.values(grouped).map((group) => ({
      ...group,
      cuposOcupados: group.total,
      cuposDisponibles: Math.max(0, GROUP_CAPACITY - group.total),
      grupoLleno: group.total >= GROUP_CAPACITY,
    }));
  }, [participantRealtimeEntries]);
  const participantGroupSummaries83 = useMemo(() => {
    const grouped = participantRealtimeEntries
      .filter((item) => item.planType === "83")
      .reduce<Record<string, { grupo: string; total: number; activos: number; mora: number; cartera: number }>>((acc, item) => {
        if (!acc[item.grupo]) {
          acc[item.grupo] = { grupo: item.grupo, total: 0, activos: 0, mora: 0, cartera: 0 };
        }

        acc[item.grupo].total += 1;
        acc[item.grupo].activos += item.estado === "Al día" ? 1 : 0;
        acc[item.grupo].mora += item.estado === "Al día" ? 0 : 1;
        acc[item.grupo].cartera += item.saldo;
        return acc;
      }, {});

    return Object.values(grouped).map((group) => ({
      ...group,
      cuposOcupados: group.total,
      cuposDisponibles: Math.max(0, GROUP_CAPACITY_83 - group.total),
      grupoLleno: group.total >= GROUP_CAPACITY_83,
    }));
  }, [participantRealtimeEntries]);
  const filteredGroupSummaries = useMemo(() => {
    const query = groupSearchTerm.trim();
    if (!query) return participantGroupSummaries;

    const normalizedQuery = query.toLowerCase();
    const numericQuery = query.replace(/\D/g, "");

    return participantGroupSummaries.filter((group) => {
      const normalizedGroup = group.grupo.toLowerCase();
      if (normalizedGroup.includes(normalizedQuery)) return true;

      if (!numericQuery) return false;
      const groupNumber = group.grupo.replace(/\D/g, "");
      return groupNumber.includes(numericQuery);
    });
  }, [participantGroupSummaries, groupSearchTerm]);
  const visibleGroupCards = useMemo(() => {
    return filteredGroupSummaries.slice(groupCarouselStart, groupCarouselStart + 3);
  }, [filteredGroupSummaries, groupCarouselStart]);
  const visibleGroupBreakdownCards = useMemo(() => {
    return participantGroupSummaries.slice(groupBreakdownStart, groupBreakdownStart + 3);
  }, [participantGroupSummaries, groupBreakdownStart]);
  const filteredGroupSummaries83 = useMemo(() => {
    const query = groupSearchTerm83.trim();
    if (!query) return participantGroupSummaries83;

    const normalizedQuery = query.toLowerCase();
    const numericQuery = query.replace(/\D/g, "");

    return participantGroupSummaries83.filter((group) => {
      const normalizedGroup = group.grupo.toLowerCase();
      if (normalizedGroup.includes(normalizedQuery)) return true;

      if (!numericQuery) return false;
      const groupNumber = group.grupo.replace(/\D/g, "");
      return groupNumber.includes(numericQuery);
    });
  }, [participantGroupSummaries83, groupSearchTerm83]);
  const visibleGroupCards83 = useMemo(() => {
    return filteredGroupSummaries83.slice(groupCarouselStart83, groupCarouselStart83 + 3);
  }, [filteredGroupSummaries83, groupCarouselStart83]);
  const filteredPortfolioClients = useMemo(() => {
    const query = monitorPortfolioSearch.trim().toLowerCase();
    if (!query) return monitorClientsSource;

    return monitorClientsSource.filter((client) => {
      const byName = client.nombre.toLowerCase().includes(query);
      const byGroup = (client.agencia || "").toLowerCase().includes(query);
      const byCedula = normalizeCedula(client.documento).includes(normalizeCedula(query));
      return byName || byGroup || byCedula;
    });
  }, [monitorClientsSource, monitorPortfolioSearch]);
  const topParticipantGroup = useMemo(
    () => [...participantGroupSummaries].sort((first, second) => second.cartera - first.cartera)[0] ?? null,
    [participantGroupSummaries]
  );
  const selectedContractMatches = useMemo(() => {
    const query = normalizeCedula(selectedContractCedula);

    if (!query) return contracts.filter((contract) => contract.id === selectedContractId);

    return contracts.filter((contract) => {
      if (normalizeCedula(contract.representativeCedula) === query) return true;

      return (contract.associatedCedulas ?? []).some((cedula) => normalizeCedula(cedula) === query);
    });
  }, [selectedContractCedula, selectedContractId]);
  const selectedContract = useMemo(
    () => selectedContractMatches.find((contract) => contract.id === selectedContractId) ?? selectedContractMatches[0] ?? contracts[0],
    [selectedContractMatches, selectedContractId]
  );
  const selectedContractSubjectClient = useMemo(
    () => monitorClientsSource.find((client) => normalizeCedula(client.documento) === normalizeCedula(selectedContractCedula)) ?? null,
    [selectedContractCedula, monitorClientsSource]
  );
  const selectedContractSubjectProfile = useMemo(
    () => selectedContractSubjectClient ? monitorProfilesSource[selectedContractSubjectClient.id] ?? null : null,
    [selectedContractSubjectClient, monitorProfilesSource]
  );
  const contractSignedCount = useMemo(
    () => selectedContract.signatures.filter((signature) => signature.status === "Firmado").length,
    [selectedContract]
  );
  const contractPendingSignatureCount = useMemo(
    () => selectedContract.signatures.filter((signature) => signature.status !== "Firmado").length,
    [selectedContract]
  );
  const participantPriorityRows = useMemo(
    () => [...participantRealtimeEntries].sort((first, second) => second.saldo - first.saldo).slice(0, 6),
    [participantRealtimeEntries]
  );
  const selectedGroupParticipants = useMemo(() => {
    if (!groupParticipantsModal) return [];
    return participantRealtimeEntries.filter((item) => item.grupo === groupParticipantsModal);
  }, [groupParticipantsModal, participantRealtimeEntries]);
  const pendingDeleteParticipant = useMemo(
    () => pendingDeleteParticipantId ? monitorClientsSource.find((item) => item.id === pendingDeleteParticipantId) ?? null : null,
    [pendingDeleteParticipantId, monitorClientsSource],
  );

  async function refreshMonitorClientsOverview() {
    const response = await fetch(`${API_BASE}/api/monitor-cuotas`);
    const data = (await response.json()) as {
      ok: boolean;
      clients?: CuotaMonitorClient[];
      profiles?: Record<string, CuotaMonitorProfile>;
      installments?: CuotaMonitorInstallment[];
    };

    if (!response.ok || !data.ok) {
      throw new Error("No fue posible actualizar la cartera.");
    }

    const clients = data.clients ?? [];
    setMonitorClientsData(clients);
    setMonitorProfilesData(data.profiles ?? {});
    setMonitorInstallmentsData(data.installments ?? []);
    setSelectedMonitorClientId((current) => {
      if (clients.length === 0) return "";
      return clients.some((item) => item.id === current) ? current : clients[0].id;
    });
  }

  async function handleRemoveParticipant(participantId: string) {
    const participant = monitorClientsSource.find((item) => item.id === participantId);
    if (!participant) return;

    setDeletingParticipantId(participantId);
    setParticipantActionError("");
    setParticipantActionNotice("");

    try {
      const response = await fetch(`${API_BASE}/api/monitor-cuotas?cedula=${normalizeCedula(participant.documento)}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { ok: boolean; message?: string };

      if (!response.ok || !data.ok) {
        setParticipantActionError(data.message || "No se pudo eliminar el participante.");
        return;
      }

      await refreshMonitorClientsOverview();
      setParticipantActionNotice(data.message || `Participante eliminado: ${participant.nombre}`);
    } catch {
      setParticipantActionError("No se pudo eliminar el participante en este momento.");
    } finally {
      setDeletingParticipantId("");
    }
  }

  function openDeleteParticipantDialog(participantId: string) {
    setParticipantActionError("");
    setParticipantActionNotice("");
    setPendingDeleteParticipantId(participantId);
    setPendingDeleteStep(1);
  }

  function closeDeleteParticipantDialog() {
    if (deletingParticipantId) return;
    setPendingDeleteParticipantId(null);
    setPendingDeleteStep(1);
  }

  async function proceedDeleteParticipantDialog() {
    if (!pendingDeleteParticipantId) return;

    if (pendingDeleteStep === 1) {
      setPendingDeleteStep(2);
      return;
    }

    await handleRemoveParticipant(pendingDeleteParticipantId);
    setPendingDeleteParticipantId(null);
    setPendingDeleteStep(1);
  }

  // Carga los expedientes del monitor. Se puede reintentar desde el aviso.
  const loadMonitorClients = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/monitor-cuotas`);
      const data = (await response.json()) as {
        ok: boolean;
        clients?: CuotaMonitorClient[];
        profiles?: Record<string, CuotaMonitorProfile>;
        installments?: CuotaMonitorInstallment[];
        message?: string;
      };

      if (!response.ok || !data.ok) {
        setMonitorLoadError(
          response.status === 401 || response.status === 403
            ? "Tu sesión o la licencia administrativa venció, por eso la lista se ve vacía. Vuelve a validar la licencia y reintenta."
            : data.message || "No se pudieron cargar los expedientes en este momento.",
        );
        return;
      }

      const clients = data.clients ?? [];
      setMonitorLoadError("");

      if (clients.length > 0) {
        setMonitorClientsData(clients);
        setMonitorProfilesData(data.profiles ?? {});
        setMonitorInstallmentsData(data.installments ?? []);
        setSelectedMonitorClientId((current) => (clients.some((item) => item.id === current) ? current : clients[0].id));
      }
    } catch {
      setMonitorLoadError("No se pudo conectar con el servidor. Reintenta en unos segundos.");
    }
  }, []);

  useEffect(() => {
    void loadMonitorClients();
  }, [loadMonitorClients]);

  // Al abrir la pestaña de expediente traemos las credenciales reales del miembro
  // seleccionado (la lista no las incluye).
  useEffect(() => {
    if (monitorTab !== "expediente" || !selectedMonitorClientId) return;

    const client = monitorClientsSource.find((item) => item.id === selectedMonitorClientId);
    const cedula = normalizeCedula(client?.documento ?? "");

    if (!cedula) return;

    void loadStoredCredentials(cedula, selectedMonitorClientId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitorTab, selectedMonitorClientId, monitorClientsSource]);

  // Carga la configuracion de financiamiento al abrir la seccion.
  useEffect(() => {
    if (activeSection !== "financiamiento") return;

    void loadFinancingModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  useEffect(() => {
    if (activeSection !== "contratos" || contractTab !== "expediente") return;

    const timer = window.setTimeout(() => {
      document.getElementById("contract-expediente-panel")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);

    return () => window.clearTimeout(timer);
  }, [activeSection, contractTab, selectedContractCedula, selectedContractId]);

  const nextOperations = [
    `Lote pendiente: ${selectedMonitorClient.agencia} · ${selectedMonitorClient.gestor}`,
    `Cliente en foco: ${selectedMonitorClient.nombre}`,
    `Cuotas vencidas activas: ${selectedMonitorClient.cuotasVencidas}`,
    `Último corte: ${clockTimeText}`,
  ];

  async function handleMonitorSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = normalizeCedula(monitorCedulaSearch);

    if (!query) {
      setMonitorSearchError("Ingresa una cédula para buscar el expediente.");
      return;
    }

    setMonitorSearchLoading(true);
    setMonitorSearchError("");

    try {
      const response = await fetch(`${API_BASE}/api/monitor-cuotas?cedula=${query}`);
      const data = (await response.json()) as {
        ok: boolean;
        found?: boolean;
        message?: string;
        client?: CuotaMonitorClient;
        profile?: CuotaMonitorProfile;
        installments?: CuotaMonitorInstallment[];
        paymentRecords?: MonitorPaymentRecordApi[];
        advancePayments?: MonitorAdvancePaymentApi[];
      };

      if (!response.ok || !data.ok || !data.found || !data.client || !data.profile) {
        setMonitorSearchError(data.message || "No se encontró un cliente con esa cédula.");
        return;
      }

      const foundClient = data.client;
      const foundProfile = data.profile;

      setMonitorClientsData((current) => {
        const filtered = current.filter((item) => item.id !== foundClient.id);
        return [foundClient, ...filtered];
      });
      setMonitorProfilesData((current) => ({
        ...current,
        [foundClient.id]: foundProfile,
      }));
      setMonitorInstallmentsData((current) => {
        const filtered = current.filter((item) => item.clientId !== foundClient.id);
        return [...filtered, ...(data.installments ?? [])];
      });

      const paymentRecords = data.paymentRecords ?? [];
      setManualPaymentRecordsByClient((current) => ({
        ...current,
        [foundClient.id]: paymentRecords.map((item) => ({
          cuotaNumero: item.installmentNumber,
          fecha: item.paymentDate.split("/").reverse().join("-"),
          referencia: item.reference,
          banco: item.bank,
          metodo: item.method as ManualPaymentMethod,
          observacion: item.note,
          monto: item.amount,
          registradoEn: new Date(item.createdAt).toLocaleString("es-VE"),
        })),
      }));

      setManualPaidCuotasByClient((current) => ({
        ...current,
        [foundClient.id]: paymentRecords.map((item) => item.installmentNumber),
      }));

      setAdvancePaymentsByClient((current) => ({
        ...current,
        [foundClient.id]: data.advancePayments ?? [],
      }));

      setSelectedMonitorClientId(foundClient.id);
      setSelectedInstallments([]);
      setMonitorCedulaSearch(query);
      setMonitorTab("expediente");
      setMonitorSearchError("");
    } catch {
      setMonitorSearchError("No se pudo consultar el expediente en este momento.");
    } finally {
      setMonitorSearchLoading(false);
    }
  }

  // El listado de expedientes NO incluye las claves (para no descifrar todas de
  // golpe). Al abrir un expediente pedimos el detalle por cédula, que sí trae las
  // credenciales guardadas.
  async function loadStoredCredentials(cedula: string, clientId: string) {
    if (!cedula) return;

    try {
      const response = await fetch(`${API_BASE}/api/monitor-cuotas?cedula=${encodeURIComponent(cedula)}`);
      const data = (await response.json()) as {
        ok: boolean;
        found?: boolean;
        profile?: CuotaMonitorProfile;
      };

      if (!response.ok || !data.ok || !data.found || !data.profile?.credenciales) {
        return;
      }

      const credentials = data.profile.credenciales;
      const username = data.profile.username;

      setMonitorProfilesData((current) => {
        const profile = current[clientId];

        if (!profile) {
          return current;
        }

        return {
          ...current,
          [clientId]: {
            ...profile,
            username: username || profile.username,
            credenciales: credentials,
          },
        };
      });
    } catch {
      // Si falla, el expediente se queda como está y el admin puede usar la tarjeta.
    }
  }

  // Genera o guarda la clave del miembro en el expediente. Si se pasa una clave
  // ya existente, se guarda tal cual (no cambia el acceso del miembro); si no,
  // se genera una nueva.
  async function handleGenerateCredentials(cedula: string, clientId: string, providedKey = "") {
    if (!cedula) {
      setCredentialsError("No hay una cédula válida en el expediente seleccionado.");
      return;
    }

    const requestedKey = providedKey.trim().toUpperCase();

    if (requestedKey && !MEMBER_KEY_INPUT_PATTERN.test(requestedKey)) {
      setCredentialsError("La clave debe tener el formato SAN-MEMBER-XXXXXX (6 caracteres).");
      return;
    }

    setCredentialsBusyCedula(cedula);
    setCredentialsError("");
    setCredentialsNotice("");

    try {
      const response = await fetch(`${API_BASE}/api/monitor-cuotas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedula, kind: "credentials", memberKey: requestedKey || undefined }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        message?: string;
        credentials?: { username: string; memberKey: string };
      };

      if (!response.ok || !data.ok || !data.credentials) {
        setCredentialsError(data.message || "No fue posible generar las credenciales.");
        return;
      }

      const generatedUsername = data.credentials.username;
      const generatedKey = data.credentials.memberKey;

      setMonitorProfilesData((current) => {
        const profile = current[clientId];

        if (!profile) {
          return current;
        }

        return {
          ...current,
          [clientId]: {
            ...profile,
            username: profile.username || generatedUsername,
            credenciales: {
              usuario: generatedUsername || profile.username || "No registrado",
              clave: generatedKey,
              disponible: true,
              emitidaEn: new Date().toLocaleDateString("es-VE"),
            },
          },
        };
      });

      setCredentialsNotice(data.message || "Credenciales generadas y guardadas en el expediente.");
      setCredentialsDraft("");
    } catch {
      setCredentialsError("No se pudo conectar con el servidor para guardar las credenciales.");
    } finally {
      setCredentialsBusyCedula("");
    }
  }

  // Financiamiento por modelo: carga y guardado.
  async function loadFinancingModels() {
    setFinancingLoading(true);
    setFinancingError("");

    try {
      const response = await fetch(`${API_BASE}/api/financing-motos`);
      const data = (await response.json()) as {
        ok: boolean;
        models?: FinancingModelRow[];
        message?: string;
      };

      if (!response.ok || !data.ok || !data.models) {
        setFinancingError(data.message || "No fue posible cargar el financiamiento.");
        return;
      }

      setFinancingModels(data.models);
    } catch {
      setFinancingError("No se pudo conectar con el servidor.");
    } finally {
      setFinancingLoading(false);
    }
  }

  async function saveFinancingModels() {
    setFinancingBusy(true);
    setFinancingNotice("");
    setFinancingError("");

    try {
      const response = await fetch(`${API_BASE}/api/financing-motos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          motos: financingModels.map((model) => ({
            motoSlug: model.slug,
            precioBase: model.precioBase,
            porcentajeInicial: model.porcentajeInicial,
            cuotasQuincenales: model.cuotasQuincenales,
            montoCuota: model.montoCuota,
            activo: model.activo,
          })),
        }),
      });
      const data = (await response.json()) as { ok: boolean; message?: string };

      if (!response.ok || !data.ok) {
        setFinancingError(data.message || "No fue posible guardar el financiamiento.");
        return;
      }

      setFinancingNotice(data.message || "Financiamiento guardado correctamente.");
      await loadFinancingModels();
    } catch {
      setFinancingError("No se pudo conectar con el servidor.");
    } finally {
      setFinancingBusy(false);
    }
  }

  function updateFinancingRow(slug: string, patch: Partial<FinancingModelRow>) {
    setFinancingModels((current) =>
      current.map((model) => (model.slug === slug ? { ...model, ...patch } : model)),
    );
  }

  const financingSummary = useMemo(() => {
    const withPrice = financingModels.filter((model) => model.precioBase > 0);
    const totalInicial = withPrice.reduce((acc, model) => {
      const detail = computeFinancing(model);
      return acc + detail.inicial;
    }, 0);
    const totalCuotas = withPrice.reduce((acc, model) => {
      const detail = computeFinancing(model);
      return acc + detail.totalCuotas;
    }, 0);

    return {
      configurados: withPrice.length,
      total: financingModels.length,
      totalInicial: Math.round(totalInicial * 100) / 100,
      totalCuotas: Math.round(totalCuotas * 100) / 100,
    };
  }, [financingModels]);

  // Miembros en el sistema de financiamiento: es INDIVIDUAL, no pertenecen a
  // ningun grupo operativo. Se calculan desde los datos ya cargados del monitor.
  const financingMembers = useMemo(() => {
    return monitorClientsSource
      .map((client) => {
        const profile = monitorProfilesSource[client.id];
        const installments = monitorInstallmentsSource.filter((item) => item.clientId === client.id);

        return {
          client,
          profile,
          cuotasTotales: installments.length,
          cuotasPagadas: installments.filter((item) => item.estado === "Pagada").length,
          esFinanciamiento: isFinancingPlan(profile?.plan ?? ""),
        };
      })
      .filter((item) => item.esFinanciamiento);
  }, [monitorClientsSource, monitorInstallmentsSource, monitorProfilesSource]);

  const financingMembersSummary = useMemo(() => {
    return {
      total: financingMembers.length,
      saldo: Math.round(financingMembers.reduce((acc, item) => acc + (item.client.saldo ?? 0), 0) * 100) / 100,
      cuotasPendientes: financingMembers.reduce((acc, item) => acc + (item.client.cuotasPendientes ?? 0), 0),
      conAtraso: financingMembers.filter((item) => item.client.estado !== "Al día").length,
    };
  }, [financingMembers]);

  // Abre el expediente completo del financiado en el monitor de cuotas.
  function openFinancingExpediente(clientId: string) {
    setSelectedMonitorClientId(clientId);
    setMonitorTab("expediente");
    setActiveSection("monitor-cuotas");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleRegisterOperationalCharge() {
    if (submittingPayment) return;

    if (chargeOnlyAdvance) {
      if (advanceAmount <= 0) {
        setMonitorSearchError("Ingresa un monto de abono válido.");
        return;
      }

      setSubmittingPayment(true);
      setMonitorSearchError("");

      try {
        const response = await fetch(`${API_BASE}/api/monitor-cuotas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "advance",
            cedula: selectedMonitorProfile.cedula,
            amount: advanceAmount,
            paymentDate: new Date().toISOString().slice(0, 10),
            reference: `ABN-${Date.now()}`,
            bank: "Registro operativo SAN",
            method: "Transferencia",
            note: "Abono operativo desde control de cartera.",
          }),
        });

        const data = (await response.json()) as { ok: boolean; message?: string };
        if (!response.ok || !data.ok) {
          setMonitorSearchError(data.message || "No se pudo registrar el abono.");
          return;
        }

        await syncMonitorDossierByCedula(selectedMonitorProfile.cedula);
        setSelectedInstallments([]);
      } catch {
        setMonitorSearchError("No se pudo registrar el abono en este momento.");
      } finally {
        setSubmittingPayment(false);
      }

      return;
    }

    if (selectedInstallmentRows.length === 0) {
      setMonitorSearchError("Selecciona al menos una cuota para registrar el cobro.");
      return;
    }

    setSubmittingPayment(true);
    setMonitorSearchError("");

    try {
      for (const installment of selectedInstallmentRows) {
        const response = await fetch(`${API_BASE}/api/monitor-cuotas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "installment",
            cedula: selectedMonitorProfile.cedula,
            installmentNumber: installment.numero,
            amount: installment.monto + installment.recargo,
            paymentDate: new Date().toISOString().slice(0, 10),
            reference: `COB-${installment.numero}-${Date.now()}`,
            bank: "Registro operativo SAN",
            method: "Transferencia",
            note: "Cobro operativo desde selección múltiple.",
          }),
        });

        const data = (await response.json()) as { ok: boolean; message?: string };
        if (!response.ok || !data.ok) {
          setMonitorSearchError(data.message || `No se pudo registrar la cuota #${installment.numero}.`);
          return;
        }
      }

      await syncMonitorDossierByCedula(selectedMonitorProfile.cedula);
      setSelectedInstallments([]);
    } catch {
      setMonitorSearchError("No se pudo registrar el cobro en este momento.");
    } finally {
      setSubmittingPayment(false);
    }
  }

  async function handleUnmarkInstallmentPayment(cuotaNumero: number) {
    if (!selectedMonitorProfile.cedula) {
      setMonitorSearchError("No se pudo determinar la cédula del cliente seleccionado.");
      return;
    }

    const confirmed = window.confirm(`¿Confirmas desmarcar la cuota #${cuotaNumero}? Esta acción revertirá el pago registrado.`);
    if (!confirmed) {
      return;
    }

    setSubmittingPayment(true);
    setMonitorSearchError("");

    try {
      const cedula = normalizeCedula(selectedMonitorProfile.cedula);
      const response = await fetch(`${API_BASE}/api/monitor-cuotas?cedula=${cedula}&installmentNumber=${cuotaNumero}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { ok: boolean; message?: string };

      if (!response.ok || !data.ok) {
        setMonitorSearchError(data.message || `No se pudo desmarcar la cuota #${cuotaNumero}.`);
        return;
      }

      await syncMonitorDossierByCedula(cedula);
      setSelectedInstallments((current) =>
        current.filter((installmentId) => {
          const installment = currentClientInstallments.find((item) => item.id === installmentId);
          return installment?.numero !== cuotaNumero;
        })
      );
    } catch {
      setMonitorSearchError("No se pudo desmarcar la cuota en este momento.");
    } finally {
      setSubmittingPayment(false);
    }
  }

  async function syncMonitorDossierByCedula(rawCedula: string) {
    const query = normalizeCedula(rawCedula);
    if (!query) return;

    const response = await fetch(`${API_BASE}/api/monitor-cuotas?cedula=${query}`);
    const data = (await response.json()) as {
      ok: boolean;
      found?: boolean;
      client?: CuotaMonitorClient;
      profile?: CuotaMonitorProfile;
      installments?: CuotaMonitorInstallment[];
      paymentRecords?: MonitorPaymentRecordApi[];
      advancePayments?: MonitorAdvancePaymentApi[];
    };

    if (!response.ok || !data.ok || !data.found || !data.client || !data.profile) {
      return;
    }

    const foundClient = data.client;
    const foundProfile = data.profile;

    setMonitorClientsData((current) => {
      const filtered = current.filter((item) => item.id !== foundClient.id);
      return [foundClient, ...filtered];
    });
    setMonitorProfilesData((current) => ({
      ...current,
      [foundClient.id]: foundProfile,
    }));
    setMonitorInstallmentsData((current) => {
      const filtered = current.filter((item) => item.clientId !== foundClient.id);
      return [...filtered, ...(data.installments ?? [])];
    });

    const paymentRecords = data.paymentRecords ?? [];
    setManualPaymentRecordsByClient((current) => ({
      ...current,
      [foundClient.id]: paymentRecords.map((item) => ({
        cuotaNumero: item.installmentNumber,
        fecha: item.paymentDate.split("/").reverse().join("-"),
        referencia: item.reference,
        banco: item.bank,
        metodo: item.method as ManualPaymentMethod,
        observacion: item.note,
        monto: item.amount,
        registradoEn: new Date(item.createdAt).toLocaleString("es-VE"),
      })),
    }));
    setManualPaidCuotasByClient((current) => ({
      ...current,
      [foundClient.id]: paymentRecords.map((item) => item.installmentNumber),
    }));
    setAdvancePaymentsByClient((current) => ({
      ...current,
      [foundClient.id]: data.advancePayments ?? [],
    }));
  }

  function openMonitorClient(clientId: string, tab: "operaciones" | "expediente") {
    const client = monitorClientsSource.find((item) => item.id === clientId);

    if (!client) return;

    setSelectedMonitorClientId(client.id);
    setSelectedInstallments([]);
    setMonitorCedulaSearch(normalizeCedula(client.documento));
    setMonitorTab(tab);
    setMonitorSearchError("");
  }

  /**
   * Abre el EXPEDIENTE del cliente y baja automáticamente a la sección de cuotas
   * ("Cronograma completo de cuotas"). Es lo que usa el botón "Ver cuotas".
   */
  function openMonitorClientCuotas(clientId: string) {
    openMonitorClient(clientId, "expediente");

    if (typeof window === "undefined") return;

    window.setTimeout(() => {
      document
        .getElementById("monitor-cuotas-cronograma")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300);
  }

  function openContractDossier(contractId: string, searchCedula?: string) {
    const contract = contracts.find((item) => item.id === contractId);

    if (!contract) return;

    setSelectedContractId(contract.id);
    setSelectedContractCedula(searchCedula ?? contract.representativeCedula);
    setContractCedulaSearch(searchCedula ?? contract.representativeCedula);
    setContractTab("expediente");
    setContractSearchError("");
  }

  function handleContractSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = normalizeCedula(contractCedulaSearch);

    if (!query) {
      setContractSearchError("Ingresa una cédula para abrir el expediente contractual.");
      return;
    }

    const match = contracts.find((contract) => {
      if (normalizeCedula(contract.representativeCedula) === query) return true;

      return (contract.associatedCedulas ?? []).some((cedula) => normalizeCedula(cedula) === query);
    });

    if (!match) {
      setContractSearchError("No se encontró un contrato asociado a esa cédula.");
      return;
    }

    openContractDossier(match.id, query);
  }

  function openPaymentModal(cuotaNumero: number) {
    setPaymentModalCuota(cuotaNumero);
    setPaymentForm({
      fecha: new Date().toISOString().slice(0, 10),
      referencia: `SAN-${selectedMonitorClient.id.toUpperCase()}-${cuotaNumero.toString().padStart(2, "0")}`,
      banco: "Banco de Venezuela",
      metodo: "Transferencia",
      observacion: `Pago registrado para la cuota ${cuotaNumero}.`,
    });
  }

  function closePaymentModal() {
    setPaymentModalCuota(null);
  }

  function openPaymentDetailModal(cuota: {
    numero: number;
    vence: string;
    montoBase: number;
    recargo: number;
    total: number;
    estado: string;
    observacion: string;
  }) {
    const manualRecord = manualPaymentRecords.find((record) => record.cuotaNumero === cuota.numero);

    if (manualRecord) {
      setPaymentDetailModal({
        cuotaNumero: cuota.numero,
        estado: cuota.estado,
        fechaPago: formatIsoDateToDMY(manualRecord.fecha),
        metodo: manualRecord.metodo,
        banco: manualRecord.banco,
        referencia: manualRecord.referencia,
        montoBase: cuota.montoBase,
        recargo: cuota.recargo,
        totalAbonado: Number((abonosPorCuota[cuota.numero] ?? 0).toFixed(2)),
        total: manualRecord.monto,
        registradoEn: manualRecord.registradoEn,
        origen: "Manual",
        observacion: manualRecord.observacion || cuota.observacion,
        vencimiento: cuota.vence,
      });
      return;
    }

    setPaymentDetailModal({
      cuotaNumero: cuota.numero,
      estado: cuota.estado,
      fechaPago: cuota.vence,
      metodo: "Transferencia",
      banco: "Registro histórico SAN",
      referencia: `HIST-${selectedMonitorClient.id.toUpperCase()}-${cuota.numero.toString().padStart(2, "0")}`,
      montoBase: cuota.montoBase,
      recargo: cuota.recargo,
      totalAbonado: Number((abonosPorCuota[cuota.numero] ?? 0).toFixed(2)),
      total: cuota.total,
      registradoEn: "Migrado desde expediente histórico",
      origen: "Histórico",
      observacion: cuota.observacion,
      vencimiento: cuota.vence,
    });
  }

  function closePaymentDetailModal() {
    setPaymentDetailModal(null);
  }

  function openAdvanceModal() {
    setAdvanceForm({
      cuotaNumero: cuotaActualSugerida,
      monto: "",
      fecha: new Date().toISOString().slice(0, 10),
      observacion: `Abono parcial aplicado a la cuota #${cuotaActualSugerida}.`,
    });
    setIsAdvanceModalOpen(true);
  }

  function closeAdvanceModal() {
    setIsAdvanceModalOpen(false);
  }

  async function handleAdvanceFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submittingPayment) return;

    const amount = Number(advanceForm.monto);
    if (amount <= 0) {
      setMonitorSearchError("Ingresa un monto válido para el abono.");
      return;
    }

    if (advanceModalMaxAmount <= 0) {
      setMonitorSearchError("Esta cuota no admite más abonos. Para completarla usa Registrar pago de cuota.");
      return;
    }

    if (amount > advanceModalMaxAmount + 0.0001) {
      setMonitorSearchError(`El abono supera el límite permitido para esta cuota. Máximo: ${formatMoneyUSD(advanceModalMaxAmount)}.`);
      return;
    }

    setSubmittingPayment(true);
    setMonitorSearchError("");

    try {
      const cuotaText = String(advanceForm.cuotaNumero).padStart(2, "0");
      const response = await fetch(`${API_BASE}/api/monitor-cuotas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "advance",
          cedula: selectedMonitorProfile.cedula,
          amount,
          paymentDate: advanceForm.fecha,
          reference: `ABN-C${cuotaText}-${Date.now()}`,
          bank: "Registro operativo SAN",
          method: "Transferencia",
          note: `Cuota objetivo #${advanceForm.cuotaNumero}. ${advanceForm.observacion}`.trim(),
        }),
      });

      const data = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !data.ok) {
        setMonitorSearchError(data.message || "No se pudo registrar el abono.");
        return;
      }

      await syncMonitorDossierByCedula(selectedMonitorProfile.cedula);
      closeAdvanceModal();
    } catch {
      setMonitorSearchError("No se pudo registrar el abono en este momento.");
    } finally {
      setSubmittingPayment(false);
    }
  }

  function downloadPaymentReceipt(detail: InstallmentPaymentDetail) {
    const popup = window.open("", "_blank", "width=900,height=700");

    if (!popup) {
      setMonitorSearchError("No se pudo abrir la ventana para generar el comprobante.");
      return;
    }

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Comprobante Cuota #${detail.cuotaNumero}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 32px; color: #111827; }
      h1 { font-size: 20px; margin: 0 0 6px; }
      .sub { color: #4b5563; margin: 0 0 20px; }
      .box { border: 1px solid #d1d5db; border-radius: 10px; padding: 14px; margin-bottom: 14px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em; }
      .value { font-size: 14px; font-weight: 600; margin-top: 4px; }
      .footer { margin-top: 20px; font-size: 11px; color: #6b7280; }
      @media print { body { margin: 18px; } }
    </style>
  </head>
  <body>
    <h1>Comprobante de pago de cuota</h1>
    <p class="sub">Cliente: ${escapeHtml(selectedMonitorClient.nombre)} · Documento: ${escapeHtml(selectedMonitorClient.documento)}</p>

    <div class="box grid">
      <div><div class="label">Cuota</div><div class="value">#${detail.cuotaNumero}</div></div>
      <div><div class="label">Estado</div><div class="value">${escapeHtml(detail.estado)}</div></div>
      <div><div class="label">Origen</div><div class="value">${escapeHtml(detail.origen)}</div></div>
      <div><div class="label">Fecha de pago</div><div class="value">${escapeHtml(detail.fechaPago)}</div></div>
      <div><div class="label">Vencimiento</div><div class="value">${escapeHtml(detail.vencimiento)}</div></div>
      <div><div class="label">Metodo</div><div class="value">${escapeHtml(detail.metodo)}</div></div>
      <div><div class="label">Banco</div><div class="value">${escapeHtml(detail.banco)}</div></div>
      <div><div class="label">Referencia</div><div class="value">${escapeHtml(detail.referencia)}</div></div>
    </div>

    <div class="box grid">
      <div><div class="label">Monto base</div><div class="value">${escapeHtml(formatMoneyUSD(detail.montoBase))}</div></div>
      <div><div class="label">Recargo</div><div class="value">${escapeHtml(formatMoneyUSD(detail.recargo))}</div></div>
      <div><div class="label">Total pagado</div><div class="value">${escapeHtml(formatMoneyUSD(detail.total))}</div></div>
      <div><div class="label">Registrado en sistema</div><div class="value">${escapeHtml(detail.registradoEn)}</div></div>
    </div>

    <div class="box">
      <div class="label">Observacion</div>
      <div class="value" style="font-weight:500;">${escapeHtml(detail.observacion || "Sin observaciones adicionales.")}</div>
    </div>

    <p class="footer">TEAM SAN · Comprobante generado ${escapeHtml(new Date().toLocaleString("es-VE"))}</p>

    <script>
      window.onload = function() { window.print(); };
    </script>
  </body>
</html>`;

    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  }

  function openDocumentViewer(title: string, subtitle: string, image: string, summary: string, fields: DocumentViewerField[]) {
    setDocumentViewer({ title, subtitle, image, summary, fields });
  }

  function closeDocumentViewer() {
    setDocumentViewer(null);
  }

  async function handlePaymentFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!paymentModalCuota || submittingPayment) return;

    const cuotaActual = cronogramaCompletoCuotas.find((item) => item.numero === paymentModalCuota);

    if (!cuotaActual) return;

    if (paymentModalMontoRegistrar <= 0) {
      setMonitorSearchError("La cuota ya está cubierta con abonos registrados.");
      return;
    }

    setSubmittingPayment(true);
    setMonitorSearchError("");

    try {
      const response = await fetch(`${API_BASE}/api/monitor-cuotas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "installment",
          cedula: selectedMonitorProfile.cedula,
          installmentNumber: paymentModalCuota,
          amount: paymentModalMontoRegistrar,
          paymentDate: paymentForm.fecha,
          reference: paymentForm.referencia,
          bank: paymentForm.banco,
          method: paymentForm.metodo,
          note: paymentForm.observacion,
        }),
      });

      const data = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !data.ok) {
        setMonitorSearchError(data.message || "No se pudo registrar el pago de la cuota.");
        return;
      }

      await syncMonitorDossierByCedula(selectedMonitorProfile.cedula);
      closePaymentModal();
    } catch {
      setMonitorSearchError("No se pudo registrar el pago en este momento.");
    } finally {
      setSubmittingPayment(false);
    }
  }

  const navItems = [
    { id: "resumen", label: "Resumen", icon: LayoutDashboard },
    { id: "monitor-cuotas", label: "Monitor de cuotas", icon: Activity },
    { id: "financiamiento", label: "Financiamiento por modelo", icon: Wallet },
    { id: "financiados", label: "Financiados", icon: Users },
    { id: "contratos", label: "Contratos", icon: FileCheck2 },
    { id: "novedades", label: "Novedades", icon: Newspaper },
    { id: "auditoria", label: "Auditoría", icon: ShieldCheck },
    { id: "register-user", label: "Register user", icon: UserPlus },
  ] as const;

  useEffect(() => {
    setIsHydrated(true);
    setClock(new Date());

    const timer = setInterval(() => {
      setClock(new Date());
      setAlerts((prev) => {
        const copy = [...prev];
        const head = copy.shift();
        return head ? [...copy, head] : prev;
      });

      setInstruments((prev) =>
        prev.map((item) => {
          const nextSeries = moveSeries(item.series, item.trend);
          const nextValueBase = item.value + (Math.random() * 0.08 - 0.04);
          const precision = item.format === "decimal4" ? 4 : 2;
          const nextValue = Number(clamp(nextValueBase, 0.4, 9999).toFixed(precision));
          const nextChange = Number((item.change + (Math.random() * 0.16 - 0.08)).toFixed(2));

          return {
            ...item,
            value: nextValue,
            change: nextChange,
            series: nextSeries,
          };
        })
      );

      setTreasuryFlow((prev) => {
        const hours = new Date().getHours().toString().padStart(2, "0");
        const minutes = new Date().getMinutes().toString().padStart(2, "0");
        const slot = `${hours}:${minutes}`;
        const last = prev[prev.length - 1] ?? { ingresos: 9.5, egresos: 4.8 };

        const nextRow = {
          slot,
          ingresos: Number(clamp(last.ingresos + (Math.random() * 0.8 - 0.3), 7.4, 13.8).toFixed(2)),
          egresos: Number(clamp(last.egresos + (Math.random() * 0.6 - 0.3), 3.1, 7.2).toFixed(2)),
        };

        return [...prev.slice(1), nextRow];
      });

      setRecoveryRate((prev) => Number(clamp(prev + (Math.random() * 0.8 - 0.4), 88.5, 96.5).toFixed(1)));
      setCashCoverage((prev) => Number(clamp(prev + (Math.random() * 0.2 - 0.1), 1.8, 3.2).toFixed(2)));

      setMotoMarketFeed((prev) => {
        const updated = prev.map((item) => {
          const basePrice = Number(item.value.replace(/[$,]/g, ""));
          const nextPrice = Math.round(clamp(basePrice + (Math.random() * 90 - 45), 1200, 7400));
          const nextChange = Number((item.change + (Math.random() * 0.9 - 0.45)).toFixed(2));

          return {
            ...item,
            value: `$${nextPrice.toLocaleString("en-US")}`,
            change: nextChange,
          };
        });

        const head = updated[0];
        return head ? [...updated.slice(1), head] : updated;
      });

      setAgencyMarketRows((prev) =>
        prev.map((row) => {
          const nextPrice = Number(clamp(row.priceUsd + (Math.random() * 120 - 60), 1300, 7800).toFixed(0));
          const nextVariation = Number((row.variation + (Math.random() * 0.8 - 0.4)).toFixed(2));
          const nextStock = Number(clamp(row.stock + Math.round(Math.random() * 4 - 2), 6, 48));

          return {
            ...row,
            priceUsd: nextPrice,
            variation: nextVariation,
            stock: nextStock,
          };
        })
      );

      setReleaseLive((prev) => ({
        actual: Number(clamp(prev.actual + (Math.random() * 16 - 8), 1200, 1450).toFixed(0)),
        survey: Number(clamp(prev.survey + (Math.random() * 12 - 6), 1200, 1450).toFixed(0)),
        prior: Number(clamp(prev.prior + (Math.random() * 10 - 5), 1180, 1430).toFixed(0)),
        revised: Number(clamp(prev.revised + (Math.random() * 10 - 5), 1180, 1450).toFixed(0)),
      }));

      setMovementSeries((prev) => {
        const time = new Date();
        const slot = `${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}`;
        const last = prev[prev.length - 1]?.index ?? 4760;
        const next = Number(clamp(last + (Math.random() * 42 - 18), 4550, 4960).toFixed(2));
        return [...prev.slice(1), { slot, index: next }];
      });
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  function handleNav(sectionId: string) {
    if (
      sectionId === "monitor-cuotas" ||
      sectionId === "financiamiento" ||
      sectionId === "financiados" ||
      sectionId === "contratos" ||
      sectionId === "auditoria" ||
      sectionId === "register-user"
    ) {
      setActiveSection(sectionId);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setActiveSection("resumen");

    requestAnimationFrame(() => {
      const section = document.getElementById(sectionId);

      if (section) {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  return (
    <div className="min-h-screen bg-[#eceff3] text-zinc-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-zinc-200 bg-[#eef0f3] lg:block">
          <div className="flex h-[68px] items-center bg-black px-5">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">SAN</p>
              <p className="text-sm font-semibold text-white">ADMIN INDUSTRIAL</p>
            </div>
          </div>

          <div className="p-5">
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleNav(item.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
                      isActive
                        ? "bg-white text-zinc-950 shadow-sm"
                        : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>

            <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Sesión Admin</p>
              <p className="mt-2 font-medium text-zinc-800">{user.nombre}</p>
              <p className="text-xs">{user.email}</p>
              <p className="mt-2 text-xs">Último corte: {clockTimeText}</p>
            </div>
          </div>
        </aside>

        <main className="flex flex-1 flex-col">
          <header className="flex h-[68px] items-center justify-between bg-black px-4 text-white lg:px-7">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Dashboard Administrador</p>
              <h1 className="text-lg font-semibold">Centro Industrial SAN</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden rounded-full bg-zinc-900 px-3 py-1 text-sm md:inline">
                {clockTimeText}
              </span>
              <button className="grid h-10 w-10 place-content-center rounded-full bg-zinc-900 text-zinc-200">
                <Bell className="h-4 w-4" />
              </button>
              <form action="/api/auth/logout" method="POST">
                <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-zinc-900">
                  <LogOut className="h-4 w-4" />
                  Salir
                </button>
              </form>
            </div>
          </header>

          <div className="mx-auto w-full max-w-7xl p-4 lg:p-7">
        {activeSection === "resumen" && (
        <section id="resumen" className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-sm text-zinc-500">Ingresos acumulados</p>
            <p className="mt-1 text-3xl font-semibold text-emerald-600">$96,600</p>
            <p className="mt-1 text-xs text-zinc-500">+14.2% vs trimestre anterior</p>
          </article>
          <article className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-sm text-zinc-500">Contratos activos</p>
            <p className="mt-1 text-3xl font-semibold text-zinc-900">148</p>
            <p className="mt-1 text-xs text-zinc-500">22 en aprobación final</p>
          </article>
          <article className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-sm text-zinc-500">Flota operativa</p>
            <p className="mt-1 text-3xl font-semibold text-sky-700">207</p>
            <p className="mt-1 text-xs text-zinc-500">32 en taller</p>
          </article>
          <article className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-sm text-zinc-500">Administrador activo</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{user.nombre}</p>
            <p className="mt-1 text-xs text-zinc-500">{user.email}</p>
          </article>
        </section>
        )}

        {activeSection === "monitor-cuotas" && (
        <section id="monitor-cuotas" className="space-y-4 scroll-mt-24">
          <article className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Cobranza Operativa SAN</p>
                <h2 className="text-lg font-semibold text-zinc-900">Monitor de cuotas integrado</h2>
                <p className="text-sm text-zinc-500">Flujo empresarial para identificar morosidad, clientes al día y ejecución de cobros.</p>
              </div>
              <div className="w-full max-w-md">
                <form onSubmit={handleMonitorSearch} className="rounded-xl border border-zinc-200 bg-zinc-50 p-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Buscar por cédula</label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                      <input
                        value={monitorCedulaSearch}
                        onChange={(event) => {
                          setMonitorCedulaSearch(event.target.value);
                          if (monitorSearchError) setMonitorSearchError("");
                        }}
                        placeholder="Ej: 32464663"
                        className="h-10 w-full rounded-lg border border-zinc-300 bg-white pl-8 pr-3 text-sm text-zinc-800 outline-none focus:border-zinc-500"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={monitorSearchLoading}
                      className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {monitorSearchLoading ? "Consultando..." : "Abrir expediente"}
                    </button>
                  </div>
                  {monitorSearchError ? <p className="mt-2 text-xs text-rose-600">{monitorSearchError}</p> : null}
                </form>
                <div className="mt-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">
                  Corte en línea · {clockTimeText}
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-3">
              <button
                onClick={() => setMonitorTab("operaciones")}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  monitorTab === "operaciones" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                }`}
              >
                Operaciones de cobranza
              </button>
            </div>
          </article>

          {monitorLoadError ? (
            <div className="mt-3 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-900">No se pudieron cargar los expedientes</p>
                <p className="mt-1 text-xs text-amber-800">{monitorLoadError}</p>
                <p className="mt-1 text-xs font-semibold text-amber-900">
                  Tus expedientes siguen guardados: solo se eliminan a mano desde el botón «Eliminar participante».
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadMonitorClients()}
                className="rounded-lg border border-amber-400 bg-white px-3 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
              >
                Reintentar
              </button>
            </div>
          ) : null}

          {monitorTab === "expediente" && (
            <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
              <div className="border-b border-zinc-200 bg-gradient-to-r from-zinc-950 via-zinc-900 to-sky-950 px-5 py-5 text-white lg:px-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-300">Consulta individual por cédula</p>
                    <h3 className="mt-2 text-2xl font-semibold">Registro integral del titular</h3>
                    <p className="mt-1 text-sm text-zinc-300">Visualización ordenada del expediente del cliente, similar a una ficha de validación administrativa.</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right backdrop-blur">
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Resultado encontrado</p>
                    <p className="mt-1 text-lg font-semibold">C.I. {selectedMonitorProfile.cedula}</p>
                    <p className="text-sm text-zinc-300">{selectedMonitorClient.nombre}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-6 p-4 lg:p-6">
                <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                  <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Identificación principal</p>
                    <div className="mt-4 flex flex-col items-center text-center">
                      <Image
                        src={selectedMonitorProfile.fotoPersona}
                        alt="Foto del cliente"
                        width={280}
                        height={320}
                        unoptimized
                        className="h-56 w-48 rounded-2xl border border-zinc-200 bg-white object-cover shadow-sm"
                      />
                      <h4 className="mt-4 text-xl font-semibold text-zinc-900">{selectedMonitorClient.nombre}</h4>
                      <p className="text-sm font-medium text-zinc-500">Cédula de identidad</p>
                      <p className="text-2xl font-bold tracking-wide text-zinc-950">V-{selectedMonitorProfile.cedula}</p>
                      <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${clienteSolvente ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {clienteSolvente ? "Cliente solvente" : "Cliente con cuotas pendientes"}
                      </span>
                    </div>

                    <div className="mt-5 space-y-3 rounded-xl border border-zinc-200 bg-white p-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-zinc-500">Documento consultado</span>
                        <span className="font-semibold text-zinc-900">{selectedMonitorClient.documento}</span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-zinc-500">Teléfono</span>
                        <span className="font-semibold text-zinc-900">{selectedMonitorClient.telefono}</span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-zinc-500">Grupo</span>
                        <span className="font-semibold text-zinc-900">{selectedMonitorClient.agencia}</span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-zinc-500">Ingreso</span>
                        <span className="font-semibold text-zinc-900">{selectedMonitorProfile.fechaIngreso}</span>
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Biometría</p>
                          <h5 className="text-sm font-semibold text-zinc-900">Huellas dactilares registradas</h5>
                        </div>
                        <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                          Validación visual
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-2">
                          <div className="flex h-28 items-center justify-center overflow-hidden rounded-lg bg-white">
                            <Image
                              src="/Documentos/huella dactilar.jpeg"
                              alt="Huella dactilar izquierda"
                              width={220}
                              height={220}
                              className="h-full w-full object-contain"
                            />
                          </div>
                          <p className="mt-2 text-center text-xs font-semibold text-zinc-700">Huella izquierda</p>
                        </div>

                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-2">
                          <div className="flex h-28 items-center justify-center overflow-hidden rounded-lg bg-white">
                            <Image
                              src="/Documentos/Huella dactilar 2.jpeg"
                              alt="Huella dactilar derecha"
                              width={220}
                              height={220}
                              className="h-full w-full object-contain"
                            />
                          </div>
                          <p className="mt-2 text-center text-xs font-semibold text-zinc-700">Huella derecha</p>
                        </div>
                      </div>
                    </div>
                  </article>

                  <div className="space-y-4">
                    <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Datos personales del ciudadano</p>
                        <h4 className="mt-1 text-base font-semibold text-zinc-900">Ficha de identificación administrativa</h4>
                        <p className="text-sm text-zinc-500">Consulta formal vinculada a la cédula ingresada en el sistema.</p>
                      </div>

                      <div className="grid gap-4 border-b border-zinc-200 p-4 md:grid-cols-3">
                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Nº expediente</p>
                          <p className="mt-1 text-sm font-semibold text-zinc-900">{codigoExpediente}</p>
                        </div>
                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Documento</p>
                          <p className="mt-1 text-sm font-semibold text-zinc-900">V-{documentoNormalizado}</p>
                        </div>
                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Condición del cliente</p>
                          <p className="mt-1 text-sm font-semibold text-zinc-900">{clienteSolvente ? "Solvente" : "Con obligaciones pendientes"}</p>
                        </div>
                      </div>

                      <div className="p-4">
                        <div className="overflow-hidden rounded-2xl border border-zinc-200">
                          <div className="grid bg-zinc-100 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 md:grid-cols-[220px_minmax(0,1fr)]">
                            <div className="border-b border-zinc-200 px-4 py-3 md:border-b-0 md:border-r">Campo</div>
                            <div className="px-4 py-3">Información registrada</div>
                          </div>

                          {[ 
                            ["Nombres", nombresCiudadano],
                            ["Apellidos", apellidosCiudadano],
                            ["Cédula de identidad", `V-${documentoNormalizado}`],
                            ["Nombre completo", selectedMonitorClient.nombre],
                            ["Teléfono principal", selectedMonitorClient.telefono],
                            ["Dirección de habitación", selectedMonitorProfile.direccion],
                            ["Ocupación", selectedMonitorProfile.ocupacion],
                            ["Empresa o actividad económica", selectedMonitorProfile.empresa],
                            ["Referencias", selectedMonitorProfile.references || "No registradas"],
                            ["Usuario de acceso", selectedMonitorProfile.credenciales?.usuario || selectedMonitorProfile.username || "No registrado"],
                            [
                              "Clave de acceso",
                              selectedMonitorProfile.credenciales?.disponible
                                ? selectedMonitorProfile.credenciales.clave
                                : "Pendiente de guardar (ver tarjeta «Credenciales de acceso»)",
                            ],
                            ["Grupo Asignado correspondiente actual", selectedMonitorClient.agencia],
                            ["Gestor responsable", selectedMonitorClient.gestor || "Gestor asignado por agencia"],
                            ["Plan contratado", selectedMonitorProfile.plan],
                            ["Fecha de ingreso", selectedMonitorProfile.fechaIngreso],
                            ["Próximo vencimiento", selectedMonitorClient.proximoVencimiento],
                            ["Estado de cartera", selectedMonitorClient.estado],
                          ].map(([label, value], index) => (
                            <div key={label} className="grid md:grid-cols-[220px_minmax(0,1fr)]">
                              <div className={`border-zinc-200 bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 md:border-r ${index !== 16 ? "border-b" : ""}`}>
                                {label}
                              </div>
                              <div className={`bg-white px-4 py-3 text-sm font-medium text-zinc-900 ${index !== 16 ? "border-b border-zinc-200" : ""}`}>
                                {value}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </article>

                    <article className="rounded-2xl border border-zinc-200 bg-white p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Credenciales de acceso</p>
                          <h5 className="text-sm font-semibold text-zinc-900">Usuario y clave del miembro</h5>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleGenerateCredentials(selectedMonitorProfile.cedula, selectedMonitorClient.id)}
                          disabled={credentialsBusyCedula === selectedMonitorProfile.cedula}
                          className="rounded-lg border border-zinc-900 bg-zinc-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {credentialsBusyCedula === selectedMonitorProfile.cedula
                            ? "Guardando..."
                            : selectedMonitorProfile.credenciales?.disponible
                              ? "Generar nueva clave"
                              : "Generar clave nueva"}
                        </button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Usuario</p>
                          <p className="mt-1 break-all font-mono text-sm font-semibold text-zinc-900">
                            {selectedMonitorProfile.credenciales?.usuario || selectedMonitorProfile.username || "No registrado"}
                          </p>
                        </div>

                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Clave</p>
                          {selectedMonitorProfile.credenciales?.disponible ? (
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <span className="break-all font-mono text-sm font-semibold text-zinc-900">
                                {selectedMonitorProfile.credenciales.clave}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  void navigator.clipboard?.writeText(selectedMonitorProfile.credenciales?.clave ?? "");
                                  setCredentialsNotice("Clave copiada al portapapeles.");
                                }}
                                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100"
                              >
                                Copiar
                              </button>
                            </div>
                          ) : (
                            <div className="mt-2 space-y-2">
                              <p className="text-xs font-medium text-zinc-600">
                                Este miembro se registró antes de este cambio, así que su clave no está guardada.
                                Pega la clave que le entregaste (no cambia su acceso) o genera una nueva.
                              </p>
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  value={credentialsDraft}
                                  onChange={(event) => setCredentialsDraft(event.target.value.toUpperCase())}
                                  placeholder="SAN-MEMBER-XXXXXX"
                                  className="w-44 rounded-md border border-zinc-300 bg-white px-2 py-1 font-mono text-xs uppercase text-zinc-900"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleGenerateCredentials(selectedMonitorProfile.cedula, selectedMonitorClient.id, credentialsDraft)}
                                  disabled={
                                    credentialsBusyCedula === selectedMonitorProfile.cedula
                                    || !MEMBER_KEY_INPUT_PATTERN.test(credentialsDraft.trim().toUpperCase())
                                  }
                                  className="rounded-md border border-emerald-600 bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Guardar clave
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 sm:col-span-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Emitida / actualizada</p>
                          <p className="mt-1 text-sm font-semibold text-zinc-900">
                            {selectedMonitorProfile.credenciales?.disponible ? selectedMonitorProfile.credenciales.emitidaEn : "No registrada"}
                          </p>
                        </div>
                      </div>

                      {credentialsError ? (
                        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{credentialsError}</p>
                      ) : null}
                      {credentialsNotice ? (
                        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{credentialsNotice}</p>
                      ) : null}
                    </article>

                    <article className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Documento de identidad</p>
                            <h5 className="text-sm font-semibold text-zinc-900">Cédula escaneada</h5>
                          </div>
                          <button
                            type="button"
                            onClick={() => openDocumentViewer(
                              "Cédula escaneada",
                              `${selectedMonitorClient.nombre} · C.I. ${selectedMonitorProfile.cedula}`,
                              selectedMonitorProfile.fotoCedula,
                              "Documento principal de identificación del titular dentro del expediente.",
                              [
                                { label: "Titular", value: selectedMonitorClient.nombre },
                                { label: "Cédula", value: `V-${selectedMonitorProfile.cedula}` },
                                { label: "Código expediente", value: codigoExpediente },
                                { label: "Grupo", value: selectedMonitorClient.agencia },
                                { label: "Estado", value: "Verificado" },
                              ]
                            )}
                            className="text-xs font-semibold text-sky-700 hover:underline"
                          >
                            Ver completa
                          </button>
                        </div>
                        <Image src={selectedMonitorProfile.fotoCedula} alt="Cédula del cliente" width={640} height={420} unoptimized className="h-52 w-full rounded-xl border border-zinc-200 bg-white object-cover" />
                      </div>

                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Registro tributario</p>
                            <h5 className="text-sm font-semibold text-zinc-900">RIF del cliente</h5>
                          </div>
                          <button
                            type="button"
                            onClick={() => openDocumentViewer(
                              "RIF del cliente",
                              `${selectedMonitorClient.nombre} · Documento tributario`,
                              selectedMonitorProfile.fotoRif,
                              "Documento tributario archivado para validación comercial y fiscal.",
                              [
                                { label: "Titular", value: selectedMonitorClient.nombre },
                                { label: "Documento", value: rifDocumentoRecord?.nombre ?? "RIF vigente" },
                                { label: "Código expediente", value: codigoExpediente },
                                { label: "Empresa declarada", value: selectedMonitorProfile.empresa },
                                { label: "Grupo", value: selectedMonitorClient.agencia },
                                { label: "Estado", value: "Vigente" },
                              ]
                            )}
                            className="text-xs font-semibold text-sky-700 hover:underline"
                          >
                            Ver completo
                          </button>
                        </div>
                        <Image src={selectedMonitorProfile.fotoRif} alt="RIF del cliente" width={640} height={420} unoptimized className="h-52 w-full rounded-xl border border-zinc-200 bg-white object-cover" />
                      </div>
                    </article>
                  </div>
                </section>

                <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                  <article className="rounded-2xl border border-zinc-200 bg-white">
                    <div className="border-b border-zinc-200 px-4 py-3">
                      <h4 className="text-base font-semibold text-zinc-900">Activo solicitado por el cliente</h4>
                      <p className="text-sm text-zinc-500">Información detallada de la moto vinculada al expediente.</p>
                    </div>
                    <div className="grid gap-4 p-4 md:grid-cols-[280px_minmax(0,1fr)]">
                      <Image src={selectedMonitorProfile.motoImagen} alt={`Moto ${selectedMonitorProfile.motoMarca}`} width={560} height={360} className="h-56 w-full rounded-2xl border border-zinc-200 bg-zinc-50 object-contain p-4" />
                      <div className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Marca</p>
                            <p className="mt-1 text-sm font-semibold text-zinc-900">{selectedMonitorProfile.motoMarca}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Modelo</p>
                            <p className="mt-1 text-sm font-semibold text-zinc-900">{selectedMonitorProfile.motoModelo}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Plan de financiamiento</p>
                            <p className="mt-1 text-sm font-semibold text-zinc-900">{selectedMonitorProfile.plan}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Cuotas del plan</p>
                            <p className="mt-1 text-sm font-semibold text-zinc-900">{cuotasTotalesPlan} cuotas</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Valor por cuota</p>
                            <p className="mt-1 text-sm font-semibold text-zinc-900">{formatMoneyUSD(selectedMonitorProfile.cuotaMensual)}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Saldo que debe</p>
                            <p className="mt-1 text-sm font-semibold text-zinc-900">{formatMoneyUSD(deudaProyecto)}</p>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Ubicaciones del cliente</p>
                          <div className="mt-3 grid gap-3">
                            <div>
                              {selectedMonitorProfile.ubicacionLat != null && selectedMonitorProfile.ubicacionLng != null ? (
                                <SavedLocationPreview
                                  label="Ubicación del cliente"
                                  lat={selectedMonitorProfile.ubicacionLat}
                                  lng={selectedMonitorProfile.ubicacionLng}
                                />
                              ) : (
                                <MissingLocationPreview label="Ubicación del cliente" />
                              )}
                            </div>

                            {selectedMonitorProfile.referenciaLat != null && selectedMonitorProfile.referenciaLng != null ? (
                              <SavedLocationPreview
                                label="Ubicación de la referencia 1"
                                lat={selectedMonitorProfile.referenciaLat}
                                lng={selectedMonitorProfile.referenciaLng}
                              />
                            ) : (
                              <MissingLocationPreview label="Ubicación de la referencia 1" />
                            )}

                            {selectedMonitorProfile.referencia2Lat != null && selectedMonitorProfile.referencia2Lng != null ? (
                              <SavedLocationPreview
                                label="Ubicación de la referencia 2"
                                lat={selectedMonitorProfile.referencia2Lat}
                                lng={selectedMonitorProfile.referencia2Lng}
                              />
                            ) : (
                              <MissingLocationPreview label="Ubicación de la referencia 2" />
                            )}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Lectura ejecutiva</p>
                          <p className="mt-2 text-sm leading-6 text-zinc-700">
                            El cliente mantiene un plan de {cuotasTotalesPlan} cuotas para la unidad {selectedMonitorProfile.motoMarca} {selectedMonitorProfile.motoModelo}. Actualmente registra {cuotasPagadasCronograma} cuotas pagadas, {cuotasRestantes} pendientes y un saldo estimado de {formatMoneyUSD(deudaProyecto)}.
                          </p>
                        </div>
                      </div>
                    </div>
                  </article>

                  <article className="rounded-2xl border border-zinc-200 bg-white p-4 text-zinc-900 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Estado financiero actual</p>
                    <h4 className="mt-2 text-lg font-semibold text-zinc-900">Resumen integral de pagos</h4>
                    <div className="mt-4 grid gap-3 text-sm">
                      <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2"><span className="text-zinc-600">Cuota mensual</span><strong className="text-zinc-900">{formatMoneyUSD(selectedMonitorProfile.cuotaMensual)}</strong></div>
                      <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2"><span className="text-zinc-600">Cuotas pagadas</span><strong className="text-emerald-700">{cuotasPagadasCronograma}</strong></div>
                      <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2"><span className="text-zinc-600">Cuotas vencidas</span><strong className="text-rose-700">{cuotasVencidasCronograma}</strong></div>
                      <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2"><span className="text-zinc-600">Cuotas restantes</span><strong className="text-zinc-900">{cuotasRestantes}</strong></div>
                      <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2"><span className="text-zinc-600">Total pagado</span><strong className="text-emerald-700">{formatMoneyUSD(pagoAcumulado)}</strong></div>
                      <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2"><span className="text-zinc-600">Saldo pendiente por pagar</span><strong className="text-amber-700">{formatMoneyUSD(deudaProyecto)}</strong></div>
                    </div>

                    <div className="mt-4 grid gap-3 text-sm">
                      <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2 text-zinc-900">
                        <span className="text-zinc-500">Fecha del último pago</span>
                        <strong>{fechaUltimoPago}</strong>
                      </div>
                      <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2 text-zinc-900">
                        <span className="text-zinc-500">Método del último pago</span>
                        <strong>{metodoUltimoPago}</strong>
                      </div>
                      <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2 text-zinc-900">
                        <span className="text-zinc-500">Nivel de riesgo</span>
                        <strong className={`${
                          nivelRiesgoCliente === "Bajo"
                            ? "text-emerald-600"
                            : nivelRiesgoCliente === "Medio"
                              ? "text-amber-600"
                              : "text-rose-600"
                        }`}>{nivelRiesgoCliente}</strong>
                      </div>
                    </div>

                    <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
                        <span>Avance del plan</span>
                        <span>{Math.round((cuotasPagadasCronograma / Math.max(cuotasTotalesPlan, 1)) * 100)}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
                        <div className="h-full rounded-full bg-emerald-400" style={{ width: `${(cuotasPagadasCronograma / Math.max(cuotasTotalesPlan, 1)) * 100}%` }} />
                      </div>
                      <p className="mt-3 text-xs leading-5 text-zinc-600">
                        {clienteSolvente ? "El expediente se encuentra al día y sin mora activa." : "El expediente presenta compromisos activos que requieren seguimiento administrativo."}
                      </p>
                    </div>
                  </article>
                </section>

                {facturaPrincipal ? (
                  <section className="rounded-2xl border border-zinc-200 bg-white">
                    <div className="border-b border-zinc-200 px-4 py-3">
                      <h4 className="text-base font-semibold text-zinc-900">Factura principal del expediente</h4>
                      <p className="text-sm text-zinc-500">Documento fiscal principal vinculado a la compra del activo.</p>
                    </div>
                    <div className="grid gap-4 p-4 md:grid-cols-[280px_minmax(0,1fr)]">
                      <Image src={facturaPrincipal.archivo} alt={facturaPrincipal.nombre} width={560} height={380} unoptimized className="h-56 w-full rounded-2xl border border-zinc-200 bg-zinc-50 object-cover" />
                      <div className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Documento</p>
                            <p className="mt-1 text-sm font-semibold text-zinc-900">{facturaPrincipal.nombre}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Tipo</p>
                            <p className="mt-1 text-sm font-semibold text-zinc-900">{facturaPrincipal.tipo}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Fecha de emisión</p>
                            <p className="mt-1 text-sm font-semibold text-zinc-900">{facturaPrincipal.fecha}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Cliente facturado</p>
                            <p className="mt-1 text-sm font-semibold text-zinc-900">{selectedMonitorClient.nombre}</p>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                          La factura respalda la operación comercial principal del expediente y queda disponible para validación manual o auditoría.
                        </div>
                        <a href={facturaPrincipal.archivo} target="_blank" rel="noreferrer" className="inline-flex rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
                          Abrir factura completa
                        </a>
                      </div>
                    </div>
                  </section>
                ) : null}

                <section className="grid gap-4 xl:grid-cols-2">
                  <article className="rounded-2xl border border-zinc-200 bg-white">
                    <div className="border-b border-zinc-200 px-4 py-3">
                      <h4 className="text-base font-semibold text-zinc-900">Contratos asociados</h4>
                      <p className="text-sm text-zinc-500">Listado contractual ordenado, uno por uno.</p>
                    </div>
                    <div className="space-y-3 p-4">
                      {selectedMonitorProfile.contratos.map((contract, index) => (
                        <div key={contract.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Contrato {index + 1}</p>
                              <p className="text-sm font-semibold text-zinc-900">{contract.id}</p>
                            </div>
                            <span className="rounded-full bg-zinc-900 px-2 py-1 text-xs font-semibold text-white">{contract.estado}</span>
                          </div>
                          <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
                            <Image src={contract.archivo} alt={contract.tipo} width={320} height={220} unoptimized className="h-28 w-full rounded-xl border border-zinc-200 bg-white object-cover" />
                            <div className="grid gap-2 text-sm text-zinc-700">
                              <p><span className="font-semibold text-zinc-900">Tipo:</span> {contract.tipo}</p>
                              <p><span className="font-semibold text-zinc-900">Fecha:</span> {contract.fecha}</p>
                              <p><span className="font-semibold text-zinc-900">Monto:</span> {formatMoneyUSD(contract.monto)}</p>
                              <a href={contract.archivo} target="_blank" rel="noreferrer" className="inline-flex text-xs font-semibold text-sky-700 hover:underline">Abrir contrato completo</a>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="rounded-2xl border border-zinc-200 bg-white">
                    <div className="border-b border-zinc-200 px-4 py-3">
                      <h4 className="text-base font-semibold text-zinc-900">Documentos y soportes</h4>
                      <p className="text-sm text-zinc-500">Un registro por tipo de documento del expediente.</p>
                    </div>
                    <div className="space-y-3 p-4">
                      {documentosComplementarios.map((doc) => (
                        <div key={doc.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">{doc.tipo}</p>
                              <p className="text-sm font-semibold text-zinc-900">{doc.nombre}</p>
                            </div>
                            <span className="text-xs font-medium text-zinc-500">{doc.fecha}</span>
                          </div>
                          <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
                            <Image src={doc.archivo} alt={doc.nombre} width={320} height={220} unoptimized className="h-28 w-full rounded-xl border border-zinc-200 bg-white object-cover" />
                            <div className="grid gap-2 text-sm text-zinc-700">
                              <p><span className="font-semibold text-zinc-900">Tipo:</span> {doc.tipo}{doc.variante ? ` · ${doc.variante}` : ""}</p>
                              <p>Documento archivado y validado dentro del expediente consultado.</p>
                              <a href={doc.archivo} target="_blank" rel="noreferrer" className="inline-flex text-xs font-semibold text-sky-700 hover:underline">Abrir documento completo</a>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                </section>

                <section className="rounded-2xl border border-zinc-200 bg-white">
                  <div className="border-b border-zinc-200 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h4 className="text-base font-semibold text-zinc-900">Abonos registrados</h4>
                        <p className="text-sm text-zinc-500">Pagos parciales aplicados al saldo del cliente.</p>
                      </div>
                      <button
                        type="button"
                        onClick={openAdvanceModal}
                        className="inline-flex rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                      >
                        Registrar abono
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-4 border-b border-zinc-200 p-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Total abonado</p>
                      <p className="mt-1 text-2xl font-semibold text-emerald-600">{formatMoneyUSD(totalAbonadoAplicado)}</p>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 md:col-span-2">
                      {currentAdvancePayments.length === 0 ? (
                        <p className="text-sm text-zinc-500">Aún no hay abonos registrados para este expediente.</p>
                      ) : (
                        <div className="space-y-2">
                          {currentAdvancePayments.slice(0, 4).map((abono) => (
                            <div key={abono.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm">
                              <span className="font-medium text-zinc-900">{abono.paymentDate} · {abono.reference}</span>
                              <span className="text-zinc-600">{abono.bank}</span>
                              <span className="font-semibold text-emerald-700">{formatMoneyUSD(abono.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <section id="monitor-cuotas-cronograma" className="rounded-2xl border border-zinc-200 bg-white scroll-mt-24">
                  <div className="border-b border-zinc-200 px-4 py-3">
                    <h4 className="text-base font-semibold text-zinc-900">Cronograma completo de cuotas</h4>
                    <p className="text-sm text-zinc-500">Detalle ordenado una por una de las {cuotasTotalesPlan} cuotas del plan.</p>
                  </div>

                  <div className="grid gap-4 border-b border-zinc-200 p-4 md:grid-cols-4">
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Total cuotas</p>
                      <p className="mt-1 text-2xl font-semibold text-zinc-900">{cuotasTotalesPlan}</p>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Pagadas</p>
                      <p className="mt-1 text-2xl font-semibold text-emerald-600">{cuotasPagadasCronograma}</p>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Vencidas</p>
                      <p className="mt-1 text-2xl font-semibold text-rose-600">{cuotasVencidasCronograma}</p>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Restantes</p>
                      <p className="mt-1 text-2xl font-semibold text-zinc-900">{cuotasRestantes}</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto p-4">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200 text-left text-zinc-500">
                          <th className="py-3 pr-3">Nº cuota</th>
                          <th className="py-3 pr-3">Vencimiento</th>
                          <th className="py-3 pr-3">Monto base</th>
                          <th className="py-3 pr-3">Abono</th>
                          <th className="py-3 pr-3">Total</th>
                          <th className="py-3 pr-3">Estado</th>
                          <th className="py-3">Observación</th>
                          <th className="py-3 pl-3 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cronogramaCompletoCuotas.map((cuota) => (
                          <tr
                            key={cuota.id}
                            className={`border-b border-zinc-100 align-top text-zinc-700 ${
                              cuota.estado === "Pagada"
                                ? "bg-emerald-50/60"
                                : cuota.estado === "Vencida"
                                  ? "bg-rose-50/70"
                                  : cuota.estado === "Por vencer"
                                    ? "bg-amber-50/70"
                                    : "bg-white"
                            }`}
                          >
                            <td className="py-3 pr-3 font-semibold text-zinc-900">#{cuota.numero}</td>
                            <td className="py-3 pr-3">{cuota.vence}</td>
                            <td className="py-3 pr-3">{formatMoneyUSD(cuota.montoBase)}</td>
                            <td className="py-3 pr-3">{(abonosPorCuota[cuota.numero] ?? 0) > 0 ? formatMoneyUSD(abonosPorCuota[cuota.numero] ?? 0) : "—"}</td>
                            <td className="py-3 pr-3 font-semibold text-zinc-900">{formatMoneyUSD(cuota.total)}</td>
                            <td className="py-3 pr-3">
                              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                cuota.estado === "Pagada"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : cuota.estado === "Vencida"
                                    ? "bg-rose-100 text-rose-700"
                                    : cuota.estado === "Por vencer"
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-zinc-100 text-zinc-700"
                              }`}>
                                {cuota.estado}
                              </span>
                              {(() => {
                                const abonado = Number((abonosPorCuota[cuota.numero] ?? 0).toFixed(2));
                                if (abonado <= 0) return null;

                                const faltante = Math.max(0, Number((cuota.total - abonado).toFixed(2)));

                                return (
                                  <button
                                    type="button"
                                    className="mt-2 inline-flex rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700"
                                  >
                                    Esta cuota fue abonada: {formatMoneyUSD(abonado)} · Faltante: {formatMoneyUSD(faltante)}
                                  </button>
                                );
                              })()}
                              {cuota.registradaManual ? (
                                <p className="mt-1 text-[11px] font-medium text-emerald-700">Pago manual aplicado</p>
                              ) : null}
                              {cuota.numero === 1 && cuota.estado === "Pagada" ? (
                                <p className="mt-1 text-[11px] font-semibold text-emerald-700">Cliente solvente de la cuota #1 para ingreso al sistema</p>
                              ) : null}
                            </td>
                            <td className="py-3 text-sm text-zinc-600">{cuota.observacion}</td>
                            <td className="py-3 pl-3 text-right">
                              {cuota.estado === "Pagada" && !cuota.registradaManual ? (
                                <button
                                  type="button"
                                  onClick={() => openPaymentDetailModal(cuota)}
                                  className="inline-flex rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-200"
                                >
                                  Pago histórico
                                </button>
                              ) : (
                                <div className="inline-flex items-center gap-2">
                                  {cuota.estado === "Pagada" ? (
                                    <button
                                      type="button"
                                      onClick={() => openPaymentDetailModal(cuota)}
                                      className="inline-flex rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200"
                                    >
                                      Ver detalle
                                    </button>
                                  ) : null}
                                  {cuota.estado === "Pagada" ? (
                                    <button
                                      type="button"
                                      onClick={() => void handleUnmarkInstallmentPayment(cuota.numero)}
                                      className="inline-flex rounded-lg bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                                      disabled={submittingPayment}
                                    >
                                      Desmarcar pago
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => cuota.estado === "Pagada" ? openPaymentDetailModal(cuota) : openPaymentModal(cuota.numero)}
                                    className={`inline-flex rounded-lg px-3 py-2 text-xs font-semibold ${
                                      cuota.estado === "Pagada"
                                        ? "bg-zinc-100 text-zinc-500 hover:bg-zinc-100"
                                        : "bg-zinc-900 text-white hover:bg-zinc-800"
                                    }`}
                                    disabled={cuota.estado === "Pagada"}
                                  >
                                    {cuota.estado === "Pagada"
                                      ? cuota.numero === 1
                                        ? "Pagado y solvente"
                                        : "Pago consolidado"
                                      : "Registrar pago"}
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="rounded-2xl border border-zinc-200 bg-white">
                  <div className="border-b border-zinc-200 px-4 py-3">
                    <h4 className="text-base font-semibold text-zinc-900">Bitácora de pagos registrados</h4>
                    <p className="text-sm text-zinc-500">Movimientos cargados manualmente desde el expediente del cliente.</p>
                  </div>

                  {manualPaymentRecords.length === 0 ? (
                    <div className="p-6 text-sm text-zinc-500">
                      Aún no hay pagos manuales registrados desde esta ficha. Usa el botón <span className="font-semibold text-zinc-900">Registrar pago</span> en una cuota para crear el primer movimiento.
                    </div>
                  ) : (
                    <div className="space-y-3 p-4">
                      {manualPaymentRecords.map((record) => (
                        <article key={`${selectedMonitorClient.id}-payment-${record.cuotaNumero}`} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Cuota #{record.cuotaNumero}</p>
                              <h5 className="mt-1 text-sm font-semibold text-zinc-900">{record.metodo} · {formatMoneyUSD(record.monto)}</h5>
                            </div>
                            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Pago aplicado</span>
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-sm">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Fecha</p>
                              <p className="mt-1 font-medium text-zinc-900">{formatIsoDateToDMY(record.fecha)}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Referencia</p>
                              <p className="mt-1 font-medium text-zinc-900">{record.referencia}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Banco</p>
                              <p className="mt-1 font-medium text-zinc-900">{record.banco}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Registrado</p>
                              <p className="mt-1 font-medium text-zinc-900">{record.registradoEn}</p>
                            </div>
                          </div>

                          <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-700">
                            {record.observacion || "Sin observaciones adicionales."}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              {paymentModalCuota ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
                  <div className="w-full max-w-2xl rounded-3xl border border-zinc-200 bg-white shadow-2xl">
                    <div className="border-b border-zinc-200 px-5 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Registro de pago</p>
                      <h4 className="mt-1 text-lg font-semibold text-zinc-900">Registrar pago para la cuota #{paymentModalCuota}</h4>
                      <p className="text-sm text-zinc-500">Carga la información transaccional para dejar evidencia administrativa del cobro.</p>
                      {paymentModalAbonado > 0 && paymentModalCuotaData ? (
                        <button
                          type="button"
                          onClick={() => void syncMonitorDossierByCedula(selectedMonitorProfile.cedula)}
                          className="mt-2 inline-flex rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-700"
                        >
                          Esta cuota tiene abono aplicado: {formatMoneyUSD(paymentModalAbonado)} · Faltante: {formatMoneyUSD(paymentModalMontoRegistrar)}
                        </button>
                      ) : null}
                    </div>

                    <form onSubmit={handlePaymentFormSubmit} className="space-y-5 p-5">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Fecha de pago</label>
                          <input
                            type="date"
                            value={paymentForm.fecha}
                            onChange={(event) => setPaymentForm((current) => ({ ...current, fecha: event.target.value }))}
                            className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
                            required
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Método de pago</label>
                          <select
                            value={paymentForm.metodo}
                            onChange={(event) => setPaymentForm((current) => ({ ...current, metodo: event.target.value as ManualPaymentMethod }))}
                            className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
                          >
                            <option>Transferencia</option>
                            <option>Pago móvil</option>
                            <option>Zelle</option>
                            <option>Efectivo</option>
                            <option>Débito</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Referencia</label>
                          <input
                            type="text"
                            value={paymentForm.referencia}
                            onChange={(event) => setPaymentForm((current) => ({ ...current, referencia: event.target.value }))}
                            className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
                            placeholder="Ej: 0192837465"
                            required
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Banco receptor</label>
                          <input
                            type="text"
                            value={paymentForm.banco}
                            onChange={(event) => setPaymentForm((current) => ({ ...current, banco: event.target.value }))}
                            className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
                            placeholder="Banco de Venezuela"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Observación</label>
                        <textarea
                          value={paymentForm.observacion}
                          onChange={(event) => setPaymentForm((current) => ({ ...current, observacion: event.target.value }))}
                          className="min-h-28 w-full rounded-xl border border-zinc-300 px-3 py-3 text-sm outline-none focus:border-zinc-500"
                          placeholder="Detalle del pago, validación o nota administrativa"
                        />
                      </div>

                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                        <div className="flex items-center justify-between gap-3">
                          <span>Monto a registrar</span>
                          <strong className="text-zinc-900">{formatMoneyUSD(paymentModalMontoRegistrar)}</strong>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-3">
                        <button type="button" onClick={closePaymentModal} className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
                          Cancelar
                        </button>
                        <button type="submit" className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
                          {submittingPayment ? "Guardando..." : "Guardar pago"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              ) : null}

              {isAdvanceModalOpen ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
                  <div className="w-full max-w-xl rounded-3xl border border-zinc-200 bg-white shadow-2xl">
                    <div className="border-b border-zinc-200 px-5 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Abono parcial</p>
                      <h4 className="mt-1 text-lg font-semibold text-zinc-900">Registrar abono de cuota</h4>
                      <p className="text-sm text-zinc-500">Cuota actual sugerida: #{cuotaActualSugerida}. Puedes ajustarla si corresponde.</p>
                    </div>

                    <form onSubmit={handleAdvanceFormSubmit} className="space-y-5 p-5">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Cuota objetivo</label>
                          <select
                            value={advanceForm.cuotaNumero}
                            onChange={(event) => setAdvanceForm((current) => ({ ...current, cuotaNumero: Number(event.target.value) }))}
                            className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
                          >
                            {Array.from({ length: cuotasTotalesPlan }, (_, index) => index + 1).map((num) => (
                              <option key={`abono-cuota-${num}`} value={num}>Cuota #{num}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Monto abonado (USD)</label>
                          <input
                            type="number"
                            min={0.01}
                            step="0.01"
                            max={advanceModalMaxAmount > 0 ? advanceModalMaxAmount : undefined}
                            value={advanceForm.monto}
                            onChange={(event) => setAdvanceForm((current) => ({ ...current, monto: event.target.value }))}
                            className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
                            placeholder="Ej: 20"
                            required
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Fecha</label>
                          <input
                            type="date"
                            value={advanceForm.fecha}
                            onChange={(event) => setAdvanceForm((current) => ({ ...current, fecha: event.target.value }))}
                            className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Observación</label>
                        <textarea
                          value={advanceForm.observacion}
                          onChange={(event) => setAdvanceForm((current) => ({ ...current, observacion: event.target.value }))}
                          className="min-h-24 w-full rounded-xl border border-zinc-300 px-3 py-3 text-sm outline-none focus:border-zinc-500"
                          placeholder="Ej: Cliente abona parte de la cuota, saldo pendiente para próximo pago."
                        />
                      </div>

                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                        <p>Este abono se registra en el expediente y queda trazabilidad con cuota objetivo, fecha y observación.</p>
                        <p className="mt-1 font-semibold text-zinc-900">
                          Límite de abono para cuota #{advanceForm.cuotaNumero}: {formatMoneyUSD(advanceModalMaxAmount)}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">Para completar la cuota, usa el flujo de pago completo.</p>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-3">
                        <button type="button" onClick={closeAdvanceModal} className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
                          Cancelar
                        </button>
                        <button type="submit" className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
                          {submittingPayment ? "Guardando..." : "Guardar abono"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              ) : null}

              {paymentDetailModal ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
                  <div className="w-full max-w-2xl rounded-3xl border border-zinc-200 bg-white shadow-2xl">
                    <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Detalle de cuota pagada</p>
                        <h4 className="mt-1 text-lg font-semibold text-zinc-900">Cuota #{paymentDetailModal.cuotaNumero} · {paymentDetailModal.estado}</h4>
                        <p className="text-sm text-zinc-500">Origen del registro: {paymentDetailModal.origen}</p>
                      </div>
                      <button type="button" onClick={closePaymentDetailModal} className="rounded-full border border-zinc-200 p-2 text-zinc-600 hover:bg-zinc-50">
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="grid gap-4 p-5 md:grid-cols-2">
                      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Fecha de pago</p>
                        <p className="mt-1 text-sm font-semibold text-zinc-900">{paymentDetailModal.fechaPago}</p>
                      </div>
                      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Vencimiento</p>
                        <p className="mt-1 text-sm font-semibold text-zinc-900">{paymentDetailModal.vencimiento}</p>
                      </div>
                      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Método</p>
                        <p className="mt-1 text-sm font-semibold text-zinc-900">{paymentDetailModal.metodo}</p>
                      </div>
                      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Banco</p>
                        <p className="mt-1 text-sm font-semibold text-zinc-900">{paymentDetailModal.banco}</p>
                      </div>
                      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 md:col-span-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Referencia</p>
                        <p className="mt-1 text-sm font-semibold text-zinc-900 break-all">{paymentDetailModal.referencia}</p>
                      </div>
                    </div>

                    <div className="mx-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm">
                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="rounded-lg border border-zinc-200 bg-white p-3">
                          <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Monto base</p>
                          <p className="mt-1 font-semibold text-zinc-900">{formatMoneyUSD(paymentDetailModal.montoBase)}</p>
                        </div>
                        <div className="rounded-lg border border-zinc-200 bg-white p-3">
                          <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Recargo</p>
                          <p className="mt-1 font-semibold text-zinc-900">{formatMoneyUSD(paymentDetailModal.recargo)}</p>
                        </div>
                        <div className="rounded-lg border border-zinc-200 bg-white p-3">
                          <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Total pagado</p>
                          <p className="mt-1 font-semibold text-zinc-900">{formatMoneyUSD(paymentDetailModal.total)}</p>
                        </div>
                        <div className="rounded-lg border border-zinc-200 bg-white p-3">
                          <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Total abonado</p>
                          <p className="mt-1 font-semibold text-zinc-900">{formatMoneyUSD(paymentDetailModal.totalAbonado)}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-zinc-500">Registrado en sistema: {paymentDetailModal.registradoEn}</p>
                    </div>

                    <div className="px-5 pb-5 pt-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Observación</p>
                      <p className="mt-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
                        {paymentDetailModal.observacion || "Sin observaciones adicionales."}
                      </p>
                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={() => downloadPaymentReceipt(paymentDetailModal)}
                          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                        >
                          Descargar comprobante (PDF)
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {documentViewer ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                  <div className="w-full max-w-4xl overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl">
                    <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Vista completa del documento</p>
                        <h4 className="mt-1 text-lg font-semibold text-zinc-900">{documentViewer.title}</h4>
                        <p className="text-sm text-zinc-500">{documentViewer.subtitle}</p>
                      </div>
                      <button type="button" onClick={closeDocumentViewer} className="rounded-full border border-zinc-200 p-2 text-zinc-600 hover:bg-zinc-50">
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
                      <div className="flex items-center justify-center bg-zinc-100 p-4 lg:min-h-[560px] lg:p-5">
                        <div className="flex w-full items-center justify-center overflow-hidden rounded-2xl border border-zinc-200 bg-white p-3">
                          <Image
                            src={documentViewer.image}
                            alt={documentViewer.title}
                            width={1400}
                            height={900}
                            className="mx-auto h-auto max-h-[520px] w-auto max-w-full rounded-xl object-contain"
                          />
                        </div>
                      </div>

                      <div className="border-t border-zinc-200 bg-white lg:border-l lg:border-t-0">
                        <div className="border-b border-zinc-200 px-5 py-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Resumen</p>
                          <p className="mt-2 text-sm leading-6 text-zinc-700">{documentViewer.summary}</p>
                        </div>

                        <div className="px-5 py-4">
                          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Datos clave</p>
                          <div className="overflow-hidden rounded-2xl border border-zinc-200">
                            {documentViewer.fields.map((field, index) => (
                              <div key={field.label} className="grid grid-cols-[120px_minmax(0,1fr)]">
                                <div className={`bg-zinc-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 md:border-r md:border-zinc-200 ${index !== documentViewer.fields.length - 1 ? "border-b border-zinc-200" : ""}`}>
                                  {field.label}
                                </div>
                                <div className={`px-4 py-3 text-sm font-medium text-zinc-900 ${index !== documentViewer.fields.length - 1 ? "border-b border-zinc-200" : ""}`}>
                                  {field.value}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </article>
          )}

          {monitorTab === "operaciones" && (
          <>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <button
              type="button"
              onClick={() => {
                setMonitorFocusSearch("");
                setMonitorFocusGroup("todos");
              }}
              className="group rounded-3xl border border-zinc-200/80 bg-gradient-to-br from-white via-white to-zinc-50 p-5 text-left shadow-[0_20px_45px_-30px_rgba(15,23,42,0.28)] transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_28px_55px_-30px_rgba(2,132,199,0.35)]"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-zinc-500">Clientes en cartera</p>
                <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">Monitor</span>
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900">{cuotaMonitorStats.totalClientes}</p>
              <p className="mt-2 text-xs text-zinc-500">Seguimiento activo por grupo</p>
              <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 opacity-0 transition group-hover:opacity-100">
                Ver cartera completa <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMonitorFocusSearch("");
                setMonitorFocusGroup("atraso");
              }}
              className="group rounded-3xl border border-zinc-200/80 bg-gradient-to-br from-white via-white to-rose-50 p-5 text-left shadow-[0_20px_45px_-30px_rgba(15,23,42,0.28)] transition hover:-translate-y-0.5 hover:border-rose-300 hover:shadow-[0_28px_55px_-30px_rgba(225,29,72,0.4)]"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-zinc-500">Con atraso</p>
                <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-700">Atención</span>
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-rose-600">{cuotaMonitorStats.clientesEnAtraso}</p>
              <p className="mt-2 text-xs text-zinc-500">{cuotaMonitorStats.totalVencidas} cuotas vencidas</p>
              <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 opacity-0 transition group-hover:opacity-100">
                Ver clientes con retraso <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMonitorFocusSearch("");
                setMonitorFocusGroup("aldia");
              }}
              className="group rounded-3xl border border-zinc-200/80 bg-gradient-to-br from-white via-white to-emerald-50 p-5 text-left shadow-[0_20px_45px_-30px_rgba(15,23,42,0.28)] transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-[0_28px_55px_-30px_rgba(5,150,105,0.4)]"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-zinc-500">Al día</p>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Solvente</span>
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-emerald-600">{cuotaMonitorStats.clientesAlDia}</p>
              <p className="mt-2 text-xs text-zinc-500">Clientes sin mora vigente</p>
              <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 opacity-0 transition group-hover:opacity-100">
                Ver clientes al día <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </button>
            <article className="rounded-3xl border border-zinc-200/80 bg-gradient-to-br from-white via-white to-sky-50 p-5 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.28)]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-zinc-500">Saldo pendiente consolidado</p>
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900">{formatMoneyUSD(cuotaMonitorStats.carteraActiva)}</p>
              <p className="mt-2 text-xs text-zinc-500">Monto total pendiente por cobrar de las cuotas registradas en monitoreo.</p>
            </article>

          </div>

          <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
            <div className="space-y-4">
              <article className="rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-[0_24px_50px_-34px_rgba(15,23,42,0.35)]">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Agrupación activa</p>
                    <h3 className="mt-1 text-base font-semibold text-zinc-900">Participantes por grupo</h3>
                    <p className="mt-1 text-xs text-zinc-500">Resumen ejecutivo de comportamiento y cartera.</p>
                  </div>
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-600">
                    Live · {clockTimeText}
                  </span>
                </div>

                <div className="space-y-3">
                  {participantGroupSummaries.map((group) => (
                    <div key={group.grupo} className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-white to-zinc-50 p-3.5 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-zinc-900">{group.grupo}</p>
                          <p className="text-xs text-zinc-500">{group.total} participantes monitoreados</p>
                        </div>
                        <p className="text-sm font-semibold text-sky-700">{formatMoneyUSD(group.cartera)}</p>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${group.total > 0 ? (group.activos / group.total) * 100 : 0}%` }}
                        />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl bg-emerald-50 px-2 py-2 text-emerald-700">Activos: <span className="font-semibold">{group.activos}</span></div>
                        <div className="rounded-xl bg-rose-50 px-2 py-2 text-rose-700">En mora: <span className="font-semibold">{group.mora}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-[0_24px_50px_-34px_rgba(15,23,42,0.35)]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-zinc-900">Participantes prioritarios</h3>
                    <p className="text-xs text-zinc-500">Mayor saldo y seguimiento operativo.</p>
                  </div>
                  <span className="text-xs text-zinc-500">Top 6</span>
                </div>
                <div className="space-y-2">
                  {participantPriorityRows.map((item, index) => (
                    <button
                      key={`${item.id}-priority`}
                      type="button"
                      onClick={() => openMonitorClient(item.id, "expediente")}
                      className="flex w-full items-center justify-between rounded-2xl border border-zinc-200 bg-gradient-to-r from-white to-zinc-50 px-3 py-3 text-left shadow-sm transition hover:border-zinc-300 hover:shadow-md"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-zinc-900 text-xs font-semibold text-white">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <div>
                        <p className="text-sm font-semibold text-zinc-900">{item.nombre}</p>
                        <p className="text-xs text-zinc-500">{item.documento} · {item.grupo}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-zinc-900">{formatMoneyUSD(item.saldo)}</p>
                        <p className={`text-xs font-semibold ${item.estado === "Al día" ? "text-emerald-600" : "text-amber-700"}`}>{item.liveLabel}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </article>
            </div>

            <article className="overflow-hidden rounded-[28px] border border-zinc-200/80 bg-white shadow-[0_28px_60px_-36px_rgba(15,23,42,0.38)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-gradient-to-r from-zinc-50 via-white to-sky-50 px-5 py-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Mapa operativo de participantes</p>
                  <h3 className="mt-1 text-lg font-semibold text-zinc-900">Vista dinámica por grupo</h3>
                  <p className="text-sm text-zinc-500">Cada cuadro representa un grupo cerrado. Al abrirlo verás todos los participantes del grupo.</p>
                </div>
                <div className="w-full max-w-md space-y-2">
                  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-right shadow-sm">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Monitoreo</p>
                    <p className="text-sm font-semibold text-zinc-900">{participantRealtimeEntries.filter((item) => item.planType === "26").length} participantes (26 cuotas)</p>
                  </div>
                  <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600 shadow-sm">
                    <Search className="h-4 w-4 text-zinc-400" />
                    <input
                      value={groupSearchTerm}
                      onChange={(event) => {
                        setGroupSearchTerm(event.target.value);
                        setGroupCarouselStart(0);
                      }}
                      placeholder="Buscar grupo por número (ej: 20)"
                      className="w-full bg-transparent text-sm text-zinc-700 outline-none placeholder:text-zinc-400"
                    />
                  </label>
                </div>
              </div>

              <div className="border-b border-zinc-200 bg-zinc-50/50 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Mostrando {visibleGroupCards.length} de {filteredGroupSummaries.length} grupos
                  </p>
                  <div className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setGroupCarouselStart((current) => Math.max(0, current - 1))}
                      disabled={groupCarouselStart === 0}
                      className="rounded-lg border border-zinc-300 bg-white p-2 text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setGroupCarouselStart((current) => Math.min(Math.max(filteredGroupSummaries.length - 3, 0), current + 1))}
                      disabled={groupCarouselStart >= Math.max(filteredGroupSummaries.length - 3, 0)}
                      className="rounded-lg border border-zinc-300 bg-white p-2 text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visibleGroupCards.map((group) => (
                  <button
                    key={`${group.grupo}-tile`}
                    type="button"
                    onClick={() => {
                      setParticipantActionError("");
                      window.open(`/dashboard/group-sheet?group=${encodeURIComponent(group.grupo)}&planType=26`, "_blank", "noopener,noreferrer");
                    }}
                    className="rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-zinc-300 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="rounded-md bg-zinc-900 px-1.5 py-1 text-[10px] font-semibold tracking-[0.14em] text-white">{group.grupo.replace("Grupo ", "G")}</span>
                      <span className="text-[10px] font-semibold text-zinc-500">{group.total} participantes</span>
                    </div>
                    <div className="mt-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Grupo cerrado</p>
                      <h4 className="mt-1 line-clamp-2 text-sm font-semibold leading-4 text-zinc-900">{group.grupo}</h4>
                      <p className="mt-1 text-[11px] font-medium text-zinc-600">Cupos: {group.cuposOcupados}/{GROUP_CAPACITY}</p>
                      {group.grupoLleno ? (
                        <p className="mt-1 text-[11px] font-semibold text-rose-700">Grupo lleno</p>
                      ) : (
                        <p className="mt-1 text-[11px] text-emerald-700">Disponibles: {group.cuposDisponibles}</p>
                      )}
                      <p className="mt-2 text-[11px] font-medium text-zinc-600">Cartera en cuotas: {formatMoneyUSD(group.cartera)}</p>
                    </div>
                    <div className="mt-4 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[10px] text-zinc-500">Estado</p>
                        <p className="text-xs font-semibold text-emerald-700">Solventes: {group.activos}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-zinc-500">Pendientes</p>
                        <p className="text-xs font-semibold text-rose-700">Con deuda: {group.mora}</p>
                      </div>
                    </div>
                  </button>
                ))}
                </div>
                {filteredGroupSummaries.length === 0 ? (
                  <div className="rounded-xl border border-zinc-200 bg-white px-4 py-6 text-center text-sm text-zinc-500">
                    No se encontraron grupos para esa búsqueda.
                  </div>
                ) : null}
              </div>

              <div className="grid gap-3 px-5 py-5 md:grid-cols-3">
                <div className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-white to-zinc-50 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Leyenda</p>
                  <div className="mt-3 space-y-2 text-xs text-zinc-700">
                    <p><span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" /> <span className="ml-2">Participante solvente o al día</span></p>
                    <p><span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" /> <span className="ml-2">Participante con atraso controlado</span></p>
                    <p><span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-400" /> <span className="ml-2">Participante en riesgo o mora alta</span></p>
                  </div>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-white to-zinc-50 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Grupo con mayor cartera</p>
                  <p className="mt-3 text-lg font-semibold text-zinc-900">{topParticipantGroup?.grupo ?? "Grupo 01"}</p>
                  {topParticipantGroup && topParticipantGroup.cartera > 0 ? (
                    <p className="text-sm text-zinc-600">Saldo pendiente: {formatMoneyUSD(topParticipantGroup.cartera)}</p>
                  ) : (
                    <p className="text-sm text-zinc-600">Sin saldo pendiente registrado</p>
                  )}
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-white to-zinc-50 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Acción rápida</p>
                  <p className="mt-3 text-sm text-zinc-700">Abre un grupo para gestionar sus 26 cupos, editar expedientes y liberar espacios con control administrativo.</p>
                </div>
              </div>

              <div className="border-t border-zinc-200 bg-zinc-50/50 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Grupo 83 cuotas ciclón</p>
                    <h4 className="mt-1 text-base font-semibold text-zinc-900">Vista dinámica de grupos plan 83</h4>
                    <p className="text-xs text-zinc-500">Participantes del plan de 83 cuotas separados del flujo estándar de 26.</p>
                  </div>
                  <div className="w-full max-w-sm">
                    <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600 shadow-sm">
                      <Search className="h-4 w-4 text-zinc-400" />
                      <input
                        value={groupSearchTerm83}
                        onChange={(event) => {
                          setGroupSearchTerm83(event.target.value);
                          setGroupCarouselStart83(0);
                        }}
                        placeholder="Buscar grupo 83 por número"
                        className="w-full bg-transparent text-sm text-zinc-700 outline-none placeholder:text-zinc-400"
                      />
                    </label>
                  </div>
                </div>

                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Mostrando {visibleGroupCards83.length} de {filteredGroupSummaries83.length} grupos 83
                  </p>
                  <div className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setGroupCarouselStart83((current) => Math.max(0, current - 1))}
                      disabled={groupCarouselStart83 === 0}
                      className="rounded-lg border border-zinc-300 bg-white p-2 text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setGroupCarouselStart83((current) => Math.min(Math.max(filteredGroupSummaries83.length - 3, 0), current + 1))}
                      disabled={groupCarouselStart83 >= Math.max(filteredGroupSummaries83.length - 3, 0)}
                      className="rounded-lg border border-zinc-300 bg-white p-2 text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {visibleGroupCards83.map((group) => (
                    <button
                      key={`${group.grupo}-tile-83`}
                      type="button"
                      onClick={() => {
                        setParticipantActionError("");
                        window.open(`/dashboard/group-sheet?group=${encodeURIComponent(group.grupo)}&planType=83`, "_blank", "noopener,noreferrer");
                      }}
                      className="rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-zinc-300 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="rounded-md bg-sky-700 px-1.5 py-1 text-[10px] font-semibold tracking-[0.14em] text-white">83</span>
                        <span className="text-[10px] font-semibold text-zinc-500">{group.total} participantes</span>
                      </div>
                      <div className="mt-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Grupo ciclón</p>
                        <h4 className="mt-1 line-clamp-2 text-sm font-semibold leading-4 text-zinc-900">{group.grupo}</h4>
                        <p className="mt-1 text-[11px] font-medium text-zinc-600">Cupos: {group.cuposOcupados}/{GROUP_CAPACITY_83}</p>
                        {group.grupoLleno ? (
                          <p className="mt-1 text-[11px] font-semibold text-rose-700">Grupo lleno</p>
                        ) : (
                          <p className="mt-1 text-[11px] text-emerald-700">Disponibles: {group.cuposDisponibles}</p>
                        )}
                        <p className="mt-2 text-[11px] font-medium text-zinc-600">Cartera en cuotas: {formatMoneyUSD(group.cartera)}</p>
                      </div>
                      <div className="mt-4 flex items-end justify-between gap-3">
                        <div>
                          <p className="text-[10px] text-zinc-500">Estado</p>
                          <p className="text-xs font-semibold text-emerald-700">Solventes: {group.activos}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-zinc-500">Pendientes</p>
                          <p className="text-xs font-semibold text-rose-700">Con deuda: {group.mora}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {filteredGroupSummaries83.length === 0 ? (
                  <div className="mt-3 rounded-xl border border-zinc-200 bg-white px-4 py-6 text-center text-sm text-zinc-500">
                    No hay grupos activos para el plan de 83 cuotas.
                  </div>
                ) : null}
              </div>

              <div className="border-t border-zinc-200 px-5 py-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Desglose por grupos</p>
                    <h4 className="mt-1 text-base font-semibold text-zinc-900">Participantes agrupados por equipo operativo</h4>
                  </div>
                  <div className="inline-flex items-center gap-2">
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[11px] font-semibold text-zinc-600">
                      {participantGroupSummaries.length} grupos activos
                    </span>
                    <button
                      type="button"
                      onClick={() => setGroupBreakdownStart((current) => Math.max(0, current - 1))}
                      disabled={groupBreakdownStart === 0}
                      className="rounded-lg border border-zinc-300 bg-white p-2 text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setGroupBreakdownStart((current) => Math.min(Math.max(participantGroupSummaries.length - 3, 0), current + 1))}
                      disabled={groupBreakdownStart >= Math.max(participantGroupSummaries.length - 3, 0)}
                      className="rounded-lg border border-zinc-300 bg-white p-2 text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  {visibleGroupBreakdownCards.map((group) => (
                    <article key={`${group.grupo}-detail`} className="rounded-3xl border border-zinc-200 bg-gradient-to-br from-white to-zinc-50 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-zinc-900">{group.grupo}</p>
                          <p className="text-xs text-zinc-500">{group.total} participantes en monitoreo</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Cartera</p>
                          <p className="text-sm font-semibold text-sky-700">{formatMoneyUSD(group.cartera)}</p>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl bg-emerald-50 px-2 py-2 text-emerald-700">Solventes: <span className="font-semibold">{group.activos}</span></div>
                        <div className="rounded-xl bg-rose-50 px-2 py-2 text-rose-700">Con deuda: <span className="font-semibold">{group.mora}</span></div>
                      </div>

                      <div className="mt-3 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
                        Cupos ocupados: <span className="font-semibold text-zinc-900">{group.cuposOcupados}/{GROUP_CAPACITY}</span>
                        {group.grupoLleno ? (
                          <span className="ml-2 font-semibold text-rose-700">Grupo lleno</span>
                        ) : (
                          <span className="ml-2 text-emerald-700">Disponibles: {group.cuposDisponibles}</span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setParticipantActionError("");
                          window.open(`/dashboard/group-sheet?group=${encodeURIComponent(group.grupo)}&planType=26`, "_blank", "noopener,noreferrer");
                        }}
                        className="mt-3 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                      >
                        Abrir hoja completa del grupo
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            </article>
          </div>

          {groupParticipantsModal ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
              <div className="w-full max-w-5xl rounded-3xl border border-zinc-200 bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Gestión por grupo</p>
                    <h4 className="mt-1 text-lg font-semibold text-zinc-900">{groupParticipantsModal} · {selectedGroupParticipants.length} participantes</h4>
                    <p className="text-sm text-zinc-500">Administra expedientes: abre ficha de cada participante o elimínalo para liberar cupo del grupo.</p>
                    <p className="mt-1 text-xs font-medium text-zinc-600">Cupos ocupados: {selectedGroupParticipants.length}/{GROUP_CAPACITY}</p>
                    {selectedGroupParticipants.length >= GROUP_CAPACITY ? (
                      <p className="mt-1 text-xs font-semibold text-rose-700">Este grupo está lleno. Para agregar otro participante primero debes liberar un cupo.</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedGroupParticipants.length >= GROUP_CAPACITY ? (
                      <button
                        type="button"
                        disabled
                        title="Libera un cupo primero"
                        className="cursor-not-allowed rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-400"
                      >
                        Asignar nuevo participante
                      </button>
                    ) : (
                      <Link
                        href={`/register-member?group=${encodeURIComponent(groupParticipantsModal)}`}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                      >
                        Asignar nuevo participante
                      </Link>
                    )}
                    <button type="button" onClick={() => setGroupParticipantsModal(null)} className="rounded-full border border-zinc-200 p-2 text-zinc-600 hover:bg-zinc-50">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="max-h-[70vh] overflow-y-auto p-5">
                  {participantActionError ? (
                    <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{participantActionError}</div>
                  ) : null}
                  {participantActionNotice ? (
                    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{participantActionNotice}</div>
                  ) : null}

                  {selectedGroupParticipants.length === 0 ? (
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-600">Este grupo no tiene participantes activos.</div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {selectedGroupParticipants.map((item) => (
                        <article key={`${groupParticipantsModal}-${item.id}-modal`} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-zinc-900">{item.nombre}</p>
                              <p className="text-xs text-zinc-500">{item.documento}</p>
                            </div>
                            <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${item.estado === "Al día" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                              {item.estado === "Al día" ? "Solvente" : "Con seguimiento"}
                            </span>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-600">
                            <div className="rounded-lg border border-zinc-200 bg-white px-2 py-2">Pendientes: <span className="font-semibold text-zinc-900">{item.cuotasPendientes}</span></div>
                            <div className="rounded-lg border border-zinc-200 bg-white px-2 py-2">Saldo: <span className="font-semibold text-zinc-900">{formatMoneyUSD(item.saldo)}</span></div>
                          </div>

                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                openMonitorClient(item.id, "expediente");
                                setGroupParticipantsModal(null);
                              }}
                              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                            >
                              Editar expediente
                            </button>
                            <button
                              type="button"
                              onClick={() => openDeleteParticipantDialog(item.id)}
                              disabled={deletingParticipantId === item.id}
                              className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deletingParticipantId === item.id ? "Eliminando..." : "Eliminar"}
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {groupParticipantsModal && pendingDeleteParticipant ? (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
              <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">Aviso de seguridad</p>
                <h5 className="mt-2 text-lg font-semibold text-zinc-900">
                  {pendingDeleteStep === 1 ? "¿Deseas eliminar este expediente?" : "Confirmación final de eliminación"}
                </h5>
                <p className="mt-2 text-sm text-zinc-600">
                  Participante: <span className="font-semibold text-zinc-900">{pendingDeleteParticipant.nombre}</span> · {pendingDeleteParticipant.documento}
                </p>
                <p className="mt-2 text-sm text-zinc-600">
                  {pendingDeleteStep === 1
                    ? "Esta acción removerá su expediente del monitoreo y liberará el cupo del grupo."
                    : "Esta acción es irreversible. ¿Confirmas eliminar definitivamente este expediente?"}
                </p>

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeDeleteParticipantDialog}
                    disabled={Boolean(deletingParticipantId)}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void proceedDeleteParticipantDialog()}
                    disabled={Boolean(deletingParticipantId)}
                    className="rounded-lg border border-rose-300 bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deletingParticipantId
                      ? "Eliminando..."
                      : pendingDeleteStep === 1
                        ? "Sí, continuar"
                        : "Confirmar eliminación"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {monitorFocusGroup ? (
            <MonitorFocusPanel
              group={monitorFocusGroup}
              clients={monitorFocusClients}
              profiles={monitorProfilesSource}
              installments={monitorInstallmentsSource}
              search={monitorFocusSearch}
              onSearchChange={setMonitorFocusSearch}
              onClose={() => setMonitorFocusGroup(null)}
              onOpenClient={(clientId, target) => {
                setMonitorFocusGroup(null);
                if (target === "cuotas") {
                  openMonitorClientCuotas(clientId);
                } else {
                  openMonitorClient(clientId, "expediente");
                }
              }}
            />
          ) : null}

          <div className="grid gap-4 xl:grid-cols-3">
            <article className="rounded-2xl border border-zinc-200 bg-white p-4 xl:col-span-2">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-zinc-900">Control de cartera por cliente</h3>
                  <span className="text-xs text-zinc-500">Quién debe cuotas y quién está al día</span>
                </div>
                <div className="w-full max-w-sm">
                  <label className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                    <Search className="h-4 w-4 text-zinc-400" />
                    <input
                      value={monitorPortfolioSearch}
                      onChange={(event) => setMonitorPortfolioSearch(event.target.value)}
                      placeholder="Buscar por cédula, grupo o nombre"
                      className="w-full bg-transparent text-sm text-zinc-700 outline-none placeholder:text-zinc-400"
                    />
                  </label>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left text-zinc-500">
                      <th className="py-2 pr-3">Cliente</th>
                      <th className="py-2 pr-3">Grupo</th>
                      <th className="py-2 pr-3">Estado</th>
                      <th className="py-2 pr-3">Pend.</th>
                      <th className="py-2 pr-3">Venc.</th>
                      <th className="py-2 pr-3">Saldo</th>
                      <th className="py-2">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPortfolioClients.map((client) => (
                      <tr key={client.id} className="border-b border-zinc-100 text-zinc-700">
                        <td className="py-2 pr-3">
                          <p className="font-medium text-zinc-900">{client.nombre}</p>
                          <p className="text-xs text-zinc-500">{client.documento} · {client.telefono}</p>
                        </td>
                        <td className="py-2 pr-3">{client.agencia}</td>
                        <td className="py-2 pr-3">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${
                              client.estado === "Al día"
                                ? "bg-emerald-100 text-emerald-700"
                                : client.estado === "Con atraso"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-rose-100 text-rose-700"
                            }`}
                          >
                            {client.estado}
                          </span>
                        </td>
                        <td className="py-2 pr-3">{client.cuotasPendientes}</td>
                        <td className="py-2 pr-3">{client.cuotasVencidas}</td>
                        <td className="py-2 pr-3">{formatMoneyUSD(client.saldo)}</td>
                        <td className="py-2">
                          <button
                            onClick={() => {
                              openMonitorClientCuotas(client.id);
                            }}
                            className={`rounded-lg px-3 py-1 text-xs font-semibold ${
                              selectedMonitorClientId === client.id
                                ? "bg-zinc-900 text-white"
                                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                            }`}
                          >
                            Ver cuotas
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredPortfolioClients.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-4 text-center text-sm text-zinc-500">
                          {monitorPortfolioSearch.trim()
                            ? "No hay resultados para esta búsqueda."
                            : monitorLoadError
                              ? "No se pudieron cargar los expedientes (revisa el aviso de arriba)."
                              : "Todavía no hay expedientes registrados."}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="rounded-2xl border border-zinc-200 bg-white p-4">
              <h3 className="font-semibold text-zinc-900">Flujo operativo</h3>
              <div className="mt-3 space-y-2 text-sm text-zinc-700">
                {nextOperations.map((item) => (
                  <p key={item} className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                    {item}
                  </p>
                ))}
              </div>
              <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                <p className="font-semibold text-zinc-900">Cliente seleccionado</p>
                <p className="mt-1">{selectedMonitorClient.nombre}</p>
                <p className="text-xs text-zinc-500">Próx. vencimiento: {selectedMonitorClient.proximoVencimiento}</p>
                <p className="text-xs text-zinc-500">Gestor asignado: {selectedMonitorClient.gestor}</p>
              </div>
            </article>
          </div>

          <article className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="mb-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <label className="flex items-start gap-3 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={chargeOnlyAdvance}
                  onChange={(event) => setChargeOnlyAdvance(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-zinc-900"
                />
                <span>
                  <span className="font-semibold text-zinc-900">Cobrar solo abono</span>
                  <span className="mt-1 block text-xs text-zinc-500">
                    Al activar esta opción se cobrará únicamente un abono sin seleccionar cuotas. El abono se acredita al saldo del cliente para futuras cuotas.
                  </span>
                </span>
              </label>
            </div>

            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">Seleccionar cuotas a pagar</h3>
                <p className="text-sm text-zinc-500">
                  Cantidad de cuotas a pagar: <span className="font-semibold text-zinc-900">{selectedInstallments.length}</span> · Plan activo: <span className="font-semibold text-zinc-900">{selectedMonitorProfile.cuotasTotales || currentClientInstallments.length}</span> cuotas
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {chargeOnlyAdvance && (
                  <label className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">
                    Abono
                    <input
                      type="number"
                      min={10}
                      step={5}
                      value={advanceAmount}
                      onChange={(event) => setAdvanceAmount(Number(event.target.value) || 10)}
                      className="w-20 rounded-md border border-zinc-300 px-2 py-1 text-sm"
                    />
                  </label>
                )}
                <button
                  onClick={() => {
                    if (chargeOnlyAdvance) return;
                    setSelectedInstallments(currentClientInstallments.filter((item) => item.estado !== "Pagada").map((item) => item.id));
                  }}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Seleccionar todas ({currentClientInstallments.length})
                </button>
                <button
                  onClick={() => setSelectedInstallments([])}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Limpiar selección
                </button>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              {currentClientInstallments.map((item) => {
                const isSelected = selectedInstallments.includes(item.id);
                const isPaid = item.estado === "Pagada";
                const totalCuota = item.monto + item.recargo;

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (chargeOnlyAdvance || isPaid) return;
                      setSelectedInstallments((prev) =>
                        prev.includes(item.id) ? prev.filter((rowId) => rowId !== item.id) : [...prev, item.id]
                      );
                    }}
                    className={`rounded-xl border p-3 text-left transition ${
                      isPaid
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : isSelected
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400"
                    } ${chargeOnlyAdvance || isPaid ? "cursor-not-allowed opacity-75" : "cursor-pointer"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">Cuota #{item.numero}</p>
                        <p className={`text-xs ${isPaid ? "text-emerald-700" : isSelected ? "text-zinc-300" : "text-zinc-500"}`}>
                          Semana #{item.semana} · {item.tipo}
                        </p>
                      </div>
                      <p className="text-xl font-semibold">${totalCuota.toFixed(2)}</p>
                    </div>
                    <p className={`mt-2 text-xs ${isPaid ? "text-emerald-700" : isSelected ? "text-zinc-300" : "text-zinc-500"}`}>Vence (agenda): {item.vence}</p>
                    <p className={`mt-1 text-xs ${isPaid ? "text-emerald-700" : isSelected ? "text-zinc-300" : "text-zinc-500"}`}>
                      Monto: ${item.monto.toFixed(2)} · Recargo: ${item.recargo.toFixed(2)}
                    </p>
                    <p className={`mt-2 text-xs font-medium ${isPaid ? "text-emerald-700" : isSelected ? "text-zinc-100" : "text-zinc-600"}`}>
                      {isPaid
                        ? "Pagada"
                        : chargeOnlyAdvance
                          ? "Selección bloqueada por modo abono"
                          : isSelected
                            ? "Seleccionada"
                            : "Clic para seleccionar"}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 md:grid-cols-4">
              <div>
                <p className="text-xs text-zinc-500">Cliente</p>
                <p className="font-semibold text-zinc-900">{selectedMonitorClient.nombre}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Base seleccionada</p>
                <p className="font-semibold text-zinc-900">${selectedMontoBase.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Recargo aplicado</p>
                <p className="font-semibold text-zinc-900">${selectedRecargoTotal.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Total a cobrar</p>
                <p className="text-xl font-semibold text-emerald-600">${totalCobro.toFixed(2)}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100">
                Enviar recordatorio
              </button>
              <button
                onClick={() => void handleRegisterOperationalCharge()}
                disabled={submittingPayment}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Registrar cobro
              </button>
            </div>
          </article>
          </>
          )}
        </section>
        )}

        {activeSection === "financiamiento" && (
          <section className="space-y-5">
            <header className="rounded-2xl border border-zinc-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Financiamiento</p>
              <h2 className="mt-1 text-lg font-semibold text-zinc-900">
                50% inicial + cuotas quincenales por modelo de moto
              </h2>
              <p className="mt-2 max-w-3xl text-sm text-zinc-600">
                Configura por cada modelo: precio base, porcentaje del inicial, cantidad de cuotas quincenales y el monto
                de cada cuota. El inicial y el saldo se calculan solos; el monto de la cuota lo defines tú.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void saveFinancingModels()}
                  disabled={financingBusy || financingLoading || financingModels.length === 0}
                  className="rounded-lg border border-zinc-900 bg-zinc-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {financingBusy ? "Guardando..." : "Guardar cambios"}
                </button>
                <button
                  type="button"
                  onClick={() => void loadFinancingModels()}
                  disabled={financingBusy || financingLoading}
                  className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {financingLoading ? "Cargando..." : "Recargar"}
                </button>
                <span className="text-xs text-zinc-500">
                  {financingSummary.configurados} de {financingSummary.total} modelos con precio
                </span>
                {financingNotice ? (
                  <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    {financingNotice}
                  </span>
                ) : null}
                {financingError ? (
                  <span className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                    {financingError}
                  </span>
                ) : null}
              </div>
            </header>

            <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
              <table className="w-full min-w-[1080px] text-sm">
                <thead className="bg-zinc-100 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  <tr>
                    <th className="px-3 py-3 text-left">Modelo</th>
                    <th className="px-3 py-3 text-left">Precio base</th>
                    <th className="px-3 py-3 text-left">% inicial</th>
                    <th className="px-3 py-3 text-left">Cuotas quincenales</th>
                    <th className="px-3 py-3 text-left">Monto por cuota</th>
                    <th className="px-3 py-3 text-left">Inicial</th>
                    <th className="px-3 py-3 text-left">Saldo</th>
                    <th className="px-3 py-3 text-left">Sugerida</th>
                    <th className="px-3 py-3 text-left">Activo</th>
                  </tr>
                </thead>
                <tbody>
                  {financingModels.map((model) => {
                    const detail = computeFinancing({
                      precioBase: model.precioBase,
                      porcentajeInicial: model.porcentajeInicial,
                      cuotasQuincenales: model.cuotasQuincenales,
                      montoCuota: model.montoCuota,
                    });

                    return (
                      <tr key={model.slug} className="border-t border-zinc-200">
                        <td className="px-3 py-3">
                          <p className="font-semibold text-zinc-900">{model.nombre}</p>
                          <p className="text-xs text-zinc-500">
                            {model.categoria}
                            {model.guardado ? "" : " · sin configurar"}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={model.precioBase || ""}
                            onChange={(event) => updateFinancingRow(model.slug, { precioBase: Number(event.target.value || 0) })}
                            className="w-28 rounded-md border border-zinc-300 px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={model.porcentajeInicial}
                            onChange={(event) => updateFinancingRow(model.slug, { porcentajeInicial: Number(event.target.value || 0) })}
                            className="w-20 rounded-md border border-zinc-300 px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="number"
                            min={1}
                            max={200}
                            value={model.cuotasQuincenales}
                            onChange={(event) => updateFinancingRow(model.slug, { cuotasQuincenales: Number(event.target.value || 0) })}
                            className="w-20 rounded-md border border-zinc-300 px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={model.montoCuota || ""}
                            placeholder={String(detail.cuotaSugerida)}
                            onChange={(event) => updateFinancingRow(model.slug, { montoCuota: Number(event.target.value || 0) })}
                            className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-3 py-3 font-semibold text-zinc-900">${detail.inicial.toFixed(2)}</td>
                        <td className="px-3 py-3 text-zinc-700">${detail.saldo.toFixed(2)}</td>
                        <td className="px-3 py-3 text-zinc-700">
                          <span className="font-semibold text-zinc-900">${detail.cuota.toFixed(2)}</span>
                          {detail.usaMontoManual && Math.abs(detail.diferencia) >= 0.01 ? (
                            <span
                              className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                detail.diferencia > 0 ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"
                              }`}
                            >
                              {detail.diferencia > 0 ? "cobra +" : "cobra -"}${Math.abs(detail.diferencia).toFixed(2)}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={model.activo}
                            onChange={(event) => updateFinancingRow(model.slug, { activo: event.target.checked })}
                            className="h-4 w-4"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {financingLoading && financingModels.length === 0 ? (
                <p className="px-4 py-6 text-sm text-zinc-500">Cargando modelos…</p>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Total inicial (modelos con precio)</p>
                <p className="mt-1 text-lg font-semibold text-zinc-900">${financingSummary.totalInicial.toFixed(2)}</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Total a cobrar en cuotas</p>
                <p className="mt-1 text-lg font-semibold text-zinc-900">${financingSummary.totalCuotas.toFixed(2)}</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Plan</p>
                <p className="mt-1 text-sm font-medium text-zinc-700">
                  Inicial configurable (50% por defecto) + cuotas cada 15 días.
                </p>
              </div>
            </div>
          </section>
        )}

        {activeSection === "financiados" && (
          <section className="space-y-5">
            <header className="rounded-2xl border border-zinc-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Financiamiento individual</p>
              <h2 className="mt-1 text-lg font-semibold text-zinc-900">Personas en el sistema de financiamiento</h2>
              <p className="mt-2 max-w-3xl text-sm text-zinc-600">
                Cada financiado es <span className="font-semibold">individual</span>: no pertenece a ningún grupo operativo.
                Abre su expediente para ver documentos, credenciales y el detalle de sus cuotas quincenales.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Financiados</p>
                  <p className="mt-1 text-lg font-semibold text-zinc-900">{financingMembersSummary.total}</p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Saldo por cobrar</p>
                  <p className="mt-1 text-lg font-semibold text-zinc-900">${financingMembersSummary.saldo.toFixed(2)}</p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Cuotas pendientes</p>
                  <p className="mt-1 text-lg font-semibold text-zinc-900">{financingMembersSummary.cuotasPendientes}</p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Con atraso</p>
                  <p className={`mt-1 text-lg font-semibold ${financingMembersSummary.conAtraso > 0 ? "text-amber-700" : "text-zinc-900"}`}>
                    {financingMembersSummary.conAtraso}
                  </p>
                </div>
              </div>
            </header>

            <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
              <table className="w-full min-w-[1040px] text-sm">
                <thead className="bg-zinc-100 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  <tr>
                    <th className="px-3 py-3 text-left">Cliente</th>
                    <th className="px-3 py-3 text-left">Cédula</th>
                    <th className="px-3 py-3 text-left">Moto</th>
                    <th className="px-3 py-3 text-left">Cuota quincenal</th>
                    <th className="px-3 py-3 text-left">Cuotas</th>
                    <th className="px-3 py-3 text-left">Saldo</th>
                    <th className="px-3 py-3 text-left">Estado</th>
                    <th className="px-3 py-3 text-left">Próximo vencimiento</th>
                    <th className="px-3 py-3 text-left">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {financingMembers.map(({ client, profile, cuotasPagadas, cuotasTotales }) => (
                    <tr key={client.id} className="border-t border-zinc-200">
                      <td className="px-3 py-3">
                        <p className="font-semibold text-zinc-900">{client.nombre}</p>
                        <p className="text-xs text-zinc-500">{profile?.username || "Sin usuario"}</p>
                      </td>
                      <td className="px-3 py-3 text-zinc-700">{client.documento}</td>
                      <td className="px-3 py-3 text-zinc-700">
                        {profile?.motoMarca || profile?.motoModelo
                          ? `${profile?.motoMarca ?? ""} ${profile?.motoModelo ?? ""}`.trim()
                          : "Por asignar"}
                      </td>
                      <td className="px-3 py-3 font-semibold text-zinc-900">
                        ${Number(profile?.cuotaMensual ?? 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-zinc-700">
                        {cuotasPagadas}/{cuotasTotales || profile?.cuotasTotales || 0}
                      </td>
                      <td className="px-3 py-3 text-zinc-700">${Number(client.saldo ?? 0).toFixed(2)}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            client.estado === "Al día"
                              ? "bg-emerald-100 text-emerald-800"
                              : client.estado === "Con atraso"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {client.estado}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-zinc-700">{client.proximoVencimiento}</td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => openFinancingExpediente(client.id)}
                          className="rounded-lg border border-zinc-900 bg-zinc-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800"
                        >
                          Abrir expediente
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {financingMembers.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-zinc-600">
                  <p className="font-semibold text-zinc-800">No hay expedientes en el plan de financiamiento</p>
                  <p className="mx-auto mt-1 max-w-xl">
                    {monitorClientsSource.length > 0
                      ? `Tus ${monitorClientsSource.length} expediente(s) están en los planes de 26 y 83 cuotas. Aquí solo aparecen los que contraten el plan «Financiamiento 50% (quincenal)».`
                      : "Registrá un miembro con el plan «Financiamiento 50% (quincenal)» y aparecerá aquí."}
                  </p>
                  <p className="mt-2 text-xs text-zinc-500">
                    Ningún expediente se elimina automáticamente: tus registros siguen completos en el Monitor de cuotas.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveSection("monitor-cuotas")}
                    className="mt-3 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
                  >
                    Ver todos en Monitor de cuotas
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        )}

        {activeSection === "contratos" && (
        <section id="contratos-panel" className="space-y-4 scroll-mt-24">
          <article className="overflow-hidden rounded-[32px] border border-stone-300 bg-gradient-to-br from-stone-50 via-white to-stone-100 shadow-[0_28px_70px_-40px_rgba(15,23,42,0.26)]">
            <div className="grid gap-6 p-6 xl:grid-cols-[1.15fr_0.85fr] xl:p-7">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-stone-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                    Archivo juridico corporativo
                  </span>
                  <span className="rounded-full border border-stone-300 bg-white px-3 py-1 text-[11px] font-semibold text-stone-600">
                    Actualizado {clockTimeText}
                  </span>
                </div>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-stone-950">Portafolio contractual de la empresa</h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
                  Panel legal y empresarial para revisar el histórico contractual de SAN, los contratos vigentes por empresa,
                  el estado documental de cada expediente, sus firmantes y la trazabilidad de anexos y firmas internas.
                </p>

                <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {contractCompanyLedger.map((item) => (
                    <div key={item.label} className="rounded-3xl border border-stone-300 bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">{item.label}</p>
                      <p className="mt-2 text-3xl font-semibold tracking-tight text-stone-950">{item.value}</p>
                      <p className="mt-1 text-xs text-stone-500">{item.note}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] border border-stone-300 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-stone-900">
                  <Landmark className="h-5 w-5 text-stone-700" />
                  <h3 className="font-semibold">Mesa juridica</h3>
                </div>
                <div className="mt-4 space-y-3">
                  {contractLegalDesk.map((item) => (
                    <div key={item.title} className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-stone-900">{item.title}</p>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          item.tone === "emerald"
                            ? "bg-emerald-100 text-emerald-700"
                            : item.tone === "amber"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-sky-100 text-sky-700"
                        }`}>
                          {item.tone === "emerald" ? "Controlado" : item.tone === "amber" ? "Seguimiento" : "Resguardado"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-stone-600">{item.detail}</p>
                    </div>
                  ))}

                  <div className="rounded-2xl border border-stone-200 bg-stone-900 p-4 text-stone-100">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-300">Valor contractual vivo</p>
                    <p className="mt-2 text-3xl font-semibold">{formatMoneyUSD(contracts.reduce((acc, item) => acc + item.amountUsd, 0))}</p>
                    <p className="mt-2 text-sm text-stone-300">Contratos vigentes y en aprobación con impacto directo sobre la operación corporativa.</p>
                  </div>
                </div>
              </div>
            </div>
          </article>

          <article className="rounded-[32px] border border-stone-300 bg-stone-50 p-5 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.24)] xl:p-6">
            <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr] xl:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Consulta por cédula</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">Buscar expediente contractual individual</h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
                  Ingresa la cédula del representante para abrir el contrato completo con documentos, cláusulas,
                  control legal y firmas registradas, sin perder el resto del panel empresarial.
                </p>
              </div>

              <div>
                <form onSubmit={handleContractSearch} className="rounded-[28px] border border-stone-300 bg-white p-2 shadow-sm">
                  <div className="flex flex-col gap-2 lg:flex-row">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
                      <input
                        value={contractCedulaSearch}
                        onChange={(event) => {
                          setContractCedulaSearch(event.target.value);
                          if (contractSearchError) setContractSearchError("");
                        }}
                        placeholder="Ej. 19288415"
                        className="h-14 w-full rounded-[22px] border border-stone-200 bg-white pl-12 pr-4 text-sm text-stone-900 outline-none transition focus:border-stone-400"
                      />
                    </div>
                    <button
                      type="submit"
                      className="h-14 rounded-[22px] bg-stone-950 px-6 text-sm font-semibold text-white transition hover:bg-stone-800"
                    >
                      Abrir expediente
                    </button>
                  </div>
                  {contractSearchError ? <p className="mt-2 px-1 text-xs text-rose-600">{contractSearchError}</p> : null}
                </form>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setContractTab("portafolio")}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      contractTab === "portafolio" ? "bg-stone-950 text-white" : "bg-white text-stone-700 hover:bg-stone-100"
                    }`}
                  >
                    Portafolio general
                  </button>
                  <button
                    type="button"
                    onClick={() => setContractTab("expediente")}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      contractTab === "expediente" ? "bg-stone-950 text-white" : "bg-white text-stone-700 hover:bg-stone-100"
                    }`}
                  >
                    Expediente individual
                  </button>
                </div>
              </div>
            </div>
          </article>

          {contractTab === "portafolio" && (
          <>
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <article className="rounded-[28px] border border-stone-300 bg-white p-5 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.24)]">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BriefcaseBusiness className="h-5 w-5 text-stone-700" />
                  <div>
                    <h3 className="font-semibold text-stone-950">Portafolio empresarial activo</h3>
                    <p className="text-sm text-stone-500">Empresas, segmentación, cobertura documental y carga jurídica actual.</p>
                  </div>
                </div>
                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">{contracts.length} contratos visibles</span>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 text-left text-stone-500">
                      <th className="py-2 pr-3">Empresa</th>
                      <th className="py-2 pr-3">Representante</th>
                      <th className="py-2 pr-3">Monto</th>
                      <th className="py-2 pr-3">Cobertura</th>
                      <th className="py-2 pr-3">Estado legal</th>
                      <th className="py-2">Riesgo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.map((contract) => (
                      <tr
                        key={contract.id}
                        className="cursor-pointer border-b border-stone-100 text-stone-700 transition hover:bg-stone-50"
                        onClick={() => openContractDossier(contract.id)}
                      >
                        <td className="py-3 pr-3">
                          <p className="font-semibold text-stone-950">{contract.company}</p>
                          <p className="text-xs text-stone-500">{contract.id} · {contract.segment} · {contract.zone}</p>
                        </td>
                        <td className="py-3 pr-3">
                          <p>{contract.representative}</p>
                          <p className="text-xs text-stone-500">V-{contract.representativeCedula} · {contract.role}</p>
                        </td>
                        <td className="py-3 pr-3 font-semibold text-stone-950">{formatMoneyUSD(contract.amountUsd)}</td>
                        <td className="py-3 pr-3">
                          <div className="w-28">
                            <div className="h-2 overflow-hidden rounded-full bg-stone-200">
                              <div className="h-full rounded-full bg-stone-900" style={{ width: `${contract.documentsPct}%` }} />
                            </div>
                            <p className="mt-1 text-xs text-stone-500">{contract.documentsPct}% expediente</p>
                          </div>
                        </td>
                        <td className="py-3 pr-3">
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            contract.status === "Aprobado"
                              ? "bg-emerald-100 text-emerald-700"
                              : contract.status === "Pendiente"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-sky-100 text-sky-700"
                          }`}>
                            {contract.legalStage}
                          </span>
                        </td>
                        <td className="py-3">
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            contract.risk === "Bajo"
                              ? "bg-emerald-100 text-emerald-700"
                              : contract.risk === "Medio"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-rose-100 text-rose-700"
                          }`}>
                            {contract.risk}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {contractRevenueTrend.map((item) => (
                  <div key={item.month} className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">{item.month}</p>
                    <p className="mt-2 text-lg font-semibold text-stone-950">{formatMoneyUSD(item.cartera)}</p>
                    <p className="mt-1 text-xs text-stone-500">{item.cierres} cierres · {item.renovaciones} renovaciones</p>
                  </div>
                )).slice(-3)}
              </div>
            </article>

            <div className="space-y-4">
              <article className="rounded-[28px] border border-stone-300 bg-white p-5 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.24)]">
                <div className="mb-4 flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-amber-600" />
                  <div>
                    <h3 className="font-semibold text-stone-950">Alertas y bloqueos</h3>
                    <p className="text-sm text-stone-500">Incidencias jurídicas que afectan aprobación o formalización.</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {contractExecutiveAlerts.map((item, index) => (
                    <div key={`${item}-${index}`} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">Observación {String(index + 1).padStart(2, "0")}</p>
                      <p className="mt-2 text-sm leading-6 text-stone-700">{item}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-[28px] border border-stone-300 bg-white p-5 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.24)]">
                <div className="mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5 text-stone-700" />
                  <div>
                    <h3 className="font-semibold text-stone-950">Cola de firmas y aprobación</h3>
                    <p className="text-sm text-stone-500">Mesa de trabajo legal, comercial y de riesgo.</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {contractApprovalQueue.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-stone-950">{item.client}</p>
                          <p className="text-xs text-stone-500">{item.id} · {item.stage}</p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.priority === "Alta" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                          {item.priority}
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-stone-700">{item.blocker}</p>
                      <div className="mt-3 flex items-center justify-between text-xs text-stone-500">
                        <span>Responsable: <span className="font-semibold text-stone-900">{item.owner}</span></span>
                        <span>SLA: <span className="font-semibold text-stone-900">{item.sla}</span></span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </div>
          

          <article className="rounded-[32px] border border-stone-300 bg-white p-5 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.24)]">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Expedientes contractuales</p>
                <h3 className="mt-1 text-xl font-semibold text-stone-950">Contratos por empresa con titular, documento y firmas</h3>
              </div>
              <span className="rounded-full border border-stone-300 bg-stone-50 px-3 py-1 text-xs font-semibold text-stone-600">
                {contracts.filter((item) => item.status === "Aprobado").length} formalizados · {contracts.filter((item) => item.status !== "Aprobado").length} en gestión
              </span>
            </div>

            <div className="space-y-5">
              {contracts.map((contract) => (
                <article key={`${contract.id}-dossier`} className="overflow-hidden rounded-[28px] border border-stone-200 bg-gradient-to-br from-white to-stone-50">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-5 py-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">{contract.id}</p>
                      <h4 className="mt-1 text-lg font-semibold text-stone-950">{contract.company}</h4>
                      <p className="text-sm text-stone-500">{contract.unit} · {contract.billingCycle} · Vigencia {contract.termMonths} meses</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        contract.status === "Aprobado"
                          ? "bg-emerald-100 text-emerald-700"
                          : contract.status === "Pendiente"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-sky-100 text-sky-700"
                      }`}>
                        {contract.status}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        contract.risk === "Bajo"
                          ? "bg-emerald-100 text-emerald-700"
                          : contract.risk === "Medio"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-rose-100 text-rose-700"
                      }`}>
                        Riesgo {contract.risk}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-5 p-5 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
                    <div className="rounded-[24px] border border-stone-200 bg-white p-4">
                      <Image
                        src={contract.photo}
                        alt={`Representante ${contract.representative}`}
                        width={520}
                        height={620}
                        className="h-64 w-full rounded-2xl border border-stone-200 bg-stone-50 object-cover"
                      />
                      <div className="mt-4 space-y-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Representante</p>
                          <p className="mt-1 text-base font-semibold text-stone-950">{contract.representative}</p>
                          <p className="text-sm text-stone-500">{contract.role}</p>
                        </div>
                        <div className="grid gap-3 text-sm text-stone-700">
                          <p><span className="font-semibold text-stone-950">Empresa:</span> {contract.client}</p>
                          <p><span className="font-semibold text-stone-950">Ejecutivo SAN:</span> {contract.executive}</p>
                          <p><span className="font-semibold text-stone-950">Firma inicial:</span> {contract.signedAt}</p>
                          <p><span className="font-semibold text-stone-950">Renovación:</span> {contract.renewalAt}</p>
                          <p><span className="font-semibold text-stone-950">Monto:</span> {formatMoneyUSD(contract.amountUsd)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-[24px] border border-stone-200 bg-white p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-stone-950">Contrato principal</p>
                            <span className="text-xs text-stone-500">Escaneado</span>
                          </div>
                          <Image
                            src={contract.contractFile}
                            alt={`Contrato ${contract.id}`}
                            width={620}
                            height={420}
                            className="h-56 w-full rounded-2xl border border-stone-200 bg-stone-50 object-cover"
                          />
                        </div>
                        <div className="rounded-[24px] border border-stone-200 bg-white p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-stone-950">Anexo y firmas</p>
                            <span className="text-xs text-stone-500">Respaldo jurídico</span>
                          </div>
                          <Image
                            src={contract.annexFile}
                            alt={`Anexo ${contract.id}`}
                            width={620}
                            height={420}
                            className="h-56 w-full rounded-2xl border border-stone-200 bg-stone-50 object-cover"
                          />
                        </div>
                      </div>

                      <div className="rounded-[24px] border border-stone-200 bg-white p-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Cláusulas destacadas</p>
                            <div className="mt-3 space-y-2 text-sm text-stone-700">
                              {contract.clauses.map((clause) => (
                                <p key={clause} className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">{clause}</p>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Lectura legal</p>
                            <div className="mt-3 rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm leading-6 text-stone-700">
                              {contract.legalNote}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-[24px] border border-stone-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Firmantes</p>
                        <div className="mt-3 space-y-3">
                          {contract.signatures.map((signature) => (
                            <div key={`${contract.id}-${signature.name}`} className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-stone-950">{signature.name}</p>
                                  <p className="text-xs text-stone-500">{signature.role} · {signature.side}</p>
                                </div>
                                <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                                  signature.status === "Firmado"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : signature.status === "En revisión"
                                      ? "bg-sky-100 text-sky-700"
                                      : "bg-amber-100 text-amber-700"
                                }`}>
                                  {signature.status}
                                </span>
                              </div>
                              <p className="mt-3 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-600">
                                Fecha de rúbrica: <span className="font-semibold text-stone-900">{signature.date}</span>
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[24px] border border-stone-200 bg-stone-900 p-4 text-stone-100">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Folio de control</p>
                        <div className="mt-3 space-y-2 text-sm">
                          <p className="flex items-center justify-between gap-3"><span className="text-stone-300">Estado legal</span><span className="font-semibold">{contract.legalStage}</span></p>
                          <p className="flex items-center justify-between gap-3"><span className="text-stone-300">Cobertura documental</span><span className="font-semibold">{contract.documentsPct}%</span></p>
                          <p className="flex items-center justify-between gap-3"><span className="text-stone-300">Vencimiento</span><span className="font-semibold">{contract.renewalAt}</span></p>
                          <p className="flex items-center justify-between gap-3"><span className="text-stone-300">Ciclo</span><span className="font-semibold">{contract.billingCycle}</span></p>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </article>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <article className="rounded-[28px] border border-stone-300 bg-white p-5 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.24)]">
              <div className="mb-4 flex items-center gap-2">
                <FileCheck2 className="h-5 w-5 text-stone-700" />
                <div>
                  <h3 className="font-semibold text-stone-950">Renovaciones corporativas</h3>
                  <p className="text-sm text-stone-500">Seguimiento de continuidad, probabilidad y valor a resguardar.</p>
                </div>
              </div>
              <div className="space-y-3">
                {contractRenewalBoard.map((item) => (
                  <div key={item.client} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-stone-950">{item.client}</p>
                        <p className="text-xs text-stone-500">{item.executive} · renovación {item.renewalAt}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.health === "En riesgo" ? "bg-rose-100 text-rose-700" : item.health === "Estable" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {item.health}
                      </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200">
                      <div className={`h-full rounded-full ${item.probability >= 80 ? "bg-emerald-500" : item.probability >= 65 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${item.probability}%` }} />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-stone-500">
                      <span>Probabilidad: <span className="font-semibold text-stone-900">{item.probability}%</span></span>
                      <span>Valor: <span className="font-semibold text-stone-900">{formatMoneyUSD(item.value)}</span></span>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-[28px] border border-stone-300 bg-white p-5 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.24)]">
              <div className="mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-stone-700" />
                <div>
                  <h3 className="font-semibold text-stone-950">Resumen empresarial</h3>
                  <p className="text-sm text-stone-500">Cómo va la empresa en contratos, formalización y firmas.</p>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Aprobados</p>
                  <p className="mt-2 text-3xl font-semibold text-emerald-600">{contracts.filter((item) => item.status === "Aprobado").length}</p>
                  <p className="mt-1 text-xs text-stone-500">Contratos ya formalizados por SAN</p>
                </div>
                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">En gestión</p>
                  <p className="mt-2 text-3xl font-semibold text-amber-600">{contracts.filter((item) => item.status !== "Aprobado").length}</p>
                  <p className="mt-1 text-xs text-stone-500">Expedientes que aún requieren movimiento jurídico</p>
                </div>
                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Firmas completadas</p>
                  <p className="mt-2 text-3xl font-semibold text-stone-950">{contracts.reduce((acc, item) => acc + item.signatures.filter((signature) => signature.status === "Firmado").length, 0)}</p>
                  <p className="mt-1 text-xs text-stone-500">Rúbricas efectivamente registradas</p>
                </div>
                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Ticket promedio</p>
                  <p className="mt-2 text-3xl font-semibold text-stone-950">{formatMoneyUSD(contracts.reduce((acc, item) => acc + item.amountUsd, 0) / contracts.length)}</p>
                  <p className="mt-1 text-xs text-stone-500">Valor medio de contratación empresarial</p>
                </div>
              </div>
            </article>
          </div>
          </>
          )}

          {contractTab === "expediente" && selectedContract ? (
            <article id="contract-expediente-panel" className="overflow-hidden rounded-[32px] border border-stone-300 bg-white shadow-[0_24px_60px_-40px_rgba(15,23,42,0.24)]">
              <div className="border-b border-stone-200 px-5 py-5 xl:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Expediente contractual independiente</p>
                    <h3 className="mt-1 text-2xl font-semibold text-stone-950">
                      {selectedContractSubjectClient ? selectedContractSubjectClient.nombre : selectedContract.company}
                    </h3>
                    <p className="mt-1 text-sm text-stone-500">
                      {selectedContractSubjectClient
                        ? `V-${selectedContractSubjectProfile?.cedula ?? selectedContractCedula} · ${selectedContractSubjectClient.telefono} · ${selectedContractSubjectClient.agencia}`
                        : `${selectedContract.id} · representante ${selectedContract.representative} · V-${selectedContract.representativeCedula}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      selectedContract.status === "Aprobado"
                        ? "bg-emerald-100 text-emerald-700"
                        : selectedContract.status === "Pendiente"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-sky-100 text-sky-700"
                    }`}>
                      {selectedContract.status}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      selectedContract.risk === "Bajo"
                        ? "bg-emerald-100 text-emerald-700"
                        : selectedContract.risk === "Medio"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-rose-100 text-rose-700"
                    }`}>
                      Riesgo {selectedContract.risk}
                    </span>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Monto contractual</p>
                    <p className="mt-2 text-2xl font-semibold text-stone-950">{formatMoneyUSD(selectedContractMatches.reduce((acc, contract) => acc + contract.amountUsd, 0))}</p>
                    <p className="mt-1 text-xs text-stone-500">{selectedContractMatches.length} contratos vinculados a la cédula</p>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Cobertura documental</p>
                    <p className="mt-2 text-2xl font-semibold text-stone-950">{selectedContract.documentsPct}%</p>
                    <p className="mt-1 text-xs text-stone-500">{selectedContract.legalStage}</p>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Firmas registradas</p>
                    <p className="mt-2 text-2xl font-semibold text-stone-950">{contractSignedCount}</p>
                    <p className="mt-1 text-xs text-stone-500">{contractPendingSignatureCount} pendientes o en revisión</p>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Renovación</p>
                    <p className="mt-2 text-2xl font-semibold text-stone-950">{selectedContract.renewalAt}</p>
                    <p className="mt-1 text-xs text-stone-500">Ejecutivo SAN: {selectedContract.executive}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-5 p-5 xl:grid-cols-[280px_minmax(0,1fr)_320px] xl:px-6 xl:pb-6">
                <div className="rounded-[24px] border border-stone-200 bg-white p-4">
                  <Image
                    src={selectedContractSubjectProfile?.fotoPersona ?? selectedContract.photo}
                    alt={`Titular ${selectedContractSubjectClient?.nombre ?? selectedContract.representative}`}
                    width={520}
                    height={620}
                    className="h-64 w-full rounded-2xl border border-stone-200 bg-stone-50 object-cover"
                  />
                  <div className="mt-4 space-y-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Titular consultado</p>
                      <p className="mt-1 text-base font-semibold text-stone-950">{selectedContractSubjectClient?.nombre ?? selectedContract.representative}</p>
                      <p className="text-sm text-stone-500">
                        V-{selectedContractSubjectProfile?.cedula ?? selectedContractCedula} · {selectedContractSubjectProfile?.ocupacion ?? selectedContract.role}
                      </p>
                    </div>
                    <div className="grid gap-3 text-sm text-stone-700">
                      <p><span className="font-semibold text-stone-950">Empresa:</span> {selectedContractSubjectProfile?.empresa ?? selectedContract.client}</p>
                      <p><span className="font-semibold text-stone-950">Dirección:</span> {selectedContractSubjectProfile?.direccion ?? selectedContract.zone}</p>
                      <p><span className="font-semibold text-stone-950">Plan:</span> {selectedContractSubjectProfile?.plan ?? selectedContract.segment}</p>
                      <p><span className="font-semibold text-stone-950">Ingreso:</span> {selectedContractSubjectProfile?.fechaIngreso ?? selectedContract.signedAt}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-[24px] border border-stone-200 bg-white p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-stone-950">Contratos asociados a la cédula</p>
                      <span className="text-xs text-stone-500">Vista independiente</span>
                    </div>
                    <div className="space-y-3">
                      {selectedContractMatches.map((contract) => (
                        <button
                          key={`${contract.id}-linked`}
                          type="button"
                          onClick={() => setSelectedContractId(contract.id)}
                          className={`w-full rounded-2xl border p-4 text-left transition ${
                            contract.id === selectedContract.id
                              ? "border-stone-900 bg-stone-900 text-white"
                              : "border-stone-200 bg-stone-50 text-stone-900 hover:bg-stone-100"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">{contract.company}</p>
                              <p className={`text-xs ${contract.id === selectedContract.id ? "text-stone-300" : "text-stone-500"}`}>
                                {contract.id} · {contract.unit}
                              </p>
                            </div>
                            <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                              contract.id === selectedContract.id
                                ? "bg-white/10 text-white"
                                : contract.status === "Aprobado"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : contract.status === "Pendiente"
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-sky-100 text-sky-700"
                            }`}>
                              {contract.status}
                            </span>
                          </div>
                          <div className={`mt-3 grid gap-2 text-xs ${contract.id === selectedContract.id ? "text-stone-200" : "text-stone-600"}`}>
                            <p>Monto: <span className="font-semibold">{formatMoneyUSD(contract.amountUsd)}</span></p>
                            <p>Estado legal: <span className="font-semibold">{contract.legalStage}</span></p>
                            <p>Representante legal: <span className="font-semibold">{contract.representative}</span></p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-[24px] border border-stone-200 bg-white p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-stone-950">Contrato principal</p>
                        <span className="text-xs text-stone-500">Archivo legal</span>
                      </div>
                      <Image
                        src={selectedContract.contractFile}
                        alt={`Contrato ${selectedContract.id}`}
                        width={620}
                        height={420}
                        className="h-56 w-full rounded-2xl border border-stone-200 bg-stone-50 object-cover"
                      />
                    </div>
                    <div className="rounded-[24px] border border-stone-200 bg-white p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-stone-950">Anexo y firmas</p>
                        <span className="text-xs text-stone-500">Respaldo digital</span>
                      </div>
                      <Image
                        src={selectedContract.annexFile}
                        alt={`Anexo ${selectedContract.id}`}
                        width={620}
                        height={420}
                        className="h-56 w-full rounded-2xl border border-stone-200 bg-stone-50 object-cover"
                      />
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-stone-200 bg-white p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Cláusulas destacadas</p>
                        <div className="mt-3 space-y-2 text-sm text-stone-700">
                          {selectedContract.clauses.map((clause) => (
                            <p key={clause} className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">{clause}</p>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Lectura jurídica</p>
                        <div className="mt-3 rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm leading-6 text-stone-700">
                          {selectedContract.legalNote}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-[24px] border border-stone-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Firmantes del expediente</p>
                    <div className="mt-3 space-y-3">
                      {selectedContract.signatures.map((signature) => (
                        <div key={`${selectedContract.id}-${signature.name}`} className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-stone-950">{signature.name}</p>
                              <p className="text-xs text-stone-500">{signature.role} · {signature.side}</p>
                            </div>
                            <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                              signature.status === "Firmado"
                                ? "bg-emerald-100 text-emerald-700"
                                : signature.status === "En revisión"
                                  ? "bg-sky-100 text-sky-700"
                                  : "bg-amber-100 text-amber-700"
                            }`}>
                              {signature.status}
                            </span>
                          </div>
                          <p className="mt-3 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-600">
                            Fecha de rúbrica: <span className="font-semibold text-stone-900">{signature.date}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-stone-200 bg-stone-900 p-4 text-stone-100">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Folio de control</p>
                    <div className="mt-3 space-y-2 text-sm">
                      <p className="flex items-center justify-between gap-3"><span className="text-stone-300">Estado legal</span><span className="font-semibold">{selectedContract.legalStage}</span></p>
                      <p className="flex items-center justify-between gap-3"><span className="text-stone-300">Cobertura documental</span><span className="font-semibold">{selectedContract.documentsPct}%</span></p>
                      <p className="flex items-center justify-between gap-3"><span className="text-stone-300">Vencimiento</span><span className="font-semibold">{selectedContract.renewalAt}</span></p>
                      <p className="flex items-center justify-between gap-3"><span className="text-stone-300">Unidad</span><span className="font-semibold">{selectedContract.unit}</span></p>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ) : null}
        </section>
        )}

        {activeSection === "novedades" && (
          <section className="space-y-5">
            <header className="rounded-2xl border border-zinc-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Feed de la empresa</p>
              <h2 className="text-lg font-semibold text-zinc-900">Novedades y videos</h2>
              <p className="text-sm text-zinc-500">
                Publica noticias, promociones y videos: cada miembro los ve en su panel, en la pestaña «Novedades».
              </p>
            </header>

            <div className="grid gap-5 xl:grid-cols-2">
              <article className="rounded-2xl border border-zinc-200 bg-white p-5">
                <h3 className="text-base font-semibold text-zinc-900">
                  {newsForm.id ? "Editar novedad" : "Nueva novedad"}
                </h3>

                <form onSubmit={guardarNovedad} className="mt-4 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
                      Título
                    </label>
                    <input
                      value={newsForm.titulo}
                      onChange={(event) => setNewsForm({ ...newsForm, titulo: event.target.value })}
                      placeholder="Ej: Nuevos modelos disponibles este mes"
                      className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
                      Categoría
                    </label>
                    <select
                      value={newsForm.categoria}
                      onChange={(event) => setNewsForm({ ...newsForm, categoria: event.target.value })}
                      className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-zinc-500"
                    >
                      {CATEGORIAS_NOVEDAD.map((categoria) => (
                        <option key={categoria} value={categoria}>
                          {categoria}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
                      Resumen (una o dos líneas)
                    </label>
                    <textarea
                      value={newsForm.resumen}
                      onChange={(event) => setNewsForm({ ...newsForm, resumen: event.target.value })}
                      rows={2}
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
                      Contenido completo
                    </label>
                    <textarea
                      value={newsForm.contenido}
                      onChange={(event) => setNewsForm({ ...newsForm, contenido: event.target.value })}
                      rows={5}
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
                        Imagen (URL)
                      </label>
                      <input
                        value={newsForm.imagenUrl}
                        onChange={(event) => setNewsForm({ ...newsForm, imagenUrl: event.target.value })}
                        placeholder="/videocarru3.mp4 o https://…"
                        className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
                        Video (URL)
                      </label>
                      <input
                        value={newsForm.videoUrl}
                        onChange={(event) => setNewsForm({ ...newsForm, videoUrl: event.target.value })}
                        placeholder="/videocarru2nuevo.mp4"
                        className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-700">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={newsForm.destacado}
                        onChange={(event) => setNewsForm({ ...newsForm, destacado: event.target.checked })}
                        className="h-4 w-4"
                      />
                      Destacada
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={newsForm.publicado}
                        onChange={(event) => setNewsForm({ ...newsForm, publicado: event.target.checked })}
                        className="h-4 w-4"
                      />
                      Publicada (visible para los miembros)
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="submit"
                      disabled={newsSaving}
                      className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {newsSaving ? "Guardando…" : newsForm.id ? "Guardar cambios" : "Publicar novedad"}
                    </button>
                    {newsForm.id ? (
                      <button
                        type="button"
                        onClick={() => setNewsForm({ ...NOVEDAD_VACIA })}
                        className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100"
                      >
                        Cancelar edición
                      </button>
                    ) : null}
                  </div>

                  {newsMessage ? <p className="text-xs font-semibold text-zinc-700">{newsMessage}</p> : null}
                </form>
              </article>

              <article className="rounded-2xl border border-zinc-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-5 py-3">
                  <div>
                    <h3 className="text-base font-semibold text-zinc-900">Publicaciones</h3>
                    <p className="text-xs text-zinc-500">
                      {newsPosts.length} en total · {newsPosts.filter((post) => post.publicado).length} publicadas
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void cargarNovedades()}
                    className="rounded-xl border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
                  >
                    Actualizar
                  </button>
                </div>

                <div className="space-y-3 p-5">
                  {newsLoading ? (
                    <p className="text-sm text-zinc-500">Cargando novedades…</p>
                  ) : newsError ? (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                      {newsError}
                    </div>
                  ) : newsPosts.length === 0 ? (
                    <p className="text-sm text-zinc-500">
                      Todavía no hay novedades publicadas. Creá la primera con el formulario.
                    </p>
                  ) : (
                    newsPosts.map((post) => (
                      <div key={post.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="rounded-full bg-zinc-200 px-2 py-0.5 font-semibold text-zinc-700">
                                {post.categoria}
                              </span>
                              {post.destacado ? (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
                                  Destacado
                                </span>
                              ) : null}
                              <span
                                className={
                                  post.publicado
                                    ? "rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"
                                    : "rounded-full bg-zinc-200 px-2 py-0.5 font-semibold text-zinc-600"
                                }
                              >
                                {post.publicado ? "Publicada" : "Borrador"}
                              </span>
                              <span className="text-zinc-500">{post.fecha}</span>
                            </div>
                            <p className="mt-1 text-sm font-semibold text-zinc-900">{post.titulo}</p>
                            {post.resumen ? <p className="mt-1 text-xs text-zinc-600">{post.resumen}</p> : null}
                            <p className="mt-1 text-xs text-zinc-500">
                              {post.imagenUrl ? "Con imagen" : ""}
                              {post.imagenUrl && post.videoUrl ? " · " : ""}
                              {post.videoUrl ? "Con video" : ""}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setNewsForm({
                                  id: post.id,
                                  titulo: post.titulo,
                                  resumen: post.resumen,
                                  contenido: post.contenido,
                                  categoria: post.categoria,
                                  imagenUrl: post.imagenUrl,
                                  videoUrl: post.videoUrl,
                                  destacado: post.destacado,
                                  publicado: post.publicado,
                                })
                              }
                              className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => void alternarPublicado(post)}
                              className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
                            >
                              {post.publicado ? "Despublicar" : "Publicar"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void eliminarNovedad(post)}
                              className="rounded-lg border border-rose-300 bg-white px-2 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                            >
                              Eliminar
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </article>
            </div>
          </section>
        )}

        {activeSection === "register-user" && (
        <section id="register-user-panel" className="space-y-4 scroll-mt-24">
          <article className="rounded-2xl border border-zinc-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Administración de acceso</p>
                <h2 className="mt-2 text-2xl font-semibold text-zinc-900">Register user</h2>
                <p className="mt-2 text-sm text-zinc-600">
                  Registra nuevos usuarios del sistema desde el módulo de alta dedicado.
                </p>
              </div>
              <UserPlus className="h-6 w-6 text-zinc-700" />
            </div>

            <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              <p>Acción recomendada: abrir el formulario de registro y crear la cuenta con datos completos.</p>
              <a
                href="/register-member"
                className="mt-4 inline-flex items-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
              >
                Abrir modulo de registro de miembros
              </a>
            </div>
          </article>
        </section>
        )}

        {activeSection === "auditoria" && (
          <section id="auditoria" className="scroll-mt-24">
            <AuditoriaView />
          </section>
        )}

        {activeSection === "resumen" && (
        <section id="contratos" className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 scroll-mt-24">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-zinc-700" />
              <h2 className="font-semibold text-zinc-900">Contratos empresariales recientes</h2>
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Users className="h-4 w-4" /> Supervisión legal y financiera
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-zinc-500">
                  <th className="py-2 pr-3">ID</th>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Monto</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2">Unidad</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((contract) => (
                  <tr key={contract.id} className="border-b border-zinc-100 text-zinc-700">
                    <td className="py-2 pr-3 font-medium text-zinc-900">{contract.id}</td>
                    <td className="py-2 pr-3">{contract.client}</td>
                    <td className="py-2 pr-3">{formatMoneyUSD(contract.amountUsd)}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          contract.status === "Aprobado"
                            ? "bg-emerald-100 text-emerald-700"
                            : contract.status === "Pendiente"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-sky-100 text-sky-700"
                        }`}
                      >
                        {contract.status}
                      </span>
                    </td>
                    <td className="py-2">{contract.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        )}

          </div>
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-8 gap-1 border-t border-zinc-200 bg-white p-2 lg:hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;

          return (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              className={`flex flex-col items-center gap-1 rounded-lg p-2 text-[11px] ${
                isActive ? "bg-zinc-900 text-white" : "text-zinc-600"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
