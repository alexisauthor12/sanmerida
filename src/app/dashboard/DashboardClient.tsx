"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { 
  Home, 
  BookOpen, 
  Bike, 
  CalendarDays, 
  Rss, 
  ShieldCheck, 
  LogOut, 
  Bell, 
  Search, 
  ChevronRight,
  TrendingUp,
  Activity,
  Zap,
  CarFront,
  Smartphone
} from "lucide-react";
import { MOTOS } from "@/data/motos";
import NoticiasView from "./NoticiasView";

type User = {
  userId?: string;
  email: string;
  nombre: string;
  isMember: boolean;
};

const API_BASE =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? ""
    : process.env.NEXT_PUBLIC_API_BASE || "";

// --- Sub-vistas ---

type SessionStatus = {
  ok?: boolean;
  authenticated?: boolean;
  role?: "guest" | "member" | "account";
  adminValidated?: boolean;
  adminTotalAccess?: boolean;
};

function BienvenidaView({ user }: { user: User }) {
  const [estado, setEstado] = useState<SessionStatus | null>(null);
  const [errorEstado, setErrorEstado] = useState(false);

  // El estado de la sesion (y si la licencia administrativa esta validada) viene
  // del endpoint real `/api/auth/session-status`: nunca se asume en el cliente.
  useEffect(() => {
    let activo = true;

    fetch(`${API_BASE}/api/auth/session-status`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: SessionStatus) => {
        if (activo && data.ok) setEstado(data);
      })
      .catch(() => {
        if (activo) setErrorEstado(true);
      });

    return () => {
      activo = false;
    };
  }, []);

  const licencia = errorEstado
    ? "No se pudo consultar"
    : estado === null
      ? "Consultando…"
      : estado.adminValidated
        ? "Validada"
        : "No validada";

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8 rounded-2xl bg-gradient-to-r from-zinc-900 to-black p-8 border border-white/10 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
        <h2 className="text-3xl font-light text-white relative z-10">Hola, {user.nombre}</h2>
        <p className="text-white/60 mt-2 relative z-10 max-w-xl">
          Este es el panel de gestión de San Mérida. Desde aquí revisas el catálogo corporativo, las
          novedades del equipo y el acceso administrativo a los expedientes.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
        <div className="bg-zinc-950/50 border border-white/5 p-6 rounded-2xl hover:bg-zinc-900/50 transition">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-blue-500/10 text-blue-400 rounded-lg">
              <Activity size={24} />
            </div>
            <div>
              <p className="text-sm text-white/50 uppercase tracking-wider">Estado de la sesión</p>
              <p className="text-white font-medium">
                {estado?.authenticated ? "Sesión activa" : "Verificando…"}
              </p>
            </div>
          </div>
          <p className="text-sm text-white/60">
            Licencia administrativa: <span className="text-white">{licencia}</span>.
          </p>
        </div>

        <div className="bg-zinc-950/50 border border-white/5 p-6 rounded-2xl hover:bg-zinc-900/50 transition">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-sm text-white/50 uppercase tracking-wider">Catálogo</p>
              <p className="text-white font-medium">{MOTOS.length} modelos cargados</p>
            </div>
          </div>
          <p className="text-sm text-white/60">
            Los precios y el plan de financiamiento de cada modelo se configuran desde el panel admin.
          </p>
        </div>

        <div className="bg-zinc-950/50 border border-white/5 p-6 rounded-2xl hover:bg-zinc-900/50 transition">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-amber-500/10 text-amber-400 rounded-lg">
              <Zap size={24} />
            </div>
            <div>
              <p className="text-sm text-white/50 uppercase tracking-wider">Nivel de Cuenta</p>
              <p className="text-white font-medium">{user.isMember ? "Miembro TEAM SAN" : "Usuario Estándar"}</p>
            </div>
          </div>
          <p className="text-sm text-white/60">
            {user.isMember
              ? "Tu cuenta está vinculada a un expediente de miembro."
              : "Con la licencia administrativa gestionas expedientes, cuotas y novedades."}
          </p>
        </div>
      </div>
      
      <div className="bg-black border border-white/10 rounded-2xl p-6">
        <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
          <ChevronRight size={18} className="text-white/40"/> Progreso de Solicitud
        </h3>
        <div className="relative pt-4 pb-8">
          <div className="absolute top-8 left-4 bottom-0 w-px bg-white/10"></div>
          <ul className="space-y-6 relative pl-10">
            <li>
              <div className="absolute left-[-5px] top-1 w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]"></div>
              <p className="text-sm text-white/50">Completado</p>
              <p className="text-white font-medium">Registro completado</p>
              <p className="text-sm text-white/60">
                Tu cuenta {user.email} está activa en el sistema.
              </p>
            </li>
            <li className="opacity-50">
              <div className="absolute left-[-4px] top-1 w-3 h-3 rounded-full border-2 border-white/30 bg-black"></div>
              <p className="text-sm text-white/50">Pendiente</p>
              <p className="text-white font-medium">Selección de Modelo</p>
              <p className="text-sm text-white/60">Explora el catálogo y elige tu vehículo ideal.</p>
            </li>
            <li className="opacity-50">
              <div className="absolute left-[-4px] top-1 w-3 h-3 rounded-full border-2 border-white/30 bg-black"></div>
              <p className="text-sm text-white/50">Pendiente</p>
              <p className="text-white font-medium">Evaluación Financiera</p>
              <p className="text-sm text-white/60">Configura tu método y plazos de pago.</p>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function CatalogosView({ onExplorarModelos }: { onExplorarModelos: () => void }) {
  // Solo SAN Motos tiene catálogo cargado hoy. Las otras dos divisiones se
  // muestran marcadas como "en preparación" en vez de simular contenido.
  const catalogos = [
    {
      titulo: "SAN Motos",
      desc: "Autonomía y eficiencia para ciudad. Scooters, urbanas y deportivas bajo el sello San Mérida.",
      icon: <Bike size={32} className="text-white/80" />,
      img: "/ek-xpress.png",
      color: "from-zinc-800 to-black",
      disponible: true,
      detalle: `${MOTOS.length} modelos cargados`,
    },
    {
      titulo: "SAN Carros",
      desc: "Nuevas alternativas de movilidad a cuatro ruedas. Seguridad, confort y bajo consumo.",
      icon: <CarFront size={32} className="text-white/80" />,
      img: "",
      color: "from-blue-950/40 to-black",
      disponible: false,
      detalle: "División en preparación",
    },
    {
      titulo: "SAN Tecnología",
      desc: "Ecosistema interconectado. Gadgets, hardware de rastreo y accesorios inteligentes.",
      icon: <Smartphone size={32} className="text-white/80" />,
      img: "",
      color: "from-purple-950/40 to-black",
      disponible: false,
      detalle: "División en preparación",
    }
  ];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-2xl font-light text-white mb-2">Catálogos Corporativos</h2>
      <p className="text-white/60 mb-8 max-w-2xl">
        Explora nuestras tres divisiones principales. Cada una estructurada para ofrecerte los mejores productos bajo nuestros planes de financiamiento directos.
      </p>

      <div className="grid gap-6 lg:grid-cols-3">
        {catalogos.map((cat, i) => (
          <div key={i} className="group relative rounded-2xl overflow-hidden border border-white/10 bg-zinc-950/50 hover:border-white/30 transition duration-500">
            <div className={`absolute inset-0 bg-gradient-to-b ${cat.color} opacity-50`}></div>
            <div className="p-8 relative z-10 h-full flex flex-col">
              <div className="mb-6 p-4 rounded-xl bg-white/5 w-fit border border-white/10 group-hover:scale-110 transition-transform">
                {cat.icon}
              </div>
              <h3 className="text-xl font-medium text-white mb-3">{cat.titulo}</h3>
              <p className="text-white/60 text-sm leading-relaxed mb-8 flex-1">{cat.desc}</p>
              
              <div className="relative h-40 w-full mb-6 flex items-center justify-center">
                {cat.img ? (
                  <Image
                    src={cat.img}
                    alt={cat.titulo}
                    fill
                    className={
                      cat.disponible
                        ? "object-contain drop-shadow-2xl group-hover:scale-105 transition duration-700"
                        : "object-contain opacity-30 grayscale"
                    }
                  />
                ) : (
                  <p className="text-sm text-white/30">{cat.detalle}</p>
                )}
              </div>

              {cat.disponible ? (
                <button
                  onClick={onExplorarModelos}
                  className="w-full py-3 rounded-lg border border-white/20 bg-black/50 text-sm text-white/90 hover:bg-white hover:text-black transition"
                >
                  Ver los {MOTOS.length} modelos
                </button>
              ) : (
                <div className="w-full py-3 rounded-lg border border-white/10 bg-black/40 text-center text-sm text-white/40">
                  {cat.detalle}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModelosView({ busqueda }: { busqueda: string }) {
  const carruselRef = useRef<HTMLDivElement>(null);

  // La busqueda del encabezado filtra el catalogo real (`MOTOS`): no hay datos
  // de disponibilidad simulados.
  const modelos = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();

    if (!termino) return MOTOS;

    return MOTOS.filter((moto) =>
      [moto.nombre, moto.categoria, moto.descripcion, moto.motor, moto.transmision]
        .join(" ")
        .toLowerCase()
        .includes(termino),
    );
  }, [busqueda]);

  const mover = (direccion: "next" | "prev") => {
    const container = carruselRef.current;
    if (!container) return;
    const card = container.querySelector<HTMLElement>("[data-model-card='true']");
    if (!card) return;
    const step = card.offsetWidth + 24;
    const delta = direccion === "next" ? step : -step;
    container.scrollBy({ left: delta, behavior: "smooth" });
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 h-full flex flex-col">
      <div className="flex flex-wrap items-end justify-between mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-light text-white mb-2">Flota de Modelos</h2>
          <p className="text-white/60">
            Catálogo vigente de nuestra línea Moto ({modelos.length} de {MOTOS.length} modelos).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => mover("prev")} className="h-10 w-10 flex items-center justify-center rounded-full border border-white/20 hover:bg-white/10 transition">←</button>
          <button onClick={() => mover("next")} className="h-10 w-10 flex items-center justify-center rounded-full border border-white/20 hover:bg-white/10 transition">→</button>
        </div>
      </div>

      <div 
        ref={carruselRef}
        className="flex snap-x snap-mandatory gap-6 overflow-x-auto pb-6 [scrollbar-width:thin] scroll-smooth flex-1"
      >
        {modelos.length === 0 ? (
          <p className="text-sm text-white/50">
            No hay modelos que coincidan con «{busqueda}». Prueba con otro término.
          </p>
        ) : null}
        {modelos.map((modelo) => (
          <div 
            key={modelo.slug} 
            data-model-card="true"
            className="group min-w-[300px] sm:min-w-[340px] snap-start rounded-2xl border border-white/10 bg-zinc-950/80 p-5 hidden-scrollbar transition duration-300 hover:border-white/30 flex flex-col"
          >
            <div className="relative mb-5 flex h-48 w-full items-center justify-center overflow-hidden rounded-xl bg-gradient-to-t from-zinc-900 to-black border border-white/5">
              <Image
                src={modelo.imagen}
                alt={modelo.nombre}
                fill
                className="object-contain p-4 drop-shadow-xl group-hover:scale-110 transition duration-700"
                unoptimized
              />
              <div className="absolute top-3 left-3 bg-white/10 backdrop-blur-md border border-white/10 rounded-full px-3 py-1 text-xs text-white">
                {modelo.categoria}
              </div>
            </div>
            
            <h3 className="text-xl font-medium text-white mb-2">{modelo.nombre}</h3>
            <p className="text-sm text-white/50 mb-4 flex-1">{modelo.descripcion}</p>
            
            <div className="space-y-2 mb-6">
              <div className="flex justify-between text-xs border-b border-white/5 pb-2">
                <span className="text-white/40">Motor</span>
                <span className="text-white/80">{modelo.motor}</span>
              </div>
              <div className="flex justify-between text-xs border-b border-white/5 pb-2">
                <span className="text-white/40">Transmisión</span>
                <span className="text-white/80">{modelo.transmision}</span>
              </div>
            </div>

            <Link
              href={`/modelos/${modelo.slug}`}
              className="block w-full py-2.5 rounded-lg bg-white text-black font-medium text-sm text-center hover:bg-white/90 transition"
            >
              Ver ficha del modelo
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

function EventosView() {
  // Los eventos son publicaciones REALES del feed con la categoria "Eventos":
  // el equipo los crea desde el panel admin y aqui se muestran tal cual.
  return (
    <NoticiasView
      categoria="Eventos"
      titulo="Eventos y Convocatorias"
      descripcion="Eventos y convocatorias publicados por el equipo San Mérida."
      mensajeVacio="Todavía no hay eventos publicados. El equipo los publica con la categoría «Eventos»."
    />
  );
}

function MiembroView() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
      <div className="text-center mb-10">
        <ShieldCheck size={48} className="mx-auto text-yellow-500 mb-4" />
        <h2 className="text-3xl font-light text-white mb-3">Únete al TEAM SAN Exclusivo</h2>
        <p className="text-white/60 text-lg">
          Eleva tu categoría y desbloquea herramientas empresariales avanzadas, tasas preferenciales y atención prioritaria.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="p-8 rounded-2xl border border-white/10 bg-zinc-950/80">
          <h3 className="text-white text-xl font-medium mb-6">Usuario Estándar</h3>
          <ul className="space-y-4 mb-8">
            <li className="text-sm text-white/50 flex items-center gap-3"><div className="w-1.5 h-1.5 rounded-full bg-white/20"></div> Acceso a catálogos básicos</li>
            <li className="text-sm text-white/50 flex items-center gap-3"><div className="w-1.5 h-1.5 rounded-full bg-white/20"></div> Tiempos de respuesta (24-48h)</li>
            <li className="text-sm text-white/50 flex items-center gap-3"><div className="w-1.5 h-1.5 rounded-full bg-white/20"></div> Financiamiento estándar</li>
          </ul>
          <div className="px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-center text-white/60 text-sm">
            Tu plan actual
          </div>
        </div>

        <div className="p-8 rounded-2xl border border-yellow-500/30 bg-gradient-to-b from-yellow-950/20 to-black relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-yellow-500 text-black text-xs font-bold px-3 py-1 rounded-bl-lg">RECOMENDADO</div>
          <h3 className="text-yellow-500 text-xl font-medium mb-6">Miembro TEAM SAN</h3>
          <ul className="space-y-4 mb-8">
            <li className="text-sm text-white/80 flex items-center gap-3"><div className="w-1.5 h-1.5 rounded-full bg-yellow-500"></div> Acceso a flota corporativa oculta</li>
            <li className="text-sm text-white/80 flex items-center gap-3"><div className="w-1.5 h-1.5 rounded-full bg-yellow-500"></div> Gestor de cuenta dedicado</li>
            <li className="text-sm text-white/80 flex items-center gap-3"><div className="w-1.5 h-1.5 rounded-full bg-yellow-500"></div> Aprobación crediticia express (4h)</li>
            <li className="text-sm text-white/80 flex items-center gap-3"><div className="w-1.5 h-1.5 rounded-full bg-yellow-500"></div> Mantenimientos prioritarios</li>
          </ul>
          <Link
            href="/register-member"
            className="block w-full py-3 rounded-lg bg-yellow-500 text-center text-black font-semibold hover:bg-yellow-400 transition shadow-[0_0_15px_rgba(234,179,8,0.3)]"
          >
            Abrir registro de miembros
          </Link>
        </div>
      </div>
    </div>
  );
}

// --- Layout Principal ---

export default function DashboardClient({ user }: { user: User }) {
  const [activeTab, setActiveTab] = useState("inicio");
  const [busqueda, setBusqueda] = useState("");

  const navItems = [
    { id: "inicio", label: "Bienvenida", icon: Home },
    { id: "catalogos", label: "Catálogos", icon: BookOpen },
    { id: "modelos", label: "Modelos", icon: Bike },
    { id: "eventos", label: "Eventos", icon: CalendarDays },
    { id: "noticias", label: "Noticias", icon: Rss },
    { id: "miembro", label: "Ser Miembro", icon: ShieldCheck },
  ];

  return (
    <div className="flex h-screen bg-[#020408] text-white overflow-hidden selection:bg-white/20">
      {/* Sidebar Lateral */}
      <aside className="w-64 border-r border-white/5 bg-black flex-shrink-0 flex flex-col hidden md:flex">
        <div className="h-20 flex items-center px-6 border-b border-white/5">
          <Image src="/Logo.png" alt="San Mérida" width={140} height={60} className="w-auto h-8" priority />
        </div>
        
        <div className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
          <p className="px-3 text-xs font-semibold text-white/30 uppercase tracking-[0.15em] mb-4 mt-2">Menú Principal</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                  isActive 
                    ? "bg-white text-black shadow-lg" 
                    : "text-white/60 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon size={18} className={isActive ? "text-black" : "text-white/40"} />
                {item.label}
              </button>
            )
          })}
        </div>

        <div className="p-4 border-t border-white/5">
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/50 hover:bg-red-500/10 hover:text-red-400 transition-colors"
            >
              <LogOut size={18} />
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      {/* Contenido Principal */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Barra superior (Top Bar) */}
        <header className="h-20 border-b border-white/5 bg-black/40 backdrop-blur-md flex items-center justify-between px-6 lg:px-10 flex-shrink-0 z-10">
          <div className="flex items-center w-full max-w-md bg-zinc-950 border border-white/10 rounded-lg px-3 py-2">
            <Search size={16} className="text-white/30" />
            <input 
              type="text" 
              placeholder="Buscar modelos del catálogo…" 
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              aria-label="Buscar modelos del catálogo"
              className="bg-transparent border-none outline-none text-sm text-white px-3 w-full placeholder:text-white/30"
            />
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              aria-label="Notificaciones"
              className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/5 transition"
            >
              <Bell size={18} />
            </button>
            
            <div className="flex items-center gap-3 pl-4 border-l border-white/10">
              <div className="w-9 h-9 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-semibold text-sm">
                {user.nombre.charAt(0)}{user.email.charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-white leading-none">{user.nombre}</p>
                <p className="text-xs text-white/40 mt-1">Mi Cuenta</p>
              </div>
            </div>
          </div>
        </header>

        {/* Área de visualización */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-10 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-track]:bg-transparent">
          {activeTab === "inicio" && <BienvenidaView user={user} />}
          {activeTab === "catalogos" && (
            <CatalogosView onExplorarModelos={() => setActiveTab("modelos")} />
          )}
          {activeTab === "modelos" && <ModelosView busqueda={busqueda} />}
          {activeTab === "eventos" && <EventosView />}
          {activeTab === "noticias" && <NoticiasView />}
          {activeTab === "miembro" && <MiembroView />}
        </div>
      </main>
    </div>
  );
}
