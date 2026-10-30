import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MOTOS, getMotoBySlug } from "@/data/motos";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function ModeloDetallePage({ params }: Props) {
  const { slug } = await params;
  const modelo = getMotoBySlug(slug);

  if (!modelo) {
    notFound();
  }

  const relacionados = MOTOS.filter((moto) => moto.slug !== modelo.slug).slice(0, 3);

  return (
    <main className="min-h-screen bg-black px-6 py-10 text-white sm:px-10 lg:px-16 lg:py-12">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between border-b border-white/10 pb-5">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm uppercase tracking-[0.16em] text-white/75 transition hover:text-white"
          >
            ← Volver al Home
          </Link>
          <Image
            src="/Logo.png"
            alt="Logo San Mérida"
            width={1584}
            height={672}
            sizes="180px"
            className="h-auto w-[140px] opacity-90 sm:w-[180px]"
          />
        </div>

        <section className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
          <article className="rounded-3xl border border-white/12 bg-zinc-950/70 p-5 sm:p-6">
            <div className="relative mb-6 flex h-[360px] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white sm:h-[430px]">
              <Image
                src={modelo.imagen}
                alt={modelo.nombre}
                fill
                sizes="(max-width: 1024px) 100vw, 60vw"
                className="object-contain object-center"
                priority
                unoptimized
              />
            </div>

            <p className="text-xs uppercase tracking-[0.2em] text-white/55">
              {modelo.marca} · {modelo.categoria}
            </p>
            <h1 className="mt-2 text-3xl font-light tracking-[0.03em] text-white sm:text-4xl">
              {modelo.nombre}
            </h1>
            <p className="mt-4 text-lg font-light leading-8 tracking-[0.02em] text-white/78">
              {modelo.descripcionCompleta}
            </p>
          </article>

          <aside className="rounded-3xl border border-white/12 bg-zinc-950/70 p-5 sm:p-6">
            <h2 className="text-xl font-light tracking-[0.06em] text-white">Ficha técnica</h2>
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-white/50">Motor</p>
                <p className="mt-2 text-base text-white/90">{modelo.motor}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-white/50">Transmisión</p>
                <p className="mt-2 text-base text-white/90">{modelo.transmision}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-white/50">Prestación</p>
                <p className="mt-2 text-base text-white/90">{modelo.potencia}</p>
              </div>
            </div>
          </aside>
        </section>

        <section className="mt-12">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-light tracking-[0.05em] text-white">Motos relacionadas</h2>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {relacionados.map((rel) => (
              <Link
                key={rel.slug}
                href={`/modelos/${rel.slug}`}
                className="group rounded-2xl border border-white/12 bg-zinc-950/60 p-4 transition duration-300 hover:-translate-y-1 hover:border-white/30"
              >
                <div className="relative mb-4 h-44 overflow-hidden rounded-xl border border-white/8 bg-gradient-to-b from-zinc-900 to-black">
                  <Image
                    src={rel.imagen}
                    alt={rel.nombre}
                    fill
                    sizes="(max-width: 640px) 100vw, 30vw"
                    className="object-contain object-center transition duration-500 group-hover:scale-[1.03]"
                    unoptimized
                  />
                </div>
                <h3 className="text-xl font-light tracking-[0.03em] text-white">{rel.nombre}</h3>
                <p className="mt-2 text-base leading-7 text-white/70">{rel.descripcion}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
