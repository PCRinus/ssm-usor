export const legislationLabel = {
  name: 'legislation',
  color: '0e8a16',
  description: 'A change of a watched act that the templates quote or refer to (ADR 017)',
};

export interface Found {
  kind: 'pull' | 'issue';
  number: number;
  url: string;
  state: 'open' | 'closed' | 'merged';
}

export interface GitHub {
  pullForBranch(branch: string): Promise<Found | null>;
  /** The labelled pull requests and issues whose body holds the marker, newest first. */
  answersByMarker(marker: string): Promise<Found[]>;
  ensureLabel(): Promise<void>;
  openPull(input: { title: string; branch: string; base: string; body: string }): Promise<Found>;
  openIssue(input: { title: string; body: string }): Promise<Found>;
}

export interface GitHubOptions {
  repository: string;
  // Reads, issues and the label: the workflow's own token is enough for these.
  token: string;
  // The pull request: one opened with the workflow's own token starts no CI.
  appToken?: string;
  fetcher?: typeof fetch;
}

export function createGitHub({
  repository,
  token,
  appToken,
  fetcher = fetch,
}: GitHubOptions): GitHub {
  const [owner] = repository.split('/');
  async function call<T>(
    path: string,
    {
      method = 'GET',
      body,
      as = token,
      missing = false,
    }: { method?: string; body?: unknown; as?: string; missing?: boolean } = {}
  ): Promise<{ status: number; data: T }> {
    const response = await fetcher(`https://api.github.com/repos/${repository}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${as}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ssm-usor-legislation-fix',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 404 && missing) return { status: 404, data: null as T };
    if (!response.ok) {
      const text = (await response.text()).slice(0, 300);
      throw new Error(`GitHub answered ${response.status} to ${method} ${path}: ${text}`);
    }
    return { status: response.status, data: (await response.json()) as T };
  }
  type Item = {
    number: number;
    html_url: string;
    state: string;
    body: string | null;
    merged_at?: string | null;
    pull_request?: { merged_at?: string | null };
  };
  const found = (item: Item, kind: Found['kind']): Found => ({
    kind,
    number: item.number,
    url: item.html_url,
    state:
      (item.merged_at ?? item.pull_request?.merged_at)
        ? 'merged'
        : item.state === 'open'
          ? 'open'
          : 'closed',
  });

  return {
    async pullForBranch(branch) {
      const { data } = await call<Item[]>(
        `/pulls?head=${encodeURIComponent(`${owner}:${branch}`)}&state=all&per_page=1`
      );
      return data[0] ? found(data[0], 'pull') : null;
    },
    async answersByMarker(marker) {
      const answers: Found[] = [];
      for (let page = 1; page <= 10; page++) {
        const { data: items } = await call<Item[]>(
          `/issues?labels=${legislationLabel.name}&state=all&sort=created&direction=desc&per_page=100&page=${page}`
        );
        for (const item of items) {
          if (item.body?.includes(marker)) {
            answers.push(found(item, item.pull_request ? 'pull' : 'issue'));
          }
        }
        if (items.length < 100) break;
      }
      return answers;
    },
    async ensureLabel() {
      const { status } = await call(`/labels/${legislationLabel.name}`, { missing: true });
      if (status === 404) await call('/labels', { method: 'POST', body: legislationLabel });
    },
    async openPull({ title, branch, base, body }) {
      if (!appToken) throw new Error('Set LEGISLATION_APP_TOKEN to open a pull request.');
      const { data } = await call<Item>('/pulls', {
        method: 'POST',
        as: appToken,
        body: { title, head: branch, base, body, maintainer_can_modify: true },
      });
      await call(`/issues/${data.number}/labels`, {
        method: 'POST',
        as: appToken,
        body: { labels: [legislationLabel.name] },
      });
      return found(data, 'pull');
    },
    async openIssue({ title, body }) {
      const { data } = await call<Item>('/issues', {
        method: 'POST',
        body: { title, body, labels: [legislationLabel.name] },
      });
      return found(data, 'issue');
    },
  };
}
