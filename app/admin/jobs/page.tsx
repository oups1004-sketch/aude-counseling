"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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

type JobDetail = {
  content: string;
  attachments: Array<{ label: string; url: string }>;
  sourceUrl: string;
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [auth, setAuth] = useState<"checking" | "ready" | "login">("checking");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [lastSeen, setLastSeen] = useState(0);
  const [checkedAt, setCheckedAt] = useState("");
  const [selected, setSelected] = useState<Job | null>(null);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [saved, setSaved] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setError("");
    const response = await fetch("/api/admin/jobs", { cache: "no-store" });
    if (response.status === 401) return setAuth("login");
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(result.error || "공고를 불러오지 못했습니다.");
      setAuth("ready");
      return;
    }
    setJobs(result.jobs || []);
    setCheckedAt(result.checkedAt || "");
    setAuth("ready");
  }, []);

  useEffect(() => {
    setLastSeen(Number(localStorage.getItem("aude_jobs_last_seen") || 0));
    try {
      const raw = JSON.parse(localStorage.getItem("aude_saved_jobs") || "[]");
      setSaved(new Set(Array.isArray(raw) ? raw.map(Number) : []));
    } catch {
      setSaved(new Set());
    }
    load();
  }, [load]);

  const newest = jobs[0]?.number || 0;
  const newCount = jobs.filter((job) => job.number > lastSeen).length;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return !needle
      ? jobs
      : jobs.filter((job) =>
          [job.title, job.location, job.employment, job.pay, job.period]
            .some((value) => value.toLowerCase().includes(needle)),
        );
  }, [jobs, query]);

  function markSeen() {
    if (!newest) return;
    localStorage.setItem("aude_jobs_last_seen", String(newest));
    setLastSeen(newest);
  }

  function toggleSaved(number: number) {
    setSaved((current) => {
      const next = new Set(current);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      localStorage.setItem("aude_saved_jobs", JSON.stringify(Array.from(next)));
      return next;
    });
  }

  async function openJob(job: Job) {
    setSelected(job);
    setDetail(null);
    setDetailError("");

    if (!job.detailUrl) {
      setDetailError("이 공고의 상세주소를 목록에서 찾지 못했습니다. 원문 게시판에서 확인해 주세요.");
      return;
    }

    setDetailLoading(true);
    const response = await fetch(
      `/api/admin/jobs/detail?url=${encodeURIComponent(job.detailUrl)}&title=${encodeURIComponent(job.title)}`,
      { cache: "no-store" },
    );
    const result = await response.json().catch(() => ({}));
    setDetailLoading(false);

    if (!response.ok) {
      setDetailError(result.error || "상세 내용을 불러오지 못했습니다.");
      return;
    }

    setDetail(result);
  }

  if (auth === "checking") {
    return <main className="adminShell"><div className="adminLoading">AUDE · 채용공고 확인 중</div></main>;
  }

  if (auth === "login") {
    return (
      <main className="adminShell">
        <section className="adminLogin">
          <Link href="/admin" className="adminBrand">AUDE</Link>
          <h1>로그인이 필요합니다.</h1>
          <Link href="/admin" className="adminBack">← 관리자 로그인</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="adminShell">
      <header className="adminHeader workspaceHeader">
        <div><Link href="/" className="adminBrand">AUDE</Link><span>통합 관리</span></div>
        <nav>
          <Link href="/admin">접수</Link>
          <Link href="/admin/clients">내담자</Link>
          <Link className="active" href="/admin/jobs">채용공고</Link>
        </nav>
      </header>

      <section className="adminDashboard workspacePage">
        <div className="workspaceHeading">
          <div>
            <p className="sectionNumber">JOB WATCH</p>
            <h1>한국상담학회 채용공고</h1>
            <p>공고를 클릭하면 원문 내용을 관리자 안에서 바로 확인할 수 있습니다.</p>
          </div>
          <div className="jobHeadingActions">
            <button onClick={load}>새로고침</button>
            {newCount > 0 && <button className="workspacePrimary" onClick={markSeen}>새 공고 {newCount}건 확인</button>}
          </div>
        </div>

        <div className="workspaceMetrics">
          <div className="workspaceMetric"><strong>{jobs.length}</strong><span>불러온 공고</span></div>
          <div className="workspaceMetric"><strong>{newCount}</strong><span>새 공고</span></div>
          <div className="workspaceMetric"><strong>{saved.size}</strong><span>관심 공고</span></div>
          <div className="workspaceMetric"><strong>{checkedAt ? new Date(checkedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "—"}</strong><span>마지막 확인</span></div>
        </div>

        <div className="clientToolbar">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="기관·지역·채용형태 검색" />
          <a href="https://www.counselors.or.kr/portal/service/recruitment" target="_blank" rel="noreferrer">원문 게시판 ↗</a>
        </div>

        {error && (
          <div className="jobError">
            <strong>자동 불러오기에 실패했습니다.</strong>
            <p>{error}</p>
            <a href="https://www.counselors.or.kr/portal/service/recruitment" target="_blank" rel="noreferrer">한국상담학회 채용정보 직접 열기 ↗</a>
          </div>
        )}

        <div className="jobList">
          {filtered.map((job) => (
            <article className={job.number > lastSeen ? "jobCard isNew" : "jobCard"} key={job.number}>
              <button className="jobOpen" onClick={() => openJob(job)}>
                <span className="jobNo">
                  {job.number}
                  {job.number > lastSeen && <em>NEW</em>}
                  {saved.has(job.number) && <em className="saved">★</em>}
                </span>
                <span className="jobBody">
                  <strong>{job.title}</strong>
                  <span className="jobMeta">
                    <span>{job.location}</span>
                    <span>{job.employment}</span>
                    <span>{job.pay}</span>
                    <span>{job.period}</span>
                  </span>
                </span>
                <span className="jobStatus">{job.status}</span>
                <span className="jobChevron">›</span>
              </button>
            </article>
          ))}
        </div>
      </section>

      {selected && (
        <JobDetailModal
          job={selected}
          detail={detail}
          loading={detailLoading}
          error={detailError}
          saved={saved.has(selected.number)}
          onToggleSaved={() => toggleSaved(selected.number)}
          onClose={() => {
            setSelected(null);
            setDetail(null);
            setDetailError("");
          }}
        />
      )}
    </main>
  );
}

function JobDetailModal({
  job,
  detail,
  loading,
  error,
  saved,
  onToggleSaved,
  onClose,
}: {
  job: Job;
  detail: JobDetail | null;
  loading: boolean;
  error: string;
  saved: boolean;
  onToggleSaved: () => void;
  onClose: () => void;
}) {
  const sourceUrl = detail?.sourceUrl || job.detailUrl || job.sourceUrl;
  const lines = (detail?.content || "").split("\n").filter((line) => line.trim());

  return (
    <div className="adminModalBackdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="adminModal jobDetailModal" role="dialog" aria-modal="true">
        <button className="adminModalClose" onClick={onClose} aria-label="닫기">×</button>

        <div className="jobDetailTopline">
          <p className="sectionNumber">RECRUITMENT · {job.number}</p>
          <button className={saved ? "jobSave active" : "jobSave"} onClick={onToggleSaved}>
            {saved ? "★ 관심공고 저장됨" : "☆ 관심공고"}
          </button>
        </div>

        <h2>{job.title}</h2>

        <div className="jobDetailMeta">
          <DetailItem label="근무지" value={job.location} />
          <DetailItem label="채용형태" value={job.employment} />
          <DetailItem label="급여" value={job.pay} />
          <DetailItem label="모집기간" value={job.period} />
          <DetailItem label="모집상태" value={job.status} />
        </div>

        {loading && <div className="jobDetailLoading">공고 원문을 불러오는 중…</div>}

        {error && (
          <div className="jobError">
            <strong>상세 내용을 자동으로 읽지 못했습니다.</strong>
            <p>{error}</p>
          </div>
        )}

        {detail && (
          <>
            {detail.attachments.length > 0 && (
              <div className="jobAttachments">
                <strong>첨부파일</strong>
                <div>
                  {detail.attachments.map((item) => (
                    <a key={item.url} href={item.url} target="_blank" rel="noreferrer">{item.label} ↗</a>
                  ))}
                </div>
              </div>
            )}

            <div className="jobOriginalContent">
              <h3>공고 내용</h3>
              <div>
                {lines.map((line, index) => (
                  <p className={isImportantHeading(line) ? "importantLine" : ""} key={index}>{line}</p>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="jobDetailActions">
          <button onClick={onClose}>닫기</button>
          <a href={sourceUrl} target="_blank" rel="noreferrer">한국상담학회 원문 보기 ↗</a>
        </div>
      </section>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value || "—"}</strong></div>;
}

function isImportantHeading(line: string) {
  const compact = line.replace(/\s/g, "");
  return /(지원자격|자격요건|응시자격|담당업무|주요업무|근무조건|근무시간|급여|보수|제출서류|접수방법|지원방법|전형일정|채용절차|모집분야)/.test(compact)
    && line.length < 70;
}
