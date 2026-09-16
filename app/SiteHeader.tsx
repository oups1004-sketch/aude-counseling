"use client";

import { useEffect, useState } from "react";

const sections = [
  ["about", "아우데 소개"],
  ["counseling", "상담 안내"],
  ["counselor", "상담자"],
  ["story", "사연 보내기"],
] as const;

export default function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("");

  useEffect(() => {
    const updateActive = () => {
      const marker = window.scrollY + 150;
      let active = "";
      for (const [id] of sections) {
        const section = document.getElementById(id);
        if (section && section.offsetTop <= marker) active = id;
      }
      setActiveSection(active);
    };

    updateActive();
    window.addEventListener("scroll", updateActive, { passive: true });
    window.addEventListener("resize", updateActive);
    return () => {
      window.removeEventListener("scroll", updateActive);
      window.removeEventListener("resize", updateActive);
    };
  }, []);

  const openCounseling = () => {
    setMenuOpen(false);
    const button = document.querySelector<HTMLButtonElement>(".counselingApplyButton");
    if (button) button.click();
    else window.location.hash = "counseling";
  };

  return (
    <header className="siteHeader">
      <a className="siteHeaderLogo" href="#top" aria-label="아우데 심리상담 홈">
        <img src="/aude-logo.webp" alt="AUDE" />
      </a>

      <button
        className="siteMenuButton"
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-expanded={menuOpen}
        aria-label="메뉴 열기"
      >
        <span />
        <span />
      </button>

      <nav className={menuOpen ? "siteNav open" : "siteNav"} aria-label="주요 메뉴">
        {sections.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className={activeSection === id ? "active" : ""}
            onClick={() => setMenuOpen(false)}
          >
            {label}
          </a>
        ))}
        <button className="siteConsultCta" type="button" onClick={openCounseling}>
          상담 신청하기
        </button>
      </nav>
    </header>
  );
}
