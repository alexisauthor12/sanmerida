"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { MOTOS } from "@/data/motos";
import PromoCarousel from "@/app/components/PromoCarousel";
import ProcessCarousel from "@/app/components/ProcessCarousel";

type CatalogVideo = {
  titulo: string;
  src: string;
};

/**
 * Lee el cuerpo de una respuesta como JSON **sin lanzar**.
 *
 * Una respuesta que no es JSON (una pagina 404 de Next, un 502 de la plataforma) hacia
 * fallar `response.json()`, y ese fallo acababa mostrandose como "error de conexion"
 * aunque la conexion hubiera ido perfectamente. Con esto, el error que se enseña es el
 * de verdad: el estado HTTP y el mensaje del servidor si lo trae.
 */
async function leerJson<T>(respuesta: Response): Promise<T | null> {
  try {
    return (await respuesta.json()) as T;
  } catch {
    return null;
  }
}

function CatalogVideoCard({
  video,
  sectionActive,
  onOpen,
  onPauseMarquee,
  onResumeMarquee,
}: {
  video: CatalogVideo;
  sectionActive: boolean;
  onOpen: (video: CatalogVideo) => void;
  onPauseMarquee: () => void;
  onResumeMarquee: () => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
      },
      {
        root: null,
        rootMargin: "180px 0px",
        threshold: 0.2,
      },
    );

    observer.observe(wrapper);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!sectionActive || !isInView || shouldLoad) return;

    // El video se carga la primera vez que su seccion esta activa y entra en
    // pantalla, y queda cargado. La actualizacion se difiere al siguiente frame
    // para no llamar a setState dentro del cuerpo del efecto (evita renders en
    // cascada).
    const frame = requestAnimationFrame(() => setShouldLoad(true));

    return () => cancelAnimationFrame(frame);
  }, [sectionActive, isInView, shouldLoad]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;

    if (!sectionActive || !isInView || !shouldLoad) {
      element.pause();
      return;
    }

    const playPromise = element.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => undefined);
    }
  }, [sectionActive, isInView, shouldLoad]);

  return (
    <article className="group relative min-w-[260px] max-w-[260px] rounded-2xl border border-white/10 bg-zinc-950/70 p-3 transition duration-300 hover:border-white/30">
      <div
        ref={wrapperRef}
        className="relative aspect-[9/16] overflow-hidden rounded-xl bg-black"
        onMouseEnter={onPauseMarquee}
        onMouseLeave={onResumeMarquee}
        onClick={() => onOpen(video)}
      >
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
          src={shouldLoad ? video.src : undefined}
          autoPlay
          muted
          loop
          playsInline
          preload={shouldLoad ? "metadata" : "none"}
        />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition duration-300 group-hover:opacity-100">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/35 bg-black/55 text-white backdrop-blur-sm">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5l11 7-11 7V5z" />
            </svg>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <p className="text-sm uppercase tracking-[0.16em] text-white/70">{video.titulo}</p>
        <span className="h-2 w-2 rounded-full bg-white/60" />
      </div>
    </article>
  );
}

export default function Home() {
  const WHATSAPP_PHONE = "584140000000";
  const frases = ["Sueños realidad", "Eficiente", "Rápido", "Garantizado"];
  const [sanVideoOpen, setSanVideoOpen] = useState(false);
  const [pausarVideos, setPausarVideos] = useState(false);
  const [catalogVideoOpen, setCatalogVideoOpen] = useState<{ titulo: string; src: string } | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminLicense, setAdminLicense] = useState("");
  const [adminTotpCode, setAdminTotpCode] = useState("");
  const [needsAdminTotp, setNeedsAdminTotp] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminMessage, setAdminMessage] = useState("");
  const [contactForm, setContactForm] = useState({ nombre: "", email: "", mensaje: "" });
  const [contactError, setContactError] = useState("");
  const [contactSuccess, setContactSuccess] = useState(false);
  const testimonios = [
    {
      nombre: "Carlos Méndez",
      rol: "Cliente SAN",
      texto:
        "Desde el primer contacto sentí un trato serio y ordenado. El proceso fue claro y hoy ya tengo mi moto activa para trabajo diario.",
    },
    {
      nombre: "Daniela Rivas",
      rol: "Cliente Crédito",
      texto:
        "Me ayudaron a estructurar mis cuotas según mi flujo mensual. Todo fue transparente y el acompañamiento fue excelente.",
    },
    {
      nombre: "José Zambrano",
      rol: "Cliente Recurrente",
      texto:
        "San Mérida tiene una atención muy profesional. Cumplen lo que prometen y mantienen comunicación en cada etapa del proceso.",
    },
  ];
  // MP4 optimizados (<24 MiB) generados con scripts/compress-catalog-videos.mjs.
  // Los .MOV originales pesan hasta 133 MiB (limite de 25 MiB por asset de
  // Cloudflare) y ademas no se reproducen en todos los navegadores.
  const videosCatalogo = [
    { titulo: "Video 01", src: "/mp4video.mp4" },
    { titulo: "Video 02", src: "/videocarru2nuevo.mp4" },
    { titulo: "Video 03", src: "/videocarru3.mp4" },
    { titulo: "Video 04", src: "/videocarru4nuevo.mp4" },
    { titulo: "Video 05", src: "/videocarru5.mp4" },
    { titulo: "Video 06", src: "/videocarru6nuevo.mp4" },
  ];
  const videosCatalogoBase = videosCatalogo;
  const metodosPago = [
    {
      nombre: "Binance",
      imagen: "/Binance.png",
      detalle: "Cripto segura y rápida",
    },
    {
      nombre: "Pago Móvil",
      imagen: "/PagoMovil.png",
      detalle: "Transferencia inmediata",
    },
    {
      nombre: "Zelle",
      imagen: "/Zelle.png",
      detalle: "Pagos internacionales",
    },
    {
      nombre: "Efectivo",
      imagen: "/Efectivo.jpeg",
      detalle: "Pago presencial directo",
    },
  ];
  const metodosPagoBase = [...metodosPago, ...metodosPago, ...metodosPago];

  const [fraseActiva, setFraseActiva] = useState(0);
  const carruselRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const catalogSectionRef = useRef<HTMLDivElement>(null);
  const [catalogSectionInView, setCatalogSectionInView] = useState(false);
  const paymentSectionRef = useRef<HTMLDivElement>(null);
  const [paymentSectionInView, setPaymentSectionInView] = useState(false);
  const [pausarMetodos, setPausarMetodos] = useState(false);
  const isVideoOverlayOpen = sanVideoOpen || catalogVideoOpen !== null;

  useEffect(() => {
    const rotacion = window.setInterval(() => {
      setFraseActiva((prev) => (prev + 1) % frases.length);
    }, 2400);

    return () => window.clearInterval(rotacion);
  }, [frases.length]);

  useEffect(() => {
    const autoScroll = window.setInterval(() => {
      const container = carruselRef.current;
      if (!container) return;

      const card = container.querySelector<HTMLElement>("[data-model-card='true']");
      if (!card) return;

      const step = card.offsetWidth + 24;
      const maxScroll = container.scrollWidth - container.clientWidth;
      const nextScroll = container.scrollLeft + step;

      if (nextScroll >= maxScroll - 2) {
        container.scrollTo({ left: 0, behavior: "smooth" });
        return;
      }

      container.scrollTo({ left: nextScroll, behavior: "smooth" });
    }, 3600);

    return () => window.clearInterval(autoScroll);
  }, []);

  useEffect(() => {
    const closeMenuOnOutsideClick = (event: MouseEvent) => {
      const menuContainer = accountMenuRef.current;
      if (!menuContainer) return;

      const target = event.target;
      if (target instanceof Node && !menuContainer.contains(target)) {
        setAccountMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", closeMenuOnOutsideClick);

    return () => document.removeEventListener("mousedown", closeMenuOnOutsideClick);
  }, []);

  useEffect(() => {
    const section = catalogSectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setCatalogSectionInView(entry.isIntersecting);
      },
      {
        root: null,
        threshold: 0.15,
      },
    );

    observer.observe(section);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const section = paymentSectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setPaymentSectionInView(entry.isIntersecting);
      },
      {
        root: null,
        threshold: 0.15,
      },
    );

    observer.observe(section);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    if (isVideoOverlayOpen) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isVideoOverlayOpen]);

  const moverCarrusel = (direccion: "next" | "prev") => {
    const container = carruselRef.current;
    if (!container) return;

    const card = container.querySelector<HTMLElement>("[data-model-card='true']");
    if (!card) return;

    const step = card.offsetWidth + 24;
    const delta = direccion === "next" ? step : -step;

    container.scrollBy({ left: delta, behavior: "smooth" });
  };

  const handleContactChange = (field: "nombre" | "email" | "mensaje", value: string) => {
    setContactSuccess(false);
    setContactError("");
    setContactForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleContactSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nombre = contactForm.nombre.trim();
    const email = contactForm.email.trim();
    const mensaje = contactForm.mensaje.trim();

    if (!nombre || !email || !mensaje) {
      setContactSuccess(false);
      setContactError("Completa nombre, correo y mensaje para continuar.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setContactSuccess(false);
      setContactError("Ingresa un correo válido.");
      return;
    }

    const whatsappText = [
      "Hola San Mérida, quiero información de modelos.",
      `Nombre: ${nombre}`,
      `Correo: ${email}`,
      `Mensaje: ${mensaje}`,
    ].join("\n");

    const whatsappUrl = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(whatsappText)}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");

    setContactForm({ nombre: "", email: "", mensaje: "" });
    setContactError("");
    setContactSuccess(true);
  };

  const openAdminModal = () => {
    setAccountMenuOpen(false);
    setAdminModalOpen(true);
    setAdminMessage("");
  };

  const closeAdminModal = () => {
    if (adminLoading) return;
    setAdminModalOpen(false);
  };

  const handleAdminDirectLogin = async () => {
    if (!adminUsername.trim() || !adminPassword) {
      setAdminMessage("Ingresa tu usuario y tu contraseña.");
      return;
    }

    setAdminLoading(true);
    setAdminMessage("");

    try {
      // 1) Sesión normal, con usuario y contraseña.
      //
      // Antes esta pantalla llamaba a `/api/auth/admin-direct-login`, que entraba con
      // usuario + licencia y **sin contraseña**. Esa ruta se eliminó por ser un agujero
      // (docs/SEGURIDAD_INTEGRAL.md, paso 0.6), y esta pantalla se quedó sin actualizar:
      // el 404 resultante hacia fallar `response.json()` y el error se mostraba como
      // "error de conexión", que no tenía nada que ver.
      const loginResponse = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: adminUsername.trim(),
          password: adminPassword,
          totpCode: adminTotpCode.trim() || undefined,
          portal: "account",
        }),
      });

      const login = await leerJson<{
        ok?: boolean;
        message?: string;
        requiresTotp?: boolean;
      }>(loginResponse);

      if (login?.requiresTotp) {
        setNeedsAdminTotp(true);
        setAdminMessage(login.message ?? "Ingresa el código de tu aplicación de autenticación.");
        return;
      }

      if (!loginResponse.ok || !login?.ok) {
        setAdminMessage(
          login?.message ?? `No se pudo iniciar sesión (error ${loginResponse.status}).`,
        );
        return;
      }

      // 2) La licencia es el step-up: exige la sesión de arriba y el rol ADMIN.
      if (!adminLicense.trim()) {
        setAdminMessage("Sesión iniciada. Ahora ingresa la licencia administrativa.");
        return;
      }

      const licenseResponse = await fetch("/api/auth/admin-license", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: adminUsername.trim(),
          license: adminLicense.trim(),
          totpCode: adminTotpCode.trim() || undefined,
        }),
      });

      const licencia = await leerJson<{
        ok?: boolean;
        message?: string;
        requiresTotp?: boolean;
      }>(licenseResponse);

      if (licencia?.requiresTotp) {
        setNeedsAdminTotp(true);
        setAdminMessage(licencia.message ?? "Ingresa el código de tu aplicación de autenticación.");
        return;
      }

      if (!licenseResponse.ok || !licencia?.ok) {
        setAdminMessage(
          licencia?.message ?? `No se pudo validar la licencia (error ${licenseResponse.status}).`,
        );
        return;
      }

      window.location.href = "/admin";
    } catch {
      // Aquí sí es un fallo de red de verdad: la petición no llegó a completarse.
      setAdminMessage("No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setAdminLoading(false);
    }
  };

  return (
    <main className="bg-black text-white">
      <section className="relative min-h-screen overflow-hidden">
        <video
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
        >
          <source src="/IMG_2409.mp4" type="video/mp4" />
        </video>

        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(2,4,8,0.98) 0%, rgba(2,4,8,0.9) 16%, rgba(2,4,8,0.72) 34%, rgba(2,4,8,0.42) 52%, rgba(2,4,8,0.14) 66%, rgba(2,4,8,0) 78%)",
          }}
        />

        <div className="absolute inset-0 bg-black/30" />

        <div className="relative z-10 flex min-h-screen flex-col px-6 sm:px-10 lg:px-16">
          <header className="flex items-center justify-between py-7 sm:py-8">
            <a
              href="#"
              className="flex items-center gap-3"
              aria-label="Inicio San Mérida"
            >
              <Image
                src="/Logo.png"
                alt="Logo San Mérida"
                width={1584}
                height={672}
                priority
                sizes="(max-width: 640px) 150px, (max-width: 1024px) 180px, 210px"
                className="h-auto w-[150px] drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)] sm:w-[180px] lg:w-[210px]"
              />
            </a>

            <nav className="hidden items-center gap-10 text-base font-light tracking-[0.08em] text-white/90 md:flex">
              <a className="transition-colors duration-300 hover:text-white" href="#modelos">
                Modelos
              </a>
              <a className="transition-colors duration-300 hover:text-white" href="#nosotros">
                Nosotros
              </a>
              <a className="transition-colors duration-300 hover:text-white" href="#metodos-pago">
                Métodos de Pago
              </a>
              <a className="transition-colors duration-300 hover:text-white" href="#ubicacion">
                Ubicación
              </a>
              <a className="transition-colors duration-300 hover:text-white" href="#contacto">
                Contacto
              </a>
            </nav>

            <div ref={accountMenuRef} className="relative hidden items-center gap-3 md:flex">
              <button
                type="button"
                onClick={() => setAccountMenuOpen((prev) => !prev)}
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                className="rounded-lg border border-white/35 bg-white/5 px-5 py-2.5 text-sm font-medium tracking-[0.06em] text-white transition-colors duration-300 hover:bg-white/10"
              >
                Entrar
              </button>

              <Link
                href="/register"
                className="rounded-lg border border-white/70 px-5 py-2.5 text-sm font-medium tracking-[0.06em] text-white transition-colors duration-300 hover:bg-white/10"
              >
                Ingresa al TEAM SAN
              </Link>

              {accountMenuOpen ? (
                <div
                  role="menu"
                  className="absolute left-0 top-[calc(100%+10px)] min-w-[240px] rounded-xl border border-white/20 bg-white/5 p-2 backdrop-blur-md"
                >
                  <Link
                    href="/login"
                    role="menuitem"
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm font-light text-white/90 transition hover:bg-white/10"
                  >
                    Gestionar mi cuenta
                  </Link>
                  <Link
                    href="/member-login"
                    role="menuitem"
                    className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm font-light text-white/90 transition hover:bg-white/10"
                  >
                    Administrar mis cuentas
                  </Link>
                  <button
                    type="button"
                    onClick={openAdminModal}
                    role="menuitem"
                    className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm font-medium tracking-[0.04em] text-emerald-300 transition hover:bg-emerald-500/10 hover:text-emerald-200"
                  >
                    Acceso Admin
                  </button>
                </div>
              ) : null}
            </div>
          </header>

          {adminModalOpen ? (
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/65 px-4">
              <div className="w-full max-w-md rounded-2xl border border-white/20 bg-zinc-950/95 p-6 shadow-2xl backdrop-blur-md">
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Acceso seguro</p>
                    <h3 className="mt-2 text-2xl font-light tracking-[0.05em] text-white">Acceso Admin</h3>
                    <p className="mt-2 text-sm text-white/70">
                      Entra con tu usuario y contraseña, y confirma con la licencia administrativa.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeAdminModal}
                    className="rounded-md px-2 py-1 text-white/70 transition hover:bg-white/10 hover:text-white"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Usuario admin</label>
                    <input
                      value={adminUsername}
                      onChange={(event) => setAdminUsername(event.target.value)}
                      type="text"
                      autoComplete="username"
                      className="h-11 w-full rounded-xl border border-white/20 bg-black/40 px-3 text-sm text-white outline-none transition focus:border-emerald-300/60"
                      placeholder="Ingresa tu usuario admin"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Contraseña</label>
                    <input
                      value={adminPassword}
                      onChange={(event) => setAdminPassword(event.target.value)}
                      type="password"
                      autoComplete="current-password"
                      className="h-11 w-full rounded-xl border border-white/20 bg-black/40 px-3 text-sm text-white outline-none transition focus:border-emerald-300/60"
                      placeholder="Ingresa tu contraseña"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Licencia administrativa</label>
                    <input
                      value={adminLicense}
                      onChange={(event) => setAdminLicense(event.target.value)}
                      type="password"
                      autoComplete="off"
                      className="h-11 w-full rounded-xl border border-white/20 bg-black/40 px-3 text-sm text-white outline-none transition focus:border-emerald-300/60"
                      placeholder="Ingresa tu licencia"
                    />
                  </div>

                  {needsAdminTotp ? (
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Código de verificación</label>
                      <input
                        value={adminTotpCode}
                        onChange={(event) => setAdminTotpCode(event.target.value)}
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        className="h-11 w-full rounded-xl border border-white/20 bg-black/40 px-3 text-sm tracking-[0.3em] text-white outline-none transition focus:border-emerald-300/60"
                        placeholder="000000"
                      />
                      <p className="mt-1 text-xs text-white/50">
                        El de tu aplicación de autenticación, o uno de tus códigos de recuperación.
                      </p>
                    </div>
                  ) : null}
                </div>

                {adminMessage ? <p className="mt-3 text-sm text-amber-300">{adminMessage}</p> : null}

                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    onClick={closeAdminModal}
                    className="h-11 flex-1 rounded-xl border border-white/20 bg-transparent text-sm font-medium text-white/80 transition hover:bg-white/10"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAdminDirectLogin()}
                    disabled={adminLoading}
                    className="h-11 flex-1 rounded-xl bg-emerald-500 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-70"
                  >
                    {adminLoading ? "Ingresando..." : "Entrar"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <section className="flex flex-1 items-center">
            <div className="max-w-2xl">
              <p className="mb-5 text-sm font-light uppercase tracking-[0.22em] text-white/85">
                Movilidad inteligente
              </p>
              <h1 className="text-4xl font-light leading-[1.1] tracking-[0.06em] text-white sm:text-5xl lg:text-6xl">
                Con San Mérida puedes ser
                <br />
                <span className="inline-flex min-h-[1.2em] items-end overflow-hidden">
                  <span key={frases[fraseActiva]} className="animate-rise-fade inline-block">
                    {frases[fraseActiva]}
                  </span>
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-base font-light leading-7 tracking-[0.04em] text-white/85 sm:text-lg">
                Creamos una experiencia premium para una marca moderna: limpia,
                elegante y lista para escalar a nivel empresarial.
              </p>
            </div>
          </section>
        </div>
      </section>

      <section id="modelos" className="border-t border-white/10 bg-black px-6 py-16 sm:px-10 lg:px-16 lg:py-20">
        <div className="mb-10 flex items-end justify-between">
          <h2 className="text-3xl font-light tracking-[0.05em] text-white sm:text-4xl">
            Nuevos modelos
          </h2>

          <div className="hidden items-center gap-3 md:flex">
            <button
              type="button"
              onClick={() => moverCarrusel("prev")}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/25 text-white/80 transition hover:border-white/60 hover:text-white"
              aria-label="Modelo anterior"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => moverCarrusel("next")}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/25 text-white/80 transition hover:border-white/60 hover:text-white"
              aria-label="Siguiente modelo"
            >
              →
            </button>
          </div>
        </div>

        <div
          ref={carruselRef}
          className="flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-smooth pb-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {MOTOS.map((modelo) => (
            <Link
              key={modelo.slug}
              href={`/modelos/${modelo.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              data-model-card="true"
              className="group min-w-[84%] snap-start rounded-2xl border border-white/12 bg-zinc-950/60 p-5 backdrop-blur-[1px] transition duration-300 hover:-translate-y-1 hover:border-white/35 hover:bg-zinc-900/80 sm:min-w-[47%] lg:min-w-[31%] xl:min-w-[23.5%]"
            >
              <div className="relative mb-5 flex h-52 items-center justify-center overflow-hidden rounded-xl border border-white/8 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black">
                <Image
                  src={modelo.imagen}
                  alt={modelo.nombre}
                  fill
                  sizes="(max-width: 640px) 100vw, 400px"
                  className="object-contain object-center drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)] transition duration-500 group-hover:scale-[1.04]"
                  unoptimized
                />
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.14),transparent_52%)]" />
                <div className="absolute inset-x-6 bottom-4 h-px bg-white/15 transition-colors duration-300 group-hover:bg-white/35" />
                <div className="pointer-events-none absolute inset-0 flex items-end justify-between p-4 opacity-0 transition duration-300 group-hover:opacity-100">
                  <span className="rounded-full border border-white/50 bg-black/50 px-3 py-1 text-xs uppercase tracking-[0.16em] text-white/90">
                    Ver ficha
                  </span>
                  <span className="text-lg text-white/90">↗</span>
                </div>
              </div>

              <h3 className="text-2xl font-light tracking-[0.03em] text-white">
                {modelo.nombre}
              </h3>
              <p className="mt-3 text-lg font-light leading-8 tracking-[0.02em] text-white/75">
                {modelo.descripcion}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <PromoCarousel />

      <section className="relative min-h-[90vh] overflow-hidden border-t border-white/10">
        <video
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
        >
          <source src="/MTT.mp4" type="video/mp4" />
        </video>

        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.64) 28%, rgba(0,0,0,0.52) 52%, rgba(0,0,0,0.78) 100%)",
          }}
        />

        <div className="absolute inset-0 bg-black/28" />

        <div className="relative z-10 flex min-h-[90vh] items-center px-6 sm:px-10 lg:px-16">
          <div className="max-w-3xl">
            <p className="mb-5 text-xs uppercase tracking-[0.24em] text-white/65 sm:text-sm">
              Tecnología y presencia
            </p>
            <h2 className="text-3xl font-light leading-[1.12] tracking-[0.05em] text-white sm:text-5xl">
              Ingeniería para una
              <br />
              movilidad de alto nivel.
            </h2>
            <p className="mt-6 max-w-2xl text-base font-light leading-8 tracking-[0.03em] text-white/80 sm:text-lg">
              Diseñamos una experiencia visual limpia y empresarial, con enfoque
              en rendimiento, confianza y una estética minimalista premium.
            </p>
          </div>
        </div>
      </section>

      <ProcessCarousel />

      <section className="bg-black px-6 py-20 sm:px-10 lg:px-16 lg:py-24">
        <div className="mx-auto max-w-7xl space-y-10">
          <div className="space-y-4">
            <p className="text-xs uppercase tracking-[0.24em] text-white/60 sm:text-sm">Dos sistemas, una meta</p>
            <h2 className="text-3xl font-light leading-[1.14] tracking-[0.05em] text-white sm:text-5xl">
              Llévate tu moto con el plan
              <br />
              que mejor se adapte a ti.
            </h2>
            <p className="max-w-3xl text-base font-light leading-8 tracking-[0.03em] text-white/75 sm:text-lg">
              Elige entre nuestro sistema SAN desde 55$ quincenales o un esquema de crédito tradicional. Ambos con
              acompañamiento experto, contratos claros y soporte post-venta.
            </p>
          </div>

          <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-6">
              <article className="rounded-2xl border border-white/12 bg-zinc-950/70 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black text-sm font-semibold">1</span>
                  <div>
                    <p className="text-xs font-mono uppercase tracking-[0.22em] text-white/50">Sistema SAN</p>
                    <h3 className="text-2xl font-light text-white">55$ quincenales</h3>
                  </div>
                </div>
                <p className="text-base font-light leading-7 tracking-[0.02em] text-white/75">
                  Acceso al sistema rotativo SAN: eliges tu cupo, participas en la rueda y avanzas hasta la entrega.
                  Incluye asistencia personalizada, seguimiento en tiempo real y transparencia en cada giro.
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-white/60">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M12 6v6l3 3" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Rueda programada
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Seguimiento en vivo
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Contrato claro
                  </span>
                </div>
              </article>

              <article className="rounded-2xl border border-white/12 bg-zinc-950/70 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black text-sm font-semibold">2</span>
                  <div>
                    <p className="text-xs font-mono uppercase tracking-[0.22em] text-white/50">Sistema de crédito</p>
                    <h3 className="text-2xl font-light text-white">Financia a tu ritmo</h3>
                  </div>
                </div>
                <p className="text-base font-light leading-7 tracking-[0.02em] text-white/75">
                  Opción de crédito con cuotas flexibles y aprobación guiada. Evaluamos tu perfil, definimos plazos
                  cómodos y te acompañamos hasta la entrega final con respaldo post-venta.
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-white/60">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Cuotas flexibles
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M7 12l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Aprobación guiada
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M12 5v14m-7-7h14" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Plan a medida
                  </span>
                </div>
              </article>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 items-start">
              <div className="relative overflow-hidden rounded-2xl bg-zinc-950/80 p-3 shadow-[0_14px_50px_rgba(0,0,0,0.35)] flex flex-col gap-3">
                <div className="mb-3 flex items-center justify-between text-white/70 text-sm">
                  <span className="flex items-center gap-2 uppercase tracking-[0.16em]">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M8 5l10 7-10 7V5z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Sistema SAN
                  </span>
                </div>

                <div className="group relative mx-auto aspect-[9/16] max-h-[300px] w-full overflow-hidden rounded-xl bg-black">
                  <video
                    className="absolute inset-0 h-full w-full object-cover"
                    src="/sistemasan.mp4"
                    autoPlay
                    muted
                    loop
                    playsInline
                    poster="/logominimal.png"
                  />
                  <div className="absolute inset-0 bg-black/15 transition duration-300 group-hover:bg-black/25" />
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.14),transparent_55%)]" />
                  <button
                    type="button"
                    onClick={() => setSanVideoOpen(true)}
                    className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/25 bg-black/70 px-4 py-2 text-xs uppercase tracking-[0.14em] text-white/85 backdrop-blur-sm transition hover:border-white/50 hover:bg-black/80"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5l11 7-11 7V5z" />
                    </svg>
                    Vista previa
                  </button>
                </div>

                {sanVideoOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
                    <div className="relative w-full max-w-[420px] rounded-2xl border border-white/10 bg-black/95 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.55)]">
                      <button
                        type="button"
                        onClick={() => setSanVideoOpen(false)}
                        className="absolute right-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white hover:bg-white/20"
                        aria-label="Cerrar video"
                      >
                        ×
                      </button>
                      <div className="relative mx-auto aspect-[9/16] w-full max-w-[280px] sm:max-w-[300px] overflow-hidden rounded-xl bg-black max-h-[58vh]">
                        <video
                          className="absolute inset-0 h-full w-full object-cover"
                          src="/sistemasan.mp4"
                          autoPlay
                          controls
                          playsInline
                          preload="metadata"
                        />
                      </div>

                      <div className="mt-4 flex justify-center">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-full border border-emerald-400/80 bg-black px-8 py-3.5 text-base font-semibold text-emerald-100 shadow-[0_0_0_1px_rgba(16,185,129,0.45),0_0_18px_rgba(16,185,129,0.35)] transition hover:shadow-[0_0_0_1px_rgba(16,185,129,0.85),0_0_28px_rgba(16,185,129,0.6)] active:scale-[0.98] animate-pulse"
                        >
                          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M4 6h16M4 12h10M4 18h8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Contactar a ventas
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="relative overflow-hidden rounded-2xl bg-zinc-950/80 p-3 shadow-[0_14px_50px_rgba(0,0,0,0.35)] flex flex-col gap-3">
                <div className="mb-3 flex items-center justify-between text-white/70 text-sm">
                  <span className="flex items-center gap-2 uppercase tracking-[0.16em]">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M8 5l10 7-10 7V5z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Sistema Crédito
                  </span>
                </div>

                <div className="relative mx-auto aspect-[9/16] max-h-[300px] w-full overflow-hidden rounded-xl bg-gradient-to-b from-white/18 via-white/10 to-zinc-900">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black shadow-lg shadow-black/60">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5l11 7-11 7V5z" />
                      </svg>
                    </div>
                  </div>
                  <div className="absolute bottom-2 left-2 rounded-full border border-white/20 bg-black/65 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-white/80">
                    Sube tu video
                  </div>
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.18),transparent_52%)]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="nosotros" className="bg-black px-6 py-20 sm:px-10 lg:px-16 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10">
            <p className="text-xs uppercase tracking-[0.24em] text-white/60 sm:text-sm">Sobre Nosotros</p>
            <h2 className="mt-3 text-3xl font-light leading-[1.14] tracking-[0.05em] text-white sm:text-5xl">
              San Mérida: confianza,
              <br />
              trayectoria y crecimiento.
            </h2>
            <p className="mt-5 max-w-3xl text-base font-light leading-8 tracking-[0.03em] text-white/75 sm:text-lg">
              Somos una empresa enfocada en movilidad inteligente, con una propuesta profesional que combina modelos
              de alto valor, procesos transparentes y acompañamiento continuo para cada cliente.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <article className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5 sm:p-6">
              <div className="relative mb-6 overflow-hidden rounded-xl border border-white/10 bg-black">
                <div className="relative aspect-[16/10]">
                  <Image
                    src="/new-house.jpeg"
                    alt="Equipo y showroom San Mérida"
                    fill
                    sizes="(max-width: 1024px) 100vw, 900px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/20 to-transparent" />
              </div>

              <h3 className="text-2xl font-light tracking-[0.03em] text-white">Nuestra visión empresarial</h3>
              <p className="mt-4 text-base font-light leading-8 tracking-[0.02em] text-white/75">
                En San Mérida construimos relaciones a largo plazo. Nuestro objetivo es ofrecer planes claros,
                motocicletas confiables y una experiencia premium desde la asesoría inicial hasta la entrega final.
                Cada proceso está diseñado para brindar seguridad, respaldo y resultados reales.
              </p>
            </article>

            <div className="space-y-6">
              <article className="rounded-2xl border border-white/10 bg-zinc-950/70 p-6">
                <h3 className="text-xl font-light text-white">Lo que nos distingue</h3>
                <ul className="mt-5 space-y-4 text-white/75">
                  <li className="flex items-start gap-3">
                    <span className="mt-1 h-2 w-2 rounded-full bg-white/70" />
                    <span>Planes SAN y crédito con asesoría personalizada.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 h-2 w-2 rounded-full bg-white/70" />
                    <span>Proceso transparente con seguimiento en cada etapa.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 h-2 w-2 rounded-full bg-white/70" />
                    <span>Catálogo en constante actualización con marcas y modelos estratégicos.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 h-2 w-2 rounded-full bg-white/70" />
                    <span>Atención post-venta orientada a continuidad y fidelización.</span>
                  </li>
                </ul>
              </article>

              <article className="rounded-2xl border border-white/10 bg-zinc-950/70 p-6">
                <h3 className="text-xl font-light text-white">En cifras</h3>
                <div className="mt-5 grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-white/10 bg-black/50 px-3 py-4 text-center">
                    <p className="text-2xl font-light text-white">+10</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-white/55">Modelos</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/50 px-3 py-4 text-center">
                    <p className="text-2xl font-light text-white">2</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-white/55">Sistemas</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/50 px-3 py-4 text-center">
                    <p className="text-2xl font-light text-white">100%</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-white/55">Enfoque</p>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section id="testimonios" className="bg-black px-6 py-20 sm:px-10 lg:px-16 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10">
            <p className="text-xs uppercase tracking-[0.24em] text-white/60 sm:text-sm">Testimonios</p>
            <h2 className="mt-3 text-3xl font-light leading-[1.14] tracking-[0.05em] text-white sm:text-5xl">
              Historias reales de
              <br />
              clientes San Mérida.
            </h2>
            <p className="mt-5 max-w-3xl text-base font-light leading-8 tracking-[0.03em] text-white/75 sm:text-lg">
              Resultados, confianza y acompañamiento profesional en cada entrega.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {testimonios.map((testimonio) => (
              <article
                key={testimonio.nombre}
                className="rounded-2xl border border-white/10 bg-zinc-950/70 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
              >
                <p className="text-base font-light leading-8 tracking-[0.02em] text-white/80">“{testimonio.texto}”</p>
                <div className="mt-6 border-t border-white/10 pt-4">
                  <p className="text-lg font-light text-white">{testimonio.nombre}</p>
                  <p className="text-xs uppercase tracking-[0.14em] text-white/50">{testimonio.rol}</p>
                </div>
              </article>
            ))}
          </div>

          <div ref={catalogSectionRef} className="mt-14">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-white/55">Catálogo de videos</p>
                <h3 className="mt-2 text-2xl font-light text-white sm:text-3xl">Contenido en movimiento</h3>
              </div>
            </div>

            <div className="overflow-hidden pb-2">
              <div
                className="flex w-max will-change-transform animate-[videoMarquee_28s_linear_infinite]"
                style={{
                  animationPlayState: pausarVideos || !catalogSectionInView || isVideoOverlayOpen ? "paused" : "running",
                }}
              >
                {[0, 1].map((trackIndex) => (
                  <div key={trackIndex} className="flex shrink-0 gap-5">
                    {videosCatalogoBase.map((video, videoIndex) => (
                      <CatalogVideoCard
                        key={`${trackIndex}-${video.titulo}-${videoIndex}`}
                        video={video}
                        sectionActive={catalogSectionInView && !isVideoOverlayOpen}
                        onOpen={setCatalogVideoOpen}
                        onPauseMarquee={() => setPausarVideos(true)}
                        onResumeMarquee={() => setPausarVideos(false)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="metodos-pago" className="bg-black px-6 py-20 sm:px-10 lg:px-16 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10">
            <p className="text-xs uppercase tracking-[0.24em] text-white/60 sm:text-sm">Métodos de pago</p>
            <h2 className="mt-3 text-3xl font-light leading-[1.14] tracking-[0.05em] text-white sm:text-5xl">
              Elige cómo pagar
              <br />
              de forma simple y segura.
            </h2>
            <p className="mt-5 max-w-3xl text-base font-light leading-8 tracking-[0.03em] text-white/75 sm:text-lg">
              Ofrecemos múltiples opciones para que completes tu compra con rapidez, transparencia y respaldo.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <article className="rounded-2xl border border-white/10 bg-zinc-950/70 p-6">
              <h3 className="text-xl font-light text-white">Pagos flexibles para cada cliente</h3>
              <p className="mt-4 text-base font-light leading-8 tracking-[0.02em] text-white/75">
                En San Mérida adaptamos el proceso a tu realidad: puedes pagar de forma nacional o internacional,
                digital o presencial, manteniendo siempre un proceso ordenado y profesional.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-white/10 bg-black/50 px-3 py-4 text-center">
                  <p className="text-2xl font-light text-white">4</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.14em] text-white/55">Métodos</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/50 px-3 py-4 text-center">
                  <p className="text-2xl font-light text-white">24/7</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.14em] text-white/55">Atención</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/50 px-3 py-4 text-center">
                  <p className="text-2xl font-light text-white">100%</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.14em] text-white/55">Seguro</p>
                </div>
              </div>
            </article>

            <div
              ref={paymentSectionRef}
              className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/70 p-4"
              onMouseEnter={() => setPausarMetodos(true)}
              onMouseLeave={() => setPausarMetodos(false)}
            >
              <div
                className="flex w-max gap-4 will-change-transform animate-[videoMarquee_20s_linear_infinite]"
                style={{
                  animationPlayState:
                    pausarMetodos || !paymentSectionInView || isVideoOverlayOpen ? "paused" : "running",
                }}
              >
                {[0, 1].map((trackIndex) => (
                  <div key={trackIndex} className="flex shrink-0 gap-4">
                    {metodosPagoBase.map((metodo, index) => (
                      <article
                        key={`${trackIndex}-${metodo.nombre}-${index}`}
                        className="w-[170px] rounded-xl border border-white/10 bg-black/60 p-3"
                      >
                        <div className="relative mb-3 h-24 overflow-hidden rounded-lg bg-black">
                          <Image
                            src={metodo.imagen}
                            alt={metodo.nombre}
                            fill
                            sizes="170px"
                            className="object-contain p-2"
                            unoptimized
                          />
                        </div>
                        <p className="text-sm uppercase tracking-[0.14em] text-white/80">{metodo.nombre}</p>
                        <p className="mt-1 text-xs text-white/55">{metodo.detalle}</p>
                      </article>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-black px-6 py-20 sm:px-10 lg:px-16 lg:py-24">
        <div className="mx-auto max-w-7xl rounded-3xl border border-white/10 bg-zinc-950/70 p-6 sm:p-10">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black p-6">
              <div className="relative mx-auto h-28 w-full max-w-[260px]">
                <Image
                  src="/Logo.png"
                  alt="Logo corporativo San Mérida"
                  fill
                  sizes="260px"
                  className="object-contain"
                  unoptimized
                />
              </div>
              <div className="mt-6 space-y-3 text-center">
                <p className="text-xs uppercase tracking-[0.2em] text-white/55">Identidad empresarial</p>
                <p className="text-sm leading-7 text-white/70">
                  Marca enfocada en movilidad, confianza operativa y crecimiento sostenible.
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-white/60 sm:text-sm">Propuesta de valor</p>
              <h2 className="mt-3 text-3xl font-light leading-[1.14] tracking-[0.05em] text-white sm:text-5xl">
                Con San Mérida puedes hacer
                <br />
                tus sueños realidad.
              </h2>
              <p className="mt-6 max-w-3xl text-base font-light leading-8 tracking-[0.03em] text-white/75 sm:text-lg">
                Diseñamos experiencias de compra con estructura empresarial: acompañamiento profesional,
                múltiples sistemas de adquisición, pagos flexibles y procesos transparentes que transforman metas
                personales en resultados reales.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-black/55 p-4">
                  <p className="text-sm uppercase tracking-[0.14em] text-white/55">Asesoría</p>
                  <p className="mt-2 text-lg font-light text-white">Personalizada</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/55 p-4">
                  <p className="text-sm uppercase tracking-[0.14em] text-white/55">Procesos</p>
                  <p className="mt-2 text-lg font-light text-white">Claros y seguros</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/55 p-4">
                  <p className="text-sm uppercase tracking-[0.14em] text-white/55">Resultado</p>
                  <p className="mt-2 text-lg font-light text-white">Entrega efectiva</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="ubicacion" className="bg-black px-6 py-20 sm:px-10 lg:px-16 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10">
            <p className="text-xs uppercase tracking-[0.24em] text-white/60 sm:text-sm">Ubicación real</p>
            <h2 className="mt-3 text-3xl font-light leading-[1.14] tracking-[0.05em] text-white sm:text-5xl">
              Encuéntranos en Mérida,
              <br />
              con mapa en tiempo real.
            </h2>
            <p className="mt-5 max-w-3xl text-base font-light leading-8 tracking-[0.03em] text-white/75 sm:text-lg">
              Integramos Google Maps para que llegues de forma directa, con referencia exacta y acceso inmediato a la
              ruta de navegación.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4 sm:p-5">
            <div className="overflow-hidden rounded-xl border border-white/10">
              <iframe
                title="Ubicación San Mérida"
                src="https://www.google.com/maps?q=RQGQ%2B754%2C%20T%C3%A1riba%2C%20T%C3%A1chira&output=embed"
                className="h-[320px] w-full sm:h-[420px] lg:h-[500px]"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/50 px-4 py-3">
              <div>
                <p className="text-sm uppercase tracking-[0.14em] text-white/55">Dirección</p>
                <p className="mt-1 text-base font-light text-white/85">RQGQ+754, Táriba, Táchira</p>
              </div>
              <a
                href="https://maps.google.com/?q=RQGQ%2B754%2C%20T%C3%A1riba%2C%20T%C3%A1chira"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm text-white/85 transition hover:border-white/40 hover:bg-white/10"
              >
                Abrir en Google Maps
                <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="bg-black px-6 py-20 sm:px-10 lg:px-16 lg:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 flex flex-col items-center text-center">
            <div className="relative mb-4 h-12 w-12 overflow-hidden rounded-full border border-white/20 bg-black">
              <Image
                src="/logominimal.png"
                alt="Logo San Mérida"
                fill
                sizes="48px"
                className="object-contain p-1"
                unoptimized
              />
            </div>
            <p className="text-xs uppercase tracking-[0.24em] text-white/55">Preguntas frecuentes</p>
            <h2 className="mt-3 text-3xl font-light leading-[1.14] tracking-[0.04em] text-white sm:text-5xl">
              ¿Tienes dudas?
              <br />
              En San Mérida te las aclaramos.
            </h2>
            <p className="mt-5 max-w-3xl text-base font-light leading-8 tracking-[0.03em] text-white/75 sm:text-lg">
              Información clara para que tomes decisiones con seguridad y avances en tu proceso de compra sin fricción.
            </p>
          </div>

          <div className="space-y-4">
            {[
              {
                pregunta: "¿Cómo funciona el sistema SAN?",
                respuesta:
                  "Te registras, eliges tu plan, validamos tus datos y participas en el proceso rotativo con acompañamiento profesional hasta la entrega de tu moto.",
              },
              {
                pregunta: "¿Qué necesito para iniciar el proceso?",
                respuesta:
                  "Documento de identidad vigente, datos de contacto y la selección del modelo o plan. Nuestro equipo te guía en cada requisito según el sistema elegido.",
              },
              {
                pregunta: "¿Puedo financiar por crédito tradicional?",
                respuesta:
                  "Sí. San Mérida ofrece opción de crédito con evaluación personalizada, cuotas adaptadas y seguimiento continuo hasta la formalización.",
              },
              {
                pregunta: "¿Cuáles métodos de pago aceptan?",
                respuesta:
                  "Actualmente trabajamos con Binance, Pago Móvil, Zelle y efectivo, asegurando alternativas nacionales e internacionales para mayor comodidad.",
              },
              {
                pregunta: "¿Dónde están ubicados y cómo llegar?",
                respuesta:
                  "Contamos con ubicación visible en Google Maps dentro del sitio. Desde allí puedes abrir la ruta directamente para llegar a nuestra sede.",
              },
              {
                pregunta: "¿Qué incluye el acompañamiento post-venta?",
                respuesta:
                  "Seguimiento de entrega, orientación operativa inicial y canal de soporte para resolver dudas técnicas o administrativas relacionadas al proceso.",
              },
            ].map((item) => (
              <details
                key={item.pregunta}
                className="group rounded-2xl border border-white/10 bg-zinc-950/60 px-5 py-4 transition duration-300 open:border-white/25"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-lg font-light text-white/90 marker:content-none">
                  <span>{item.pregunta}</span>
                  <span className="text-white/50 transition group-open:rotate-45 group-open:text-white">+</span>
                </summary>
                <p className="mt-3 max-w-4xl text-base font-light leading-8 tracking-[0.02em] text-white/70">
                  {item.respuesta}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section id="contacto" className="bg-black px-6 py-20 sm:px-10 lg:px-16 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10">
            <p className="text-xs uppercase tracking-[0.24em] text-white/60 sm:text-sm">Contacto</p>
            <h2 className="mt-3 text-3xl font-light leading-[1.14] tracking-[0.05em] text-white sm:text-5xl">
              Conecta con San Mérida
              <br />
              por el canal que prefieras.
            </h2>
            <p className="mt-5 max-w-3xl text-base font-light leading-8 tracking-[0.03em] text-white/75 sm:text-lg">
              Atención comercial, soporte y redes oficiales en un solo lugar para brindarte respuesta rápida y profesional.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
            <article className="rounded-2xl border border-white/10 bg-zinc-950/70 p-6 sm:p-8">
              <h3 className="text-2xl font-light text-white">Contacto general</h3>
              <p className="mt-2 text-white/65">Escríbenos para asesoría comercial, planes y disponibilidad de modelos.</p>

              <form className="mt-6 space-y-4" onSubmit={handleContactSubmit}>
                <input
                  type="text"
                  value={contactForm.nombre}
                  onChange={(event) => handleContactChange("nombre", event.target.value)}
                  placeholder="Nombre"
                  autoComplete="name"
                  required
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-white placeholder:text-white/35 outline-none transition focus:border-white/30"
                />
                <input
                  type="email"
                  value={contactForm.email}
                  onChange={(event) => handleContactChange("email", event.target.value)}
                  placeholder="Email"
                  autoComplete="email"
                  required
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-white placeholder:text-white/35 outline-none transition focus:border-white/30"
                />
                <textarea
                  rows={5}
                  value={contactForm.mensaje}
                  onChange={(event) => handleContactChange("mensaje", event.target.value)}
                  placeholder="Mensaje"
                  required
                  className="w-full resize-none rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-white placeholder:text-white/35 outline-none transition focus:border-white/30"
                />

                {contactError ? (
                  <p className="text-sm text-red-300/95">{contactError}</p>
                ) : null}
                {contactSuccess ? (
                  <p className="text-sm text-emerald-300/95">Redirigido a WhatsApp con tu solicitud.</p>
                ) : null}

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="submit"
                    className="inline-flex items-center rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90"
                  >
                    Enviar mensaje
                  </button>
                  <a
                    href={`https://wa.me/${WHATSAPP_PHONE}?text=Hola%20San%20M%C3%A9rida%2C%20quiero%20informaci%C3%B3n%20de%20modelos`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-full border border-white/20 px-5 py-2.5 text-sm text-white/85 transition hover:border-white/35 hover:bg-white/5"
                  >
                    Ir a WhatsApp
                  </a>
                </div>
              </form>
            </article>

            <article className="rounded-2xl border border-white/10 bg-zinc-950/70 p-6 sm:p-8">
              <h3 className="text-2xl font-light text-white">Canales directos</h3>
              <p className="mt-2 text-white/65">Respuesta por teléfono, WhatsApp y redes oficiales.</p>

              <div className="mt-6 space-y-4">
                <a
                  href={`https://wa.me/${WHATSAPP_PHONE}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/50 px-4 py-3 transition hover:border-white/25"
                >
                  <Image src="/Whatsapp.png" alt="WhatsApp" width={22} height={22} unoptimized />
                  <div>
                    <p className="text-sm uppercase tracking-[0.14em] text-white/55">WhatsApp</p>
                    <p className="text-white/85">+58 414 000 0000</p>
                  </div>
                </a>

                <a
                  href={`tel:+${WHATSAPP_PHONE}`}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/50 px-4 py-3 transition hover:border-white/25"
                >
                  <Image src="/Telefono.png" alt="Teléfono" width={22} height={22} unoptimized />
                  <div>
                    <p className="text-sm uppercase tracking-[0.14em] text-white/55">Teléfono</p>
                    <p className="text-white/85">+58 414 000 0000</p>
                  </div>
                </a>

                <div className="rounded-xl border border-white/10 bg-black/50 p-4">
                  <p className="mb-3 text-sm uppercase tracking-[0.14em] text-white/55">Redes sociales</p>
                  <div className="flex items-center gap-3">
                    <a href="#" className="inline-flex rounded-full border border-white/15 bg-black/60 p-2.5 transition hover:border-white/30">
                      <Image src="/instagram.png" alt="Instagram" width={18} height={18} unoptimized />
                    </a>
                    <a href="#" className="inline-flex rounded-full border border-white/15 bg-black/60 p-2.5 transition hover:border-white/30">
                      <Image src="/facebook.png" alt="Facebook" width={18} height={18} unoptimized />
                    </a>
                    <a href="#" className="inline-flex rounded-full border border-white/15 bg-black/60 p-2.5 transition hover:border-white/30">
                      <Image src="/Tiktok.png" alt="TikTok" width={18} height={18} unoptimized />
                    </a>
                  </div>
                  <p className="mt-3 text-sm text-white/65">@sanmeridadejesuszambrano</p>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <footer className="bg-black px-6 pb-10 pt-16 sm:px-10 lg:px-16 lg:pt-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 border-t border-white/10 pt-12 md:grid-cols-[1fr_1fr_1fr_1fr]">
            <div>
              <div className="relative h-14 w-40">
                <Image
                  src="/Logo.png"
                  alt="Logo San Mérida"
                  fill
                  sizes="160px"
                  className="object-contain object-left"
                  unoptimized
                />
              </div>
              <p className="mt-4 max-w-xs text-sm leading-7 text-white/60">
                Movilidad inteligente con enfoque profesional, procesos claros y respaldo real.
              </p>
            </div>

            <div>
              <h3 className="text-sm uppercase tracking-[0.16em] text-white/70">Empresa</h3>
              <ul className="mt-4 space-y-3 text-white/60">
                <li><a href="#nosotros" className="transition hover:text-white">Nosotros</a></li>
                <li><a href="#modelos" className="transition hover:text-white">Modelos</a></li>
                <li><a href="#metodos-pago" className="transition hover:text-white">Métodos de pago</a></li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm uppercase tracking-[0.16em] text-white/70">Soporte</h3>
              <ul className="mt-4 space-y-3 text-white/60">
                <li><a href="#faq" className="transition hover:text-white">Preguntas frecuentes</a></li>
                <li><a href="#ubicacion" className="transition hover:text-white">Ubicación</a></li>
                <li><a href="#contacto" className="transition hover:text-white">Contacto</a></li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm uppercase tracking-[0.16em] text-white/70">Síguenos</h3>
              <div className="mt-4 flex items-center gap-3">
                <a href="#" className="inline-flex rounded-full border border-white/15 bg-black/60 p-2.5 transition hover:border-white/30">
                  <Image src="/instagram.png" alt="Instagram" width={16} height={16} unoptimized />
                </a>
                <a href="#" className="inline-flex rounded-full border border-white/15 bg-black/60 p-2.5 transition hover:border-white/30">
                  <Image src="/facebook.png" alt="Facebook" width={16} height={16} unoptimized />
                </a>
                <a href="#" className="inline-flex rounded-full border border-white/15 bg-black/60 p-2.5 transition hover:border-white/30">
                  <Image src="/Tiktok.png" alt="TikTok" width={16} height={16} unoptimized />
                </a>
              </div>
              <p className="mt-4 text-sm text-white/55">@sanmeridadejesuszambrano</p>
            </div>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-sm text-white/45">
            <p>© {new Date().getFullYear()} San Mérida. Todos los derechos reservados.</p>
            <div className="flex items-center gap-4">
              <a href="#" className="transition hover:text-white/75">Términos</a>
              <a href="#" className="transition hover:text-white/75">Privacidad</a>
              <a href="#" className="transition hover:text-white/75">Mapa del sitio</a>
            </div>
          </div>
        </div>
      </footer>

      {catalogVideoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <div className="relative w-full max-w-[460px] rounded-2xl border border-white/10 bg-black/95 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.55)]">
            <button
              type="button"
              onClick={() => setCatalogVideoOpen(null)}
              className="absolute right-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white hover:bg-white/20"
              aria-label="Cerrar video"
            >
              ×
            </button>

            <p className="mb-3 text-xs uppercase tracking-[0.16em] text-white/65">{catalogVideoOpen.titulo}</p>

            <div className="relative mx-auto aspect-[9/16] w-full max-w-[300px] overflow-hidden rounded-xl bg-black max-h-[62vh]">
              <video
                key={catalogVideoOpen.src}
                className="absolute inset-0 h-full w-full object-cover"
                src={catalogVideoOpen.src}
                autoPlay
                controls
                playsInline
                preload="metadata"
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
