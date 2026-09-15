import { NextResponse } from "next/server";
import { supabaseServiceRequest } from "../../lib/supabase";

export const runtime = "nodejs";

const limits: Record<string, number> = {
  nickname: 40,
  story: 5000,
  contentConsent: 20,
  name: 40,
  ageGroup: 20,
  contact: 80,
  service: 40,
  preferredTime: 100,
  reason: 500,
};

function text(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

export async function POST(request: Request) {
  try {
    const input = await request.json();
    if (input.website) return NextResponse.json({ ok: true });

    const clean: Record<string, string> = {};
    for (const [key, max] of Object.entries(limits)) clean[key] = text(input[key], max);

    const type = input.type === "story" ? "story" : input.type === "counseling" ? "counseling" : "";
    if (!type) return NextResponse.json({ error: "Invalid submission type." }, { status: 400 });
    if (type === "story" && !clean.story) {
      return NextResponse.json({ error: "Story is required." }, { status: 400 });
    }
    if (type === "counseling" && (!clean.name || !clean.contact || !clean.service)) {
      return NextResponse.json({ error: "Required fields are missing." }, { status: 400 });
    }

    const kind = type === "story"
      ? "story"
      : clean.service === "심리검사·해석상담" ? "assessment" : "intake";

    await supabaseServiceRequest("/rest/v1/submissions", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        kind,
        nickname: type === "story" ? clean.nickname || "익명" : null,
        name: type === "counseling" ? clean.name : null,
        age_group: type === "counseling" ? clean.ageGroup : null,
        contact: type === "counseling" ? clean.contact : null,
        service: type === "counseling" ? clean.service : null,
        preferred_time: type === "counseling" ? clean.preferredTime : null,
        message: type === "story" ? clean.story : clean.reason,
        content_consent: type === "story" && clean.contentConsent === "동의",
        privacy_version: "2026-09",
      }),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Submission failed", error);
    return NextResponse.json({ error: "Unable to submit." }, { status: 500 });
  }
}
