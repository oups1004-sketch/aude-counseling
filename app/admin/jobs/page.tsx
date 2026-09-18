"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Job = { number: number; title: string; location: string; employment: string; pay: string; period: string; status: string; sourceUrl: string };

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [auth, setAuth] = useState<"checking" | "ready" | "login">("checking");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [lastSeen, setLastSeen] = useState(0);
  const [checkedAt, setCheckedAt] = useState("");

  const load = useCallback(async () => {
    setError("");
    const response = await fetch("/api/admin/jobs", { cache: "no-store" });
    if (response.status === 401) return setAuth("login");
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setError(result.error || "공고를 불러오지 못했습니다."); setAuth("ready"); return; }
    setJobs(result.jobs || []);
    setCheckedAt(result.checkedAt || "");
    setAuth("ready");
  }, []);

  useEffect(() => { setLastSeen(Number(localStorage.getItem("aude_jobs_last_seen") || 0)); load(); }, [load]);

  const newest = jobs[0]?.number || 0;
  const newCount = jobs.filter((job) => job.number > lastSeen).length;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return !needle ? jobs : jobs.filter((job) => [job.title, job.location, job.employment, job.pay, job.period].some((value) => value.toLowerCase().includes(needle)));
  }, [jobs, query]);

  function markSeen() { if (!newest) return; localStorage.setItem("aude_jobs_last_seen", String(newest)); setLastSeen(newest); }

  if (auth === "checking") return <main className="adminShell"><div className="adminLoading">AUDE · 채용공고 확인 중</div></main>;
  if (auth === "login") return <main className="adminShell"><section className="adminLogin"><Link href="/admin" className="adminBrand">AUDE</Link><h1>로그인이 필요합니다.</h1><Link href="/admin" className="adminBack">← 관리자 로그인</Link></section></main>;

  return <main className="adminShell"><header className="adminHeader workspaceHeader"><div><Link href="/" className="adminBrand">AUDE</Link><span>통합 관리</span></div><nav><Link href="/admin">접수</Link><Link href="/admin/clients">내담자</Link><Link className="active" href="/admin/jobs">채용공고</Link></nav></header><section className="adminDashboard workspacePage"><div className="workspaceHeading"><div><p className="sectionNumber">JOB WATCH</p><h1>한국상담학회 채용공고</h1><p>최신 게시판을 불러와 새 공고를 한눈에 확인합니다.</p></div><div className="jobHeadingActions"><button onClick={load}>새로고침</button>{newCount > 0 && <button className="workspacePrimary" onClick={markSeen}>새 공고 {newCount}건 확인</button>}</div></div>
    <div className="workspaceMetrics"><div className="workspaceMetric"><strong>{jobs.length}</strong><span>불러온 공고</span></div><div className="workspaceMetric"><strong>{newCount}</strong><span>새 공고</span></div><div className="workspaceMetric wideMetric"><strong>{checkedAt ? new Date(checkedAt).toLocaleTimeString("ko-KR", { hour:"2-digit", minute:"2-digit" }) : "—"}</strong><span>마지막 확인</span></div></div>
    <div className="clientToolbar"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="기관·지역·채용형태 검색" /><a href="https://www.counselors.or.kr/portal/service/recruitment" target="_blank" rel="noreferrer">원문 게시판 ↗</a></div>
    {error && <div className="jobError"><strong>자동 불러오기에 실패했습니다.</strong><p>{error}</p><a href="https://www.counselors.or.kr/portal/service/recruitment" target="_blank" rel="noreferrer">한국상담학회 채용정보 직접 열기 ↗</a></div>}
    <div className="jobList">{filtered.map((job) => <article className={job.number > lastSeen ? "jobCard isNew" : "jobCard"} key={job.number}><div className="jobNo">{job.number}{job.number > lastSeen && <em>NEW</em>}</div><div className="jobBody"><h2>{job.title}</h2><div className="jobMeta"><span>{job.location}</span><span>{job.employment}</span><span>{job.pay}</span><span>{job.period}</span></div></div><span className="jobStatus">{job.status}</span></article>)}</div>
  </section></main>;
}
