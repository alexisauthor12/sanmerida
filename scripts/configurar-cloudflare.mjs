/**
 * Configura en Cloudflare lo que no se puede versionar (`docs/OPERACIONES_PRODUCCION.md`
 * 9.8 y 9.10): el registro `www`, la redireccion al apex y el WAF.
 *
 * Por defecto es un **simulacro**: dice que haria y no escribe nada.
 *
 *   node scripts/configurar-cloudflare.mjs            (simulacro)
 *   node scripts/configurar-cloudflare.mjs --apply    (aplica)
 *
 * Necesita `CLOUDFLARE_API_TOKEN` con estos permisos:
 *
 *   Zone   -> DNS               -> Edit     (registro www)
 *   Zone   -> Config Rules      -> Edit     (redireccion y WAF)
 *   Zone   -> Zone WAF          -> Edit     (reglas WAF)
 *   Zone   -> Zone              -> Read     (leer la zona)
 *   Account-> Access: Apps and Policies -> Edit   (opcional, ver mas abajo)
 *
 * Cloudflare Access **no esta activado** en la cuenta todavia
 * (`access.api.error.not_enabled`): hay que entrar una vez en el panel
 * (*Zero Trust* -> elegir nombre de equipo -> plan Free) y despues este script
 * puede crear la aplicacion y la politica. Sin ese paso previo, esa parte se omite
 * con un aviso, pero el resto se aplica igual.
 *
 * Para la politica de Access hace falta saber a quien se le permite entrar:
 *   $env:ACCESS_EMAILS = "uno@dominio.com,dos@dominio.com"
 *
 * Diseno a proposito: **nunca sobrescribe reglas existentes**. Lee el ruleset,
 * comprueba si su regla ya esta, y la anade. Si no puede leerlo, se niega a escribir
 * en vez de arriesgarse a borrar lo que ya hubiera.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const APLICAR = process.argv.includes("--apply");

const DOMINIO = "sanmeridajz.com";
const CUENTA = "cb21ec9c7982bc13f34c243cde5dc608";

const EMAILS = (process.env.ACCESS_EMAILS ?? "")
  .split(",")
  .map((correo) => correo.trim())
  .filter(Boolean);

/** El token del entorno manda; si no hay, se usa el de `wrangler login`. */
function resolverToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;

  try {
    const config = readFileSync(
      join(homedir(), "AppData", "Roaming", "xdg.config", ".wrangler", "config", "default.toml"),
      "utf8",
    );

    return config.match(/oauth_token\s*=\s*"([^"]+)"/)?.[1] ?? "";
  } catch {
    return "";
  }
}

const TOKEN = resolverToken();

if (!TOKEN) {
  console.error(
    "Falta el token.\n" +
      "Crea uno en Cloudflare -> My Profile -> API Tokens con los permisos del encabezado\n" +
      "y exportalo:  $env:CLOUDFLARE_API_TOKEN = \"...\"",
  );
  process.exit(1);
}

let fallos = 0;

async function api(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`https://api.cloudflare.com/client/v4${ruta}`, {
    method: metodo,
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    signal: AbortSignal.timeout(25000),
  });

  const datos = await respuesta.json().catch(() => ({}));

  return { status: respuesta.status, ok: Boolean(datos.success), datos };
}

function fallo(etiqueta, resultado) {
  const mensaje = JSON.stringify(resultado.datos.errors ?? resultado.datos).slice(0, 140);

  console.log(`  FALLO  ${etiqueta}\n         ${resultado.status} ${mensaje}`);

  if (resultado.status === 403) {
    console.log("         -> el token no tiene ese permiso (ver el encabezado del script)");
  }

  fallos += 1;
}

console.log(`\n${APLICAR ? "APLICANDO" : "SIMULACRO"} sobre ${DOMINIO}\n${"=".repeat(64)}`);

// ---------------------------------------------------------------------------
// Zona
// ---------------------------------------------------------------------------

const zonas = await api("GET", `/zones?name=${DOMINIO}`);

if (!zonas.ok || !zonas.datos.result?.length) {
  console.error("No se encontro la zona (¿el token tiene Zone:Read?).");
  process.exit(1);
}

const ZONA = zonas.datos.result[0].id;

console.log(`Zona: ${DOMINIO} (${ZONA})\n`);

// ---------------------------------------------------------------------------
// 1. Registro DNS `www`
// ---------------------------------------------------------------------------

console.log("1) Registro DNS `www`");

const registros = await api("GET", `/zones/${ZONA}/dns_records?name=www.${DOMINIO}`);

if (!registros.ok) {
  fallo("leer los registros DNS", registros);
  console.log("         -> no se toca nada: sin poder leer no se puede evitar pisar un registro\n");
} else {
  const existente = (registros.datos.result ?? []).find((r) => r.name === `www.${DOMINIO}`);

  if (existente) {
    console.log(`  ya existe: ${existente.type} ${existente.name} -> ${existente.content}\n`);
  } else if (!APLICAR) {
    console.log(`  haria: CNAME www.${DOMINIO} -> ${DOMINIO} (proxy activado)\n`);
  } else {
    const creado = await api("POST", `/zones/${ZONA}/dns_records`, {
      type: "CNAME",
      name: "www",
      content: DOMINIO,
      proxied: true,
      ttl: 1,
      comment: "www -> apex (OPERACIONES_PRODUCCION 9.10)",
    });

    if (creado.ok) console.log(`  creado: CNAME www.${DOMINIO} -> ${DOMINIO} (proxy activado)\n`);
    else fallo("crear el registro www", creado);
  }
}

// ---------------------------------------------------------------------------
// 2. Redireccion 301 de www al apex
// ---------------------------------------------------------------------------

const FASE_REDIRECT = "http_request_dynamic_redirect";
const DESC_REDIRECT = "www -> apex (301)";

console.log("2) Redireccion 301 de www al apex");

const redirectActual = await api("GET", `/zones/${ZONA}/rulesets/phases/${FASE_REDIRECT}/entrypoint`);

if (!redirectActual.ok) {
  fallo("leer el ruleset de redirecciones", redirectActual);
  console.log("         -> no se toca nada: sobrescribirlo borraria las reglas que ya hubiera\n");
} else {
  const reglas = redirectActual.datos.result?.rules ?? [];

  if (reglas.some((r) => r.description === DESC_REDIRECT)) {
    console.log("  ya existe\n");
  } else {
    const nueva = {
      action: "redirect",
      description: DESC_REDIRECT,
      enabled: true,
      expression: `(http.host eq "www.${DOMINIO}")`,
      action_parameters: {
        from_value: {
          status_code: 301,
          preserve_query_string: true,
          target_url: { expression: `concat("https://${DOMINIO}", http.request.uri.path)` },
        },
      },
    };

    if (!APLICAR) {
      console.log(`  haria: ${nueva.expression} -> 301 https://${DOMINIO}<ruta>\n`);
    } else {
      const guardado = await api("PUT", `/zones/${ZONA}/rulesets/phases/${FASE_REDIRECT}/entrypoint`, {
        rules: [...reglas, nueva],
      });

      if (guardado.ok) console.log(`  anadida (${reglas.length + 1} regla(s) en total)\n`);
      else fallo("anadir la redireccion", guardado);
    }
  }
}

// ---------------------------------------------------------------------------
// 3. WAF: dos reglas personalizadas (9.8)
// ---------------------------------------------------------------------------

const FASE_WAF = "http_request_firewall_custom";

const REGLAS_WAF = [
  {
    action: "block",
    description: "Bloquear /admin con amenaza alta",
    enabled: true,
    expression: '(starts_with(http.request.uri.path, "/admin") and cf.threat_score gt 14)',
  },
  {
    action: "managed_challenge",
    description: "Desafio en POST de /api/auth con amenaza",
    enabled: true,
    expression:
      '(starts_with(http.request.uri.path, "/api/auth") and http.request.method eq "POST" ' +
      "and cf.threat_score gt 25)",
  },
];

console.log("3) WAF: reglas personalizadas");

const wafActual = await api("GET", `/zones/${ZONA}/rulesets/phases/${FASE_WAF}/entrypoint`);

// Un 404 aqui significa "todavia no hay reglas", no un error: se empieza de cero.
const sinRuleset = wafActual.status === 404;
const wafLegible = wafActual.ok || sinRuleset;

if (!wafLegible) {
  fallo("leer el ruleset del WAF", wafActual);
  console.log("         -> no se toca nada: sobrescribirlo borraria las reglas que ya hubiera\n");
} else {
  const existentes = wafActual.datos.result?.rules ?? [];
  const faltan = REGLAS_WAF.filter((r) => !existentes.some((e) => e.description === r.description));

  if (faltan.length === 0) {
    console.log("  ya estaban las dos\n");
  } else if (!APLICAR) {
    for (const r of faltan) console.log(`  haria: [${r.action}] ${r.description}`);

    console.log("");
  } else {
    const guardado = await api("PUT", `/zones/${ZONA}/rulesets/phases/${FASE_WAF}/entrypoint`, {
      rules: [...existentes, ...faltan],
    });

    if (guardado.ok) console.log(`  anadidas ${faltan.length} regla(s)\n`);
    else fallo("anadir las reglas del WAF", guardado);
  }
}

// ---------------------------------------------------------------------------
// 4. Cloudflare Access delante de /admin (necesita Zero Trust activado)
// ---------------------------------------------------------------------------

console.log("4) Cloudflare Access delante de /admin");

const access = await api("GET", `/accounts/${CUENTA}/access/apps`);

if (!access.ok) {
  const detalle = JSON.stringify(access.datos.errors ?? access.datos);

  if (detalle.includes("not_enabled")) {
    console.log(
      "  OMITIDO: Access (Zero Trust) no esta activado en la cuenta.\n" +
        "  Paso manual, una sola vez: panel de Cloudflare -> *Zero Trust* -> elegir nombre de\n" +
        "  equipo (plan Free) -> volver a ejecutar este script.\n",
    );
  } else {
    fallo("leer las aplicaciones de Access", access);
    console.log("         -> si no es un problema de permisos, puede que Access no este activado\n");
  }
} else if (EMAILS.length === 0) {
  console.log(
    "  OMITIDO: falta saber a quien se le permite entrar.\n" +
      '  Define los correos y vuelve a ejecutar:  $env:ACCESS_EMAILS = "uno@dominio.com,dos@dominio.com"\n',
  );
} else {
  const apps = access.datos.result ?? [];
  const existente = apps.find((a) => a.domain === `${DOMINIO}/admin`);

  if (existente) {
    console.log(`  ya existe: ${existente.domain} (${existente.id})\n`);
  } else if (!APLICAR) {
    console.log(`  haria: aplicacion self-hosted sobre ${DOMINIO}/admin, sesion 8h`);
    console.log(`         politica Allow para: ${EMAILS.join(", ")}\n`);
  } else {
    const creada = await api("POST", `/accounts/${CUENTA}/access/apps`, {
      name: "SAN Merida - panel administrativo",
      domain: `${DOMINIO}/admin`,
      type: "self_hosted",
      session_duration: "8h",
    });

    if (!creada.ok) {
      fallo("crear la aplicacion de Access", creada);
    } else {
      const appId = creada.datos.result.id;

      const politica = await api("POST", `/accounts/${CUENTA}/access/apps/${appId}/policies`, {
        name: "Equipo administrativo",
        decision: "allow",
        include: EMAILS.map((email) => ({ email: { email } })),
      });

      if (politica.ok) console.log(`  creada la aplicacion ${appId} con ${EMAILS.length} correo(s)\n`);
      else fallo("crear la politica de Access", politica);
    }
  }
}

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------

console.log("=".repeat(64));
console.log(fallos === 0 ? "  Sin fallos." : `  ${fallos} paso(s) con fallo.`);
console.log(`  ${APLICAR ? "Aplicado." : "Simulacro: nada escrito. Repite con --apply."}`);
console.log("=".repeat(64) + "\n");

process.exitCode = fallos === 0 ? 0 : 1;

