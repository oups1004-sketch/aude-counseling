import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseServiceRequest, verifyAdmin } from "../../../lib/supabase";

export const runtime = "nodejs";

async function authorized() {
  const store = await cookies();
  return verifyAdmin(store.get("aude_admin_token")?.value);
}

export async function GET() {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const response = await supabaseServiceRequest("/rest/v1/submissions?select=*&order=created_at.desc&limit=500");
    return NextResponse.json(await response.json());
  } catch (error) {
    console.error("Admin list failed", error);
    return NextResponse.json({ error: "목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id, status, adminNote } = await request.json();
    if (!id || !["신규", "확인", "연락 완료", "진행", "종결"].includes(status)) {
      return NextResponse.json({ error: "Invalid update" }, { status: 400 });
    }
    await supabaseServiceRequest(`/rest/v1/submissions?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status, admin_note: String(adminNote || "").slice(0, 2000) }),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin update failed", error);
    return NextResponse.json({ error: "수정하지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    await supabaseServiceRequest(`/rest/v1/submissions?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin delete failed", error);
    return NextResponse.json({ error: "삭제하지 못했습니다." }, { status: 500 });
  }
}
