import { supabaseAdminRequest } from '../../../lib/supabase';
import { admin,privateHeaders } from '../../../lib/tat';
import { getRecord,roomAlive,roomParticipant,validCard } from '../../../lib/rorschach-room';
export const runtime='nodejs';
export async function GET(request:Request){try{
 const p=new URL(request.url).searchParams,card=p.get('card');if(!validCard(card))return new Response(null,{status:404,headers:privateHeaders});
 if(!await admin()){const row=await getRecord(p.get('id')||'');const room=row.data.room;if(!await roomParticipant(row)||!roomAlive(room)||room.hidden||room.card!==card)return new Response(null,{status:403,headers:privateHeaders});}
 const stored=await supabaseAdminRequest(`/storage/v1/object/authenticated/aude-rorschach-cards-private/${card}`);
 return new Response(stored.body,{headers:{...privateHeaders,'Content-Type':stored.headers.get('Content-Type')||'image/png','Content-Disposition':'inline'}});
 }catch{return new Response(null,{status:404,headers:privateHeaders});}}
