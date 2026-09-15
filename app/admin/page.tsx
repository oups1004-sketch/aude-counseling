"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Kind = "intake" | "assessment" | "story";
type Submission = {
  id: string;
  reference_code: string;
  kind: Kind;
  status: string;
  created_at: string;
  name: string | null;
  nickname: string | null;
  age_group: string | null;
  contact: string | null;
  service: string | null;
  preferred_time: string | null;
  message: string | null;
  content_consent: boolean;
  admin_note: string | null;
};

const tabs: Array<{ key: "all" | Kind; label: string }> = [
  { key: "all", label: "전체 접수" },
  { key: "intake", label: "상담 신청" },
  { key: "assessment", label: "심리검사" },
  { key: "story", label: "사연" },
];

const kindLabel: Record<Kind, string> = {
  intake: "상담 신청",
  assessment: "심리검사",
  story: "사연",
};

export default function AdminPage() {
  const [items, setItems] = useState<Submission[]>([]);
  const [auth, setAuth] = useState<"checking" | "login" | "ready">("checking");
  const [activeTab, setActiveTab] = useState<"all" | Kind>("all");
  const [query, setQuery] = useState("");
  const [loginError, setLoginError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Submission | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/submissions", { cache: "no-store" });
    if (response.status === 401) {
      setAuth("login");
      return;
    }
    if (!response.ok) throw new Error("목록을 불러오지 못했습니다.");
    setItems(await response.json());
    setAuth("ready");
  }, []);

  useEffect(() => {
    load().catch(() => setAuth("login"));
  }, [load]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setLoginError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: data.get("password") }),
    });
    setBusy(false);
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setLoginError(result.error || "로그인하지 못했습니다.");
      return;
    }
    await load();
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setItems([]);
    setAuth("login");
  }

  async function save(item: Submission, status: string, adminNote: string) {
    setBusy(true);
    const response = await fetch("/api/admin/submissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, status, adminNote }),
    });
    setBusy(false);
    if (!response.ok) return alert("저장하지 못했습니다.");
    setSelected(null);
    await load();
  }

  async function remove(item: Submission) {
    if (!confirm(`${item.reference_code} 접수를 영구 삭제할까요? 삭제 후 복구할 수 없습니다.`)) return;
    const response = await fetch(`/api/admin/submissions?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
    if (!response.ok) return alert("삭제하지 못했습니다.");
    setSelected(null);
    await load();
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (activeTab !== "all" && item.kind !== activeTab) return false;
      if (!needle) return true;
      return [item.reference_code, item.name, item.nickname, item.contact, item.service, item.message]
        .some((value) => value?.toLowerCase().includes(needle));
    });
  }, [activeTab, items, query]);

  function exportCsv() {
    const rows = [
      ["접수번호", "접수일시", "종류", "상태", "이름·닉네임", "연령대", "연락처", "서비스", "희망시간", "내용", "콘텐츠동의", "관리자메모"],
      ...filtered.map((item) => [
        item.reference_code,
        item.created_at,
        kindLabel[item.kind],
        item.status,
        item.name || item.nickname || "",
        item.age_group || "",
        item.contact || "",
        item.service || "",
        item.preferred_time || "",
        item.message || "",
        item.content_consent ? "동의" : "미동의",
        item.admin_note || "",
      ]),
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aude-submissions-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (auth === "checking") {
    return <main className="adminShell"><div className="adminLoading">AUDE · 관리자 확인 중</div></main>;
  }

  if (auth === "login") {
    return (
      <main className="adminShell">
        <section className="adminLogin">
          <Link href="/" className="adminBrand">AUDE</Link>
          <p className="sectionNumber">PRIVATE OFFICE</p>
          <h1>관리자 로그인</h1>
          <p>접수된 사연과 상담 신청은 관리자만 확인할 수 있습니다.</p>
          <form onSubmit={login}>
            <label>관리자 비밀번호<input name="password" type="password" autoComplete="current-password" required autoFocus /></label>
            {loginError && <p className="adminError">{loginError}</p>}
            <button type="submit" disabled={busy}>{busy ? "확인 중…" : "로그인"}</button>
          </form>
          <Link href="/" className="adminBack">← 아우데 홈페이지로</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="adminShell">
      <header className="adminHeader">
        <div><Link href="/" className="adminBrand">AUDE</Link><span>접수 관리</span></div>
        <button onClick={logout}>로그아웃</button>
      </header>

      <section className="adminDashboard">
        <div className="adminTitle">
          <div><p className="sectionNumber">PRIVATE OFFICE</p><h1>접수 관리</h1></div>
          <div className="adminStats"><strong>{items.filter((item) => item.status === "신규").length}</strong><span>새 접수</span></div>
        </div>

        <div className="adminToolbar">
          <div className="adminTabs">
            {tabs.map((tab) => (
              <button key={tab.key} className={activeTab === tab.key ? "active" : ""} onClick={() => setActiveTab(tab.key)}>
                {tab.label}<span>{tab.key === "all" ? items.length : items.filter((item) => item.kind === tab.key).length}</span>
              </button>
            ))}
          </div>
          <div className="adminActions">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름·연락처·내용 검색" />
            <button onClick={exportCsv}>CSV 저장</button>
          </div>
        </div>

        <div className="adminList">
          {filtered.length === 0 && <div className="adminEmpty">아직 표시할 접수가 없습니다.</div>}
          {filtered.map((item) => (
            <button className="submissionRow" key={item.id} onClick={() => setSelected(item)}>
              <span className={`submissionKind ${item.kind}`}>{kindLabel[item.kind]}</span>
              <span className="submissionMain"><strong>{item.name || item.nickname || "익명"}</strong><small>{item.message || "신청 내용 없음"}</small></span>
              <span className="submissionDate">{new Date(item.created_at).toLocaleDateString("ko-KR")}<small>{item.reference_code}</small></span>
              <span className={`submissionStatus status-${item.status.replace(" ", "-")}`}>{item.status}</span>
            </button>
          ))}
        </div>
      </section>

      {selected && <SubmissionModal item={selected} busy={busy} onClose={() => setSelected(null)} onSave={save} onDelete={remove} />}
    </main>
  );
}

function SubmissionModal({ item, busy, onClose, onSave, onDelete }: {
  item: Submission;
  busy: boolean;
  onClose: () => void;
  onSave: (item: Submission, status: string, note: string) => void;
  onDelete: (item: Submission) => void;
}) {
  const [status, setStatus] = useState(item.status);
  const [note, setNote] = useState(item.admin_note || "");

  return (
    <div className="adminModalBackdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="adminModal" role="dialog" aria-modal="true" aria-label="접수 상세">
        <button className="adminModalClose" onClick={onClose} aria-label="닫기">×</button>
        <p className="sectionNumber">{item.reference_code}</p>
        <h2>{item.name || item.nickname || "익명"}</h2>
        <div className="submissionDetails">
          <Detail label="구분" value={kindLabel[item.kind]} />
          <Detail label="접수일시" value={new Date(item.created_at).toLocaleString("ko-KR")} />
          <Detail label="연령대" value={item.age_group} />
          <Detail label="연락처" value={item.contact} />
          <Detail label="상담 유형" value={item.service} />
          <Detail label="희망 시간" value={item.preferred_time} />
          <Detail label={item.kind === "story" ? "사연" : "신청 이유"} value={item.message} wide />
          {item.kind === "story" && <Detail label="콘텐츠 활용" value={item.content_consent ? "동의" : "동의하지 않음"} />}
        </div>
        <label className="adminField">상태<select value={status} onChange={(event) => setStatus(event.target.value)}>
          {["신규", "확인", "연락 완료", "진행", "종결"].map((value) => <option key={value}>{value}</option>)}
        </select></label>
        <label className="adminField">관리자 메모<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} /></label>
        <div className="adminModalActions">
          <button className="danger" onClick={() => onDelete(item)}>삭제</button>
          <button className="save" disabled={busy} onClick={() => onSave(item, status, note)}>{busy ? "저장 중…" : "변경사항 저장"}</button>
        </div>
      </section>
    </div>
  );
}

function Detail({ label, value, wide = false }: { label: string; value: string | null; wide?: boolean }) {
  if (!value) return null;
  return <div className={wide ? "detailWide" : ""}><dt>{label}</dt><dd>{value}</dd></div>;
}
