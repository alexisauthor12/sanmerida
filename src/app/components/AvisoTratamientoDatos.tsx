"use client";

/**
 * Aviso de tratamiento de datos + consentimiento explicito.
 *
 * Se usa en los dos registros (publico y de miembros) para que el texto mostrado
 * sea exactamente el mismo. El contenido vive en `src/lib/consent.mjs`: la version
 * que se guarda en la base es la del texto que se mostro.
 */
import { useState } from "react";
import { ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";
import { AVISO_TRATAMIENTO_DATOS } from "@/lib/consent.mjs";

type Props = {
  aceptado: boolean;
  onChange: (aceptado: boolean) => void;
  /** Fondo claro (panel administrativo) u oscuro (registro publico). */
  tono?: "claro" | "oscuro";
};

export default function AvisoTratamientoDatos({ aceptado, onChange, tono = "claro" }: Props) {
  const [abierto, setAbierto] = useState(false);
  const oscuro = tono === "oscuro";

  const caja = oscuro
    ? "rounded-xl border border-white/15 bg-black/30"
    : "rounded-xl border border-zinc-200 bg-zinc-50";
  const titulo = oscuro ? "text-white/90" : "text-zinc-900";
  const texto = oscuro ? "text-white/70" : "text-zinc-600";
  const enlace = oscuro
    ? "text-cyan-200/90 hover:text-cyan-100"
    : "text-sky-700 hover:text-sky-800";

  return (
    <div className={`${caja} p-4`}>
      <div className="flex items-start gap-3">
        <ShieldCheck className={`mt-0.5 h-4 w-4 shrink-0 ${oscuro ? "text-cyan-200/80" : "text-sky-700"}`} />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${titulo}`}>{AVISO_TRATAMIENTO_DATOS.titulo}</p>
          <p className={`mt-1 text-xs ${texto}`}>{AVISO_TRATAMIENTO_DATOS.intro}</p>

          <button
            type="button"
            onClick={() => setAbierto((prev) => !prev)}
            className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${enlace}`}
            aria-expanded={abierto}
          >
            {abierto ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {abierto ? "Ocultar el aviso" : "Leer el aviso completo"}
          </button>

          {abierto ? (
            <div className={`mt-3 space-y-3 border-t pt-3 ${oscuro ? "border-white/15" : "border-zinc-200"}`}>
              {AVISO_TRATAMIENTO_DATOS.secciones.map((seccion) => (
                <div key={seccion.titulo}>
                  <p className={`text-xs font-semibold uppercase tracking-[0.1em] ${texto}`}>
                    {seccion.titulo}
                  </p>
                  {seccion.texto ? <p className={`mt-1 text-xs ${texto}`}>{seccion.texto}</p> : null}
                  {seccion.puntos ? (
                    <ul className={`mt-1 list-disc space-y-0.5 pl-4 text-xs ${texto}`}>
                      {seccion.puntos.map((punto) => (
                        <li key={punto}>{punto}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
              <p className={`text-[11px] ${texto}`}>
                Versión del aviso: {AVISO_TRATAMIENTO_DATOS.version}
              </p>
            </div>
          ) : null}

          <label className="mt-3 flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={aceptado}
              onChange={(event) => onChange(event.target.checked)}
              required
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-sky-600"
            />
            <span className={`text-xs font-medium ${titulo}`}>
              {AVISO_TRATAMIENTO_DATOS.textoConsentimiento}
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
