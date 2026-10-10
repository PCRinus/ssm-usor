import { extinguisherCode, fireInstallationKindLabels } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ssm-usor/ui/components/table';
import { cn } from '@ssm-usor/ui/lib/utils';
import { MoreHorizontal, Plus } from 'lucide-react';
import type { ReactNode } from 'react';

import { rowClickProps } from '@/components/data-table/row-click';
import { SectionCard } from '@/components/section-card';
import { type Workplace, workplaceAddress } from '@/features/clients/workplace-schema';
import { dateToIso, formatRoDate } from '@/lib/dates';

import { ExtinguisherCode } from './extinguisher-code';
import {
  equipmentAddId,
  extinguisherContents,
  extinguisherHint,
  type FireEquipment,
  type FireInstallation,
  unitTitle,
} from './fire-means-schema';

const rowClass =
  'max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-x-2 max-sm:gap-y-1 max-sm:py-3';
// The two tables of a card share their date and firm columns, so they read as one register.
const columns = {
  what: 'w-[32%]',
  which: 'w-[30%]',
  whatAndWhich: 'w-[62%]',
  when: 'w-[19%]',
};
const stackedCell = 'max-sm:col-start-1 max-sm:p-0 whitespace-normal';

export function WorkplaceMeansCard({
  workplace,
  equipment,
  installations,
  readOnly,
  onAddEquipment,
  onEditEquipment,
  onDeleteEquipment,
  onAddInstallation,
  onEditInstallation,
  onDeleteInstallation,
}: {
  workplace: Workplace;
  equipment: readonly FireEquipment[];
  installations: readonly FireInstallation[];
  readOnly: boolean;
  onAddEquipment: () => void;
  onEditEquipment: (unit: FireEquipment) => void;
  onDeleteEquipment: (unit: FireEquipment) => void;
  onAddInstallation: () => void;
  onEditInstallation: (installation: FireInstallation) => void;
  onDeleteInstallation: (installation: FireInstallation) => void;
}) {
  const extinguishers = equipment.filter((unit) => unit.kind === 'extinguisher').length;
  const hint = extinguisherHint(extinguishers, workplace);
  const description = [workplace.activity, workplaceAddress(workplace)].filter(Boolean).join(' · ');
  const today = dateToIso(new Date());

  return (
    <SectionCard
      data-testid="fire-means-card"
      title={
        <span className="flex flex-wrap items-center gap-2">
          {workplace.name}
          {workplace.isRegisteredOffice && <Badge variant="secondary">Sediu social</Badge>}
        </span>
      }
      description={description || undefined}
    >
      <section className="grid gap-3" aria-label={`Stingătoare și echipamente, ${workplace.name}`}>
        <BlockHeading
          title="Stingătoare și echipamente"
          action={
            !readOnly && (
              <Button
                id={equipmentAddId(workplace.id)}
                variant="tonal"
                size="sm"
                data-testid="fire-equipment-add"
                onClick={onAddEquipment}
              >
                <Plus aria-hidden="true" />
                Adaugă
              </Button>
            )
          }
        />
        {equipment.length === 0 ? (
          <p data-testid="fire-equipment-empty" className="text-sm text-muted-foreground">
            Niciun stingător încă. Documentele PSI cer cel puțin unul la fiecare loc de muncă.
          </p>
        ) : (
          <Table className="max-sm:block">
            <TableHeader className="max-sm:sr-only">
              <TableRow>
                <TableHead className={columns.what}>Mijlocul</TableHead>
                <TableHead className={columns.which}>Identificare</TableHead>
                <TableHead className={columns.when}>Service</TableHead>
                <TableHead>Firma de service</TableHead>
                {!readOnly && (
                  <TableHead className="w-12">
                    <span className="sr-only">Acțiuni</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody className="max-sm:block">
              {equipment.map((unit) => (
                <TableRow
                  key={unit.id}
                  data-testid="fire-equipment-row"
                  {...rowClickProps(readOnly ? undefined : () => onEditEquipment(unit))}
                  className={cn(rowClass, !readOnly && 'cursor-pointer')}
                >
                  <TableCell className={stackedCell}>
                    <UnitCell unit={unit} />
                  </TableCell>
                  <TableCell className={stackedCell}>
                    <Lines
                      first={unit.label && <span className="font-medium">Nr. {unit.label}</span>}
                      second={[
                        unit.location,
                        unit.manufacturedYear && `fabricat în ${unit.manufacturedYear}`,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    />
                  </TableCell>
                  <TableCell className={stackedCell}>
                    <ServiceDates
                      last={unit.lastServiceOn}
                      next={unit.nextServiceOn}
                      lastLabel="Ultimul"
                      nextLabel="Următorul"
                      today={today}
                    />
                  </TableCell>
                  <TableCell className={cn(stackedCell, 'text-muted-foreground')}>
                    <Lines first={unit.maintainer} />
                  </TableCell>
                  {!readOnly && (
                    <TableCell className="max-sm:col-start-2 max-sm:row-span-4 max-sm:row-start-1 max-sm:p-0">
                      <RowMenu
                        name={unitTitle(unit)}
                        testId="fire-equipment"
                        onEdit={() => onEditEquipment(unit)}
                        onDelete={() => onDeleteEquipment(unit)}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {hint && (
          <p data-testid="fire-equipment-hint" className="text-sm text-muted-foreground">
            {hint}
          </p>
        )}
      </section>

      <section className="grid gap-3 border-t pt-5" aria-label={`Instalații, ${workplace.name}`}>
        <BlockHeading
          title="Instalații"
          action={
            !readOnly && (
              <Button
                variant="tonal"
                size="sm"
                data-testid="fire-installation-add"
                onClick={onAddInstallation}
              >
                <Plus aria-hidden="true" />
                Adaugă
              </Button>
            )
          }
        />
        {installations.length === 0 ? (
          <p data-testid="fire-installations-empty" className="text-sm text-muted-foreground">
            Nicio instalație. Un spațiu mic poate să nu aibă niciuna.
          </p>
        ) : (
          <Table className="max-sm:block">
            <TableHeader className="max-sm:sr-only">
              <TableRow>
                <TableHead className={columns.whatAndWhich}>Instalația</TableHead>
                <TableHead className={columns.when}>Verificare</TableHead>
                <TableHead>Firma de service</TableHead>
                {!readOnly && (
                  <TableHead className="w-12">
                    <span className="sr-only">Acțiuni</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody className="max-sm:block">
              {installations.map((installation) => (
                <TableRow
                  key={installation.id}
                  data-testid="fire-installation-row"
                  {...rowClickProps(readOnly ? undefined : () => onEditInstallation(installation))}
                  className={cn(rowClass, !readOnly && 'cursor-pointer')}
                >
                  <TableCell className={stackedCell}>
                    <Lines
                      first={
                        <span className="font-medium">
                          {fireInstallationKindLabels[installation.kind]}
                        </span>
                      }
                      second={installation.description}
                    />
                  </TableCell>
                  <TableCell className={stackedCell}>
                    <ServiceDates
                      last={installation.lastCheckOn}
                      next={installation.nextCheckOn}
                      lastLabel="Ultima"
                      nextLabel="Următoarea"
                      today={today}
                    />
                  </TableCell>
                  <TableCell className={cn(stackedCell, 'text-muted-foreground')}>
                    <Lines first={installation.maintainer} />
                  </TableCell>
                  {!readOnly && (
                    <TableCell className="max-sm:col-start-2 max-sm:row-span-3 max-sm:row-start-1 max-sm:p-0">
                      <RowMenu
                        name={fireInstallationKindLabels[installation.kind]}
                        testId="fire-installation"
                        onEdit={() => onEditInstallation(installation)}
                        onDelete={() => onDeleteInstallation(installation)}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </SectionCard>
  );
}

function BlockHeading({ title, action }: { title: string; action: ReactNode }) {
  return (
    <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <h3 className="font-semibold">{title}</h3>
      {action}
    </div>
  );
}

function UnitCell({ unit }: { unit: FireEquipment }) {
  if (unit.kind !== 'extinguisher' || !unit.agent || unit.capacity === null) {
    return <span className="font-medium">{unitTitle(unit)}</span>;
  }
  return (
    <span className="flex items-center gap-3">
      <ExtinguisherCode code={extinguisherCode(unit.agent, unit.capacity)} />
      <span className="grid gap-0.5">
        <span className="text-sm">{extinguisherContents(unit.agent, unit.capacity)}</span>
        {unit.wheeled && <span className="text-xs text-muted-foreground">Carosabil</span>}
      </span>
    </span>
  );
}

function Lines({ first, second }: { first?: ReactNode; second?: string | null }) {
  if (!first && !second) {
    return <span className="text-muted-foreground max-sm:hidden">—</span>;
  }
  return (
    <span className="grid gap-0.5">
      {first && <span>{first}</span>}
      {second && <span className="text-xs text-muted-foreground">{second}</span>}
    </span>
  );
}

function ServiceDates({
  last,
  next,
  lastLabel,
  nextLabel,
  today,
}: {
  last: string | null;
  next: string | null;
  lastLabel: string;
  nextLabel: string;
  today: string;
}) {
  if (!last && !next) return <Lines />;
  const overdue = next !== null && next < today;
  return (
    <span className="grid gap-0.5 text-xs">
      {last && (
        <span className="text-muted-foreground">
          {lastLabel}: <span className="tabular-nums">{formatRoDate(last)}</span>
        </span>
      )}
      {next && (
        <span
          data-testid={overdue ? 'fire-service-overdue' : undefined}
          className={overdue ? 'font-medium text-warning-foreground' : undefined}
        >
          {nextLabel}: <span className="tabular-nums">{formatRoDate(next)}</span>
          {overdue && ', depășit'}
        </span>
      )}
    </span>
  );
}

function RowMenu({
  name,
  testId,
  onEdit,
  onDelete,
}: {
  name: string;
  testId: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          data-testid={`${testId}-actions`}
          aria-label={`Acțiuni pentru ${name}`}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem data-testid={`${testId}-edit`} onSelect={onEdit}>
          Modifică
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid={`${testId}-delete`}
          variant="destructive"
          onSelect={onDelete}
        >
          Șterge
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
