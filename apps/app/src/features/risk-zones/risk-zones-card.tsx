import type {
  RiskZone,
  RiskZoneEvaluation,
  RiskZoneFactor,
  RiskZonesResponse,
  RiskZoneSuggestion,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { Notice } from '@ssm-usor/ui/components/notice';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { cn } from '@ssm-usor/ui/lib/utils';
import {
  Check,
  EyeOff,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldAlert,
  Undo2,
} from 'lucide-react';
import { Fragment, type ReactNode, useState } from 'react';

import { useScrollToHash } from '@/app/use-scroll-to-hash';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { LoadFailed } from '@/components/load-failed';
import { SectionCard } from '@/components/section-card';
import { DecisionBadge } from '@/features/job-positions/decision-badge';
import { EvaluationLink } from '@/features/risk-evaluations/evaluation-link';
import { riskZonesSection } from '@/features/risk-evaluations/risk-evaluation-schema';
import { RiskLevelTile } from '@/features/risk-evaluations/risk-level-tile';

import { RiskZoneEditor, type ZoneEditing } from './risk-zone-editor';
import {
  ignoredCountLabel,
  linkedMeasureCount,
  printedFactors,
  printedMeasures,
  suggestionSource,
  zonePlace,
} from './risk-zone-model';
import { type RiskZonesStore, useRiskZones } from './use-risk-zones';

export const noRiskZonesLabel = 'Nu există zone cu risc ridicat și specific';

const linkClass =
  'min-w-0 rounded-sm underline decoration-muted-foreground/45 underline-offset-3 outline-none wrap-anywhere hover:decoration-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50';

const actionsClass =
  'flex flex-wrap justify-end gap-2 max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:[&>button]:h-11';

export function RiskZonesCard({
  clientId,
  clientName,
  readOnly,
}: {
  clientId: string;
  clientName: string;
  readOnly: boolean;
}) {
  const store = useRiskZones(clientId);
  const { zones: query } = store;
  const [editing, setEditing] = useState<ZoneEditing | null>(null);
  useScrollToHash(!query.isPending);
  const data = query.data;
  const add = () => setEditing({ kind: 'new' });

  return (
    <SectionCard
      id={riskZonesSection}
      data-testid="risk-zones-card"
      title="Zone cu risc ridicat și specific"
      longTitle
      help="evaluari-de-risc.zone-cu-risc"
      description={data && !readOnly && <RecordStatus data={data} />}
      action={
        !readOnly &&
        !(data && showsEmptyState(data)) && (
          <Button
            variant="secondary"
            size="sm"
            data-testid="risk-zone-add"
            disabled={store.pending !== null}
            onClick={add}
          >
            <Plus aria-hidden="true" />
            Adaugă o zonă
          </Button>
        )
      }
    >
      {store.failure && (
        <Notice variant="destructive" data-testid="risk-zones-error">
          {store.failure}
        </Notice>
      )}
      {query.isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : query.isError ? (
        <LoadFailed
          error={query.error}
          busy={query.isFetching}
          onRetry={() => void query.refetch()}
        >
          Nu am putut încărca zonele cu risc ridicat și specific ale clientului.
        </LoadFailed>
      ) : (
        <CardBody
          data={query.data}
          clientId={clientId}
          readOnly={readOnly}
          store={store}
          onAdd={add}
          onEdit={setEditing}
        />
      )}
      {data && !readOnly && (
        <RiskZoneEditor
          clientId={clientId}
          clientName={clientName}
          data={data}
          store={store}
          editing={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </SectionCard>
  );
}

// The empty state holds its own add button, as drawn.
const showsEmptyState = (data: RiskZonesResponse) =>
  data.state === 'undecided' &&
  data.zones.length === 0 &&
  data.suggestions.length === 0 &&
  data.ignoredSuggestions.length === 0;

function RecordStatus({ data }: { data: RiskZonesResponse }) {
  const current = new Set(data.factors.map((factor) => factor.id));
  const waitsFor =
    data.state === 'undecided'
      ? 'așteaptă zonele clientului sau declarația că nu are'
      : data.zones.some((zone) => !printsMeasures(zone, current))
        ? 'așteaptă măsurile fiecărei zone'
        : null;
  if (!waitsFor) return null;
  return (
    <span data-testid="risk-zones-status">
      Documentul 9.2: <span className="font-medium text-warning-foreground">{waitsFor}</span>
    </span>
  );
}

function printsMeasures(zone: RiskZone, current: ReadonlySet<string>) {
  const measures = printedMeasures(printedFactors(zone, current), zone.measures);
  return linkedMeasureCount(measures) + measures.own.length > 0;
}

function CardBody({
  data,
  clientId,
  readOnly,
  store,
  onAdd,
  onEdit,
}: {
  data: RiskZonesResponse;
  clientId: string;
  readOnly: boolean;
  store: RiskZonesStore;
  onAdd: () => void;
  onEdit: (editing: ZoneEditing) => void;
}) {
  const [showIgnored, setShowIgnored] = useState(false);
  const busy = store.pending !== null;
  const declaration = (
    <Button
      variant="secondary"
      size="sm"
      data-testid="risk-zones-none"
      disabled={busy}
      className="max-sm:h-11 max-sm:w-full max-sm:whitespace-normal"
      onClick={() => void store.declare('none')}
    >
      {store.pending === 'declare' ? 'Se salvează…' : noRiskZonesLabel}
    </Button>
  );

  if (data.state === 'none') {
    return (
      <DeclaredRow
        readOnly={readOnly}
        busy={busy}
        pending={store.pending === 'declare'}
        onUndo={() => void store.declare('undecided')}
        onAdd={onAdd}
      />
    );
  }

  const current = new Set(data.factors.map((factor) => factor.id));
  const suggestions = readOnly ? [] : data.suggestions;
  const ignored = readOnly ? [] : data.ignoredSuggestions;
  const undecided = data.state === 'undecided';

  if (data.zones.length === 0 && suggestions.length === 0 && ignored.length === 0) {
    if (readOnly) {
      return (
        <p data-testid="risk-zones-empty" className="text-sm text-muted-foreground">
          Clientul nu are zone cu risc ridicat și specific înregistrate.
        </p>
      );
    }
    return (
      <EmptyState
        data-testid="risk-zones-empty"
        icon={ShieldAlert}
        title="Nicio zonă cu risc ridicat și specific"
        actions={
          <>
            <Button
              variant="secondary"
              data-testid="risk-zones-empty-add"
              disabled={busy}
              className="max-sm:h-11"
              onClick={onAdd}
            >
              <Plus aria-hidden="true" />
              Adaugă o zonă
            </Button>
            {declaration}
          </>
        }
      >
        Niciun factor evaluat nu are risc inacceptabil, deci nu avem sugestii. Adaugă zonele pe care
        le cunoști, cum e camera tabloului electric, sau declară că nu există.
      </EmptyState>
    );
  }

  return (
    <div className="grid">
      {data.zones.length > 0 && (
        <ul data-testid="risk-zones-list" className="divide-y border-t">
          {data.zones.map((zone) => (
            <ZoneRow
              key={zone.id}
              zone={zone}
              clientId={clientId}
              current={current}
              readOnly={readOnly}
              busy={busy}
              removing={store.pending === `remove:${zone.id}`}
              onEdit={() => onEdit({ kind: 'edit', zone })}
              onRemove={() => store.remove(zone.id)}
            />
          ))}
        </ul>
      )}
      {suggestions.length > 0 && (
        <section
          aria-labelledby="risk-zone-suggestions-title"
          data-testid="risk-zone-suggestions"
          className={cn('grid', data.zones.length > 0 && 'pt-7')}
        >
          <h3 id="risk-zone-suggestions-title" className="pb-1 text-sm font-semibold">
            Sugestii din fișele de evaluare (factori peste nivelul 3)
          </h3>
          <ul className="divide-y border-t">
            {suggestions.map((suggestion) => (
              <SuggestionRow
                key={suggestionKey(suggestion)}
                suggestion={suggestion}
                clientId={clientId}
                zones={data.zones}
                store={store}
                onEdit={() => onEdit({ kind: 'suggestion', suggestion })}
              />
            ))}
          </ul>
        </section>
      )}
      {ignored.length > 0 && (
        <div data-testid="risk-zones-ignored" className="grid">
          <p className="flex flex-wrap items-center gap-1.5 pt-4 text-sm text-muted-foreground">
            <span data-testid="risk-zones-ignored-count">{ignoredCountLabel(ignored.length)}</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              data-testid="risk-zones-ignored-toggle"
              aria-expanded={showIgnored}
              aria-controls="risk-zones-ignored-list"
              className={cn(linkClass, 'font-medium text-foreground max-sm:min-h-11')}
              onClick={() => setShowIgnored((shown) => !shown)}
            >
              {showIgnored ? 'Ascunde' : 'Arată'}
            </button>
          </p>
          {showIgnored && (
            <ul id="risk-zones-ignored-list" className="mt-3 divide-y border-t">
              {ignored.map((suggestion) => (
                <IgnoredRow
                  key={suggestionKey(suggestion)}
                  suggestion={suggestion}
                  clientId={clientId}
                  store={store}
                />
              ))}
            </ul>
          )}
        </div>
      )}
      {!readOnly && undecided && data.zones.length === 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-4">
          {declaration}
        </div>
      )}
    </div>
  );
}

const suggestionKey = (suggestion: RiskZoneSuggestion) =>
  `${suggestion.name}:${suggestion.factors[0]!.id}`;

function DeclaredRow({
  readOnly,
  busy,
  pending,
  onUndo,
  onAdd,
}: {
  readOnly: boolean;
  busy: boolean;
  pending: boolean;
  onUndo: () => void;
  onAdd: () => void;
}) {
  return (
    <div
      data-testid="risk-zones-declared"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t py-3 text-sm"
    >
      <span className="grid min-w-0 flex-1 basis-64 gap-1">
        <span className="font-medium">Clientul nu are zone cu risc ridicat și specific</span>
        <span className="text-muted-foreground">
          Documentul 9.2 consemnează că în urma evaluării riscurilor nu au fost identificate astfel
          de zone.
        </span>
      </span>
      {!readOnly && (
        <span className="flex flex-wrap gap-2 max-sm:grid max-sm:w-full max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:[&>button]:h-11">
          <Button
            variant="secondary"
            size="sm"
            data-testid="risk-zones-undo"
            disabled={busy}
            onClick={onUndo}
          >
            <Pencil aria-hidden="true" />
            {pending ? 'Se salvează…' : 'Modifică'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            data-testid="risk-zones-add-anyway"
            disabled={busy}
            onClick={onAdd}
          >
            <Plus aria-hidden="true" />
            Adaugă totuși o zonă
          </Button>
        </span>
      )}
    </div>
  );
}

function ZoneRow({
  zone,
  clientId,
  current,
  readOnly,
  busy,
  removing,
  onEdit,
  onRemove,
}: {
  zone: RiskZone;
  clientId: string;
  current: ReadonlySet<string>;
  readOnly: boolean;
  busy: boolean;
  removing: boolean;
  onEdit: () => void;
  onRemove: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const place = zonePlace(zone);
  const measures = printedMeasures(printedFactors(zone, current), zone.measures);
  const linkedCount = linkedMeasureCount(measures);
  return (
    <li
      data-testid="risk-zone-row"
      className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2.5 py-4 text-sm"
    >
      <div className="grid min-w-0 gap-0.5">
        <span data-testid="risk-zone-name" className="font-medium wrap-anywhere">
          {zone.name}
        </span>
        {place && (
          <span
            data-testid="risk-zone-place"
            className="flex items-start gap-1.5 text-muted-foreground"
          >
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 wrap-anywhere">{place}</span>
          </span>
        )}
      </div>
      {!readOnly && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              data-testid="risk-zone-actions"
              aria-label={`Acțiuni pentru ${zone.name}`}
              disabled={busy}
              className="max-sm:-mt-1.5 max-sm:-mr-2.5 max-sm:size-11"
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem data-testid="risk-zone-edit" onSelect={onEdit}>
              <Pencil aria-hidden="true" />
              Modifică
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="risk-zone-remove"
              variant="destructive"
              onSelect={() => setConfirming(true)}
            >
              Șterge
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {zone.factors.length > 0 && <FactorList factors={zone.factors} clientId={clientId} />}
      <div data-testid="risk-zone-measures" className="col-span-full grid gap-1">
        {linkedCount > 0 && (
          <MeasureLine label="Măsuri:">
            {linkedCount === 1 ? 'una din factorii legați' : `${linkedCount} din factorii legați`}
          </MeasureLine>
        )}
        {zone.measures && <MeasureLine label="Măsuri proprii:">{zone.measures}</MeasureLine>}
        {linkedCount === 0 && !zone.measures && (
          <MeasureLine label="Măsuri:">
            <span className="font-medium text-warning-foreground">
              niciuna de tipărit; leagă un factor cu măsuri sau scrie măsurile proprii
            </span>
          </MeasureLine>
        )}
      </div>
      <ConfirmDialog
        open={confirming}
        busy={removing}
        testId="risk-zone-remove"
        title={`Ștergi zona „${zone.name}”?`}
        confirmLabel="Șterge zona"
        pendingLabel="Se șterge…"
        onConfirm={async () => {
          await onRemove();
          setConfirming(false);
        }}
        onClose={() => setConfirming(false)}
      >
        Factorii ei de risc rămân în fișele de evaluare. Fără nicio zonă, documentul 9.2 așteaptă
        din nou zonele clientului sau declarația că nu are.
      </ConfirmDialog>
    </li>
  );
}

function MeasureLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="flex gap-1.5">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 whitespace-pre-line wrap-anywhere">{children}</span>
    </p>
  );
}

function EvaluationNameLink({
  evaluation,
  clientId,
}: {
  evaluation: RiskZoneEvaluation;
  clientId: string;
}) {
  return (
    <EvaluationLink
      evaluation={{
        id: evaluation.id,
        clientId,
        jobPosition: evaluation.jobPositionId
          ? { id: evaluation.jobPositionId, name: evaluation.title }
          : null,
      }}
      data-testid="risk-zone-evaluation-link"
      className={linkClass}
    >
      {evaluation.title}
    </EvaluationLink>
  );
}

function FactorList({ factors, clientId }: { factors: RiskZoneFactor[]; clientId: string }) {
  return (
    <ul className="col-span-full grid gap-2">
      {factors.map((factor) => (
        <li key={factor.id} data-testid="risk-zone-factor-line" className="flex items-center gap-3">
          <RiskLevelTile level={factor.riskLevel} />
          <span className="grid min-w-0">
            <span className="wrap-anywhere">{factor.description}</span>
            <span className="text-[13px] leading-[18px] text-muted-foreground">
              <EvaluationNameLink evaluation={factor.evaluation} clientId={clientId} />
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function SourceLine({
  suggestion,
  clientId,
}: {
  suggestion: RiskZoneSuggestion;
  clientId: string;
}) {
  return (
    <span data-testid="risk-zone-source" className="text-muted-foreground">
      {suggestionSource(suggestion).map((part, index) => (
        <Fragment key={part.lead}>
          {index > 0 && '; '}
          {part.lead}{' '}
          {part.evaluations.map((evaluation, position) => (
            <Fragment key={evaluation.id}>
              {position > 0 && (position === part.evaluations.length - 1 ? ' și ' : ', ')}
              <EvaluationNameLink evaluation={evaluation} clientId={clientId} />
            </Fragment>
          ))}
        </Fragment>
      ))}
    </span>
  );
}

function SuggestionHead({
  suggestion,
  clientId,
  badge,
}: {
  suggestion: RiskZoneSuggestion;
  clientId: string;
  badge: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span data-testid="risk-zone-suggestion-name" className="font-medium wrap-anywhere">
          {suggestion.name}
        </span>
        {badge && <DecisionBadge decision={null}>Sugestie</DecisionBadge>}
      </span>
      <SourceLine suggestion={suggestion} clientId={clientId} />
    </div>
  );
}

function SuggestionRow({
  suggestion,
  clientId,
  zones,
  store,
  onEdit,
}: {
  suggestion: RiskZoneSuggestion;
  clientId: string;
  zones: RiskZone[];
  store: RiskZonesStore;
  onEdit: () => void;
}) {
  const key = suggestionKey(suggestion);
  const factorIds = suggestion.factors.map((factor) => factor.id);
  const existing = zones.find((zone) => zone.id === suggestion.existingZoneId) ?? null;
  const busy = store.pending !== null;
  const running = (action: string) => store.pending === `${action}:${key}`;

  const ignore = (
    <Button
      variant="bordered"
      size="sm"
      data-testid="risk-zone-ignore"
      disabled={busy}
      onClick={() => void store.ignore(`ignore:${key}`, factorIds)}
    >
      <EyeOff aria-hidden="true" />
      {running('ignore') ? 'Se ignoră…' : 'Ignoră'}
    </Button>
  );

  return (
    <li
      data-testid="risk-zone-suggestion"
      className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2.5 py-4 text-sm max-sm:grid-cols-1"
    >
      <SuggestionHead suggestion={suggestion} clientId={clientId} badge />
      <div className={actionsClass}>
        {existing ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              data-testid="risk-zone-join"
              disabled={busy}
              className="max-sm:whitespace-normal"
              onClick={() =>
                void store.quickSave(
                  `join:${key}`,
                  existing.id,
                  {
                    name: existing.name,
                    workplaceId: existing.workplace?.id ?? null,
                    location: existing.location,
                    measures: existing.measures,
                    factorIds: [...existing.factors.map((factor) => factor.id), ...factorIds],
                  },
                  `Factorii au fost adăugați la zona ${existing.name}.`
                )
              }
            >
              <Plus aria-hidden="true" />
              {running('join') ? 'Se adaugă…' : `Adaugă la zona ${existing.name}`}
            </Button>
            {ignore}
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              size="sm"
              data-testid="risk-zone-confirm"
              disabled={busy}
              className="max-sm:col-span-full"
              onClick={() =>
                void store.quickSave(
                  `confirm:${key}`,
                  null,
                  {
                    name: suggestion.name,
                    workplaceId: null,
                    location: null,
                    measures: null,
                    factorIds,
                  },
                  'Zona a fost confirmată.'
                )
              }
            >
              <Check aria-hidden="true" />
              {running('confirm') ? 'Se confirmă…' : 'Confirmă zona'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              data-testid="risk-zone-edit-confirm"
              disabled={busy}
              onClick={onEdit}
            >
              <Pencil aria-hidden="true" />
              Modifică și confirmă
            </Button>
            {ignore}
          </>
        )}
      </div>
      <FactorList factors={suggestion.factors} clientId={clientId} />
    </li>
  );
}

function IgnoredRow({
  suggestion,
  clientId,
  store,
}: {
  suggestion: RiskZoneSuggestion;
  clientId: string;
  store: RiskZonesStore;
}) {
  const key = suggestionKey(suggestion);
  return (
    <li
      data-testid="risk-zone-ignored"
      className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2.5 py-4 text-sm max-sm:grid-cols-1"
    >
      <SuggestionHead suggestion={suggestion} clientId={clientId} badge={false} />
      <div className={cn(actionsClass, 'max-sm:grid-cols-1')}>
        <Button
          variant="secondary"
          size="sm"
          data-testid="risk-zone-restore"
          disabled={store.pending !== null}
          onClick={() =>
            void store.restore(
              `restore:${key}`,
              suggestion.factors.map((factor) => factor.id)
            )
          }
        >
          <Undo2 aria-hidden="true" />
          {store.pending === `restore:${key}` ? 'Se repune…' : 'Repune în sugestii'}
        </Button>
      </div>
      <FactorList factors={suggestion.factors} clientId={clientId} />
    </li>
  );
}
