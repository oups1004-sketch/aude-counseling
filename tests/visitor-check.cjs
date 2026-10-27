const fs = require('fs'), vm = require('vm'), ts = require('typescript'), assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const crypto = require('node:crypto');
let authorized = false, cookieValues = {}, calls = [], fail = false;
function load(file) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, process: { env: { SUPABASE_SECRET_KEY:'test-secret' } }, URL, console: {error(){}},
    require: name => name === 'node:crypto' ? crypto : name === 'next/headers' ? { cookies:async()=>({get:n=>cookieValues[n] ? {value:cookieValues[n]} : undefined}) } : name === 'next/server' ? {NextResponse:{json:(value,options={})=>{const response=new Response(JSON.stringify(value),options);response.cookies={set:(n,v)=>cookieValues[n]=v};return response;}}} : name.endsWith('visitor-dates') ? {koreaDate:()=> '2026-10-27'} : { verifyAdminSession:()=>authorized, supabaseAdminRequest:async(path,init)=>{calls.push({path,init});if(fail)throw Error();return new Response(JSON.stringify({today:3,month:8,date:'2026-10-27'}));} }
  });
  return exports;
}
const request=(origin='https://aude.test',ua='Mozilla/5.0')=>new Request('https://aude.test/api/visits',{method:'POST',headers:{origin,'user-agent':ua}});
(async()=>{
 const visits=load('app/api/visits/route.ts'),stats=load('app/api/admin/visitors/route.ts');
 assert.equal((await stats.GET()).status,401);
 assert.equal((await visits.POST(request('https://other.test'))).status,403);assert.equal(calls.length,0);
 authorized=true;await visits.POST(request());assert.equal(calls.length,0);
 const result=await stats.GET();assert.equal((await result.json()).month,8);calls=[];authorized=false;
 await visits.POST(request(undefined,'Googlebot'));assert.equal(calls.length,0);
 assert.equal((await visits.POST(request())).status,200);assert.equal(calls.length,2);
 const row=JSON.parse(calls[0].init.body);assert.equal(row.visit_date,'2026-10-27');assert.match(row.visitor_key,/^[a-f0-9]{64}$/);assert.ok(!calls[0].init.body.includes(cookieValues.aude_visitor));
 await visits.POST(request());assert.equal(calls.length,2);
 delete cookieValues.aude_visit_day;await visits.POST(request());assert.equal(JSON.parse(calls[2].init.body).visitor_key,row.visitor_key);assert.match(calls[2].init.headers.Prefer,/ignore-duplicates/);
 delete cookieValues.aude_visit_day;fail=true;assert.equal((await visits.POST(request())).status,503);assert.equal(cookieValues.aude_visit_day,undefined);
 const db=new PGlite();await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
 await db.exec(fs.readFileSync('supabase/migrations/20261027011200_site_visitors.sql','utf8'));
 await db.exec("insert into public.site_visits values ((now() at time zone 'Asia/Seoul')::date,repeat('a',64)) on conflict do nothing; insert into public.site_visits values ((now() at time zone 'Asia/Seoul')::date,repeat('a',64)) on conflict do nothing;");
 let sqlStats=(await db.query('select public.site_visitor_stats() as stats')).rows[0].stats;assert.equal(sqlStats.today,1);assert.equal(sqlStats.month,1);
 await db.exec("insert into public.site_visits values (date_trunc('month',now() at time zone 'Asia/Seoul')::date,repeat('a',64)), ((now() at time zone 'Asia/Seoul')::date,repeat('b',64)), (date_trunc('month',now() at time zone 'Asia/Seoul')::date - 1,repeat('c',64)) on conflict do nothing;");
 sqlStats=(await db.query('select public.site_visitor_stats() as stats')).rows[0].stats;assert.equal(sqlStats.today,2);assert.equal(sqlStats.month,2);
 const permissions=(await db.query("select has_table_privilege('anon','public.site_visits','select') as anon_read,has_table_privilege('authenticated','public.site_visits','insert') as user_write,has_function_privilege('anon','public.site_visitor_stats()','execute') as anon_rpc,relrowsecurity from pg_class where oid='public.site_visits'::regclass")).rows[0];assert.equal(permissions.anon_read,false);assert.equal(permissions.user_write,false);assert.equal(permissions.anon_rpc,false);assert.equal(permissions.relrowsecurity,true);
 await db.exec('set role service_role');assert.equal((await db.query('select public.site_visitor_stats() as stats')).rows[0].stats.month,2);await db.close();
 console.log('PASS: visitor admin authorization, origin and bot exclusions, private cookies, refresh/month deduplication, retry after failure, Korean dates and database role isolation');
})().catch(error=>{console.error(error);process.exit(1)});
