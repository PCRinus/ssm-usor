import { Button } from '@ssm-usor/ui/components/button';
import { Input } from '@ssm-usor/ui/components/input';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export const searchDebounceMs = 300;

export function SearchInput({
  value,
  onSearch,
  placeholder,
  label,
  testId,
  className,
}: {
  value: string | undefined;
  onSearch: (value: string) => void;
  placeholder: string;
  label: string;
  testId: string;
  className?: string;
}) {
  const committed = value ?? '';
  const [text, setText] = useState(committed);
  const [seen, setSeen] = useState(committed);
  // A search changed from outside, by back or a clear action, replaces the text; the one this
  // input sent does not, or the space typed after a word would vanish with the trim.
  if (committed !== seen) {
    setSeen(committed);
    if (committed !== text.trim()) setText(committed);
  }
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function commit(next: string) {
    clearTimeout(timer.current);
    if (next.trim() !== committed) onSearch(next.trim());
  }

  function change(next: string) {
    setText(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(next), searchDebounceMs);
  }

  function clear() {
    setText('');
    commit('');
  }

  return (
    <div className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        aria-label={label}
        data-testid={testId}
        placeholder={placeholder}
        value={text}
        maxLength={100}
        autoComplete="off"
        className="h-9 pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
        onChange={(event) => change(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit(text);
          if (event.key === 'Escape' && text) {
            event.preventDefault();
            clear();
          }
        }}
      />
      {text && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid={`${testId}-clear`}
          aria-label="Șterge căutarea"
          className="absolute top-0 right-0 size-9 text-muted-foreground hover:bg-transparent hover:text-foreground"
          onClick={clear}
        >
          <X aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
