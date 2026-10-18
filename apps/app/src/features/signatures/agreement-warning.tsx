import type { SigningAgreementSummary } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { TriangleAlert } from 'lucide-react';

import { agreementAwaitsEmployer, agreementSigned } from './signature-format';

// ADR 023: an unsigned agreement warns and never blocks a signature.
export function AgreementWarning({ agreement }: { agreement: SigningAgreementSummary }) {
  if (agreementSigned(agreement?.state)) return null;
  const awaitsEmployer = agreementAwaitsEmployer(agreement);
  return (
    <Badge
      variant="outline"
      data-testid="agreement-warning"
      title={
        awaitsEmployer
          ? 'Angajatul a semnat actul adițional; mai lipsește semnătura administratorului clientului.'
          : 'Angajatul nu a semnat actul adițional privind semnarea electronică.'
      }
      className="border-warning-border bg-warning text-warning-foreground"
    >
      <TriangleAlert aria-hidden="true" />
      {awaitsEmployer ? 'Act adițional așteaptă angajatorul' : 'Act adițional nesemnat'}
    </Badge>
  );
}
