"use client";

import { useEffect, useState } from "react";
import LocationPicker, { type GeoPoint } from "@/app/components/LocationPicker";
import { buildGoogleMapsUrl } from "@/app/components/SavedLocationPreview";

/**
 * Campo de ubicación compacto: muestra el estado y un botón que abre el mapa
 * dentro de una ventana modal (así el formulario queda ordenado y sin mapas sueltos).
 */
export default function LocationField({
  title,
  hint,
  value,
  onSave,
  allowInternational = false,
}: {
  title: string;
  hint?: string;
  /** Punto ya guardado en el formulario (null si no hay). */
  value: GeoPoint | null;
  /** Se ejecuta al presionar «Guardar ubicación» dentro del mapa (o «Quitar», con null). */
  onSave: (point: GeoPoint | null, address?: string) => void;
  /** Permite alternar la búsqueda a cualquier país (para clientes en el exterior). */
  allowInternational?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-600">{title}</p>
          <p className="text-[11px] text-zinc-500">
            {value
              ? `Ubicación guardada · Lat ${value.lat.toFixed(6)} · Lng ${value.lng.toFixed(6)}`
              : "Sin ubicación registrada"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {value ? (
            <button
              type="button"
              onClick={() => onSave(null)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100"
            >
              Quitar
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
          >
            {value ? "✎ Cambiar ubicación" : "＋ Agregar ubicación"}
          </button>
        </div>
      </div>

      {value ? (
        <a
          href={buildGoogleMapsUrl(value.lat, value.lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-[11px] font-semibold text-sky-700 underline underline-offset-2 hover:text-sky-800"
        >
          Ver en Google Maps ↗
        </a>
      ) : hint ? (
        <p className="mt-2 text-[11px] text-zinc-500">{hint}</p>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-3 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
          <button
            type="button"
            aria-label="Cerrar ventana"
            onClick={() => setOpen(false)}
            className="fixed inset-0 h-full w-full cursor-default"
          />

          <div className="relative z-[51] mx-auto my-4 w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-zinc-900">{title}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
              >
                ✕ Cerrar
              </button>
            </div>

            <LocationPicker
              title="Busca la dirección, usa tu GPS o toca el mapa"
              hint={hint}
              value={value}
              onSave={onSave}
              allowInternational={allowInternational}
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-3">
              <p className="text-[11px] text-zinc-500">Recuerda presionar «Guardar ubicación» antes de cerrar.</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
