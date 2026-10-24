import { type HelpTopic, helpTopics } from './topics';

export function helpTopicUrl(origin: string, topic: HelpTopic): string {
  const target: { path: string; anchor: string } = helpTopics[topic];
  return `${origin}${target.path}#${target.anchor}`;
}
