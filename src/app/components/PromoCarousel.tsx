"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

const SLIDES = [
  {
    id: 1,
    title: "HACIENDO SUEÑOS",
    highlight: "REALIDAD",
    description: "San Mérida de Jesús Zambrano. Seriedad y responsabilidad en cada entrega.",
    subtext: "@SANMERIDADEJESUSZAMBRANO",
    image: "/tx-200.png",
    imageAlt: "Moto San Mérida",
  },
  {
    id: 2,
    title: "SISTEMA DE",
    highlight: "RULETA",
    description: "NUESTRO SISTEMA DE RULETA GIRA TODOS LOS SABADOS. SON 50 CUPOS A 55$.",
    subtext: "NO TE QUEDES POR FUERA",
    price: "55$ / cupo",
    image: "/ek-xpress.png",
    imageAlt: "Sistema de Ruleta",
  },
  {
    id: 3,
    title: "TU MOTO POR",
    highlight: "SOLO 55$ QUINCENALES",
    description: "NO DEJES PASAR ESTA OPORTUNIDAD. SERIEDAD Y RESPONSABILIDAD.",
    subtext: "LLÉVATE UNA MOTO",
    price: "55$ / quincenal",
    image: "/Owen%20200S.png",
    imageAlt: "Financiamiento Moto",
  },
];

export default function PromoCarousel() {
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % SLIDES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="relative overflow-hidden bg-black py-24 sm:py-32">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,rgba(255,255,255,0.02),transparent_40%)]" />
      
      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 lg:gap-8 min-h-[500px]">
          
          {/* Text Content */}
          <div className="flex flex-col justify-center relative z-10">
            {SLIDES.map((slide, index) => (
              <div
                key={slide.id}
                className={`transition-all duration-700 ease-in-out absolute top-0 left-0 w-full h-full flex flex-col justify-center ${
                  index === currentSlide
                    ? "opacity-100 translate-x-0 relative pointer-events-auto"
                    : "opacity-0 -translate-x-12 absolute pointer-events-none"
                }`}
              >
                <div className="mb-6 flex items-center gap-4">
                  <Image src="/logo1.png" alt="San Mérida Logo" width={50} height={50} className="w-12 h-auto opacity-80" />
                  <span className="text-sm font-bold uppercase tracking-[0.2em] text-white/60">
                    San Mérida
                  </span>
                </div>

                <h2 className="text-4xl font-light tracking-tight text-white sm:text-6xl leading-[1.1]">
                  {slide.title}
                  <br />
                  <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60">
                    {slide.highlight}
                  </span>
                </h2>

                <p className="mt-6 max-w-lg text-lg font-light leading-8 text-zinc-300 uppercase tracking-wide">
                  {slide.description}
                </p>

                {slide.subtext && (
                   <p className="mt-2 text-sm text-zinc-500 font-medium tracking-widest uppercase">
                     {slide.subtext}
                   </p>
                )}

                {slide.price && (
                  <div className="mt-8 flex items-center gap-4">
                    <div className="border border-white/20 bg-white/5 px-6 py-3 backdrop-blur-sm">
                      <span className="text-xl font-light text-white tracking-widest">
                        {slide.price}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Dots Navigation */}
            <div className="absolute bottom-0 left-0 flex gap-3 pb-8 lg:pb-0 z-20">
              {SLIDES.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentSlide(index)}
                  className={`h-1 transition-all duration-300 ${
                    currentSlide === index ? "w-12 bg-white" : "w-6 bg-white/20 hover:bg-white/40"
                  }`}
                  aria-label={`Ir a diapositiva ${index + 1}`}
                />
              ))}
            </div>
          </div>

          {/* Image Content */}
          <div className="relative flex items-center justify-center lg:justify-end h-[400px] lg:h-auto">
             {SLIDES.map((slide, index) => (
               <div
                 key={slide.id}
                 className={`absolute transition-all duration-1000 ease-out w-full h-full flex items-center justify-center lg:justify-end ${
                   index === currentSlide
                     ? "opacity-100 scale-100 translate-x-0 blur-0"
                     : "opacity-0 scale-95 translate-x-12 blur-sm"
                 }`}
               >
                 <div className="relative w-full max-w-[600px] lg:max-w-[700px]">
                   <Image
                     src={slide.image}
                     alt={slide.imageAlt}
                     width={1200}
                     height={1200}
                     className="object-contain drop-shadow-[0_20px_50px_rgba(255,255,255,0.1)]"
                     priority={index === 0}
                     unoptimized
                   />
                 </div>
               </div>
             ))}
          </div>

        </div>
      </div>
    </section>
  );
}
