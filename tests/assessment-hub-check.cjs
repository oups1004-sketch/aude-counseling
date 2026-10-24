const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript');
const db=new PGlite();let authorized=true;
const json=(v,o={})=>new Response(JSON.stringify(v),{status:o.status||200,headers:o.headers});
async function rest(route,init={}){
 const u=new URL('https://test.invalid'+route);const q=u.searchParams;
 if(u.pathname.endsWith('/rpc/save_aude_appointment')){const i=JSON.parse(init.body);return json((await db.query('select public.save_aude_appointment($1,$2,$3,$4,$5,$6) as saved',[i.appointment_id,i.appointment_data,i.appointment_version,i.charge_id,i.charge_data,i.charge_version])).rows[0].saved);}
 assert.equal(u.pathname,'/rest/v1/counseling_requests');
 const args=[],where=[];const param=v=>{args.push(v);return '$'+args.length;};
 for(const [key,val] of q){if(['select','order','limit','offset'].includes(key))continue;
  const col=key==='id'?'id':key==='data'?'data':key.startsWith('data->>')?`data->>'${key.slice(7).replace(/'/g,"''")}'`:null;if(!col)throw Error('Unsupported filter '+key);
  if(val==='is.null')where.push(col+' is null');else if(val.startsWith('eq.'))where.push(col+'='+param(key==='data'?JSON.parse(val.slice(3)):val.slice(3)));else if(val.startsWith('in.('))where.push(col+' in ('+val.slice(4,-1).split(',').map(param).join(',')+')');else throw Error('Unsupported operator '+val);
 }
 if(init.method==='POST'){const v=JSON.parse(init.body);const r=await db.query('insert into counseling_requests(id,data) values ($1,$2) on conflict do nothing returning *',[v.id||crypto.randomUUID(),v.data]);return json(r.rows,{status:r.rows.length?200:409});}
 if(init.method==='PATCH'){const v=JSON.parse(init.body);return json((await db.query('update counseling_requests set data='+param(v.data)+(v.status?',status='+param(v.status):'')+' where '+where.join(' and ')+' returning *',args)).rows);}
 return json((await db.query('select * from counseling_requests'+(where.length?' where '+where.join(' and '):'')+' order by created_at desc,id desc limit '+Number(q.get('limit')||50000)+' offset '+Number(q.get('offset')||0),args)).rows);
}
const cache={};function load(file){file=path.normalize(file);if(cache[file])return cache[file];const exports={};cache[file]=exports;const req=n=>n==='next/server'?{NextResponse:{json}}:n==='next/headers'?{cookies:async()=>({get:()=>({value:'test'})})}:n.endsWith('/supabase')?{supabaseAdminRequest:rest,verifyAdminSession:()=>authorized}:n.endsWith('/tat')?{...load(path.resolve(path.dirname(file),n+'.ts')),error:e=>e.message}:n.startsWith('.')?load(path.resolve(path.dirname(file),n+'.ts')):require(n);
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:req,Buffer,Date,URL,console,crypto,Response,Request,File,Uint8Array,TextDecoder,process:{env:{ADMIN_PASSWORD:'test-only',NEXT_PUBLIC_SUPABASE_URL:'https://test.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test'}},fetch:async(url,init)=>rest(new URL(url).pathname+new URL(url).search,init)});return exports;}
const req=v=>new Request('https://test.invalid',{method:'POST',body:JSON.stringify(v)});
const get=client=>new Request('https://test.invalid'+(client?'?clientId='+client:''));
async function ok(response){const d=await response.json();assert.equal(response.status,200,JSON.stringify(d));return d;}
(async()=>{
 await db.exec('create role anon;create role authenticated;create role service_role;create table counseling_requests(id uuid primary key,created_at timestamptz default now(),status text default \'신규\',data jsonb not null)');
 await db.exec(fs.readFileSync('supabase/migrations/20261022_atomic_appointment.sql','utf8'));
 const client=crypto.randomUUID(),other=crypto.randomUUID(),rorschach=crypto.randomUUID(),tat=crypto.randomUUID();
 for(const id of [client,other])await db.query('insert into counseling_requests(id,data) values ($1,$2)',[id,{type:'counseling',adminManagedClient:true,admissionStatus:'확정',name:'테스트',service:id===client?'개인상담':'심리검사·해석상담',assessments:[]}]);
 const signatures=load(path.resolve('app/lib/tat.ts'));
 await db.query('insert into counseling_requests(id,data) values ($1,$2)',[rorschach,{type:'rorschach-record',creationNonce:rorschach,creationSignature:signatures.sign('rorschach-record:'+rorschach+':'+client),clientId:client,version:0,examDate:'2026-10-01',responses:[],summary:'',room:{endedAt:'2026-10-01',expiresAt:'2026-10-01',marks:{},revision:1}}]);
 await db.query('insert into counseling_requests(id,data) values ($1,$2)',[tat,{type:'tat-session',creationNonce:tat,creationSignature:signatures.sign('tat-room:'+tat+':'+client),clientId:client,version:0,endedAt:'2026-10-01',expiresAt:'2026-10-01',order:['1'],events:[],recordings:[]}]);
 const hub=load(path.resolve('app/api/admin/assessment-hub/route.ts')),slots=load(path.resolve('app/api/admin/assessments/route.ts')),ops=load(path.resolve('app/api/admin/operations/route.ts'));
 authorized=false;assert.equal((await hub.GET(get())).status,401);assert.equal((await hub.POST(req({}))).status,401);assert.equal((await hub.PATCH(req({}))).status,401);authorized=true;
 const stockId=crypto.randomUUID(),purchase={requestId:crypto.randomUUID(),itemId:stockId,name:'MMPI-2',format:'온라인 인증코드',kind:'purchase',quantity:10,date:'2026-10-01',note:''};await ok(await hub.POST(req(purchase)));await ok(await hub.POST(req(purchase)));
 let overview=await ok(await hub.GET(get()));assert.equal(overview.stock[0].remaining,10);assert.equal(overview.entries.length,2);
 async function slot(name,stock=''){const f=new FormData();for(const [k,v] of Object.entries({requestId:crypto.randomUUID(),clientId:client,testName:name,date:'2026-10-01',interpretationDate:'',stockItemId:stock}))f.set(k,v);const d=await ok(await slots.POST(new Request('https://test.invalid',{method:'POST',body:f})));const retry=await ok(await slots.POST(new Request('https://test.invalid',{method:'POST',body:f})));assert.equal(retry.records.length,d.records.length);return d.records[0];}
 const mmpi=await slot('MMPI-2',stockId),tci=await slot('TCI');overview=await ok(await hub.GET(get(client)));assert.equal(overview.entries.length,4);assert.equal(overview.stock[0].remaining,9);assert.equal(overview.entries.find(e=>e.id===mmpi.id).status,'해석 대기');
 const keys=['slot:'+mmpi.id,'slot:'+tci.id];const booking={type:'aude-appointment',requestId:crypto.randomUUID(),clientId:client,title:'해석상담',startAt:'2026-10-10T10:00',duration:60,kind:'해석상담',status:'예약',sessionNo:1,amount:100000,memo:'',assessmentKeys:keys};
 assert.equal((await ops.POST(req({...booking,clientId:other}))).status,400);
 let appointment=await ok(await ops.POST(req(booking)));await ok(await ops.POST(req(booking)));
 overview=await ok(await hub.GET(get(client)));for(const key of keys){const e=overview.entries.find(e=>e.key===key);assert.equal(e.status,'해석 예약');assert.equal(e.scheduledAt,'2026-10-10T01:00:00.000Z');}
 const edit=async extra=>appointment=await ok(await ops.PATCH(req({...booking,...extra,id:appointment.id,version:appointment.data.version,action:'edit'})));
 await edit({startAt:'2026-10-12T14:00'});overview=await ok(await hub.GET(get(client)));assert.equal(overview.entries.find(e=>e.key===keys[0]).scheduledAt,'2026-10-12T05:00:00.000Z');
 await edit({status:'불참'});overview=await ok(await hub.GET(get(client)));assert.equal(overview.entries.find(e=>e.key===keys[0]).status,'해석 대기');assert.equal(overview.entries.find(e=>e.key===keys[0]).scheduledAt,'');
 await edit({status:'완료',startAt:'2026-10-12T14:00'});overview=await ok(await hub.GET(get(client)));for(const key of keys){const e=overview.entries.find(e=>e.key===key);assert.equal(e.status,'해석 완료');assert.equal(e.interpretationDate,'2026-10-12');}
 assert.equal((await ops.POST(req({...booking,requestId:crypto.randomUUID()}))).status,400);
 await edit({status:'취소'});overview=await ok(await hub.GET(get(client)));assert.equal(overview.entries.find(e=>e.key===keys[0]).status,'해석 대기');
 await ok(await hub.PATCH(req({action:'trash',clientId:client,key:keys[0]})));overview=await ok(await hub.GET(get()));assert.ok(overview.entries.find(e=>e.key===keys[0]).deletedAt);assert.equal(overview.stock[0].remaining,9);
 await ok(await hub.PATCH(req({action:'restore',clientId:client,key:keys[0]})));overview=await ok(await hub.GET(get()));assert.equal(overview.stock[0].remaining,9);
 await ok(await hub.PATCH(req({action:'metadata',clientId:client,key:'rorschach:'+rorschach,date:'2026-10-02',interpretationDate:'2026-10-14',updatedAt:'0'})));overview=await ok(await hub.GET(get(client)));assert.equal(overview.entries.find(e=>e.id===rorschach).interpretationDate,'2026-10-14');
 await ok(await hub.PATCH(req({action:'trash',clientId:client,key:'rorschach:'+rorschach})));assert.equal((await load(path.resolve('app/api/admin/rorschach/route.ts')).GET(new Request('https://test.invalid?id='+rorschach))).status,400);
 await ok(await hub.PATCH(req({action:'restore',clientId:client,key:'rorschach:'+rorschach})));await ok(await load(path.resolve('app/api/admin/rorschach/route.ts')).GET(new Request('https://test.invalid?id='+rorschach)));
 await ok(await hub.PATCH(req({action:'trash',clientId:client,key:'tat:'+tat})));await assert.rejects(()=>signatures.getSession(tat));await ok(await hub.PATCH(req({action:'restore',clientId:client,key:'tat:'+tat})));await signatures.getSession(tat);
 assert.equal((await hub.PATCH(req({action:'trash',clientId:other,key:'tat:'+tat}))).status,400);
 const forgedId=crypto.randomUUID();await db.query('insert into counseling_requests(id,data) values ($1,$2)',[forgedId,{type:'aude-test-stock',creationNonce:forgedId,creationSignature:'0'.repeat(64),movement:{...purchase,quantity:999}}]);overview=await ok(await hub.GET(get()));assert.equal(overview.stock[0].remaining,9);
 console.log('PASS: authenticated assessment hub, signed inventory and retry, slot-driven consumption, grouped booking/move/no-show/cancel/completion, cross-client rejection, soft delete/restore without stock refund, projective dates and access revocation');
 await db.close();
})().catch(e=>{console.error(e);process.exit(1)});
