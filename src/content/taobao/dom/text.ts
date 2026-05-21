export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function pageText(root: ParentNode = document): string {
  return normalizeText(root.textContent || '');
}

export function textOf(selector: string, root: ParentNode = document): string {
  return normalizeText(root.querySelector(selector)?.textContent || '');
}

export function firstMatchingText(selectors: string[], root: ParentNode = document): string {
  for (const selector of selectors) {
    const values = Array.from(root.querySelectorAll(selector))
      .map(node => normalizeText(node.textContent || ''))
      .filter(Boolean);
    if (values[0]) return values[0];
  }
  return '';
}

export function valueAfterLabel(text: string, labels: string[]): string {
  for (const label of labels) {
    const pattern = new RegExp(`${label}[：:\\s]*([^\\s｜|，,。；;]+)`);
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

export function exactElementTextMatches(candidates: string[], root: ParentNode = document.body): string {
  const elements = Array.from(root.querySelectorAll('*'));
  for (const candidate of candidates) {
    const match = elements.find(node => normalizeText(node.textContent || '') === candidate);
    if (match) return candidate;
  }
  return '';
}
