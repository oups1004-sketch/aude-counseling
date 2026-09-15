# 아우데 접수 시스템 연결하기

사이트 코드는 이미 Supabase 방식으로 준비되어 있습니다. 아래 작업만 한 번 진행하면 됩니다.

## 1. Supabase 프로젝트 만들기

1. [Supabase](https://supabase.com/)에 로그인합니다.
2. `New project`를 누르고 프로젝트 이름과 데이터베이스 비밀번호를 정합니다.
3. 실제 상담 자료가 저장될 위치이므로 Region은 가능한 한 가까운 지역을 선택합니다.

## 2. 접수용 표 만들기

1. 왼쪽 `SQL Editor`를 엽니다.
2. `New query`를 누릅니다.
3. 이 저장소의 `supabase/schema.sql` 전체를 붙여넣습니다.
4. `Run`을 누릅니다.

`Table Editor`에서 `submissions`가 보이면 성공입니다. 접수면접은 `I`, 심리검사는 `T`, 사연은 `S`로 시작하는 접수번호가 자동 생성됩니다.

## 3. 관리자 계정 만들기

1. 왼쪽 `Authentication` → `Users`로 갑니다.
2. `Add user` → `Create new user`를 누릅니다.
3. 관리자용 이메일과 강한 비밀번호를 입력합니다.
4. 일반 방문자가 가입하지 못하도록 `Authentication` 설정에서 공개 이메일 가입을 끕니다.

## 4. Vercel에 비밀 설정 넣기

Supabase의 `Project Settings` → `API`에서 주소와 키를 확인한 뒤 Vercel 프로젝트의 `Settings` → `Environment Variables`에 아래 값을 넣습니다.

| 이름 | 값 |
| --- | --- |
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role/secret key |
| `ADMIN_EMAIL` | 3단계에서 만든 관리자 이메일 |
| `NEXT_PUBLIC_CONTACT_EMAIL` | 방문자에게 보여줄 문의 이메일 |

모든 값은 `Production`과 `Preview`에 적용합니다. `SUPABASE_SERVICE_ROLE_KEY`는 절대 GitHub나 대화창에 올리지 않습니다.

기존 `GOOGLE_APPS_SCRIPT_URL`, `SUBMISSION_SECRET`은 이제 사용하지 않으므로 삭제해도 됩니다.

## 5. 재배포하고 확인하기

1. Vercel `Deployments`에서 최신 배포를 `Redeploy`합니다.
2. 사이트에서 테스트 사연을 한 건 보냅니다.
3. `/admin`으로 들어가 3단계의 이메일과 비밀번호로 로그인합니다.
4. 접수가 보이는지, 상태·메모 변경과 CSV 저장이 되는지 확인합니다.

## 공개 전 확인

- Supabase 프로젝트의 저장 지역과 국외 이전 여부를 기준으로 개인정보 처리방침 문구를 최종 확인하세요.
- 상담 관련 기록은 민감할 수 있으므로 관리자 계정에 강한 비밀번호와 가능하면 다중 인증을 사용하세요.
- 스팸이 실제로 발생하면 Cloudflare Turnstile 같은 사람 확인 절차를 추가하는 것이 좋습니다.
