const { PGlite } = require('@electric-sql/pglite');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const { unzipSync, strFromU8 } = require('fflate');

const db = new PGlite();
const clientId = crypto.randomUUID();
let authorized = true;
let failRPC = false;
let concurrentPayment = null;
let lastRPC;
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
const request = value => new Request('https://test.invalid', { method: 'POST', body: JSON.stringify(value) });

async function rest(path, init = {}) {
  const u = new URL('https://test.invalid' + path);
  if (u.pathname.endsWith('/rpc/save_aude_appointment')) {
    if (failRPC) throw Error('RPC unavailable');
    const i = JSON.parse(init.body);
    lastRPC = i;
    if (concurrentPayment) {
      const c = (await db.query('select data from counseling_requests where id=$1', [i.charge_id])).rows[0].data;
      c.version++;
      c.payments.push(concurrentPayment);
      await db.query('update counseling_requests set data=$1 where id=$2', [c, i.charge_id]);
      concurrentPayment = null;
    }
    const r = await db.query('select public.save_aude_appointment($1,$2,$3,$4,$5,$6) as saved',
      [i.appointment_id, i.appointment_data, i.appointment_version, i.charge_id, i.charge_data, i.charge_version]);
    return json(r.rows[0].saved);
  }
  assert.equal(u.pathname, '/rest/v1/counseling_requests');
  const id = u.searchParams.get('id')?.slice(3);
  if (init.method === 'POST') {
    const input = JSON.parse(init.body);
    const r = await db.query('insert into counseling_requests(id,data) values ($1,$2) on conflict do nothing returning id', [input.id, input.data]);
    return json({}, r.rows.length ? 200 : 409);
  }
  if (init.method === 'PATCH') {
    const version = Number(u.searchParams.get('data->>version').slice(3));
    const r = await db.query("update counseling_requests set data=$1 where id=$2 and (data->>'version')::integer=$3 returning *",
      [JSON.parse(init.body).data, id, version]);
    return json(r.rows);
  }
  if (id) return json((await db.query('select * from counseling_requests where id=$1', [id])).rows);
  const nonce = u.searchParams.get('data->>creationNonce')?.slice(3);
  if (nonce) return json((await db.query("select * from counseling_requests where data->>'creationNonce'=$1", [nonce])).rows);
  return json((await db.query("select * from counseling_requests where data->>'type' in ('aude-charge','aude-appointment','aude-expense') order by id")).rows);
}

const cache = {};
function load(file) {
  if (cache[file]) return cache[file];
  const exports = {};
  cache[file] = exports;
  const req = name => {
    if (name === 'next/server') return { NextResponse: { json: (v, o) => json(v, o?.status) } };
    if (name.endsWith('/tat')) return { admin: async () => authorized, validId: v => /^[a-f0-9-]{36}$/.test(v), error: e => e.message, privateHeaders: {} };
    if (name.endsWith('/supabase')) return { supabaseAdminRequest: rest };
    if (name.startsWith('.')) return load('app/lib/' + name.split('/').pop() + '.ts');
    return require(name);
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, require: req, Buffer, Date, URL, console, crypto, Response, Request, Uint8Array, setTimeout,
    process: { env: { ADMIN_PASSWORD: 'test-only', NEXT_PUBLIC_SUPABASE_URL: 'https://test.invalid', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-only' } },
    fetch: async (url, init) => rest(new URL(url).pathname, init),
  });
  return exports;
}

(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table counseling_requests(id uuid primary key, created_at timestamptz default now(), status text default '신규', data jsonb not null);`);
  await db.exec(fs.readFileSync('supabase/migrations/20261022_atomic_appointment.sql', 'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261026074425_permanent_assessment_deletion.sql', 'utf8'));
  const privileges = await db.query(`select
    has_function_privilege('anon','public.save_aude_appointment(uuid,jsonb,integer,uuid,jsonb,integer)','execute') as anon,
    has_function_privilege('authenticated','public.save_aude_appointment(uuid,jsonb,integer,uuid,jsonb,integer)','execute') as authenticated,
    has_function_privilege('service_role','public.save_aude_appointment(uuid,jsonb,integer,uuid,jsonb,integer)','execute') as service`);
  assert.deepEqual(privileges.rows[0], { anon: false, authenticated: false, service: true });
  await db.query('insert into counseling_requests(id,data) values ($1,$2)', [clientId, {
    type: 'counseling', adminManagedClient: true, admissionStatus: '확정', name: '테스트 내담자',
  }]);
  const api = load('app/api/admin/operations/route.ts');
  const model = load('app/lib/operations-model.ts');
  const exporter = load('app/lib/operations-export.ts');
  const input = { type: 'aude-appointment', requestId: crypto.randomUUID(), clientId, title: '개인상담',
    startAt: '2026-10-08T19:00', duration: 60, kind: '개인상담', status: '예약', sessionNo: 1, amount: 100000, memo: '' };
  const snapshot = async () => (await db.query('select * from counseling_requests order by id')).rows;
  const patch = async (row, extra) => api.PATCH(request({ id: row.id, version: row.data.version, ...extra }));
  const edit = (row, extra = {}) => ({ ...input, action: 'edit', chargeId: row.data.chargeId, ...extra });
  const pay = (direction, amount, date = '2026-10-08') => ({ action: 'payment', paymentId: crypto.randomUUID(),
    direction, amount, date, method: '아우데 사업자 계좌', evidence: '확인 필요', memo: '', refundReason: '일정 취소' });
  const success = async response => { assert.equal(response.status, 200, await response.clone().text()); return response.json(); };

  let appointment = await success(await api.POST(request(input)));
  let charge = appointment.linkedCharge;
  assert.equal(charge.data.sessionNo, 1);
  const beforeRetry = await snapshot();
  assert.equal((await success(await api.POST(request(input)))).id, appointment.id);
  assert.deepEqual(await snapshot(), beforeRetry);
  // Function executes with service-role access even without direct table INSERT privileges.
  await db.exec('set role service_role');
  await rest('/rest/v1/rpc/save_aude_appointment', { body: JSON.stringify(lastRPC) });
  await db.exec('reset role');

  charge = await success(await patch(charge, pay('receipt', 40000)));
  assert.equal(model.chargeTotals(charge.data).due, 60000);
  assert.equal(model.chargeStatus(charge.data), '일부 수납');
  charge = await success(await patch(charge, pay('receipt', 60000)));
  let before = await snapshot();
  assert.equal((await patch(charge, {action:'edit',clientId,title:'불일치',memo:'',date:'2026-10-08',amount:120000})).status, 400);
  assert.equal((await patch(appointment, edit(appointment, { amount: 80000 }))).status, 400);
  assert.equal((await patch(charge, { action: 'archive', archived: true })).status, 400);
  assert.deepEqual(await snapshot(), before);
  const noReason = pay('refund', 100000); delete noReason.refundReason;
  assert.equal((await patch(charge, noReason)).status, 400);
  charge = await success(await patch(charge, pay('refund', 100000, '2026-11-01')));
  appointment = await success(await patch(appointment, edit(appointment, { status: '취소' })));
  charge = appointment.linkedCharge;
  assert.equal(charge.data.archived, true);
  const list = await success(await api.GET());
  assert.equal(model.monthTotals(list, '2026-10').received, 100000);
  assert.equal(model.monthTotals(list, '2026-11').refunded, 100000);
  assert.equal(model.chargeTotals(charge.data).due, 0);
  const workbook = unzipSync(exporter.operationsWorkbook(list, '2026-11'));
  const paymentsSheet = strFromU8(workbook['xl/worksheets/sheet4.xml']);
  assert.ok(paymentsSheet.includes('항목 취소 (입출금 집계 유지)'));
  assert.ok(paymentsSheet.includes('<v>100000</v>'));
  before = await snapshot();
  assert.equal((await patch(appointment, edit(appointment))).status, 400);
  assert.equal((await patch(charge, { action: 'archive', archived: false })).status, 400);
  assert.deepEqual(await snapshot(), before);
  const rebook = await success(await api.POST(request({ ...input, requestId: crypto.randomUUID() })));
  assert.equal(model.chargeTotals(rebook.linkedCharge.data).due, 100000);

  // Database failure AFTER the charge write must roll back BOTH create and edit.
  await db.exec(`create function fail_appointment_write() returns trigger language plpgsql as $$
    begin if new.data->>'title' = 'FAIL_WRITE' then raise exception 'injected write failure'; end if; return new; end $$;
    create trigger fail_write before insert or update on counseling_requests for each row
    when (new.data->>'type' = 'aude-appointment') execute function fail_appointment_write();`);
  before = await snapshot();
  const retryId = crypto.randomUUID();
  assert.equal((await api.POST(request({ ...input, requestId: retryId, title: 'FAIL_WRITE' }))).status, 400);
  assert.deepEqual(await snapshot(), before);
  assert.equal((await patch(rebook, edit(rebook, { title: 'FAIL_WRITE' }))).status, 400);
  assert.deepEqual(await snapshot(), before);
  const recovered = await success(await api.POST(request({ ...input, requestId: retryId })));
  assert.ok(recovered.linkedCharge);

  // Payment committed after reading the charge: CAS conflict preserves the payment and appointment.
  concurrentPayment = { id: crypto.randomUUID(), date: '2026-10-08', amount: 40000, direction: 'receipt', method: '카드결제', evidence: '확인 필요', memo: '' };
  assert.equal((await patch(rebook, edit(rebook, { amount: 80000 }))).status, 400);
  const latestA = (await db.query('select data from counseling_requests where id=$1', [rebook.id])).rows[0].data;
  const latestC = (await db.query('select data from counseling_requests where id=$1', [rebook.data.chargeId])).rows[0].data;
  assert.equal(latestA.amount, 100000);
  assert.equal(latestA.version, 0);
  assert.equal(latestC.amount, 100000);
  assert.equal(latestC.payments[0].amount, 40000);
  const updated = await success(await patch(rebook, edit(rebook, { title: '변경된 일정' })));
  assert.equal(updated.linkedCharge.data.title, '변경된 일정');
  before = await snapshot();
  assert.equal((await patch(rebook, edit(rebook, { title: '오래된 창' }))).status, 400);
  assert.deepEqual(await snapshot(), before);

  const finance={appointments:[],charges:[{id:'mixed',data:{type:'aude-charge',amount:200000,payments:[
    {date:'2026-10-01',direction:'receipt',amount:80000,method:'카드결제'},
    {date:'2026-10-02',direction:'receipt',amount:50000,method:'상담자 이성민 계좌'},
    {date:'2026-10-03',direction:'receipt',amount:70000,method:'아우데 사업자 계좌'},
    {date:'2026-10-04',direction:'refund',amount:10000,method:'카드결제'},
    {date:'2026-10-05',direction:'receipt',amount:99999,method:'아우데 사업자 계좌',voided:true},
    {date:'2026-11-01',direction:'refund',amount:30000,method:'상담자 이성민 계좌'}
  ]}}],expenses:[{data:{date:'2026-10-01',amount:20000,account:'aude'}},{data:{date:'2026-10-01',amount:5000,account:'counselor'}},{data:{date:'2026-10-01',amount:3000}},{data:{date:'2026-10-01',amount:1000,account:'aude',archived:true}}]};
  assert.equal(model.monthTotals(finance,'2026-10','aude').received,150000);
  assert.equal(model.monthTotals(finance,'2026-10','aude').refunded,10000);
  assert.equal(model.monthTotals(finance,'2026-10','aude').balance,120000);
  assert.equal(model.monthTotals(finance,'2026-10','counselor').balance,45000);
  assert.equal(model.monthTotals(finance,'2026-11','counselor').net,-30000);
  assert.equal(model.monthTotals(finance,'2026-10','unknown').spent,3000);
  assert.equal(model.monthTotals(finance,'2026-10').balance,162000);
  const scoped=unzipSync(exporter.operationsWorkbook(finance,'2026-10','aude'));
  const scopedPayments=strFromU8(scoped['xl/worksheets/sheet4.xml']);
  assert.ok(scopedPayments.includes('카드결제'));assert.ok(scopedPayments.includes('아우데 계좌'));assert.ok(!scopedPayments.includes('상담자 이성민 계좌'));
  assert.ok(strFromU8(scoped['xl/worksheets/sheet5.xml']).includes('출금 계좌'));
  const businessExpense={type:'aude-expense',requestId:crypto.randomUUID(),title:'검사 자료',date:'2026-10-26',amount:10000,category:'검사·상담 자료비',account:'aude',memo:''};
  const exp=await success(await api.POST(request(businessExpense)));assert.equal(exp.data.account,'aude');
  const expChanged=await success(await patch(exp,{...businessExpense,action:'edit',account:'counselor'}));assert.equal(expChanged.data.account,'counselor');
  assert.equal((await api.POST(request({...businessExpense,requestId:crypto.randomUUID(),account:'forged'}))).status,400);
  const addPayment=load('app/lib/operations.ts').addPayment;
  const card=addPayment({type:'aude-charge',amount:100000,payments:[]},{paymentId:crypto.randomUUID(),date:'2026-10-26',direction:'receipt',amount:80000,method:'카드결제',account:'counselor',evidence:'확인 필요',memo:''});assert.equal(card.payments[0].account,'aude');
  before=await snapshot();
  failRPC = true;
  assert.equal((await api.POST(request({ ...input, requestId: crypto.randomUUID() }))).status, 400);
  assert.deepEqual(await snapshot(), before); // no sequential fallback
  failRPC = false;
  authorized = false;
  assert.equal((await api.POST(request(input))).status, 401);
  assert.equal((await patch(updated, edit(updated))).status, 401);
  console.log('PASS: SQL permissions, atomic create/edit rollback, retry, concurrent payment, stale versions, historical cash, export, fee guard and rebooking');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.close());
