import { responsiblePersonRoleLabels } from '@ssm-usor/contracts';
import { ShieldCheck } from 'lucide-react';

import { useListPortalResponsiblePersons } from '@/api/generated/api';
import { PageFailed, PageLoading } from '@/components/page';
import { useApiRequest } from '@/lib/request';

export function ResponsiblePersonsSection({ participantId }: { participantId: string }) {
  const apiRequest = useApiRequest();
  const persons = useListPortalResponsiblePersons(participantId, { request: apiRequest });
  return (
    <section
      aria-labelledby="responsible-persons-title"
      data-testid="responsible-persons"
      className="grid gap-3"
    >
      <h2 id="responsible-persons-title" className="flex items-center gap-2 text-lg font-semibold">
        <ShieldCheck aria-hidden="true" className="size-5 text-muted-foreground" />
        Persoane responsabile
      </h2>
      {persons.isPending ? (
        <PageLoading />
      ) : persons.isError ? (
        <PageFailed onRetry={() => void persons.refetch()} />
      ) : persons.data.items.length === 0 ? (
        <p
          data-testid="responsible-persons-empty"
          className="rounded-xl border border-dashed px-4 py-6 text-center text-muted-foreground"
        >
          Nicio persoană responsabilă desemnată încă.
        </p>
      ) : (
        <ul className="grid gap-3">
          {persons.data.items.map((person) => (
            <li
              key={person.id}
              data-testid="responsible-person"
              className="grid gap-1 rounded-xl border bg-card p-4 shadow-xs"
            >
              <span className="font-semibold break-words">{person.fullName}</span>
              <span className="text-sm break-words text-muted-foreground">
                {[person.jobTitle, person.workplace].filter(Boolean).join(' · ')}
              </span>
              <span data-testid="responsible-person-roles" className="text-sm break-words">
                {person.roles.map((role) => responsiblePersonRoleLabels[role]).join(', ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
