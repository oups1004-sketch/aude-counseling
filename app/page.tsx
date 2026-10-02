"use client";

import { FormEvent, useEffect, useState } from "react";

const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@example.com";
const openChatUrl = "https://m.site.naver.com/2hPA6";

function ArrowIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}

const testCategories = [
  {
    name: "기질·성격",
    tests: [
      ["TCI", "타고난 기질과 성장하며 형성된 성격 특성을 살펴봅니다."],
      ["MBTI", "에너지를 얻고 정보를 받아들이며 판단하고 생활하는 선호 방식을 알아봅니다."],
      ["NEO-PI", "성격을 다섯 가지 주요 특성과 세부 특성으로 나누어 폭넓게 이해합니다."],
    ],
  },
  {
    name: "정서·심리",
    tests: [
      ["MMPI", "현재의 정서 상태와 심리적 어려움, 성격적 특징을 폭넓게 이해합니다."],
      ["SCT", "미완성 문장을 완성하며 자신과 관계, 가족, 미래에 관한 생각을 살펴봅니다."],
    ],
  },
  {
    name: "진로·학습",
    tests: [
      ["Strong", "다양한 활동과 직업에 대한 흥미를 살펴보고 진로 탐색의 방향을 찾습니다."],
      ["U&I", "학습 과정에서 나타나는 성격과 행동 특성, 공부 방법을 살펴봅니다."],
    ],
  },
  {
    name: "심층·투사",
    tests: [
      ["TAT", "그림을 보고 만든 이야기를 통해 관계 경험과 내면의 욕구·갈등을 탐색합니다."],
      ["Rorschach", "잉크반점에 대한 반응을 바탕으로 사고와 정서, 현실을 경험하는 방식을 종합적으로 살펴봅니다."],
      ["HTP", "집·나무·사람 그림을 통해 자기상과 관계 경험, 정서적 특징을 탐색합니다."],
      ["KFD", "가족이 무언가를 하는 그림을 통해 가족관계에 대한 개인의 경험과 인식을 살펴봅니다."],
    ],
  },
] as const;

const singleAssessmentTests = [
  ["TCI", "70,000원"],
  ["MBTI", "70,000원"],
  ["NEO-PI", "70,000원"],
  ["MMPI-2", "70,000원"],
  ["SCT", "70,000원"],
  ["Strong", "70,000원"],
  ["U&I", "70,000원"],
  ["HTP", "70,000원"],
  ["KFD", "70,000원"],
  ["TAT", "100,000원"],
  ["Rorschach", "100,000원"],
] as const;

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [storyStatus, setStoryStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [counselingStatus, setCounselingStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [activeTestCategory, setActiveTestCategory] = useState(0);
  const [counselingModalOpen, setCounselingModalOpen] = useState(false);
  const [applicationType, setApplicationType] = useState<"choice" | "counseling" | "assessment">("choice");
  const [selectedAssessmentPackage, setSelectedAssessmentPackage] = useState<"single" | "basic" | "deep" | "">("");
  const [assessmentCatalogOpen, setAssessmentCatalogOpen] = useState(false);
  const [capacityModalOpen, setCapacityModalOpen] = useState(false);
  const [counselingOpen, setCounselingOpen] = useState(true);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);

  useEffect(() => {
    fetch("/api/counseling-status", { cache: "no-store" })
      .then((response) => response.json())
      .then(({ counselingOpen: open }) => {
        const isOpen = open !== false;
        setCounselingOpen(isOpen);
        const today = new Date().toLocaleDateString("en-CA");
        if (!isOpen && localStorage.getItem("aude-capacity-notice-hidden") !== today) setCapacityModalOpen(true);
      })
      .catch(() => undefined);

    const showCapacityNotice = () => setCapacityModalOpen(true);
    window.addEventListener("aude-counseling-closed", showCapacityNotice);
    return () => window.removeEventListener("aude-counseling-closed", showCapacityNotice);
  }, []);

  useEffect(() => {
    if (!testModalOpen && !counselingModalOpen && !capacityModalOpen && !privacyModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setTestModalOpen(false);
      setCounselingModalOpen(false);
      setCapacityModalOpen(false);
      setPrivacyModalOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [testModalOpen, counselingModalOpen, capacityModalOpen, privacyModalOpen]);

  function openCounselingForm() {
    if (!counselingOpen) return setCapacityModalOpen(true);
    setApplicationType("choice");
    setCounselingStatus("idle");
    setCounselingModalOpen(true);
  }

  function hideCapacityNoticeToday() {
    localStorage.setItem("aude-capacity-notice-hidden", new Date().toLocaleDateString("en-CA"));
    setCapacityModalOpen(false);
  }

  async function sendSubmission(payload: Record<string, string | boolean>) {
    const response = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("submission unavailable");
  }

  async function submitStory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const nickname = String(data.get("nickname") || "익명");
    const ageGroup = String(data.get("ageGroup") || "");
    const gender = String(data.get("gender") || "");
    const story = String(data.get("story") || "");
    const consent = data.get("contentConsent") ? "동의" : "동의하지 않음";
    setStoryStatus("sending");
    try {
      await sendSubmission({
        type: "story",
        nickname,
        ageGroup,
        gender,
        story,
        contentConsent: consent,
        website: String(data.get("website") || ""),
      });
      form.reset();
      setStoryStatus("sent");
    } catch {
      setStoryStatus("error");
    }
  }

  async function submitCounseling(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setCounselingStatus("sending");
    const payload = {
      type: "counseling",
      name: String(data.get("name") || ""),
      ageGroup: String(data.get("ageGroup") || ""),
      contact: String(data.get("contact") || ""),
      service: "개인상담",
      preferredTime: String(data.get("preferredTime") || ""),
      reason: String(data.get("reason") || ""),
      website: String(data.get("website") || ""),
    };
    try {
      await sendSubmission(payload);
      form.reset();
      setCounselingStatus("sent");
    } catch {
      setCounselingStatus("error");
    }
  }

  async function submitAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const requestedTests = data.getAll("requestedTests").map(String);
    const assessmentPackage = String(data.get("assessmentPackage") || "");
    if (!assessmentPackage || (selectedAssessmentPackage === "single" && requestedTests.length === 0)) {
      setCounselingStatus("error");
      return;
    }
    setCounselingStatus("sending");
    try {
      await sendSubmission({
        type: "counseling",
        name: String(data.get("name") || ""),
        ageGroup: String(data.get("ageGroup") || ""),
        contact: String(data.get("contact") || ""),
        service: "심리검사·해석상담",
        assessmentPackage,
        requestedTests: requestedTests.join(", "),
        preferredTime: String(data.get("preferredTime") || ""),
        reason: String(data.get("reason") || ""),
        website: String(data.get("website") || ""),
      });
      form.reset();
      setCounselingStatus("sent");
    } catch {
      setCounselingStatus("error");
    }
  }

  return (
    <main>
      <header className="header">
        <a className="brand" href="#top" aria-label="아우데 심리상담 홈">
          <span className="brandMark">A</span>
          <span>AUDE<br /><small>PSYCHOLOGICAL COUNSELING</small></span>
        </a>
        <button className="menuButton" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label="메뉴 열기">
          <span /><span />
        </button>
        <nav className={menuOpen ? "nav open" : "nav"} aria-label="주요 메뉴">
          <a href="#about" onClick={() => setMenuOpen(false)}>아우데 소개</a>
          <a href="#counseling" onClick={() => setMenuOpen(false)}>상담 안내</a>
          <a href="#counselor" onClick={() => setMenuOpen(false)}>상담자</a>
          <a className="navCta" href="#counseling" onClick={(event) => {
            event.preventDefault();
            setMenuOpen(false);
            setCounselingModalOpen(false);
            window.setTimeout(() => document.getElementById("counseling")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
          }}>상담 신청하기</a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="heroCopy">
          <p className="eyebrow">AUDE · 용기를 내다</p>
          <h1>용기는,<br />내 이야기를 꺼내는 데서<br />시작됩니다.</h1>
          <p className="heroText">정답을 건네기보다, 당신이 살아온 이야기를 함께 읽습니다. 지금의 어려움 속에서도 다시 선택할 수 있는 방향을 함께 찾아갑니다.</p>
          <div className="heroActions">
            <a className="primaryButton heroChoice" href="#story">
              <span className="heroChoiceCopy"><small>STORY</small><strong>익명으로 사연 보내기</strong></span><ArrowIcon />
            </a>
            <button className={`secondaryButton heroChoice${counselingOpen ? "" : " isDisabled"}`} type="button" aria-disabled={!counselingOpen} onClick={() => counselingOpen ? document.getElementById("counseling")?.scrollIntoView({ behavior: "smooth" }) : setCapacityModalOpen(true)}>
              <span className="heroChoiceCopy"><small>COUNSELING</small><strong>온라인 상담 신청하기</strong></span><ArrowIcon />
            </button>
          </div>
        </div>
        <div className="heroArt" aria-hidden="true">
          <div className="halo" />
          <div className="courageLine"><span>AUDE</span></div>
          <p>이해한 뒤에는,<br />다시 선택할 수 있습니다.</p>
        </div>
        <p className="scrollHint">SCROLL TO LISTEN</p>
      </section>

      <section className="intro section" id="about">
        <div>
          <p className="sectionNumber">01 / ABOUT AUDE</p>
          <h2>말하는 순간,<br />이야기는 달라지기 시작합니다.</h2>
        </div>
        <div className="introBody">
          <p className="lead">아우데(Aude)는 라틴어로<br /><em>“용기를 내라”</em>는 뜻입니다.</p>
          <p>누구에게나 삶의 방향을 잃고, 자신마저 낯설게 느껴지는 순간이 있습니다. 하지만 지금 겪고 있는 어려움이 당신의 모든 모습을 설명하지는 않습니다.</p>
          <p>아우데 심리상담은 무엇이 잘못되었는지를 찾아내는 데 머물기보다, 당신이 지금까지 어떻게 살아왔고 무엇을 중요하게 여겨왔는지를 함께 살펴봅니다. 그리고 그 이야기 안에서 앞으로의 선택을 만들어갈 힘을 찾아갑니다.</p>
        </div>
      </section>

      <section className="counseling section" id="counseling">
        <p className="sectionNumber light">02 / ONLINE COUNSELING</p>
        <div className="sectionHeadingRow">
          <h2>어디에서든,<br />당신의 속도로.</h2>
          <p>ZOOM을 통해 익숙하고 편안한 공간에서 만납니다. 관계, 진로, 감정의 어려움을 혼자 정리하기 벅찰 때, 자신의 속도에 맞춰 이야기를 시작할 수 있습니다.</p>
        </div>
        <div className="serviceGrid">
          <article><span>01</span><h3>개인상담</h3><p>반복되는 관계와 감정의 패턴을 단순히 고쳐야 할 문제로 보지 않습니다. 지금까지 어떤 방식으로 삶을 견뎌왔는지, 무엇을 중요하게 여겨왔는지를 함께 살피며 앞으로 내가 원하는 선택과 방향을 찾아갑니다.</p><strong>온라인 · 60분 · 100,000원</strong><small className="studentPrice">대학생 재학증명서 인증 시 80,000원</small></article>
          <article className="assessmentService"><span>02</span><h3>심리검사·해석상담</h3><p>상담을 시작하는 것이 아직 부담스럽다면, 심리검사와 해석상담을 통해 지금의 나를 먼저 이해해볼 수 있습니다.</p><strong className="servicePrice">70,000원부터 · 해석상담 포함</strong><small className="studentPrice">단일·기본 성격·맞춤형 심층, 세 가지 패키지</small><button className="testModalTrigger" type="button" onClick={() => setTestModalOpen(true)}>검사 종류 살펴보기 <ArrowIcon /></button></article>
        </div>

        <div className="counselingCta">
          <div className="counselingCtaInner">
            <p><span>신청만으로 바로 결제되거나 상담이 확정되지는 않습니다.</span><strong>신청 → 일정·비용 안내 → 확인 후 상담 확정</strong></p>
            <button className={`counselingApplyButton${counselingOpen ? "" : " isDisabled"}`} type="button" aria-disabled={!counselingOpen} onClick={openCounselingForm}>{counselingOpen ? "상담 신청하기" : "현재 상담 신청 마감"} <ArrowIcon /></button>
          </div>
        </div>
      </section>

      <section className="counselor section" id="counselor">
        <div className="portraitPlaceholder" aria-label="아우데 심리상담 상담자 연필 스케치"><span>AUDE</span><div className="counselorSilhouette" aria-hidden="true" /></div>
        <div className="profile">
          <p className="sectionNumber">03 / COUNSELOR</p>
          <h2>상담자 소개</h2>
          <p className="profileLead">“사람을 문제로 보지 않습니다.<br />그 사람이 살아온 방식과, 앞으로 가고 싶은 방향을 봅니다.”</p>
          <dl>
            <div><dt>학력</dt><dd>상담심리학 석사</dd></div>
            <div><dt>활동</dt><dd>대학상담센터 상담자<br />고등학교 진로·진학상담부장</dd></div>
            <div><dt>자격</dt><dd>전문상담교사 1급<br />상담심리사 2급 (한국상담심리학회)<br />청소년상담사 2급 (여성가족부)</dd></div>
            <div><dt>관점</dt><dd>아들러 심리학 · 내러티브 상담</dd></div>
          </dl>
        </div>
      </section>

      <section className="story section" id="story">
        <div className="storyIntro">
          <p className="sectionNumber">04 / SEND YOUR STORY</p>
          <h2>마음에 걸린 이야기를<br />보내주세요.</h2>
          <p><span className="desktopStoryText">잘 정리된 글이 아니어도 괜찮습니다. 요즘 자꾸 떠오르는 장면이나 아무에게도 하지 못했던 질문을 편한 말로 적어주세요.</span><span className="mobileStoryText">잘 정리된 글이 아니어도 괜찮습니다.<br />지금 떠오르는 말부터 시작해 보세요.</span></p>
        </div>
        {storyStatus === "sent" ? (
          <div className="storyForm">
            <div className="requestSuccess" role="status">
              <span>STORY RECEIVED</span>
              <strong>이야기가 전해졌어요.</strong>
              <p>쉽지 않은 이야기를 보내주셔서 감사합니다.<br />보내주신 이야기는 천천히 읽어볼게요.</p>
              <p>보내주신 사연은 개인정보를 알아볼 수 없도록 수정·각색한 뒤 ‘옆동네 외삼춘’ 유튜브·인스타그램 등에서 소개될 수 있습니다.</p>
            </div>
          </div>
        ) : (
          <form className="storyForm" onSubmit={submitStory}>
            <div className="storyMeta">
              <label className="storyField"><span className="fieldEyebrow">FROM</span><span className="fieldLabel">닉네임</span><input name="nickname" maxLength={40} placeholder="익명도 괜찮아요" /></label>
              <label className="storyField"><span className="fieldEyebrow">AGE</span><span className="fieldLabel">나이 / 연령대 · 선택</span><select name="ageGroup" defaultValue=""><option value="">선택하지 않음</option><option>10대</option><option>20대</option><option>30대</option><option>40대</option><option>50대 이상</option></select></label>
              <label className="storyField"><span className="fieldEyebrow">GENDER</span><span className="fieldLabel">성별 · 선택</span><select name="gender" defaultValue=""><option value="">선택하지 않음</option><option>여성</option><option>남성</option><option>기타</option></select></label>
            </div>
            <label className="storyField storyMessageField"><span className="fieldEyebrow">YOUR STORY</span><span className="fieldLabel">당신의 이야기</span><textarea name="story" required rows={8} placeholder="어떤 이야기가 마음에 걸려 있나요?" /></label>
            <div className="storyConsent">
              <label className="check"><input type="checkbox" name="contentConsent" required /><span>보내주신 사연이 개인정보를 알아볼 수 없도록 수정·각색된 뒤, ‘옆동네 외삼춘’ 유튜브·인스타그램 등 콘텐츠에서 소개될 수 있음에 동의합니다. (필수)</span></label>
              <p className="notice identityNotice">※ 이름, 지역, 직장 등 개인을 특정할 수 있는 정보는 삭제하거나 변경합니다.</p>
              <label className="check"><input type="checkbox" required /><span>사연 접수와 답변을 위한 <button className="textButton" type="button" onClick={() => setPrivacyModalOpen(true)}>개인정보 처리 안내</button>를 확인했습니다. (필수)</span></label>
            </div>
            <div className="storyGuidance">
              <strong>사연 보내기 안내</strong>
              <p>사연 보내기는 상담 신청과 별도로 운영되며, 접수된 사연은 개인정보를 알아볼 수 없도록 수정·각색한 뒤 ‘옆동네 외삼춘’ 유튜브·인스타그램 등 콘텐츠에서 소개될 수 있습니다. 개인상담을 원하시면 위의 ‘상담 신청하기’를 이용해 주세요.</p>
              <p className="notice">※ 사연 접수는 상담을 대체하지 않으며, 위기 상황에는 112·119 또는 자살예방상담전화 109를 이용해 주세요.</p>
            </div>
            <input className="honeypot" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            <button className="submitButton" type="submit" disabled={storyStatus === "sending"}>{storyStatus === "sending" ? "보내는 중…" : "이야기 보내기"} {storyStatus !== "sending" && <ArrowIcon />}</button>
            {storyStatus === "error" && <p className="formError" role="alert">잠시 접수하지 못했습니다. 내용을 보관한 뒤 잠시 후 다시 시도해 주세요.</p>}
          </form>
        )}
      </section>

      {testModalOpen && (
        <div className="testModalBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setTestModalOpen(false); }}>
          <section className="testModal" role="dialog" aria-modal="true" aria-labelledby="test-modal-title">
            <button className="testModalClose" type="button" onClick={() => setTestModalOpen(false)} aria-label="검사 안내 닫기">×</button>
            <p className="testModalEyebrow">PSYCHOLOGICAL TESTS</p>
            <h2 id="test-modal-title">나를 이해하는<br />여러 가지 방법</h2>
            <p className="testModalLead">심리검사와 해석상담을 통해 현재의 나를 보다 구체적으로 이해할 수 있습니다.</p>
            <div className="testTabs" role="tablist" aria-label="심리검사 영역">
              {testCategories.map((category, index) => (
                <button key={category.name} type="button" role="tab" aria-selected={activeTestCategory === index} className={activeTestCategory === index ? "active" : ""} onClick={() => setActiveTestCategory(index)}>
                  {category.name}
                </button>
              ))}
            </div>
            <div className="testModalList" role="tabpanel">
              {testCategories[activeTestCategory].tests.map(([name, description]) => (
                <details key={name}>
                  <summary><strong>{name}</strong><span aria-hidden="true">＋</span></summary>
                  <p>{description}</p>
                </details>
              ))}
            </div>
            {activeTestCategory === 3 && <p className="testModalNote">투사검사는 진행 방식과 실시 환경을 별도로 협의합니다.</p>}
            <p className="testModalFootnote">검사에 따라 진행 방식과 소요 시간, 비용이 달라질 수 있습니다.</p>
          </section>
        </div>
      )}

      {counselingModalOpen && (
        <div className="testModalBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCounselingModalOpen(false); }}>
          <section className="testModal counselingModal" role="dialog" aria-modal="true" aria-labelledby="counseling-modal-title">
            <button className="testModalClose" type="button" onClick={() => setCounselingModalOpen(false)} aria-label="상담 신청 안내 닫기">×</button>
            {applicationType === "choice" ? (
              <>
                <p className="testModalEyebrow">START WITH AUDE</p>
                <h2 id="counseling-modal-title">어떤 도움을<br />원하시나요?</h2>
                <p className="testModalLead">원하는 방식을 선택하면 해당 신청서로 이어집니다. 신청만으로 결제되거나 일정이 확정되지는 않습니다.</p>
                <div className="applicationChoices">
                  <button type="button" onClick={() => { setApplicationType("counseling"); setCounselingStatus("idle"); }}>
                    <span>01 · COUNSELING</span>
                    <strong>개인상담 신청하기</strong>
                    <p>온라인 · 60분 · 100,000원<br />대학생 재학증명서 인증 시 80,000원</p>
                    <small>3회기 이상 진행 시 심리검사비 무료</small>
                    <ArrowIcon />
                  </button>
                  <button type="button" onClick={() => { setApplicationType("assessment"); setSelectedAssessmentPackage(""); setAssessmentCatalogOpen(false); setCounselingStatus("idle"); }}>
                    <span>02 · ASSESSMENT</span>
                    <strong>심리검사 신청하기</strong>
                    <p>단일 70,000원부터 · 기본 성격 150,000원<br />맞춤형 심층 220,000원</p>
                    <small>심리검사 해석본 제공</small>
                    <ArrowIcon />
                  </button>
                </div>
              </>
            ) : (
              <>
                <button className="applicationBack" type="button" onClick={() => { setApplicationType("choice"); setCounselingStatus("idle"); }}>← 신청 유형 다시 선택</button>
                <p className="testModalEyebrow">{applicationType === "counseling" ? "PERSONAL COUNSELING" : "PSYCHOLOGICAL ASSESSMENT"}</p>
                <h2 id="counseling-modal-title">{applicationType === "counseling" ? <>개인상담<br />신청하기</> : <>심리검사<br />신청하기</>}</h2>
                <p className="testModalLead">{applicationType === "counseling" ? "기본 정보를 남겨주시면 가능한 일정과 진행 방법을 개별적으로 안내드립니다." : <>원하는 검사를 선택하고 신청 이유를 남겨주시면 검사 진행 방법과 일정을 안내드립니다.<span className="assessmentIncluded">모든 패키지에 전문가 해석상담과 요약 해석본이 포함됩니다.</span></>}</p>

                {applicationType === "counseling" ? (
                  <>
                    <div className="requestPrices" aria-label="개인상담 비용">
                      <article><span>개인상담</span><strong>100,000원</strong><small>온라인 · 60분</small></article>
                      <article><span>대학생 개인상담</span><strong>80,000원</strong><small>재학증명서 인증 시 · 온라인 60분</small></article>
                    </div>
                    <p className="requestPriceNote">3회기 이상 진행 시 심리검사비가 무료입니다. 대학생 할인은 상담 시작 전 유효한 재학증명서를 확인한 경우 적용됩니다.</p>
                  </>
                ) : null}

                {applicationType === "assessment" && (
                  <div className="assessmentCatalogWrap">
                    <button className="assessmentCatalogTrigger" type="button" aria-expanded={assessmentCatalogOpen} onClick={() => setAssessmentCatalogOpen(!assessmentCatalogOpen)}>
                      <span><small>PSYCHOLOGICAL TESTS</small><strong>검사 종류 살펴보기</strong></span>
                      <b aria-hidden="true">{assessmentCatalogOpen ? "−" : "+"}</b>
                    </button>
                    {assessmentCatalogOpen && (
                      <div className="assessmentCatalog">
                        <div className="testTabs" role="tablist" aria-label="심리검사 영역">
                          {testCategories.map((category, index) => (
                            <button key={category.name} type="button" role="tab" aria-selected={activeTestCategory === index} className={activeTestCategory === index ? "active" : ""} onClick={() => setActiveTestCategory(index)}>{category.name}</button>
                          ))}
                        </div>
                        <div className="testModalList" role="tabpanel">
                          {testCategories[activeTestCategory].tests.map(([name, description]) => (
                            <details key={name}><summary><strong>{name}</strong><span aria-hidden="true">＋</span></summary><p>{description}</p></details>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {counselingStatus === "sent" ? (
                  <div className="requestSuccess" role="status">
                    <span>신청서가 정상적으로 접수되었습니다.</span>
                    <strong>일정 안내를 위해 오픈채팅으로 들어와 주세요.</strong>
                    <p>오픈채팅 입장 후 신청서에 적은 이름 또는 닉네임을 남겨주시면 확인해 드립니다.</p>
                    <a className="openChatButton" href={openChatUrl} target="_blank" rel="noreferrer">
                      카카오톡 오픈채팅으로 이동하기 <ArrowIcon />
                    </a>
                    <div className="openChatQr">
                      <img src="/aude-open-chat-qr.jpg" alt="아우데 심리상담 카카오톡 오픈채팅 QR코드" width="357" height="357" />
                      <small>PC에서 신청하셨다면 휴대폰 카메라로 QR코드를 촬영해 주세요.</small>
                    </div>
                    <button className="applicationBack successCloseButton" type="button" onClick={() => setCounselingModalOpen(false)}>완료하고 닫기</button>
                  </div>
                ) : applicationType === "counseling" ? (
                  <form className="requestForm" onSubmit={submitCounseling}>
                    <div className="requestFormGrid">
                      <label><span>이름 또는 닉네임</span><input name="name" required maxLength={40} placeholder="편하게 불릴 이름" /></label>
                      <label><span>연령대</span><select name="ageGroup" required defaultValue=""><option value="" disabled>선택해 주세요</option><option>10대</option><option>20대</option><option>30대</option><option>40대</option><option>50대 이상</option></select></label>
                      <label><span>연락처</span><input name="contact" required maxLength={80} placeholder="전화번호 또는 이메일" /></label>
                    </div>
                    <label><span>희망 요일·시간</span><input name="preferredTime" required maxLength={100} placeholder="예: 평일 저녁 7시 이후" /></label>
                    <label><span>간단한 신청 이유 <small>선택 · 200자 이내</small></span><textarea name="reason" rows={3} maxLength={200} placeholder="자세한 이야기는 상담에서 안전하게 나눌 수 있어요." /></label>
                    <label className="check"><input type="checkbox" required /><span><button className="textButton" type="button" onClick={() => setPrivacyModalOpen(true)}>개인정보 처리 안내</button>를 확인하고 접수에 동의합니다. (필수)</span></label>
                    <input className="honeypot" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
                    <button className="submitButton requestMailButton" type="submit" disabled={counselingStatus === "sending"}>{counselingStatus === "sending" ? "접수하는 중…" : "개인상담 신청서 보내기"} {counselingStatus !== "sending" && <ArrowIcon />}</button>
                    {counselingStatus === "error" && <p className="formError" role="alert">잠시 접수하지 못했습니다. 내용을 보관한 뒤 잠시 후 다시 시도해 주세요.</p>}
                  </form>
                ) : (
                  <form className="requestForm assessmentForm" onSubmit={submitAssessment}>
                    <div className="requestFormGrid">
                      <label><span>이름 또는 닉네임</span><input name="name" required maxLength={40} placeholder="편하게 불릴 이름" /></label>
                      <label><span>연령대</span><select name="ageGroup" required defaultValue=""><option value="" disabled>선택해 주세요</option><option>10대</option><option>20대</option><option>30대</option><option>40대</option><option>50대 이상</option></select></label>
                      <label><span>연락처</span><input name="contact" required maxLength={80} placeholder="전화번호 또는 이메일" /></label>
                      <label><span>희망 요일·시간</span><input name="preferredTime" required maxLength={100} placeholder="예: 토요일 오전" /></label>
                    </div>
                    <fieldset className="packageChoices">
                      <legend>검사 패키지 선택 <small>필수</small></legend>
                      <div>
                        <label><input type="radio" name="assessmentPackage" value="단일 심리검사 · 70,000원부터" checked={selectedAssessmentPackage === "single"} onChange={() => setSelectedAssessmentPackage("single")} /><span><strong>단일 심리검사</strong><b>70,000원부터</b><small>검사 1종 · 40분 해석상담 · 검사에 따라 70,000~100,000원</small></span></label>
                        <label><input type="radio" name="assessmentPackage" value="기본 성격검사 · 150,000원" checked={selectedAssessmentPackage === "basic"} onChange={() => setSelectedAssessmentPackage("basic")} /><span><strong>기본 성격검사</strong><b>150,000원</b><small>MMPI-2 + TCI + SCT · 80분 해석상담 · 개별 검사 대비 약 29% 할인</small></span></label>
                        <label><input type="radio" name="assessmentPackage" value="맞춤형 심층 심리검사 · 220,000원" checked={selectedAssessmentPackage === "deep"} onChange={() => setSelectedAssessmentPackage("deep")} /><span><strong>맞춤형 심층 심리검사</strong><b>220,000원</b><small>상담자가 검사 4~5종 맞춤 구성 · 80분 해석상담 · 개별 검사 대비 약 20% 이상 할인</small></span></label>
                      </div>
                    </fieldset>
                    {selectedAssessmentPackage === "single" && (
                      <fieldset className="assessmentChecks singleTestChoices">
                        <legend>희망하는 단일검사 <small>1종 선택</small></legend>
                        <div>
                          {singleAssessmentTests.map(([name, price]) => (
                            <label key={name}><input type="radio" name="requestedTests" value={`${name} · ${price}`} /><span><strong>{name}</strong><small>{price}</small></span></label>
                          ))}
                        </div>
                      </fieldset>
                    )}
                    {selectedAssessmentPackage === "basic" && (
                      <div className="packageDetail">
                        <input type="hidden" name="requestedTests" value="MMPI-2, TCI, SCT" />
                        <p><strong>MMPI-2</strong><span>현재의 정서 상태와 심리적 어려움을 폭넓게 살펴봅니다.</span></p>
                        <p><strong>TCI</strong><span>타고난 기질과 성장하며 형성된 성격 특성을 이해합니다.</span></p>
                        <p><strong>SCT</strong><span>자신·관계·가족·미래에 관한 내면의 생각을 탐색합니다.</span></p>
                        <div>세 검사는 정서 상태, 성격의 구조, 말로 다 표현되지 않은 내면을 서로 보완적으로 이해하도록 구성했습니다.</div>
                        <div className="packageFixedPrice"><strong>150,000원 패키지</strong><span>개별 검사 대비 약 29% 할인</span></div>
                      </div>
                    )}
                    {selectedAssessmentPackage === "deep" && (
                      <div className="packageDetail deepPackageDetail">
                        <input type="hidden" name="requestedTests" value="상담자 맞춤 구성 · 4~5종" />
                        <strong>검사를 직접 고르느라 고민하지 않아도 괜찮습니다.</strong>
                        <p>작성해 주신 신청 사유를 바탕으로 상담자가 객관검사와 투사검사 중 필요한 도구 4~5종을 적절히 구성합니다.</p>
                        <small>MMPI-2·TCI·SCT·MBTI 등의 객관검사와 HTP·KFD·TAT·Rorschach 등의 투사검사 가운데 목적에 맞는 검사를 안내합니다.</small>
                        <div className="packageFixedPrice"><strong>220,000원 심층 패키지</strong><span>개별 검사 대비 약 20% 이상 할인 · 추가 비용 없음</span></div>
                      </div>
                    )}
                    <label><span>심리검사를 신청하는 이유 <small>필수 · 500자 이내</small></span><textarea name="reason" required rows={4} maxLength={500} placeholder="현재 궁금한 점이나 검사를 통해 이해하고 싶은 부분을 적어주세요." /></label>
                    <label className="check"><input type="checkbox" required /><span><button className="textButton" type="button" onClick={() => setPrivacyModalOpen(true)}>개인정보 처리 안내</button>를 확인하고 접수에 동의합니다. (필수)</span></label>
                    <input className="honeypot" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
                    <button className="submitButton requestMailButton" type="submit" disabled={counselingStatus === "sending"}>{counselingStatus === "sending" ? "접수하는 중…" : "심리검사 신청서 보내기"} {counselingStatus !== "sending" && <ArrowIcon />}</button>
                    {counselingStatus === "error" && <p className="formError" role="alert">검사 패키지와 필요한 검사 선택을 확인한 뒤 다시 시도해 주세요.</p>}
                  </form>
                )}
                <button className="textButton privacyOpenButton" type="button" onClick={() => setPrivacyModalOpen(true)}>개인정보 처리 안내 보기</button>
              </>
            )}
          </section>
        </div>
      )}

      {privacyModalOpen && (
        <div className="testModalBackdrop privacyBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPrivacyModalOpen(false); }}>
          <section className="testModal privacyModal" role="dialog" aria-modal="true" aria-labelledby="privacy-modal-title">
            <button className="testModalClose" type="button" onClick={() => setPrivacyModalOpen(false)} aria-label="개인정보 처리 안내 닫기">×</button>
            <p className="testModalEyebrow">PRIVACY</p>
            <h2 id="privacy-modal-title">개인정보 처리 안내</h2>
            <div className="privacyCopy">
              <p><strong>수집 항목</strong><span>사이트 접수 양식을 통해 이용자가 직접 제공한 이름·닉네임·연령대·성별·연락처·상담 또는 사연 내용</span></p>
              <p><strong>이용 목적</strong><span>상담 및 사연 접수 확인, 일정 안내와 답변</span></p>
              <p><strong>보유 기간</strong><span>이용 목적 달성 후 지체 없이 파기합니다. 관계 법령에 따라 보관이 필요한 경우에는 해당 기간 동안 보관합니다.</span></p>
              <p><strong>보관 방식</strong><span>접수 내용은 접근이 제한된 관리 시스템에 보관하며, 상담 진행과 답변을 위한 목적으로만 확인합니다.</span></p>
              <p><strong>동의 거부</strong><span>개인정보 제공에 동의하지 않을 수 있으나, 접수와 답변이 제한될 수 있습니다.</span></p>
            </div>
            <p className="privacyFootnote">사연 보내기는 ‘옆동네 외삼춘’ 유튜브·인스타그램 등 콘텐츠에서 소개될 수 있다는 점에 동의한 경우에만 접수됩니다. 소개 시에는 이름, 지역, 직장 등 개인을 알아볼 수 있는 정보는 삭제하거나 변경하고 필요한 범위에서 내용을 수정·각색합니다. 정식 운영 전 실제 연락처와 개인정보 관리 정보를 추가합니다.</p>
            <button className="submitButton" type="button" onClick={() => setPrivacyModalOpen(false)}>확인했습니다</button>
          </section>
        </div>
      )}

      {capacityModalOpen && (
        <div className="testModalBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCapacityModalOpen(false); }}>
          <section className="testModal capacityModal" role="dialog" aria-modal="true" aria-labelledby="capacity-modal-title">
            <button className="testModalClose" type="button" onClick={() => setCapacityModalOpen(false)} aria-label="상담 마감 안내 닫기">×</button>
            <p className="testModalEyebrow">COUNSELING NOTICE</p>
            <h2 id="capacity-modal-title">현재 상담 인원이<br />모두 찼습니다.</h2>
            <p className="testModalLead">현재는 새로운 개인상담 신청을 받고 있지 않습니다. 상담 가능 인원이 생기면 신청을 다시 열겠습니다.</p>
            <div className="capacityModalActions">
              <button className="capacityTodayButton" type="button" onClick={hideCapacityNoticeToday}>오늘 하루 동안 이 창을 열지 않습니다</button>
              <button className="submitButton" type="button" onClick={() => setCapacityModalOpen(false)}>확인</button>
            </div>
          </section>
        </div>
      )}

      <footer>
        <div className="footerBrand"><strong>AUDE</strong><span>아우데 심리상담</span></div>
        <div><p>온라인 심리상담</p><a href={`mailto:${contactEmail}`}>{contactEmail}</a><button className="footerPrivacy" type="button" onClick={() => setPrivacyModalOpen(true)}>개인정보 처리 안내</button></div>
        <div><p>© {new Date().getFullYear()} AUDE COUNSELING</p><p>본 사이트의 내용은 의료적 진단이나 치료를 대체하지 않습니다.</p></div>
      </footer>
    </main>
  );
}
