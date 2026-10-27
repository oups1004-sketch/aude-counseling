import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseAdminRequest, verifyAdminSession } from "../../../lib/supabase";

export const runtime = "nodejs";
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  if (!verifyAdminSession((await cookies()).get("aude_admin_token")?.value)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const response = await supabaseAdminRequest("/rest/v1/rpc/site_visitor_stats", { method: "POST", body: "{}" });
    return NextResponse.json(await response.json(), { headers });
  } catch (error) {
    console.error("Visitor stats failed", error);
    return NextResponse.json({ error: "방문 통계를 불러오지 못했어요." }, { status: 503, headers });
  }
}
