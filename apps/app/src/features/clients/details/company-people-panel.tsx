import {
  caenClassName,
  type CountyCode,
  countyNames,
  formatEmployeeName,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { replayMask } from '@/app/observability/replay-masking';
import { openedHere } from '@/app/opener';
import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';
import { useInPlaceEdit } from '@/components/use-in-place-edit';
import {
  type DocumentDetails,
  useDocumentDetails,
} from '@/features/clients/document-details/use-document-details-form';
import {
  type CompanyFocus,
  type LegalRepresentativeFocus,
  useFocusRequest,
} from '@/features/missing-data/focus';
import { formatRoDateOf } from '@/lib/dates';

import { addressField, type Client } from '../client-form-schema';
import { CompanyForm } from '../company-card';
import { ContactForm } from '../contact-card';
import { LegalRepresentativeForm } from '../legal-representative-form';
import { SheetAction } from './sheet-action';
import { SummaryEmpty, SummaryList, SummaryNote, SummaryRow } from './summary-list';

// Bucharest is a municipality, not a county, so it takes no "jud.".
function registeredOffice(client: Client) {
  const county = client.countyCode ? countyNames[client.countyCode as CountyCode] : null;
  return [
    client.addressLine,
    client.locality,
    county && (client.countyCode === 'B' ? county : `jud. ${county}`),
  ]
    .filter(Boolean)
    .join(', ');
}

const joined = (parts: ReactNode[]) =>
  parts.flatMap((part, index) => (index === 0 ? [part] : [' · ', part]));

export function CompanyPeoplePanel({
  client,
  userId,
  readOnly,
  companyFocus,
  representativeFocus,
}: {
  client: Client;
  userId: string;
  readOnly: boolean;
  companyFocus?: CompanyFocus;
  representativeFocus?: LegalRepresentativeFocus;
}) {
  const {
    editing: companyEditing,
    editRef: companyRef,
    open: openCompany,
    close: closeCompany,
  } = useInPlaceEdit();
  const {
    editing: representativeEditing,
    editRef: representativeRef,
    open: openRepresentative,
    close: closeRepresentative,
  } = useInPlaceEdit();
  const {
    editing: contactEditing,
    editRef: contactRef,
    open: openContact,
    close: closeContact,
  } = useInPlaceEdit();
  const details = useDocumentDetails(client.id, userId);
  const saved = details.data?.documentDetails;

  useFocusRequest(companyFocus !== undefined, {
    anchor: () => companyRef.current,
    open: readOnly ? undefined : openCompany,
    field: readOnly
      ? undefined
      : companyFocus === 'company-trade-register'
        ? 'tradeRegisterNumber'
        : addressField(client),
  });
  useFocusRequest(representativeFocus !== undefined, {
    ready: !details.isPending,
    anchor: () => representativeRef.current,
    open: readOnly ? undefined : openRepresentative,
    field:
      readOnly || !saved
        ? undefined
        : representativeFocus === 'legal-representative-role'
          ? 'details-representative-role'
          : 'details-representative-name',
  });

  const editingCompany = companyEditing && !readOnly;
  const representativeEmpty = !saved?.legalRepresentativeName && !saved?.legalRepresentativeRole;
  const contactEmpty = !client.contactName && !client.contactEmail && !client.contactPhone;
  const caen = client.caenCode ? caenClassName(client.caenCode) : null;
  const address = registeredOffice(client);

  return (
    <SectionCard
      data-testid="company-people-panel"
      className="gap-4"
      title="Date firmă și persoane"
      help="detalii.date-firma"
      action={
        !readOnly &&
        !companyEditing && (
          <SheetAction
            ref={companyRef}
            subject="datele firmei"
            data-testid="company-edit"
            onClick={openCompany}
          >
            <span>
              Modifică<span className="max-sm:hidden"> datele firmei</span>
            </span>
          </SheetAction>
        )
      }
    >
      {editingCompany && (
        <div className="pb-5">
          <CompanyForm client={client} onClose={closeCompany} />
        </div>
      )}
      <SummaryList className={cn(editingCompany && 'border-t *:first:border-t-0 *:first:pt-3')}>
        {!editingCompany && (
          <>
            <SummaryRow label="Nr. Reg. Com.">
              {client.tradeRegisterNumber && (
                <span data-testid="company-trade-register">{client.tradeRegisterNumber}</span>
              )}
            </SummaryRow>
            <SummaryRow label="Cod CAEN">
              {client.caenCode && (
                <span data-testid="company-caen">
                  <span className="tabular-nums">{client.caenCode}</span>
                  {caen && <SummaryNote>{caen}</SummaryNote>}
                </span>
              )}
            </SummaryRow>
            <SummaryRow label="Sediul social">
              {address ? <span data-testid="company-address">{address}</span> : null}
            </SummaryRow>
            <SummaryRow label="Plătitor de TVA">
              <span data-testid="company-vat-payer">{client.vatPayer ? 'Da' : 'Nu'}</span>
            </SummaryRow>
            <SummaryRow label="Client din">
              <span data-testid="company-client-since" className="tabular-nums">
                {formatRoDateOf(client.promotedAt ?? client.createdAt)}
              </span>
            </SummaryRow>
          </>
        )}
        <SummaryRow
          label="Reprezentant legal"
          help="detalii.reprezentant-legal"
          testId="legal-representative-row"
          action={
            saved &&
            !readOnly &&
            !representativeEditing && (
              <SheetAction
                ref={representativeRef}
                adding={representativeEmpty}
                subject="reprezentantul legal"
                data-testid="legal-representative-edit"
                onClick={openRepresentative}
              />
            )
          }
          form={
            representativeEditing &&
            !readOnly &&
            saved && (
              <LegalRepresentativeForm
                saved={saved}
                client={client}
                userId={userId}
                onClose={closeRepresentative}
              />
            )
          }
        >
          {details.isPending ? (
            <Skeleton className="h-10 w-48" />
          ) : details.isError ? (
            <Notice
              variant="destructive"
              data-testid="legal-representative-unavailable"
              action={
                <Button
                  variant="outline"
                  disabled={details.isFetching}
                  onClick={() => void details.refetch()}
                >
                  Încearcă din nou
                </Button>
              }
            >
              Nu am putut încărca reprezentantul legal.
            </Notice>
          ) : representativeEmpty ? (
            <SummaryEmpty data-testid="legal-representative-empty" />
          ) : (
            <>
              {saved.legalRepresentativeName ? (
                <span data-testid="legal-representative-name" {...replayMask}>
                  {saved.legalRepresentativeName}
                </span>
              ) : (
                <SummaryEmpty />
              )}
              <RepresentativeNote clientId={client.id} saved={saved} />
            </>
          )}
        </SummaryRow>
        <SummaryRow
          label="Persoană de contact"
          help="detalii.persoana-de-contact"
          testId="contact-row"
          action={
            !readOnly &&
            !contactEditing && (
              <SheetAction
                ref={contactRef}
                adding={contactEmpty}
                subject="persoana de contact"
                data-testid="contact-edit"
                onClick={openContact}
              />
            )
          }
          form={
            contactEditing && !readOnly && <ContactForm client={client} onClose={closeContact} />
          }
        >
          {contactEmpty ? (
            <SummaryEmpty data-testid="contact-empty" />
          ) : (
            <>
              {client.contactName && (
                <span data-testid="contact-name" {...replayMask}>
                  {client.contactName}
                </span>
              )}
              {(client.contactEmail || client.contactPhone) && (
                <ContactLine client={client} quiet={Boolean(client.contactName)} />
              )}
            </>
          )}
        </SummaryRow>
      </SummaryList>
    </SectionCard>
  );
}

function ContactLine({ client, quiet }: { client: Client; quiet: boolean }) {
  const line = joined([
    ...(client.contactEmail
      ? [
          <a
            key="email"
            data-testid="contact-email"
            className="underline-offset-4 hover:underline"
            href={`mailto:${client.contactEmail}`}
            {...replayMask}
          >
            {client.contactEmail}
          </a>,
        ]
      : []),
    ...(client.contactPhone
      ? [
          <a
            key="phone"
            data-testid="contact-phone"
            className="tabular-nums underline-offset-4 hover:underline"
            href={`tel:${client.contactPhone.replace(/\s+/g, '')}`}
            {...replayMask}
          >
            {client.contactPhone}
          </a>,
        ]
      : []),
  ]);
  return quiet ? <SummaryNote>{line}</SummaryNote> : <span className="block">{line}</span>;
}

function RepresentativeNote({ clientId, saved }: { clientId: string; saved: DocumentDetails }) {
  const employee = saved.legalRepresentativeEmployee;
  const parts = [
    ...(saved.legalRepresentativeRole
      ? [
          <span key="role" data-testid="legal-representative-role">
            {saved.legalRepresentativeRole}
          </span>,
        ]
      : []),
    ...(employee
      ? [
          <span key="employee">
            și lucrător al firmei:{' '}
            <Link
              to="/clienti/$clientId/angajati/$employeeId"
              params={{ clientId, employeeId: employee.id }}
              state={openedHere}
              data-testid="legal-representative-employee"
              className="underline-offset-4 hover:underline"
              {...replayMask}
            >
              {formatEmployeeName(employee)}
            </Link>
          </span>,
        ]
      : []),
  ];
  return parts.length > 0 ? <SummaryNote>{joined(parts)}</SummaryNote> : null;
}
