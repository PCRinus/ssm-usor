import { Button } from '@ssm-usor/ui/components/button';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import { Input } from '@ssm-usor/ui/components/input';
import { Search } from 'lucide-react';
import { useState } from 'react';

import { normalizeSearch } from '@/lib/normalize-search';

export interface AttendeeOption {
  id: string;
  name: string;
  detail?: string;
}

export function AttendeeChecklist({
  id,
  options,
  value,
  onChange,
  disabled,
  invalid,
  describedBy,
}: {
  id: string;
  options: AttendeeOption[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [search, setSearch] = useState('');
  const terms = normalizeSearch(search).split(/\s+/).filter(Boolean);
  const visible = options.filter((option) => {
    const text = normalizeSearch(`${option.name} ${option.detail ?? ''}`);
    return terms.every((term) => text.includes(term));
  });
  const chosen = new Set(value);
  const visibleIds = new Set(visible.map((option) => option.id));

  return (
    <div
      id={id}
      role="group"
      aria-invalid={invalid}
      aria-describedby={describedBy}
      tabIndex={-1}
      className="grid gap-2 rounded-md border p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Caută după nume"
            aria-label="Caută printre angajați"
            data-testid="training-attendees-search"
            className="h-9 pl-8"
            disabled={disabled}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="training-attendees-all"
          disabled={disabled || visible.length === 0}
          onClick={() => onChange([...new Set([...value, ...visibleIds])])}
        >
          Toți
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="training-attendees-none"
          disabled={disabled || value.length === 0}
          onClick={() => onChange(value.filter((attendee) => !visibleIds.has(attendee)))}
        >
          Niciunul
        </Button>
      </div>
      <p className="text-xs text-muted-foreground" data-testid="training-attendees-count">
        {value.length === 1 ? '1 participant ales' : `${value.length} participanți aleși`} din{' '}
        {options.length}
      </p>
      {visible.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted-foreground">
          Niciun angajat nu corespunde căutării.
        </p>
      ) : (
        <ul className="grid max-h-56 gap-0.5 overflow-y-auto">
          {visible.map((option) => {
            const checkboxId = `${id}-${option.id}`;
            return (
              <li key={option.id} className="flex items-center gap-3 rounded-sm px-1 py-1.5">
                <Checkbox
                  id={checkboxId}
                  data-testid="training-attendee"
                  checked={chosen.has(option.id)}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onChange(
                      checked === true
                        ? [...value, option.id]
                        : value.filter((attendee) => attendee !== option.id)
                    )
                  }
                />
                <label htmlFor={checkboxId} className="min-w-0 text-sm">
                  <span className="font-medium">{option.name}</span>
                  {option.detail && (
                    <span className="ml-2 text-xs text-muted-foreground">{option.detail}</span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
