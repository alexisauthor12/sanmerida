// Deno Deploy Edge Function: auth-login
// Reads JSON { email|username, password|encryptedKey, portal }
// Uses supabase-js with service role for server-side checks.
// Configure these env vars in Supabase: SUPABASE_URL, SERVICE_ROLE_KEY, JWT_SECRET (optional)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, message: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  try {
    const body = await req.json();
    const portal: "account" | "member" = body.portal;

    if (portal === "account") {
      const { email, password } = body;
      if (!email || !password) return json(400, { ok: false, message: "Faltan credenciales" });

      // Example: validate against public.user via PostgREST RPC or select
      const { data: users, error } = await supabase.from("User").select("id, email, passwordHash, nombre, isMember").eq("email", String(email).toLowerCase()).limit(1);
      if (error) return json(500, { ok: false, message: "Error consultando usuario" });
      const user = users?.[0];
      if (!user) return json(401, { ok: false, message: "Credenciales inválidas" });

      // For demo: compare hash using Deno.bcrypt if you enabled pgcrypto or store bcrypt hash as text
      // You can replace with a secure validation strategy or RPC
      const valid = true; // TODO: implement bcrypt compare in Edge using a lightweight bcrypt lib or RPC
      if (!valid) return json(401, { ok: false, message: "Credenciales inválidas" });

      // Issue a lightweight session cookie in your Next app instead, here only respond ok
      return json(200, { ok: true, message: "Login exitoso" });
    }

    if (portal === "member") {
      const { username, encryptedKey } = body;
      if (!username || !encryptedKey) return json(400, { ok: false, message: "Faltan credenciales" });

      const { data: profiles, error } = await supabase
        .from("MemberProfile")
        .select("id, username")
        .eq("username", String(username).toLowerCase())
        .limit(1);

      if (error) return json(500, { ok: false, message: "Error consultando perfil" });
      const profile = profiles?.[0];
      if (!profile) return json(401, { ok: false, message: "Credenciales inválidas" });

      // Demo: validate encryptedKey format server-side
      const format = /^SAN-MEMBER-[A-Z0-9]{6}$/;
      if (!format.test(String(encryptedKey))) return json(401, { ok: false, message: "Formato de clave inválido" });

      return json(200, { ok: true, message: "Acceso miembro aprobado" });
    }

    return json(400, { ok: false, message: "Portal inválido" });
  } catch (e) {
    return json(500, { ok: false, message: `Error: ${e instanceof Error ? e.message : "desconocido"}` });
  }
});

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}
