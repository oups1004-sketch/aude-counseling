import { admin,alive,cards,getSession,participant,privateHeaders } from '../../../lib/tat';
import { supabaseAdminRequest } from '../../../lib/supabase';
export const runtime='nodejs';
export async function GET(request:Request){try{const p=new URL(request.url).searchParams;const card=p.get('card')||'';if(!cards.includes(card))return new Response(null,{status:404});if(!await admin()){const row=await getSession(p.get('id')||'');if(!await participant(row)||!alive(row.data)||row.data.hidden||row.data.order[row.data.index]!==card)return new Response(null,{status:403});}
 const response=await supabaseAdminRequest(`/storage/v1/object/authenticated/aude-tat-cards-private/${card}`);return new Response(response.body,{headers:{...privateHeaders,'Content-Type':response.headers.get('Content-Type')||'image/png'}});
 }catch{return new Response(null,{status:404});}}
