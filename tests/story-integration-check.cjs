// Production Next HTTP routes + isolated PostgreSQL (PGlite), with a small REST adapter.
// Never uses live credentials or live submissions. Run after npm run build.
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs/promises');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const db = new PGlite();
const legacyId = randomUUID();
let failAfterInsert = true;
let app, browser;
const json = (res, status, data) => { res.writeHead(status, {'content-type':'application/json'}); res.end(JSON.stringify(data)); };
const rest = http.createServer(async (req,res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    const table = u.pathname.split('/').pop();
    if (table==='site_visitor_stats') return json(res,200,{today:0,month:0,date:'2026-10-29'});
    if (!['story_submissions','counseling_requests'].includes(table)) return json(res,200,[]);
    const admin = req.headers.apikey === 'integration-secret';
    if (!admin && req.method !== 'POST') return json(res,403,{});
    let body=''; for await (const chunk of req) body+=chunk;
    const data=body?JSON.parse(body):{};
    const id=u.searchParams.get('id')?.slice(3);
    if (req.method==='POST') {
      try {
        // Real INSERT-only PostgreSQL RLS. Role is reset before admin operations.
        await db.exec('set role story_anon');
        await db.query(`insert into ${table}(id,data) values($1,$2)`, [data.id||randomUUID(),data.data]);
      } finally { await db.exec('reset role'); }
      if(table==='story_submissions' && failAfterInsert) { failAfterInsert=false; return json(res,503,{error:'simulated lost acknowledgement after commit'}); }
      return json(res,201,null);
    }
    if(req.method==='PATCH') {
      const expected=JSON.parse(u.searchParams.get('data').slice(3));
      const result=await db.query(`update ${table} set data=$1 where id=$2 and data=$3 returning *`,[data.data,id,expected]);
      return json(res,200,result.rows);
    }
    const result=await db.query(`select * from ${table}${id?' where id=$1':''} order by created_at desc limit 500`,id?[id]:[]);
    return json(res,200,result.rows);
  } catch(e) { json(res,e.code==='23505'?409:500,{code:e.code,message:e.message}); }
});
async function main(){
  console.log('Preparing isolated database');
  await db.exec(`create role story_anon; create table story_submissions(id uuid primary key,created_at timestamptz default now(),status text default '신규',data jsonb); create table counseling_requests(like story_submissions including all); alter table story_submissions enable row level security; alter table counseling_requests enable row level security; grant insert on story_submissions,counseling_requests to story_anon; create policy story_insert on story_submissions for insert to story_anon with check(true); create policy counseling_insert on counseling_requests for insert to story_anon with check(true);`);
  await db.query('insert into story_submissions(id,data) values($1,$2)',[legacyId,{nickname:'과거검증',story:'과거 사연, "인용"\n둘째 줄',contentConsent:true,adaptationRequested:true}]);
  await new Promise(resolve=>rest.listen(0,'127.0.0.1',resolve));
  console.log('Database ready');
  const restUrl=`http://127.0.0.1:${rest.address().port}`;
  const port=Number(process.env.AUDE_INTEGRATION_PORT||3187), base=`http://127.0.0.1:${port}`;
  let output='';
  app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:restUrl,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'integration-public',SUPABASE_SECRET_KEY:'integration-secret',ADMIN_PASSWORD:'integration-only-password'},stdio:['ignore','pipe','pipe']});
  app.stdout.on('data',b=>{output+=b;process.stdout.write(b)});app.stderr.on('data',b=>{output+=b;process.stderr.write(b)});
  for(let i=0;i<120;i++){try{if((await fetch(base,{signal:AbortSignal.timeout(1500)})).ok)break;}catch{} if(i===119)throw Error(output);await new Promise(r=>setTimeout(r,250));}
  const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'integration-only-password'})});
  assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  const call=async(path,body)=>{const r=await fetch(base+path,{method:body?'PATCH':'GET',headers:{cookie,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});assert.equal(r.status,200,await r.clone().text());return r.json();};
  assert.equal((await fetch(base+'/api/admin/submissions')).status,401);
  const payload={type:'story',nickname:'통합검증',story:'새 사연, "인용"\n둘째 줄',email:'test@example.com',privacyConsent:true,contentConsent:'동의',requestId:randomUUID()};
  const send=()=>fetch(base+'/api/submit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  assert.equal((await send()).status,500); // committed, but no successful acknowledgement
  let rows=(await db.query('select * from story_submissions')).rows;assert.equal(rows.length,2);
  const item=(await call('/api/admin/submissions')).find(i=>i.nickname==='통합검증');
  await call('/api/admin/submissions',{id:item.id,status:'답장 완료',adminNote:'관리자 보존 메모',important:true});
  const retries=await Promise.all([send(),send()]);assert.ok(retries.every(r=>r.status===200));
  rows=(await db.query('select * from story_submissions')).rows;assert.equal(rows.length,2);
  const saved=rows.find(r=>r.id===item.id.slice(6));assert.equal(saved.data.adminNote,'관리자 보존 메모');assert.equal(saved.data.replyStatus,'답장 완료');assert.equal(saved.data.privacyConsent,true);assert.ok(saved.data.privacyConsentAt);
  const old=(await call('/api/admin/submissions')).find(i=>i.id===`story:${legacyId}`);assert.equal(old.adaptation_requested,true);
  await call('/api/admin/submissions',{id:old.id,action:'review'});
  await call('/api/admin/submissions',{id:old.id,status:'답장 안 함',important:true,adminNote:'과거 메모 보존'});
  assert.equal((await call('/api/admin/submissions')).find(i=>i.id===old.id).adaptation_requested,true);
  console.log('PASS: production HTTP routes → PostgreSQL INSERT-only RLS → lost acknowledgement → concurrent retries → one row; admin note/status, consent and legacy adaptation preserved');
  if(process.env.AUDE_BROWSER_MODULE){
    const {chromium}=require(process.env.AUDE_BROWSER_MODULE);
    const options={headless:true};if(process.env.AUDE_CHROMIUM_MODULE){const binary=(await import(process.env.AUDE_CHROMIUM_MODULE)).default;options.args=binary.args;options.executablePath=await binary.executablePath();}
    const existing = await execFile(process.execPath,['tests/story-browser-check.cjs'],{env:{...process.env,AUDE_TEST_URL:base,NODE_PATH:require('node:path').dirname(process.env.AUDE_BROWSER_MODULE)}});
    process.stdout.write(existing.stdout);
    browser=await chromium.launch(options);const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
    page.on('pageerror',e=>console.error('BROWSER ERROR',e));
    // Real /api/submit goes through Next and PostgreSQL; fail only the response acknowledgement.
    failAfterInsert=true;
    await page.goto(base);await page.locator('#story-message').fill('브라우저 통합 사연');await page.locator('[name=nickname]').fill('브라우저검증');await page.locator('[name=privacyConsent]').check();await page.locator('.letterSend').click();await page.locator('dialog.storyConfirmation input[type=checkbox]').check();await page.locator('dialog.storyConfirmation .submitButton').click();await page.locator('dialog.storyConfirmation [role=alert]').waitFor();
    const key=await page.evaluate(()=>sessionStorage.getItem('aude-story-request-v1'));assert.ok(key);
    await page.reload();await page.locator('#story-message').fill('브라우저 통합 사연');await page.locator('[name=nickname]').fill('브라우저검증');await page.locator('[name=privacyConsent]').check();await page.locator('.letterSend').click();assert.equal(await page.evaluate(()=>sessionStorage.getItem('aude-story-request-v1')),key);await page.locator('dialog.storyConfirmation input[type=checkbox]').check();await page.locator('dialog.storyConfirmation .submitButton').click();await page.locator('.letterSuccess').waitFor();
    assert.equal((await db.query("select count(*)::int n from story_submissions where data->>'nickname'='브라우저검증'")).rows[0].n,1);
    assert.equal(await page.locator('.letterSuccess h3').evaluate(el=>el===document.activeElement),true);assert.equal(await page.evaluate(()=>sessionStorage.getItem('aude-story-request-v1')),null);
    await page.context().addCookies([{name:'aude_admin_token',value:cookie.slice(cookie.indexOf('=')+1),url:base}]);await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/admin');await page.locator('.submissionOpen').filter({hasText:'과거검증'}).click();const detail=page.getByRole('dialog',{name:'접수 상세'});await detail.getByText('기존 각색 요청',{exact:true}).waitFor();await detail.getByLabel('관리자 메모').fill('브라우저 저장, "메모"\n둘째 줄');await detail.getByRole('button',{name:'변경사항 저장'}).click();await detail.getByText('모든 변경사항이 저장되어 있어요',{exact:true}).waitFor();await detail.getByRole('button',{name:'닫기',exact:true}).click();
    await page.reload();await page.locator('.adaptationBadge').waitFor();await page.getByRole('textbox',{name:'접수 검색'}).fill('과거검증');
    const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'CSV 저장',exact:true}).click();const download=await downloadPromise;const csv=await fs.readFile(await download.path(),'utf8');assert.ok(csv.includes('각색 요청'));assert.ok(csv.includes('"과거 사연, ""인용""\n둘째 줄"'));assert.ok(csv.includes('"브라우저 저장, ""메모""\n둘째 줄"'));assert.ok(!csv.includes('통합검증'));console.log('PASS: real browser submission → lost acknowledgement → reload retry → completion focus → admin legacy detail/edit/reload → filtered CSV with multiline quotes');
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(app)app.kill();rest.closeAllConnections();await new Promise(r=>rest.close(r));await db.close();});
