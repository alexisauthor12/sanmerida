"use client";

/**
 * Panel de auditoria (`docs/SEGURIDAD_INTEGRAL.md` seccion 6.5).
 *
 * Muestra quien hizo que, sobre que, cuando y desde donde. Solo ADMIN con licencia
 * administrativa validada puede consultarlo: el endpoint exige el permiso
 * `auditoria:read`, que esta en la lista de step-up.
 *
 * La cedula llega siempre ENMASCARADA desde el servidor (`***3017`): este
 * componente no recibe ni muestra datos personales completos.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, LogOut, RefreshCw, Search, ShieldCheck } from "lucide-react";

const API_BASE =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? ""
    : process.env.NEXT_PUBLIC_API_BASE || "";

type Entrada = {
  id: string;
  accion: string;
  actor: string;
  rol: string;
  objetivo: string;
  etiqueta: string;
  ip: string;
  agente: string;
  exito: boolean;
  fecha: string;
  fechaIso: string;
  detalle: Record<string, unknown> | null;
};

type Alerta = { tipo: string; detalle: string; total: number };

type Respuesta = {
  ok: boolean;
  message?: string;
  total?: number;
  limite?: number;
  offset?: number;
  acciones?: string[];
  entradas?: Entrada[];
  resumen?: {
    porAccion: Array<{ accion: string; total: number }>;
    porActor: Array<{ actor: string; total: number }>;
  };
  alertas?: Alerta[];
};

const LIMITE = 50;

/** Acciones que se muestran con etiqueta legible en la tabla. */
const ETIQUETA_ACCION: Record<string, string> = {
  LOGIN_SUCCESS: "Inicio de sesión",
  LOGIN_FAILED: "Intento fallido",
  LOGOUT: "Cierre de sesión",
  SESSION_REVOKED: "Sesiones revocadas",
  ADMIN_LICENSE_SUCCESS: "Licencia validada",
  ADMIN_LICENSE_FAILED: "Licencia rechazada",
  EXPEDIENTE_READ: "Lectura de expediente",
  EXPEDIENTE_CREATE: "Alta de expediente",
  EXPEDIENTE_UPDATE: "Edición de expediente",
  EXPEDIENTE_DELETE: "Baja de expediente",
  DOCUMENTO_READ: "Descarga de documento",
  DOCUMENTO_UPLOAD: "Carga de documento",
  DOCUMENTO_SCAN: "Escaneo de documento",
  DOCUMENTO_DELETE: "Borrado de documento",
  CREDENCIAL_READ: "Consulta de credenciales",
  CREDENCIAL_ROTATE: "Rotación de credenciales",
  CUOTA_PAYMENT_REGISTER: "Pago registrado",
  CUOTA_PAYMENT_REVERT: "Pago revertido",
  FINANCIAMIENTO_UPDATE: "Financiamiento actualizado",
  NOVEDAD_CREATE: "Novedad publicada",
  NOVEDAD_UPDATE: "Novedad editada",
  NOVEDAD_DELETE: "Novedad eliminada",
  GRUPO_EXPORT: "Exportación de grupo",
  RATE_LIMIT_BLOCK: "Bloqueo por intentos",
  ACCESS_DENIED: "Acceso denegado",
  TOTP_ENABLED: "Segundo factor activado",
  TOTP_DISABLED: "Segundo factor desactivado",
  TOTP_CHALLENGE_FAILED: "Código de verificación fallido",
  RECOVERY_CODE_USED: "Código de recuperación usado",
  AUDIT_PURGE: "Purga por retención",
  CORRECCION_SOLICITADA: "Corrección solicitada",
};

export default function AuditoriaView() {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);

  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [accion, setAccion] = useState("");
  const [actor, setActor] = useState("");
  const [cedula, setCedula] = useState("");
  const [resultado, setResultado] = useState("");

  const consulta = useMemo(() => {
    const params = new URLSearchParams();

    if (desde) params.set("desde", new Date(desde).toISOString());
    if (hasta) params.set("hasta", new Date(`${hasta}T23:59:59`).toISOString());
    if (accion) params.set("accion", accion);
    if (actor) params.set("actor", actor);
    if (cedula) params.set("cedula", cedula);
    if (resultado) params.set("resultado", resultado);
    params.set("limite", String(LIMITE));
    params.set("offset", String(offset));

    return params.toString();
  }, [desde, hasta, accion, actor, cedula, resultado, offset]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/api/auditoria?${consulta}`, { cache: "no-store" });
      const data = (await response.json()) as Respuesta;

      if (!response.ok || !data.ok) {
        setError(data.message || "No se pudo consultar la auditoría.");
        return;
      }

      setDatos(data);
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setCargando(false);
    }
  }, [consulta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const exportar = () => {
    const entradas = datos?.entradas ?? [];

    if (entradas.length === 0) return;

    const filas = [
      ["Fecha", "Accion", "Actor", "Rol", "Objetivo", "Etiqueta", "IP", "Resultado"],
      ...entradas.map((entrada) => [
        entrada.fecha,
        entrada.accion,
        entrada.actor,
        entrada.rol,
        entrada.objetivo,
        entrada.etiqueta,
        entrada.ip,
        entrada.exito ? "Concedido" : "Denegado",
      ]),
    ];

    const csv = filas
      .map((fila) => fila.map((celda) => `"${String(celda ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\n");

    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const enlace = document.createElement("a");

    enlace.href = url;
    enlace.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
    enlace.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Revoca TODAS las sesiones de la cuenta (incrementa `tokenVersion` en el
   * servidor). Es la respuesta correcta ante un equipo robado o una cuenta
   * comprometida: sin esto, la sesion seguiria viva hasta expirar.
   */
  const cerrarTodasLasSesiones = async () => {
    if (
      !window.confirm(
        "¿Cerrar TODAS tus sesiones? Tendrás que volver a iniciar sesión en todos los dispositivos.",
      )
    ) {
      return;
    }

    setCerrandoSesion(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/api/auth/logout-all`, { method: "POST" });
      const data = (await response.json()) as { ok?: boolean; message?: string };

      if (!response.ok || !data.ok) {
        setError(data.message || "No se pudieron cerrar las sesiones.");
        return;
      }

      window.location.href = "/login";
    } catch {
      setError("No se pudieron cerrar las sesiones.");
    } finally {
      setCerrandoSesion(false);
    }
  };

  const entradas = datos?.entradas ?? [];
  const total = datos?.total ?? 0;
  const alertas = datos?.alertas ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-semibold text-stone-900">
            <ShieldCheck className="h-6 w-6 text-emerald-700" />
            Auditoría
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            Quién hizo qué, sobre qué expediente, cuándo y desde dónde. Las cédulas se muestran
            enmascaradas.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void cargar()}
            className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            <RefreshCw className="h-4 w-4" /> Actualizar
          </button>
          <button
            type="button"
            onClick={exportar}
            disabled={entradas.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Exportar CSV
          </button>
          <button
            type="button"
            onClick={() => void cerrarTodasLasSesiones()}
            disabled={cerrandoSesion}
            className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
            {cerrandoSesion ? "Cerrando…" : "Cerrar todas mis sesiones"}
          </button>
        </div>
      </header>

      {alertas.length > 0 && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4" /> Alertas de la última hora
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {alertas.map((alerta) => (
              <li key={alerta.tipo}>• {alerta.detalle}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs font-medium text-stone-600">
            Desde
            <input
              type="date"
              value={desde}
              onChange={(event) => {
                setDesde(event.target.value);
                setOffset(0);
              }}
              className="mt-1 h-10 w-full rounded-lg border border-stone-300 px-3 text-sm"
            />
          </label>

          <label className="text-xs font-medium text-stone-600">
            Hasta
            <input
              type="date"
              value={hasta}
              onChange={(event) => {
                setHasta(event.target.value);
                setOffset(0);
              }}
              className="mt-1 h-10 w-full rounded-lg border border-stone-300 px-3 text-sm"
            />
          </label>

          <label className="text-xs font-medium text-stone-600">
            Acción
            <select
              value={accion}
              onChange={(event) => {
                setAccion(event.target.value);
                setOffset(0);
              }}
              className="mt-1 h-10 w-full rounded-lg border border-stone-300 px-3 text-sm"
            >
              <option value="">Todas</option>
              {(datos?.acciones ?? []).map((nombre) => (
                <option key={nombre} value={nombre}>
                  {ETIQUETA_ACCION[nombre] ?? nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-stone-600">
            Cuenta (correo)
            <input
              type="text"
              value={actor}
              onChange={(event) => {
                setActor(event.target.value);
                setOffset(0);
              }}
              placeholder="admin@sanmerida.com"
              className="mt-1 h-10 w-full rounded-lg border border-stone-300 px-3 text-sm"
            />
          </label>

          <label className="text-xs font-medium text-stone-600">
            Cédula del expediente
            <input
              type="text"
              value={cedula}
              onChange={(event) => {
                setCedula(event.target.value);
                setOffset(0);
              }}
              placeholder="31033017"
              className="mt-1 h-10 w-full rounded-lg border border-stone-300 px-3 text-sm"
            />
          </label>

          <label className="text-xs font-medium text-stone-600">
            Resultado
            <select
              value={resultado}
              onChange={(event) => {
                setResultado(event.target.value);
                setOffset(0);
              }}
              className="mt-1 h-10 w-full rounded-lg border border-stone-300 px-3 text-sm"
            >
              <option value="">Todos</option>
              <option value="ok">Concedidos</option>
              <option value="denegado">Denegados</option>
            </select>
          </label>
        </div>
      </section>

      {cargando ? (
        <p className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-500">
          Cargando registros…
        </p>
      ) : error ? (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-6">
          <p className="text-sm text-red-800">{error}</p>
          <button
            type="button"
            onClick={() => void cargar()}
            className="mt-3 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-stone-900">Por acción</h3>
              <ul className="mt-3 space-y-1 text-sm">
                {(datos?.resumen?.porAccion ?? []).map((fila) => (
                  <li key={fila.accion} className="flex justify-between gap-3">
                    <span className="text-stone-600">
                      {ETIQUETA_ACCION[fila.accion] ?? fila.accion}
                    </span>
                    <span className="font-medium text-stone-900">{fila.total}</span>
                  </li>
                ))}
                {(datos?.resumen?.porAccion ?? []).length === 0 && (
                  <li className="text-stone-500">Sin registros en el filtro actual.</li>
                )}
              </ul>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-stone-900">Por cuenta</h3>
              <ul className="mt-3 space-y-1 text-sm">
                {(datos?.resumen?.porActor ?? []).map((fila) => (
                  <li key={fila.actor} className="flex justify-between gap-3">
                    <span className="truncate text-stone-600">{fila.actor}</span>
                    <span className="font-medium text-stone-900">{fila.total}</span>
                  </li>
                ))}
                {(datos?.resumen?.porActor ?? []).length === 0 && (
                  <li className="text-stone-500">Sin registros en el filtro actual.</li>
                )}
              </ul>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-4 py-3">
              <p className="flex items-center gap-2 text-sm text-stone-600">
                <Search className="h-4 w-4" />
                {total} registro(s)
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOffset(Math.max(0, offset - LIMITE))}
                  disabled={offset === 0}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setOffset(offset + LIMITE)}
                  disabled={offset + LIMITE >= total}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 disabled:opacity-40"
                >
                  Siguiente
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-4 py-2">Fecha</th>
                    <th className="px-4 py-2">Acción</th>
                    <th className="px-4 py-2">Cuenta</th>
                    <th className="px-4 py-2">Expediente</th>
                    <th className="px-4 py-2">IP</th>
                    <th className="px-4 py-2">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {entradas.map((entrada) => (
                    <tr key={entrada.id}>
                      <td className="whitespace-nowrap px-4 py-2 text-stone-600">
                        {entrada.fecha}
                      </td>
                      <td className="px-4 py-2 text-stone-900">
                        {ETIQUETA_ACCION[entrada.accion] ?? entrada.accion}
                      </td>
                      <td className="px-4 py-2 text-stone-600">{entrada.actor || "—"}</td>
                      <td className="px-4 py-2 text-stone-600">{entrada.etiqueta || "—"}</td>
                      <td className="px-4 py-2 text-stone-500">{entrada.ip || "—"}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            entrada.exito
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {entrada.exito ? "Concedido" : "Denegado"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {entradas.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-stone-500">
                        No hay registros que coincidan con el filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
