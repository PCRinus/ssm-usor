import { type CaenClass, caenClasses, caenClassName } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@ssm-usor/ui/components/command';
import { Popover, PopoverContent, PopoverTrigger } from '@ssm-usor/ui/components/popover';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { useState } from 'react';

import { caenFilter } from './caen-filter';

const itemValue = (entry: CaenClass) => `${entry.code} ${entry.name}`;

export function CaenCombobox({
  id,
  value,
  onChange,
  onBlur,
  disabled,
  invalid,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (code: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selectedName = caenClassName(value);
  const unknownSearch = /^[0-9]{4}$/.test(search) && !caenClassName(search) ? search : null;

  function choose(code: string) {
    onChange(code);
    setOpen(false);
    setSearch('');
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSearch('');
          onBlur?.();
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          data-testid="client-caen"
          disabled={disabled}
          className={cn(
            'h-11 w-full min-w-0 justify-between overflow-hidden px-3 font-normal hover:bg-transparent',
            invalid && 'border-destructive ring-destructive/20',
            !value && 'text-muted-foreground'
          )}
        >
          {value ? (
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 font-medium tabular-nums">{value}</span>
              <span className="truncate text-muted-foreground">
                {selectedName ?? 'cod care nu apare în CAEN Rev. 3'}
              </span>
            </span>
          ) : (
            <span>Caută după cod sau activitate</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-80 p-0" align="start">
        <Command filter={caenFilter}>
          <CommandInput
            data-testid="client-caen-search"
            placeholder="Cod sau cuvinte din denumire"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-72">
            <CommandEmpty>Niciun cod CAEN nu se potrivește. Încearcă alte cuvinte.</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem
                  value="   șterge"
                  onSelect={() => choose('')}
                  className="text-muted-foreground"
                >
                  <X aria-hidden="true" />
                  Șterge codul selectat
                </CommandItem>
              )}
              {unknownSearch && (
                <CommandItem value={unknownSearch} onSelect={() => choose(unknownSearch)}>
                  <span className="font-medium tabular-nums">{unknownSearch}</span>
                  <span className="text-muted-foreground">
                    Folosește codul chiar dacă nu apare în CAEN Rev. 3
                  </span>
                </CommandItem>
              )}
              {caenClasses.map((entry) => (
                <CommandItem
                  key={entry.code}
                  value={itemValue(entry)}
                  onSelect={() => choose(entry.code)}
                >
                  <span className="w-11 shrink-0 font-medium tabular-nums">{entry.code}</span>
                  <span className="min-w-0 flex-1 leading-snug">{entry.name}</span>
                  <Check
                    className={cn('size-4 shrink-0', entry.code === value ? '' : 'invisible')}
                    aria-hidden="true"
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
