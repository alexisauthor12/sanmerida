"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Boxes,
  Bot,
  Building2,
  Cable,
  CircleAlert,
  Cpu,
  Factory,
  Gauge,
  Home,
  Megaphone,
  Radio,
  ServerCog,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Workflow,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type AdminUser = {
  userId?: string;
  email: string;
  nombre: string;
  isMember: boolean;
};

type IndustrialTab = "home" | "automatizacion" | "register" | "agentes" | "marketing";

type TrendPoint = {
  slot: string;
  primary: number;
  secondary: number;
  tertiary: number;
};

type FeedChip = {
  label: string;
  value: string;
  delta: string;
  tone: "up" | "down";
};

type ActivityItem = {
  title: string;
  detail: string;
  tone: "ok" | "warn" | "risk";
};

type ExecutionItem = {
  process: string;
  duration: string;
  status: string;
};

type KpiCard = {
  value: string;
  label: string;
};

type AutomationLane = {
  name: string;
  throughput: number;
  efficiency: number;
  incidents: number;
};

type AutomationWorkflow = {
  flow: string;
  owner: string;
  status: string;
  cycle: string;
};

type FlowStep = {
  step: string;
  layer: string;
  title: string;
  detail: string;
  signal: string;
};

type DataSourceGroup = {
  title: string;
  sources: string[];
};

type BusinessObject = {
  name: string;
  detail: string;
};

type EngineNode = {
  name: string;
  focus: string;
  agents: number;
  status: "Activo" | "Estable" | "Observacion";
};

type KernelDecision = {
  title: string;
  owner: string;
  status: "Activo" | "Estable" | "Observacion";
  confidence: string;
  impact: string;
};

type ConflictItem = {
  title: string;
  engines: string;
  severity: "ALTO" | "MEDIO" | "BAJO";
  resolution: string;
};

const navItems: Array<{ id: IndustrialTab; label: string; icon: typeof Workflow }> = [
  { id: "home", label: "Home", icon: Home },
  { id: "automatizacion", label: "Automatizacion", icon: Workflow },
  { id: "register", label: "Register user", icon: UserPlus },
  { id: "agentes", label: "Agentes", icon: Bot },
  { id: "marketing", label: "Marketing", icon: Megaphone },
];

const feedByTab: Record<IndustrialTab, FeedChip[]> = {
  home: [
    { label: "BTC", value: "86.4K", delta: "+3.84%", tone: "up" },
    { label: "USD/MXN", value: "16.92", delta: "-0.44%", tone: "down" },
    { label: "CPM LATAM", value: "$12.8", delta: "+12%", tone: "up" },
    { label: "Ecomm Traffic", value: "7.1M", delta: "+7.1%", tone: "up" },
    { label: "SaaS Trend", value: "18.4%", delta: "+18%", tone: "up" },
  ],
  automatizacion: [
    { label: "OT completadas", value: "1,248", delta: "+8.4%", tone: "up" },
    { label: "Downtime", value: "1.9h", delta: "-0.3h", tone: "up" },
    { label: "Eventos/min", value: "4.2K", delta: "+5.1%", tone: "up" },
    { label: "Errores", value: "12", delta: "+2", tone: "down" },
    { label: "Capacidad", value: "98.3%", delta: "+1.2%", tone: "up" },
  ],
  register: [
    { label: "Nuevos usuarios", value: "34", delta: "+5", tone: "up" },
    { label: "Membresias", value: "12", delta: "+2", tone: "up" },
    { label: "Validaciones", value: "99.4%", delta: "+0.8%", tone: "up" },
    { label: "Duplicados", value: "3", delta: "-1", tone: "up" },
    { label: "Tiempo registro", value: "42s", delta: "-5s", tone: "up" },
  ],
  agentes: [
    { label: "Agentes online", value: "27", delta: "+3", tone: "up" },
    { label: "Cobertura", value: "91%", delta: "+4.8%", tone: "up" },
    { label: "Tareas resueltas", value: "918", delta: "+6.7%", tone: "up" },
    { label: "Escalaciones", value: "7", delta: "+1", tone: "down" },
    { label: "Latencia media", value: "640ms", delta: "-8.2%", tone: "up" },
  ],
  marketing: [
    { label: "Leads premium", value: "3,184", delta: "+12.6%", tone: "up" },
    { label: "ROAS", value: "4.8x", delta: "+0.7x", tone: "up" },
    { label: "CTR", value: "6.2%", delta: "+0.8%", tone: "up" },
    { label: "CAC", value: "$6.42", delta: "-4.2%", tone: "up" },
    { label: "Campanas", value: "14", delta: "+2", tone: "up" },
  ],
};

const trendByTab: Record<IndustrialTab, TrendPoint[]> = {
  home: [
    { slot: "08:00", primary: 18, secondary: 12, tertiary: 9 },
    { slot: "09:00", primary: 25, secondary: 16, tertiary: 12 },
    { slot: "10:00", primary: 35, secondary: 22, tertiary: 18 },
    { slot: "11:00", primary: 45, secondary: 28, tertiary: 24 },
    { slot: "12:00", primary: 62, secondary: 35, tertiary: 31 },
    { slot: "13:00", primary: 79, secondary: 41, tertiary: 38 },
  ],
  automatizacion: [
    { slot: "08:00", primary: 58, secondary: 39, tertiary: 46 },
    { slot: "09:00", primary: 64, secondary: 43, tertiary: 49 },
    { slot: "10:00", primary: 67, secondary: 48, tertiary: 54 },
    { slot: "11:00", primary: 74, secondary: 51, tertiary: 59 },
    { slot: "12:00", primary: 79, secondary: 57, tertiary: 63 },
    { slot: "13:00", primary: 86, secondary: 61, tertiary: 68 },
  ],
  register: [
    { slot: "08:00", primary: 14, secondary: 9, tertiary: 6 },
    { slot: "09:00", primary: 18, secondary: 12, tertiary: 8 },
    { slot: "10:00", primary: 23, secondary: 15, tertiary: 11 },
    { slot: "11:00", primary: 27, secondary: 18, tertiary: 13 },
    { slot: "12:00", primary: 31, secondary: 22, tertiary: 16 },
    { slot: "13:00", primary: 36, secondary: 25, tertiary: 19 },
  ],
  agentes: [
    { slot: "08:00", primary: 42, secondary: 36, tertiary: 31 },
    { slot: "09:00", primary: 48, secondary: 40, tertiary: 36 },
    { slot: "10:00", primary: 55, secondary: 46, tertiary: 41 },
    { slot: "11:00", primary: 63, secondary: 51, tertiary: 46 },
    { slot: "12:00", primary: 70, secondary: 58, tertiary: 52 },
    { slot: "13:00", primary: 77, secondary: 64, tertiary: 58 },
  ],
  marketing: [
    { slot: "08:00", primary: 33, secondary: 28, tertiary: 24 },
    { slot: "09:00", primary: 40, secondary: 31, tertiary: 28 },
    { slot: "10:00", primary: 47, secondary: 35, tertiary: 32 },
    { slot: "11:00", primary: 56, secondary: 40, tertiary: 38 },
    { slot: "12:00", primary: 61, secondary: 46, tertiary: 43 },
    { slot: "13:00", primary: 69, secondary: 51, tertiary: 49 },
  ],
};

const baseVolume = [20, 40, 45, 55, 80, 95];

const kpisByTab: Record<IndustrialTab, KpiCard[]> = {
  home: [
    { value: "1,248", label: "Usuarios activos" },
    { value: "12", label: "Procesos en ejecucion" },
    { value: "98.3%", label: "Tasa de exito" },
    { value: "4.2K", label: "Events / min" },
  ],
  automatizacion: [
    { value: "1,248", label: "Procesos activos" },
    { value: "12", label: "Colas ejecutandose" },
    { value: "98.3%", label: "Tasa de exito" },
    { value: "4.2K", label: "Events / min" },
  ],
  register: [
    { value: "34", label: "Registros del dia" },
    { value: "12", label: "Usuarios miembro" },
    { value: "99.4%", label: "Validacion correcta" },
    { value: "42s", label: "Tiempo promedio" },
  ],
  agentes: [
    { value: "27", label: "Agentes activos" },
    { value: "184", label: "Interacciones criticas" },
    { value: "91%", label: "Cobertura automatica" },
    { value: "918", label: "Tareas resueltas" },
  ],
  marketing: [
    { value: "3,184", label: "Leads calificados" },
    { value: "14", label: "Campanas en vivo" },
    { value: "4.8x", label: "ROAS" },
    { value: "12.6%", label: "Conversion B2B" },
  ],
};

const opportunitiesByTab: Record<IndustrialTab, string[]> = {
  home: [
    "Palabras clave explosivas en verticales industriales.",
    "Productos en alza con oportunidad de alto ticket.",
    "Senales predictivas sobre demanda regional.",
    "Funnel premium para expansion LatAm.",
  ],
  automatizacion: [
    "Reducir aprobaciones manuales en reposicion critica.",
    "Expandir control de OT vencidas con reglas de prioridad.",
    "Aumentar integracion entre planta, ERP y compras.",
    "Mejorar el throughput de pipelines nocturnos.",
  ],
  register: [
    "Agregar personal operativo por departamento.",
    "Crear miembros con clave encriptada institucional.",
    "Controlar duplicados por correo y telefono.",
    "Reducir friccion de onboarding interno.",
  ],
  agentes: [
    "Asignar agentes por carga predictiva y SLA real.",
    "Crear clusters de agentes por especialidad operativa.",
    "Reducir escalaciones de nivel medio con respuestas guiadas.",
    "Mejorar la trazabilidad de decisiones asistidas.",
  ],
  marketing: [
    "Escalar funnel industrial norte con mayor ticket promedio.",
    "Expandir audiencias B2B con senales de demanda temprana.",
    "Consolidar reporting de CAC por vertical de negocio.",
    "Activar nurture premium para leads de alto cierre.",
  ],
};

const executionsByTab: Record<IndustrialTab, ExecutionItem[]> = {
  home: [
    { process: "Reabastecimiento SKU-442", duration: "00:05:23", status: "Completado" },
    { process: "Campana Ads Latam", duration: "00:12:41", status: "En ejecucion" },
    { process: "Sincronizar ERP", duration: "00:00:58", status: "Completado" },
    { process: "Pipeline pago", duration: "00:02:04", status: "Fallo - Reintento" },
  ],
  automatizacion: [
    { process: "Reabastecimiento SKU-442", duration: "00:05:23", status: "Completado" },
    { process: "Sincronizar ERP", duration: "00:00:58", status: "Completado" },
    { process: "Pipeline de aprobacion", duration: "00:02:04", status: "En ejecucion" },
    { process: "Escalado de incidencias", duration: "00:01:21", status: "Reintento" },
  ],
  register: [
    { process: "Validar correo corporativo", duration: "00:00:11", status: "Completado" },
    { process: "Alta en sistema", duration: "00:00:18", status: "En ejecucion" },
    { process: "Asignar perfil", duration: "00:00:09", status: "Completado" },
    { process: "Notificar credenciales", duration: "00:00:06", status: "Completado" },
  ],
  agentes: [
    { process: "Coordinacion ICE Master", duration: "00:03:11", status: "Completado" },
    { process: "Asignacion de agentes", duration: "00:01:44", status: "En ejecucion" },
    { process: "Resumen ejecutivo", duration: "00:00:41", status: "Completado" },
    { process: "Verificacion de continuidad", duration: "00:01:19", status: "Completado" },
  ],
  marketing: [
    { process: "Campana Ads Latam", duration: "00:12:41", status: "En ejecucion" },
    { process: "Ajuste de pujas", duration: "00:02:12", status: "Completado" },
    { process: "Scoring de leads", duration: "00:01:18", status: "Completado" },
    { process: "Pipeline premium", duration: "00:03:27", status: "Completado" },
  ],
};

const activityByTab: Record<IndustrialTab, ActivityItem[]> = {
  home: [
    { title: "Market Feed", detail: "2,410 nuevos registros de actividad economica.", tone: "ok" },
    { title: "Predictivo", detail: "Proyeccion ajustada +4.2% en performance global.", tone: "ok" },
    { title: "Operacional", detail: "Reabastecimiento ejecutado sobre nodo prioritario.", tone: "ok" },
    { title: "Cliente", detail: "Nuevo lead premium clasificado para equipo comercial.", tone: "warn" },
    { title: "Integraciones", detail: "Webhook 3xx reintentado con exito.", tone: "risk" },
  ],
  automatizacion: [
    { title: "Market Feed", detail: "2,410 nuevos registros de flujo industrial.", tone: "ok" },
    { title: "Predictivo", detail: "Proyeccion ajustada +4.2% en productividad.", tone: "ok" },
    { title: "Operacional", detail: "Reabastecimiento ejecutado sobre nodo norte.", tone: "ok" },
    { title: "Integraciones", detail: "Webhook ERP 3xx reintentado con exito.", tone: "warn" },
    { title: "Seguridad", detail: "Una transaccion quedo en verificacion extendida.", tone: "risk" },
  ],
  register: [
    { title: "Registro", detail: "Se habilito alta directa de usuarios desde admin industrial.", tone: "ok" },
    { title: "Validacion", detail: "Control de correo, telefono y contrasena activa.", tone: "ok" },
    { title: "Seguridad", detail: "Sesion admin aislada durante el registro de terceros.", tone: "ok" },
    { title: "Operacion", detail: "Onboarding interno con menos pasos manuales.", tone: "warn" },
    { title: "Riesgo", detail: "Monitorear intentos de correo duplicado en horas pico.", tone: "risk" },
  ],
  agentes: [
    { title: "ICE Master", detail: "Redistribuyo carga entre 3 agentes senior.", tone: "ok" },
    { title: "Supervisor", detail: "Escalacion preventiva sobre cola critica.", tone: "warn" },
    { title: "Resumen", detail: "Nuevo brief ejecutivo emitido para direccion.", tone: "ok" },
    { title: "Cobertura", detail: "Capacidad multiagente en 91%.", tone: "ok" },
    { title: "Riesgo", detail: "Una dependencia externa sigue sin handshake estable.", tone: "risk" },
  ],
  marketing: [
    { title: "Ads", detail: "Campana industrial subio CTR en 0.8 puntos.", tone: "ok" },
    { title: "Demand Gen", detail: "Nuevos leads premium captados en region centro.", tone: "ok" },
    { title: "ROAS", detail: "Retorno consolidado subio por optimizacion de creativos.", tone: "ok" },
    { title: "Embudo", detail: "Se detecto friccion en la etapa de contacto comercial.", tone: "warn" },
    { title: "Alert", detail: "Una fuente de trafico presento caida de conversion.", tone: "risk" },
  ],
};

const statusCards = [
  { label: "Estado del sistema", value: "Uptime 99.98%", badge: "ALL OK", tone: "ok" },
  { label: "Ejecuciones activas", value: "12 workers", badge: "AUTO", tone: "neutral" },
  { label: "Errores / Alerts", value: "2 recientes", badge: "2", tone: "risk" },
  { label: "Rendimiento", value: "78%", badge: "OPT", tone: "warn" },
] as const;

const automationLanes: AutomationLane[] = [
  { name: "OT y mantenimiento", throughput: 92, efficiency: 96, incidents: 2 },
  { name: "ERP y compras", throughput: 84, efficiency: 91, incidents: 1 },
  { name: "Abastecimiento planta", throughput: 88, efficiency: 94, incidents: 3 },
  { name: "Control de calidad", throughput: 76, efficiency: 89, incidents: 2 },
];

const automationWorkflows: AutomationWorkflow[] = [
  { flow: "Reposicion automatica de stock", owner: "ICE Master", status: "Activo", cycle: "01m 42s" },
  { flow: "Escalado de OT vencidas", owner: "Supervisor OT", status: "Observacion", cycle: "03m 14s" },
  { flow: "Sincronizacion ERP industrial", owner: "Integraciones", status: "Estable", cycle: "00m 58s" },
  { flow: "Aprobacion de compras criticas", owner: "Backoffice", status: "Activo", cycle: "02m 21s" },
];

const operationalFlowSteps: FlowStep[] = [
  {
    step: "01",
    layer: "Data Universe",
    title: "Datos del mercado",
    detail: "El sistema observa mercado, empresa, clientes, competencia, finanzas y senales externas en tiempo continuo.",
    signal: "4.2K eventos/min",
  },
  {
    step: "02",
    layer: "Data Layer",
    title: "Ingesta y normalizacion",
    detail: "Las fuentes se limpian, se validan y se convierten en objetos empresariales comunes para todos los motores.",
    signal: "99.1% integridad",
  },
  {
    step: "03",
    layer: "Intelligence Engine Layer",
    title: "Analisis de inteligencia",
    detail: "Los 12 motores activan agentes para detectar patron, riesgo, oportunidad y palancas de accion.",
    signal: "120 agentes",
  },
  {
    step: "04",
    layer: "Simulation Layer",
    title: "Simulacion de decisiones",
    detail: "El sistema prueba escenarios de pricing, demanda, expansion, inventario y riesgo antes de ejecutar.",
    signal: "38 escenarios/h",
  },
  {
    step: "05",
    layer: "Cognitive Kernel",
    title: "Decision del kernel",
    detail: "El kernel prioriza, arbitra conflictos, audita y aprueba la mejor ruta ajustada por impacto y riesgo.",
    signal: "12 decisiones activas",
  },
  {
    step: "06",
    layer: "Execution Layer",
    title: "Ejecucion real",
    detail: "Se disparan workflows sobre pricing, marketing, inventario, operaciones, alianzas y asignacion de capital.",
    signal: "126 workflows",
  },
  {
    step: "07",
    layer: "Results Layer",
    title: "Medicion de resultados",
    detail: "Se miden revenue, conversion, demanda, throughput, respuesta de mercado y comportamiento de cliente.",
    signal: "78 KPIs vivos",
  },
  {
    step: "08",
    layer: "Learning Layer",
    title: "Aprendizaje continuo",
    detail: "Los resultados vuelven al sistema para ajustar modelos, reglas, prioridades y memoria institucional.",
    signal: "24 playbooks",
  },
];

const dataSourceGroups: DataSourceGroup[] = [
  { title: "Market Data", sources: ["Precios", "Tendencias", "Competencia", "Demanda"] },
  { title: "Business Data", sources: ["Ventas", "Inventario", "Campanas", "Clientes"] },
  { title: "Economic Data", sources: ["Liquidez", "Costo de capital", "FX", "Inflacion"] },
  { title: "External Signals", sources: ["Noticias", "Redes", "Industria", "Riesgo"] },
];

const businessObjects: BusinessObject[] = [
  { name: "Producto", detail: "precio, costo, inventario, margen" },
  { name: "Cliente", detail: "segmento, preferencia, churn, LTV" },
  { name: "Mercado", detail: "demanda, competencia, saturacion, posicion" },
  { name: "Operacion", detail: "throughput, capacidad, SLA, OTIF" },
  { name: "Capital", detail: "caja, ROI, riesgo, asignacion" },
  { name: "Decision", detail: "impacto, confianza, restricciones, owner" },
];

const engineNodes: EngineNode[] = [
  { name: "Market Intelligence", focus: "Radar competitivo y oportunidades", agents: 10, status: "Activo" },
  { name: "Consumer Behavior", focus: "Patrones de compra y retencion", agents: 10, status: "Activo" },
  { name: "Financial & Economic", focus: "Caja, pricing y ROI", agents: 10, status: "Observacion" },
  { name: "Operations & Logistics", focus: "Inventario, capacidad y throughput", agents: 10, status: "Activo" },
  { name: "Growth & Marketing", focus: "Demanda, conversion y adquisicion", agents: 10, status: "Activo" },
  { name: "Product & Innovation", focus: "Experimentacion y propuestas de valor", agents: 10, status: "Estable" },
  { name: "Ecosystem Management", focus: "Proveedores, socios y marketplaces", agents: 10, status: "Estable" },
  { name: "Strategic Planning", focus: "Prioridades globales y expansion", agents: 10, status: "Activo" },
  { name: "Risk & Compliance", focus: "Conflictos, auditoria y control", agents: 10, status: "Observacion" },
  { name: "Automation & Execution", focus: "Ejecucion autonoma sobre el negocio", agents: 10, status: "Activo" },
  { name: "Technology Infrastructure", focus: "Integraciones, resiliencia y latencia", agents: 10, status: "Estable" },
  { name: "Expansion & Global Strategy", focus: "Nuevos mercados y escalamiento", agents: 10, status: "Observacion" },
];

const kernelDecisions: KernelDecision[] = [
  {
    title: "Reasignar capital hacia el corredor industrial norte",
    owner: "Strategic Planner",
    status: "Activo",
    confidence: "94%",
    impact: "+12.4% potencial de revenue",
  },
  {
    title: "Escalar abastecimiento por forecast de quiebre regional",
    owner: "Master Orchestrator",
    status: "Estable",
    confidence: "91%",
    impact: "-18% probabilidad de stockout",
  },
  {
    title: "Aplicar pricing segmentado solo en cohortes elasticas",
    owner: "Conflict Arbiter",
    status: "Observacion",
    confidence: "87%",
    impact: "+3.1 pts de margen",
  },
  {
    title: "Reducir gasto tactico y priorizar campanas premium",
    owner: "Decision Auditor",
    status: "Estable",
    confidence: "89%",
    impact: "+0.6x ROAS consolidado",
  },
];

const conflictItems: ConflictItem[] = [
  {
    title: "Expansion vs caja operativa",
    engines: "Expansion & Global Strategy / Financial & Economic",
    severity: "ALTO",
    resolution: "Kernel bloquea 18% del presupuesto hasta cerrar stress test de liquidez.",
  },
  {
    title: "Pricing agresivo vs retencion premium",
    engines: "Financial & Economic / Consumer Behavior",
    severity: "MEDIO",
    resolution: "Se aprueba pricing segmentado por elasticidad y sensibilidad de churn.",
  },
  {
    title: "Demanda inducida vs capacidad de planta",
    engines: "Growth & Marketing / Operations & Logistics",
    severity: "ALTO",
    resolution: "Marketing reduce intensidad 9% hasta liberar el nodo norte.",
  },
  {
    title: "Automatizacion veloz vs cumplimiento",
    engines: "Automation & Execution / Risk & Compliance",
    severity: "BAJO",
    resolution: "Se habilita rollout parcial con auditoria posterior y rollback activo.",
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function nextTrendPoint(last: TrendPoint, nextSlot: string): TrendPoint {
  return {
    slot: nextSlot,
    primary: clamp(last.primary + (Math.floor(Math.random() * 9) - 3), 20, 97),
    secondary: clamp(last.secondary + (Math.floor(Math.random() * 7) - 3), 18, 92),
    tertiary: clamp(last.tertiary + (Math.floor(Math.random() * 7) - 3), 14, 88),
  };
}

function getStatusTone(status: string) {
  if (status === "Activo" || status === "Estable") return "text-emerald-300 bg-emerald-500/10";
  if (status === "Observacion") return "text-amber-300 bg-amber-500/10";
  return "text-slate-200 bg-white/10";
}

export default function IndustrialDashboardClient({ user }: { user: AdminUser }) {
  const [activeTab, setActiveTab] = useState<IndustrialTab>("home");
  const [clockLabel, setClockLabel] = useState("--:--:--");
  const [feed, setFeed] = useState(feedByTab.automatizacion);
  const [trendData, setTrendData] = useState(trendByTab.automatizacion);
  const [volumeData, setVolumeData] = useState([...baseVolume]);
  const [activities, setActivities] = useState(activityByTab.automatizacion);

  function handleTabChange(tab: IndustrialTab) {
    setActiveTab(tab);
    setFeed(feedByTab[tab]);
    setTrendData(trendByTab[tab]);
    setActivities(activityByTab[tab]);
    setVolumeData([...baseVolume]);
  }

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setClockLabel(new Date().toLocaleTimeString("es-VE"));
      setFeed((current) => [...current.slice(1), current[0]]);
      setActivities((current) => [...current.slice(1), current[0]]);
      setVolumeData((current) => [
        ...current.slice(1),
        clamp((current[current.length - 1] ?? 60) + (Math.floor(Math.random() * 19) - 8), 24, 105),
      ]);
      setTrendData((current) => {
        const last = current[current.length - 1] ?? trendByTab[activeTab][trendByTab[activeTab].length - 1];
        const nextHour = Number(last.slot.slice(0, 2)) + 1;
        const nextSlot = `${String(nextHour > 23 ? nextHour - 24 : nextHour).padStart(2, "0")}:00`;
        return [...current.slice(1), nextTrendPoint(last, nextSlot)];
      });
    }, 3600);

    return () => window.clearInterval(intervalId);
  }, [activeTab]);

  const kpis = kpisByTab[activeTab];
  const opportunities = opportunitiesByTab[activeTab];
  const executions = executionsByTab[activeTab];
  const isHomeView = activeTab === "home" || activeTab === "marketing";
  const isRegisterView = activeTab === "register";
  const isAgentsView = activeTab === "agentes";

  const chartLabels = useMemo(() => {
    if (activeTab === "automatizacion") {
      return {
        title: "Tendencias globales - Proyeccion",
        subtitle: "Proyeccion y comportamiento reciente",
        primary: "Automatizacion",
        secondary: "Continuidad",
        tertiary: "Eficiencia",
      };
    }

    return {
      title: "Tendencias comerciales - Proyeccion",
      subtitle: "Demanda, performance y conversion reciente",
      primary: "Marketing",
      secondary: "ROAS",
      tertiary: "Conversion",
    };
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#050506_0%,#070708_100%)] px-4 py-7 text-slate-100 xl:px-6">
      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-5 rounded-[14px] border border-white/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.00))] p-5 shadow-[0_10px_40px_rgba(2,6,10,0.7)] xl:min-h-[72vh] xl:grid-cols-[260px_minmax(0,1fr)_420px] xl:p-6">
        <header className="xl:col-span-3 flex flex-wrap items-center gap-4 px-1 pb-2">
          <div className="ml-2 inline-flex items-center gap-3 text-slate-400">
            <Building2 className="h-4 w-4 text-cyan-300" />
            <span className="text-sm font-semibold tracking-[0.04em]">EMPRESA DIGITAL AUTONOMA</span>
          </div>
          <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-xl border border-white/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.00))] px-3 py-2">
            <div className="mr-3 shrink-0 text-xs text-slate-500">Market Feed</div>
            <div className="min-w-0 overflow-hidden">
              <div className="flex w-max gap-3 whitespace-nowrap animate-[videoMarquee_28s_linear_infinite] motion-reduce:animate-none">
                {feed.concat(feed).map((item, index) => (
                  <div key={`${item.label}-${index}`} className="inline-flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-1.5 text-sm text-slate-400">
                    <span>{item.label}</span>
                    <span className="font-semibold text-slate-100">{item.value}</span>
                    <span className={item.tone === "up" ? "font-semibold text-emerald-300" : "font-semibold text-rose-300"}>{item.delta}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/15 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-200">
            <Radio className="h-3.5 w-3.5" />
            Live {clockLabel}
          </div>
        </header>

        <aside className="rounded-xl border border-white/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.00))] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs tracking-[0.08em] text-slate-500">ICE MASTER</p>
              <p className="mt-1 text-sm font-semibold text-white">Dashboard Industrial</p>
            </div>
            <Link href="/admin" className="inline-flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-xs text-slate-300 transition hover:bg-white/[0.06] hover:text-white">
              <ArrowLeft className="h-3.5 w-3.5" />
              Volver
            </Link>
          </div>

          <nav className="mt-5 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleTabChange(item.id)}
                  className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition ${
                    isActive
                      ? "border-cyan-400/15 bg-cyan-400/10 text-white"
                      : "border-transparent text-slate-300 hover:border-white/5 hover:bg-white/[0.03]"
                  }`}
                >
                  <span className="inline-flex items-center gap-3">
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </span>
                  <span className="text-xs text-slate-500">MOTOR</span>
                </button>
              );
            })}
          </nav>

          <div className="mt-6 rounded-2xl border border-white/5 bg-black/20 p-4 text-sm text-slate-300">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Sesion</p>
            <p className="mt-2 font-medium text-white">{user.nombre}</p>
            <p className="text-xs text-slate-400">{user.email}</p>
            <div className="mt-4 space-y-2 text-xs text-slate-400">
              <p>Uptime <span className="font-semibold text-slate-100">99.98%</span></p>
              <p>Workers <span className="font-semibold text-slate-100">12</span></p>
              <p>Integraciones <span className="font-semibold text-slate-100">ERP / CRM / BI</span></p>
            </div>
          </div>
        </aside>

        {isHomeView ? (
          <>
            <main className="grid grid-rows-[auto_1fr] gap-5">
              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {kpis.map((item) => (
                  <article key={item.label} className="rounded-xl border border-white/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.00))] p-4">
                    <p className="text-[28px] font-semibold text-white">{item.value}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.label}</p>
                  </article>
                ))}
              </section>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div>
                  <section className="rounded-xl border border-white/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.00))] p-5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-slate-400">{chartLabels.title}</p>
                        <p className="text-xs text-slate-500">{chartLabels.subtitle}</p>
                      </div>
                      <div className="text-xs text-slate-500">Ultima actualizacion • <strong className="text-slate-300">2m</strong></div>
                    </div>

                    <div className="h-[260px] rounded-xl bg-transparent">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trendData}>
                          <defs>
                            <linearGradient id="industrialHomeFill" x1="0" x2="0" y1="0" y2="1">
                              <stop offset="0%" stopColor="#20c0c7" stopOpacity={0.18} />
                              <stop offset="100%" stopColor="#20c0c7" stopOpacity={0.01} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="slot" axisLine={false} tickLine={false} stroke="#7f8b97" />
                          <YAxis axisLine={false} tickLine={false} stroke="#7f8b97" />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#0f1318",
                              borderRadius: "16px",
                              border: "1px solid rgba(255,255,255,0.08)",
                              color: "#e5eef7",
                            }}
                          />
                          <Area type="monotone" dataKey="primary" stroke="#20c0c7" fill="url(#industrialHomeFill)" strokeWidth={2.2} />
                          <Line type="monotone" dataKey="secondary" stroke="#86f0b7" strokeWidth={1.7} dot={false} />
                          <Line type="monotone" dataKey="tertiary" stroke="#ffd37a" strokeWidth={1.7} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </section>

                  <div className="mt-5 grid gap-5 xl:grid-cols-2">
                    <section className="rounded-xl border border-white/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.00))] p-5">
                      <p className="text-sm text-slate-400">Oportunidades detectadas</p>
                      <ul className="mt-4 space-y-2 text-sm text-slate-400">
                        {opportunities.map((item) => (
                          <li key={item} className="rounded-lg border border-white/5 bg-black/10 px-3 py-2">{item}</li>
                        ))}
                      </ul>
                    </section>

                    <section className="rounded-xl border border-white/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.00))] p-5">
                      <p className="text-sm text-slate-400">Ejecuciones activas</p>
                      <div className="mt-4 overflow-hidden rounded-xl border border-white/5 bg-black/10">
                        <table className="min-w-full text-sm">
                          <thead className="text-left text-xs text-slate-500">
                            <tr>
                              <th className="px-3 py-3">Proceso</th>
                              <th className="px-3 py-3">Duracion</th>
                              <th className="px-3 py-3">Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {executions.map((row) => (
                              <tr key={`${row.process}-${row.duration}`} className="border-t border-white/5 text-slate-300">
                                <td className="px-3 py-3">{row.process}</td>
                                <td className="px-3 py-3">{row.duration}</td>
                                <td className="px-3 py-3">{row.status}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </div>
                </div>

                <aside className="space-y-5">
                  <section className="rounded-xl border border-white/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.00))] p-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm text-slate-400">Volumen de actividad</p>
                      <span className="text-xs text-slate-500">Meses recientes</span>
                    </div>
                    <div className="h-[240px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={volumeData.map((value, index) => ({ label: `M${index + 1}`, value }))}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="label" axisLine={false} tickLine={false} stroke="#7f8b97" />
                          <YAxis axisLine={false} tickLine={false} stroke="#7f8b97" />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#0f1318",
                              borderRadius: "16px",
                              border: "1px solid rgba(255,255,255,0.08)",
                              color: "#e5eef7",
                            }}
                          />
                          <Bar dataKey="value" fill="#20c0c7" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </section>
                </aside>
              </div>
            </main>

            <aside className="space-y-4">
              <section className="rounded-xl border border-white/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.00))] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-400">Actividad de agentes</p>
                  <span className="text-xs text-slate-500">Ultimos eventos</span>
                </div>
                <div className="max-h-[320px] space-y-3 overflow-auto pr-1">
                  {activities.map((item, index) => (
                    <article key={`${item.title}-${index}`} className="rounded-lg border-l-2 border-white/5 bg-black/10 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <strong className="text-sm text-white">{item.title}</strong>
                        <span className={item.tone === "ok" ? "text-xs font-semibold text-emerald-300" : item.tone === "warn" ? "text-xs font-semibold text-amber-300" : "text-xs font-semibold text-rose-300"}>
                          {item.tone === "ok" ? "OK" : item.tone === "warn" ? "WARN" : "RISK"}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-6 text-slate-400">{item.detail}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="space-y-3 rounded-xl border border-white/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.00))] p-4">
                {statusCards.map((item) => (
                  <article key={item.label} className="flex items-center justify-between rounded-lg border border-white/5 bg-black/10 px-4 py-3">
                    <div>
                      <p className="text-xs text-slate-500">{item.label}</p>
                      <p className="mt-1 font-semibold text-white">{item.value}</p>
                    </div>
                    <span className={`rounded-full border border-white/5 px-3 py-1 text-xs font-semibold ${item.tone === "ok" ? "text-emerald-300" : item.tone === "warn" ? "text-amber-300" : item.tone === "risk" ? "text-rose-300" : "text-slate-200"}`}>
                      {item.badge}
                    </span>
                  </article>
                ))}
              </section>

              <section className="rounded-xl border border-white/5 bg-[linear-gradient(180deg,rgba(32,192,199,0.10),rgba(255,255,255,0.02))] p-4">
                <div className="flex items-center gap-2 text-white">
                  <ShieldCheck className="h-4 w-4 text-cyan-200" />
                  <p className="text-sm font-semibold">{activeTab === "home" ? "Resumen del home" : `Resumen de ${activeTab}`}</p>
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-200/90">
                  {activeTab === "home"
                    ? "Home industrial alineado al control room ejecutivo: ticker, KPIs, tendencias, volumen, actividad, oportunidades y ejecuciones."
                    : `Vista ejecutiva del motor ${activeTab} sobre el shell principal, mientras se completa su sub-dashboard independiente.`}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1">Produccion</span>
                  <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1">Realtime</span>
                  <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1">Industrial</span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/5 bg-black/10 p-3">
                    <div className="inline-flex items-center gap-2 text-sm text-white">
                      <Sparkles className="h-4 w-4 text-cyan-200" />
                      Home premium
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-black/10 p-3">
                    <div className="inline-flex items-center gap-2 text-sm text-white">
                      <CircleAlert className="h-4 w-4 text-cyan-200" />
                      Listo para crecer
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-black/10 p-3">
                    <div className="inline-flex items-center gap-2 text-sm text-white">
                      <Gauge className="h-4 w-4 text-cyan-200" />
                      Datos vivos
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-black/10 p-3">
                    <div className="inline-flex items-center gap-2 text-sm text-white">
                      <Workflow className="h-4 w-4 text-cyan-200" />
                      Flujo modular
                    </div>
                  </div>
                </div>
              </section>
            </aside>
          </>
        ) : isRegisterView ? (
          <>
            <main className="space-y-5 xl:col-span-2">
              <section className="rounded-2xl border border-cyan-400/10 bg-[linear-gradient(180deg,rgba(32,192,199,0.10),rgba(255,255,255,0.02))] p-6 shadow-[0_10px_40px_rgba(2,6,10,0.7)]">
                <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/70">Gestion de acceso</p>
                <h1 className="mt-2 text-3xl font-semibold text-white">Register user</h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                  Para mantener el dashboard rapido, el registro de usuarios se ejecuta en una vista dedicada.
                </p>
              </section>

              <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
                <div className="mb-4 flex items-center gap-2 text-white">
                  <UserPlus className="h-5 w-5 text-cyan-300" />
                  <div>
                    <p className="font-semibold">Registrar usuario al sistema</p>
                    <p className="text-xs text-slate-500">Abre el modulo de alta y crea cuentas sin afectar el rendimiento de esta pantalla.</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href="/register"
                    className="inline-flex h-11 items-center rounded-xl bg-white px-5 text-sm font-semibold text-black transition hover:bg-white/90"
                  >
                    Abrir modulo de registro
                  </Link>
                  <span className="text-xs text-slate-500">Se abre en pagina dedicada para evitar carga extra en admin industrial.</span>
                </div>
              </section>
            </main>

            <aside className="space-y-4">
              <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                <div className="mb-3 flex items-center gap-2 text-white">
                  <ShieldCheck className="h-4 w-4 text-cyan-300" />
                  <p className="text-sm font-semibold">Politica de registro</p>
                </div>
                <ul className="space-y-2 text-xs text-slate-400">
                  <li className="rounded-lg border border-white/5 bg-black/10 px-3 py-2">Campos obligatorios y validacion de correo.</li>
                  <li className="rounded-lg border border-white/5 bg-black/10 px-3 py-2">Control de duplicados por correo en backend.</li>
                  <li className="rounded-lg border border-white/5 bg-black/10 px-3 py-2">Contrasena minima de 8 caracteres.</li>
                  <li className="rounded-lg border border-white/5 bg-black/10 px-3 py-2">Modulo dedicado para rendimiento estable del dashboard.</li>
                </ul>
              </section>

              <section className="rounded-2xl border border-white/5 bg-[linear-gradient(180deg,rgba(32,192,199,0.10),rgba(255,255,255,0.02))] p-4">
                <div className="flex items-center gap-2 text-white">
                  <Sparkles className="h-4 w-4 text-cyan-200" />
                  <p className="text-sm font-semibold">Onboarding empresarial</p>
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-200/90">
                  Esta pestana conecta la gestion industrial con el alta de usuarios para mantener
                  trazabilidad de acceso y coherencia en todo el sistema.
                </p>
              </section>
            </aside>
          </>
        ) : isAgentsView ? (
          <>
            <main className="space-y-5 xl:col-span-2">
              <section className="rounded-2xl border border-cyan-400/10 bg-[linear-gradient(180deg,rgba(32,192,199,0.10),rgba(255,255,255,0.02))] p-6 shadow-[0_10px_40px_rgba(2,6,10,0.7)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-4xl">
                    <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/70">Operational Flow Architecture</p>
                    <h1 className="mt-2 text-3xl font-semibold text-white">Motor de agentes y flujo real del sistema</h1>
                    <p className="mt-3 text-sm leading-7 text-slate-300">
                      Este panel muestra como opera el sistema por dentro: entrada de datos, normalizacion,
                      activacion de motores, simulacion, decision del kernel, ejecucion y aprendizaje continuo.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Motores</p>
                      <p className="mt-2 text-3xl font-semibold text-white">12</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Agentes</p>
                      <p className="mt-2 text-3xl font-semibold text-white">120</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Kernel</p>
                      <p className="mt-2 text-3xl font-semibold text-cyan-200">8</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Ciclo</p>
                      <p className="mt-2 text-3xl font-semibold text-white">24/7</p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <article className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
                  <div className="mb-4 flex items-center gap-2 text-white">
                    <Workflow className="h-5 w-5 text-cyan-300" />
                    <div>
                      <p className="font-semibold">Flujo operacional continuo</p>
                      <p className="text-xs text-slate-500">Del mundo real al aprendizaje institucional.</p>
                    </div>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {operationalFlowSteps.map((item) => (
                      <article key={item.step} className="rounded-xl border border-white/5 bg-black/15 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/70">Stage {item.step}</p>
                            <p className="mt-2 text-lg font-semibold text-white">{item.title}</p>
                            <p className="mt-1 text-xs text-slate-500">{item.layer}</p>
                          </div>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-200">{item.signal}</span>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-slate-400">{item.detail}</p>
                      </article>
                    ))}
                  </div>
                </article>

                <article className="space-y-4 rounded-2xl border border-white/5 bg-white/[0.02] p-5">
                  <div>
                    <p className="text-sm font-semibold text-white">Data Universe</p>
                    <p className="mt-1 text-xs text-slate-500">Todo lo que entra al sistema antes de ser convertido en contexto compartido.</p>
                  </div>
                  <div className="space-y-3">
                    {dataSourceGroups.map((group) => (
                      <article key={group.title} className="rounded-xl border border-white/5 bg-black/15 p-4">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{group.title}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                          {group.sources.map((source) => (
                            <span key={source} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">{source}</span>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Objetos empresariales</p>
                    <div className="mt-3 space-y-2">
                      {businessObjects.map((item) => (
                        <article key={item.name} className="rounded-lg border border-white/5 bg-black/10 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <strong className="text-sm text-white">{item.name}</strong>
                            <span className="text-xs text-slate-500">Normalizado</span>
                          </div>
                          <p className="mt-2 text-xs leading-6 text-slate-400">{item.detail}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                </article>
              </section>

              <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <article className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
                  <div className="mb-4 flex items-center gap-2 text-white">
                    <Cpu className="h-5 w-5 text-cyan-300" />
                    <div>
                      <p className="font-semibold">Telemetria del sistema cognitivo</p>
                      <p className="text-xs text-slate-500">Observacion, decision y aprendizaje sobre el ciclo vivo.</p>
                    </div>
                  </div>
                  <div className="h-[320px] rounded-xl bg-black/20 p-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData}>
                        <defs>
                          <linearGradient id="agentsFlowFill" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#20c0c7" stopOpacity={0.22} />
                            <stop offset="100%" stopColor="#20c0c7" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="slot" axisLine={false} tickLine={false} stroke="#7f8b97" />
                        <YAxis axisLine={false} tickLine={false} stroke="#7f8b97" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#0f1318",
                            borderRadius: "16px",
                            border: "1px solid rgba(255,255,255,0.08)",
                            color: "#e5eef7",
                          }}
                        />
                        <Area type="monotone" dataKey="primary" stroke="#20c0c7" fill="url(#agentsFlowFill)" strokeWidth={2.6} />
                        <Line type="monotone" dataKey="secondary" stroke="#86f0b7" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="tertiary" stroke="#ffd37a" strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </article>

                <article className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
                  <div className="mb-4 flex items-center gap-2 text-white">
                    <Gauge className="h-5 w-5 text-cyan-300" />
                    <div>
                      <p className="font-semibold">Presion del bus cognitivo</p>
                      <p className="text-xs text-slate-500">Carga operacional por ventana activa.</p>
                    </div>
                  </div>
                  <div className="h-[320px] rounded-xl bg-black/20 p-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={volumeData.map((value, index) => ({ label: `W${index + 1}`, value }))}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} stroke="#7f8b97" />
                        <YAxis axisLine={false} tickLine={false} stroke="#7f8b97" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#0f1318",
                            borderRadius: "16px",
                            border: "1px solid rgba(255,255,255,0.08)",
                            color: "#e5eef7",
                          }}
                        />
                        <Bar dataKey="value" fill="#20c0c7" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </article>
              </section>

              <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <article className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
                  <div className="mb-4 flex items-center gap-2 text-white">
                    <Boxes className="h-5 w-5 text-cyan-300" />
                    <div>
                      <p className="font-semibold">12 intelligence engines</p>
                      <p className="text-xs text-slate-500">La capa donde viven los motores y los 120 agentes especializados.</p>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                    {engineNodes.map((engine) => (
                      <article key={engine.name} className="rounded-xl border border-white/5 bg-black/15 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-white">{engine.name}</p>
                            <p className="mt-1 text-xs leading-6 text-slate-500">{engine.focus}</p>
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-xs ${getStatusTone(engine.status)}`}>{engine.status}</span>
                        </div>
                        <div className="mt-4 flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs text-slate-400">
                          <span>Agentes activos</span>
                          <span className="font-semibold text-slate-100">{engine.agents}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </article>

                <div className="space-y-4">
                  <article className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
                    <div className="mb-4 flex items-center gap-2 text-white">
                      <ShieldCheck className="h-5 w-5 text-cyan-300" />
                      <div>
                        <p className="font-semibold">Decisiones del kernel</p>
                        <p className="text-xs text-slate-500">Lo que el sistema esta aprobando, supervisando o ejecutando.</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {kernelDecisions.map((decision) => (
                        <article key={decision.title} className="rounded-xl border border-white/5 bg-black/15 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-white">{decision.title}</p>
                              <p className="mt-1 text-xs text-slate-500">Owner: {decision.owner}</p>
                            </div>
                            <span className={`rounded-full px-2.5 py-1 text-xs ${getStatusTone(decision.status)}`}>{decision.status}</span>
                          </div>
                          <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
                            <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">Confianza: <span className="font-semibold text-slate-100">{decision.confidence}</span></div>
                            <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">Impacto: <span className="font-semibold text-slate-100">{decision.impact}</span></div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </article>

                  <article className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
                    <div className="mb-4 flex items-center gap-2 text-white">
                      <CircleAlert className="h-5 w-5 text-cyan-300" />
                      <div>
                        <p className="font-semibold">Conflictos inter-motor</p>
                        <p className="text-xs text-slate-500">Donde el kernel evita contradicciones entre motores y objetivos.</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {conflictItems.map((item) => (
                        <article key={item.title} className="rounded-xl border border-white/5 bg-black/15 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-white">{item.title}</p>
                              <p className="mt-1 text-xs text-slate-500">{item.engines}</p>
                            </div>
                            <span className={item.severity === "ALTO" ? "text-xs font-semibold text-rose-300" : item.severity === "MEDIO" ? "text-xs font-semibold text-amber-300" : "text-xs font-semibold text-emerald-300"}>
                              {item.severity}
                            </span>
                          </div>
                          <p className="mt-3 text-xs leading-6 text-slate-400">{item.resolution}</p>
                        </article>
                      ))}
                    </div>
                  </article>
                </div>
              </section>
            </main>

            <aside className="space-y-4">
              <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-400">Trail operacional</p>
                  <span className="text-xs text-slate-500">Eventos del sistema</span>
                </div>
                <div className="max-h-[320px] space-y-3 overflow-auto pr-1">
                  {activities.map((item, index) => (
                    <article key={`${item.title}-${index}`} className="rounded-lg border-l-2 border-white/5 bg-black/10 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <strong className="text-sm text-white">{item.title}</strong>
                        <span className={item.tone === "ok" ? "text-xs font-semibold text-emerald-300" : item.tone === "warn" ? "text-xs font-semibold text-amber-300" : "text-xs font-semibold text-rose-300"}>
                          {item.tone === "ok" ? "OK" : item.tone === "warn" ? "WARN" : "RISK"}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-6 text-slate-400">{item.detail}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="space-y-3 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                {[
                  { label: "Master Orchestrator", value: "12 colas vivas", badge: "ONLINE", tone: "ok" },
                  { label: "Strategic Planner", value: "4 escenarios en curso", badge: "SIM", tone: "warn" },
                  { label: "Conflict Arbiter", value: "3 conflictos activos", badge: "HOT", tone: "risk" },
                  { label: "Knowledge Manager", value: "24 playbooks activos", badge: "LEARN", tone: "neutral" },
                ].map((item) => (
                  <article key={item.label} className="flex items-center justify-between rounded-lg border border-white/5 bg-black/10 px-4 py-3">
                    <div>
                      <p className="text-xs text-slate-500">{item.label}</p>
                      <p className="mt-1 font-semibold text-white">{item.value}</p>
                    </div>
                    <span className={`rounded-full border border-white/5 px-3 py-1 text-xs font-semibold ${item.tone === "ok" ? "text-emerald-300" : item.tone === "warn" ? "text-amber-300" : item.tone === "risk" ? "text-rose-300" : "text-slate-200"}`}>
                      {item.badge}
                    </span>
                  </article>
                ))}
              </section>

              <section className="rounded-2xl border border-white/5 bg-[linear-gradient(180deg,rgba(32,192,199,0.10),rgba(255,255,255,0.02))] p-4">
                <div className="flex items-center gap-2 text-white">
                  <Sparkles className="h-4 w-4 text-cyan-200" />
                  <p className="text-sm font-semibold">Resumen del motor Agentes</p>
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-200/90">
                  Highdin no funciona como una IA de pregunta y respuesta. Observa el mercado, interpreta,
                  simula, decide con kernel, ejecuta en el mundo real y aprende sobre cada ciclo.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1">DATA</span>
                  <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1">KERNEL</span>
                  <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1">12 ENGINES</span>
                  <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1">SIMULATION</span>
                  <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1">EXECUTION</span>
                  <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1">LEARNING</span>
                </div>
              </section>
            </aside>
          </>
        ) : (
          <>
            <main className="space-y-5 xl:col-span-2">
              <section className="rounded-2xl border border-cyan-400/10 bg-[linear-gradient(180deg,rgba(32,192,199,0.10),rgba(255,255,255,0.02))] p-6 shadow-[0_10px_40px_rgba(2,6,10,0.7)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-3xl">
                    <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/70">Sub-dashboard completo</p>
                    <h1 className="mt-2 text-3xl font-semibold text-white">Motor de automatizacion industrial</h1>
                    <p className="mt-3 text-sm leading-7 text-slate-300">
                      Centro de control para workflows de planta, integraciones ERP, aprobaciones criticas,
                      mantenimiento automatizado y continuidad operativa en tiempo real.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Workflows</p>
                      <p className="mt-2 text-3xl font-semibold text-white">126</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Robustez</p>
                      <p className="mt-2 text-3xl font-semibold text-cyan-200">98.3%</p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <article className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
                  <div className="mb-4 flex items-center gap-2 text-white">
                    <Cpu className="h-5 w-5 text-cyan-300" />
                    <div>
                      <p className="font-semibold">Pulso de automatizacion</p>
                      <p className="text-xs text-slate-500">Throughput, continuidad y eficiencia por corte.</p>
                    </div>
                  </div>
                  <div className="h-[320px] rounded-xl bg-black/20 p-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData}>
                        <defs>
                          <linearGradient id="automationFill" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#20c0c7" stopOpacity={0.22} />
                            <stop offset="100%" stopColor="#20c0c7" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="slot" axisLine={false} tickLine={false} stroke="#7f8b97" />
                        <YAxis axisLine={false} tickLine={false} stroke="#7f8b97" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#0f1318",
                            borderRadius: "16px",
                            border: "1px solid rgba(255,255,255,0.08)",
                            color: "#e5eef7",
                          }}
                        />
                        <Area type="monotone" dataKey="primary" stroke="#20c0c7" fill="url(#automationFill)" strokeWidth={2.8} />
                        <Line type="monotone" dataKey="secondary" stroke="#86f0b7" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="tertiary" stroke="#ffd37a" strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </article>

                <article className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
                  <div className="mb-4 flex items-center gap-2 text-white">
                    <Boxes className="h-5 w-5 text-cyan-300" />
                    <div>
                      <p className="font-semibold">Carriles de ejecucion</p>
                      <p className="text-xs text-slate-500">Productividad y friccion por linea automatizada.</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {automationLanes.map((lane) => (
                      <article key={lane.name} className="rounded-xl border border-white/5 bg-black/15 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-white">{lane.name}</p>
                            <p className="mt-1 text-xs text-slate-500">Incidencias activas: {lane.incidents}</p>
                          </div>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-200">{lane.throughput}%</span>
                        </div>
                        <div className="mt-3 space-y-2 text-xs text-slate-400">
                          <div className="flex items-center justify-between">
                            <span>Throughput</span>
                            <span className="font-semibold text-slate-200">{lane.throughput}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-white/5">
                            <div className="h-full rounded-full bg-cyan-400" style={{ width: `${lane.throughput}%` }} />
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Eficiencia</span>
                            <span className="font-semibold text-slate-200">{lane.efficiency}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-white/5">
                            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${lane.efficiency}%` }} />
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </article>
              </section>

              <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                <article className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
                  <div className="mb-4 flex items-center gap-2 text-white">
                    <Factory className="h-5 w-5 text-cyan-300" />
                    <div>
                      <p className="font-semibold">Nodos de planta y control</p>
                      <p className="text-xs text-slate-500">Visibilidad sobre estaciones conectadas y continuidad.</p>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {[
                      { title: "PLC Norte", value: "En linea", note: "Sincronizacion 14 ms" },
                      { title: "Nodo Calidad", value: "Activo", note: "Inspeccion continua" },
                      { title: "Centro OT", value: "Estable", note: "Backlog dentro del umbral" },
                      { title: "Buffer de compras", value: "Observacion", note: "2 aprobaciones pendientes" },
                    ].map((card) => (
                      <article key={card.title} className="rounded-xl border border-white/5 bg-black/15 p-4">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{card.title}</p>
                        <p className="mt-2 text-2xl font-semibold text-white">{card.value}</p>
                        <p className="mt-2 text-xs text-slate-400">{card.note}</p>
                      </article>
                    ))}
                  </div>
                </article>

                <article className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
                  <div className="mb-4 flex items-center gap-2 text-white">
                    <ServerCog className="h-5 w-5 text-cyan-300" />
                    <div>
                      <p className="font-semibold">Workflows industriales</p>
                      <p className="text-xs text-slate-500">Orquestacion real por flujo critico.</p>
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-white/5 bg-black/15">
                    <table className="min-w-full text-sm">
                      <thead className="text-left text-xs text-slate-500">
                        <tr>
                          <th className="px-3 py-3">Flujo</th>
                          <th className="px-3 py-3">Owner</th>
                          <th className="px-3 py-3">Estado</th>
                          <th className="px-3 py-3">Ciclo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {automationWorkflows.map((row) => (
                          <tr key={row.flow} className="border-t border-white/5 text-slate-300">
                            <td className="px-3 py-3">{row.flow}</td>
                            <td className="px-3 py-3">{row.owner}</td>
                            <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs ${getStatusTone(row.status)}`}>{row.status}</span></td>
                            <td className="px-3 py-3">{row.cycle}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              </section>
            </main>

            <aside className="space-y-4">
              <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                <div className="mb-3 flex items-center gap-2 text-white">
                  <Cable className="h-4 w-4 text-cyan-300" />
                  <p className="text-sm font-semibold">Integraciones y alertas</p>
                </div>
                <div className="space-y-3">
                  {[
                    { title: "ERP industrial", detail: "Sincronizacion estable cada 58 segundos.", tone: "ok" },
                    { title: "SCADA / PLC", detail: "Handshake continuo sobre nodo norte y control de calidad.", tone: "ok" },
                    { title: "Compras", detail: "2 aprobaciones bloqueando throughput esperado.", tone: "warn" },
                    { title: "Mantenimiento", detail: "Una orden critica fuera del SLA objetivo.", tone: "risk" },
                  ].map((item) => (
                    <article key={item.title} className="rounded-xl border border-white/5 bg-black/10 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <strong className="text-sm text-white">{item.title}</strong>
                        <span className={item.tone === "ok" ? "text-xs font-semibold text-emerald-300" : item.tone === "warn" ? "text-xs font-semibold text-amber-300" : "text-xs font-semibold text-rose-300"}>
                          {item.tone === "ok" ? "OK" : item.tone === "warn" ? "ATENCION" : "RIESGO"}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-6 text-slate-400">{item.detail}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="space-y-3 rounded-2xl border border-white/5 bg-[linear-gradient(180deg,rgba(32,192,199,0.10),rgba(255,255,255,0.02))] p-4">
                <div className="flex items-center gap-2 text-white">
                  <ShieldCheck className="h-4 w-4 text-cyan-200" />
                  <p className="text-sm font-semibold">Resumen de automatizacion</p>
                </div>
                <p className="text-sm leading-7 text-slate-200/90">
                  Sub-dashboard dedicado a automatizacion industrial con foco en flujo real, nodos conectados,
                  lanes productivos, workflows, ERP y continuidad operativa.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/5 bg-black/10 p-3">
                    <div className="inline-flex items-center gap-2 text-sm text-white">
                      <Cpu className="h-4 w-4 text-cyan-200" />
                      Motor critico
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-black/10 p-3">
                    <div className="inline-flex items-center gap-2 text-sm text-white">
                      <Factory className="h-4 w-4 text-cyan-200" />
                      Planta conectada
                    </div>
                  </div>
                </div>
              </section>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
