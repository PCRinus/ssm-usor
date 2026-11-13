import { maskReplayInput, maskReplayText } from '@/app/observability/replay-masking';

// Each text node is masked on its own, under its own parent, as the recorder does.
export function replayedText(element: Element) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let text = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    text += maskReplayText(node.textContent ?? '', node.parentElement);
  }
  return text;
}

export function replayedInput(field: HTMLInputElement | HTMLTextAreaElement) {
  return maskReplayInput(field.value, field);
}
