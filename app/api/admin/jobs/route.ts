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

function allowedDetailUrl(value: string) {
  const decoded = decodeEntities(value).trim();
  try {
    const url = new URL(decoded, "https://www.counselors.or.kr/portal/service/recruitment");
    const allowedHosts = [
      "www.counselors.or.kr",
      "counselors.or.kr",
      "renewal.counselors.or.kr",
      "new.counselors.or.kr",
      "dev.counselors.or.kr",
      "imsi.counselors.or.kr",
    ];
    if (!allowedHosts.includes(url.hostname)) return null;
    const isPortal = url.pathname.includes("/portal/service/recruitment");
    const isLegacy = url.pathname.includes("/KOR/comm/job.php");
    if (!isPortal && !isLegacy) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function legacyDetailUrl(id: string) {
  return `https://new.counselors.or.kr/KOR/comm/job.php?code=job&idx=${id}&ptype=view`;
}

function extractDetailUrl(rowHtml: string, listNumber: string) {
  const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
  let hrefMatch: RegExpExecArray | null;
  while ((hrefMatch = hrefRegex.exec(rowHtml)) !== null) {
    const raw = hrefMatch[1] || "";
    if (/(recruitment|\/KOR\/comm\/job\.php)/i.test(raw) && /(view|idx=|ntt[_-]?id=|seq=)/i.test(raw)) {
      const url = allowedDetailUrl(raw);
      if (url) return url;
    }
  }

  const namedId = rowHtml.match(
    /(?:idx|ntt[_-]?id|nttId|seq|bbs[_-]?no|bbsNo|board[_-]?no|boardNo)\D{0,30}(\d{5,9})/i,
  );
  if (namedId?.[1]) return legacyDetailUrl(namedId[1]);

  const viewCall = rowHtml.match(
    /(?:view|detail|select|read|go|fn)[\w-]*\s*\([^)]*?["']?(\d{5,9})["']?/i,
  );
  if (viewCall?.[1]) return legacyDetailUrl(viewCall[1]);

  const numericCandidates: string[] = [];
  const numberRegex = /\b(\d{6})\b/g;
  let numberMatch: RegExpExecArray | null;
  while ((numberMatch = numberRegex.exec(rowHtml)) !== null) {
    const candidate = numberMatch[1];
    if (!candidate || candidate === listNumber) continue;
    if (!numericCandidates.includes(candidate)) numericCandidates.push(candidate);
  }

  if (numericCandidates.length > 0) {
    const likelyIdx = numericCandidates
      .map((value) => Number(value))
      .filter((value) => value >= 100000 && value <= 999999)
      .sort((a, b) => b - a)[0];
    if (likelyIdx) return legacyDetailUrl(String(likelyIdx));
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
      detailUrl: extractDetailUrl(rowHtml, cells[0] || ""),
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
