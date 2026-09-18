import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAdminSession } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Job = {
  number: number;
  title: string;
  location: string;
  employment: string;
  pay: string;
  period: string;
  status: string;
  sourceUrl: string;
  detailUrl: string | null;
};

async function authorized() {
  const store = await cookies();
  return verifyAdminSession(store.get("aude_admin_token")?.value);
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');
}

function decode(value: string) {
  return decodeEntities(value)
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteRecruitmentUrl(value: string) {
  const decoded = decodeEntities(value).trim();
  try {
    const url = new URL(decoded, "https://www.counselors.or.kr/portal/service/recruitment");
    if (!["www.counselors.or.kr", "renewal.counselors.or.kr"].includes(url.hostname)) return null;
    if (!url.pathname.includes("/portal/service/recruitment")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function extractDetailUrl(rowHtml: string) {
  const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
  let hrefMatch: RegExpExecArray | null;
  while ((hrefMatch = hrefRegex.exec(rowHtml)) !== null) {
    const raw = hrefMatch[1] || "";
    if (/recruitment/i.test(raw) && /(act=view|ntt[_-]?id=|idx=)/i.test(raw)) {
      const url = absoluteRecruitmentUrl(raw);
      if (url) return url;
    }
    if (/(act=view|ntt[_-]?id=|idx=)/i.test(raw)) {
      const url = absoluteRecruitmentUrl(raw);
      if (url) return url;
    }
  }

  const directId = rowHtml.match(/(?:ntt[_-]?id|nttId|idx)\s*[:=,'")\s]+(\d{4,})/i);
  if (directId?.[1]) {
    return `https://www.counselors.or.kr/portal/service/recruitment?act=view&ntt_id=${directId[1]}`;
  }

  const viewCall = rowHtml.match(/(?:view|goView|fnView|fn_view)[^(]*\([^)]*?['"]?(\d{5,})['"]?/i);
  if (viewCall?.[1]) {
    return `https://www.counselors.or.kr/portal/service/recruitment?act=view&ntt_id=${viewCall[1]}`;
  }

  return null;
}

function parseJobs(html: string, sourceUrl: string) {
  const jobs: Job[] = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(html)) !== null && jobs.length < 20) {
    const rowHtml = rowMatch[1] || "";
    const cells: string[] = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(decode(cellMatch[1] || ""));
    }

    if (cells.length < 7 || !/^\d{4,6}$/.test(cells[0] || "")) continue;

    jobs.push({
      number: Number(cells[0]),
      title: cells[1] || "",
      location: cells[2] || "",
      employment: cells[3] || "",
      pay: cells[4] || "",
      period: cells[5] || "",
      status: cells[6] || "",
      sourceUrl,
      detailUrl: extractDetailUrl(rowHtml),
    });
  }

  return jobs;
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

    const jobs = parseJobs(await response.text(), sourceUrl);
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
