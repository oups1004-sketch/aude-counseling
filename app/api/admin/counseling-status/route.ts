import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCounselingOpen, setCounselingOpen } from "../../../lib/counseling-status";
import { verifyAdminSession } from "../../../lib/supabase";

export const runtime = "nodejs";

async function authorized() {
  const store = await cookies();
  return verifyAdminSession(store.get("aude_admin_token")?.value);
}

export async function GET() {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ counselingOpen: await getCounselingOpen() });
  } catch (error) {
    console.error("Admin counseling status read failed", error);
    return NextResponse.json({ error: "상담 신청 상태를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const input = await request.json();
    if (typeof input.counselingOpen !== "boolean") {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    await setCounselingOpen(input.counselingOpen);
    return NextResponse.json({ counselingOpen: input.counselingOpen });
  } catch (error) {
    console.error("Admin counseling status update failed", error);
    return NextResponse.json({ error: "상담 신청 상태를 변경하지 못했습니다." }, { status: 500 });
  }
}
