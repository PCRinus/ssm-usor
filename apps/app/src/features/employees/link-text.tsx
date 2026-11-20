import { ChevronRight } from 'lucide-react';

// The last word stays with the chevron, so a wrapped name never leaves it alone on a line.
export function LinkText({ children }: { children: string }) {
  const text = children.trim();
  const split = text.lastIndexOf(' ') + 1;
  return (
    <>
      {text.slice(0, split)}
      <span className="whitespace-nowrap">
        {text.slice(split)}
        <ChevronRight
          aria-hidden="true"
          className="ml-0.5 inline size-3.5 align-[-2px] text-section-tab-foreground"
        />
      </span>
    </>
  );
}
