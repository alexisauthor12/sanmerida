/**
 * Genera la tarjeta de la ruleta para el carrusel de promociones.
 *
 * Se dibuja como SVG y se rasteriza con sharp: así el texto sale nitido a cualquier
 * tamano y se puede cambiar sin depender de un editor de imagenes.
 *
 * Es un **reemplazo provisional** hasta que llegue la imagen definitiva. Cuando la
 * tengas, se guarda en esta misma ruta y este script deja de hacer falta.
 */
import { mkdirSync } from "node:fs";
import sharp from "sharp";

mkdirSync("public/promos", { recursive: true });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <defs>
    <radialGradient id="fondo" cx="50%" cy="38%" r="72%">
      <stop offset="0%" stop-color="#16281f"/>
      <stop offset="60%" stop-color="#0b0f0d"/>
      <stop offset="100%" stop-color="#000000"/>
    </radialGradient>
    <linearGradient id="oro" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f3e3b3"/>
      <stop offset="50%" stop-color="#d4af37"/>
      <stop offset="100%" stop-color="#9c7a1e"/>
    </linearGradient>
    <linearGradient id="verde" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#34d399"/>
      <stop offset="100%" stop-color="#10b981"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="1200" fill="url(#fondo)"/>

  <!-- Aro decorativo -->
  <circle cx="600" cy="455" r="250" fill="none" stroke="url(#oro)" stroke-width="3" opacity="0.55"/>
  <circle cx="600" cy="455" r="212" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.16"/>

  <!-- Radios de la ruleta -->
  <g stroke="url(#oro)" stroke-width="2" opacity="0.42">
    <line x1="600" y1="243" x2="600" y2="667"/>
    <line x1="600" y1="243" x2="600" y2="667" transform="rotate(45 600 455)"/>
    <line x1="600" y1="243" x2="600" y2="667" transform="rotate(90 600 455)"/>
    <line x1="600" y1="243" x2="600" y2="667" transform="rotate(135 600 455)"/>
  </g>

  <!-- Centro -->
  <circle cx="600" cy="455" r="96" fill="url(#oro)" opacity="0.95"/>
  <text x="600" y="482" text-anchor="middle" font-family="Georgia, serif" font-size="62" font-weight="bold" fill="#0b0f0d">55$</text>

  <!-- Titulo -->
  <text x="600" y="790" text-anchor="middle" font-family="Georgia, serif" font-size="86" letter-spacing="10" fill="#ffffff" opacity="0.92">SISTEMA DE</text>
  <text x="600" y="900" text-anchor="middle" font-family="Georgia, serif" font-size="132" font-weight="bold" letter-spacing="14" fill="url(#oro)">RULETA</text>

  <!-- Subtitulo -->
  <text x="600" y="975" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="34" letter-spacing="6" fill="#ffffff" opacity="0.72">GIRA TODOS LOS SÁBADOS</text>

  <!-- Marca -->
  <line x1="430" y1="1040" x2="770" y2="1040" stroke="url(#verde)" stroke-width="2" opacity="0.5"/>
  <text x="600" y="1100" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="40" font-weight="bold" letter-spacing="9" fill="url(#verde)">SAN MERIDA</text>
</svg>`;

await sharp(Buffer.from(svg)).webp({ quality: 88 }).toFile("public/promos/ruleta.webp");

console.log("public/promos/ruleta.webp generada (provisional)");