#!/usr/bin/env node
// PostToolUse hook for Write|Edit and Bash. CI diffs the help topics and database.types.ts
// against a fresh run and fails the pull request when either is stale. The types are only
// regenerated after `db reset`: the shared local database may carry another session's
// migrations, which `migration up` leaves in place and a reset removes. A reset also
// recreates storage.idx_objects_current_version without COLLATE "C", which makes every
// local Storage upload fail with 42P10; the index is rebuilt when it lacks it.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const { tool_name: tool, tool_input: toolInput = {}, tool_response: response = {} } = input;
const notes = [];

function run(command, args, timeout = 120_000) {
  return execFileSync(command, args, {
    cwd: projectDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout,
  });
}

function changed(path) {
  return run('git', ['status', '--porcelain', '--', path]).trim() !== '';
}

function regenerate(script, path) {
  try {
    run('pnpm', [script]);
    notes.push(
      changed(path)
        ? `\`pnpm ${script}\` ran and ${path} differs from the committed one; commit it with this change.`
        : `\`pnpm ${script}\` ran; ${path} is up to date.`
    );
  } catch (error) {
    const tail = String(error.stderr || error.stdout || error.message).trim().split('\n').slice(-8);
    notes.push(`\`pnpm ${script}\` failed, so ${path} is stale:\n${tail.join('\n')}`);
  }
}

if (tool === 'Write' || tool === 'Edit') {
  const file = relative(projectDir, toolInput.file_path ?? '');
  const isArticle = /^apps\/help\/src\/content\/docs\/.+\.mdx?$/.test(file);
  const touched = `${toolInput.old_string ?? ''}\n${toolInput.new_string ?? ''}`;
  const shapesTopics = /^#{1,6}\s|^topics:|^\s*-?\s*(id|heading):/m.test(touched);
  if (isArticle && (tool === 'Write' || shapesTopics)) {
    regenerate('generate:help-topics', 'packages/help-topics/src/topics.ts');
  }
} else if (tool === 'Bash' && response.is_error !== true) {
  const command = toolInput.command ?? '';
  const runs = (subcommand) =>
    new RegExp(
      `(^|[;&|(])\\s*(\\w+=\\S*\\s+)*(pnpm\\s+(exec\\s+)?|npx\\s+)?supabase\\s+${subcommand}\\b`
    ).test(command);
  const resets = runs('db\\s+reset');
  const migrates = runs('migration\\s+up');
  if ((resets || migrates) && !/--(linked|db-url)\b/.test(command)) {
    if (resets) {
      const config = readFileSync(join(projectDir, 'supabase/config.toml'), 'utf8');
      const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
      const container = `supabase_db_${projectId}`;
      try {
        const psql = (...statements) =>
          run('docker', [
            'exec', container, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-tA',
            ...statements.flatMap((statement) => ['-c', statement]),
          ]);
        const definition = psql(
          "select indexdef from pg_indexes where schemaname = 'storage' and indexname = 'idx_objects_current_version'"
        );
        if (definition.trim() !== '' && !definition.includes('COLLATE "C"')) {
          psql(
            'drop index storage.idx_objects_current_version',
            'create unique index idx_objects_current_version on storage.objects (bucket_id, name collate "C") where archived_at is null'
          );
          notes.push(
            'Rebuilt storage.idx_objects_current_version with COLLATE "C" so local Storage uploads work; run `pnpm templates:register:local` before document flows.'
          );
        }
      } catch (error) {
        notes.push(`Could not check the Storage index: ${String(error.message).split('\n')[0]}`);
      }
    }
    if (!resets) {
      notes.push(
        'database.types.ts was not regenerated: the shared local database may hold another session\'s migrations. Run `supabase db reset`, then `pnpm generate:db`, to get the types CI expects.'
      );
    } else if (existsSync(join(projectDir, 'apps/api/src/database.types.ts'))) {
      regenerate('generate:db', 'apps/api/src/database.types.ts');
    }
  }
}

if (notes.length > 0) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: notes.join('\n') },
    })
  );
}
