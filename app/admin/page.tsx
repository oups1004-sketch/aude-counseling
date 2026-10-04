"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import "./story-management.css";

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
  gender: string | null;
  contact: string | null;
  service: string | null;
  preferred_time: string | null;
  message: string | null;
  content_consent: boolean;
  admin_note: string | null;
  client_status?: string | null;
  important?: boolean;
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

function displayName(item: Submission) {
  return item.name || item.nickname || "익명";
}

export default function AdminPage() {
  const [items, setItems] = useState<Submission[]>([]);
  const [auth, setAuth] = useState<"checking" | "login" | "ready">("checking");
  const [activeTab, setActiveTab] = useState<"all" | Kind>("all");
  const [query, setQuery] = useState("");
  const [loginError, setLoginError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [counselingOpen, setCounselingOpen] = useState(true);
  const [statusBusy, setStatusBusy] = useState(false);
  const [onlyNew, setOnlyNew] = useState(false);
  const [decisionFilter, setDecisionFilter] = useState("전체");
  const [storyFilter, setStoryFilter] = useState("전체");
  const [onlyImportant, setOnlyImportant] = useState(false);
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function closeDetail() {
    if (busy || (dirty && !confirm("저장하지 않은 변경사항을 버릴까요?"))) return;
    setSelected(null);
    setDirty(false);
  }
  function openDetail(item: Submission) {
    if (busy || selected?.id === item.id || (dirty && !confirm("저장하지 않은 변경사항을 버릴까요?"))) return;
    setSelected(item);
    setDirty(false);
  }

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/submissions", { cache: "no-store" });
    if (response.status === 401) {
      setAuth("login");
      return;
    }
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.detail || result.error || "목록을 불러오지 못했습니다.");
    }
    setItems(await response.json());
    const statusResponse = await fetch("/api/admin/counseling-status", { cache: "no-store" });
    if (statusResponse.ok) setCounselingOpen((await statusResponse.json()).counselingOpen !== false);
    setAuth("ready");
  }, []);

  useEffect(() => {
    load().catch((error) => {
      setLoginError(`관리자 자료를 불러오지 못했습니다. (${error instanceof Error ? error.message : "알 수 없는 오류"})`);
      setAuth("login");
    });
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
    window.location.reload();
  }

  async function logout() {
    if (busy || (dirty && !confirm("저장하지 않은 변경사항을 버리고 로그아웃할까요?"))) return;
    await fetch("/api/admin/logout", { method: "POST" });
    setItems([]);
    setSelectedIds(new Set());
    setSelected(null);
    setDirty(false);
    setAuth("login");
  }

  async function toggleCounselingStatus() {
    const next = !counselingOpen;
    const message = next
      ? "상담 신청을 다시 받으시겠습니까? 본 사이트의 신청 버튼이 즉시 활성화됩니다."
      : "상담 신청을 중지하시겠습니까? 본 사이트에 마감 안내가 표시되고 신청이 차단됩니다.";
    if (!confirm(message)) return;
    setStatusBusy(true);
    const response = await fetch("/api/admin/counseling-status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ counselingOpen: next }),
    });
    setStatusBusy(false);
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      return alert(`${result.error || "상담 신청 상태를 변경하지 못했습니다."}${result.detail ? `\n${result.detail}` : ""}`);
    }
    setCounselingOpen(next);
  }

  async function save(item: Submission, status: string, adminNote: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/submissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, status, adminNote }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "저장하지 못했습니다. 다시 시도해 주세요.");
      const updated = { ...item, status, admin_note: adminNote, client_status: item.kind !== "story" && status === "확정" ? item.client_status || "진행" : item.client_status };
      setItems((current) => current.map((entry) => entry.id === item.id ? updated : entry));
      setSelected(updated);
      setDirty(false);
      setNotice(item.kind !== "story" && status === "확정" ? "✓ 확정했어요. 내담자 관리에서 상담을 이어갈 수 있습니다." : "✓ 변경사항을 저장했어요");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "저장하지 못했습니다. 연결을 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleImportant(item: Submission) {
    if (busy) return;
    setBusy(true);
    try {
      const important = !item.important;
      const response = await fetch("/api/admin/submissions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, important }) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "별표를 저장하지 못했습니다.");
      setItems(current => current.map(entry => entry.id === item.id ? { ...entry, important } : entry));
      setSelected(current => current?.id === item.id ? { ...current, important } : current);
      setNotice(important ? "★ 중요 사연으로 표시했어요" : "중요 표시를 해제했어요");
    } catch (error) { setNotice(error instanceof Error ? error.message : "별표를 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function remove(item: Submission) {
    if (!confirm(`${displayName(item)} 접수를 정말 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`)) return;
    const response = await fetch(`/api/admin/submissions?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
    if (!response.ok) return alert((await response.json().catch(() => ({}))).error || "삭제하지 못했습니다.");
    setSelected(null);
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });
    await load();
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (activeTab !== "story" && onlyNew && item.status !== "신규" && !(item.kind === "story" && item.status === "미답장")) return false;
      if (activeTab === "story" && ((onlyImportant && !item.important) || (storyFilter !== "전체" && item.status !== storyFilter))) return false;
      if (activeTab !== "story" && decisionFilter !== "전체" && (item.kind === "story" || item.status !== decisionFilter)) return false;
      if (activeTab !== "all" && item.kind !== activeTab) return false;
      if (!needle) return true;
      return [item.reference_code, item.name, item.nickname, item.age_group, item.gender, item.contact, item.service, item.message]
        .some((value) => value?.toLowerCase().includes(needle));
    });
  }, [activeTab, items, query, onlyNew, decisionFilter, storyFilter, onlyImportant]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds],
  );

  const allFilteredSelected = filtered.length > 0 && filtered.every((item) => selectedIds.has(item.id));

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allFilteredSelected) filtered.forEach((item) => next.delete(item.id));
      else filtered.forEach((item) => next.add(item.id));
      return next;
    });
  }

  async function removeSelected() {
    if (selectedItems.length === 0 || busy) return;

    const first = selectedItems[0];
    const message = selectedItems.length === 1
      ? `${displayName(first)} 접수를 정말 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`
      : `${displayName(first)} 외 ${selectedItems.length - 1}건을 정말 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`;

    if (!confirm(message)) return;

    setBusy(true);
    const results = await Promise.all(
      selectedItems.map(async (item) => {
        try {
          const response = await fetch(`/api/admin/submissions?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
          return { id: item.id, ok: response.ok };
        } catch {
          return { id: item.id, ok: false };
        }
      }),
    );
    setBusy(false);

    const failedIds = new Set(results.filter((result) => !result.ok).map((result) => result.id));
    setSelectedIds(failedIds);
    await load();

    if (failedIds.size > 0) {
      alert(`${selectedItems.length - failedIds.size}건은 삭제했지만 ${failedIds.size}건은 삭제하지 못했습니다. 다시 시도해 주세요.`);
    }
  }

  function exportCsv() {
    const rows = [
      ["접수번호", "접수일시", "종류", "상태", "이름·닉네임", "연령대", "성별", "연락처", "서비스", "희망시간", "내용", "콘텐츠동의", "관리자메모", "중요 사연"],
      ...filtered.map((item) => [
        item.reference_code,
        item.created_at,
        kindLabel[item.kind],
        item.status,
        item.name || item.nickname || "",
        item.age_group || "",
        item.gender || "",
        item.contact || "",
        item.service || "",
        item.preferred_time || "",
        item.message || "",
        item.content_consent ? "동의" : "미동의",
        item.admin_note || "",
        item.kind === "story" && item.important ? "중요" : "",
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
    <main className={`adminShell intakeWorkspace ${selected ? "hasDetail" : ""}`}>
      <header className="adminHeader workspaceHeader">
        <div><Link href="/" className="adminBrand">AUDE</Link><span>통합 관리</span></div>
        <nav>
          <Link className="active" href="/admin">접수</Link>
          <Link href="/admin/clients">내담자</Link>
          <Link href="/admin/assessments">투사검사</Link>
        </nav>
        <Link href="/" className="adminHomeLink" target="_blank" rel="noopener noreferrer">홈페이지 보기 ↗</Link>
        <button onClick={logout}>로그아웃</button>
      </header>

      <section className="adminDashboard">
        <div className="adminTitle">
          <div><p className="sectionNumber">PRIVATE OFFICE</p><h1>접수 관리</h1></div>
          <button className={`adminStats newShortcut ${onlyNew ? "active" : ""}`} onClick={() => { setActiveTab("all"); setDecisionFilter("전체"); setOnlyNew(!onlyNew); }} aria-pressed={onlyNew}><strong>{items.filter((item) => (item.status === "신규" || (item.kind === "story" && item.status === "미답장"))).length}</strong><span>새 접수 ↗</span></button>
        </div>

        <div className={`intakeControl ${counselingOpen ? "isOpen" : "isClosed"}`}>
          <div><span>상담 신청 상태</span><strong>{counselingOpen ? "신청 받는 중" : "신청 중지됨"}</strong><p>{counselingOpen ? "본 사이트에서 개인상담 신청이 가능합니다." : "본 사이트의 신청 버튼과 신규 접수가 차단되어 있습니다."}</p></div>
          <button type="button" disabled={statusBusy} onClick={toggleCounselingStatus}>{statusBusy ? "변경 중…" : counselingOpen ? "상담 신청 중지" : "상담 신청 다시 열기"}</button>
        </div>

        {activeTab !== "story" && <div className="decisionFilters">{["전체", "신규", "보류", "확정", "거절"].map((value) => <button key={value} className={decisionFilter === value ? "active" : ""} aria-pressed={decisionFilter === value} onClick={() => { setOnlyNew(false); setDecisionFilter(value); }}>{value}<span>{items.filter((i) => i.kind !== "story" && (value === "전체" || i.status === value)).length}</span></button>)}</div>}
        <div className="adminToolbar">
          <div className="adminTabs">
            {tabs.map((tab) => (
              <button key={tab.key} className={activeTab === tab.key ? "active" : ""} onClick={() => { setActiveTab(tab.key); setOnlyNew(false); setDecisionFilter("전체"); }}>
                {tab.label}<span>{tab.key === "all" ? items.length : items.filter((item) => item.kind === tab.key).length}</span>
              </button>
            ))}
          </div>
          <div className="adminActions">
            <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="접수 검색" placeholder="이름·연령·성별·내용 검색" />
            {activeTab !== "story" && <button aria-pressed={onlyNew} className={onlyNew ? "newFilter active" : "newFilter"} onClick={() => { setDecisionFilter("전체"); setOnlyNew(!onlyNew); }}>신규만 보기</button>}
            <button onClick={exportCsv}>CSV 저장</button>
          </div>
        </div>

        {activeTab === "story" && <div className="storyManagementFilters">
          <button className={onlyImportant ? "active" : ""} aria-pressed={onlyImportant} onClick={() => setOnlyImportant(!onlyImportant)}>★ 중요 사연만 보기</button>
          <div>{["전체", "미답장", "답장 완료", "답장 안 함"].map(value => <button key={value} className={storyFilter === value ? "active" : ""} aria-pressed={storyFilter === value} onClick={() => setStoryFilter(value)}>{value}<span>{items.filter(item => item.kind === "story" && (!onlyImportant || item.important) && (value === "전체" || item.status === value)).length}</span></button>)}</div>
        </div>}

        {filtered.length > 0 && (
          <div className="bulkBar">
            <label className="bulkSelectAll">
              <input type="checkbox" checked={allFilteredSelected} onChange={toggleAllFiltered} />
              <span>{allFilteredSelected ? "현재 목록 선택 해제" : "현재 목록 전체 선택"}</span>
            </label>
            <div className="bulkBarActions">
              {selectedIds.size > 0 && <strong>{selectedIds.size}건 선택</strong>}
              {selectedIds.size > 0 && <button type="button" onClick={() => setSelectedIds(new Set())}>선택 해제</button>}
              <button className="bulkDelete" type="button" disabled={selectedIds.size === 0 || busy} onClick={removeSelected}>
                {busy && selectedIds.size > 0 ? "삭제 중…" : "선택 삭제"}
              </button>
            </div>
          </div>
        )}

        <div className="adminList">
          {filtered.length === 0 && <div className="adminEmpty">{items.length ? "검색 조건에 맞는 접수가 없어요. 검색어나 필터를 바꿔보세요." : "새로운 접수가 들어오면 여기에 표시됩니다."}</div>}
          {filtered.map((item) => {
            const storyMeta = item.kind === "story" ? [item.age_group, item.gender].filter(Boolean).join(" · ") : "";
            const isChecked = selectedIds.has(item.id);
            return (
              <div className={`submissionRow ${item.kind === "story" ? "storySubmissionRow" : ""} ${isChecked ? "submissionRowSelected" : ""} ${selected?.id === item.id ? "isViewing" : ""}`} key={item.id}>
                <label className="submissionSelect" title={`${displayName(item)} 선택`}>
                  <input type="checkbox" checked={isChecked} onChange={() => toggleSelected(item.id)} />
                  <span aria-hidden="true" />
                </label>
                {item.kind === "story" && <button className={`storyStar ${item.important ? "active" : ""}`} type="button" disabled={busy} aria-pressed={!!item.important} aria-label={`${displayName(item)} 중요 사연 ${item.important ? "해제" : "표시"}`} onClick={() => toggleImportant(item)}>{item.important ? "★" : "☆"}</button>}
                <button className="submissionOpen" type="button" onClick={() => openDetail(item)} aria-expanded={selected?.id === item.id}>
                  <span className={`submissionKind ${item.kind}`}>{kindLabel[item.kind]}</span>
                  <span className="submissionMain">
                    <strong>{displayName(item)}</strong>
                    <small>{storyMeta ? `${storyMeta} · ${item.message || "사연 내용 없음"}` : item.message || "신청 내용 없음"}</small>
                  </span>
                  <span className="submissionDate">{new Date(item.created_at).toLocaleDateString("ko-KR")}<small>{item.reference_code}</small></span>
                  <span className={`submissionStatus status-${item.status.replace(" ", "-")}`}>{item.status}</span>
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {notice && <div className="adminToast" role="status">{notice}</div>}
      {selected && <SubmissionModal key={selected.id} item={selected} busy={busy} onClose={closeDetail} onSave={save} onDelete={remove} onDirty={setDirty} onNotice={setNotice} />}
    </main>
  );
}

function SubmissionModal({ item, busy, onClose, onSave, onDelete, onDirty, onNotice }: {
  item: Submission;
  busy: boolean;
  onDirty: (dirty: boolean) => void;
  onNotice: (message: string) => void;
  onClose: () => void;
  onSave: (item: Submission, status: string, note: string) => void;
  onDelete: (item: Submission) => void;
}) {
  const [status, setStatus] = useState(item.status);
  const [note, setNote] = useState(item.admin_note || "");

  const closeRef = useRef<HTMLButtonElement>(null);
  const closeHandler = useRef(onClose);
  closeHandler.current = onClose;
  const changed = status !== item.status || note !== (item.admin_note || "");
  useEffect(() => { onDirty(changed); }, [changed, onDirty]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeHandler.current();
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
      previous?.focus();
    };
  }, []);
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); onNotice("✓ 복사했어요"); }
    catch { onNotice("복사하지 못했습니다. 내용을 직접 선택해 주세요."); }
  }
  return (
    <div className="submissionDrawerWrap">
      <section className="adminModal submissionDrawer" role="dialog" aria-label="접수 상세">
        <button ref={closeRef} className="adminModalClose" disabled={busy} onClick={onClose} aria-label="닫기">×</button>
        <p className="sectionNumber">{item.reference_code}</p>
        <h2>{displayName(item)}</h2>
        <div className="detailQuickActions">
          {item.contact && <button onClick={() => copy(item.contact!)}>{item.kind === "story" ? "이메일 복사" : "연락처 복사"}</button>}
          {item.kind === "story" && item.contact && <a href={`mailto:${item.contact}?subject=${encodeURIComponent("보내주신 사연에 답장드립니다 · 아우데")}`}>메일로 답장하기 ↗</a>}
          <button onClick={() => copy([item.reference_code, displayName(item), item.contact, item.message].filter(Boolean).join("\n"))}>접수 내용 복사</button>
        </div>
        <div className="submissionDetails">
          <Detail label="구분" value={kindLabel[item.kind]} />
          <Detail label="접수일시" value={new Date(item.created_at).toLocaleString("ko-KR")} />
          <Detail label="연령대" value={item.age_group} />
          {item.kind === "story" && <Detail label="성별" value={item.gender} />}
          <Detail label={item.kind === "story" ? "답장받을 이메일" : "연락처"} value={item.contact || (item.kind === "story" ? "입력된 이메일이 없습니다." : null)} />
          <Detail label="상담 유형" value={item.service} />
          <Detail label="희망 시간" value={item.preferred_time} />
          <Detail label={item.kind === "story" ? "사연" : "신청 이유"} value={item.message} wide />
          {item.kind === "story" && <Detail label="콘텐츠 활용" value={item.content_consent ? "동의" : "동의하지 않음"} />}
        </div>
        <label className="adminField">상태<select disabled={busy || (item.kind !== "story" && !!item.client_status)} value={status} onChange={(event) => setStatus(event.target.value)}>
          {(item.kind === "story" ? ["미답장", "답장 완료", "답장 안 함"] : ["신규", "보류", "확정", "거절"]).map((value) => <option key={value}>{value}</option>)}
        </select></label>
        {item.kind === "story" && <p className="editHint">메일을 보낸 뒤 상태를 ‘답장 완료’로 변경하고 저장해 주세요.</p>}
        {item.kind !== "story" && <p className="editHint">{item.client_status ? "확정된 내담자의 상담·휴식·종결은 내담자 화면에서 관리합니다." : "확정으로 저장하면 내담자로 등록되고 상담 중으로 전환됩니다."}</p>}
        <label className="adminField">관리자 메모<textarea disabled={busy} value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} /></label>
        <p className="editHint" role="status">{changed ? "저장하지 않은 변경사항이 있어요" : "모든 변경사항이 저장되어 있어요"}</p>
        <div className="adminModalActions">
          <button className="danger" disabled={busy} onClick={() => onDelete(item)}>삭제</button>
          <div className="modalRightActions">
            {item.client_status && <Link className="clientConvert" href={`/admin/clients?client=${encodeURIComponent(item.id.slice("counseling:".length))}`}>내담자 기록 열기 ↗</Link>}
            <button className="save" disabled={busy || !changed} onClick={() => onSave(item, status, note)}>{busy ? "저장 중…" : "변경사항 저장"}</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Detail({ label, value, wide = false }: { label: string; value: string | null; wide?: boolean }) {
  if (!value) return null;
  return <div className={wide ? "detailWide" : ""}><dt>{label}</dt><dd>{value}</dd></div>;
}


