import { guidedTemplates } from '@ssm-usor/contracts';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { articleBlock, headingBlock } from './instruction-draft';
import { useInstructionBody } from './use-instruction-body';

const noClients: never[] = [];
const empty = 'Scrie cel puțin un articol.';

describe('useInstructionBody', () => {
  it('counts a template heading alone as no text of the person', () => {
    const section = guidedTemplates.work_activity[0]!;
    const { result } = renderHook(() =>
      useInstructionBody({
        initialBlocks: [headingBlock(section.heading, section), articleBlock()],
        clients: noClients,
      })
    );
    expect(result.current.hasText).toBe(false);
    expect(result.current.articleCount).toBe(0);
    expect(result.current.problem(empty)).toBe(empty);
  });

  it('counts a heading the person wrote as text', () => {
    const { result } = renderHook(() =>
      useInstructionBody({ initialBlocks: [headingBlock('Reguli proprii')], clients: noClients })
    );
    expect(result.current.hasText).toBe(true);
  });

  it('appends pasted articles after dropping the empty ones, or replaces everything', () => {
    const { result } = renderHook(() =>
      useInstructionBody({
        initialBlocks: [articleBlock('Primul articol.'), articleBlock()],
        clients: noClients,
      })
    );
    act(() => result.current.addPasted([articleBlock('Al doilea articol.')], 'append'));
    expect(result.current.blocks.map((block) => block.text)).toEqual([
      'Primul articol.',
      'Al doilea articol.',
    ]);
    expect(result.current.articleCount).toBe(2);
    expect(result.current.problem(empty)).toBeNull();

    act(() => result.current.addPasted([articleBlock('Doar acesta.')], 'replace'));
    expect(result.current.blocks.map((block) => block.text)).toEqual(['Doar acesta.']);
  });

  it('names each client the text mentions once, and marks the blocks that mention them', () => {
    const clients = [
      { id: 'one', legalName: 'OMV PETROM SA' },
      { id: 'two', legalName: 'DEDEMAN SRL' },
    ];
    const first = articleBlock('Lucrătorii OMV Petrom poartă cască.');
    const second = articleBlock('La OMV PETROM SA se lucrează în schimburi.');
    const { result } = renderHook(() =>
      useInstructionBody({ initialBlocks: [first, second], clients })
    );
    expect(result.current.named.map((client) => client.id)).toEqual(['one']);
    expect([...result.current.namedClients.keys()]).toEqual([first.id, second.id]);
  });
});
