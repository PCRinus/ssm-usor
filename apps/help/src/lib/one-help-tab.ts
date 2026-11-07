import { helpTabName } from '@ssm-usor/help-topics/url';

// The app opens every help link in the tab of this name, but a name only reaches the tabs of the
// app tab that opened it: from a second app tab the browser opens a second help tab. The newest
// one is where the member reads, so it asks the older ones to close.
export function keepOneHelpTab(tab: Pick<Window, 'name' | 'close'>) {
  if (tab.name !== helpTabName) return undefined;
  const channel = new BroadcastChannel(helpTabName);
  channel.onmessage = () => tab.close();
  channel.postMessage('opened');
  return channel;
}
