import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';

import { openedHere } from '@/app/opener';
import { CellNote } from '@/components/data-table/cell-note';
import { documentRowLink } from '@/features/documents/document-sets';
import { formatRoDate } from '@/lib/dates';

import type { BehindClient, BehindType } from './regeneration-copy';

function revisionState(client: BehindClient) {
  if (client.editedDraft) {
    return {
      value: 'Ciornă editată de mână',
      note: 'rămâne neatinsă; o regenerezi de pe pagina clientului',
      warn: true,
    };
  }
  if (client.status === 'issued') {
    return {
      value: client.issueDate ? `Emis pe ${formatRoDate(client.issueDate)}` : 'Emis',
      note: 'primește o ciornă nouă, de emis',
      warn: false,
    };
  }
  return { value: 'Ciornă', note: 'se înlocuiește', warn: false };
}

export function BehindClients({ type }: { type: BehindType }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table
        className="w-full min-w-[32rem] text-sm"
        aria-label={`Clienții cu ${type.title} în urmă`}
      >
        <thead>
          <tr className="border-b text-left text-[13px] text-table-head-foreground">
            <th className="px-4 py-2.5 font-semibold">Client</th>
            <th className="px-4 py-2.5 font-semibold">Generat din</th>
            <th className="px-4 py-2.5 font-semibold">Documentul la client</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {type.clients.map((client) => {
            const state = revisionState(client);
            return (
              <tr key={client.documentId} data-testid="behind-client">
                <td className="px-4 py-3 align-top">
                  <Link
                    {...documentRowLink(client.clientId, type.typeKey)}
                    state={openedHere}
                    data-testid="behind-client-link"
                    className="font-medium underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
                  >
                    {client.clientName}
                  </Link>
                </td>
                <td className="px-4 py-3 align-top whitespace-nowrap">
                  Versiunea {client.version}
                </td>
                <td className="px-4 py-3 align-top">
                  <span
                    data-testid="behind-client-state"
                    className={cn(state.warn && 'font-medium text-warning-foreground')}
                  >
                    {state.value}
                  </span>
                  <CellNote>{state.note}</CellNote>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
