import { Button } from '@ssm-usor/ui/components/button';
import { Notice } from '@ssm-usor/ui/components/notice';
import { Link } from '@tanstack/react-router';

import { useMe } from '@/features/account/use-me';
import { formatRoDate } from '@/lib/dates';

import { subscriptionPath } from './subscription-copy';

const afterBlock = {
  employees: null,
  employeeImport:
    'Un import poate completa lucrătorii pe care îi ai deja, dar nu poate adăuga lucrători noi.',
  clientImport:
    'Poți porni importul, dar un client cu lucrători se confirmă abia după ce treci pe o treaptă mai mare sau scade numărul de lucrători activi.',
} as const;

export function EmployeesOverStepNotice({
  context = 'employees',
  className,
}: {
  context?: keyof typeof afterBlock;
  className?: string;
}) {
  const me = useMe().data;
  const over = me?.employeesOverStep;
  if (!over) return null;
  const owner = me.membership?.role === 'owner';
  const action = (
    <Button variant="outline" className="font-semibold" asChild>
      <Link to={subscriptionPath} data-testid="employees-over-step-link">
        Vezi abonamentul
      </Link>
    </Button>
  );
  const whoChanges = owner ? '' : ' Treapta o schimbă adminul organizației.';

  if (over.blocked) {
    return (
      <Notice
        variant="warning"
        data-testid="employees-over-step"
        data-blocked="true"
        className={className}
        title="Nu mai poți adăuga lucrători noi."
        action={action}
      >
        De mai bine de o lună ai mai mulți lucrători activi decât treapta abonamentului. Ca să
        adaugi lucrători, treci pe o treaptă mai mare sau arhivează clienții cu care nu mai lucrezi
        ori marchează plecarea lucrătorilor care nu mai lucrează la clienți.
        {whoChanges} Restul merge ca până acum: editezi, arhivezi, emiți documente, instruiești și
        semnezi.
        {afterBlock[context] && ` ${afterBlock[context]}`}
      </Notice>
    );
  }
  return (
    <Notice
      variant="warning"
      data-testid="employees-over-step"
      data-blocked="false"
      className={className}
      title={`Poți adăuga lucrători noi până pe ${formatRoDate(over.lastDay)} inclusiv.`}
      action={action}
    >
      Ai mai mulți lucrători activi decât treapta abonamentului. Dacă după această dată ai tot mai
      mulți, nu mai poți adăuga lucrători noi până nu treci pe o treaptă mai mare sau arhivezi
      clienții cu care nu mai lucrezi.{whoChanges} Ce ai lucrat nu se blochează.
    </Notice>
  );
}
