import { SetupGuideSection } from '@/features/setup-guide/setup-guide-section';

export function SettingsPage() {
  return (
    <div data-testid="settings-page" className="grid max-w-2xl gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">Setări</h1>
      <SetupGuideSection />
    </div>
  );
}
