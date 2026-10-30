/**
 * Genera el arreglo de modelos de `src/data/motos.ts` a partir del catálogo extraido.
 *
 * Escribir 46 entradas a mano es pedir un error: un `slug` mal, una coma de menos. Aquí
 * los datos viven en una tabla y el código TypeScript se genera. Se puede volver a
 * ejecutar cuando cambie el catálogo.
 */
import { readFileSync, writeFileSync } from "node:fs";

/**
 * Catálogo, por marca.
 * [slug, nombre, categoría, cilindrada, descripción corta, descripción larga]
 */
const MODELOS = [
  // --- BERA -----------------------------------------------------------------
  ["bera-socialista", "Bera Socialista", "Urbana", "4T",
    "Presencia clásica y conducción cómoda para el día a día.",
    "La Bera Socialista apuesta por una línea clásica con acabados cuidados y una postura de manejo relajada. Pensada para quien hace recorridos urbanos todos los días."],
  ["bera-brf", "Bera BRF", "Deportiva", "4T",
    "Línea deportiva con actitud urbana.",
    "La Bera BRF combina una silueta deportiva con la practicidad de una moto de uso diario. Su conjunto favorece una conducción ágil sin renunciar a la comodidad."],
  ["bera-br-200", "Bera BR 200", "Deportiva", "200cc 4T",
    "Cilindrada 200 con respuesta firme para trabajo y ciudad.",
    "La Bera BR 200 está pensada para quien necesita algo más que una moto de paseo: su cilindrada de 200cc entrega la respuesta que piden los recorridos largos y el uso de trabajo."],
  ["bera-leon", "Bera León", "Urbana", "4T",
    "Estilo y aplomo en una moto de uso diario.",
    "La Bera León ofrece una presencia sólida con una conducción estable. Una opción equilibrada para quien busca una moto versátil que se sienta firme en la carretera."],
  ["bera-ebr", "Bera EBR", "Urbana", "4T",
    "Diseño moderno con enfoque urbano.",
    "La Bera EBR es una moto de líneas actuales, pensada para el tránsito de todos los días. Su planteamiento prioriza la maniobrabilidad y el confort en recorridos cortos."],
  ["bera-kavak", "Bera Kavak", "Urbana", "4T",
    "Confort y estabilidad para el uso cotidiano.",
    "La Bera Kavak está orientada a quien valora la comodidad de marcha y la estabilidad. Una moto sencilla de llevar, pensada para el día a día en la ciudad."],
  ["bera-milan", "Bera Milan", "Urbana", "4T",
    "Elegancia urbana con manejo sencillo.",
    "La Bera Milan tiene una presencia más elegante dentro de la línea urbana de Bera, con una postura de conducción accesible y un comportamiento predecible."],
  ["bera-runner", "Bera Runner", "Deportiva", "4T",
    "Carácter deportivo para trayectos exigentes.",
    "La Bera Runner propone una conducción más viva, con una puesta a punto orientada a quien disfruta de la respuesta inmediata y de un manejo dinámico."],
  ["bera-cobra", "Bera Cobra", "Deportiva", "4T",
    "Nombre con carácter y diseño llamativo.",
    "La Bera Cobra destaca por un diseño de personalidad fuerte dentro de la gama Bera, pensada para quien quiere una moto que se distinga en la calle."],
  ["bera-bwt", "Bera BWT", "Urbana", "4T",
    "Versatilidad y practicidad en formato compacto.",
    "La Bera BWT cierra la propuesta de Bera con una moto práctica, de manejo sencillo y orientada al uso diario sin complicaciones."],

  // --- EK -------------------------------------------------------------------
  ["ek-xpress-lite", "EK Xpress Lite", "Scooter", "4T",
    "La entrada a la línea Xpress: ligera y sencilla.",
    "La EK Xpress Lite es la versión más accesible de la familia Xpress. Planteada para quien busca movilidad urbana sin complicaciones, con un manejo ligero y un mantenimiento sencillo."],
  ["ek-xpress-rayo", "EK Xpress Rayo", "Scooter", "4T",
    "Diseño llamativo dentro de la gama Xpress.",
    "La EK Xpress Rayo se distingue por una estética más deportiva dentro de la línea Xpress, manteniendo la practicidad y el confort que caracterizan a la familia."],
  ["ek-xpress-paleta", "EK Xpress Paleta", "Scooter", "4T",
    "Equilibrio entre estilo y practicidad.",
    "La EK Xpress Paleta ofrece un diseño equilibrado y una conducción cómoda, pensada para el uso urbano diario con una presencia visual cuidada."],
  ["ek-xpress-paleta-ii", "EK Xpress Paleta II", "Scooter", "4T",
    "La evolución de la Paleta, con acabados renovados.",
    "La EK Xpress Paleta II actualiza la propuesta de la Paleta con acabados renovados y una puesta a punto orientada al confort en ciudad."],
  ["ek-new-horte", "EK New Horte", "Urbana", "4T",
    "Línea clásica renovada.",
    "La EK New Horte reinterpreta el estilo clásico con una mirada actual. Una moto de líneas atemporales para quien quiere algo distinto sin renunciar a la practicidad."],
  ["ek-owen", "EK Owen", "Clásica", "4T",
    "Estilo retro con manejo moderno.",
    "La EK Owen apuesta por una estética retro reconocible, combinada con un comportamiento actual. Una moto con identidad propia para el uso diario."],
  ["ek-owen-ii", "EK Owen II", "Clásica", "4T",
    "La segunda generación del estilo Owen.",
    "La EK Owen II refina la propuesta de la Owen con detalles mejorados y una presencia más cuidada, manteniendo el carácter clásico que la define."],
  ["ek-matriz-ii", "EK Matriz II", "Urbana", "4T",
    "Practicidad urbana con diseño actual.",
    "La EK Matriz II es una moto funcional de líneas contemporáneas, planteada para resolver los trayectos de cada día con comodidad."],
  ["ek-new-outlook-ii", "EK New Outlook II", "Urbana", "4T",
    "Diseño renovado para el uso cotidiano.",
    "La EK New Outlook II presenta una imagen renovada dentro de la gama EK, con una conducción pensada para la ciudad y sus ritmos."],
];

// FIN_GENERADOR

MODELOS.push(
  ["md-aguila", "MD Águila", "Deportiva", "4T",
    "Una de las más reconocibles de la marca.",
    "La MD Águila es una de las motos más reconocibles de la marca. Ofrece una silueta deportiva y un planteamiento práctico para quien busca una moto de trabajo o de uso diario."],
  ["md-lechuza", "MD Lechuza", "Urbana", "4T",
    "Ligera y fácil de manejar en ciudad.",
    "La MD Lechuza apuesta por la ligereza y la facilidad de manejo, pensada para trayectos urbanos cortos y para quien se inicia en la moto."],
  ["md-lechuza-ii", "MD Lechuza II", "Urbana", "4T",
    "La Lechuza, con mejoras de acabado.",
    "La MD Lechuza II mantiene la ligereza de la Lechuza original añadiendo mejoras de acabado y una presencia más cuidada."],
  ["md-cuervo", "MD Cuervo", "Urbana", "4T",
    "Diseño sobrio y conducción predecible.",
    "La MD Cuervo se caracteriza por un diseño sobrio y un comportamiento predecible, orientada a quien prioriza la fiabilidad."],
  ["md-canario", "MD Canario", "Urbana", "4T",
    "Una moto viva para el día a día.",
    "La MD Canario ofrece una conducción ágil con una presencia visual llamativa, pensada para el tránsito urbano de todos los días."],
  ["md-condor", "MD Cóndor", "Deportiva", "4T",
    "Planteamiento deportivo dentro de la gama MD.",
    "La MD Cóndor tiene un enfoque algo más deportivo dentro de la gama MD, con una puesta a punto que busca respuesta y aplomo."],
  ["md-falco", "MD Falco", "Deportiva", "4T",
    "Rapidez y agilidad como argumentos.",
    "La MD Falco busca la agilidad en el manejo, con una configuración pensada para moverse rápido y con seguridad por la ciudad."],
);

// FIN_MD

MODELOS.push(
  ["ava-leopardo", "AVA Leopardo", "Clásica", "4T",
    "Estilo clásico con presencia fuerte.",
    "La AVA Leopardo combina un diseño de inspiración clásica con una presencia sólida en carretera. Una moto con carácter para quien quiere algo más que un medio de transporte."],
  ["ava-leopardo-ii", "AVA Leopardo II", "Clásica", "4T",
    "La evolución de la Leopardo.",
    "La AVA Leopardo II refina la propuesta original con detalles actualizados y el mismo carácter que hizo reconocible al modelo."],
  ["ava-leon", "AVA León", "Clásica", "4T",
    "Aplomo y estilo atemporal.",
    "La AVA León ofrece una imagen atemporal con una conducción estable, pensada para quien valora la estética clásica en el uso diario."],
  ["ava-mule", "AVA Mule", "Trabajo", "4T",
    "Pensada para el trabajo y la carga diaria.",
    "La AVA Mule está orientada al uso de trabajo: resistencia, facilidad de mantenimiento y una postura que aguanta jornadas largas."],
  ["ava-mustang", "AVA Mustang", "Deportiva", "4T",
    "Nombre con fuerza y diseño decidido.",
    "La AVA Mustang tiene una presencia decidida y un planteamiento orientado a quien busca una conducción con más carácter."],
  ["ava-pantera", "AVA Pantera", "Deportiva", "4T",
    "Estética agresiva con manejo ágil.",
    "La AVA Pantera destaca por una estética agresiva y un manejo ágil, pensada para quien quiere llamar la atención sin renunciar a la practicidad."],
  ["ava-tigrito", "AVA Tigrito", "Urbana", "4T",
    "Compacta y manejable en ciudad.",
    "La AVA Tigrito es una moto compacta y fácil de llevar, ideal para el tránsito denso y para quien busca maniobrabilidad por encima de la potencia."],
  ["ava-avipon", "AVA Avipón", "Urbana", "4T",
    "Practicidad urbana con identidad propia.",
    "La AVA Avipón ofrece una solución práctica para el uso urbano, con un diseño que no pasa desapercibido dentro de la gama."],
  ["ava-tucan", "AVA Tucán", "Urbana", "4T",
    "Ligera y cómoda para trayectos cortos.",
    "La AVA Tucán está planteada para trayectos urbanos, con una postura cómoda y un manejo sencillo que la hacen accesible a cualquier conductor."],
  ["ava-flath", "AVA Flath", "Urbana", "4T",
    "Diseño plano y conducción directa.",
    "La AVA Flath cierra la gama AVA con un planteamiento sencillo y directo, pensada para quien busca una moto funcional sin complicaciones."],
);

// FIN_AVA

MODELOS.push(
  ["toro-crx", "Toro CRX", "Deportiva", "4T",
    "Planteamiento deportivo de la gama Toro.",
    "El Toro CRX abre la gama Toro con una propuesta de corte deportivo, pensada para quien busca una conducción más viva."],
  ["toro-jaguar", "Toro Jaguar", "Deportiva", "4T",
    "Presencia fuerte y conducción decidida.",
    "El Toro Jaguar ofrece una presencia imponente con un manejo que busca transmitir seguridad en cada trayecto."],
  ["toro-leon", "Toro León", "Deportiva", "4T",
    "El nombre lo dice: carácter y aplomo.",
    "El Toro León combina una imagen de fuerza con una conducción estable, orientado a quien quiere una moto con personalidad."],
  ["toro-cappuccino", "Toro Cappuccino", "Urbana", "4T",
    "Nombre curioso, moto práctica.",
    "El Toro Cappuccino sorprende por su nombre y convence por su planteamiento práctico: una moto urbana sencilla de usar y de mantener."],
  ["toro-foxtr", "Toro Foxtr", "Deportiva", "4T",
    "Agilidad y respuesta dentro de la gama Toro.",
    "El Toro Foxtr apuesta por la agilidad y una respuesta viva, pensado para el tránsito urbano con algo más de chispa."],
  ["toro-tanktr", "Toro Tanktr", "Trabajo", "4T",
    "Aguante para el uso intensivo.",
    "El Toro Tanktr está planteado para quienes exigen resistencia y aguante en jornadas largas de trabajo."],
  ["toro-moka", "Toro Moka", "Urbana", "4T",
    "Sencillez y confort para el día a día.",
    "El Toro Moka cierra la gama Toro con una propuesta de uso diario, cómoda y sin complicaciones."],
);

MODELOS.push(
  ["et-cuda-hero", "ET Cuda Hero", "Trabajo", "4T",
    "Enfoque utilitario y resistente.",
    "La ET Cuda Hero está orientada al trabajo diario, con un planteamiento que prioriza la resistencia mecánica y el bajo coste de mantenimiento."],
  ["et-cuda-m200", "ET Cuda M200", "Trabajo", "200cc 4T",
    "Cilindrada 200 para carga y trayectos largos.",
    "La ET Cuda M200 sube a 200cc para quien necesita más músculo en el día a día, ya sea por carga o por recorridos largos."],
);

// FIN_TABLA

// --- Generación del TypeScript ---------------------------------------------
const escapar = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/** Marca a partir del slug: "bera-br-200" -> "Bera". */
const marcaDe = (slug) => {
  const prefijo = slug.split("-")[0];

  return { bera: "Bera", ek: "EK", md: "MD", ava: "AVA", toro: "Toro", et: "ET" }[prefijo] ?? prefijo;
};

const entradas = MODELOS.map(([slug, nombre, categoria, motor, corta, larga], indice) => {
  const marca = marcaDe(slug);

  return `  {
    slug: "${escapar(slug)}",
    nombre: "${escapar(nombre)}",
    marca: "${marca}",
    descripcion: "${escapar(corta)}",
    descripcionCompleta: "${escapar(larga)}",
    imagen: "/catalogo/${slug}.webp",
    categoria: "${categoria}",
    motor: "${motor}",
    transmision: "Mecánica",
    potencia: "Consultar",
    orden: ${indice + 1},
  },`;
}).join("\n");

const RUTA = "src/data/motos.ts";
const actual = readFileSync(RUTA, "utf8");

const nuevo = actual.replace("  // FIN_MOTOS", entradas);

writeFileSync(RUTA, nuevo, "utf8");

console.log(`modelos generados: ${MODELOS.length}`);

const porMarca = {};
for (const [slug] of MODELOS) porMarca[marcaDe(slug)] = (porMarca[marcaDe(slug)] ?? 0) + 1;

for (const [m, n] of Object.entries(porMarca)) console.log(`  ${m}: ${n}`);

// Comprobar que cada imagen existe
let faltan = 0;

for (const [slug] of MODELOS) {
  try {
    readFileSync(`public/catalogo/${slug}.webp`);
  } catch {
    console.log(`  FALTA la imagen: ${slug}.webp`);
    faltan += 1;
  }
}

console.log(`imagenes que faltan: ${faltan}`);