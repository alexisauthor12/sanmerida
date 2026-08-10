import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

serve(async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, message: "Method not allowed" });

  try {
    const body = await req.json();
    const { nombre, apellido, email, telefono, password } = body;

    if (!nombre || !apellido || !email || !telefono || !password) {
      return json(400, { ok: false, message: "Completa todos los campos para registrarte." });
    }

    // En Edge no usamos Prisma. Insertamos vía PostgREST
    const { error } = await supabase.from("User").insert({ nombre, apellido, email: String(email).toLowerCase(), telefono, passwordHash: password /* TODO: aplicar hash seguro */ });
    if (error) return json(409, { ok: false, message: "No se pudo registrar (posible duplicado de correo)." });

    return json(200, { ok: true, message: "Registro completado. Bienvenido al TEAM SAN." });
  } catch (e) {
    return json(500, { ok: false, message: `Error: ${e instanceof Error ? e.message : "desconocido"}` });
  }
});

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}
