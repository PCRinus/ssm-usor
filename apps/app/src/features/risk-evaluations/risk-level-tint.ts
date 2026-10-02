const tints: Record<number, string> = {
  4: 'bg-destructive-soft text-destructive-foreground',
  5: 'bg-destructive-mid text-destructive-foreground',
  6: 'bg-destructive-mid text-destructive-foreground',
  7: 'bg-destructive text-white',
};

export function riskLevelTint(level: number) {
  return tints[level] ?? 'bg-muted text-foreground';
}
