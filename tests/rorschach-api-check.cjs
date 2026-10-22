const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict'),crypto=require('node:crypto');
process.env.ADMIN_PASSWORD='temporary-unit-test-secret';process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.invalid';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='test-public-key';let cookies={},admin=false;const rows=new Map(),objects=new Map();let buckets=[];
objects.set('aude-tat-cards-private/1',new Uint8Array([137,80,78,71]));
const clientId='11111111-1111-4111-8111-111111111111';rows.set(clientId,{id:clientId,created_at:new Date().toISOString(),data:{adminManagedClient:true,admissionStatus:'확정',type:'counseling',name:'검증용 내담자'}});
const json=v=>new Response(JSON.stringify(v),{headers:{'Content-Type':'application/json'}});
async function database(path,init={},publicInsert=false){const u=new URL('https://example.invalid'+path),method=init.method||'GET';
 if(u.pathname==='/storage/v1/bucket'){if(method==='POST')buckets.push(JSON.parse(init.body));return json(buckets);}
 if(u.pathname.startsWith('/storage/v1/object/authenticated/'))return new Response(objects.get(u.pathname.replace('/storage/v1/object/authenticated/','')));
 if(u.pathname.startsWith('/storage/v1/object/')){const key=u.pathname.replace('/storage/v1/object/','');if(method==='POST'){objects.set(key,init.body);return json({ok:true});}}
 const nonce=u.searchParams.get('data->>creationNonce')?.replace('eq.','');if(nonce&&method==='GET')return json([...rows.values()].filter(x=>x.data.creationNonce===nonce));
 const id=u.searchParams.get('id')?.replace('eq.','');
 if(method==='POST'){if(!publicInsert)throw new Error('Supabase admin request failed (403): permission denied for INSERT');const row={id:crypto.randomUUID(),created_at:new Date().toISOString(),...JSON.parse(init.body)};rows.set(row.id,row);return json([row]);}
 if(method==='PATCH'){const row=rows.get(id),version=u.searchParams.get('data->>version');if(version&&(version==='is.null'?row.data.version!==undefined:String(row.data.version)!==version.replace('eq.','')))return json([]);rows.set(id,{...row,...JSON.parse(init.body)});return json([rows.get(id)]);}
 return json(id?(rows.has(id)?[structuredClone(rows.get(id))]:[]):[...rows.values()]);}
const cache={};function load(file){if(cache[file])return cache[file];const exports={},source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const req=name=>{if(name==='next/headers')return {cookies:async()=>({get:key=>cookies[key]?{value:cookies[key]}:undefined})};if(name==='next/server')return {NextResponse:{json(v,o){const r=new Response(JSON.stringify(v),{status:o?.status||200});r.cookies={set(n,v){cookies[n]=v;}};return r;}}};if(name.endsWith('/supabase')||name==='./supabase')return {verifyAdminSession:()=>admin,supabaseAdminRequest:database};if(name.endsWith('/client-eligibility'))return load('app/lib/client-eligibility.ts');if(name.endsWith('/operations'))return {getOperations:async()=>[]};if(name.endsWith('/rorschach-records'))return load('app/lib/rorschach-records.ts');if(name.endsWith('/tat-records'))return load('app/lib/tat-records.ts');if(name.endsWith('/tat'))return load('app/lib/tat.ts');return require(name);};
 vm.runInNewContext(source,{require:req,exports,process,Buffer,Date,Response,Request,URL,ReadableStream,Uint8Array,crypto,console,fetch:async(url,init)=>database(new URL(url).pathname,init,true)});cache[file]=exports;return exports;}
const request=(url,data)=>new Request('https://test.invalid'+url,{method:data===undefined?'GET':'POST',body:data===undefined?undefined:JSON.stringify(data)});

(async()=>{
 const a=load('app/api/admin/rorschach/route.ts');
 const draft={examDate:'2026-10-22',responses:[{id:'test-1',card:'I',response:'첫 줄\n둘째 줄',inquiry:'질문 기록',location:'전체',orientation:'미기록',observation:'관찰',coding:''}],summary:'종합'};
 for(const method of ['GET','POST','PATCH'])assert.equal((await a[method](request('/api/admin/rorschach',method==='GET'?undefined:draft))).status,401);
 admin=true;
 assert.equal((await a.POST(request('/api/admin/rorschach',{...draft,clientId:'invalid'}))).status,400);
 const madeResponse=await a.POST(request('/api/admin/rorschach',{...draft,clientId}));assert.equal(madeResponse.status,200);const made=await madeResponse.json();
 assert.equal(made.data.responses[0].response,draft.responses[0].response);assert.equal(made.data.version,0);
 const forged=structuredClone(made);forged.id=crypto.randomUUID();forged.data.creationSignature='0'.repeat(64);rows.set(forged.id,forged);
 const list=await(await a.GET(request('/api/admin/rorschach'))).json();assert.equal(list.length,1);
 assert.equal((await a.GET(request('/api/admin/rorschach?id='+forged.id))).status,400);
 const changed={...draft,id:made.id,version:0,summary:'저장 후 종합'};
 assert.equal((await a.PATCH(request('/api/admin/rorschach',changed))).status,200);
 assert.equal((await a.PATCH(request('/api/admin/rorschach',changed))).status,409);
 assert.equal(rows.get(made.id).data.summary,'저장 후 종합');assert.equal(rows.get(made.id).data.creationSignature,made.data.creationSignature);
 const v=load('app/lib/rorschach-records.ts');
 for(const bad of [{...draft,examDate:'2026-02-30'},{...draft,responses:[{...draft.responses[0],card:'XI'}]},{...draft,responses:[draft.responses[0],draft.responses[0]]},{...draft,responses:[{...draft.responses[0],orientation:'45'}]},{...draft,summary:'x'.repeat(30001)}])assert.throws(()=>v.validateDraft(bad));
 const csv=v.recordsCsv({...draft,responses:[{...draft.responses[0],response:'=1+1'}]});assert.ok(csv.includes("'=1+1"));assert.ok(csv.startsWith('\uFEFF'));
 admin=false;assert.equal((await a.GET(request('/api/admin/rorschach?id='+made.id))).status,401);
 console.log('PASS: admin-only record create/read/update, signed-record filtering, conflict preservation, validation and Excel formula escaping');
})().catch(e=>{console.error(e);process.exit(1);});
