# 관리자·수납 회귀 수정 배포

## 배포 순서

1. 현재 운영 DB의 `public.counseling_requests`와 `data`(jsonb), `id`(uuid), `created_at` 컬럼을 확인합니다. 이 변경은 기존 운영 테이블을 사용합니다. 과거 `supabase/schema.sql`의 `submissions` 테이블을 새로 만드는 작업이 아닙니다.
2. Supabase SQL Editor에서 `supabase/migrations/20261022_atomic_appointment.sql`을 실행합니다. 기존 기록은 수정하지 않으며, 관리자 전용 저장 함수를 추가합니다. 함수 실행 권한은 `service_role`만 갖습니다.
3. 아래 확인 쿼리에서 함수 존재 여부와 권한을 확인한 뒤 앱 변경을 병합·배포합니다. 함수가 없으면 새 앱의 일정 등록·수정은 실패하며, 일부 기록만 저장하는 방식으로 되돌아가지 않습니다.
4. 별도 테스트 내담자로 일정 등록 → 부분수납 → 잔액 수납 → 전액 환불 → 일정 취소를 확인합니다. 입금·환불은 각각 실제 거래 월의 대시보드와 엑셀에 남고, 취소된 항목의 미수납만 0원이 되어야 합니다.

```sql
select to_regprocedure('public.save_aude_appointment(uuid,jsonb,integer,uuid,jsonb,integer)');
select
  has_function_privilege('anon', 'public.save_aude_appointment(uuid,jsonb,integer,uuid,jsonb,integer)', 'EXECUTE') as anon_must_be_false,
  has_function_privilege('authenticated', 'public.save_aude_appointment(uuid,jsonb,integer,uuid,jsonb,integer)', 'EXECUTE') as authenticated_must_be_false,
  has_function_privilege('service_role', 'public.save_aude_appointment(uuid,jsonb,integer,uuid,jsonb,integer)', 'EXECUTE') as service_role_must_be_true;
```

## 바뀐 동작

- 항목 취소는 미수납 청구를 중단합니다. 실제 입금·환불과 월별 현금 집계는 유지하며, 오입력 정정된 개별 거래만 집계에서 제외합니다. 과거 취소 항목의 입출금도 다시 집계되므로 이전 대시보드/엑셀과 금액이 달라질 수 있습니다.
- 보유 수납금이 있는 항목은 환불 또는 오입력 정정 후 취소합니다.
- 일정과 연결 수납은 한 트랜잭션에서 생성·수정됩니다. 어느 한 쪽의 버전이 달라졌거나 중간 쓰기가 실패하면 함께 취소됩니다. 기존의 연결 없는 수납이나 과거 불일치는 자동 변경하지 않습니다.
- 일정에 연결된 수납의 정보 수정 버튼은 해당 일정 수정으로 연결됩니다. API에서도 연결 수납만 따로 수정하는 요청을 거절합니다.
- 일정 비용은 유효한 누적 수납액보다 낮출 수 없습니다. 환불한 취소 일정은 새 일정으로 재예약합니다. 환불만으로 미수납이 다시 생기지 않는 기존 규칙은 유지됩니다.
- 상담/검사 외의 임의 서비스 값으로 신청 마감 검사를 우회할 수 없습니다.

## 검증

```bash
npm ci
npm test
npm run typecheck
npm run build
```

`finance-regressions.cjs`는 PGlite의 실제 PostgreSQL 엔진에 마이그레이션을 적용합니다. 저장 후반에 실패하는 트리거, 수납 동시 변경, 오래된 버전, 생성 재시도, 함수 미설치 시 실패, 함수 권한, 월을 넘긴 환불·취소와 엑셀 집계를 검사합니다. 실제 Supabase의 테이블 제약·RLS·프로젝트 설정과 운영 브라우저는 별도로 확인해야 합니다.

## 되돌리기

앱을 이전 커밋으로 되돌려도 새 저장 함수는 기존 코드에 영향을 주지 않습니다. 운영 기록을 삭제하거나 되돌리는 SQL은 실행하지 않습니다. 이전 앱은 기존의 순차 저장 및 취소 집계 문제를 다시 가지므로 일정·수납 수정 사용을 제한한 뒤 원인을 확인합니다.
