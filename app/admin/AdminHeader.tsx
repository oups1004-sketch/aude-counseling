import Link from 'next/link';

type Section = 'intake' | 'clients' | 'calendar' | 'finance' | 'assessments';
const sections: {key: Section; href: string; label: string}[] = [
  {key:'intake',href:'/admin',label:'접수'},
  {key:'clients',href:'/admin/clients',label:'내담자'},
  {key:'assessments',href:'/admin/assessments',label:'심리검사'},
  {key:'calendar',href:'/admin/calendar',label:'일정'},
  {key:'finance',href:'/admin/finance',label:'수납·지출'},
];

export default function AdminHeader({active,onLogout}:{active:Section;onLogout?:()=>void}) {
  return <header className="adminHeader workspaceHeader adminNavigation">
    <div className="adminNavigationBrand">
      <Link href="/admin" className="adminBrand" aria-label="AUDE 관리자 접수">AUDE</Link>

    </div>
    <nav aria-label="관리 메뉴">{sections.map(section=><Link key={section.key} href={section.href} className={active===section.key?'active':undefined} aria-current={active===section.key?'page':undefined}>{section.label}</Link>)}</nav>
    <div className="adminNavigationUtilities">
      <Link href="/" className="adminHomeLink" target="_blank" rel="noopener noreferrer">홈페이지 보기 ↗</Link>
      {onLogout&&<button type="button" onClick={onLogout}>로그아웃</button>}
    </div>
  </header>;
}
