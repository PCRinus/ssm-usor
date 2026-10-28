// In memory, for the next visit of the client page only: a reload drops the notice, and the
// client is saved either way.
export type ImportNotice = { existing: boolean; files: number; added: string[]; changed: string[] };

const notices = new Map<string, ImportNotice>();

export function leaveImportNotice(clientId: string, notice: ImportNotice) {
  notices.set(clientId, notice);
}

export function readImportNotice(clientId: string) {
  return notices.get(clientId) ?? null;
}

export function forgetImportNotice(clientId: string) {
  notices.delete(clientId);
}
