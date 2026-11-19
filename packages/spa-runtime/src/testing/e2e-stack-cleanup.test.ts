import { describe, expect, it } from 'vitest';

import { removeTestOrganization, type stackClient } from './e2e-stack';

type Answer = { data?: unknown; error: { message: string } | null };

function fakeStack(answer: (call: string) => Answer | undefined = () => undefined) {
  const calls: string[] = [];
  const settle = (call: string, fallback: unknown) => {
    calls.push(call);
    return Promise.resolve(answer(call) ?? { data: fallback, error: null });
  };
  const query = (table: string) => {
    const chain = (call: string, fallback: unknown): unknown =>
      new Proxy(() => {}, {
        get: (_target, key) =>
          key === 'then'
            ? (resolve: (value: Answer) => unknown, reject: (cause: unknown) => unknown) =>
                settle(call, fallback).then(resolve, reject)
            : (...args: unknown[]) => chain(`${call}.${String(key)}(${args.join(',')})`, fallback),
      });
    return {
      select: () =>
        chain(`select ${table}`, table === 'clients' ? [{ id: 'c1' }, { id: 'c2' }] : []),
      update: () => chain(`update ${table}`, null),
      delete: () => chain(`delete ${table}`, null),
    };
  };
  const admin = {
    from: query,
    rpc: (name: string, args: { p_client_id: string }) =>
      settle(`rpc ${name} ${args.p_client_id}`, [
        { bucket: 'documents', path: `o1/${args.p_client_id}/a.docx` },
        { bucket: 'client-files', path: `o1/${args.p_client_id}/b.pdf` },
      ]),
    storage: {
      from: (bucket: string) => ({
        list: (folder: string) => settle(`list ${bucket} ${folder}`, []),
        remove: (paths: string[]) => settle(`remove ${bucket} ${paths.join(' ')}`, []),
      }),
    },
  };
  return { admin: admin as unknown as ReturnType<typeof stackClient>, calls };
}

const simple = (call: string) => call.replace(/\.(eq|is|in)\([^)]*\)/g, '');

describe('removeTestOrganization', () => {
  it('deletes each client as an archived one, then the organization’s own rows, then it', async () => {
    const { admin, calls } = fakeStack();
    await removeTestOrganization(admin, 'o1');
    expect(calls.map(simple)).toEqual([
      'select clients',
      'update clients',
      'rpc delete_archived_client c1',
      'remove documents o1/c1/a.docx',
      'remove client-files o1/c1/b.pdf',
      'update clients',
      'rpc delete_archived_client c2',
      'remove documents o1/c2/a.docx',
      'remove client-files o1/c2/b.pdf',
      'delete regeneration_jobs',
      'delete imports',
      'list imports o1',
      'list import-copies o1',
      'delete import_copies',
      'delete test_question_hides',
      'delete test_questions',
      'delete evaluation_profiles',
      'delete instruction_modules',
      'delete organizations',
    ]);
    expect(calls[1]).toContain('.is(archived_at,)');
  });

  it('stops at the first refusal and names it', async () => {
    const { admin, calls } = fakeStack((call) =>
      call.startsWith('rpc delete_archived_client c2')
        ? { error: { message: 'still referenced' } }
        : undefined
    );
    await expect(removeTestOrganization(admin, 'o1')).rejects.toThrow(
      'deleting client c2: still referenced'
    );
    expect(calls.some((call) => call.startsWith('delete organizations'))).toBe(false);
  });
});
