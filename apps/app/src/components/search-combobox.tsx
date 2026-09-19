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
import { type ReactNode, useState } from 'react';

export interface ComboboxItem {
  value: string;
  label: string;
  description?: string;
  // Text the filter sees; defaults to "<value> <label> <description>".
  search?: string;
}

// The filter receives each item's search text and the query and returns a rank (0 hides the
// item).
export function SearchCombobox({
  id,
  testId,
  items,
  value,
  onChange,
  onBlur,
  filter,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  clearLabel,
  unknownValue,
  renderUnknown,
  disabled,
  invalid,
  describedBy,
}: {
  id: string;
  testId: string;
  items: readonly ComboboxItem[];
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  filter: (itemValue: string, search: string) => number;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  clearLabel: string;
  // Lets a query that matches no item be used as the value, for example a code
  // outside the list. Returns the candidate value or null.
  unknownValue?: (search: string) => string | null;
  renderUnknown?: (candidate: string) => ReactNode;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = items.find((item) => item.value === value);
  const candidate = unknownValue?.(search) ?? null;

  function choose(next: string) {
    onChange(next);
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
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          data-testid={testId}
          disabled={disabled}
          className={cn(
            // Same surface as Input; hover only strengthens the border.
            'flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-[color,box-shadow,border-color] outline-none hover:border-ring/60 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
            'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
            !value && 'text-muted-foreground'
          )}
        >
          {value ? (
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 font-medium tabular-nums">{selected?.label ?? value}</span>
              {(selected ? selected.description : renderUnknown?.(value)) && (
                <span className="truncate text-muted-foreground">
                  {selected ? selected.description : renderUnknown?.(value)}
                </span>
              )}
            </span>
          ) : (
            <span className="truncate">{placeholder}</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command filter={filter}>
          <CommandInput
            data-testid={`${testId}-search`}
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-72">
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem
                  value="   șterge"
                  onSelect={() => choose('')}
                  className="text-muted-foreground"
                >
                  <X aria-hidden="true" />
                  {clearLabel}
                </CommandItem>
              )}
              {candidate && (
                <CommandItem value={candidate} onSelect={() => choose(candidate)}>
                  <span className="font-medium">
                    Folosește „<span className="tabular-nums">{candidate}</span>”
                  </span>
                  <span className="text-muted-foreground">{renderUnknown?.(candidate)}</span>
                </CommandItem>
              )}
              {items.map((item) => (
                <CommandItem
                  key={item.value}
                  value={item.search ?? `${item.value} ${item.label} ${item.description ?? ''}`}
                  onSelect={() => choose(item.value)}
                >
                  <span className="shrink-0 font-medium tabular-nums">{item.label}</span>
                  {item.description && (
                    <span className="min-w-0 flex-1 leading-snug">{item.description}</span>
                  )}
                  <Check
                    className={cn(
                      'ml-auto size-4 shrink-0',
                      item.value === value ? '' : 'invisible'
                    )}
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
