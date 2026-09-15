# 아우데 심리상담

온라인 심리상담 브랜드 **아우데(AUDE)**의 공식 웹사이트입니다. 접수 내용은 Supabase에 저장되며 `/admin`에서 관리자만 조회하고 관리할 수 있습니다.

## 로컬 실행

```bash
npm install
npm run dev
```

`.env.example`을 `.env.local`로 복사한 뒤 Supabase 설정값을 입력하세요. 자세한 연결 순서는 [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)를 확인하세요.

## Vercel 배포

GitHub 저장소를 Vercel에 연결하고 안내 문서의 환경 변수를 등록합니다. 이후 Vercel 프로젝트 설정에서 독립 도메인을 연결할 수 있습니다.
