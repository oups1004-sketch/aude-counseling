# 아우데 심리상담

온라인 심리상담 브랜드 **아우데(AUDE)**의 공식 웹사이트입니다. 일반 Next.js 프로젝트로 구성되어 GitHub와 Vercel에서 독립적으로 운영할 수 있습니다.

## 로컬 실행

```bash
npm install
npm run dev
```

`.env.example`을 `.env.local`로 복사한 뒤 실제 상담 접수 이메일을 입력하세요.

## Vercel 배포

GitHub 저장소를 Vercel에 연결하고 `NEXT_PUBLIC_CONTACT_EMAIL` 환경 변수를 등록하면 됩니다. 이후 Vercel 프로젝트 설정에서 독립 도메인을 연결할 수 있습니다.
