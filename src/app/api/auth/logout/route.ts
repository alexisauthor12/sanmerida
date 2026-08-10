import { NextResponse } from "next/server";
import { ADMIN_ACCESS_COOKIE_NAME, AUTH_COOKIE_NAME } from "@/lib/auth";

export async function POST(request: Request) {
  const url = new URL("/", request.url);
  const response = NextResponse.redirect(url);

  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    path: "/",
    maxAge: 0,
  });

  response.cookies.set({
    name: ADMIN_ACCESS_COOKIE_NAME,
    value: "",
    path: "/",
    maxAge: 0,
  });

  return response;
}
