import { describe, expect, it } from 'vitest';

import { Abandoned, Busy, gate, Refused, run } from './processes.ts';

const never = new AbortController().signal;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

describe('run', () => {
  it('returns what the command wrote and its exit code', async () => {
    const result = await run('sh', ['-c', 'printf hello; exit 3'], {
      timeoutMs: 5000,
      signal: never,
    });
    expect(result.code).toBe(3);
    expect(result.stdout.toString()).toBe('hello');
  });

  it('kills a command past its time as a timeout refusal', async () => {
    const error = await run('sleep', ['10'], { timeoutMs: 50, signal: never }).catch(
      (caught: unknown) => caught
    );
    expect(error).toBeInstanceOf(Refused);
    expect((error as Refused).reason).toBe('timeout');
  });

  it('kills a command once its request is abandoned', async () => {
    const abandoned = new AbortController();
    const started = Date.now();
    const running = run('sleep', ['10'], { timeoutMs: 20_000, signal: abandoned.signal });
    setTimeout(() => abandoned.abort(), 50);
    await expect(running).rejects.toBeInstanceOf(Abandoned);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe('gate', () => {
  it('runs as many as it has slots, queues a few and turns the rest away', async () => {
    const limited = gate(1, 1);
    const first = deferred();
    const order: string[] = [];
    const running = limited(never, async () => {
      order.push('first');
      await first.promise;
    });
    const queued = limited(never, async () => {
      order.push('second');
    });
    await expect(limited(never, async () => {})).rejects.toBeInstanceOf(Busy);
    expect(order).toEqual(['first']);
    first.resolve();
    await Promise.all([running, queued]);
    expect(order).toEqual(['first', 'second']);
    await limited(never, async () => order.push('third'));
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('drops a queued request once it is abandoned, freeing its place', async () => {
    const limited = gate(1, 1);
    const first = deferred();
    const running = limited(never, () => first.promise);
    const abandoned = new AbortController();
    let ran = false;
    const queued = limited(abandoned.signal, async () => {
      ran = true;
    });
    abandoned.abort();
    await expect(queued).rejects.toBeInstanceOf(Abandoned);
    const next = limited(never, async () => 'next');
    first.resolve();
    await running;
    expect(await next).toBe('next');
    expect(ran).toBe(false);
  });

  it('frees the slot when the work fails', async () => {
    const limited = gate(1, 0);
    await expect(limited(never, () => Promise.reject(new Error('broke')))).rejects.toThrow('broke');
    expect(await limited(never, async () => 'after')).toBe('after');
  });
});
