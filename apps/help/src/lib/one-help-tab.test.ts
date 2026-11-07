import { helpTabName } from '@ssm-usor/help-topics/url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { keepOneHelpTab } from './one-help-tab';

const channels: BroadcastChannel[] = [];

function load(name: string) {
  const tab = { name, close: vi.fn() };
  const channel = keepOneHelpTab(tab);
  if (channel) channels.push(channel);
  return tab;
}

const delivered = () => new Promise((resolve) => setTimeout(resolve, 20));

afterEach(() => {
  for (const channel of channels.splice(0)) channel.close();
});

describe('keepOneHelpTab', () => {
  it('closes the older help tab when a newer one loads', async () => {
    const older = load(helpTabName);
    await delivered();
    const newer = load(helpTabName);
    await delivered();
    expect(older.close).toHaveBeenCalledOnce();
    expect(newer.close).not.toHaveBeenCalled();
  });

  it('leaves alone a tab the member opened themselves', async () => {
    const own = load('');
    load(helpTabName);
    await delivered();
    expect(own.close).not.toHaveBeenCalled();
  });

  it('closes nothing when a tab the member opened themselves loads', async () => {
    const help = load(helpTabName);
    await delivered();
    load('');
    await delivered();
    expect(help.close).not.toHaveBeenCalled();
  });
});
