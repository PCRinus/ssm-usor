import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent, CardHeader } from '@ssm-usor/ui/components/card';
import { Link } from '@tanstack/react-router';
import { Pencil } from 'lucide-react';

import type { Client } from './client-form-schema';

// `readOnly` is an archived company, whose data is not edited.
export function ContactCard({ client, readOnly }: { client: Client; readOnly: boolean }) {
  const empty = !client.contactName && !client.contactEmail && !client.contactPhone;
  return (
    <Card data-testid="contact-card">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <h2 className="text-lg font-semibold">Persoană de contact</h2>
        {!readOnly && (
          <Button asChild variant="outline" size="sm">
            {client.stage === 'lead' ? (
              <Link to="/leads/$leadId/edit" params={{ leadId: client.id }}>
                <Pencil aria-hidden="true" />
                Modifică
              </Link>
            ) : (
              <Link to="/clients/$clientId/edit" params={{ clientId: client.id }}>
                <Pencil aria-hidden="true" />
                Modifică
              </Link>
            )}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {empty ? (
          <p data-testid="contact-empty" className="text-sm text-muted-foreground">
            Nicio persoană de contact încă.
          </p>
        ) : (
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Nume</dt>
              <dd data-testid="contact-name" className="font-medium">
                {client.contactName ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd data-testid="contact-email" className="truncate">
                {client.contactEmail ? (
                  <a
                    className="underline-offset-4 hover:underline"
                    href={`mailto:${client.contactEmail}`}
                  >
                    {client.contactEmail}
                  </a>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Telefon</dt>
              <dd data-testid="contact-phone" className="tabular-nums">
                {client.contactPhone ? (
                  <a
                    className="underline-offset-4 hover:underline"
                    href={`tel:${client.contactPhone.replace(/\s+/g, '')}`}
                  >
                    {client.contactPhone}
                  </a>
                ) : (
                  '—'
                )}
              </dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
