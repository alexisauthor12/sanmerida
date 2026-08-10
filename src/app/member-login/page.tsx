"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const API_BASE =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? ""
    : process.env.NEXT_PUBLIC_API_BASE || "";

export default function MemberLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [encryptedKey, setEncryptedKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!username.trim() || username.trim() === "@" || !encryptedKey.trim()) {
      setError("Completa usuario y clave encriptada.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), encryptedKey: encryptedKey.trim(), portal: "member" }),
      });

      const data = (await response.json()) as {
        ok: boolean;
        message: string;
        redirectTo?: string;
      };

      if (!response.ok || !data.ok) {
        if (data.redirectTo) {
          setError(data.message || "Te estamos redirigiendo al portal correcto.");
          setTimeout(() => {
            router.push(data.redirectTo as string);
          }, 1200);
          return;
        }

        setError(data.message || "No fue posible iniciar sesión.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <video
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
      >
        <source src="/sistemasan.mp4" type="video/mp4" />
      </video>

      <div className="absolute inset-0 bg-black/55" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-10">
        <section className="w-full max-w-md rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur-md sm:p-8">
          <p className="text-xs uppercase tracking-[0.22em] text-white/75">TEAM SAN · Miembros</p>
          <h1 className="mt-3 text-3xl font-light tracking-[0.05em]">Administrar mis cuentas</h1>
          <p className="mt-3 text-sm leading-6 text-white/80">
            Inicia sesion para ingresar al dashboard exclusivo de miembros con seguimiento de cuotas, contratos y operaciones.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <input
              type="text"
              value={username}
              onFocus={() => {
                if (!username) setUsername("@");
              }}
              onChange={(event) => {
                const rawValue = event.target.value.replace(/\s+/g, "");
                const normalized = rawValue.startsWith("@") ? rawValue : `@${rawValue}`;
                setUsername(normalized === "" ? "@" : normalized);
              }}
              placeholder="Usuario (ej: alexis-ruiz)"
              autoComplete="username"
              required
              className="h-11 w-full rounded-xl border border-white/20 bg-black/30 px-4 text-white placeholder:text-white/40 outline-none transition focus:border-white/40"
            />
            <input
              type="password"
              value={encryptedKey}
              onChange={(event) => setEncryptedKey(event.target.value.toUpperCase())}
              placeholder="Clave encriptada"
              autoComplete="current-password"
              required
              className="h-11 w-full rounded-xl border border-white/20 bg-black/30 px-4 text-white placeholder:text-white/40 outline-none transition focus:border-white/40"
            />
            <p className="text-xs text-white/65">Formato requerido: SAN-MEMBER-XXXXXX</p>

            {error ? <p className="text-sm text-red-200">{error}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="h-11 w-full rounded-xl bg-white text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "Ingresando..." : "Entrar al dashboard de miembros"}
            </button>
          </form>

          <div className="mt-5 flex items-center justify-between text-xs text-white/80">
            <Link href="/" className="underline decoration-white/40 underline-offset-4 hover:text-white">
              Volver al home
            </Link>
            <Link href="/login" className="underline decoration-white/40 underline-offset-4 hover:text-white">
              Gestionar mi cuenta
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
