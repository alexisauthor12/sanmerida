"use client";

export type SavedGeoPoint = { lat: number; lng: number };

/** Enlace embebible de OpenStreetMap con marcador (mapa de solo lectura, sin API key). */
export function buildOsmEmbedUrl(lat: number, lng: number) {
  const delta = 0.004;
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
}

export function buildGoogleMapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/**
 * Mapa de solo lectura de una ubicación ya guardada.
 *
 * El mapa mantiene su proporcion (16:9) con un tope de altura, para que nunca
 * quede aplastado ni desborde la tarjeta donde se muestre.
 */
export default function SavedLocationPreview({
  label,
  lat,
  lng,
  heightClass = "aspect-[16/9] max-h-72 min-h-40",
}: {
  label: string;
  lat: number;
  lng: number;
  heightClass?: string;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col rounded-xl border border-zinc-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-zinc-700">{label}</p>
        <a
          href={buildGoogleMapsUrl(lat, lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] font-semibold text-sky-700 transition hover:bg-zinc-100"
        >
          Abrir en Google Maps ↗
        </a>
      </div>

      <iframe
        title={label}
        src={buildOsmEmbedUrl(lat, lng)}
        className={`mt-2 w-full min-w-0 rounded-lg border border-zinc-200 bg-zinc-100 ${heightClass}`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />

      <p className="mt-2 font-mono text-[11px] text-zinc-600">
        Lat {lat.toFixed(6)} · Lng {lng.toFixed(6)}
      </p>
    </div>
  );
}

/** Tarjeta de una ubicación que todavia no fue registrada. */
export function MissingLocationPreview({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-40 flex-col justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-3">
      <p className="text-xs font-semibold text-zinc-600">{label}</p>
      <p className="mt-1 text-sm text-zinc-500">Sin ubicación registrada.</p>
    </div>
  );
}

