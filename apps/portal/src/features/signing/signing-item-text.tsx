import { Trans, useLingui } from '@lingui/react/macro';

import { useFormatDate } from '@/lib/format';
import { trainingDomainMessages, trainingPhaseMessages } from '@/lib/labels';

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
  // The employees whose agreement is signed along with this item, so its warning would repeat.
  agreementsSigned?: ReadonlySet<string>;
  warnings?: boolean;
}) {
  const { t, i18n } = useLingui();
  const formatDate = useFormatDate();

  if (item.kind === 'agreement') {
    return (
      <span className="grid min-w-0 gap-0.5">
        <span className="font-semibold">
          <Trans>Acordul de semnare electronică</Trans>
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

  const { record, slot } = item.request;
  const phase = i18n._(trainingPhaseMessages[record.phase]);
  const domain = i18n._(trainingDomainMessages[record.domain]);
  const day = formatDate(record.heldOn, 'short');
  const signAs = i18n._(signAsMessages[slot]);
  const other = record.employee.id !== ownEmployeeId ? employeeNameOf(record.employee) : null;
  const warn =
    warnings && unsettledAgreement(item.request) && !agreementsSigned.has(record.employee.id);
  return (
    <span className="grid min-w-0 gap-0.5">
      <span className="font-semibold">
        {other ? t`${other}: ${phase} ${domain}` : t`${phase} ${domain}`}
      </span>
      <span className="text-sm leading-snug text-muted-foreground">
        <time dateTime={record.heldOn} className="tabular-nums">
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
