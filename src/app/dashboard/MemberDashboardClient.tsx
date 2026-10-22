"use client";

/**
 * Panel del miembro (usuario ya registrado en el sistema).
 *
 * Conserva el diseno original del panel (sidebar, cabecera negra, navegacion
 * inferior en movil y modal de acceso administrador) y programa el inicio y las
 * secciones con DATOS REALES del expediente:
 *   Inicio     -> resumen del plan, avance, proximas cuotas y novedades recientes
 *   Pagos      -> cuotas, pagos de cuotas y abonos registrados
 *   Modelos    -> la moto que tiene asignada (con ficha del modelo)
 *   Contratos  -> contratos firmados y documentos del expediente
 *   Novedades  -> feed de la empresa (noticias y videos)
 *   Seguridad  -> datos de la cuenta, ubicacion y acceso administrativo
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  Clock,
  FileText,
  Home,
  Landmark,
  LogOut,
  MapPin,
  Newspaper,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Truck,
  Wallet,
} from "lucide-react";

const API_BASE =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? ""
    : process.env.NEXT_PUBLIC_API_BASE || "";

type MemberUser = {
  userId?: string;
  email: string;
  nombre: string;
  isMember: boolean;
};

type SessionStatusApi = {
  ok?: boolean;
  authenticated?: boolean;
  role?: "guest" | "member" | "account";
  adminValidated?: boolean;
  adminTotalAccess?: boolean;
};

type PanelCuota = {
  id: string;
  numero: number;
  vence: string;
  monto: number;
  abonado: number;
  recargo: number;
  estado: "Pagada" | "Vencida" | "Por vencer" | "Pendiente";
};

type PanelPago = {
  id: string;
  monto: number;
  fecha: string;
  banco: string;
  metodo: string;
  referencia: string;
  nota: string;
};

type PanelDocumento = {
  id: string;
  nombre: string;
  tipo: string;
  fecha: string;
  archivo: string;
};

type PanelPost = {
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

type PanelResponse = {
  ok: boolean;
  found: boolean;
  message?: string;
  member?: {
    cedula: string;
    nombre: string;
    email: string;
    telefono: string;
    direccion: string;
    ocupacion: string;
    empresa: string;
    username: string;
    miembroDesde: string;
  };
  plan?: {
    nombre: string;
    cuotaMensual: number;
    totalCuotas: number;
    intervaloDias: number;
    inicio: string;
    tipoContrato: string;
    metodoPago: string;
    bancoPago: string;
    referenciaPago: string;
  };
  moto?: { slug: string; marca: string; modelo: string; imagen: string; precio: number };
  ubicacion?: { lat: number | null; lng: number | null; link: string };
  resumen?: {
    totalCuotas: number;
    cuotasPagadas: number;
    cuotasPendientes: number;
    cuotasVencidas: number;
    cuotasPorVencer: number;
    totalPlan: number;
    montoPagado: number;
    saldo: number;
    avance: number;
    cuotaMensual: number;
    proximaCuota: { numero: number; vence: string; monto: number; recargo: number } | null;
  };
  cuotas?: PanelCuota[];
  pagos?: { cuotas: (PanelPago & { cuota: number })[]; abonos: PanelPago[] };
  documentos?: PanelDocumento[];
  contratos?: { id: string; nombre: string; fecha: string; archivo: string }[];
};

/** Videos institucionales que se muestran en el feed del miembro. */
const VIDEOS_EMPRESA = [
  { id: "institucional", titulo: "Conoce San Mérida", src: "/sistemasan.mp4" },
  { id: "proceso", titulo: "Cómo trabajamos", src: "/MTT.mp4" },
  { id: "entregas", titulo: "Entregas y servicio", src: "/IMG_2409.mp4" },
  { id: "catalogo-1", titulo: "Modelos en acción", src: "/videocarru2nuevo.mp4" },
  { id: "catalogo-2", titulo: "Nuestras unidades", src: "/videocarru3.mp4" },
  { id: "catalogo-3", titulo: "Equipo y clientes", src: "/videocarru4nuevo.mp4" },
  { id: "catalogo-4", titulo: "Cobertura de servicio", src: "/videocarru5.mp4" },
];

function formatMoney(value: number) {
  return `$${Number(value ?? 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function estadoCuotaClass(estado: PanelCuota["estado"]) {
  if (estado === "Pagada") return "bg-emerald-100 text-emerald-700";
  if (estado === "Vencida") return "bg-rose-100 text-rose-700";
  if (estado === "Por vencer") return "bg-amber-100 text-amber-700";

  return "bg-zinc-200 text-zinc-700";
}


const modules = [
  { id: "inicio", label: "Inicio", icon: Home },
  { id: "pagos", label: "Pagos", icon: Landmark },
  { id: "modelos", label: "Modelos de moto", icon: Truck },
  { id: "documentos", label: "Contratos", icon: FileText },
  { id: "novedades", label: "Novedades", icon: Newspaper },
  { id: "seguridad", label: "Seguridad", icon: ShieldCheck },
] as const;

type ModuleId = (typeof modules)[number]["id"];

export default function MemberDashboardClient({ user }: { user: MemberUser }) {
  const [activeTab, setActiveTab] = useState<ModuleId>("inicio");
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminLicense, setAdminLicense] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminMessage, setAdminMessage] = useState("");
  const [sessionStatus, setSessionStatus] = useState<SessionStatusApi | null>(null);

  // Datos reales del expediente y del feed de la empresa.
  const [panel, setPanel] = useState<PanelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [posts, setPosts] = useState<PanelPost[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [openPost, setOpenPost] = useState<PanelPost | null>(null);
  const [openVideo, setOpenVideo] = useState<{ titulo: string; src: string } | null>(null);

  const cargarPanel = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/api/member-panel`, { cache: "no-store" });
      const data = (await response.json()) as PanelResponse;

      if (!response.ok || !data.ok) {
        setError(data.message || "No se pudo cargar tu panel. Reintenta en unos segundos.");
        return;
      }

      setPanel(data);
    } catch {
      setError("No se pudo conectar con el servidor. Reintenta en unos segundos.");
    } finally {
      setLoading(false);
    }
  }, []);

  const cargarFeed = useCallback(async () => {
    setFeedLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/noticias`, { cache: "no-store" });
      const data = (await response.json()) as { ok?: boolean; posts?: PanelPost[] };

      if (!response.ok || !data.ok) return;

      setPosts(data.posts ?? []);
    } catch {
      // El feed es informativo: si falla, el resto del panel sigue funcionando.
    } finally {
      setFeedLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargarPanel();
    void cargarFeed();
  }, [cargarPanel, cargarFeed]);

  async function handleAdminLogin() {
    setAdminLoading(true);
    setAdminMessage("");

    try {
      const response = await fetch(`${API_BASE}/api/auth/admin-license`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: adminUsername,
          license: adminLicense,
        }),
      });

      const result = (await response.json()) as { ok?: boolean; message?: string };

      if (!response.ok || !result.ok) {
        setAdminMessage(result.message ?? "No se pudo validar el acceso de administrador.");
        return;
      }

      setAdminMessage("Acceso aprobado. Redirigiendo al panel admin...");
      setIsAdminModalOpen(false);
      window.location.href = "/admin";
    } catch {
      setAdminMessage("Error de conexión. Intenta nuevamente.");
    } finally {
      setAdminLoading(false);
    }
  }

  async function openAdminModal() {
    setAdminMessage("");
    setSessionStatus(null);
    setIsAdminModalOpen(true);

    try {
      const response = await fetch(`${API_BASE}/api/auth/session-status`, { cache: "no-store" });
      const data = (await response.json()) as SessionStatusApi;

      if (!response.ok || !data.ok) return;
      setSessionStatus(data);
    } catch {
      setSessionStatus(null);
    }
  }


  const cuotas = panel?.cuotas ?? [];
  const pagosCuotas = panel?.pagos?.cuotas ?? [];
  const abonos = panel?.pagos?.abonos ?? [];
  const documentos = panel?.documentos ?? [];
  const contratos = panel?.contratos ?? [];
  const resumen = panel?.resumen;

  const proximasCuotas = useMemo(
    () => cuotas.filter((cuota) => cuota.estado !== "Pagada").slice(0, 6),
    [cuotas],
  );
  const novedadesRecientes = useMemo(() => posts.slice(0, 2), [posts]);
  const totalPagado = useMemo(
    () =>
      pagosCuotas.reduce((acc, pago) => acc + pago.monto, 0) +
      abonos.reduce((acc, abono) => acc + abono.monto, 0),
    [pagosCuotas, abonos],
  );

  return (
    <div className="min-h-screen bg-[#f3f4f6] text-zinc-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 bg-[#eef0f3] lg:block">
          <div className="flex h-[68px] items-center border-b border-white/10 bg-black px-5">
            <div className="flex items-center gap-3">
              <Image src="/Logo.png" alt="Logo SAN" width={34} height={34} className="h-auto w-auto" />
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-400">SAN</p>
                <p className="text-sm font-semibold leading-none text-white">TEAM SAN PANEL</p>
              </div>
            </div>
          </div>

          <div className="p-5">
            <nav className="space-y-1">
              {modules.map((module) => {
                const Icon = module.icon;
                const isActive = activeTab === module.id;

                return (
                  <button
                    key={module.id}
                    onClick={() => setActiveTab(module.id)}
                    aria-pressed={isActive}
                    className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
                      isActive
                        ? "bg-white text-zinc-950 shadow-sm"
                        : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {module.label}
                  </button>
                );
              })}
            </nav>

            <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Canales de pago</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-zinc-600">
                <span className="rounded-full border border-zinc-200 px-3 py-1">Pago móvil</span>
                <span className="rounded-full border border-zinc-200 px-3 py-1">Transferencia</span>
                <span className="rounded-full border border-zinc-200 px-3 py-1">Zelle</span>
              </div>

              <button
                onClick={() => void openAdminModal()}
                className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
              >
                Admin
              </button>
            </div>
          </div>
        </aside>

        <main className="flex flex-1 flex-col">
          <header className="flex h-[68px] items-center bg-black px-4 text-white lg:px-7">
            <div className="flex w-full items-center justify-between gap-3">
              <div className="relative w-full max-w-2xl">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  className="h-11 w-full rounded-xl border border-white/10 bg-zinc-900 pl-10 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
                  placeholder="Buscar pagos, documentos o cuotas"
                />
              </div>

              <div className="flex items-center gap-2">
                <button className="grid h-10 w-10 place-content-center rounded-full bg-zinc-900 text-zinc-200">
                  <CircleHelp className="h-4 w-4" />
                </button>
                <button className="grid h-10 w-10 place-content-center rounded-full bg-zinc-900 text-zinc-200">
                  <Bell className="h-4 w-4" />
                </button>
                <div className="hidden rounded-full bg-white px-3 py-1 text-sm font-semibold text-zinc-900 md:flex md:items-center md:gap-2">
                  <span className="grid h-6 w-6 place-content-center rounded-full bg-emerald-500 text-xs font-bold text-white">
                    {user.nombre?.slice(0, 1).toUpperCase() || "U"}
                  </span>
                  Mi cuenta
                </div>
              </div>
            </div>
          </header>


          <div className="flex-1 p-4 lg:p-7">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-indigo-50 px-5 py-4 text-zinc-900">
              <p className="text-sm font-semibold lg:text-base">
                {loading
                  ? "Cargando tu plan…"
                  : resumen?.proximaCuota
                    ? `${panel?.plan?.nombre ?? "Plan"} activo · Próxima cuota el ${resumen.proximaCuota.vence} por ${formatMoney(resumen.proximaCuota.monto)}`
                    : "¡Plan completado! No tienes cuotas pendientes."}
              </p>
              <button
                onClick={() => setActiveTab("pagos")}
                className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-900 lg:text-sm"
              >
                Ver mis cuotas
              </button>
            </div>

            <section className="rounded-2xl border border-zinc-200 bg-white p-5 lg:p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold text-zinc-900">Panel de miembro SAN</h1>
                  <p className="mt-1 text-sm text-zinc-500">
                    {panel?.member?.nombre || user.nombre} · Cédula {panel?.member?.cedula ?? "—"} ·{" "}
                    {panel?.plan?.nombre ?? "Sin plan"}
                  </p>
                </div>
                <form action="/api/auth/logout" method="POST">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Cerrar sesión
                  </button>
                </form>
              </div>

              {loading ? (
                <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-600">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Cargando tu expediente…
                </div>
              ) : error ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                    <AlertTriangle className="h-4 w-4" />
                    No se pudo cargar tu panel
                  </p>
                  <p className="mt-2 text-sm text-amber-700">{error}</p>
                  <p className="mt-2 text-xs text-amber-700">
                    Tus datos siguen guardados: nada se elimina automáticamente.
                  </p>
                  <button
                    onClick={() => void cargarPanel()}
                    className="mt-3 rounded-lg bg-amber-400 px-3 py-2 text-xs font-semibold text-black transition hover:bg-amber-300"
                  >
                    Reintentar
                  </button>
                </div>
              ) : !panel?.found ? (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-600">
                  {panel?.message ||
                    "Todavía no hay un expediente asociado a tu usuario. Cuando el equipo de San Mérida lo registre, aquí verás tu plan, tus cuotas y tus documentos."}
                </div>
              ) : (
                <>


                  {activeTab === "inicio" && (
                    <div className="space-y-5">
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                          <p className="text-sm text-zinc-500">Total pagado</p>
                          <p className="mt-1 text-2xl font-semibold text-emerald-600">{formatMoney(totalPagado)}</p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {resumen?.cuotasPagadas ?? 0} de {resumen?.totalCuotas ?? 0} cuotas
                          </p>
                        </article>
                        <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                          <p className="text-sm text-zinc-500">Cuotas pendientes</p>
                          <p className="mt-1 text-2xl font-semibold text-rose-600">{resumen?.cuotasPendientes ?? 0}</p>
                          <p className="mt-1 text-xs text-zinc-500">saldo: {formatMoney(resumen?.saldo ?? 0)}</p>
                        </article>
                        <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                          <p className="text-sm text-zinc-500">Contratos</p>
                          <p className="mt-1 text-2xl font-semibold text-zinc-900">{contratos.length}</p>
                          <p className="mt-1 text-xs text-zinc-500">firmados y digitalizados</p>
                        </article>
                        <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                          <p className="text-sm text-zinc-500">Tu unidad</p>
                          <p className="mt-1 text-xl font-semibold text-zinc-900">
                            {panel?.moto?.marca} {panel?.moto?.modelo}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">{panel?.plan?.nombre ?? "Sin plan"}</p>
                        </article>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                        <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-zinc-900">Avance de tu plan</p>
                              <p className="text-xs text-zinc-500">
                                {resumen?.cuotasPagadas ?? 0} de {resumen?.totalCuotas ?? 0} cuotas pagadas
                              </p>
                            </div>
                            <span className="text-2xl font-semibold text-emerald-600">{resumen?.avance ?? 0}%</span>
                          </div>
                          <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-zinc-200">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${resumen?.avance ?? 0}%` }}
                            />
                          </div>
                          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                            <div>
                              <p className="text-xs text-zinc-500">Total del plan</p>
                              <p className="font-semibold">{formatMoney(resumen?.totalPlan ?? 0)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-zinc-500">Pagado</p>
                              <p className="font-semibold text-emerald-600">{formatMoney(totalPagado)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-zinc-500">Saldo</p>
                              <p className="font-semibold text-rose-600">{formatMoney(resumen?.saldo ?? 0)}</p>
                            </div>
                          </div>
                        </article>

                        <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Próxima cuota</p>
                          {resumen?.proximaCuota ? (
                            <>
                              <p className="mt-2 text-3xl font-semibold text-zinc-900">
                                {formatMoney(resumen.proximaCuota.monto)}
                              </p>
                              <p className="mt-1 flex items-center gap-2 text-sm text-zinc-600">
                                <CalendarDays className="h-4 w-4" />
                                Cuota {resumen.proximaCuota.numero} · vence {resumen.proximaCuota.vence}
                              </p>
                              {resumen.proximaCuota.recargo > 0 ? (
                                <p className="mt-2 rounded-lg bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
                                  Incluye recargo por mora de {formatMoney(resumen.proximaCuota.recargo)}
                                </p>
                              ) : null}
                            </>
                          ) : (
                            <p className="mt-3 flex items-center gap-2 text-sm text-emerald-600">
                              <CheckCircle2 className="h-4 w-4" />
                              ¡Plan completado!
                            </p>
                          )}
                        </article>
                      </div>


                      <div className="grid gap-4 lg:grid-cols-2">
                        <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                          <p className="text-sm font-semibold text-zinc-900">Tus próximas cuotas</p>
                          {proximasCuotas.length === 0 ? (
                            <p className="mt-2 text-sm text-emerald-600">No tienes cuotas pendientes.</p>
                          ) : (
                            <ul className="mt-3 space-y-2 text-sm">
                              {proximasCuotas.map((cuota) => (
                                <li
                                  key={cuota.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2"
                                >
                                  <span className="flex items-center gap-2 text-zinc-700">
                                    <Clock className="h-4 w-4 text-zinc-400" />
                                    Cuota {cuota.numero} · {cuota.vence}
                                  </span>
                                  <span className="flex items-center gap-2">
                                    <span className="font-semibold">{formatMoney(cuota.monto)}</span>
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${estadoCuotaClass(cuota.estado)}`}
                                    >
                                      {cuota.estado}
                                    </span>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </article>

                        <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-zinc-900">Novedades de San Mérida</p>
                            <button
                              onClick={() => setActiveTab("novedades")}
                              className="text-xs font-semibold text-sky-700 hover:underline"
                            >
                              Ver todas
                            </button>
                          </div>
                          {feedLoading ? (
                            <p className="mt-2 text-sm text-zinc-500">Cargando novedades…</p>
                          ) : novedadesRecientes.length === 0 ? (
                            <p className="mt-2 text-sm text-zinc-500">Todavía no hay novedades publicadas.</p>
                          ) : (
                            <ul className="mt-3 space-y-2">
                              {novedadesRecientes.map((post) => (
                                <li key={post.id}>
                                  <button
                                    onClick={() => setOpenPost(post)}
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left transition hover:border-zinc-300"
                                  >
                                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
                                      {post.categoria}
                                    </span>
                                    <p className="text-sm font-semibold text-zinc-900">{post.titulo}</p>
                                    <p className="text-xs text-zinc-500">{post.fecha}</p>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </article>
                      </div>
                    </div>
                  )}


                  {activeTab === "pagos" && (
                    <div className="space-y-5">
                      <div className="grid gap-4 md:grid-cols-3">
                        <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                          <p className="text-sm text-zinc-500">Total pagado</p>
                          <p className="mt-1 text-3xl font-semibold text-emerald-600">{formatMoney(totalPagado)}</p>
                        </article>
                        <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                          <p className="text-sm text-zinc-500">Deuda restante</p>
                          <p className="mt-1 text-3xl font-semibold text-rose-600">{formatMoney(resumen?.saldo ?? 0)}</p>
                        </article>
                        <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                          <p className="text-sm text-zinc-500">Próxima cuota</p>
                          <p className="mt-1 text-3xl font-semibold text-zinc-900">
                            {resumen?.proximaCuota?.vence ?? "—"}
                          </p>
                        </article>
                      </div>

                      <article className="rounded-2xl border border-zinc-200">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-5 py-3">
                          <div>
                            <p className="text-sm font-semibold text-zinc-900">Calendario de cuotas</p>
                            <p className="text-xs text-zinc-500">
                              {panel?.plan?.intervaloDias === 7 ? "Una cuota por semana" : "Una cuota cada 15 días"} ·{" "}
                              {resumen?.totalCuotas ?? 0} cuotas
                            </p>
                          </div>
                          <span className="text-xs font-semibold text-zinc-500">{resumen?.avance ?? 0}% pagado</span>
                        </div>
                        <div className="max-h-[380px] overflow-auto">
                          <table className="w-full min-w-[520px] text-sm">
                            <thead className="sticky top-0 bg-zinc-100 text-xs uppercase tracking-[0.1em] text-zinc-500">
                              <tr>
                                <th className="px-4 py-2 text-left">Cuota</th>
                                <th className="px-4 py-2 text-left">Vence</th>
                                <th className="px-4 py-2 text-right">Monto</th>
                                <th className="px-4 py-2 text-right">Recargo</th>
                                <th className="px-4 py-2 text-left">Estado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cuotas.map((cuota) => (
                                <tr key={cuota.id} className="border-t border-zinc-100">
                                  <td className="px-4 py-2 font-medium text-zinc-800">#{cuota.numero}</td>
                                  <td className="px-4 py-2 text-zinc-600">{cuota.vence}</td>
                                  <td className="px-4 py-2 text-right">{formatMoney(cuota.monto)}</td>
                                  <td className="px-4 py-2 text-right text-rose-600">
                                    {cuota.recargo > 0 ? formatMoney(cuota.recargo) : "—"}
                                  </td>
                                  <td className="px-4 py-2">
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${estadoCuotaClass(cuota.estado)}`}
                                    >
                                      {cuota.estado}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </article>


                      <div className="grid gap-4 lg:grid-cols-2">
                        <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                          <p className="text-sm font-semibold text-zinc-900">Pagos de cuotas</p>
                          <p className="text-xs text-zinc-500">
                            Total: {formatMoney(pagosCuotas.reduce((acc, pago) => acc + pago.monto, 0))}
                          </p>
                          {pagosCuotas.length === 0 ? (
                            <p className="mt-3 text-sm text-zinc-500">Sin pagos de cuotas registrados.</p>
                          ) : (
                            <ul className="mt-3 space-y-2 text-sm">
                              {pagosCuotas.map((pago) => (
                                <li key={pago.id} className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="font-semibold text-zinc-800">Cuota #{pago.cuota}</span>
                                    <span className="font-semibold text-emerald-600">{formatMoney(pago.monto)}</span>
                                  </div>
                                  <p className="text-xs text-zinc-500">
                                    {pago.fecha} · {pago.banco || "—"} · {pago.metodo || "—"}
                                  </p>
                                  {pago.referencia ? (
                                    <p className="text-xs text-zinc-400">Ref: {pago.referencia}</p>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          )}
                        </article>

                        <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                          <p className="text-sm font-semibold text-zinc-900">Abonos a tu favor</p>
                          <p className="text-xs text-zinc-500">
                            Total: {formatMoney(abonos.reduce((acc, abono) => acc + abono.monto, 0))}
                          </p>
                          {abonos.length === 0 ? (
                            <p className="mt-3 text-sm text-zinc-500">Sin abonos registrados.</p>
                          ) : (
                            <ul className="mt-3 space-y-2 text-sm">
                              {abonos.map((abono) => (
                                <li key={abono.id} className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="font-semibold text-zinc-800">Abono</span>
                                    <span className="font-semibold text-emerald-600">{formatMoney(abono.monto)}</span>
                                  </div>
                                  <p className="text-xs text-zinc-500">
                                    {abono.fecha} · {abono.banco || "—"} · {abono.metodo || "—"}
                                  </p>
                                  {abono.referencia ? (
                                    <p className="text-xs text-zinc-400">Ref: {abono.referencia}</p>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          )}
                        </article>
                      </div>
                    </div>
                  )}


                  {activeTab === "modelos" && (
                    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-100 p-4">
                        {panel?.moto?.imagen ? (
                          <Image
                            src={panel.moto.imagen}
                            alt={`${panel.moto.marca} ${panel.moto.modelo}`}
                            width={400}
                            height={300}
                            unoptimized
                            className="h-48 w-full rounded-xl border border-zinc-200 bg-white object-contain"
                          />
                        ) : (
                          <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50">
                            <p className="text-sm text-zinc-500">Sin imagen del modelo</p>
                          </div>
                        )}
                      </div>
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                        <h2 className="text-xl font-semibold text-zinc-900">
                          {panel?.moto?.marca} {panel?.moto?.modelo}
                        </h2>
                        <p className="mt-2 text-sm text-zinc-600">
                          Unidad asignada a tu contrato de financiamiento.
                        </p>
                        <div className="mt-4 grid gap-3 text-sm text-zinc-700 sm:grid-cols-2">
                          <p>
                            <span className="font-semibold">Marca:</span> {panel?.moto?.marca || "—"}
                          </p>
                          <p>
                            <span className="font-semibold">Modelo:</span> {panel?.moto?.modelo || "—"}
                          </p>
                          <p>
                            <span className="font-semibold">Precio:</span> {formatMoney(panel?.moto?.precio ?? 0)}
                          </p>
                          <p>
                            <span className="font-semibold">Plan:</span> {panel?.plan?.nombre ?? "—"}
                          </p>
                          <p>
                            <span className="font-semibold">Cuota:</span> {formatMoney(panel?.plan?.cuotaMensual ?? 0)}
                          </p>
                          <p>
                            <span className="font-semibold">Inicio:</span> {panel?.plan?.inicio ?? "—"}
                          </p>
                        </div>
                        {panel?.moto?.slug ? (
                          <a
                            href={`/modelos/${panel.moto.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-4 inline-flex rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                          >
                            Ver ficha del modelo ↗
                          </a>
                        ) : null}
                      </div>
                    </div>
                  )}


                  {activeTab === "documentos" && (
                    <div className="space-y-4">
                      <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                        <p className="text-sm font-semibold text-zinc-900">Contratos firmados</p>
                        {contratos.length === 0 ? (
                          <p className="mt-2 text-sm text-zinc-500">Sin contratos cargados en tu expediente.</p>
                        ) : (
                          <ul className="mt-3 space-y-2">
                            {contratos.map((contrato) => (
                              <li
                                key={contrato.id}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3"
                              >
                                <div>
                                  <p className="font-semibold text-zinc-900">{contrato.nombre}</p>
                                  <p className="text-sm text-zinc-500">Fecha: {contrato.fecha}</p>
                                </div>
                                <a
                                  href={contrato.archivo}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                                >
                                  Ver contrato ↗
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                      </article>

                      <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                        <p className="text-sm font-semibold text-zinc-900">Documentos del expediente</p>
                        {documentos.length === 0 ? (
                          <p className="mt-2 text-sm text-zinc-500">Sin documentos cargados.</p>
                        ) : (
                          <ul className="mt-3 space-y-2">
                            {documentos.map((doc) => (
                              <li
                                key={doc.id}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3"
                              >
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
                                    {doc.tipo}
                                  </p>
                                  <p className="font-semibold text-zinc-900">{doc.nombre}</p>
                                  <p className="text-sm text-zinc-500">Fecha: {doc.fecha}</p>
                                </div>
                                <a
                                  href={doc.archivo}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                                >
                                  Descargar
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                      </article>
                    </div>
                  )}

                  {activeTab === "novedades" && (
                    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                      <div className="space-y-3">
                        {feedLoading ? (
                          <p className="text-sm text-zinc-500">Cargando novedades…</p>
                        ) : posts.length === 0 ? (
                          <p className="text-sm text-zinc-500">
                            Todavía no hay novedades publicadas. Aquí verás las noticias, promociones y videos
                            de San Mérida.
                          </p>
                        ) : (
                          posts.map((post) => (
                            <article
                              key={post.id}
                              className="overflow-hidden rounded-2xl border border-zinc-200 bg-white"
                            >
                              {post.imagenUrl ? (
                                <Image
                                  src={post.imagenUrl}
                                  alt={post.titulo}
                                  width={900}
                                  height={400}
                                  unoptimized
                                  className="h-40 w-full object-cover"
                                />
                              ) : null}
                              <div className="p-4">
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
                                    {post.categoria}
                                  </span>
                                  {post.destacado ? (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
                                      Destacado
                                    </span>
                                  ) : null}
                                  <span className="text-zinc-500">
                                    {post.fecha}
                                    {post.autor ? ` · ${post.autor}` : ""}
                                  </span>
                                </div>
                                <h3 className="mt-2 text-lg font-semibold text-zinc-900">{post.titulo}</h3>
                                {post.resumen ? <p className="mt-1 text-sm text-zinc-600">{post.resumen}</p> : null}
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {post.contenido ? (
                                    <button
                                      onClick={() => setOpenPost(post)}
                                      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                                    >
                                      Leer completo
                                    </button>
                                  ) : null}
                                  {post.videoUrl ? (
                                    <button
                                      onClick={() => setOpenVideo({ titulo: post.titulo, src: post.videoUrl })}
                                      className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800"
                                    >
                                      Ver video
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </article>
                          ))
                        )}
                      </div>

                      <aside className="space-y-3">
                        <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                          <p className="text-sm font-semibold text-zinc-900">Videos de la empresa</p>
                          <ul className="mt-3 space-y-2 text-sm">
                            {VIDEOS_EMPRESA.map((video) => (
                              <li key={video.id}>
                                <button
                                  onClick={() => setOpenVideo(video)}
                                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left transition hover:border-zinc-300"
                                >
                                  <span className="flex items-center gap-2 text-zinc-700">
                                    <PlayCircle className="h-4 w-4 text-sky-600" />
                                    {video.titulo}
                                  </span>
                                  <span className="text-xs text-zinc-400">Ver</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </article>
                      </aside>
                    </div>
                  )}

                  {activeTab === "seguridad" && (
                    <div className="grid gap-4 md:grid-cols-2">
                      <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                        <h3 className="font-semibold text-zinc-900">Mis datos</h3>
                        <div className="mt-3 space-y-2 text-sm text-zinc-700">
                          <p>
                            <span className="font-semibold">Nombre:</span> {panel?.member?.nombre || "—"}
                          </p>
                          <p>
                            <span className="font-semibold">Cédula:</span> {panel?.member?.cedula || "—"}
                          </p>
                          <p>
                            <span className="font-semibold">Correo:</span> {panel?.member?.email || "—"}
                          </p>
                          <p>
                            <span className="font-semibold">Teléfono:</span> {panel?.member?.telefono || "—"}
                          </p>
                          <p>
                            <span className="font-semibold">Usuario:</span> {panel?.member?.username || "—"}
                          </p>
                          <p>
                            <span className="font-semibold">Miembro desde:</span>{" "}
                            {panel?.member?.miembroDesde || "—"}
                          </p>
                        </div>
                      </article>

                      <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                        <h3 className="font-semibold text-zinc-900">Estado de cuenta</h3>
                        <ul className="mt-3 space-y-2 text-sm text-zinc-600">
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            Cuenta activa y al día en el sistema
                          </li>
                          <li className="flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-emerald-600" />
                            Documentos protegidos: solo tú y el equipo pueden verlos
                          </li>
                          <li className="flex items-center gap-2">
                            <Wallet className="h-4 w-4 text-emerald-600" />
                            Saldo pendiente calculado: {formatMoney(resumen?.saldo ?? 0)}
                          </li>
                        </ul>

                        {panel?.ubicacion?.link ? (
                          <a
                            href={panel.ubicacion.link}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-sky-700 hover:underline"
                          >
                            <MapPin className="h-4 w-4" />
                            Ver mi ubicación registrada ↗
                          </a>
                        ) : null}

                        <button
                          onClick={() => void openAdminModal()}
                          className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                        >
                          Acceso administrador
                        </button>
                      </article>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-20 grid grid-cols-6 gap-1 border-t border-zinc-200 bg-white p-2 lg:hidden">
        {modules.map((module) => {
          const Icon = module.icon;
          const isActive = activeTab === module.id;

          return (
            <button
              key={module.id}
              onClick={() => setActiveTab(module.id)}
              className={`flex flex-col items-center gap-1 rounded-lg p-2 text-[11px] ${
                isActive ? "bg-zinc-200 text-zinc-900" : "text-zinc-600"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{module.label.split(" ")[0]}</span>
            </button>
          );
        })}
      </nav>

      {openPost ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <article className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  {openPost.categoria}
                </span>
                <h3 className="mt-3 text-xl font-semibold text-zinc-900">{openPost.titulo}</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  {openPost.fecha}
                  {openPost.autor ? ` · ${openPost.autor}` : ""}
                </p>
              </div>
              <button
                onClick={() => setOpenPost(null)}
                className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-100"
              >
                ✕
              </button>
            </div>

            {openPost.imagenUrl ? (
              <Image
                src={openPost.imagenUrl}
                alt={openPost.titulo}
                width={900}
                height={420}
                unoptimized
                className="mt-4 h-56 w-full rounded-xl object-cover"
              />
            ) : null}

            {openPost.resumen ? (
              <p className="mt-4 text-sm font-medium text-zinc-700">{openPost.resumen}</p>
            ) : null}
            {openPost.contenido ? (
              <p className="mt-3 whitespace-pre-line text-sm leading-7 text-zinc-600">{openPost.contenido}</p>
            ) : null}

            {openPost.videoUrl ? (
              <button
                onClick={() => {
                  setOpenVideo({ titulo: openPost.titulo, src: openPost.videoUrl });
                  setOpenPost(null);
                }}
                className="mt-4 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
              >
                Ver video de esta novedad
              </button>
            ) : null}
          </article>
        </div>
      ) : null}

      {openVideo ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-zinc-800 bg-black p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-white">{openVideo.titulo}</p>
              <button
                onClick={() => setOpenVideo(null)}
                className="rounded-md px-2 py-1 text-zinc-300 hover:bg-white/10"
              >
                ✕
              </button>
            </div>
            <video
              key={openVideo.src}
              src={openVideo.src}
              controls
              autoPlay
              playsInline
              className="mt-3 max-h-[65vh] w-full rounded-xl bg-black"
            />
          </div>
        </div>
      ) : null}

      {isAdminModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-zinc-900">Acceso Administrador</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  Ingrese su usuario de administrador y su licencia.
                </p>
              </div>
              <button
                onClick={() => setIsAdminModalOpen(false)}
                className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-100"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
                  Usuario
                </label>
                <input
                  value={adminUsername}
                  onChange={(event) => setAdminUsername(event.target.value)}
                  autoComplete="username"
                  className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
                  Licencia
                </label>
                <input
                  type="password"
                  value={adminLicense}
                  onChange={(event) => setAdminLicense(event.target.value)}
                  autoComplete="current-password"
                  className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
                />
              </div>

              {sessionStatus?.adminTotalAccess ? (
                <p className="text-xs text-emerald-700">Tu sesión ya tiene acceso administrativo.</p>
              ) : null}

              {adminMessage ? <p className="text-xs font-semibold text-rose-600">{adminMessage}</p> : null}

              <button
                onClick={() => void handleAdminLogin()}
                disabled={adminLoading}
                className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {adminLoading ? "Validando…" : "Validar acceso"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
