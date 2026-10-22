import { createHash } from 'node:crypto';
import { supabaseAdminRequest } from './supabase';
import { getOperation, newOperation, trustedOperation } from './operations';
import { Operation, OperationRow, chargeTotals, seoulDate } from './operations-model';

// Stable across retries without collapsing UUIDs that differ only in their last digit.
function chargeIdFor(id: string) {
  const hash = createHash('sha256').update('aude-appointment-charge:' + id).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export async function saveAppointment(fields: Partial<Operation>, requestId: string, old?: OperationRow) {
  const charge = old?.data.chargeId ? await getOperation(old.data.chargeId) : undefined;
  if (charge && (charge.data.type !== 'aude-charge' || charge.data.clientId !== fields.clientId)) {
    throw new Error('연결된 수납 항목을 확인해 주세요.');
  }
  const totals = charge ? chargeTotals(charge.data) : { received: 0, refunded: 0, net: 0 };
  if ((fields.amount || 0) < totals.received) {
    throw new Error('일정 비용을 이미 수납한 금액보다 낮출 수 없습니다. 환불은 수납 화면에 기록해 주세요.');
  }
  if (fields.status === '취소' && totals.net > 0) {
    throw new Error('이미 수납된 일정입니다. 먼저 수납 화면에서 환불을 기록한 뒤 일정을 취소해 주세요.');
  }
  if (old?.data.status === '취소' && fields.status !== '취소' && totals.refunded > 0) {
    throw new Error('환불한 일정은 복원할 수 없습니다. 재예약은 새 일정으로 등록해 주세요.');
  }
  const id = old?.id || requestId;
  const chargeId = charge?.id || chargeIdFor(id);
  const manuallyArchived = charge?.data.archived === true && charge.data.archiveSource === 'manual';
  const chargeFields: Partial<Operation> = {
    clientId: fields.clientId, clientName: fields.clientName,
    title: fields.title || '상담 일정', memo: fields.memo || '',
    date: seoulDate(fields.startAt!), amount: fields.amount || 0,
    sessionNo: fields.sessionNo,
    archived: fields.status === '취소' || manuallyArchived,
    archiveSource: manuallyArchived ? 'manual' : fields.status === '취소' ? 'appointment' : undefined,
  };
  const updatedAt = new Date().toISOString();
  const appointmentData = old
    ? { ...old.data, ...fields, chargeId, version: old.data.version + 1, updatedAt }
    : newOperation('aude-appointment', { ...fields, chargeId }, id);
  const chargeData = charge
    ? { ...charge.data, ...chargeFields, version: charge.data.version + 1, updatedAt }
    : newOperation('aude-charge', chargeFields, chargeId);

  // A single PostgreSQL transaction checks both versions and commits both rows.
  // Deliberately no sequential-write fallback when the migration is unavailable.
  const response = await supabaseAdminRequest('/rest/v1/rpc/save_aude_appointment', {
    method: 'POST',
    body: JSON.stringify({
      appointment_id: id, appointment_data: appointmentData,
      appointment_version: old?.data.version ?? null,
      charge_id: chargeId, charge_data: chargeData,
      charge_version: charge?.data.version ?? null,
    }),
  }).catch(() => {
    throw new Error('일정과 수납을 함께 저장하지 못했습니다. 최신 기록을 확인한 뒤 다시 시도해 주세요. 문제가 계속되면 DB 저장 설정을 확인해 주세요.');
  });
  const saved = await response.json() as { appointment: OperationRow; charge: OperationRow };
  if (!trustedOperation(saved.appointment) || !trustedOperation(saved.charge)) {
    throw new Error('저장 결과를 확인하지 못했습니다. 같은 창에서 다시 시도해 주세요.');
  }
  return { ...saved.appointment, linkedCharge: saved.charge };
}
