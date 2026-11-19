import type { PortalStanding } from '@ssm-usor/contracts';

import { type DataClient, fromDatabaseError } from '../../lib/db';

export async function portalStandings(db: DataClient, clientId: string) {
  const [participants, invitations] = await Promise.all([
    db
      .from('client_participants')
      .select('employee_id')
      .eq('client_id', clientId)
      .not('employee_id', 'is', null)
      .is('revoked_at', null)
      .limit(5000),
    db
      .from('participant_invitations')
      .select('employee_id')
      .eq('client_id', clientId)
      .not('employee_id', 'is', null)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .limit(5000),
  ]);
  if (participants.error) throw fromDatabaseError(participants.error, 'client participants');
  if (invitations.error) throw fromDatabaseError(invitations.error, 'client invitations');
  const standings = new Map<string, PortalStanding>();
  for (const row of invitations.data) standings.set(row.employee_id!, 'invited');
  for (const row of participants.data) standings.set(row.employee_id!, 'participant');
  return standings;
}

/** Per import, how many current employees whose sheets it filed are neither participants nor invited. */
export async function uninvitedOfImports(db: DataClient, clientId: string, importIds: string[]) {
  const counts = new Map<string, number>();
  if (importIds.length === 0) return counts;
  const [employees, standings] = await Promise.all([
    db
      .from('employees')
      .select('id, client_files!client_files_employee_of_client!inner(import_id)')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .is('archived_at', null)
      .in('client_files.import_id', importIds)
      .limit(5000),
    portalStandings(db, clientId),
  ]);
  if (employees.error) throw fromDatabaseError(employees.error, 'uninvited import employees');
  const rows = employees.data as unknown as { id: string; client_files: { import_id: string }[] }[];
  for (const row of rows) {
    if (standings.has(row.id)) continue;
    for (const importId of new Set(row.client_files.map((file) => file.import_id))) {
      counts.set(importId, (counts.get(importId) ?? 0) + 1);
    }
  }
  return counts;
}
