"use client";

import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useRef, useState } from "react";
import type * as LeafletNS from "leaflet";

export type GeoPoint = { lat: number; lng: number };

/** Centro por defecto: Mérida, Venezuela. */
const DEFAULT_CENTER: GeoPoint = { lat: 8.5897, lng: -71.1446 };

/** Caja de sesgo para que las búsquedas prioricen el área de Mérida (minLon,maxLat,maxLon,minLat). */
const SEARCH_VIEWBOX = "-71.8,9.0,-70.4,8.0";

type SearchResult = { placeId: string; label: string; lat: number; lng: number };

function pointSignature(point: GeoPoint | null) {
  return point ? `${point.lat.toFixed(6)},${point.lng.toFixed(6)}` : "";
}

function buildGoogleLink(point: GeoPoint) {
  return `https://www.google.com/maps?q=${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
}

export default function LocationPicker({
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
  /** Se ejecuta al presionar «Guardar ubicación» (o «Limpiar», con null). */
  onSave: (point: GeoPoint | null, address?: string) => void;
  /** Permite alternar la búsqueda a cualquier país (para clientes en el exterior). */
  allowInternational?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletNS.Map | null>(null);
  const markerRef = useRef<LeafletNS.Marker | null>(null);

  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState<GeoPoint | null>(value);
  const [address, setAddress] = useState("");
  const [dirty, setDirty] = useState(false);

  const [query, setQuery] = useState("");
  const [international, setInternational] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const valueRef = useRef(value);
  valueRef.current = value;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const savedSignatureRef = useRef(pointSignature(value));
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  /** Coloca (o quita) el pin en el mapa. */
  const applyPointToMap = useCallback(
    (point: GeoPoint | null, options?: { zoom?: number; recenter?: boolean }) => {
      const map = mapRef.current;
      const marker = markerRef.current;
      if (!map || !marker) return;

      if (!point) {
        marker.remove();
        map.setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 12);
        return;
      }

      marker.setLatLng([point.lat, point.lng]);
      if (!map.hasLayer(marker)) marker.addTo(map);

      if (options?.recenter !== false) {
        map.setView([point.lat, point.lng], options?.zoom ?? Math.max(map.getZoom(), 16));
      }
    },
    []
  );

  /** Registra un punto pendiente (aún sin guardar en el formulario). */
  const selectPoint = useCallback(
    (point: GeoPoint, options?: { zoom?: number; address?: string; recenter?: boolean }) => {
      setPending(point);
      setDirty(true);
      setError("");
      setStatus("Ubicación lista. Presiona «Guardar ubicación».");
      if (options?.address !== undefined) setAddress(options.address);
      applyPointToMap(point, { zoom: options?.zoom, recenter: options?.recenter });
    },
    [applyPointToMap]
  );

  const selectPointRef = useRef(selectPoint);
  selectPointRef.current = selectPoint;

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const start = valueRef.current ?? DEFAULT_CENTER;
      const map = L.map(containerRef.current, { zoomControl: true, scrollWheelZoom: true }).setView(
        [start.lat, start.lng],
        valueRef.current ? 16 : 12
      );

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);

      const icon = L.divIcon({
        className: "",
        html: '<div style="width:22px;height:22px;border-radius:50%;background:#0284c7;border:3px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,.45)"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const marker = L.marker([start.lat, start.lng], { icon, draggable: true });
      if (valueRef.current) marker.addTo(map);

      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        selectPointRef.current({ lat: pos.lat, lng: pos.lng }, { recenter: false });
      });

      map.on("click", (event) => {
        selectPointRef.current({ lat: event.latlng.lat, lng: event.latlng.lng });
      });

      mapRef.current = map;
      markerRef.current = marker;
      setReady(true);
      window.setTimeout(() => map.invalidateSize(), 250);
    }

    void init();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const signature = pointSignature(value);
    if (savedSignatureRef.current === signature) return;

    savedSignatureRef.current = signature;
    setPending(value);
    setDirty(false);
    setAddress("");
    setResults([]);
    applyPointToMap(value, { zoom: 16 });
  }, [value, applyPointToMap]);

  const useGps = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Tu navegador no soporta geolocalización.");
      return;
    }

    setLocating(true);
    setError("");
    setStatus("Obteniendo tu ubicación en tiempo real...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        selectPoint({ lat: position.coords.latitude, lng: position.coords.longitude }, { zoom: 17 });
        setStatus(
          `Ubicación capturada (precisión ±${Math.round(position.coords.accuracy)} m). Presiona «Guardar ubicación».`
        );
        setLocating(false);
      },
      (geoError) => {
        setError(geoError.message || "No se pudo obtener la ubicación.");
        setStatus("");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [selectPoint]);

  /** Busca la dirección escrita en el mapa (geocodificación directa). */
  const searchAddress = useCallback(async () => {
    const term = query.trim();

    if (term.length < 4) {
      setError("Escribe al menos 4 caracteres de la dirección.");
      return;
    }

    setSearching(true);
    setError("");
    setStatus("Buscando la dirección...");
    setResults([]);

    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("q", term);
      url.searchParams.set("limit", "5");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("accept-language", "es");

      if (!international) {
        // Modo Venezuela (referencias y cliente local): solo resultados del país, con sesgo a Mérida.
        url.searchParams.set("countrycodes", "ve");
        url.searchParams.set("viewbox", SEARCH_VIEWBOX);
        url.searchParams.set("bounded", "0");
      }

      const response = await fetch(url.toString());
      if (!response.ok) throw new Error("respuesta inválida");

      const data = (await response.json()) as Array<{
        place_id?: number;
        display_name?: string;
        lat?: string;
        lon?: string;
      }>;

      const found: SearchResult[] = [];

      data.forEach((item, index) => {
        const lat = Number(item.lat);
        const lng = Number(item.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        found.push({
          placeId: String(item.place_id ?? index),
          label: item.display_name ?? "Dirección sin nombre",
          lat,
          lng,
        });
      });

      if (found.length === 0) {
        setError("No se encontró esa dirección. Intenta ser más específico.");
        setStatus("");
        return;
      }

      setResults(found);
      selectPoint({ lat: found[0].lat, lng: found[0].lng }, { zoom: 17, address: found[0].label });
      setStatus(`${found.length} resultado(s). Elige el correcto en la lista y presiona «Guardar ubicación».`);
    } catch {
      setError("No se pudo buscar la dirección. Revisa tu conexión.");
      setStatus("");
    } finally {
      setSearching(false);
    }
  }, [query, selectPoint, international]);

  const pickResult = useCallback(
    (result: SearchResult) => {
      selectPoint({ lat: result.lat, lng: result.lng }, { zoom: 17, address: result.label });
      setQuery(result.label);
      setResults([]);
      setStatus("Ubicación lista. Presiona «Guardar ubicación».");
    },
    [selectPoint]
  );


  /** Convierte el pin actual en una dirección legible (geocodificación inversa). */
  const detectAddress = useCallback(async () => {
    const point = pendingRef.current;

    if (!point) {
      setError("Primero busca una dirección, usa tu GPS o toca el mapa.");
      return;
    }

    setGeocoding(true);
    setError("");

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${point.lat}&lon=${point.lng}&accept-language=es`
      );
      const data = (await response.json()) as { display_name?: string };

      if (data?.display_name) {
        setAddress(data.display_name);
        setDirty(true);
        setStatus("Dirección detectada. Presiona «Guardar ubicación».");
      } else {
        setError("No se pudo detectar la dirección de ese punto.");
      }
    } catch {
      setError("No se pudo detectar la dirección de ese punto.");
    } finally {
      setGeocoding(false);
    }
  }, []);

  /** Confirma el punto pendiente dentro del expediente. */
  const saveLocation = useCallback(() => {
    const point = pendingRef.current;

    if (!point) {
      setError("Coloca un punto en el mapa antes de guardar.");
      return;
    }

    savedSignatureRef.current = pointSignature(point);
    onSaveRef.current(point, address.trim() || undefined);
    setDirty(false);
    setError("");
    setStatus("✓ Ubicación guardada en el expediente.");
  }, [address]);

  const clearPoint = useCallback(() => {
    savedSignatureRef.current = "";
    onSaveRef.current(null);
    setPending(null);
    setAddress("");
    setQuery("");
    setResults([]);
    setDirty(false);
    setError("");
    setStatus("");
    applyPointToMap(null);
  }, [applyPointToMap]);

  const googleLink = pending ? buildGoogleLink(pending) : "";


  return (
    <div className="space-y-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-600">{title}</p>
        {hint ? <p className="text-[11px] text-zinc-500">{hint}</p> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void searchAddress();
            }
          }}
          placeholder={
            international
              ? "Escribe la dirección (ej: Av. Corrientes 1234, Buenos Aires)"
              : "Escribe la dirección (ej: Av. Las Américas, Mérida)"
          }
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void searchAddress()}
          disabled={searching}
          className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
        >
          {searching ? "Buscando..." : "🔍 Buscar"}
        </button>
      </div>

      {allowInternational ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setInternational((current) => !current);
              setResults([]);
              setStatus("");
              setError("");
            }}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
              international
                ? "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100"
                : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
            }`}
          >
            {international ? "🇻🇪 Buscar solo en Venezuela" : "🌎 El cliente está en otro país"}
          </button>
          <span className="text-[11px] text-zinc-500">
            {international
              ? "Búsqueda abierta en cualquier país."
              : "Búsqueda limitada a Venezuela. Actívalo si el cliente vive fuera."}
          </span>
        </div>
      ) : (
        <p className="text-[11px] font-medium text-zinc-500">🇻🇪 Búsqueda limitada a Venezuela (referencias locales)</p>
      )}

      {results.length > 0 ? (
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-1">
          {results.map((result) => (
            <li key={result.placeId}>
              <button
                type="button"
                onClick={() => pickResult(result)}
                className="w-full rounded px-2 py-1.5 text-left text-xs text-zinc-700 transition hover:bg-sky-50"
              >
                📍 {result.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}


      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={useGps}
          disabled={locating}
          className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
        >
          {locating ? "Ubicando..." : "📍 Usar mi ubicación GPS"}
        </button>
        <button
          type="button"
          onClick={() => void detectAddress()}
          disabled={geocoding || !pending}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-60"
        >
          {geocoding ? "Buscando..." : "🏠 Detectar dirección"}
        </button>
        <button
          type="button"
          onClick={clearPoint}
          disabled={!pending}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-60"
        >
          Limpiar
        </button>
      </div>

      <div
        ref={containerRef}
        className="h-56 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white"
        aria-label={`Mapa de ${title}`}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-mono text-zinc-700">
          {pending ? `Lat ${pending.lat.toFixed(6)} · Lng ${pending.lng.toFixed(6)}` : "Sin punto seleccionado"}
        </span>
        {pending ? (
          <a
            href={googleLink}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-sky-700 underline underline-offset-2 hover:text-sky-800"
          >
            Abrir en Google Maps ↗
          </a>
        ) : null}
      </div>

      {address ? (
        <p className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] leading-5 text-zinc-600">
          Dirección: {address}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={saveLocation}
          disabled={!pending || !dirty}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          💾 Guardar ubicación
        </button>
        {pending && dirty ? <span className="text-[11px] font-semibold text-amber-600">⚠ Sin guardar</span> : null}
        {pending && !dirty ? (
          <span className="text-[11px] font-semibold text-emerald-700">✓ Ubicación guardada</span>
        ) : null}
      </div>

      {status ? <p className="text-[11px] text-emerald-700">{status}</p> : null}
      {error ? <p className="text-[11px] text-rose-600">{error}</p> : null}
      {!ready ? <p className="text-[11px] text-zinc-400">Cargando mapa...</p> : null}
    </div>
  );
}

