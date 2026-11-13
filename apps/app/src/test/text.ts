// Matches the innermost element whose whole text is `text`, so a sentence split by a masked name
// is still found as one.
export const fullText = (text: string) => (_: string, element: Element | null) =>
  element?.textContent === text &&
  !Array.from(element.children).some((child) => child.textContent === text);
