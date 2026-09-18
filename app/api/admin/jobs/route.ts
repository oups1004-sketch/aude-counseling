import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAdminSession } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorized() {
  const store = await cookies();
  return verifyAdminSession(store.get("aude_admin_token")?.value);
}

function decode(value: string) {
  return value
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET() {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sourceUrl = "https://www.counselors.or.kr/portal/service/recruitment?pageIndex=1";
    const response = await fetch(sourceUrl, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0 AUDE-admin/1.0" },
    });
    if (!response.ok) throw new Error(`Recruitment page ${response.status}`);
    const html = await response.text();

    const jobs = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
      .map((rowMatch) => {
        const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => decode(match[1]));
        if (cells.length < 7 || !/^\d{4,6}$/.test(cells[0])) return null;
        return {
          number: Number(cells[0]),
          title: cells[1],
          location: cells[2],
          employment: cells[3],
          pay: cells[4],
          period: cells[5],
          status: cells[6],
          sourceUrl,
        };
      })
      .filter(Boolean)
      .slice(0, 20);

    if (jobs.length === 0) throw new Error("Recruitment rows were not recognized.");

    return NextResponse.json({ jobs, checkedAt: new Date().toISOString(), sourceUrl });
  } catch (error) {
    console.error("Recruitment fetch failed", error);
    return NextResponse.json(
      {
        error: "한국상담학회 채용공고를 불러오지 못했습니다.",
        sourceUrl: "https://www.counselors.or.kr/portal/service/recruitment",
      },
      { status: 502 },
    );
  }
}
