import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_ACCESS_COOKIE_NAME, verifyAdminAccessToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Categorias permitidas en el feed de la empresa. */
const CATEGORIAS = ["Corporativo", "Modelos", "Promociones", "Pagos", "Eventos", "Video"];

function texto(valor: unknown, max: number) {
  return String(valor ?? "").trim().slice(0, max);
}

function categoriaValida(valor: unknown) {
  const categoria = texto(valor, 40);

  return CATEGORIAS.includes(categoria) ? categoria : "Corporativo";
}

/** El equipo administrativo necesita su licencia validada para publicar o editar. */
async function tieneLicenciaAdmin(userId: string) {
  const store = await cookies();
  const token = store.get(ADMIN_ACCESS_COOKIE_NAME)?.value;

  if (!token) return false;

  try {
    const payload = await verifyAdminAccessToken(token);

    return payload.scope === "admin_access" && payload.userId === userId;
  } catch {
    return false;
  }
}

/**
 * Feed de la empresa.
 *
 *  - Miembro: solo publicaciones publicadas.
 *  - Equipo con licencia: tambien las borradores (para administrarlas).
 */
export async function GET() {
  const sessionUser = await getSessionUser();

  if (!sessionUser?.userId) {
    return NextResponse.json({ ok: false, message: "Debes iniciar sesión para ver las novedades." }, { status: 401 });
  }

  const puedeAdministrar = !sessionUser.isMember && (await tieneLicenciaAdmin(sessionUser.userId));

  try {
    const posts = await prisma.newsPost.findMany({
      where: puedeAdministrar ? {} : { publicado: true },
      orderBy: [{ destacado: "desc" }, { fechaPublicacion: "desc" }],
      take: 60,
    });

    return NextResponse.json({
      ok: true,
      puedeAdministrar,
      categorias: CATEGORIAS,
      posts: posts.map((post) => ({
        id: post.id,
        titulo: post.titulo,
        resumen: post.resumen ?? "",
        contenido: post.contenido ?? "",
        categoria: post.categoria,
        imagenUrl: post.imagenUrl ?? "",
        videoUrl: post.videoUrl ?? "",
        autor: post.autor ?? "",
        destacado: post.destacado,
        publicado: post.publicado,
        fecha: new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(post.fechaPublicacion),
        fechaIso: post.fechaPublicacion.toISOString(),
      })),
    });
  } catch {
    return NextResponse.json({ ok: false, message: "No se pudieron cargar las novedades." }, { status: 500 });
  }
}

type PostPayload = {
  id?: string;
  titulo?: string;
  resumen?: string;
  contenido?: string;
  categoria?: string;
  imagenUrl?: string;
  videoUrl?: string;
  destacado?: boolean;
  publicado?: boolean;
};

/** Publica una novedad en el feed de la empresa. */
export async function POST(request: Request) {
  const sessionUser = await getSessionUser();

  if (!sessionUser?.userId || sessionUser.isMember) {
    return NextResponse.json({ ok: false, message: "Solo el equipo de San Mérida puede publicar novedades." }, { status: 403 });
  }

  if (!(await tieneLicenciaAdmin(sessionUser.userId))) {
    return NextResponse.json({ ok: false, message: "Valida la licencia administrativa para publicar." }, { status: 403 });
  }

  const body = (await request.json()) as PostPayload;
  const titulo = texto(body.titulo, 160);

  if (titulo.length < 4) {
    return NextResponse.json({ ok: false, message: "El título debe tener al menos 4 caracteres." }, { status: 400 });
  }

  try {
    const post = await prisma.newsPost.create({
      data: {
        titulo,
        resumen: texto(body.resumen, 400) || null,
        contenido: texto(body.contenido, 4000) || null,
        categoria: categoriaValida(body.categoria),
        imagenUrl: texto(body.imagenUrl, 500) || null,
        videoUrl: texto(body.videoUrl, 500) || null,
        autor: sessionUser.nombre || sessionUser.email || "Equipo San Mérida",
        destacado: Boolean(body.destacado),
        publicado: body.publicado === false ? false : true,
      },
    });

    return NextResponse.json({ ok: true, id: post.id, message: "Novedad publicada." });
  } catch {
    return NextResponse.json({ ok: false, message: "No se pudo publicar la novedad." }, { status: 500 });
  }
}

/** Edita una novedad (o la publica / despublica). */
export async function PATCH(request: Request) {
  const sessionUser = await getSessionUser();

  if (!sessionUser?.userId || sessionUser.isMember) {
    return NextResponse.json({ ok: false, message: "Solo el equipo de San Mérida puede editar novedades." }, { status: 403 });
  }

  if (!(await tieneLicenciaAdmin(sessionUser.userId))) {
    return NextResponse.json({ ok: false, message: "Valida la licencia administrativa para editar." }, { status: 403 });
  }

  const body = (await request.json()) as PostPayload;
  const id = texto(body.id, 60);

  if (!id) {
    return NextResponse.json({ ok: false, message: "Falta la novedad a editar." }, { status: 400 });
  }

  try {
    await prisma.newsPost.update({
      where: { id },
      data: {
        ...(body.titulo !== undefined ? { titulo: texto(body.titulo, 160) } : {}),
        ...(body.resumen !== undefined ? { resumen: texto(body.resumen, 400) || null } : {}),
        ...(body.contenido !== undefined ? { contenido: texto(body.contenido, 4000) || null } : {}),
        ...(body.categoria !== undefined ? { categoria: categoriaValida(body.categoria) } : {}),
        ...(body.imagenUrl !== undefined ? { imagenUrl: texto(body.imagenUrl, 500) || null } : {}),
        ...(body.videoUrl !== undefined ? { videoUrl: texto(body.videoUrl, 500) || null } : {}),
        ...(body.destacado !== undefined ? { destacado: Boolean(body.destacado) } : {}),
        ...(body.publicado !== undefined ? { publicado: Boolean(body.publicado) } : {}),
      },
    });

    return NextResponse.json({ ok: true, message: "Novedad actualizada." });
  } catch {
    return NextResponse.json({ ok: false, message: "No se pudo actualizar la novedad." }, { status: 500 });
  }
}

/** Elimina una novedad del feed. */
export async function DELETE(request: Request) {
  const sessionUser = await getSessionUser();

  if (!sessionUser?.userId || sessionUser.isMember) {
    return NextResponse.json({ ok: false, message: "Solo el equipo de San Mérida puede eliminar novedades." }, { status: 403 });
  }

  if (!(await tieneLicenciaAdmin(sessionUser.userId))) {
    return NextResponse.json({ ok: false, message: "Valida la licencia administrativa para eliminar." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = texto(searchParams.get("id"), 60);

  if (!id) {
    return NextResponse.json({ ok: false, message: "Falta la novedad a eliminar." }, { status: 400 });
  }

  try {
    await prisma.newsPost.delete({ where: { id } });

    return NextResponse.json({ ok: true, message: "Novedad eliminada." });
  } catch {
    return NextResponse.json({ ok: false, message: "No se pudo eliminar la novedad." }, { status: 500 });
  }
}
