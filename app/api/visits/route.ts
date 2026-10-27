import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseAdminRequest, verifyAdminSession } from "../../lib/supabase";
import { koreaDate } from "../../lib/visitor-dates";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers });
  const store = await cookies();
  if (verifyAdminSession(store.get("aude_admin_token")?.value) || /bot|crawler|spider|preview|headless/i.test(request.headers.get("user-agent") || "")) {
    return NextResponse.json({ ok: true }, { headers });
  }
  const today = koreaDate();
  // The signed daily receipt avoids extra writes on refresh and cannot be forged.
  const existing = store.get("aude_visitor")?.value;
  const id = existing && /^[0-9a-f-]{36}$/i.test(existing) ? existing : randomUUID();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "Unavailable" }, { status: 503, headers });
  const receipt = createHash("sha256").update(`${secret}:${today}:${id}`).digest("hex");
  if (store.get("aude_visit_day")?.value === receipt) return NextResponse.json({ ok: true }, { headers });
  // Monthly salt prevents linking a visitor's database records across months.
  const key = createHash("sha256").update(`${secret}:${today.slice(0, 7)}:${id}`).digest("hex");
  try {
    await supabaseAdminRequest("/rest/v1/site_visits?on_conflict=visit_date,visitor_key", {
      method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({ visit_date: today, visitor_key: key }),
    });
    const cutoff = new Date(`${today}T00:00:00Z`);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
    await supabaseAdminRequest(`/rest/v1/site_visits?visit_date=lt.${cutoff.toISOString().slice(0, 10)}`, { method: "DELETE" });
    const response = NextResponse.json({ ok: true }, { headers });
    const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 365 };
    response.cookies.set("aude_visitor", id, options);
    response.cookies.set("aude_visit_day", receipt, { ...options, maxAge: 60 * 60 * 24 });
    return response;
  } catch (error) {
    console.error("Visitor recording failed", error);
    return NextResponse.json({ error: "Unavailable" }, { status: 503, headers });
  }
}
