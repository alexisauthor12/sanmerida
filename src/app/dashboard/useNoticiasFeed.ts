"use client";

/**
 * Carga del feed real de novedades (`/api/noticias`) para el panel del equipo.
 *
 * Se centraliza aqui para que las pestanas "Noticias" y "Eventos" compartan los
 * mismos datos, el mismo estado de error y la misma marca de ultima lectura. El
 * endpoint exige sesion y, sin licencia administrativa, solo entrega las
 * publicaciones ya publicadas (nunca borradores).
 */
import { useCallback, useEffect, useState } from "react";

/** Publicacion del feed tal como la devuelve `/api/noticias`. */
export type NoticiaPost = {
  id: string;
  titulo: string;
  resumen: string;
  contenido: string;
  categoria: string;
  imagenUrl: string;
  videoUrl: string;
  autor: string;
  destacado: boolean;
  publicado: boolean;
  fecha: string;
  fechaIso: string;
};

const API_BASE =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? ""
    : process.env.NEXT_PUBLIC_API_BASE || "";

export function useNoticiasFeed() {
  const [posts, setPosts] = useState<NoticiaPost[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [actualizadoEn, setActualizadoEn] = useState<Date | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/api/noticias`, { cache: "no-store" });
      const data = (await response.json()) as {
        ok?: boolean;
        posts?: NoticiaPost[];
        message?: string;
      };

      if (!response.ok || !data.ok) {
        setError(data.message || "No se pudieron cargar las novedades.");
        return;
      }

      setPosts(data.posts ?? []);
      setActualizadoEn(new Date());
    } catch {
      setError("No se pudo conectar con el servidor. Reintenta en unos segundos.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return { posts, cargando, error, actualizadoEn, recargar: cargar };
}
