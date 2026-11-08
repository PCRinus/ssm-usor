import type { StaffCategory } from '@ssm-usor/contracts';
import { staffCategories } from '@ssm-usor/contracts';
import { Input } from '@ssm-usor/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Briefcase, HardHat, Laptop, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { FieldMessage } from '@/components/form-field';
import { Segmented, type SegmentOption } from '@/components/segmented';
import { intervalLabel, staffCategoryLabels } from '@/features/job-positions/job-position-schema';
import { countOf } from '@/features/legislation/legislation-labels';

import { monthNames } from './document-details-schema';
import {
  capitalized,
  type CategoryPosts,
  durations,
  type HeldPosition,
  intervalChoices,
  intervalFieldId,
  intervalHint,
  type ScheduleDomain,
  trainingMonthsText,
} from './schedule-rules';

const categoryIcons: Record<StaffCategory, LucideIcon> = {
  execution: HardHat,
  technical_administrative: Laptop,
};

const categoryInSentence: Record<StaffCategory, string> = {
  execution: 'Personalul de execuție',
  technical_administrative: 'Personalul tehnico-administrativ',
};

const listedPositions = 6;

// An import's posts have no workers yet, so their line counts only the posts.
function postsLine(positions: readonly HeldPosition[]) {
  const counted = positions.every((position) => position.employeeCount !== undefined);
  const workers = positions.reduce((sum, position) => sum + (position.employeeCount ?? 0), 0);
  const names = positions.slice(0, listedPositions).map((position) => position.name.trim());
  const rest = positions.length - names.length;
  const people = !counted
    ? ''
    : `, ${workers === 0 ? 'fără lucrători' : countOf(workers, 'lucrător', 'lucrători')}`;
  return `${countOf(positions.length, 'post', 'posturi')}${people}: ${names.join(', ')}${
    rest > 0 ? ` și încă ${rest}` : ''
  }`;
}

export function CategoryBlock({
  category,
  positions,
  interval,
  firstMonth,
  testId,
  id,
  pending = false,
  children,
}: {
  category: StaffCategory;
  positions: readonly HeldPosition[];
  interval: number | null;
  firstMonth: number | null;
  testId?: string;
  id?: string;
  pending?: boolean;
  children?: ReactNode;
}) {
  const Icon = categoryIcons[category];
  return (
    <section
      id={id}
      data-testid={testId}
      data-pending={pending || undefined}
      aria-label={staffCategoryLabels[category]}
      className={cn(
        'grid scroll-mt-32 gap-4 rounded-xl border p-4',
        pending ? 'border-warning-border bg-warning/50' : 'bg-muted/40'
      )}
    >
      <div className="flex gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-info-border bg-info text-info-foreground">
          <Icon aria-hidden="true" className="size-[18px]" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <h4 className="text-[15px] leading-snug font-semibold">
              {staffCategoryLabels[category]}
            </h4>
            <p className="mt-0.5 text-[13.5px] text-muted-foreground">{postsLine(positions)}</p>
          </div>
          <div className="shrink-0 sm:text-right" aria-live="polite">
            {interval === null && pending ? (
              <>
                <p className="text-2xl leading-tight font-semibold tracking-tight text-muted-foreground">
                  De ales
                </p>
                <p className="mt-0.5 text-[13.5px] text-muted-foreground">Alege intervalul</p>
              </>
            ) : interval === null ? (
              <p className="text-sm text-muted-foreground">Fără interval</p>
            ) : (
              <>
                <p
                  data-testid={testId && `${testId}-interval`}
                  className="text-2xl leading-tight font-semibold tracking-tight tabular-nums"
                >
                  {capitalized(intervalLabel(interval))}
                </p>
                {firstMonth !== null && (
                  <p
                    data-testid={testId && `${testId}-months`}
                    className="mt-0.5 text-[13.5px] text-muted-foreground"
                  >
                    {trainingMonthsText(firstMonth, interval)}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      {children && (
        <div className={cn('grid gap-2 border-t pt-3.5', pending && 'border-warning-border/70')}>
          {children}
        </div>
      )}
    </section>
  );
}

export function NoPostsBlock({ action }: { action?: ReactNode }) {
  return (
    <div
      data-testid="training-no-positions"
      className="flex gap-3 rounded-xl border border-dashed bg-muted/40 p-4"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border bg-card text-muted-foreground">
        <Briefcase aria-hidden="true" className="size-[18px]" />
      </span>
      <div className="grid min-w-0 justify-items-start gap-3">
        <p className="text-sm">
          <span className="font-semibold">Adaugă posturile clientului.</span>{' '}
          <span className="text-muted-foreground">
            Intervalul se alege pentru fiecare categorie care are posturi.
          </span>
        </p>
        {action}
      </div>
    </div>
  );
}

const fieldLabel = 'text-sm leading-none font-medium';
const hintText = 'text-xs text-muted-foreground';

type Problem = { message?: string };

export type ScheduleCategory = CategoryPosts & {
  interval: number | null;
  error?: Problem;
  control?: ReactNode;
  fieldNote?: ReactNode;
  blockNote?: ReactNode;
  pending?: boolean;
  id?: string;
};

type CalendarSlots = { firstMonth?: ReactNode; days?: ReactNode; duration?: ReactNode };

function withPicked(values: readonly number[], picked: number | null): SegmentOption<string>[] {
  const outside = picked !== null && !values.includes(picked);
  return [...values, ...(outside ? [picked] : [])]
    .sort((a, b) => a - b)
    .map((value) => ({
      value: String(value),
      label: String(value),
      invalid: outside && value === picked,
    }));
}

export type ScheduleFieldsProps = {
  domain: ScheduleDomain;
  idPrefix: string;
  categories: readonly ScheduleCategory[];
  firstMonth: number | null;
  dayFrom: string;
  dayTo: string;
  duration: number | null;
  disabled: boolean;
  errors?: { firstMonth?: Problem; dayFrom?: Problem; dayTo?: Problem; duration?: Problem };
  notes?: CalendarSlots;
  anchors?: { firstMonth?: string; dayFrom?: string; dayTo?: string; duration?: string };
  controls?: CalendarSlots;
  postsLink?: ReactNode;
  noPostsAction?: ReactNode;
  noPosts?: ReactNode;
  absentNote?: (category: StaffCategory) => ReactNode;
  // Typing a day calls its handler on every key; this, once the member leaves the field.
  onDaysCommit?: () => void;
  onIntervalChange: (category: StaffCategory, months: number) => void;
  onFirstMonthChange: (month: number | null) => void;
  onDayFromChange: (day: string) => void;
  onDayToChange: (day: string) => void;
  onDurationChange: (duration: number) => void;
};

/**
 * The questions of a training schedule, with no form of its own: each pick goes to its handler,
 * and the caller keeps the values, checks them and saves them.
 */
export function TrainingScheduleFields({
  domain,
  idPrefix,
  categories,
  firstMonth,
  dayFrom,
  dayTo,
  duration,
  disabled,
  errors = {},
  notes = {},
  anchors = {},
  controls = {},
  postsLink,
  noPostsAction,
  noPosts,
  absentNote,
  onDaysCommit,
  onIntervalChange,
  onFirstMonthChange,
  onDayFromChange,
  onDayToChange,
  onDurationChange,
}: ScheduleFieldsProps) {
  const present = new Set(categories.map(({ category }) => category));
  const absent = categories.length === 0 ? [] : staffCategories.filter((c) => !present.has(c));
  const ids = {
    firstMonth: `${idPrefix}-first-month`,
    dayFrom: `${idPrefix}-day-from`,
    dayTo: `${idPrefix}-day-to`,
    days: `${idPrefix}-days`,
    duration: `${idPrefix}-training-duration`,
  };
  const durationChoices = durations[domain];
  const durationOptions = withPicked(durationChoices.values, duration);
  const dayProblem = errors.dayFrom ?? errors.dayTo;

  return (
    <div className="grid gap-8">
      <section className="grid gap-4" aria-labelledby={`${idPrefix}-categories-title`}>
        <div>
          <h3 id={`${idPrefix}-categories-title`} className="font-semibold">
            Categoriile de personal
          </h3>
          <p className="text-sm text-muted-foreground">
            Apar categoriile în care clientul are posturi de lucru.
          </p>
        </div>
        {categories.length === 0 ? (
          (noPosts ?? <NoPostsBlock action={noPostsAction} />)
        ) : (
          <div className="grid gap-3">
            {categories.map((entry) => {
              const id = intervalFieldId(idPrefix, entry.category);
              const options = withPicked(intervalChoices(domain, entry.category), entry.interval);
              const outside = options.some((option) => option.invalid);
              return (
                <CategoryBlock
                  key={entry.category}
                  category={entry.category}
                  positions={entry.positions}
                  interval={outside ? null : entry.interval}
                  firstMonth={firstMonth}
                  testId={`${idPrefix}-category-${entry.category}`}
                  id={entry.id}
                  pending={entry.pending}
                >
                  {entry.control ?? (
                    <>
                      <p className={cn(fieldLabel, 'mb-1')}>La câte luni</p>
                      <Segmented
                        id={id}
                        name={id}
                        label={`La câte luni, ${staffCategoryLabels[entry.category]}`}
                        options={options}
                        value={entry.interval === null ? null : String(entry.interval)}
                        disabled={disabled}
                        testIdPrefix={id}
                        phone="one-row"
                        invalid={outside || Boolean(entry.error)}
                        describedBy={entry.error ? `${id}-error` : `${id}-hint`}
                        onPick={(value) => onIntervalChange(entry.category, Number(value))}
                      />
                      {entry.error ? (
                        <FieldMessage id={`${id}-error`} error={entry.error} />
                      ) : (
                        <p id={`${id}-hint`} className={hintText}>
                          {intervalHint(domain, entry.category)}
                        </p>
                      )}
                    </>
                  )}
                  {entry.fieldNote}
                  {entry.blockNote}
                </CategoryBlock>
              );
            })}
          </div>
        )}
        {absent.map((category) => (
          <p
            key={category}
            data-testid={`${idPrefix}-absent-${category}`}
            className="max-w-[68ch] text-sm text-muted-foreground"
          >
            {absentNote ? (
              absentNote(category)
            ) : (
              <>
                {categoryInSentence[category]} nu apare: clientul nu are posturi în această
                categorie.
                {postsLink && <> Când adaugi unul în {postsLink}, îi alegi aici intervalul.</>}
              </>
            )}
          </p>
        ))}
      </section>

      <section className="grid gap-6" aria-labelledby={`${idPrefix}-calendar-title`}>
        <h3 id={`${idPrefix}-calendar-title`} className="font-semibold">
          Calendarul instruirii
        </h3>

        <div id={anchors.firstMonth} className="grid scroll-mt-32 gap-2">
          <label htmlFor={ids.firstMonth} className={fieldLabel}>
            Prima lună
          </label>
          {controls.firstMonth ?? (
            <>
              <div className="sm:w-70">
                <NativeSelect
                  id={ids.firstMonth}
                  data-testid={ids.firstMonth}
                  disabled={disabled}
                  value={firstMonth === null ? '' : String(firstMonth)}
                  aria-invalid={Boolean(errors.firstMonth)}
                  aria-describedby={
                    errors.firstMonth ? `${ids.firstMonth}-error` : `${ids.firstMonth}-hint`
                  }
                  onChange={(event) =>
                    onFirstMonthChange(
                      event.target.value === '' ? null : Number(event.target.value)
                    )
                  }
                >
                  <NativeSelectOption value="">Alege luna</NativeSelectOption>
                  {monthNames.map((name, index) => (
                    <NativeSelectOption key={name} value={String(index + 1)}>
                      {name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            </>
          )}
          {errors.firstMonth ? (
            <FieldMessage id={`${ids.firstMonth}-error`} error={errors.firstMonth} />
          ) : (
            <p id={`${ids.firstMonth}-hint`} className={hintText}>
              Celelalte luni urmează din intervalul fiecărei categorii.
            </p>
          )}
          {notes.firstMonth}
        </div>

        <fieldset
          className="grid gap-2"
          aria-describedby={controls.days || dayProblem ? undefined : `${ids.days}-hint`}
        >
          <legend className={cn(fieldLabel, 'mb-3')}>Zilele lunii</legend>
          {controls.days ?? (
            <>
              <div className="grid grid-cols-2 gap-4 sm:flex">
                {(
                  [
                    ['dayFrom', 'De la ziua', dayFrom, onDayFromChange],
                    ['dayTo', 'Până la ziua', dayTo, onDayToChange],
                  ] as const
                ).map(([key, label, value, onChange]) => (
                  <div key={key} id={anchors[key]} className="grid scroll-mt-32 gap-2 sm:w-28">
                    <label htmlFor={ids[key]} className="text-sm leading-none">
                      {label}
                    </label>
                    <Input
                      id={ids[key]}
                      data-testid={ids[key]}
                      inputMode="numeric"
                      autoComplete="off"
                      disabled={disabled}
                      value={value}
                      aria-invalid={Boolean(errors[key])}
                      aria-describedby={
                        errors[key]
                          ? `${ids[key]}-error`
                          : dayProblem
                            ? undefined
                            : `${ids.days}-hint`
                      }
                      onChange={(event) => onChange(event.target.value)}
                      onBlur={onDaysCommit}
                    />
                  </div>
                ))}
              </div>
              {dayProblem ? (
                <>
                  <FieldMessage id={`${ids.dayFrom}-error`} error={errors.dayFrom} />
                  <FieldMessage id={`${ids.dayTo}-error`} error={errors.dayTo} />
                </>
              ) : (
                <p id={`${ids.days}-hint`} className={hintText}>
                  O zi între 1 și 31. Pentru o singură zi, scrie aceeași zi în ambele câmpuri.
                </p>
              )}
            </>
          )}
          {notes.days}
        </fieldset>

        <div id={anchors.duration} className="grid scroll-mt-32 gap-2">
          <p className={fieldLabel}>{durationChoices.label}</p>
          {controls.duration ?? (
            <>
              <Segmented
                id={ids.duration}
                name={ids.duration}
                label={durationChoices.label}
                options={durationOptions}
                value={duration === null ? null : String(duration)}
                disabled={disabled}
                testIdPrefix={ids.duration}
                phone="one-row"
                invalid={
                  durationOptions.some((option) => option.invalid) || Boolean(errors.duration)
                }
                describedBy={
                  errors.duration
                    ? `${ids.duration}-error`
                    : domain === 'su'
                      ? `${ids.duration}-hint`
                      : undefined
                }
                onPick={(value) => onDurationChange(Number(value))}
              />
              {errors.duration ? (
                <FieldMessage id={`${ids.duration}-error`} error={errors.duration} />
              ) : (
                domain === 'su' && (
                  <p id={`${ids.duration}-hint`} className={hintText}>
                    Cel puțin 2 ore, după OMAI 712/2005, art. 21.
                  </p>
                )
              )}
            </>
          )}
          {notes.duration}
        </div>
      </section>
    </div>
  );
}

export function SessionSentence({
  duration,
  dayFrom,
  dayTo,
}: {
  duration: string;
  dayFrom: number;
  dayTo: number;
}) {
  return (
    <>
      Fiecare instruire durează <span className="font-medium">{duration}</span> și are loc{' '}
      <span className="font-medium">
        {dayFrom === dayTo
          ? `în ziua de ${dayFrom} a lunii`
          : `între zilele ${dayFrom} și ${dayTo} ale lunii`}
      </span>
      .
    </>
  );
}
