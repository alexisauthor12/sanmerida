"use client";

/**
 * Derecho de rectificacion (`docs/SEGURIDAD_INTEGRAL.md` 10.2, punto 7).
 *
 * El miembro **pide** la correccion de un dato; no lo edita. La solicitud queda
 * auditada y el equipo la ve en el panel de auditoria (alerta "correcciones
 * pendientes"). El cambio posterior tambien queda auditado.
 */
import { useState } from "react";
import { CheckCircle2, Loader2, Send, ShieldAlert } from "lucide-react";
import { CAMPOS_CORREGIBLES, CORRECTION_MIN_DETAIL } from "@/lib/correction-request.mjs";

const API_BASE =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? ""
    : process.env.NEXT_PUBLIC_API_BASE || "";

export default function SolicitudCorreccion() {
  const [campo, setCampo] = useState("telefono");
  const [detalle, setDetalle] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  async function enviar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setAviso("");

    if (detalle.trim().length < CORRECTION_MIN_DETAIL) {
      setError(`Cuéntanos qué hay que corregir (mínimo ${CORRECTION_MIN_DETAIL} caracteres).`);
      return;
    }

    setEnviando(true);

    try {
      const response = await fetch(`${API_BASE}/api/member-panel/correccion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campo, detalle }),
      });

      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };

      if (!response.ok || data.ok === false) {
        setError(data.message ?? "No se pudo enviar la solicitud.");
        return;
      }

      setDetalle("");
      setAviso(data.message ?? "Recibimos tu solicitud.");
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5">
      <h3 className="font-semibold text-zinc-900">Corregir un dato de mi expediente</h3>
      <p className="mt-1 text-sm text-zinc-600">
        Si algún dato está equivocado, pídelo aquí. Tú no lo editas directamente: el equipo revisa
        la solicitud, corrige el expediente y el cambio queda registrado.
      </p>

      {error ? (
        <p className="mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {aviso ? (
        <p className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {aviso}
        </p>
      ) : null}

      <form onSubmit={enviar} className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500" htmlFor="correccion-campo">
            Dato a corregir
          </label>
          <select
            id="correccion-campo"
            value={campo}
            onChange={(event) => setCampo(event.target.value)}
            className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm text-zinc-900 outline-none focus:border-zinc-500"
          >
            {CAMPOS_CORREGIBLES.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {opcion.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500" htmlFor="correccion-detalle">
            ¿Qué hay que corregir?
          </label>
          <textarea
            id="correccion-detalle"
            value={detalle}
            onChange={(event) => setDetalle(event.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Ejemplo: mi teléfono cambió, ahora es 0414-1234567."
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Cuéntanos cuál es el dato correcto. No incluyas contraseñas ni claves.
          </p>
        </div>

        <button
          type="submit"
          disabled={enviando || detalle.trim().length < CORRECTION_MIN_DETAIL}
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Enviar solicitud
        </button>
      </form>
    </article>
  );
}
