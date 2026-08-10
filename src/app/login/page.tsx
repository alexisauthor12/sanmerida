"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const API_BASE =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? ""
    : process.env.NEXT_PUBLIC_API_BASE || "";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Completa correo y contraseña.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, portal: "account" }),
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
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-black px-6 py-12 text-white sm:px-10 lg:px-16">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.1), transparent 45%), radial-gradient(circle at 85% 15%, rgba(255,255,255,0.08), transparent 40%), linear-gradient(to bottom, rgba(3,6,10,0.9), rgba(1,1,1,0.98))",
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Image src="/Logo.png" alt="San Mérida" width={180} height={76} className="h-auto w-[150px] sm:w-[180px]" priority />
            <Link
              href="/"
              className="inline-flex items-center rounded-lg border border-white/30 bg-white/5 px-4 py-2 text-sm tracking-[0.08em] text-white/90 transition hover:bg-white/10"
            >
              Volver al Home
            </Link>
          </div>
          <p className="text-xs uppercase tracking-[0.24em] text-white/55">TEAM SAN · Login</p>
        </header>

        <article className="rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur-xl sm:p-8">
          <h1 className="text-3xl font-light tracking-[0.05em] text-white sm:text-4xl">Gestionar mi cuenta</h1>
          <p className="mt-4 text-sm leading-7 tracking-[0.03em] text-white/75 sm:text-base">
            Ingresa para revisar tu flujo, catálogos y estado de tu perfil dentro del sistema SAN.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Correo electrónico"
              autoComplete="email"
              required
              className="w-full rounded-xl border border-white/15 bg-black/45 px-4 py-3 text-white placeholder:text-white/35 outline-none transition focus:border-white/30"
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Contraseña"
              autoComplete="current-password"
              required
              className="w-full rounded-xl border border-white/15 bg-black/45 px-4 py-3 text-white placeholder:text-white/35 outline-none transition focus:border-white/30"
            />

            <div className="pt-1">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? "Ingresando..." : "Entrar al dashboard"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setRecoveryMessage("Solicita restablecimiento de acceso al equipo administrador para recuperar tu contraseña.");
                    setError("");
                  }}
                  className="text-sm font-medium text-cyan-200/90 underline underline-offset-4 transition hover:text-cyan-100"
                >
                  Olvidé mi contraseña
                </button>
              </div>

              {recoveryMessage ? <p className="mt-3 text-sm text-cyan-100/85">{recoveryMessage}</p> : null}
              {error ? <p className="mt-2 text-sm text-red-300/95">{error}</p> : null}
            </div>
          </form>
        </article>
      </div>
    </main>
  );
}
