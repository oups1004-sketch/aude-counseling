import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAdminSession } from "../../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedHosts = [
  "www.counselors.or.kr",
  "counselors.or.kr",
  "renewal.counselors.or.kr",
  "new.counselors.or.kr",
  "dev.counselors.or.kr",
  "imsi.counselors.or.kr",
];

async function authorized() {
  const store = await cookies();
  return verifyAdminSession(store.get("aude_admin_token")?.value);
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function htmlToText(value: string) {
  return decodeEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--([\s\S]*?)-->/g, "")
    .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/article)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeDetailUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (!allowedHosts.includes(url.hostname)) return null;
    const isPortal = url.pathname.includes("/portal/service/recruitment");
    const isLegacy = url.pathname.includes("/KOR/comm/job.php");
    if (!isPortal && !isLegacy) return null;
    return url;
  } catch {
    return null;
  }
}

function extractId(url: URL) {
  for (const key of ["idx", "ntt_id", "nttId", "seq", "bbsNo", "boardNo"]) {
    const value = url.searchParams.get(key);
    if (value && /^\d{5,9}$/.test(value)) return value;
  }

  const fromRaw = url.toString().match(/(?:idx|ntt[_-]?id|seq|bbsNo|boardNo)[^0-9]{0,8}(\d{5,9})/i);
  return fromRaw?.[1] || null;
}

function candidateUrls(original: URL) {
  const candidates: URL[] = [];
  const seen = new Set<string>();

  function add(value: URL) {
    const key = value.toString();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(value);
  }

  add(original);

  const id = extractId(original);
  if (id) {
    for (const host of ["new.counselors.or.kr", "dev.counselors.or.kr", "imsi.counselors.or.kr", "counselors.or.kr", "www.counselors.or.kr"]) {
      add(new URL(`https://${host}/KOR/comm/job.php?code=job&idx=${id}&ptype=view`));
    }
  }

  return candidates;
}

function extractRelevantText(html: string, title: string) {
  const text = htmlToText(html);
  if (!text) return "";

  let start = title ? text.indexOf(title) : -1;
  if (start < 0 && title) {
    const shortened = title.replace(/^\([^)]*\)\s*/, "").slice(0, 28);
    if (shortened) start = text.indexOf(shortened);
  }
  if (start < 0) {
    const marker = text.indexOf("채용정보");
    start = marker >= 0 ? marker : 0;
  }

  let relevant = text.slice(start);
  const tailMarkers = ["이전글", "다음글", "개인정보 취급방침", "© Copyright", "(사)한국상담학회 | 대표자"];
  for (const marker of tailMarkers) {
    const index = relevant.indexOf(marker);
    if (index > 300) relevant = relevant.slice(0, index);
  }

  return relevant.trim().slice(0, 24000);
}

function contentLooksValid(content: string, title: string) {
  if (content.length < 180) return false;
  const compactTitle = title.replace(/^\([^)]*\)\s*/, "").replace(/\s+/g, "").slice(0, 14);
  const compactContent = content.replace(/\s+/g, "");
  const titleMatches = !compactTitle || compactContent.includes(compactTitle);
  const detailSignals = /(근무조건|지원자격|자격요건|담당자|제출서류|채용분야|모집내용|급여)/.test(content);
  return titleMatches || detailSignals;
}

function extractAttachments(html: string, baseUrl: URL) {
  const attachments: Array<{ label: string; url: string }> = [];
  const anchorRegex = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null && attachments.length < 12) {
    const label = htmlToText(match[2] || "").replace(/\s+/g, " ").trim();
    if (!label || !/(첨부|다운로드|\.pdf|\.hwp|\.hwpx|\.docx?|\.xlsx?|지원서|공고문)/i.test(label)) continue;
    try {
      const url = new URL(decodeEntities(match[1] || ""), baseUrl);
      if (!allowedHosts.includes(url.hostname)) continue;
      if (!attachments.some((item) => item.url === url.toString())) attachments.push({ label, url: url.toString() });
    } catch {}
  }

  return attachments;
}

async function fetchCandidate(url: URL, title: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 AUDE-admin/1.0" },
    });
    if (!response.ok) return null;

    const html = await response.text();
    const content = extractRelevantText(html, title);
    if (!contentLooksValid(content, title)) return null;

    const finalUrl = safeDetailUrl(response.url) || url;
    return {
      content,
      attachments: extractAttachments(html, finalUrl),
      sourceUrl: finalUrl.toString(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: Request) {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requestUrl = new URL(request.url);
  const rawUrl = requestUrl.searchParams.get("url") || "";
  const title = (requestUrl.searchParams.get("title") || "").slice(0, 300);
  const original = safeDetailUrl(rawUrl);

  if (!original) {
    return NextResponse.json({ error: "상세 주소가 올바르지 않습니다." }, { status: 400 });
  }

  const candidates = candidateUrls(original);
  for (const candidate of candidates) {
    const result = await fetchCandidate(candidate, title);
    if (result) return NextResponse.json(result);
  }

  return NextResponse.json(
    {
      error: "학회 상세페이지 연결 방식이 바뀌어 본문을 찾지 못했습니다. 아래 원문 보기로 확인해 주세요.",
      sourceUrl: original.toString(),
    },
    { status: 502 },
  );
}
