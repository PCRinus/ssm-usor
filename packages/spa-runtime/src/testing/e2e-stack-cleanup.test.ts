import { describe, expect, it } from 'vitest';

import { removeTestOrganization, removeTestRun, type stackClient } from './e2e-stack';

type Answer = { data?: unknown; error: { message: string; status?: number } | null };

function fakeStack(
  answer: (call: string) => Answer | undefined = () => undefined,
  emails: Record<string, string> = {}
) {
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
    auth: {
      admin: {
        listUsers: () =>
          settle('listUsers', {
            users: Object.entries(emails).map(([id, email]) => ({ id, email })),
          }),
        deleteUser: (id: string) => settle(`deleteUser ${id}`, null),
      },
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

describe('removeTestRun', () => {
  const isOfRun = (email: string | undefined) => email?.endsWith('-r1@e2e.test') === true;
  const accounts = (calls: string[]) => calls.filter((call) => call.startsWith('deleteUser'));

  it('deletes the organizations, then the accounts it made and the ones with its suffix, once each', async () => {
    const { admin, calls } = fakeStack(undefined, {
      u1: 'ana-r1@e2e.test',
      u3: 'ion-r1@e2e.test',
      u4: 'dev@example.test',
    });
    const failures = await removeTestRun(admin, {
      organizations: ['o1'],
      users: ['u1', 'u2'],
      isOfRun,
    });
    expect(failures).toEqual([]);
    const listed = calls.indexOf('listUsers');
    expect(calls.slice(0, listed).map(simple).at(-1)).toBe('delete organizations');
    expect(calls.slice(listed)).toEqual([
      'listUsers',
      'deleteUser u1',
      'deleteUser u2',
      'deleteUser u3',
    ]);
  });

  it('collects every refusal and still removes the rest, but not an account already gone', async () => {
    const { admin, calls } = fakeStack((call) => {
      if (call.startsWith('delete organizations') && call.includes('o1')) {
        return { error: { message: 'still referenced' } };
      }
      if (call === 'listUsers') return { data: null, error: { message: 'offline' } };
      if (call === 'deleteUser u1') return { error: { message: 'gone', status: 404 } };
      if (call === 'deleteUser u2') return { error: { message: 'restricted', status: 500 } };
      return undefined;
    });
    const failures = await removeTestRun(admin, {
      organizations: ['o1', 'o2'],
      users: ['u1', 'u2'],
      isOfRun,
    });
    expect(failures).toEqual([
      'organization o1, organizations: still referenced',
      'listing the accounts: offline',
      'account u2: restricted',
    ]);
    expect(calls.filter((call) => call.startsWith('delete organizations'))).toHaveLength(2);
    expect(accounts(calls)).toEqual(['deleteUser u1', 'deleteUser u2']);
  });
});
