import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAdminSession } from "../../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    if (!["www.counselors.or.kr", "renewal.counselors.or.kr"].includes(url.hostname)) return null;
    if (!url.pathname.includes("/portal/service/recruitment")) return null;
    return url;
  } catch {
    return null;
  }
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

function extractAttachments(html: string, baseUrl: URL) {
  const attachments: Array<{ label: string; url: string }> = [];
  const anchorRegex = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null && attachments.length < 12) {
    const label = htmlToText(match[2] || "").replace(/\s+/g, " ").trim();
    if (!label || !/(첨부|다운로드|\.pdf|\.hwp|\.hwpx|\.docx?|\.xlsx?|지원서|공고문)/i.test(label)) continue;
    try {
      const url = new URL(decodeEntities(match[1] || ""), baseUrl);
      if (!["www.counselors.or.kr", "renewal.counselors.or.kr"].includes(url.hostname)) continue;
      if (!attachments.some((item) => item.url === url.toString())) attachments.push({ label, url: url.toString() });
    } catch {}
  }

  return attachments;
}

export async function GET(request: Request) {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requestUrl = new URL(request.url);
  const rawUrl = requestUrl.searchParams.get("url") || "";
  const title = (requestUrl.searchParams.get("title") || "").slice(0, 300);
  const url = safeDetailUrl(rawUrl);
  if (!url) return NextResponse.json({ error: "상세 주소가 올바르지 않습니다." }, { status: 400 });

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0 AUDE-admin/1.0" },
    });
    if (!response.ok) throw new Error(`Detail page ${response.status}`);
    const html = await response.text();
    const content = extractRelevantText(html, title);

    if (!content) throw new Error("Detail content was empty.");

    return NextResponse.json({
      content,
      attachments: extractAttachments(html, url),
      sourceUrl: url.toString(),
    });
  } catch (error) {
    console.error("Recruitment detail fetch failed", error);
    return NextResponse.json({ error: "공고 상세 내용을 불러오지 못했습니다.", sourceUrl: url.toString() }, { status: 502 });
  }
}
