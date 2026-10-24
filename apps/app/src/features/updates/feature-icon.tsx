import { DynamicIcon, type IconName, iconNames } from 'lucide-react/dynamic';

const known = new Set<string>(iconNames);

export function FeatureIcon({ name, className }: { name: string | null; className?: string }) {
  const icon = name && known.has(name) ? (name as IconName) : 'sparkles';
  return <DynamicIcon name={icon} className={className} aria-hidden="true" />;
}
