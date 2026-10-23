const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict'),crypto=require('node:crypto');
process.env.ADMIN_PASSWORD='temporary-unit-test-secret';process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.invalid';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='test-public-key';let cookies={},admin=false;const rows=new Map(),objects=new Map();let buckets=[];
objects.set('aude-tat-cards-private/1',new Uint8Array([137,80,78,71]));objects.set('aude-rorschach-cards-private/I',new Uint8Array([137,80,78,71,13,10,26,10]));
const clientId='11111111-1111-4111-8111-111111111111';rows.set(clientId,{id:clientId,created_at:new Date().toISOString(),data:{adminManagedClient:true,admissionStatus:'확정',type:'counseling',name:'검증용 내담자'}});
const json=v=>new Response(JSON.stringify(v),{headers:{'Content-Type':'application/json'}});
async function database(path,init={},publicInsert=false){const u=new URL('https://example.invalid'+path),method=init.method||'GET';
 if(u.pathname==='/storage/v1/bucket'){if(method==='POST')buckets.push(JSON.parse(init.body));return json(buckets);}
 if(u.pathname.startsWith('/storage/v1/object/list/')){const bucket=u.pathname.split('/').pop();return json([...objects.keys()].filter(k=>k.startsWith(bucket+'/')).map(k=>({name:k.slice(bucket.length+1)})));}
 if(u.pathname.startsWith('/storage/v1/object/authenticated/'))return new Response(objects.get(u.pathname.replace('/storage/v1/object/authenticated/','')));
 if(u.pathname.startsWith('/storage/v1/object/')){const key=u.pathname.replace('/storage/v1/object/','');if(method==='POST'){objects.set(key,init.body);return json({ok:true});}}
 const nonce=u.searchParams.get('data->>creationNonce')?.replace('eq.','');if(nonce&&method==='GET')return json([...rows.values()].filter(x=>x.data.creationNonce===nonce));
 const id=u.searchParams.get('id')?.replace('eq.','');
 if(method==='POST'){if(!publicInsert)throw new Error('Supabase admin request failed (403): permission denied for INSERT');const row={id:crypto.randomUUID(),created_at:new Date().toISOString(),...JSON.parse(init.body)};rows.set(row.id,row);return json([row]);}
 if(method==='PATCH'){const row=rows.get(id),version=u.searchParams.get('data->>version');if(version&&(version==='is.null'?row.data.version!==undefined:String(row.data.version)!==version.replace('eq.','')))return json([]);rows.set(id,{...row,...JSON.parse(init.body)});return json([rows.get(id)]);}
 return json(id?(rows.has(id)?[structuredClone(rows.get(id))]:[]):[...rows.values()]);}
const cache={};function load(file){if(cache[file])return cache[file];const exports={},source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const req=name=>{if(name==='next/headers')return {cookies:async()=>({get:key=>cookies[key]?{value:cookies[key]}:undefined})};if(name==='next/server')return {NextResponse:{json(v,o){const r=new Response(JSON.stringify(v),{status:o?.status||200});r.cookies={set(n,v){cookies[n]=v;}};return r;}}};if(name.endsWith('/supabase')||name==='./supabase')return {verifyAdminSession:()=>admin,supabaseAdminRequest:database};if(name.endsWith('/client-eligibility'))return load('app/lib/client-eligibility.ts');if(name.endsWith('/operations'))return {getOperations:async()=>[]};if(name.endsWith('/rorschach-room'))return load('app/lib/rorschach-room.ts');if(name.endsWith('/rorschach-records'))return load('app/lib/rorschach-records.ts');if(name.endsWith('/tat-records'))return load('app/lib/tat-records.ts');if(name.endsWith('/tat'))return load('app/lib/tat.ts');return require(name);};
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

 const assets=load('app/api/admin/rorschach-assets/route.ts');
 assert.equal((await assets.GET()).status,401);admin=true;
 assert.equal((await assets.POST(new Request('https://test.invalid/assets?card=I',{method:'POST',body:'not-an-image'}))).status,400);
 for(const card of ['I','II','III','IV','V','VI','VII','VIII','IX','X'])assert.equal((await assets.POST(new Request('https://test.invalid/assets?card='+card,{method:'POST',body:new Uint8Array([137,80,78,71,13,10,26,10])}))).status,200);
 assert.equal((await(await assets.GET()).json()).length,10);
 assert.equal(buckets.find(b=>b.id==='aude-rorschach-cards-private').public,false);
 admin=false;
 const rooms=load('app/api/admin/rorschach/room/route.ts'),login=load('app/api/rorschach/login/route.ts'),state=load('app/api/rorschach/state/route.ts'),image=load('app/api/rorschach/image/route.ts');
 assert.equal((await rooms.PATCH(request('/room',{id:made.id,action:'create'}))).status,401);
 admin=true;
 let created=await(await rooms.PATCH(request('/room',{id:made.id,action:'create'}))).json();const code=created.code;assert.equal(code.length,20);
 let i=await image.GET(request('/image?card=I'));assert.equal(i.status,200);assert.equal(i.headers.get('Cache-Control'),'private, no-store');assert.equal(new Uint8Array(await i.arrayBuffer())[0],137);
 admin=false;
 assert.equal((await state.GET(request('/state?id='+made.id))).status,401);
 assert.equal((await image.GET(request('/image?card=I&id='+made.id))).status,403);
 assert.equal((await login.POST(request('/login',{id:made.id,code:'WRONG'}))).status,401);
 assert.equal((await login.POST(request('/login',{id:made.id,code}))).status,200);
 let visible=await(await state.GET(request('/state?id='+made.id))).json();assert.equal(visible.card,null);assert.equal(JSON.stringify(visible).includes('저장 후 종합'),false);assert.equal(JSON.stringify(visible).includes('검증용 내담자'),false);
 admin=true;
 let shown=await(await rooms.PATCH(request('/room',{id:made.id,action:'present',card:'I',hidden:false}))).json();
 admin=false;
 assert.equal((await image.GET(request('/image?card=I&id='+made.id))).status,200);
 assert.equal((await image.GET(request('/image?card=II&id='+made.id))).status,403);
 assert.equal((await image.GET(request('/image?card=../I&id='+made.id))).status,404);
 assert.equal((await state.POST(request('/state',{id:made.id,action:'view',card:'I',revision:shown.room.revision,scale:1.3,angle:90}))).status,200);
 // Room telemetry must not invalidate content saves or erase room changes.
 admin=true;
 assert.equal((await a.PATCH(request('/records',{...draft,id:made.id,recordsVersion:1,summary:'telemetry-safe'}))).status,200);
 assert.equal(rows.get(made.id).data.room.view.angle,90);
 assert.equal((await a.PATCH(request('/records',{...draft,id:made.id,recordsVersion:1}))).status,409);
 let staged=await(await rooms.PATCH(request('/room',{id:made.id,action:'stage',stage:'inquiry'}))).json();assert.equal(staged.room.hidden,true);
 shown=await(await rooms.PATCH(request('/room',{id:made.id,action:'present',card:'I',hidden:false}))).json();
 assert.equal((await rooms.PATCH(request('/room',{id:made.id,action:'target',responseId:'missing'}))).status,400);
 let targeted=await(await rooms.PATCH(request('/room',{id:made.id,action:'target',responseId:'test-1'}))).json();
 admin=false;
 const mark={id:made.id,action:'mark',card:'I',revision:targeted.room.revision,responseId:'test-1',points:[{x:.2,y:.8},{x:.3,y:.7}]};
 assert.equal((await state.POST(request('/state',{...mark,revision:shown.room.revision}))).status,400);
 assert.equal((await state.POST(request('/state',{...mark,points:[{x:2,y:0}]}))).status,400);
 assert.equal((await state.POST(request('/state',mark))).status,200);
 visible=await(await state.GET(request('/state?id='+made.id))).json();assert.equal(visible.marks.length,1);assert.equal(visible.markTarget,'test-1');assert.equal('responses' in visible,false);assert.equal('codeHash' in visible,false);
 admin=true;
 assert.equal((await a.PATCH(request('/records',{...draft,id:made.id,recordsVersion:2,summary:'keep locations'}))).status,200);assert.equal(rows.get(made.id).data.room.marks['test-1'].length,1);
 assert.equal((await rooms.PATCH(request('/room',{id:made.id,action:'undoMark',responseId:'test-1'}))).status,200);
 assert.equal(rows.get(made.id).data.room.marks['test-1'].length,0);
 const renewed=await(await rooms.PATCH(request('/room',{id:made.id,action:'renew'}))).json();assert.notEqual(renewed.code,code);
 admin=false;assert.equal((await state.GET(request('/state?id='+made.id))).status,401);assert.equal((await image.GET(request('/image?card=I&id='+made.id))).status,403);
 assert.equal((await login.POST(request('/login',{id:made.id,code:renewed.code}))).status,200);
 admin=true;await rooms.PATCH(request('/room',{id:made.id,action:'end'}));
 admin=false;visible=await(await state.GET(request('/state?id='+made.id))).json();assert.equal(visible.active,false);assert.equal(visible.card,null);
 assert.equal((await image.GET(request('/image?card=I&id='+made.id))).status,403);
 assert.equal((await state.POST(request('/state',mark))).status,400);
 admin=true;assert.equal((await a.PATCH(request('/records',{...draft,id:made.id,recordsVersion:3,summary:'post-session'}))).status,200);
 assert.equal((await login.POST(request('/login',{id:made.id,code:renewed.code}))).status,401);
 const oldRecord=structuredClone(made);oldRecord.id=crypto.randomUUID();delete oldRecord.data.room;delete oldRecord.data.recordsVersion;rows.set(oldRecord.id,oldRecord);
 assert.equal((await a.PATCH(request('/records',{...draft,id:oldRecord.id,recordsVersion:0,summary:'legacy'}))).status,200);
 console.log('PASS: Rorschach rooms, login, card access, privacy, stale marks, rotation, content versioning, location persistence, renewal, end and legacy records');
 console.log('PASS: admin-only record create/read/update, signed-record filtering, conflict preservation, validation and Excel formula escaping');
})().catch(e=>{console.error(e);process.exit(1);});
