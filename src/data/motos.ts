export type Moto = {
  slug: string;
  nombre: string;
  descripcion: string;
  descripcionCompleta: string;
  imagen: string;
  categoria: string;
  motor: string;
  transmision: string;
  potencia: string;
};

export const MOTOS: Moto[] = [
  {
    slug: "ek-xpress",
    nombre: "EK Xpress",
    descripcion: "Diseño urbano, conducción eficiente y comodidad para el día a día.",
    descripcionCompleta:
      "La EK Xpress está diseñada para movilidad moderna con un equilibrio ideal entre agilidad, confort y presencia visual. Es una solución práctica para ciudad con enfoque profesional y excelente maniobrabilidad.",
    imagen: "/ek-xpress.png",
    categoria: "Scooter",
    motor: "Monocilíndrico 4T",
    transmision: "CVT automática",
    potencia: "Entrega lineal para tránsito urbano",
  },
  {
    slug: "ek-xpress-ii",
    nombre: "EK Xpress II",
    descripcion: "Evolución premium de la línea Xpress con mayor presencia y confort.",
    descripcionCompleta:
      "EK Xpress II incorpora una estética renovada con enfoque empresarial, ideal para usuarios que buscan rendimiento confiable y experiencia de conducción cómoda durante toda la jornada.",
    imagen: "/ek-xpress-ii.png",
    categoria: "Scooter",
    motor: "Inyección electrónica",
    transmision: "CVT automática",
    potencia: "Respuesta suave y consumo eficiente",
  },
  {
    slug: "ek7",
    nombre: "EK7",
    descripcion: "Estilo deportivo con carácter moderno para un manejo ágil y seguro.",
    descripcionCompleta:
      "La EK7 combina diseño contemporáneo y desempeño dinámico para quienes buscan imagen y rendimiento en un mismo modelo. Su postura y geometría favorecen control y estabilidad en ciudad.",
    imagen: "/EK7.png",
    categoria: "Naked",
    motor: "Inyección electrónica",
    transmision: "Mecánica 6 velocidades",
    potencia: "Configuración deportiva de respuesta rápida",
  },
  {
    slug: "house-ii-se",
    nombre: "HOUSE II SE",
    descripcion: "Línea clásica con acabados premium para una experiencia diferenciada.",
    descripcionCompleta:
      "HOUSE II SE ofrece una propuesta elegante para movilidad diaria con enfoque en confort de marcha y presencia visual. Ideal para usuarios que valoran estilo y funcionalidad en cada recorrido.",
    imagen: "/house-ii-se.png",
    categoria: "Classic",
    motor: "Monocilíndrico 4T",
    transmision: "Mecánica 5 velocidades",
    potencia: "Conducción estable y progresiva",
  },
  {
    slug: "house-rl",
    nombre: "HOUSE RL",
    descripcion: "Una clásica refinada con personalidad y diseño atemporal.",
    descripcionCompleta:
      "HOUSE RL une herencia visual clásica y componentes modernos para una conducción cómoda y confiable. Su propuesta está orientada a quienes desean imagen premium sin perder practicidad.",
    imagen: "/house-rl.png",
    categoria: "Classic",
    motor: "Monocilíndrico 4T",
    transmision: "Mecánica 5 velocidades",
    potencia: "Conducción suave y estable",
  },
  {
    slug: "owen-200s",
    nombre: "Owen 200S",
    descripcion: "Equilibrio entre estética vintage y rendimiento para uso diario.",
    descripcionCompleta:
      "La Owen 200S destaca por su diseño clásico y su manejo versátil. Es una alternativa ideal para quienes buscan identidad de marca, confiabilidad y una experiencia de conducción placentera.",
    imagen: "/Owen%20200S.png",
    categoria: "Classic",
    motor: "200cc 4T",
    transmision: "Mecánica 5 velocidades",
    potencia: "Respuesta eficiente para rutas urbanas y mixtas",
  },
  {
    slug: "tx-200",
    nombre: "TX 200",
    descripcion: "Modelo robusto y polivalente para trabajo y movilidad intensiva.",
    descripcionCompleta:
      "TX 200 está pensada para usuarios que necesitan resistencia mecánica y desempeño continuo. Su estructura favorece la durabilidad y una conducción segura en condiciones de uso exigente.",
    imagen: "/tx-200.png",
    categoria: "Utility",
    motor: "200cc 4T",
    transmision: "Mecánica 5 velocidades",
    potencia: "Alto torque para operación constante",
  },
  {
    slug: "ava-jaguar",
    nombre: "Ava Jaguar",
    descripcion: "Diseño agresivo y sofisticado con tecnología de vanguardia.",
    descripcionCompleta:
      "La Ava Jaguar redefine el estilo urbano con líneas aerodinámicas y un motor optimizado para un rendimiento superior. Perfecta para quienes buscan distinción y potencia en cada trayecto.",
    imagen: "/ava-jaguar.png",
    categoria: "Sport",
    motor: "Monocilíndrico 4T",
    transmision: "Mecánica 5 velocidades",
    potencia: "Respuesta dinámica y ágil",
  },
  {
    slug: "bera-gbr-200",
    nombre: "Bera GBR 200",
    descripcion: "Versatilidad todoterreno con una construcción robusta.",
    descripcionCompleta:
      "Diseñada para dominar cualquier terreno, la Bera GBR 200 combina una suspensión de largo recorrido con un chasis reforzado, ofreciendo confianza tanto en asfalto como en caminos irregulares.",
    imagen: "/bera-gbr-200.png",
    categoria: "Enduro / Dual Sport",
    motor: "200cc 4T",
    transmision: "Mecánica 5 velocidades",
    potencia: "Potencia constante en todo régimen",
  },
  {
    slug: "bera-sbr",
    nombre: "Bera SBR",
    descripcion: "La referencia en movilidad eficiente y durabilidad comprobada.",
    descripcionCompleta:
      "Un ícono de confiabilidad. La Bera SBR es la elección inteligente para el trabajo diario, destacando por su bajo costo operativo, resistencia mecánica y facilidad de mantenimiento.",
    imagen: "/bera-sbr.png",
    categoria: "Trabajo",
    motor: "Monocilíndrico 4T",
    transmision: "Mecánica 5 velocidades",
    potencia: "Torque optimizado para carga",
  },
  {
    slug: "escuda-em200",
    nombre: "Escuda EM200",
    descripcion: "Innovación y estilo en una máquina de alto desempeño.",
    descripcionCompleta:
      "Escuda EM200 integra tecnología moderna en un paquete visualmente impactante. Su ergonomía estudiada y motor eficiente garantizan una experiencia de conducción placentera y segura.",
    imagen: "/escuda-em200.png",
    categoria: "Street",
    motor: "200cc 4T",
    transmision: "Mecánica 6 velocidades",
    potencia: "Aceleración suave y progresiva",
  },
  {
    slug: "new-house",
    nombre: "New House",
    descripcion: "Evolución contemporánea del clásico urbano.",
    descripcionCompleta:
      "La New House mantiene la esencia de movilidad práctica pero con un diseño renovado y características mejoradas para el conductor actual que valora la estética y la funcionalidad.",
    imagen: "/new-house.jpeg",
    categoria: "Urban",
    motor: "Monocilíndrico 4T",
    transmision: "Mecánica 5 velocidades",
    potencia: "Eficiencia máxima en ciudad",
  },
];

export const getMotoBySlug = (slug: string) => MOTOS.find((moto) => moto.slug === slug);
