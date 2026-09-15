import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const allowed = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (!url || !anonKey || !allowed) throw new Error("Admin auth is not configured.");
    if (String(email).trim().toLowerCase() !== allowed) {
      return NextResponse.json({ error: "로그인 정보를 확인해 주세요." }, { status: 401 });
    }
    const auth = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
    if (!auth.ok) return NextResponse.json({ error: "로그인 정보를 확인해 주세요." }, { status: 401 });
    const session = await auth.json();
    const response = NextResponse.json({ ok: true });
    response.cookies.set("aude_admin_token", session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: Math.min(Number(session.expires_in || 3600), 3600),
    });
    return response;
  } catch (error) {
    console.error("Admin login failed", error);
    return NextResponse.json({ error: "로그인 서비스를 사용할 수 없습니다." }, { status: 500 });
  }
}
