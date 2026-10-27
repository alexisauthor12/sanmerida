"use client";

/**
 * Feed de Noticias / Actualizaciones del panel del equipo.
 *
 * Muestra las publicaciones REALES que el equipo administra desde el panel admin
 * (`/api/noticias`). No hay contenido de ejemplo: si la carga falla se ofrece
 * reintentar y, si no hay publicaciones, se avisa de forma explicita.
 *
 * Es reutilizable a proposito: la pestana "Eventos" usa este mismo componente
 * filtrando por la categoria `Eventos`, de modo que ambas vistas comparten datos,
 * estados de carga y diseno.
 */
import Image from "next/image";
import { useMemo, useState } from "react";
import { AlertTriangle, PlayCircle, RefreshCw, Rss } from "lucide-react";
import {
  claseCategoria,
  filtrarPorCategoria,
  resumirFeed,
  tiempoRelativo,
} from "@/lib/noticias-feed.mjs";
import { useNoticiasFeed } from "./useNoticiasFeed";

type NoticiasViewProps = {
  /** Si se indica, solo se muestran las publicaciones de esa categoria. */
  categoria?: string;
  titulo?: string;
  descripcion?: string;
  mensajeVacio?: string;
};

const FORMATO_FECHA = new Intl.DateTimeFormat("es-VE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const FORMATO_HORA = new Intl.DateTimeFormat("es-VE", {
  hour: "2-digit",
  minute: "2-digit",
});

export default function NoticiasView({
  categoria,
  titulo = "Noticias y Actualizaciones",
  descripcion = "Publicaciones oficiales del equipo San Mérida.",
  mensajeVacio = "Todavía no hay novedades publicadas. El equipo las administra desde el panel admin.",
}: NoticiasViewProps) {
  const { posts, cargando, error, actualizadoEn, recargar } = useNoticiasFeed();
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});

  const visibles = useMemo(
    () => (categoria ? filtrarPorCategoria(posts, categoria) : posts),
    [categoria, posts],
  );
  const resumen = useMemo(() => resumirFeed(visibles), [visibles]);

  const metricas = [
    { label: "Publicaciones", value: String(resumen.total) },
    { label: "Categorías activas", value: String(resumen.categorias) },
    { label: "Destacadas", value: String(resumen.destacadas) },
    {
      label: "Última publicación",
      value: resumen.ultimaFecha ? FORMATO_FECHA.format(resumen.ultimaFecha) : "—",
    },
  ];

  const alternar = (id: string) => {
    setAbiertos((previo) => ({ ...previo, [id]: !previo[id] }));
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-2xl font-light text-white mb-2">{titulo}</h2>
      <p className="text-white/60 mb-8">{descripcion}</p>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {cargando ? (
            <div className="p-6 rounded-2xl border border-white/10 bg-zinc-950/50">
              <p className="text-sm text-white/60">Cargando novedades…</p>
            </div>
          ) : error ? (
            <div className="p-6 rounded-2xl border border-red-500/30 bg-red-500/5">
              <p className="flex items-center gap-2 text-sm text-red-300">
                <AlertTriangle size={16} /> {error}
              </p>
              <button
                onClick={() => void recargar()}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white hover:bg-white/10 transition"
              >
                <RefreshCw size={14} /> Reintentar
              </button>
            </div>
          ) : visibles.length === 0 ? (
            <div className="p-6 rounded-2xl border border-white/10 bg-zinc-950/50">
              <p className="text-sm text-white/60">{mensajeVacio}</p>
            </div>
          ) : (
            visibles.map((post) => {
              const abierto = Boolean(abiertos[post.id]);

              return (
                <article
                  key={post.id}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/50"
                >
                  {post.imagenUrl ? (
                    <Image
                      src={post.imagenUrl}
                      alt={post.titulo}
                      width={900}
                      height={400}
                      unoptimized
                      className="h-44 w-full object-cover"
                    />
                  ) : null}

                  <div className="p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded ${claseCategoria(post.categoria)}`}>
                          {post.categoria}
                        </span>
                        {post.destacado ? (
                          <span className="text-xs px-2 py-1 rounded text-amber-300 bg-amber-400/10">
                            Destacado
                          </span>
                        ) : null}
                      </div>
                      <span className="text-xs text-white/40">
                        {tiempoRelativo(post.fechaIso, { respaldo: post.fecha }) || post.fecha}
                      </span>
                    </div>

                    <h3 className="text-xl text-white font-medium mb-3">{post.titulo}</h3>
                    {post.resumen ? (
                      <p className="text-sm text-white/60 leading-relaxed">{post.resumen}</p>
                    ) : null}

                    {abierto && post.contenido ? (
                      <p className="mt-4 whitespace-pre-line text-sm text-white/70 leading-relaxed">
                        {post.contenido}
                      </p>
                    ) : null}

                    {abierto && post.videoUrl ? (
                      <video
                        controls
                        playsInline
                        preload="metadata"
                        src={post.videoUrl}
                        className="mt-4 w-full rounded-xl border border-white/10 bg-black"
                      />
                    ) : null}

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      {post.contenido ? (
                        <button
                          onClick={() => alternar(post.id)}
                          className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white hover:bg-white/10 transition"
                        >
                          {abierto ? "Ocultar" : "Leer completo"}
                        </button>
                      ) : null}
                      {post.videoUrl ? (
                        <button
                          onClick={() => alternar(post.id)}
                          className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black hover:bg-white/90 transition"
                        >
                          <PlayCircle size={14} /> {abierto ? "Ocultar video" : "Ver video"}
                        </button>
                      ) : null}
                      {post.autor ? (
                        <span className="text-xs text-white/40">Por {post.autor}</span>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>

        <div className="space-y-6">
          <div className="p-6 rounded-2xl border border-white/10 bg-black flex flex-col items-center text-center">
            <Rss size={32} className="text-white/20 mb-4" />
            <h4 className="text-white font-medium mb-2">Estado del feed</h4>
            <p className="text-xs text-white/50 mb-4">
              {actualizadoEn
                ? `Última lectura: ${FORMATO_HORA.format(actualizadoEn)}`
                : "Sin lectura todavía."}
            </p>
            <div
              className={`flex items-center gap-2 text-sm ${
                error ? "text-red-400" : "text-emerald-400"
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  error ? "bg-red-400" : "bg-emerald-400 animate-pulse"
                }`}
              ></div>
              {error ? "Sin conexión con el feed" : "Feed sincronizado"}
            </div>
            <button
              onClick={() => void recargar()}
              disabled={cargando}
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={14} /> {cargando ? "Actualizando…" : "Actualizar"}
            </button>
          </div>

          <div className="p-6 rounded-2xl border border-white/10 bg-black">
            <h4 className="text-white font-medium mb-4">
              {categoria ? `Resumen de ${categoria}` : "Resumen del feed"}
            </h4>
            <ul className="space-y-3">
              {metricas.map((metrica) => (
                <li key={metrica.label} className="flex justify-between items-center text-sm">
                  <span className="text-white/50">{metrica.label}</span>
                  <span className="text-white font-medium">{metrica.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
