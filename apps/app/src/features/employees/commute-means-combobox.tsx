import {
  type CommuteMean,
  commuteMeanLabels,
  commuteMeans,
  commuteMeansLabels,
  commuteMeansOtherMaxLength,
  type CommuteMeansValue,
} from '@ssm-usor/contracts';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@ssm-usor/ui/components/command';
import { Popover, PopoverContent, PopoverTrigger } from '@ssm-usor/ui/components/popover';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';

import { comboboxTriggerClass } from '@/components/combobox-trigger';
import { normalizeSearch } from '@/lib/normalize-search';

function meansFilter(value: string, search: string) {
  const query = normalizeSearch(search).trim();
  if (!query) return 1;
  return normalizeSearch(value).includes(query) ? 1 : 0;
}

function Choice({
  value,
  checked,
  onSelect,
  testId,
  children,
}: {
  value: string;
  checked: boolean;
  onSelect: () => void;
  testId: string;
  children: ReactNode;
}) {
  return (
    <CommandItem value={value} data-testid={testId} data-checked={checked} onSelect={onSelect}>
      <span className="min-w-0 flex-1">
        {children}
        {checked && <span className="sr-only">, ales</span>}
      </span>
      <Check
        className={cn('ml-auto size-4 shrink-0', checked ? '' : 'invisible')}
        aria-hidden="true"
      />
    </CommandItem>
  );
}

// Several means at once, since a commute often combines them, and at most one the specialist
// types for what the list has none for: a report can count the codes, never free text.
export function CommuteMeansCombobox({
  id,
  testId,
  value,
  onChange,
  onBlur,
  disabled,
  invalid,
  describedBy,
}: {
  id: string;
  testId: string;
  value: CommuteMeansValue;
  onChange: (value: CommuteMeansValue) => void;
  onBlur?: () => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  // As in SearchCombobox: a dialog swallows scrolling outside its own content, and this popover
  // is portaled out of it, so inside one it is modal to take that lock over.
  const trigger = useRef<HTMLButtonElement>(null);
  const [insideDialog, setInsideDialog] = useState(false);
  const chosen = commuteMeansLabels(value);
  const typed = search.trim();
  const listed = [...Object.values(commuteMeanLabels), value.other ?? ''];
  const offered =
    typed !== '' && !listed.some((label) => normalizeSearch(label) === normalizeSearch(typed));
  const tooLong = typed.length > commuteMeansOtherMaxLength;

  const toggle = (mean: CommuteMean) => {
    setSearch('');
    onChange({
      ...value,
      means: value.means.includes(mean)
        ? value.means.filter((each) => each !== mean)
        : commuteMeans.filter((each) => each === mean || value.means.includes(each)),
    });
  };

  return (
    <Popover
      modal={insideDialog}
      open={open}
      onOpenChange={(next) => {
        if (next) setInsideDialog(Boolean(trigger.current?.closest('[role="dialog"]')));
        setOpen(next);
        if (!next) {
          setSearch('');
          onBlur?.();
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={trigger}
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          data-testid={testId}
          disabled={disabled}
          className={cn(
            comboboxTriggerClass,
            'h-auto min-h-11 py-2 text-left',
            chosen.length === 0 && 'text-muted-foreground'
          )}
        >
          <span className={cn('min-w-0', chosen.length > 0 && 'font-medium')}>
            {chosen.length > 0 ? chosen.join(', ') : 'Alege unul sau mai multe'}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command filter={meansFilter}>
          <CommandInput
            data-testid={`${testId}-search`}
            placeholder="Caută sau scrie alt mijloc"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-72">
            <CommandGroup>
              {chosen.length > 0 && !typed && (
                <CommandItem
                  value="   șterge"
                  data-testid={`${testId}-clear`}
                  onSelect={() => onChange({ means: [], other: null })}
                  className="text-muted-foreground"
                >
                  <X aria-hidden="true" />
                  Șterge alegerile
                </CommandItem>
              )}
              {commuteMeans.map((mean) => (
                <Choice
                  key={mean}
                  value={commuteMeanLabels[mean]}
                  checked={value.means.includes(mean)}
                  onSelect={() => toggle(mean)}
                  testId={`${testId}-${mean}`}
                >
                  {commuteMeanLabels[mean]}
                </Choice>
              ))}
              {value.other && (
                <Choice
                  value={value.other}
                  checked
                  onSelect={() => {
                    setSearch('');
                    onChange({ ...value, other: null });
                  }}
                  testId={`${testId}-other`}
                >
                  {value.other}
                </Choice>
              )}
              {offered && (
                <CommandItem
                  forceMount
                  value={`   adaugă ${typed}`}
                  data-testid={`${testId}-add`}
                  disabled={tooLong}
                  onSelect={() => {
                    onChange({ ...value, other: typed });
                    setSearch('');
                  }}
                >
                  <Plus aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    {tooLong
                      ? `Prea lung: cel mult ${commuteMeansOtherMaxLength} de caractere`
                      : value.other
                        ? `Pune „${typed}” în locul lui „${value.other}”`
                        : `Adaugă „${typed}”`}
                  </span>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
