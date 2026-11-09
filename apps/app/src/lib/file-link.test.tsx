import { type FileLink, useFileLink } from '@ssm-usor/api-http/file-link';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FileLinkButton } from '@/components/file-link-button';

const queryKey = ['test-file-link'];
const oldLink: FileLink = {
  url: 'https://files.example.test/v1.pdf',
  fileName: 'Fișa semnată.pdf',
  expiresInSeconds: 600,
};
const newLink = { ...oldLink, url: 'https://files.example.test/v2.pdf' };
const clients: QueryClient[] = [];

function mount(load: (signal: AbortSignal) => Promise<FileLink>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  client.setQueryData(queryKey, oldLink);
  function Download() {
    const link = useFileLink({
      queryKey,
      load,
      apiRequest: { baseUrl: 'https://api.example.test' },
      disposition: 'inline',
    });
    return <FileLinkButton link={link}>Deschide PDF</FileLinkButton>;
  }
  render(
    <QueryClientProvider client={client}>
      <Download />
    </QueryClientProvider>
  );
  return client;
}

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('prepared file links', () => {
  it('keeps the page on a failed stale-link renewal and offers a retry', async () => {
    const load = vi
      .fn<(signal: AbortSignal) => Promise<FileLink>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(newLink);
    const open = vi.spyOn(window, 'open').mockReturnValue(window);
    mount(load);
    expect(screen.getByRole('link').getAttribute('href')).toContain('v1.pdf');
    vi.setSystemTime(Date.now() + 601_000);

    await userEvent.click(screen.getByRole('link'));

    const retry = await screen.findByRole('button', { name: 'Deschide PDF' });
    expect(retry.title).toContain('încerci din nou');
    expect(open).not.toHaveBeenCalled();
    expect(screen.queryByRole('link')).toBeNull();
    await userEvent.click(retry);
    await waitFor(() => expect(screen.getByRole('link').getAttribute('href')).toContain('v2.pdf'));
  });

  it('opens only the renewed URL after a stale click succeeds', async () => {
    const load = vi.fn<(signal: AbortSignal) => Promise<FileLink>>().mockResolvedValue(newLink);
    const open = vi.spyOn(window, 'open').mockReturnValue(window);
    mount(load);
    vi.setSystemTime(Date.now() + 601_000);

    await userEvent.click(screen.getByRole('link'));

    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    const address = new URL(open.mock.calls[0]![0]!.toString());
    expect(address.searchParams.get('source')).toBe(newLink.url);
  });

  it('withholds the previous version while an invalidated link refreshes', async () => {
    let complete!: (link: FileLink) => void;
    const load = () =>
      new Promise<FileLink>((resolve) => {
        complete = resolve;
      });
    const client = mount(load);

    await act(async () => {
      void client.invalidateQueries({ queryKey });
    });

    await waitFor(() => expect(screen.queryByRole('link')).toBeNull());
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
    await act(async () => complete(newLink));
    await waitFor(() => expect(screen.getByRole('link').getAttribute('href')).toContain('v2.pdf'));
  });
});
