export const operationTypes=['aude-appointment','aude-charge','aude-expense'] as const;
export type OperationType=typeof operationTypes[number];
export const appointmentKinds=['개인상담','검사 실시','해석상담'] as const;
export const appointmentStatuses=['예약','완료','취소','불참'] as const;
export const paymentMethods=['계좌이체','카드','현금','기타'] as const;
export const evidenceStatuses=['확인 필요','처리 완료','해당 없음'] as const;
export const expenseCategories=['검사지','줌·소프트웨어','도메인·호스팅','장비','홍보','임차·시설','기타'] as const;
export type Payment={id:string;date:string;amount:number;direction:'receipt'|'refund';method:string;evidence:string;memo:string;voided?:boolean};
export type Attachment={id:string;name:string;mime:string;size:number};
export type Operation={type:OperationType;creationNonce:string;creationSignature:string;version:number;clientId?:string;clientName?:string;title:string;memo:string;startAt?:string;duration?:number;kind?:string;status?:string;sessionNo?:number;chargeId?:string;date?:string;amount?:number;payments?:Payment[];category?:string;attachments?:Attachment[];archived?:boolean;updatedAt?:string};
export type OperationRow={id:string;created_at:string;data:Operation};
export type Operations={appointments:OperationRow[];charges:OperationRow[];expenses:OperationRow[]};
export function seoulDate(value:Date|string=new Date()){return new Date(value).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'});}
export function seoulLocal(value:string){return new Date(Date.parse(value)+9*3600000).toISOString().slice(0,16);}
export function won(n:number){return n.toLocaleString('ko-KR')+'원';}
export function validDate(value:unknown):value is string {if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value&&value>='2000-01-01'&&value<='2100-12-31';}
export function amount(value:unknown,positive=false){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<(positive?1:0)||value>1000000000)throw new Error('금액은 0~10억 원 범위의 정수로 입력해 주세요.');return value;}
export function text(value:unknown,label:string,max:number,required=false){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw new Error(label+'을 확인해 주세요.');return value.trim();}
export function chargeTotals(d:Operation){const payments=(d.payments||[]).filter(p=>!p.voided);const received=payments.filter(p=>p.direction==='receipt').reduce((n,p)=>n+p.amount,0),refunded=payments.filter(p=>p.direction==='refund').reduce((n,p)=>n+p.amount,0);return {received,refunded,net:received-refunded,due:d.archived?0:Math.max(0,(d.amount||0)-received)};}
export function chargeStatus(d:Operation){const t=chargeTotals(d);return d.archived?'취소':t.refunded?'환불':t.received>=(d.amount||0)?'수납 완료':t.received?'일부 수납':'미수납';}
export function monthTotals(data:Operations,month:string){let received=0,refunded=0;for(const row of data.charges)for(const p of row.data.payments||[])if(!p.voided&&p.date.startsWith(month)){if(p.direction==='receipt')received+=p.amount;else refunded+=p.amount;}const spent=data.expenses.filter(r=>!r.data.archived&&r.data.date?.startsWith(month)).reduce((n,r)=>n+(r.data.amount||0),0);const unpaid=data.charges.filter(r=>chargeTotals(r.data).due>0);return {received,refunded,net:received-refunded,spent,balance:received-refunded-spent,due:unpaid.reduce((n,r)=>n+chargeTotals(r.data).due,0),unpaidCount:unpaid.length};}
export function overlaps(a:Operation,b:Operation){return a.status==='예약'&&b.status==='예약'&&Date.parse(a.startAt!)<Date.parse(b.startAt!)+(b.duration||60)*60000&&Date.parse(b.startAt!)<Date.parse(a.startAt!)+(a.duration||60)*60000;}
