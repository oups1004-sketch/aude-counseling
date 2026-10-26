const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript');
let authorized=true,conflict=false,publicBucket=false;const id=crypto.randomUUID();let data={adminManagedClient:true,admissionStatus:'확정',name:'테스트',clientMemo:'보존',assessments:[{id:'keep'}]};const objects=new Map();
const json=(v,o={})=>new Response(JSON.stringify(v),{status:o.status||200,headers:o.headers});
async function rest(route,init={}){
 const u=new URL('https://test.invalid'+route);
 if(u.pathname==='/storage/v1/bucket')return json([{id:'aude-student-private',public:publicBucket}]);
 if(u.pathname.startsWith('/storage/v1/object/')){
  if(init.method==='DELETE'){for(const p of JSON.parse(init.body).prefixes)objects.delete(p);return json({});}
  const key=u.pathname.replace('/storage/v1/object/authenticated/aude-student-private/','').replace('/storage/v1/object/aude-student-private/','');
  if(init.method==='POST'){objects.set(key,init.body);return json({});}return new Response(objects.get(key));
 }
 assert.equal(u.pathname,'/rest/v1/counseling_requests');
 if(init.method==='PATCH'){if(conflict)return json([]);assert.deepEqual(JSON.parse(u.searchParams.get('data').slice(3)),data);data=JSON.parse(init.body).data;return json([{data}]);}return json([{data}]);
}
const cache={};function load(file){file=path.resolve(file);if(cache[file])return cache[file];const exports={};cache[file]=exports;const req=n=>n==='next/server'?{NextResponse:{json}}:n.endsWith('/tat')?{admin:async()=>authorized,privateHeaders:{'Cache-Control':'private, no-store'},validId:v=>/^[a-f0-9-]{36}$/i.test(v)}:n.endsWith('/supabase')?{supabaseAdminRequest:rest}:n.startsWith('.')?load(path.resolve(path.dirname(file),n+'.ts')):require(n);vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:req,Buffer,Date,URL,crypto,Response,Request,File,Uint8Array});return exports;}
const api=load('app/api/admin/student-verification/route.ts'),model=load('app/lib/student-verification.ts');
function request(kind='대학생',content='%PDF-test',updatedAt=data.studentVerification?.updatedAt||'',action=''){const f=new FormData();f.set('clientId',id);f.set('kind',kind);f.set('updatedAt',updatedAt);f.set('file',new File([content],'증명서.pdf'));if(action)f.set('action',action);return new Request('https://test.invalid',{method:'POST',body:f});}
const get=()=>new Request('https://test.invalid?clientId='+id);
(async()=>{
 authorized=false;assert.equal((await api.POST(request())).status,401);assert.equal((await api.GET(get())).status,401);assert.equal(objects.size,0);authorized=true;
 assert.equal((await api.POST(request('졸업생'))).status,400);assert.equal((await api.POST(request('대학생','<script>bad</script>'))).status,400);assert.equal(objects.size,0);
 publicBucket=true;assert.equal((await api.POST(request())).status,400);publicBucket=false;
 assert.equal((await api.POST(request())).status,200);assert.equal(data.studentVerification.kind,'대학생');assert.equal(objects.size,1);assert.equal(data.clientMemo,'보존');assert.equal(data.assessments[0].id,'keep');
 assert.equal(model.counselingFee(data.studentVerification,'개인상담'),80000);assert.equal(model.counselingFee(data.studentVerification,'해석상담'),100000);assert.equal(model.counselingFee(null,'개인상담'),100000);
 const download=await api.GET(get());assert.equal(download.status,200);assert.equal(await download.text(),'%PDF-test');assert.equal(download.headers.get('cache-control'),'private, no-store');
 assert.equal((await api.POST(request('대학원생','%PDF-new','stale'))).status,400);assert.equal(objects.size,1);
 conflict=true;assert.equal((await api.POST(request('대학원생'))).status,400);assert.equal(objects.size,1);assert.equal(data.studentVerification.kind,'대학생');conflict=false;
 assert.equal((await api.POST(request('대학원생'))).status,200);assert.equal(data.studentVerification.kind,'대학원생');assert.equal(objects.size,1);
 assert.equal((await api.POST(request('대학원생','',data.studentVerification.updatedAt,'revoke'))).status,200);assert.equal(data.studentVerification,null);assert.equal(objects.size,0);assert.equal((await api.GET(get())).status,404);
 console.log('PASS: student verification authorization, file validation, private storage, registration/replacement/revocation, stale/concurrent updates, cleanup, preserved client records and fee defaults');
})().catch(e=>{console.error(e);process.exit(1)});
