import { createClient } from '@supabase/supabase-js';

export const e2ePassword = 'Parola-e2e-1';

// Turnstile's dummy token, the only one the local stack's test secret accepts
// (supabase/config.toml).
export const captchaToken = 'XXXX.DUMMY.TOKEN.XXXX';

export const stackClient = (url: string, key: string) =>
  createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// One run never collides with another, or with what a developer has in their local stack.
// Workers start in the same millisecond, so the worker's index is part of it, and `tag` keeps
// the app's flows and the portal's apart.
export function runAddresses(tag: string, workerIndex = '') {
  const run = `${Date.now().toString(36)}${tag}${workerIndex}`;
  const suffix = `-${run}@e2e.test`;
  return {
    run,
    addressOf: (name: string) => `${name}${suffix}`,
    isOfRun: (email: string | undefined) => email?.endsWith(suffix) === true,
  };
}

export interface MailboxEntry {
  kind: string;
  url: string;
}

// The in-memory mailbox of the e2e API: `url` is the link of an email that has one, and a
// description of what it carried for one that does not.
export async function mailbox(apiUrl: string, to: string, kind: string) {
  const url = new URL('/__e2e/emails', apiUrl);
  url.searchParams.set('to', to);
  const emails = (await (await fetch(url)).json()) as MailboxEntry[];
  return emails.filter((email) => email.kind === kind);
}

type StackClient = ReturnType<typeof stackClient>;

function refused(what: string, result: { error: { message: string } | null }) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
}

// Storage lists one level at a time, a folder as an entry without an id.
export async function storageFolder(
  admin: StackClient,
  bucket: string,
  folder: string
): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000, offset });
    if (error) throw new Error(`listing ${bucket}/${folder}: ${error.message}`);
    for (const entry of data) {
      const path = `${folder}/${entry.name}`;
      if (entry.id === null) paths.push(...(await storageFolder(admin, bucket, path)));
      else paths.push(path);
    }
    if (data.length < 1000) return paths;
  }
}

async function removeFiles(admin: StackClient, bucket: string, paths: string[]) {
  for (let start = 0; start < paths.length; start += 100) {
    const batch = paths.slice(start, start + 100);
    refused(`${bucket} files`, await admin.storage.from(bucket).remove(batch));
  }
}

async function removeRows(admin: StackClient, table: string, organizationId: string) {
  refused(table, await admin.from(table).delete().eq('organization_id', organizationId));
}

// Each client goes the way a member deletes an archived one: delete_archived_client is the one
// path that lifts the written-once triggers on signatures, test attempts and sheets, and it
// hands back the files it leaves. The organization's own rows go after its clients. Its
// accounts go only after it: a signature restricts the deletion of its signer.
export async function removeTestOrganization(admin: StackClient, organizationId: string) {
  const clients = await admin.from('clients').select('id').eq('organization_id', organizationId);
  refused('clients', clients);
  for (const { id: clientId } of clients.data as { id: string }[]) {
    const archived = await admin
      .from('clients')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', clientId)
      .is('archived_at', null);
    refused(`archiving client ${clientId}`, archived);
    const deleted = await admin.rpc('delete_archived_client', {
      p_organization_id: organizationId,
      p_client_id: clientId,
    });
    refused(`deleting client ${clientId}`, deleted);
    const objects = deleted.data as { bucket: string; path: string }[];
    for (const bucket of new Set(objects.map((object) => object.bucket))) {
      const paths = objects.filter((object) => object.bucket === bucket);
      await removeFiles(
        admin,
        bucket,
        paths.map((object) => object.path)
      );
    }
  }
  await removeRows(admin, 'regeneration_jobs', organizationId);
  // An import of a new client names no client until it is confirmed.
  await removeRows(admin, 'imports', organizationId);
  await removeFiles(admin, 'imports', await storageFolder(admin, 'imports', organizationId));
  const copies = await storageFolder(admin, 'import-copies', organizationId);
  await removeFiles(admin, 'import-copies', copies);
  await removeRows(admin, 'import_copies', organizationId);
  // The hides first: deleting an own question is refused while it would leave fewer than ten.
  await removeRows(admin, 'test_question_hides', organizationId);
  await removeRows(admin, 'test_questions', organizationId);
  await removeRows(admin, 'evaluation_profiles', organizationId);
  await removeRows(admin, 'instruction_modules', organizationId);
  refused('organizations', await admin.from('organizations').delete().eq('id', organizationId));
}

// Every refusal is collected rather than thrown, so one leftover does not leave the rest of the
// run behind with it.
export async function removeTestRun(
  admin: StackClient,
  run: { organizations: string[]; users: string[]; isOfRun: (email: string | undefined) => boolean }
): Promise<string[]> {
  const failures: string[] = [];
  for (const id of run.organizations) {
    await removeTestOrganization(admin, id).catch((cause: Error) =>
      failures.push(`organization ${id}, ${cause.message}`)
    );
  }
  // Accounts created through the UI are found by the run's address suffix.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) failures.push(`listing the accounts: ${error.message}`);
  const mine = (data?.users ?? []).filter((user) => run.isOfRun(user.email));
  for (const id of new Set([...run.users, ...mine.map((user) => user.id)])) {
    const removed = await admin.auth.admin.deleteUser(id);
    // A flow that deleted its account has done the work already.
    if (removed.error && removed.error.status !== 404) {
      failures.push(`account ${id}: ${removed.error.message}`);
    }
  }
  return failures;
}

export function refuseLeftovers(failures: string[]) {
  if (failures.length > 0) {
    throw new Error(`The clean-up left rows in the local stack:\n${failures.join('\n')}`);
  }
}
