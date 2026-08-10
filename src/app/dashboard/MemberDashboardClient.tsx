"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  Bell,
  CircleHelp,
  FileText,
  Home,
  Landmark,
  LogOut,
  Search,
  ShieldCheck,
  Truck,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

type MonitorBlock = {
  id: string;
  value: number;
  percent: number;
  status: "ACTIVO" | "LÍMITE";
};

type SessionStatusApi = {
  ok?: boolean;
  authenticated?: boolean;
  role?: "guest" | "member" | "account";
  adminValidated?: boolean;
  adminTotalAccess?: boolean;
};

const paymentData = [
  { name: "Ene", pagado: 400, deuda: 240 },
  { name: "Feb", pagado: 300, deuda: 139 },
  { name: "Mar", pagado: 200, deuda: 980 },
  { name: "Abr", pagado: 278, deuda: 390 },
  { name: "May", pagado: 189, deuda: 480 },
  { name: "Jun", pagado: 239, deuda: 380 },
];

const modules = [
  { id: "inicio", label: "Inicio", icon: Home },
  { id: "pagos", label: "Pagos", icon: Landmark },
  { id: "modelos", label: "Modelos de moto", icon: Truck },
  { id: "documentos", label: "Contratos", icon: FileText },
  { id: "seguridad", label: "Seguridad", icon: ShieldCheck },
] as const;

const docs = [
  { id: 1, name: "Contrato de financiación", date: "10 Ene 2026", status: "Firmado" },
  { id: 2, name: "Documento de garantía", date: "14 Ene 2026", status: "Vigente" },
  { id: 3, name: "Póliza de seguro", date: "20 Ene 2026", status: "Activo" },
];

const briefingItems = [
  "TESORERÍA SAN confirma recepción de cuota nocturna y conciliación inmediata.",
  "Soporte financiero detecta caída en mora de 8.2% en la última semana.",
  "Contratos digitalizados de TEAM SAN suben a 96% de cobertura total.",
  "Flota logística reporta disponibilidad prioritaria para unidades 200cc.",
  "Operación Mérida mantiene ventana de entrega en menos de 72 horas.",
];

const initialMonitorBlocks: MonitorBlock[] = [
  { id: "CT-1", value: 4.77, percent: 50, status: "ACTIVO" },
  { id: "CT-2", value: 1.21, percent: 4, status: "ACTIVO" },
  { id: "CT-3", value: 3.62, percent: 44, status: "ACTIVO" },
  { id: "CT-4", value: 3.05, percent: 65, status: "ACTIVO" },
  { id: "CT-5", value: 5.65, percent: -91, status: "LÍMITE" },
  { id: "CT-6", value: 8.06, percent: -20, status: "LÍMITE" },
  { id: "CT-7", value: 6.25, percent: -98, status: "LÍMITE" },
  { id: "CT-8", value: 4.09, percent: -40, status: "LÍMITE" },
];

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
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

function formatZoneTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("es-VE", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export default function MemberDashboardClient({ user }: { user: MemberUser }) {
  const [activeTab, setActiveTab] = useState<(typeof modules)[number]["id"]>("inicio");
  const [now, setNow] = useState(new Date());
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminLicense, setAdminLicense] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminMessage, setAdminMessage] = useState("");
  const [sessionStatus, setSessionStatus] = useState<SessionStatusApi | null>(null);
  const [monitorBlocks, setMonitorBlocks] = useState<MonitorBlock[]>(initialMonitorBlocks);
  const [vixSeries, setVixSeries] = useState([20, 26, 16, 31, 28, 44, 35, 21, 29, 25, 33]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());

      setMonitorBlocks((prev) =>
        prev.map((item) => {
          const nextValue = clamp(item.value + (Math.random() * 0.3 - 0.15), 0.8, 9.99);
          const nextPercent = clamp(item.percent + (Math.random() * 4 - 2), -99, 99);

          return {
            ...item,
            value: Number(nextValue.toFixed(2)),
            percent: Number(nextPercent.toFixed(0)),
          };
        })
      );

      setVixSeries((prev) => [...prev.slice(1), clamp(prev[prev.length - 1] + (Math.random() * 14 - 7), 8, 48)]);
    }, 2200);

    return () => clearInterval(timer);
  }, []);

  const cityTimes = useMemo(
    () => [
      { city: "MÉRIDA", zone: "America/Caracas" },
      { city: "MIAMI", zone: "America/New_York" },
      { city: "MADRID", zone: "Europe/Madrid" },
      { city: "TOKYO", zone: "Asia/Tokyo" },
    ],
    []
  );

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
            <div className="mb-5 flex items-center justify-between rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-indigo-50 px-5 py-4 text-zinc-900">
              <p className="text-sm font-semibold lg:text-base">Plan corporativo activo · Próxima cuota el 15/03/2026</p>
              <button className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-900 lg:text-sm">
                Actualizar plan
              </button>
            </div>

            <section className="rounded-2xl border border-zinc-200 bg-white p-5 lg:p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold text-zinc-900">Panel empresarial SAN</h1>
                  <p className="mt-1 text-sm text-zinc-500">Gestión completa para {user.nombre} · {user.email}</p>
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

              {activeTab === "inicio" && (
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <p className="text-sm text-zinc-500">Saldo pagado</p>
                      <p className="mt-1 text-2xl font-semibold text-emerald-600">$1,596.00</p>
                      <p className="mt-1 text-xs text-zinc-500">últimos 6 meses</p>
                    </article>
                    <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <p className="text-sm text-zinc-500">Cuotas pendientes</p>
                      <p className="mt-1 text-2xl font-semibold text-rose-600">4</p>
                      <p className="mt-1 text-xs text-zinc-500">monto: $2,629.00</p>
                    </article>
                    <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <p className="text-sm text-zinc-500">Contratos activos</p>
                      <p className="mt-1 text-2xl font-semibold text-zinc-900">3</p>
                      <p className="mt-1 text-xs text-zinc-500">escaneados y firmados</p>
                    </article>
                    <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <p className="text-sm text-zinc-500">Unidad asignada</p>
                      <p className="mt-1 text-xl font-semibold text-zinc-900">SAN MTC-2024</p>
                      <p className="mt-1 text-xs text-zinc-500">entrega: 20 Ago 2026</p>
                    </article>
                  </div>

                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-zinc-900">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-1 pb-2">
                      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">Monitor de cuotas SAN</p>
                      <p className="text-xs text-zinc-500">Actualización en tiempo real · {formatZoneTime(now, "America/Caracas")}</p>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      {cityTimes.map((item) => (
                        <div key={item.city} className="rounded border border-zinc-200 bg-white px-3 py-2">
                          <p className="font-mono text-2xl font-semibold text-zinc-900">{formatZoneTime(now, item.zone)}</p>
                          <p className="text-xs uppercase tracking-[0.15em] text-sky-700">{item.city}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      {monitorBlocks.map((block) => {
                        const positive = block.status === "ACTIVO";
                        return (
                          <article
                            key={block.id}
                            className={`rounded border p-2 ${
                              positive
                                ? "border-emerald-200 bg-emerald-50"
                                : "border-rose-200 bg-rose-50"
                            }`}
                          >
                            <p className="text-sm font-bold text-zinc-800">{block.id}</p>
                            <p className="font-mono text-3xl font-semibold text-zinc-900">{block.value.toFixed(2)}</p>
                            <p className={`text-sm font-semibold ${block.percent >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                              {block.percent > 0 ? "+" : ""}
                              {block.percent}%
                            </p>
                            <p className={`text-xs font-semibold uppercase ${positive ? "text-emerald-700" : "text-rose-700"}`}>
                              {block.status}
                            </p>
                          </article>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                    <div className="mb-2 flex items-center justify-between border-b border-amber-200 pb-2">
                      <p className="text-sm font-semibold uppercase tracking-[0.14em]">Briefing operativo SAN</p>
                      <span className="animate-pulse text-xs font-semibold">● Grabando</span>
                    </div>

                    <div className="space-y-2 text-sm leading-relaxed">
                      {briefingItems.map((item, index) => (
                        <p key={item} className="border-b border-amber-200 pb-1 last:border-b-0 last:pb-0">
                          <span className="mr-2 font-semibold text-amber-700">
                            {formatZoneTime(new Date(now.getTime() - index * 5 * 60 * 1000), "America/Caracas")}
                          </span>
                          {item}
                        </p>
                      ))}
                    </div>

                    <div className="mt-3 overflow-hidden rounded border border-amber-200 bg-white py-1">
                      <div className="briefing-ticker whitespace-nowrap px-3 text-xs font-medium uppercase tracking-[0.12em] text-amber-700">
                        TEAM SAN · CUOTAS AL DÍA · CONTRATOS VIGENTES · COBRANZA POSITIVA · ESTADO OPERATIVO ESTABLE ·
                      </div>
                    </div>

                    <div className="mt-3 rounded border border-amber-200 bg-white p-2">
                      <p className="mb-1 text-xs font-semibold uppercase">Índice de volatilidad interna</p>
                      <svg viewBox="0 0 360 58" className="h-14 w-full">
                        <polyline fill="none" stroke="#f59e0b" strokeWidth="3" points={sparklinePath(vixSeries)} />
                      </svg>
                    </div>
                  </div>

                </div>
              )}

              {activeTab === "pagos" && (
                <div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <p className="text-sm text-zinc-500">Total pagado</p>
                      <p className="mt-1 text-3xl font-semibold text-emerald-600">$1,596.00</p>
                    </article>
                    <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <p className="text-sm text-zinc-500">Deuda restante</p>
                      <p className="mt-1 text-3xl font-semibold text-rose-600">$2,629.00</p>
                    </article>
                    <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <p className="text-sm text-zinc-500">Próxima cuota</p>
                      <p className="mt-1 text-3xl font-semibold text-zinc-900">15/03/2026</p>
                    </article>
                  </div>

                  <div className="mt-5 h-[340px] rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={paymentData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d4d4d8" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} stroke="#71717a" />
                        <YAxis axisLine={false} tickLine={false} stroke="#71717a" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#09090b",
                            borderRadius: "12px",
                            border: "1px solid #27272a",
                            color: "#fafafa",
                          }}
                        />
                        <Line type="monotone" dataKey="pagado" stroke="#059669" strokeWidth={3} dot={false} name="Pagado" />
                        <Line type="monotone" dataKey="deuda" stroke="#dc2626" strokeWidth={3} dot={false} name="Deuda" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {activeTab === "documentos" && (
                <div className="space-y-3">
                  {docs.map((doc) => (
                    <article
                      key={doc.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4"
                    >
                      <div>
                        <p className="font-semibold text-zinc-900">{doc.name}</p>
                        <p className="text-sm text-zinc-500">Fecha: {doc.date}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                          {doc.status}
                        </span>
                        <button className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-white">
                          Descargar
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {activeTab === "modelos" && (
                <div className="grid gap-4 md:grid-cols-[260px_1fr]">
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-100 p-4">
                    <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50">
                      <p className="text-sm text-zinc-500">Imagen del modelo</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                    <h2 className="text-xl font-semibold text-zinc-900">SAN MTC-2024 Edición Especial</h2>
                    <p className="mt-2 text-sm text-zinc-600">Unidad asignada a tu contrato de financiación.</p>
                    <div className="mt-4 grid gap-3 text-sm text-zinc-700 sm:grid-cols-2">
                      <p><span className="font-semibold">Chasis:</span> SAN-2024-X98237</p>
                      <p><span className="font-semibold">Color:</span> Negro metálico</p>
                      <p><span className="font-semibold">Motor:</span> 200cc</p>
                      <p><span className="font-semibold">Entrega:</span> 20 Ago 2026</p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "seguridad" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <h3 className="font-semibold text-zinc-900">Checklist de seguridad</h3>
                    <ul className="mt-3 space-y-2 text-sm text-zinc-600">
                      <li>• Verificación de correo completada</li>
                      <li>• Contratos digitalizados</li>
                      <li>• Pago principal validado</li>
                    </ul>
                  </article>
                  <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <h3 className="font-semibold text-zinc-900">Estado de cuenta</h3>
                    <p className="mt-3 text-sm text-zinc-600">
                      Tu cuenta está protegida y activa para solicitudes de soporte y ajustes de plan.
                    </p>
                    <button className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white">
                      Solicitar soporte
                    </button>
                  </article>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-20 grid grid-cols-5 gap-1 border-t border-zinc-200 bg-white p-2 lg:hidden">
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

      <style jsx>{`
        .briefing-ticker {
          display: inline-block;
          animation: briefing-scroll 18s linear infinite;
        }

        @keyframes briefing-scroll {
          0% {
            transform: translateX(100%);
          }
          100% {
            transform: translateX(-100%);
          }
        }
      `}</style>

      {isAdminModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-zinc-900">Acceso Administrador</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  Ingrese sus credenciales para ingresar su Usuario de administrador y su licencia.
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
              {sessionStatus?.adminTotalAccess ? (
                <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                  Acceso total de administrador activo.
                </p>
              ) : sessionStatus?.authenticated && sessionStatus.role === "account" ? (
                <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                  Sesión de cuenta administrativa detectada. Solo falta validar licencia.
                </p>
              ) : sessionStatus?.authenticated ? (
                <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                  Estás en sesión member. Cierra sesión e inicia por `/login` para control total admin.
                </p>
              ) : null}

              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Usuario de administrador</label>
                <input
                  value={adminUsername}
                  onChange={(event) => setAdminUsername(event.target.value)}
                  type="text"
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 outline-none"
                  placeholder="Ingrese su usuario"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Licencia</label>
                <input
                  value={adminLicense}
                  onChange={(event) => setAdminLicense(event.target.value)}
                  type="password"
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 outline-none"
                  placeholder="Ingrese su licencia"
                />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setIsAdminModalOpen(false)}
                className="h-10 flex-1 rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-700"
              >
                Cancelar
              </button>
              <button
                onClick={handleAdminLogin}
                disabled={adminLoading}
                className="h-10 flex-1 rounded-lg bg-zinc-900 text-sm font-medium text-white"
              >
                {adminLoading ? "Validando..." : "Ingresar"}
              </button>
            </div>

            {adminMessage ? (
              <p className="mt-3 text-sm text-zinc-600">{adminMessage}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
