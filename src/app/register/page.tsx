"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const API_BASE =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? ""
    : process.env.NEXT_PUBLIC_API_BASE || "";

type RegisterForm = {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  password: string;
  confirmPassword: string;
};

const initialForm: RegisterForm = {
  nombre: "",
  apellido: "",
  email: "",
  telefono: "",
  password: "",
  confirmPassword: "",
};

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState<RegisterForm>(initialForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (field: keyof RegisterForm, value: string) => {
    setError("");
    setSuccess("");
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    const payload: RegisterForm = {
      nombre: form.nombre.trim(),
      apellido: form.apellido.trim(),
      email: form.email.trim(),
      telefono: form.telefono.trim(),
      password: form.password,
      confirmPassword: form.confirmPassword,
    };

    if (Object.values(payload).some((value) => value.length === 0)) {
      setError("Completa todos los campos para continuar.");
      return;
    }

    if (payload.password !== payload.confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as { ok: boolean; message: string };

      if (!response.ok || !data.ok) {
        setError(data.message || "No se pudo completar el registro.");
        return;
      }

      setForm(initialForm);
      setSuccess(data.message);
      window.setTimeout(() => {
        router.push("/dashboard");
      }, 700);
    } catch {
      setError("No se pudo conectar con el servidor. Intenta de nuevo.");
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

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8">
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
          <p className="text-xs uppercase tracking-[0.24em] text-white/55">TEAM SAN · Registro</p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur-xl sm:p-8">
            <p className="text-xs uppercase tracking-[0.24em] text-white/55">Ingresa al TEAM SAN</p>
            <h1 className="mt-3 text-3xl font-light tracking-[0.05em] text-white sm:text-4xl">
              Crea tu cuenta empresarial
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 tracking-[0.03em] text-white/75 sm:text-base">
              Regístrate para gestionar tu perfil, iniciar procesos y mantener trazabilidad de tu solicitud dentro del
              sistema San Mérida.
            </p>

            <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(event) => handleChange("nombre", event.target.value)}
                  placeholder="Nombre"
                  autoComplete="given-name"
                  required
                  className="w-full rounded-xl border border-white/15 bg-black/45 px-4 py-3 text-white placeholder:text-white/35 outline-none transition focus:border-white/30"
                />
                <input
                  type="text"
                  value={form.apellido}
                  onChange={(event) => handleChange("apellido", event.target.value)}
                  placeholder="Apellido"
                  autoComplete="family-name"
                  required
                  className="w-full rounded-xl border border-white/15 bg-black/45 px-4 py-3 text-white placeholder:text-white/35 outline-none transition focus:border-white/30"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => handleChange("email", event.target.value)}
                  placeholder="Correo electrónico"
                  autoComplete="email"
                  required
                  className="w-full rounded-xl border border-white/15 bg-black/45 px-4 py-3 text-white placeholder:text-white/35 outline-none transition focus:border-white/30"
                />
                <input
                  type="tel"
                  value={form.telefono}
                  onChange={(event) => handleChange("telefono", event.target.value)}
                  placeholder="Teléfono"
                  autoComplete="tel"
                  required
                  className="w-full rounded-xl border border-white/15 bg-black/45 px-4 py-3 text-white placeholder:text-white/35 outline-none transition focus:border-white/30"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => handleChange("password", event.target.value)}
                  placeholder="Contraseña"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  className="w-full rounded-xl border border-white/15 bg-black/45 px-4 py-3 text-white placeholder:text-white/35 outline-none transition focus:border-white/30"
                />
                <input
                  type="password"
                  value={form.confirmPassword}
                  onChange={(event) => handleChange("confirmPassword", event.target.value)}
                  placeholder="Confirmar contraseña"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  className="w-full rounded-xl border border-white/15 bg-black/45 px-4 py-3 text-white placeholder:text-white/35 outline-none transition focus:border-white/30"
                />
              </div>

              {error ? <p className="text-sm text-red-300/95">{error}</p> : null}
              {success ? <p className="text-sm text-emerald-300/95">{success}</p> : null}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? "Registrando..." : "Crear cuenta"}
              </button>
            </form>
          </article>

          <article className="rounded-2xl border border-white/10 bg-black/45 p-6 backdrop-blur-md sm:p-8">
            <h2 className="text-2xl font-light tracking-[0.04em] text-white">Registro organizado</h2>
            <p className="mt-4 text-sm leading-7 tracking-[0.02em] text-white/70 sm:text-base">
              Este flujo está diseñado para iniciar tu cuenta de forma rápida, segura y alineada con la identidad visual
              de San Mérida.
            </p>

            <ul className="mt-6 space-y-3 text-sm text-white/80">
              <li className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">Validación completa de campos obligatorios.</li>
              <li className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">Protección básica de contraseña mediante hash en servidor.</li>
              <li className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">Control de duplicados por correo electrónico.</li>
            </ul>
          </article>
        </section>
      </div>
    </main>
  );
}
