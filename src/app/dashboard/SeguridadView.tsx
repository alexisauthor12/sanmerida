"use client";

/**
 * Autoservicio del segundo factor (TOTP).
 *
 * Cierra el circulo del 2FA: sin esto el backend sabria exigir el codigo, pero
 * nadie podria activarlo. Cada usuario gestiona el suyo con su propia sesion.
 *
 * Desactivarlo exige **contrasena + codigo**: una cookie robada no basta para
 * apagar la proteccion.
 *
 * El secreto se muestra una sola vez y ademas como URI `otpauth://` para
 * teclearlo a mano. Asi no hace falta ningun servicio externo de QR (que
 * filtraria el secreto) ni anadir una dependencia al proyecto.
 */
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, KeyRound, Loader2, ShieldAlert } from "lucide-react";

const API_BASE =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? ""
    : process.env.NEXT_PUBLIC_API_BASE || "";

type AltaPendiente = {
  secret: string;
  secretFormateado: string;
  otpauthUri: string;
};

export default function SeguridadView() {
  const [cargando, setCargando] = useState(true);
  const [activo, setActivo] = useState(false);
  const [alta, setAlta] = useState<AltaPendiente | null>(null);
  const [codigo, setCodigo] = useState("");
  const [password, setPassword] = useState("");
  const [recuperacion, setRecuperacion] = useState<string[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [copiado, setCopiado] = useState("");

  const cargarEstado = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/session-status`, { cache: "no-store" });
      const data = (await response.json()) as { totpEnabled?: boolean };

      setActivo(Boolean(data.totpEnabled));
    } catch {
      setError("No pudimos consultar el estado de tu cuenta.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargarEstado();
  }, [cargarEstado]);

  async function copiar(texto: string, etiqueta: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(etiqueta);
      window.setTimeout(() => setCopiado(""), 2500);
    } catch {
      setError("El navegador no permitió copiar. Selecciona el texto a mano.");
    }
  }

  async function enviar(url: string, cuerpo: Record<string, unknown>) {
    const response = await fetch(`${API_BASE}${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    return { ok: response.ok && data.ok !== false, data };
  }

  async function empezarAlta() {
    setError("");
    setAviso("");
    setOcupado(true);

    try {
      const { ok, data } = await enviar("/api/auth/totp/setup", {});

      if (!ok) {
        setError(String(data.message ?? "No se pudo generar el secreto."));
        return;
      }

      setAlta({
        secret: String(data.secret ?? ""),
        secretFormateado: String(data.secretFormateado ?? ""),
        otpauthUri: String(data.otpauthUri ?? ""),
      });
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setOcupado(false);
    }
  }

  async function confirmarAlta(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setAviso("");
    setOcupado(true);

    try {
      const { ok, data } = await enviar("/api/auth/totp/enable", { code: codigo });

      if (!ok) {
        setError(String(data.message ?? "El código no es válido."));
        return;
      }

      setRecuperacion(Array.isArray(data.recoveryCodes) ? (data.recoveryCodes as string[]) : []);
      setAlta(null);
      setCodigo("");
      setActivo(true);
      setAviso("Segundo factor activado.");
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setOcupado(false);
    }
  }

  async function desactivar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setAviso("");
    setOcupado(true);

    try {
      const { ok, data } = await enviar("/api/auth/totp/disable", { password, code: codigo });

      if (!ok) {
        setError(String(data.message ?? "No se pudo desactivar."));
        return;
      }

      setPassword("");
      setCodigo("");
      setActivo(false);
      setRecuperacion(null);
      setAviso(String(data.message ?? "Segundo factor desactivado."));
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setOcupado(false);
    }
  }

  if (cargando) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        Consultando el estado de seguridad de tu cuenta…
      </div>
    );
  }

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-zinc-700" />
          <div>
            <h3 className="font-semibold text-zinc-900">Verificación en dos pasos</h3>
            <p className="mt-1 max-w-2xl text-sm text-zinc-600">
              Además de tu contraseña, el sistema pedirá un código de 6 dígitos que cambia cada 30
              segundos. Si alguien consigue tu contraseña, sin tu teléfono no puede entrar.
            </p>
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            activo ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          {activo ? "Activo" : "Inactivo"}
        </span>
      </div>

      {error ? (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {aviso ? (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {aviso}
        </p>
      ) : null}

      {recuperacion && recuperacion.length > 0 ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            Guarda estos códigos de recuperación. No se volverán a mostrar.
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Sirven para entrar si pierdes el teléfono. Cada uno funciona una sola vez. Guárdalos
            fuera del teléfono (papel o gestor de contraseñas).
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {recuperacion.map((codigoRecuperacion) => (
              <code
                key={codigoRecuperacion}
                className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-center font-mono text-sm tracking-widest text-zinc-900"
              >
                {codigoRecuperacion}
              </code>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copiar(recuperacion.join("\n"), "codigos")}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              <Copy className="h-3.5 w-3.5" />
              {copiado === "codigos" ? "Copiados" : "Copiar los 8"}
            </button>
            <button
              type="button"
              onClick={() => setRecuperacion(null)}
              className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
            >
              Ya los guardé
            </button>
          </div>
        </div>
      ) : null}

      {!activo && !alta ? (
        <button
          type="button"
          onClick={() => void empezarAlta()}
          disabled={ocupado}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
        >
          {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Activar verificación en dos pasos
        </button>
      ) : null}

      {!activo && alta ? (
        <div className="mt-4 space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <div>
            <p className="text-sm font-semibold text-zinc-900">
              1. Añade la cuenta a tu app autenticadora
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              Abre Google Authenticator, Authy, 1Password o Aegis, elige «añadir cuenta» →
              «introducir clave de configuración» y pega este secreto. Da igual si lo escribes con
              espacios o en minúsculas.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm tracking-widest text-zinc-900">
                {alta.secretFormateado}
              </code>
              <button
                type="button"
                onClick={() => void copiar(alta.secret, "secreto")}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
              >
                <Copy className="h-3.5 w-3.5" />
                {copiado === "secreto" ? "Copiado" : "Copiar"}
              </button>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-zinc-500">
                ¿Prefieres el enlace otpauth://?
              </summary>
              <code className="mt-2 block break-all rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-700">
                {alta.otpauthUri}
              </code>
            </details>
          </div>

          <form onSubmit={confirmarAlta} className="space-y-3">
            <label className="block text-sm font-semibold text-zinc-900" htmlFor="totp-code-alta">
              2. Escribe el código de 6 dígitos que muestra la app
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="totp-code-alta"
                value={codigo}
                onChange={(event) => setCodigo(event.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                className="w-40 rounded-lg border border-zinc-300 px-3 py-2 text-center font-mono text-lg tracking-[0.3em] text-zinc-900"
              />
              <button
                type="submit"
                disabled={ocupado || codigo.length !== 6}
                className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirmar y activar
              </button>
              <button
                type="button"
                onClick={() => {
                  setAlta(null);
                  setCodigo("");
                }}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {activo ? (
        <form
          onSubmit={desactivar}
          className="mt-4 space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4"
        >
          <p className="text-sm font-semibold text-zinc-900">Desactivar (o rotar el secreto)</p>
          <p className="text-xs text-zinc-600">
            Por seguridad pedimos tu contraseña y un código válido. Para cambiar de teléfono o
            estrenar códigos de recuperación: desactiva y vuelve a activar.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="Contraseña"
              className="w-48 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
            />
            <input
              value={codigo}
              onChange={(event) => setCodigo(event.target.value)}
              autoComplete="one-time-code"
              placeholder="Código de la app o de recuperación"
              className="w-64 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
            />
            <button
              type="submit"
              disabled={ocupado || !password || !codigo}
              className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Desactivar
            </button>
          </div>
        </form>
      ) : null}
    </article>
  );
}
