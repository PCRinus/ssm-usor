import { signatureRequestLabel } from '@ssm-usor/contracts';

import type { SignatureListResponseItemsItem } from '@/api/generated/api';

import type { SigningRequest } from './signature-format';

export type SignatureRow = SignatureListResponseItemsItem;
export type SignatureWorker = SignatureRow['workers'][number];

export interface ChosenRequest extends SigningRequest {
  rowId: string;
}

export type Chosen = ReadonlyMap<string, ChosenRequest>;

export const noneChosen: Chosen = new Map();

export function requestsOf(row: SignatureRow, worker: SignatureWorker): ChosenRequest[] {
  const training = row.kind === 'training' && row.phase;
  return worker.requests.map((request) => ({
    id: request.id,
    rowId: row.id,
    kind: training ? 'training_record' : 'test_sheet',
    label: training
      ? signatureRequestLabel({
          kind: 'training_record',
          domain: row.domain,
          phase: training,
          heldOn: row.day,
        })
      : signatureRequestLabel({
          kind: 'test_sheet',
          domain: row.domain,
          test: row.test!,
          takenOn: row.day,
        }),
    slot: request.slot,
    client: row.client,
    employee: worker.employee,
    agreement: worker.agreement,
    record: training ? { domain: row.domain, phase: training, heldOn: row.day } : null,
    testSheet: training ? null : { domain: row.domain, takenOn: row.day },
  }));
}

export const rowRequests = (row: SignatureRow) =>
  row.workers.flatMap((worker) => requestsOf(row, worker));

export function choose(chosen: Chosen, requests: readonly ChosenRequest[], on: boolean): Chosen {
  const next = new Map(chosen);
  for (const request of requests) {
    if (on) next.set(request.id, request);
    else next.delete(request.id);
  }
  return next;
}

export function chosenState(chosen: Chosen, ids: readonly { id: string }[]) {
  const picked = ids.filter((request) => chosen.has(request.id)).length;
  return picked === 0 ? false : picked === ids.length ? true : ('indeterminate' as const);
}

// Only the page's rows can say a request was signed or voided since it was chosen; one chosen on
// another page stays chosen until the signing session refuses it.
export function stillListed(chosen: Chosen, rows: readonly SignatureRow[] | undefined): Chosen {
  if (!rows || chosen.size === 0) return chosen;
  const listed = new Map(
    rows.map((row) => [
      row.id,
      new Set(row.workers.flatMap((worker) => worker.requests.map((request) => request.id))),
    ])
  );
  const kept = [...chosen.values()].filter(
    (request) => listed.get(request.rowId)?.has(request.id) ?? true
  );
  return kept.length === chosen.size
    ? chosen
    : new Map(kept.map((request) => [request.id, request]));
}

const collator = new Intl.Collator('ro');

export const forSigning = (chosen: Chosen) =>
  [...chosen.values()].sort((a, b) => collator.compare(a.client.name, b.client.name));
