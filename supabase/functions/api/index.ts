import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "";

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, {
      ok: false,
      message: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Edge Function env.",
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, phone, role, is_active, created_at")
      .order("created_at", { ascending: false })
      .limit(25);

    if (error) {
      return json(500, { ok: false, message: error.message });
    }

    return json(200, { ok: true, profiles: data ?? [] });
  }

  if (req.method === "POST") {
    let body: Record<string, unknown> = {};

    try {
      body = await req.json();
    } catch {
      return json(400, { ok: false, message: "Invalid JSON payload." });
    }

    const email = String(body.email ?? "").trim().toLowerCase();
    const fullName = String(body.full_name ?? "").trim();
    const phone = String(body.phone ?? "").trim();

    if (!email || !fullName) {
      return json(400, { ok: false, message: "email and full_name are required." });
    }

    const { data, error } = await supabase
      .from("profiles")
      .insert({
        email,
        full_name: fullName,
        phone: phone || null,
      })
      .select("id, email, full_name, phone, role, is_active, created_at")
      .single();

    if (error) {
      return json(500, { ok: false, message: error.message });
    }

    return json(201, { ok: true, profile: data });
  }

  return json(405, { ok: false, message: "Method not allowed." });
});
