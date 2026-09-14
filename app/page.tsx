"use client";

import { FormEvent, useState } from "react";

const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@example.com";

function ArrowIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sent, setSent] = useState(false);

  function submitStory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nickname = String(data.get("nickname") || "익명");
    const story = String(data.get("story") || "");
    const consent = data.get("contentConsent") ? "동의" : "동의하지 않음";
    const subject = encodeURIComponent(`[아우데 사연] ${nickname}님의 이야기`);
    const body = encodeURIComponent(`닉네임: ${nickname}\n콘텐츠 소개 동의: ${consent}\n\n사연:\n${story}`);
    setSent(true);
    window.location.href = `mailto:${contactEmail}?subject=${subject}&body=${body}`;
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
          <a className="navCta" href="#story" onClick={() => setMenuOpen(false)}>사연 보내기</a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="heroCopy">
          <p className="eyebrow">AUDE · 용기를 내다</p>
          <h1>말하는 순간,<br />이야기는 달라지기<br />시작합니다.</h1>
          <p className="heroText">정답을 건네기보다 당신이 살아온 이야기를 함께 읽습니다. 지금의 마음을 안전하게 꺼내어 놓아보세요.</p>
          <div className="heroActions">
            <a className="primaryButton" href="#story">사연 보내기 <ArrowIcon /></a>
          </div>
          <a className="counselingGuide" href="#counseling">
            <span>상담을 원하신다면</span>
            <strong>온라인 상담 알아보기 <ArrowIcon /></strong>
          </a>
        </div>
        <div className="heroArt" aria-hidden="true">
          <div className="halo" />
          <div className="courageLine"><span>AUDE</span></div>
          <p>“당신의 이야기는<br />아직 끝나지 않았습니다.”</p>
        </div>
        <p className="scrollHint">SCROLL TO LISTEN</p>
      </section>

      <section className="intro section" id="about">
        <div>
          <p className="sectionNumber">01 / ABOUT AUDE</p>
          <h2>당신의 이야기가,<br />지금의 어려움보다 크다고 믿습니다.</h2>
        </div>
        <div className="introBody">
          <p className="lead">아우데는 라틴어로<br /><em>“용기를 내다”</em>라는 뜻입니다.</p>
          <p>누구에게나 삶의 방향을 잃고, 자신마저 낯설게 느껴지는 순간이 있습니다. 그러나 지금 겪고 있는 문제가 당신의 모든 모습을 설명할 수는 없습니다.</p>
          <p>아우데 심리상담은 당신이 지나온 이야기를 함께 들여다보고, 그 안에 이미 존재해 온 힘과 새로운 가능성을 발견하는 공간입니다.</p>
        </div>
      </section>

      <section className="counseling section" id="counseling">
        <p className="sectionNumber light">02 / ONLINE COUNSELING</p>
        <div className="sectionHeadingRow">
          <h2>어디에서든,<br />당신의 속도로.</h2>
          <p>익숙하고 편안한 공간에서 화상으로 만납니다. 관계, 진로, 가족, 감정의 어려움을 혼자 정리하기 벅찰 때 함께할 수 있습니다.</p>
        </div>
        <div className="serviceGrid">
          <article><span>01</span><h3>개인상담</h3><p>반복되는 관계와 감정의 패턴을 이해하고, 내가 원하는 방향을 찾아갑니다.</p><strong>온라인 · 60분</strong></article>
          <article><span>02</span><h3>부부·가족상담</h3><p>누가 옳은지를 가리기보다 서로 다른 이야기가 만날 수 있는 대화를 만듭니다.</p><strong>온라인 · 별도 문의</strong></article>
          <article><span>03</span><h3>청소년상담</h3><p>학업과 진로, 또래와 가족관계 속에서 청소년이 자기 목소리를 찾도록 돕습니다.</p><strong>온라인 · 60분</strong></article>
        </div>
        <a className="outlineButton" href={`mailto:${contactEmail}?subject=${encodeURIComponent("[아우데] 온라인 상담 문의")}`}>상담 가능 시간 문의하기 <ArrowIcon /></a>
      </section>

      <section className="counselor section" id="counselor">
        <div className="portraitPlaceholder" aria-label="상담자 사진 영역"><span>AUDE</span><p>당신이 다시<br />자기 편이 되도록.</p></div>
        <div className="profile">
          <p className="sectionNumber">03 / COUNSELOR</p>
          <h2>이성민 상담자</h2>
          <p className="profileLead">“사람은 고쳐져야 할 문제가 아니라,<br />이해받아야 할 이야기를 가진 존재입니다.”</p>
          <p>상담은 누군가가 정답을 알려주는 시간이 아니라, 미처 알아보지 못했던 나의 힘과 선택 가능성을 발견하는 과정이라고 믿습니다.</p>
          <dl>
            <div><dt>학력</dt><dd>한국교원대학교 상담심리 석사</dd></div>
            <div><dt>자격</dt><dd>전문상담교사 1급<br />상담심리사 2급 (한국상담심리학회)</dd></div>
            <div><dt>관점</dt><dd>아들러 심리학 · 내러티브 상담</dd></div>
          </dl>
        </div>
      </section>

      <section className="story section" id="story">
        <div className="storyIntro">
          <p className="sectionNumber">04 / SEND YOUR STORY</p>
          <h2>마음에 걸린 이야기를<br />보내주세요.</h2>
          <p>잘 정리된 글이 아니어도 괜찮습니다. 요즘 자꾸 떠오르는 장면이나 아무에게도 하지 못했던 질문을 편한 말로 적어주세요.</p>
          <p className="notice">※ 사연 접수는 상담을 대체하지 않으며, 위기 상황에는 112·119 또는 자살예방상담전화 109를 이용해 주세요.</p>
        </div>
        <form className="storyForm" onSubmit={submitStory}>
          <label>닉네임<input name="nickname" placeholder="익명도 괜찮아요" /></label>
          <label>당신의 이야기<textarea name="story" required rows={8} placeholder="어떤 이야기를 나누고 싶으신가요?" /></label>
          <label className="check"><input type="checkbox" name="contentConsent" /><span>개인정보를 알 수 없도록 수정한 뒤 콘텐츠에서 사연을 소개하는 것에 동의합니다. (선택)</span></label>
          <label className="check"><input type="checkbox" required /><span>사연 접수와 답변을 위한 개인정보 처리 안내를 확인했습니다. (필수)</span></label>
          <button className="submitButton" type="submit">이야기 보내기 <ArrowIcon /></button>
          {sent && <p className="success" role="status">이메일 작성 창이 열립니다. 내용을 확인한 뒤 전송해 주세요.</p>}
        </form>
      </section>

      <footer>
        <div className="footerBrand"><strong>AUDE</strong><span>아우데 심리상담</span></div>
        <div><p>온라인 심리상담</p><a href={`mailto:${contactEmail}`}>{contactEmail}</a></div>
        <div><p>© {new Date().getFullYear()} AUDE COUNSELING</p><p>본 사이트의 내용은 의료적 진단이나 치료를 대체하지 않습니다.</p></div>
      </footer>
    </main>
  );
}
