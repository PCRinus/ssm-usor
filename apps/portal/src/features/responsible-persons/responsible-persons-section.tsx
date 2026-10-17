import { Trans, useLingui } from '@lingui/react/macro';

import { useListPortalResponsiblePersons } from '@/api/generated/api';
import { cardClass, PageFailed, PageLoading } from '@/components/page';
import { useFormatList } from '@/lib/format';
import { responsiblePersonRoleMessages } from '@/lib/labels';
import { useApiRequest } from '@/lib/request';

export function ResponsiblePersonsSection({ participantId }: { participantId: string }) {
  const { i18n } = useLingui();
  const formatList = useFormatList();
  const apiRequest = useApiRequest();
  const persons = useListPortalResponsiblePersons(participantId, { request: apiRequest });
  return (
    <section
      aria-labelledby="responsible-persons-title"
      data-testid="responsible-persons"
      className="grid gap-3"
    >
      <h2 id="responsible-persons-title" className="text-base font-semibold">
        <Trans>Persoane responsabile</Trans>
      </h2>
      {persons.isPending ? (
        <PageLoading />
      ) : persons.isError ? (
        <PageFailed onRetry={() => void persons.refetch()} />
      ) : persons.data.items.length === 0 ? (
        <p
          data-testid="responsible-persons-empty"
          className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground"
        >
          <Trans>Nicio persoană responsabilă desemnată încă.</Trans>
        </p>
      ) : (
        <ul className={`${cardClass} divide-y overflow-hidden`}>
          {persons.data.items.map((person) => (
            <li
              key={person.id}
              data-testid="responsible-person"
              className="grid gap-1 px-4 py-3.5 sm:px-5"
            >
              <span className="font-semibold break-words">{person.fullName}</span>
              <span className="text-sm break-words text-muted-foreground">
                {formatList(
                  [person.jobTitle, person.workplace].filter((part): part is string =>
                    Boolean(part)
                  )
                )}
              </span>
              <span data-testid="responsible-person-roles" className="text-sm break-words">
                {formatList(
                  person.roles.map((role) => i18n._(responsiblePersonRoleMessages[role]))
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
