import { type HelpTopic, helpTopics } from './topics';

export const helpTabName = 'ssm-usor-ajutor';

export function helpTopicUrl(origin: string, topic: HelpTopic): string {
  const target: { path: string; anchor: string } = helpTopics[topic];
  return `${origin}${target.path}#${target.anchor}`;
}
