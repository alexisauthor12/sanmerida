"use client";

/**
 * Cambio de contrasena (`docs/SEGURIDAD_INTEGRAL.md` 7.5).
 *
 * La lista de requisitos se calcula con **el mismo modulo que valida en el
 * servidor** (`password-policy.mjs`), asi que nadie tiene que adivinar por que le
 * rechazan la contrasena: ve en vivo que le falta.
 *
 * Al cambiarla, el servidor incrementa `tokenVersion`: todas las sesiones dejan de
 * valer, incluida la actual. Por eso se avisa y se vuelve al login.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, KeyRound, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { MIN_CRITERIA, PASSWORD_MIN_LENGTH, evaluatePassword } from "@/lib/password-policy.mjs";

const API_BASE =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? ""
    : process.env.NEXT_PUBLIC_API_BASE || "";

export default function CambiarContrasena() {
  const router = useRouter();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const evaluacion = useMemo(() => evaluatePassword(nueva), [nueva]);
  const longitudOk = evaluacion.longitud >= PASSWORD_MIN_LENGTH;
  const tiposOk = evaluacion.cumplidos >= MIN_CRITERIA;
  const coincide = nueva.length > 0 && nueva === confirmar;
  const puedeEnviar = actual.length > 0 && longitudOk && tiposOk && coincide;

  async function enviar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setAviso("");
    setOcupado(true);

    try {
      const response = await fetch(`${API_BASE}/api/auth/cambiar-contrasena`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actual, nueva, confirmar }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
      };

      if (!response.ok || data.ok === false) {
        setError(data.message ?? "No se pudo cambiar la contraseña.");
        return;
      }

      setActual("");
      setNueva("");
      setConfirmar("");
      setAviso(data.message ?? "Contraseña actualizada.");

      // La sesion ya no vale: se vuelve al login.
      window.setTimeout(() => router.push("/login"), 1800);
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-zinc-700" />
        <div>
          <h3 className="font-semibold text-zinc-900">Cambiar mi contraseña</h3>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            Al cambiarla se cierran <strong>todas</strong> tus sesiones, incluida esta: si alguien
            tenía acceso con tu cuenta, deja de tenerlo en el mismo instante.
          </p>
        </div>
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

      <form onSubmit={enviar} className="mt-4 space-y-3">
        <div>
          <label
            className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500"
            htmlFor="clave-actual"
          >
            Contraseña actual
          </label>
          <input
            id="clave-actual"
            type="password"
            value={actual}
            onChange={(event) => setActual(event.target.value)}
            autoComplete="current-password"
            className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm text-zinc-900 outline-none focus:border-zinc-500"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label
              className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500"
              htmlFor="clave-nueva"
            >
              Contraseña nueva
            </label>
            <input
              id="clave-nueva"
              type="password"
              value={nueva}
              onChange={(event) => setNueva(event.target.value)}
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm text-zinc-900 outline-none focus:border-zinc-500"
            />
          </div>

          <div>
            <label
              className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500"
              htmlFor="clave-confirmar"
            >
              Repite la nueva
            </label>
            <input
              id="clave-confirmar"
              type="password"
              value={confirmar}
              onChange={(event) => setConfirmar(event.target.value)}
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm text-zinc-900 outline-none focus:border-zinc-500"
            />
          </div>
        </div>

        {nueva.length > 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <ul className="space-y-1 text-xs">
              <li className={`flex items-center gap-2 ${longitudOk ? "text-emerald-700" : "text-zinc-600"}`}>
                {longitudOk ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                Al menos {PASSWORD_MIN_LENGTH} caracteres ({evaluacion.longitud})
              </li>
              <li className={`flex items-center gap-2 ${tiposOk ? "text-emerald-700" : "text-zinc-600"}`}>
                {tiposOk ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                {MIN_CRITERIA} de 4 tipos ({evaluacion.cumplidos}/4): minúscula, mayúscula, número y
                símbolo
              </li>
              <li className={`flex items-center gap-2 ${coincide ? "text-emerald-700" : "text-zinc-600"}`}>
                {coincide ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                Las dos coinciden
              </li>
            </ul>
            <p className="mt-2 text-[11px] text-zinc-500">
              No puede ser una contraseña común ni contener tu nombre, tu correo o el nombre del
              negocio.
            </p>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={ocupado || !puedeEnviar}
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
        >
          {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Cambiar contraseña
        </button>
      </form>
    </article>
  );
}
