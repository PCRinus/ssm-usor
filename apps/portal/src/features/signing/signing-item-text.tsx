import { Trans, useLingui } from '@lingui/react/macro';

import { useFormatDate } from '@/lib/format';

import { useRequestDocument } from './request-document';
import { employeeNameOf, type SigningItem, unsettledAgreement } from './signing-items';
import { signAsMessages } from './signing-messages';

const noEmployees: ReadonlySet<string> = new Set();

export function SigningItemText({
  item,
  ownEmployeeId,
  agreementsSigned = noEmployees,
  warnings = true,
}: {
  item: SigningItem;
  ownEmployeeId: string | null;
  // The employees whose agreement no longer needs the warning: signed along with this item, or
  // the participant's own once they signed it.
  agreementsSigned?: ReadonlySet<string>;
  warnings?: boolean;
}) {
  const { t, i18n } = useLingui();
  const formatDate = useFormatDate();
  const documentOf = useRequestDocument();

  if (item.kind === 'agreement') {
    return (
      <span className="grid min-w-0 gap-0.5">
        <span className="font-semibold">
          <Trans>Actul adițional privind semnarea electronică</Trans>
        </span>
        <span className="text-sm leading-snug text-muted-foreground">
          {item.party === 'employee'
            ? t`Actul adițional prin care accepți să semnezi fișele de instruire în portal.`
            : item.employeeSignedAt
              ? t`${item.employeeName}, semnat de angajat pe ${formatDate(item.employeeSignedAt.slice(0, 10), 'short')}; semnezi ca angajator.`
              : t`${item.employeeName}; semnezi ca angajator.`}
        </span>
      </span>
    );
  }

  const { employee, slot } = item.request;
  const document = documentOf(item.request);
  const title = document.title;
  const day = formatDate(document.day, 'short');
  const signAs = i18n._(signAsMessages[slot]);
  const other = employee.id !== ownEmployeeId ? employeeNameOf(employee) : null;
  const warn = warnings && unsettledAgreement(item.request) && !agreementsSigned.has(employee.id);
  return (
    <span className="grid min-w-0 gap-0.5">
      <span className="font-semibold">{other ? t`${other}: ${title}` : title}</span>
      <span className="text-sm leading-snug text-muted-foreground">
        <time dateTime={document.day} className="tabular-nums">
          {day}
        </time>
        {' · '}
        {signAs}
      </span>
      {warn && (
        <span
          data-testid="signing-item-agreement-warning"
          className="w-fit rounded-sm bg-warning px-1.5 py-0.5 text-xs font-medium text-warning-foreground"
        >
          <Trans>act adițional nesemnat</Trans>
        </span>
      )}
    </span>
  );
}
