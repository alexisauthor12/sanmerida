import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

serve(async (req) => {
  if (req.method !== "GET") return json(405, { ok: false, message: "Method not allowed" });

  const url = new URL(req.url);
  const cedula = url.searchParams.get("cedula");

  try {
    if (cedula) {
      // Example lookup by cedula returning a single client dossier shape
      const { data: profile, error } = await supabase
        .from("MemberProfile")
        .select("id, nombre, apellido, cedula, empresa, direccion")
        .eq("cedula", cedula)
        .maybeSingle();

      if (error) return json(500, { ok: false, message: "Error consultando expediente" });
      if (!profile) return json(200, { ok: true, found: false, message: "No existe expediente" });

      // TODO: join with installments table if exists; placeholder
      return json(200, { ok: true, found: true, client: { id: profile.id, nombre: `${profile.nombre} ${profile.apellido}`, documento: profile.cedula }, profile });
    }

    // List recent clients; placeholder
    const { data: clients, error } = await supabase
      .from("MemberProfile")
      .select("id, nombre, apellido, cedula")
      .limit(6);

    if (error) return json(500, { ok: false, message: "Error listando clientes" });

    return json(200, { ok: true, clients: (clients ?? []).map((c) => ({ id: c.id, nombre: `${c.nombre} ${c.apellido}`, documento: c.cedula })) });
  } catch (e) {
    return json(500, { ok: false, message: `Error: ${e instanceof Error ? e.message : "desconocido"}` });
  }
});

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}
