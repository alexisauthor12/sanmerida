"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";

const STEPS = [
  {
    id: "01",
    title: "CONTACTO INICIAL",
    subtitle: "ASESORÍA PERSONALIZADA",
    description: "Inicia tu camino con una consulta directa. Nuestro equipo evalúa tu perfil y te guía hacia la mejor opción de financiamiento o compra directa.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    ),
    image: "/logominimal.png",
  },
  {
    id: "02",
    title: "REQUISITOS Y FIRMA",
    subtitle: "FORMALIZACIÓN LEGAL",
    description: "Transparencia total. Consignas los documentos básicos, validamos tu elegibilidad y firmamos el contrato de participación con todas las garantías de ley.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    image: "/ek-xpress-ii.png",
  },
  {
    id: "03",
    title: "INGRESO A RUEDA",
    subtitle: "SISTEMA ROTATIVO",
    description: "Tu cupo es asignado en nuestra plataforma. Cada semana el sistema gira, acercándote a tu meta con tecnología auditada y resultados públicos.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3" className="opacity-30" />
      </svg>
    ),
    image: "/house-rl.png",
  },
  {
    id: "04",
    title: "ENTREGA DE UNIDAD",
    subtitle: "PROPIEDAD GARANTIZADA",
    description: "El momento final. Recibes tu motocicleta 0km con documentación a tu nombre, garantía de fábrica y el respaldo post-venta de San Mérida.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    image: "/Owen 200S.png",
  },
];

export default function ProcessCarousel() {
  const [activeStep, setActiveStep] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const progressRef = useRef(0);

  useEffect(() => {
    if (!isAutoPlaying) return;

    const timer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % STEPS.length);
      progressRef.current = 0;
    }, 6000); 

    return () => clearInterval(timer);
  }, [isAutoPlaying]);

  return (
    <section className="bg-black py-24 sm:py-32 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10">
        
        <div className="flex flex-col lg:flex-row gap-16 lg:gap-24">
          
          {/* Left Side: Navigation & Timeline */}
          <div className="lg:w-1/3 flex flex-col justify-center">
            <div className="mb-12">
               <span className="inline-block py-1 px-3 rounded border border-white/20 bg-white/5 text-xs font-mono text-white/70 tracking-widest mb-4">
                PROCESO 2026
               </span>
              <h2 className="text-3xl sm:text-4xl font-light text-white tracking-tight leading-tight">
                Flujo de <br />
                <span className="font-semibold text-white/90">Participación</span>
              </h2>
            </div>

            <div className="relative space-y-6">
              {/* Vertical line connecting steps */}
              <div className="absolute left-[19px] top-4 bottom-4 w-px bg-white/10" />

              {STEPS.map((step, index) => (
                <button
                  key={step.id}
                  onClick={() => {
                    setActiveStep(index);
                    setIsAutoPlaying(false);
                  }}
                  className={`group relative flex items-center gap-6 w-full text-left transition-all duration-300 ${
                    activeStep === index ? "opacity-100 scale-100" : "opacity-40 hover:opacity-70 scale-95"
                  }`}
                >
                  <div
                    className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-all duration-500 ${
                      activeStep === index
                        ? "border-white bg-white text-black"
                        : "border-white/20 bg-black text-white"
                    }`}
                  >
                    {step.icon}
                  </div>
                  <div className="flex flex-col">
                    <span className={`text-xs font-mono tracking-widest transition-colors ${
                       activeStep === index ? "text-white/60" : "text-white/30"
                    }`}>
                      PASO {step.id}
                    </span>
                    <span className={`text-lg font-light tracking-wide transition-colors ${
                      activeStep === index ? "text-white" : "text-white/60"
                    }`}>
                      {step.title}
                    </span>
                  </div>
                  
                  {/* Active Indicator Arrow */}
                  {activeStep === index && (
                      <div className="absolute right-0 text-white/10 hidden lg:block">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                             <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                      </div>
                  )}

                  {/* Mobile Progress Bar for Active Step */}
                  {activeStep === index && isAutoPlaying && (
                    <div className="absolute bottom-[-10px] left-16 h-[2px] bg-white/20 w-32 rounded overflow-hidden">
                         <div className="h-full bg-white animate-[progress_6s_linear_infinite]" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Right Side: Active Card Display */}
          <div className="lg:w-2/3 relative h-[450px] sm:h-[500px] perspective-[1000px]">
             {STEPS.map((step, index) => (
                 <div
                    key={step.id}
                    className={`absolute inset-0 bg-zinc-900/40 border border-white/10 backdrop-blur-sm rounded-2xl overflow-hidden shadow-2xl transition-all duration-700 ease-out-cubic ${
                        activeStep === index 
                        ? "opacity-100 translate-x-0 rotate-y-0 z-20" 
                        : index < activeStep 
                            ? "opacity-0 -translate-x-12 -rotate-y-12 z-0"
                            : "opacity-0 translate-x-12 rotate-y-12 z-0"
                    }`}
                 >
                     <div className="h-full flex flex-col md:flex-row">
                         {/* Image Section */}
                         <div className="relative w-full md:w-1/2 h-1/2 md:h-full bg-gradient-to-br from-zinc-800 to-black p-8 flex items-center justify-center overflow-hidden">
                             <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/20 to-transparent" />
                             <Image 
                                src={step.image} 
                                alt={step.title}
                                width={500}
                                height={500}
                                className={`object-contain transition-transform duration-1000 ${
                                    activeStep === index ? "scale-100 translate-y-0" : "scale-90 translate-y-8"
                                }`}
                                priority={index === 0}
                                unoptimized
                             />
                         </div>
                         
                         {/* Content Section */}
                         <div className="w-full md:w-1/2 p-8 flex flex-col justify-between bg-zinc-950/80">
                             <div>
                                 <div className="flex items-center justify-between mb-6">
                                     <span className="text-4xl sm:text-6xl font-thin text-white/5 font-mono select-none">
                                         {step.id}
                                     </span>
                                     <div className="h-px flex-1 bg-white/10 mx-4" />
                                 </div>
                                 
                                 <h3 className="text-sm font-mono text-white/50 tracking-widest mb-2">
                                     {step.subtitle}
                                 </h3>
                                 <h2 className="text-2xl sm:text-3xl font-light text-white mb-6">
                                     {step.title}
                                 </h2>
                                 <p className="text-zinc-400 font-light leading-relaxed">
                                     {step.description}
                                 </p>
                             </div>

                             <div className="mt-8 flex items-center gap-2 text-sm text-white/40 font-mono">
                                 <span className="w-2 h-2 rounded-full bg-green-500/50 animate-pulse" />
                                 SISTEMA ACTIVO
                             </div>
                         </div>
                     </div>
                 </div>
             ))}
          </div>

        </div>
      </div>
    </section>
  );
}
