import { NextResponse } from "next/server";

export const runtime = "nodejs";

const limits: Record<string, number> = {
  type: 20,
  nickname: 40,
  story: 5000,
  contentConsent: 20,
  name: 40,
  ageGroup: 20,
  contact: 80,
  service: 40,
  preferredTime: 100,
  reason: 200,
};

export async function POST(request: Request) {
  try {
    const endpoint = process.env.GOOGLE_APPS_SCRIPT_URL;
    const secret = process.env.SUBMISSION_SECRET;
    if (!endpoint || !secret) {
      return NextResponse.json({ error: "Submission service is not configured." }, { status: 503 });
    }

    const input = await request.json();
    if (input.website) return NextResponse.json({ ok: true });

    const type = input.type === "story" ? "story" : input.type === "counseling" ? "counseling" : "";
    if (!type) return NextResponse.json({ error: "Invalid submission type." }, { status: 400 });

    const clean: Record<string, string> = { type };
    for (const [key, max] of Object.entries(limits)) {
      if (key === "type") continue;
      if (input[key] !== undefined) clean[key] = String(input[key]).trim().slice(0, max);
    }

    if (type === "story" && !clean.story) {
      return NextResponse.json({ error: "Story is required." }, { status: 400 });
    }
    if (type === "counseling" && (!clean.name || !clean.contact || !clean.service)) {
      return NextResponse.json({ error: "Required fields are missing." }, { status: 400 });
    }

    const forwarded = await fetch(endpoint, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...clean, secret }),
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });

    if (!forwarded.ok) throw new Error("Google endpoint rejected submission.");
    const result = await forwarded.json();
    if (!result.ok) throw new Error("Google endpoint could not save submission.");

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unable to submit." }, { status: 500 });
  }
}
