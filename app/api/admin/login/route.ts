import { NextResponse } from "next/server";
import { adminSessionToken, verifyAdminPassword } from "../../../lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { password } = await request.json();

    if (!verifyAdminPassword(password)) {
      return NextResponse.json({ error: "관리자 비밀번호를 확인해 주세요." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set("aude_admin_token", adminSessionToken(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return response;
  } catch (error) {
    console.error("Admin login failed", error);
    return NextResponse.json({ error: "로그인 서비스를 사용할 수 없습니다." }, { status: 500 });
  }
}
