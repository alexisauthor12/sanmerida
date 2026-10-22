import { mkdir, readFile, rename, unlink, writeFile } from "fs/promises";
import path from "path";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildTrashKey, normalizeStorageKey } from "@/lib/asset-paths.mjs";

/**
 * Capa unica de almacenamiento de expedientes.
 *
 * - Si `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` estan configurados, los
 *   archivos viven en Supabase Storage (bucket privado) y se leen mediante el
 *   endpoint protegido `/api/member-files/file`.
 * - Si no lo estan (desarrollo local sin credenciales), se mantiene el
 *   comportamiento historico: escritura/lectura en `public/<clave>`.
 *
 * Las claves son relativas (ver `@/lib/asset-paths.mjs`), por lo que la misma
 * clave funciona en ambos backends y la migracion es una copia 1:1.
 */

export const DEFAULT_STORAGE_BUCKET = "member-documents";

function clean(value?: string | null) {
  return value?.trim().replace(/^['"]|['"]$/g, "") ?? "";
}

function readCloudflareEnv(name: string) {
  try {
    const { env } = getCloudflareContext();
    return clean((env as Record<string, string | undefined>)[name]);
  } catch {
    return "";
  }
}

/** Lee una variable de entorno desde `process.env` o desde el binding de Cloudflare. */
export function readStorageEnv(name: string) {
  return clean(process.env[name]) || readCloudflareEnv(name);
}

export function getStorageBucket() {
  return readStorageEnv("SUPABASE_STORAGE_BUCKET") || DEFAULT_STORAGE_BUCKET;
}

/** True cuando hay credenciales para usar Supabase Storage. */
export function isRemoteStorageEnabled() {
  return Boolean(readStorageEnv("SUPABASE_URL") && readStorageEnv("SUPABASE_SERVICE_ROLE_KEY"));
}

let cachedStorageClient: SupabaseClient | null = null;

function createStorageClient(url: string, serviceRoleKey: string) {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Next cachea `fetch` por defecto: hay que desactivarlo para que un
      // documento borrado o reemplazado NUNCA se sirva desde cache.
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store" }),
    },
  });
}

function getStorageClient() {
  if (cachedStorageClient) return cachedStorageClient;

  const url = readStorageEnv("SUPABASE_URL");
  const serviceRoleKey = readStorageEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase Storage no esta configurado (faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY).",
    );
  }

  cachedStorageClient = createStorageClient(url, serviceRoleKey);

  return cachedStorageClient;
}

function resolveLocalPath(key: string) {
  const safeKey = normalizeStorageKey(key);

  if (!safeKey || safeKey.includes("..")) {
    throw new Error("Clave de archivo invalida.");
  }

  return path.join(process.cwd(), "public", ...safeKey.split("/"));
}

/** Guarda (o reemplaza) un archivo y devuelve su clave normalizada. */
export async function saveAssetObject(
  key: string,
  bytes: Buffer,
  contentType?: string | null,
) {
  const safeKey = normalizeStorageKey(key);

  if (!safeKey || safeKey.includes("..")) {
    throw new Error("Clave de archivo invalida.");
  }

  if (isRemoteStorageEnabled()) {
    const { error } = await getStorageClient()
      .storage.from(getStorageBucket())
      .upload(safeKey, bytes, {
        contentType: contentType || "application/octet-stream",
        upsert: true,
      });

    if (error) {
      throw new Error(`No se pudo guardar el archivo en el almacenamiento: ${error.message}`);
    }

    return safeKey;
  }

  const absolutePath = resolveLocalPath(safeKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, bytes);

  return safeKey;
}

/** Lee un archivo desde el almacenamiento remoto o desde `public/`. */
export async function readAssetObject(key: string) {
  const safeKey = normalizeStorageKey(key);

  if (!safeKey || safeKey.includes("..")) {
    throw new Error("Clave de archivo invalida.");
  }

  if (isRemoteStorageEnabled()) {
    const { data, error } = await getStorageClient().storage.from(getStorageBucket()).download(safeKey);

    if (error || !data) {
      throw new Error(`No se pudo leer el archivo del almacenamiento: ${error?.message ?? "sin datos"}`);
    }

    return Buffer.from(await data.arrayBuffer());
  }

  return readFile(resolveLocalPath(safeKey));
}

/**
 * Borra un archivo del expediente SIN destruirlo: lo mueve a la papelera
 * (`_papelera/<fecha>/<clave>`) para poder recuperarlo. Para el borrado
 * definitivo existe `deleteAssetObjectPermanently` (script de purga).
 */
export async function deleteAssetObject(key: string) {
  return moveAssetObjectToTrash(key);
}

/** Mueve un archivo a la papelera (mejor esfuerzo). */
export async function moveAssetObjectToTrash(key: string) {
  const safeKey = normalizeStorageKey(key);

  if (!safeKey || safeKey.includes("..")) return false;

  const trashKey = buildTrashKey(safeKey);

  if (trashKey === safeKey) {
    // Ya estaba en la papelera: se elimina definitivamente.
    return deleteAssetObjectPermanently(safeKey);
  }

  if (isRemoteStorageEnabled()) {
    const client = getStorageClient();
    const bucket = getStorageBucket();
    const { error } = await client.storage.from(bucket).move(safeKey, trashKey);

    if (!error) return true;

    // Si no se pudo mover (por ejemplo el objeto ya no existe), se intenta borrar.
    const { error: removeError } = await client.storage.from(bucket).remove([safeKey]);
    return !removeError;
  }

  try {
    const from = resolveLocalPath(safeKey);
    const to = resolveLocalPath(trashKey);
    await mkdir(path.dirname(to), { recursive: true });
    await rename(from, to);
    return true;
  } catch {
    return false;
  }
}

/** Borrado definitivo (solo para el script de purga de la papelera). */
export async function deleteAssetObjectPermanently(key: string) {
  const safeKey = normalizeStorageKey(key);

  if (!safeKey || safeKey.includes("..")) return false;

  if (isRemoteStorageEnabled()) {
    const { error } = await getStorageClient().storage.from(getStorageBucket()).remove([safeKey]);
    return !error;
  }

  try {
    await unlink(resolveLocalPath(safeKey));
    return true;
  } catch {
    return false;
  }
}

/** Lista las claves de la papelera (para el script de purga). */
export async function listTrashedKeys(): Promise<string[]> {
  if (!isRemoteStorageEnabled()) return [];

  const bucket = getStorageBucket();
  const client = getStorageClient();

  async function walk(prefix: string): Promise<string[]> {
    const { data } = await client.storage.from(bucket).list(prefix, { limit: 1000 });
    const found: string[] = [];

    for (const entry of data ?? []) {
      const child = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.id === null) {
        found.push(...(await walk(child)));
      } else {
        found.push(child);
      }
    }

    return found;
  }

  return walk("_papelera");
}
