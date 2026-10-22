"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  LogOut,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";

type MemberUser = {
  userId?: string;
  email: string;
  nombre: string;
  isMember: boolean;
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

const TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "cuotas", label: "Mis cuotas" },
  { id: "pagos", label: "Mis pagos" },
  { id: "documentos", label: "Documentos" },
  { id: "datos", label: "Mis datos" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function formatMoney(value: number) {
  return `$${Number(value ?? 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function estadoStyles(estado: PanelCuota["estado"]) {
  if (estado === "Pagada") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  if (estado === "Vencida") return "bg-rose-500/15 text-rose-300 border-rose-500/30";
  if (estado === "Por vencer") return "bg-amber-500/15 text-amber-300 border-amber-500/30";

  return "bg-white/10 text-white/70 border-white/15";
}


export default function MemberDashboardClient({ user }: { user: MemberUser }) {
  const router = useRouter();
  const [data, setData] = useState<PanelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabId>("resumen");
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminLicense, setAdminLicense] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminMessage, setAdminMessage] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/member-panel", { cache: "no-store" });
      const payload = (await response.json()) as PanelResponse;

      if (!response.ok || !payload.ok) {
        setError(payload.message || "No se pudo cargar tu panel. Reintenta en unos segundos.");
        return;
      }

      setData(payload);
    } catch {
      setError("No se pudo conectar con el servidor. Reintenta en unos segundos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cerrarSesion = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/");
    router.refresh();
  };

  const validarAccesoAdmin = async () => {
    setAdminLoading(true);
    setAdminMessage("");

    try {
      const response = await fetch("/api/auth/admin-license", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: adminUsername.trim(), license: adminLicense.trim() }),
      });
      const result = (await response.json()) as { ok?: boolean; message?: string };

      if (!response.ok || !result.ok) {
        setAdminMessage(result.message || "No se pudo validar el acceso de administrador.");
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch {
      setAdminMessage("No se pudo conectar con el servidor.");
    } finally {
      setAdminLoading(false);
    }
  };

  const cuotas = data?.cuotas ?? [];
  const pagosCuotas = data?.pagos?.cuotas ?? [];
  const abonos = data?.pagos?.abonos ?? [];
  const documentos = data?.documentos ?? [];
  const contratos = data?.contratos ?? [];
  const resumen = data?.resumen;

  const proximasCuotas = useMemo(
    () => cuotas.filter((cuota) => cuota.estado !== "Pagada").slice(0, 6),
    [cuotas],
  );

  const totalPagado = useMemo(
    () =>
      pagosCuotas.reduce((acc, pago) => acc + pago.monto, 0) +
      abonos.reduce((acc, abono) => acc + abono.monto, 0),
    [pagosCuotas, abonos],
  );

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/70">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Cargando tu panel…
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            No se pudo cargar tu panel
          </p>
          <p className="mt-2 text-sm text-amber-100/80">{error}</p>
          <p className="mt-2 text-xs text-amber-100/60">
            Tus datos siguen guardados: nada se elimina automáticamente.
          </p>
          <button
            type="button"
            onClick={() => void cargar()}
            className="mt-4 rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
          >
            Reintentar
          </button>
        </div>
      </main>
    );
  }

  if (!data?.found) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <p className="text-lg font-semibold">Todavía no tienes un expediente asociado</p>
          <p className="mt-2 text-sm text-white/60">
            {data?.message ||
              "Cuando el equipo de San Mérida registre tu expediente, aquí verás tu plan, tus cuotas y tus documentos."}
          </p>
          <button
            type="button"
            onClick={() => void cerrarSesion()}
            className="mt-5 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
          >
            Salir
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-white/10 bg-gradient-to-r from-zinc-900 via-black to-zinc-900 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-white/50">TEAM SAN · Mi panel</p>
              <h1 className="mt-2 text-3xl font-light tracking-[0.03em]">Hola, {data.member?.nombre}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-white/70">
                  Cédula {data.member?.cedula}
                </span>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-300">
                  {data.plan?.nombre}
                </span>
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-white/70">
                  Miembro desde {data.member?.miembroDesde}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setAdminOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10"
              >
                <ShieldCheck className="h-4 w-4" />
                Acceso administrador
              </button>
              <button
                type="button"
                onClick={() => void cerrarSesion()}
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
              >
                <LogOut className="h-4 w-4" />
                Salir
              </button>
            </div>
          </div>
        </header>



        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-emerald-500/15 p-2 text-emerald-300">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-white/50">Cuotas pagadas</p>
                <p className="text-2xl font-semibold">
                  {resumen?.cuotasPagadas ?? 0}
                  <span className="text-sm font-normal text-white/50"> / {resumen?.totalCuotas ?? 0}</span>
                </p>
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-sky-500/15 p-2 text-sky-300">
                <Clock className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-white/50">Cuotas pendientes</p>
                <p className="text-2xl font-semibold">{resumen?.cuotasPendientes ?? 0}</p>
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-rose-500/15 p-2 text-rose-300">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-white/50">Cuotas vencidas</p>
                <p className="text-2xl font-semibold">{resumen?.cuotasVencidas ?? 0}</p>
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-amber-500/15 p-2 text-amber-300">
                <Wallet className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-white/50">Saldo pendiente</p>
                <p className="text-2xl font-semibold">{formatMoney(resumen?.saldo ?? 0)}</p>
              </div>
            </div>
          </article>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
          <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Avance de tu plan</p>
                <p className="text-xs text-white/50">
                  {resumen?.cuotasPagadas ?? 0} de {resumen?.totalCuotas ?? 0} cuotas pagadas
                </p>
              </div>
              <span className="text-2xl font-semibold text-emerald-300">{resumen?.avance ?? 0}%</span>
            </div>
            <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600"
                style={{ width: `${resumen?.avance ?? 0}%` }}
              />
            </div>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs text-white/50">Total del plan</p>
                <p className="font-semibold">{formatMoney(resumen?.totalPlan ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-white/50">Pagado</p>
                <p className="font-semibold text-emerald-300">{formatMoney(totalPagado)}</p>
              </div>
              <div>
                <p className="text-xs text-white/50">Saldo pendiente</p>
                <p className="font-semibold text-amber-300">{formatMoney(resumen?.saldo ?? 0)}</p>
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-white/50">Próxima cuota</p>
            {resumen?.proximaCuota ? (
              <>
                <p className="mt-2 text-3xl font-semibold">{formatMoney(resumen.proximaCuota.monto)}</p>
                <p className="mt-1 flex items-center gap-2 text-sm text-white/70">
                  <CalendarDays className="h-4 w-4" />
                  Cuota {resumen.proximaCuota.numero} · vence {resumen.proximaCuota.vence}
                </p>
                {resumen.proximaCuota.recargo > 0 ? (
                  <p className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-200">
                    Incluye recargo por mora de {formatMoney(resumen.proximaCuota.recargo)}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-3 flex items-center gap-2 text-sm text-emerald-300">
                <BadgeCheck className="h-4 w-4" />
                ¡Plan completado, no tienes cuotas pendientes!
              </p>
            )}
          </article>

        <nav className="mt-6 flex flex-wrap gap-2 border-b border-white/10 pb-3">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-pressed={tab === item.id}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                tab === item.id ? "bg-white text-black" : "bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {tab === "resumen" ? (
          <section className="mt-5 grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.16em] text-white/50">Tu moto</p>
              <div className="mt-3 flex items-center gap-4">
                {data.moto?.imagen ? (
                  <Image
                    src={data.moto.imagen}
                    alt={`${data.moto.marca} ${data.moto.modelo}`}
                    width={160}
                    height={110}
                    unoptimized
                    className="h-24 w-32 rounded-xl border border-white/10 bg-black object-contain"
                  />
                ) : null}
                <div>
                  <p className="text-lg font-semibold">
                    {data.moto?.marca} {data.moto?.modelo}
                  </p>
                  <p className="text-sm text-white/60">Precio: {formatMoney(data.moto?.precio ?? 0)}</p>
                  {data.moto?.slug ? (
                    <Link
                      href={`/modelos/${data.moto.slug}`}
                      target="_blank"
                      className="mt-2 inline-flex text-xs font-semibold text-sky-300 hover:underline"
                    >
                      Ver ficha del modelo ↗
                    </Link>
                  ) : null}
                </div>
              </div>
            </article>

            <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.16em] text-white/50">Tu plan</p>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-white/50">Plan:</span> {data.plan?.nombre}
                </p>
                <p>
                  <span className="text-white/50">Cuota:</span> {formatMoney(data.plan?.cuotaMensual ?? 0)}
                </p>
                <p>
                  <span className="text-white/50">Cuotas:</span> {data.plan?.totalCuotas}{" "}
                  {data.plan?.intervaloDias === 7 ? "(semanales)" : "(quincenales)"}
                </p>
                <p>
                  <span className="text-white/50">Inicio:</span> {data.plan?.inicio}
                </p>
                <p>
                  <span className="text-white/50">Contrato:</span> {data.plan?.tipoContrato}
                </p>
                {data.plan?.bancoPago ? (
                  <p>
                    <span className="text-white/50">Banco:</span> {data.plan.bancoPago}
                  </p>
                ) : null}
              </div>
            </article>

            <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.16em] text-white/50">Tu ubicación registrada</p>
              {data.ubicacion?.link ? (
                <>
                  <p className="mt-2 text-sm text-white/70">
                    {data.ubicacion.lat?.toFixed(6)}, {data.ubicacion.lng?.toFixed(6)}
                  </p>
                  <a
                    href={data.ubicacion.link}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-sky-300 hover:underline"
                  >
                    <MapPin className="h-4 w-4" />
                    Abrir en Google Maps ↗
                  </a>
                </>
              ) : (
                <p className="mt-2 text-sm text-white/50">Sin ubicación registrada.</p>
              )}
            </article>

            <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.16em] text-white/50">Tus próximas cuotas</p>
              {proximasCuotas.length === 0 ? (
                <p className="mt-2 text-sm text-emerald-300">No tienes cuotas pendientes.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {proximasCuotas.map((cuota) => (
                    <li
                      key={cuota.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/40 px-3 py-2"
                    >
                      <span>
                        Cuota {cuota.numero} · vence {cuota.vence}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-semibold">{formatMoney(cuota.monto)}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-xs ${estadoStyles(cuota.estado)}`}>
                          {cuota.estado}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        ) : null}

        </section>


        {tab === "cuotas" ? (
          <section className="mt-5 rounded-2xl border border-white/10 bg-white/5">
            <div className="border-b border-white/10 px-5 py-4">
              <p className="text-sm font-semibold">Calendario de cuotas</p>
              <p className="text-xs text-white/50">
                {data.plan?.intervaloDias === 7 ? "Una cuota por semana" : "Una cuota cada 15 días"} ·{" "}
                {data.plan?.totalCuotas} cuotas en total
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-black/40 text-xs uppercase tracking-[0.12em] text-white/50">
                  <tr>
                    <th className="px-4 py-3 text-left">Cuota</th>
                    <th className="px-4 py-3 text-left">Vence</th>
                    <th className="px-4 py-3 text-right">Monto</th>
                    <th className="px-4 py-3 text-right">Recargo</th>
                    <th className="px-4 py-3 text-left">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {cuotas.map((cuota) => (
                    <tr key={cuota.id} className="border-t border-white/5">
                      <td className="px-4 py-3 font-medium">#{cuota.numero}</td>
                      <td className="px-4 py-3 text-white/70">{cuota.vence}</td>
                      <td className="px-4 py-3 text-right">{formatMoney(cuota.monto)}</td>
                      <td className="px-4 py-3 text-right text-rose-300">
                        {cuota.recargo > 0 ? formatMoney(cuota.recargo) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2 py-0.5 text-xs ${estadoStyles(cuota.estado)}`}>
                          {cuota.estado}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {tab === "pagos" ? (
          <section className="mt-5 grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-white/10 bg-white/5">
              <div className="border-b border-white/10 px-5 py-4">
                <p className="text-sm font-semibold">Pagos de cuotas</p>
                <p className="text-xs text-white/50">
                  Total registrado: {formatMoney(pagosCuotas.reduce((acc, pago) => acc + pago.monto, 0))}
                </p>
              </div>
              <div className="p-5">
                {pagosCuotas.length === 0 ? (
                  <p className="text-sm text-white/50">Todavía no hay pagos de cuotas registrados.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {pagosCuotas.map((pago) => (
                      <li key={pago.id} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold">Cuota #{pago.cuota}</span>
                          <span className="font-semibold text-emerald-300">{formatMoney(pago.monto)}</span>
                        </div>
                        <p className="mt-1 text-xs text-white/60">
                          {pago.fecha} · {pago.banco || "—"} · {pago.metodo || "—"}
                        </p>
                        {pago.referencia ? <p className="text-xs text-white/40">Ref: {pago.referencia}</p> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>

            <article className="rounded-2xl border border-white/10 bg-white/5">
              <div className="border-b border-white/10 px-5 py-4">
                <p className="text-sm font-semibold">Abonos a tu favor</p>
                <p className="text-xs text-white/50">
                  Total abonado: {formatMoney(abonos.reduce((acc, abono) => acc + abono.monto, 0))}
                </p>
              </div>
              <div className="p-5">
                {abonos.length === 0 ? (
                  <p className="text-sm text-white/50">Sin abonos registrados.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {abonos.map((abono) => (
                      <li key={abono.id} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold">Abono</span>
                          <span className="font-semibold text-emerald-300">{formatMoney(abono.monto)}</span>
                        </div>
                        <p className="mt-1 text-xs text-white/60">
                          {abono.fecha} · {abono.banco || "—"} · {abono.metodo || "—"}
                        </p>
                        {abono.referencia ? <p className="text-xs text-white/40">Ref: {abono.referencia}</p> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          </section>
        ) : null}


        {tab === "documentos" ? (
          <section className="mt-5 grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-semibold">Mis documentos</p>
              <p className="text-xs text-white/50">Un registro por tipo de documento.</p>
              {documentos.length === 0 ? (
                <p className="mt-3 text-sm text-white/50">Sin documentos cargados.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {documentos.map((doc) => (
                    <li key={doc.id} className="rounded-xl border border-white/10 bg-black/40 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-xs uppercase tracking-[0.14em] text-white/50">{doc.tipo}</p>
                          <p className="text-sm font-semibold">{doc.nombre}</p>
                        </div>
                        <span className="text-xs text-white/50">{doc.fecha}</span>
                      </div>
                      <a
                        href={doc.archivo}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-sky-300 hover:underline"
                      >
                        <FileText className="h-4 w-4" />
                        Ver documento ↗
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-semibold">Mis contratos</p>
              <p className="text-xs text-white/50">Documentos firmados de tu expediente.</p>
              {contratos.length === 0 ? (
                <p className="mt-3 text-sm text-white/50">Sin contratos cargados.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {contratos.map((contrato) => (
                    <li key={contrato.id} className="rounded-xl border border-white/10 bg-black/40 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{contrato.nombre}</p>
                        <span className="text-xs text-white/50">{contrato.fecha}</span>
                      </div>
                      <a
                        href={contrato.archivo}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-sky-300 hover:underline"
                      >
                        <FileText className="h-4 w-4" />
                        Ver contrato ↗
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        ) : null}

        {tab === "datos" ? (
          <section className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-semibold">Mis datos</p>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              {[
                ["Nombre", data.member?.nombre],
                ["Cédula", data.member?.cedula],
                ["Correo", data.member?.email],
                ["Teléfono", data.member?.telefono],
                ["Ocupación", data.member?.ocupacion],
                ["Empresa", data.member?.empresa],
                ["Dirección", data.member?.direccion],
                ["Usuario", data.member?.username],
              ].map(([etiqueta, valor]) => (
                <p key={String(etiqueta)} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2">
                  <span className="block text-xs uppercase tracking-[0.14em] text-white/50">{etiqueta}</span>
                  <span className="font-medium">{valor || "—"}</span>
                </p>
              ))}
            </div>
            <p className="mt-4 text-xs text-white/50">
              ¿Algún dato está mal? Escríbenos y el equipo de San Mérida lo corrige en tu expediente.
            </p>
          </section>
        ) : null}
      </div>


      {adminOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void validarAccesoAdmin();
            }}
            className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">Acceso administrador</p>
                <p className="text-xs text-white/50">Solo para el equipo de San Mérida.</p>
              </div>
              <button
                type="button"
                onClick={() => setAdminOpen(false)}
                className="rounded-lg border border-white/15 px-2 py-1 text-xs text-white/70 transition hover:bg-white/10"
              >
                Cerrar
              </button>
            </div>

            <label className="mt-4 block text-xs uppercase tracking-[0.14em] text-white/50">Usuario</label>
            <input
              value={adminUsername}
              onChange={(event) => setAdminUsername(event.target.value)}
              autoComplete="username"
              className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-black/60 px-3 text-sm outline-none focus:border-white/40"
            />

            <label className="mt-3 block text-xs uppercase tracking-[0.14em] text-white/50">Licencia</label>
            <input
              type="password"
              value={adminLicense}
              onChange={(event) => setAdminLicense(event.target.value)}
              autoComplete="current-password"
              className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-black/60 px-3 text-sm outline-none focus:border-white/40"
            />

            {adminMessage ? <p className="mt-3 text-xs text-rose-300">{adminMessage}</p> : null}

            <button
              type="submit"
              disabled={adminLoading}
              className="mt-4 w-full rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {adminLoading ? "Validando…" : "Validar acceso"}
            </button>
          </form>
        </div>
      ) : null}
    </main>
  );
}
