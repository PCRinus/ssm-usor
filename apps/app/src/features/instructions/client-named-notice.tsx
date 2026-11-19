import { Notice } from '@ssm-usor/ui/components/notice';

import { type ClientName, endSentence } from './instruction-draft';

export function ClientNamedNotice({
  named,
  testId,
  className,
}: {
  named: readonly ClientName[];
  testId: string;
  className?: string;
}) {
  if (named.length === 0) return null;
  return (
    <Notice variant="warning" className={className} data-testid={testId}>
      <ul className="grid gap-1">
        {named.map((client) => (
          <li key={client.id}>
            Textul numește clientul {endSentence(client.legalName)} Instrucțiunea se aplică și altor
            clienți.
          </li>
        ))}
      </ul>
    </Notice>
  );
}
