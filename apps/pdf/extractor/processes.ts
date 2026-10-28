import { spawn } from 'node:child_process';

export type Refusal =
  'too_large' | 'unsupported' | 'corrupt' | 'password_protected' | 'timeout' | 'page_out_of_range';

export class Refused extends Error {
  readonly reason: Refusal;
  readonly detail: string;
  constructor(reason: Refusal, detail = '') {
    super(reason);
    this.reason = reason;
    this.detail = detail;
  }
}

export class Busy extends Error {}
export class Abandoned extends Error {}

export type Run = { code: number | null; stdout: Buffer; stderr: string };

export type RunOptions = {
  timeoutMs: number;
  signal: AbortSignal;
  env?: NodeJS.ProcessEnv;
};

export function run(command: string, args: string[], options: RunOptions): Promise<Run> {
  const { timeoutMs, signal, env } = options;
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Abandoned());
    // Its own process group, so a kill also stops what it started: soffice runs soffice.bin.
    const child = spawn(command, args, { detached: true, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    let stderr = '';
    let stopped: Error | undefined;
    const stop = (reason: Error) => {
      if (stopped) return;
      stopped = reason;
      try {
        process.kill(-child.pid!, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    };
    const timer = setTimeout(
      () => stop(new Refused('timeout', `${command} ran past ${timeoutMs} ms`)),
      timeoutMs
    );
    const abandon = () => stop(new Abandoned());
    signal.addEventListener('abort', abandon, { once: true });
    const settle = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abandon);
    };
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 4000) stderr += chunk.toString();
    });
    child.on('error', (error) => {
      settle();
      reject(error);
    });
    child.on('close', (code) => {
      settle();
      if (stopped) reject(stopped);
      else resolve({ code, stdout: Buffer.concat(stdout), stderr });
    });
  });
}

export type Gate = <T>(signal: AbortSignal, work: () => Promise<T>) => Promise<T>;

// A request turned away is retried by the import's queue, which beats waiting past the Worker's
// three minutes, after which nobody reads the answer.
export function gate(slots: number, waitingLimit: number): Gate {
  let running = 0;
  const waiting: (() => void)[] = [];
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else running--;
  };
  return async (signal, work) => {
    if (signal.aborted) throw new Abandoned();
    if (running < slots) running++;
    else {
      if (waiting.length >= waitingLimit) throw new Busy();
      await new Promise<void>((resolve, reject) => {
        const start = () => {
          signal.removeEventListener('abort', leave);
          resolve();
        };
        const leave = () => {
          waiting.splice(waiting.indexOf(start), 1);
          reject(new Abandoned());
        };
        waiting.push(start);
        signal.addEventListener('abort', leave, { once: true });
      });
    }
    try {
      return await work();
    } finally {
      release();
    }
  };
}
