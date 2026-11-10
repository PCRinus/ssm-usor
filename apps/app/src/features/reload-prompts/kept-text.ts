import { z } from 'zod';

const storageKey = 'ssm-usor.kept-text';
export const keptTextLifetime = 15 * 60_000;
const restoreWindow = 10_000;
// A form that resets from loaded data just after the text came back would wipe it.
const guardAfterRestore = 3_000;
const pollInterval = 150;

const keptFieldSchema = z.object({
  by: z.enum(['name', 'id']),
  key: z.string(),
  // What the field held before the person typed: text goes back only into a field that holds
  // it again, so a field that now shows something else is left alone.
  before: z.string(),
  value: z.string(),
});

const snapshotSchema = z.object({
  page: z.string(),
  savedAt: z.number(),
  fields: z.array(keptFieldSchema),
});

type KeptField = z.infer<typeof keptFieldSchema>;
type Snapshot = z.infer<typeof snapshotSchema>;

const typed = new WeakMap<HTMLTextAreaElement, string>();
const focusValues = new WeakMap<HTMLTextAreaElement, string>();
let filling = false;

// Only long text is kept: it is what hurts to retype, and a short field may hold a CNP, a
// phone number or an email address that has no business in the browser's storage.
function asTextField(target: EventTarget | null): HTMLTextAreaElement | null {
  return target instanceof HTMLTextAreaElement ? target : null;
}

function rememberBefore(field: HTMLTextAreaElement, before: string) {
  if (!typed.has(field)) typed.set(field, before);
}

export function trackTypedText(root: Document = document) {
  const onFocus = (event: Event) => {
    const field = asTextField(event.target);
    if (field && !typed.has(field)) focusValues.set(field, field.value);
  };
  const onBeforeInput = (event: Event) => {
    const field = asTextField(event.target);
    if (field && !filling) rememberBefore(field, field.value);
  };
  const onInput = (event: Event) => {
    const field = asTextField(event.target);
    if (field && !filling) rememberBefore(field, focusValues.get(field) ?? '');
  };
  root.addEventListener('focusin', onFocus, true);
  root.addEventListener('beforeinput', onBeforeInput, true);
  root.addEventListener('input', onInput, true);
  return () => {
    root.removeEventListener('focusin', onFocus, true);
    root.removeEventListener('beforeinput', onBeforeInput, true);
    root.removeEventListener('input', onInput, true);
  };
}

// React's useId ids change with the order components mount, so they name no field for long.
const generatedId = /[«»:]|^_r_/u;

function identify(field: HTMLTextAreaElement): Pick<KeptField, 'by' | 'key'> | null {
  if (field.name) return { by: 'name', key: field.name };
  if (field.id && !generatedId.test(field.id)) return { by: 'id', key: field.id };
  return null;
}

function eligible(field: HTMLTextAreaElement) {
  if (!field.isConnected || field.disabled || field.readOnly) return false;
  // A dialog that is open now is closed after the reload, so its fields have nowhere to go.
  return !field.closest('[data-no-keep], [hidden], [inert], [role="dialog"], [role="alertdialog"]');
}

function lookUp({ by, key }: KeptField): HTMLTextAreaElement | null {
  const found =
    by === 'name'
      ? [...document.querySelectorAll(`[name="${CSS.escape(key)}"]`)]
      : [document.getElementById(key)].filter((element) => element !== null);
  if (found.length !== 1) return null;
  const field = asTextField(found[0]!);
  return field && eligible(field) ? field : null;
}

function readSnapshot(now = Date.now()): Snapshot | null {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = snapshotSchema.safeParse(JSON.parse(raw));
    if (parsed.success && now - parsed.data.savedAt < keptTextLifetime) return parsed.data;
    sessionStorage.removeItem(storageKey);
  } catch {
    // Unreadable or blocked storage keeps nothing.
  }
  return null;
}

function dropSnapshot(savedAt: number) {
  try {
    if (readSnapshot()?.savedAt === savedAt) sessionStorage.removeItem(storageKey);
  } catch {
    // Blocked storage holds no snapshot.
  }
}

export function keptFieldNames(page: string): ReadonlySet<string> {
  const snapshot = readSnapshot();
  if (snapshot?.page !== page) return new Set();
  return new Set(snapshot.fields.filter(({ by }) => by === 'name').map(({ key }) => key));
}

// Answers whether any text is kept, so the dialog promises only what it keeps.
export function snapshotTypedText(page: string, now = Date.now()): boolean {
  const fields: KeptField[] = [];
  const seen = new Set<string>();
  for (const element of document.querySelectorAll('textarea')) {
    const field = asTextField(element);
    if (!field || !eligible(field)) continue;
    const before = typed.get(field);
    if (before === undefined || field.value === before) continue;
    const id = identify(field);
    if (!id || seen.has(`${id.by}:${id.key}`)) continue;
    seen.add(`${id.by}:${id.key}`);
    const kept: KeptField = { ...id, before, value: field.value };
    if (lookUp(kept) === field) fields.push(kept);
  }
  // A dialog that opens again before the last text came back keeps that text too.
  const earlier = readSnapshot(now);
  const merged =
    earlier?.page === page
      ? [...earlier.fields.filter((old) => !seen.has(`${old.by}:${old.key}`)), ...fields]
      : fields;
  if (merged.length === 0) return false;
  try {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({ page, savedAt: now, fields: merged } satisfies Snapshot)
    );
    return true;
  } catch {
    // Full or blocked storage: the text is not kept, the dialog still opens.
    return false;
  }
}

// React tracks a controlled field's value through the element's own setter, so a value set
// with a plain assignment never reaches onChange.
function fill(field: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  filling = true;
  try {
    setter?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  } finally {
    filling = false;
  }
}

export interface RestoreOptions {
  page: () => string;
  onFirstRestore: () => void;
  onRestored: (count: number) => void;
  now?: () => number;
}

// Fields appear once their queries load, and some forms reset from that data after they
// mount, so the text is put back as fields appear and again if a reset takes it away.
export function restoreTypedText({
  page,
  onFirstRestore,
  onRestored,
  now = Date.now,
}: RestoreOptions) {
  const snapshot = readSnapshot(now());
  if (!snapshot) return () => {};
  // The first page shown after the reload is the only chance: text left for a page the person
  // was sent away from must not fill that form on a later visit.
  if (snapshot.page !== page()) {
    dropSnapshot(snapshot.savedAt);
    return () => {};
  }

  const started = now();
  const restored = new Map<KeptField, HTMLTextAreaElement>();
  const userOwned = new WeakSet<HTMLTextAreaElement>();
  let lastRestore = 0;
  let announced = false;
  let finished = false;

  const onUserInput = (event: Event) => {
    const field = asTextField(event.target);
    if (field && !filling) userOwned.add(field);
  };
  document.addEventListener('input', onUserInput, true);

  function pass() {
    if (finished) return;
    const time = now();
    const deadline = Math.max(started + restoreWindow, lastRestore + guardAfterRestore);
    if (time >= deadline || page() !== snapshot!.page) return finish();
    for (const kept of snapshot!.fields) {
      const known = restored.get(kept);
      if (known) {
        if (known.isConnected && !userOwned.has(known) && known.value === kept.before) {
          fill(known, kept.value);
        }
        continue;
      }
      const field = lookUp(kept);
      if (!field || userOwned.has(field) || field.value !== kept.before) continue;
      fill(field, kept.value);
      typed.set(field, kept.before);
      restored.set(kept, field);
      lastRestore = time;
    }
    if (restored.size > 0 && !announced) {
      announced = true;
      onFirstRestore();
    }
  }

  function finish() {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    observer.disconnect();
    document.removeEventListener('input', onUserInput, true);
    dropSnapshot(snapshot!.savedAt);
    if (restored.size > 0) onRestored(restored.size);
  }

  const observer = new MutationObserver(pass);
  observer.observe(document.body, { childList: true, subtree: true });
  const timer = setInterval(pass, pollInterval);
  pass();

  return () => {
    if (restored.size > 0) return finish();
    if (finished) return;
    finished = true;
    clearInterval(timer);
    observer.disconnect();
    document.removeEventListener('input', onUserInput, true);
  };
}
