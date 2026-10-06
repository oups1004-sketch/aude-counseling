import { NextRequest, NextResponse } from 'next/server';
import { admin, privateHeaders } from '../../../lib/tat';

export const runtime = 'nodejs';
export const revalidate = 86400;

type Holiday = { date?: string; localName?: string };

export async function GET(request: NextRequest) {
  if (!await admin()) return NextResponse.json({ error: '관리자 로그인이 필요합니다.' }, { status: 401 });
  const year = Number(request.nextUrl.searchParams.get('year'));
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return NextResponse.json({ error: '연도를 확인해 주세요.' }, { status: 400 });

  try {
    const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/KR`, { next: { revalidate: 86400 } });
    if (!response.ok) throw new Error('holiday fetch failed');
    const holidays = (await response.json() as Holiday[])
      .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(String(item.date)))
      .map((item) => ({ date: item.date!, name: item.localName || '공휴일' }));
    return NextResponse.json({ holidays }, { headers: privateHeaders });
  } catch (error) {
    console.error('Holiday calendar failed', error);
    return NextResponse.json({ holidays: [], unavailable: true }, { headers: privateHeaders });
  }
}
