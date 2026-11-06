import type { ReactNode } from 'react';

import { type InlineNode, parseInlineMarkdown } from './parse-inline-markdown';

function render(nodes: InlineNode[]): ReactNode[] {
  return nodes.map((node, index) => {
    if (typeof node === 'string') return node;
    if (node.mark === 'code') {
      return (
        <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
          {node.text}
        </code>
      );
    }
    const Mark = node.mark;
    return <Mark key={index}>{render(node.children)}</Mark>;
  });
}

export function InlineMarkdown({ text }: { text: string }) {
  return <>{render(parseInlineMarkdown(text))}</>;
}
