// In memory, for the next visit of the client page only: a reload drops the notice, and the
// client is saved either way.
export type ImportNotice = { existing: boolean; files: number; added: string[]; changed: string[] };

const notices = new Map<string, ImportNotice>();

export function leaveImportNotice(clientId: string, notice: ImportNotice) {
  notices.set(clientId, notice);
}

export function takeImportNotice(clientId: string) {
  const notice = notices.get(clientId) ?? null;
  notices.delete(clientId);
  return notice;
}
