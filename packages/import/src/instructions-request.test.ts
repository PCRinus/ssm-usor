import { describe, expect, it } from 'vitest';

import {
  instructionsAnswer,
  instructionsCharacters,
  instructionsRequest,
  InstructionsTooLargeError,
} from './instructions-request';

const input = {
  domain: 'ssm' as const,
  instructions: [{ path: 'SSM/3.2._IPSSM.docx', text: 'Art. 1. Text.' }],
  themes: [{ path: 'SSM/4.2._Tematica.doc', text: 'FUNCTIA : BRUTAR' }],
  posts: ['Brutar', 'Vânzător'],
};

describe('instructionsRequest', () => {
  it('asks GPT-6.1 Terra with the files before the task, and the posts in the task', () => {
    const request = instructionsRequest(input);

    expect(request.model).toBe('gpt-6.1-terra');
    expect(request.maxCompletionTokens).toBe(16_000);
    expect(request.messages.map((message) => message.role)).toEqual(['system', 'user', 'system']);
    expect(request.messages[1]!.content).toBe(
      '=== FILE: SSM/3.2._IPSSM.docx ===\nArt. 1. Text.\n\n=== FILE: SSM/4.2._Tematica.doc ===\nFUNCTIA : BRUTAR'
    );
    const task = request.messages[2]!.content as string;
    expect(task).toContain('IPSSM');
    expect(task).toContain('- Brutar\n- Vânzător');
    expect(task).toContain('work_equipment');
  });

  it('writes the fire-safety task for the PSI domain', () => {
    const task = instructionsRequest({ ...input, domain: 'su' }).messages[2]!.content as string;

    expect(task).toContain('IPSU');
    expect(task).toContain('premises_activity');
    expect(task).not.toContain('work_equipment');
  });

  it('refuses files and themes above the cap, with their size', () => {
    const large = {
      ...input,
      themes: [{ path: 'Mare.doc', text: 'a'.repeat(instructionsCharacters) }],
    };

    expect(() => instructionsRequest(large)).toThrow(
      new InstructionsTooLargeError(instructionsCharacters + 'Art. 1. Text.'.length)
    );
  });
});

describe('instructionsAnswer', () => {
  it('holds only the categories of its domain, with no nullable member', () => {
    const schema = JSON.stringify(instructionsAnswer('su').jsonSchema);

    expect(schema).toContain('hazardous_work');
    expect(schema).not.toContain('work_activity');
    expect(schema).not.toContain('null');
  });

  it('reads an answer', () => {
    const answer = {
      instructions: [
        {
          file: 'SSM/3.2._IPSSM.docx',
          number: 'XIII.I',
          title: 'Instrucțiuni proprii privind utilizarea feliatorului',
          category: 'work_equipment',
          startWords: 'Subcapitolul XIII.I.',
          endWords: 'se oprește.',
        },
      ],
      positions: [
        {
          post: 'BRUTAR',
          variant: '',
          clientPost: 'Brutar',
          section: 'workplace',
          citation: 'IPSSM Art. 1 – 20',
          file: 'SSM/4.2._Tematica.doc',
          quote: 'FUNCTIA : BRUTAR … IPSSM Art. 1 – 20',
        },
      ],
    };

    expect(instructionsAnswer('ssm').parse(answer)).toEqual(answer);
    expect(() =>
      instructionsAnswer('ssm').parse({
        ...answer,
        instructions: [{ ...answer.instructions[0], category: 'hazardous_work' }],
      })
    ).toThrow();
  });
});
