import { NextResponse } from "next/server";
import { getApplicationStatus } from "../../lib/counseling-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getApplicationStatus());
  } catch (error) {
    console.error("Counseling status read failed", error);
    return NextResponse.json({ counselingOpen: true, assessmentOpen: true });
  }
}
