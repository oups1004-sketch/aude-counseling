"use client";

import { useCallback, useEffect, useState } from "react";
import "./visitor-stats.css";

type Stats = { today: number; month: number; date: string };
export default function VisitorStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch("/api/admin/visitors", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setStats(await response.json());
    } catch { setError(true); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <section className="visitorStats" aria-label="홈페이지 방문 통계" aria-busy={busy}>
    <div className="visitorStatsHeading"><div><h2>홈페이지 방문</h2><p>아우데에 찾아온 발걸음</p></div><button type="button" disabled={busy} onClick={load}>{busy ? "불러오는 중…" : "새로고침"}</button></div>
    {error ? <p role="status">방문 통계를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p> : <dl><div><dt>오늘 방문자</dt><dd>{stats ? stats.today.toLocaleString("ko-KR") : "—"}<small>명</small></dd></div><div><dt>이번 달 방문자</dt><dd>{stats ? stats.month.toLocaleString("ko-KR") : "—"}<small>명</small></dd></div></dl>}
    <p className="visitorStatsNote">한국 시간 기준 · 같은 브라우저의 재방문은 기간별 1회 집계 · 관리자 로그인 중 방문 제외<br />기능 적용 이후부터 집계됩니다.{stats && ` (${stats.date} 기준)`}</p>
  </section>;
}
