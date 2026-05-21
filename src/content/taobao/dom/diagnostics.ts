import { normalizeText } from './text';

export interface TaobaoDomDiagnosticNode {
  index: number;
  tag: string;
  className: string;
  text: string;
}

export interface TaobaoDomDiagnostics {
  title: string;
  url: string;
  hits: Array<{ word: string; index: number; around: string }>;
  nodes: TaobaoDomDiagnosticNode[];
}

export function collectTaobaoDomDiagnostics(keywords: string[], limit = 100): TaobaoDomDiagnostics {
  const text = normalizeText(document.body.innerText || document.body.textContent || '');
  const hits = keywords
    .map(word => {
      const index = text.indexOf(word);
      return {
        word,
        index,
        around: index >= 0 ? text.slice(Math.max(0, index - 80), index + 120) : '',
      };
    })
    .filter(hit => hit.index >= 0);
  const nodes = Array.from(document.body.querySelectorAll('*'))
    .map((node, index) => ({
      index,
      tag: node.tagName,
      className: String((node as HTMLElement).className || '').slice(0, 160),
      text: normalizeText((node as HTMLElement).innerText || node.textContent || '').slice(0, 300),
    }))
    .filter(node => node.text && keywords.some(word => node.text.includes(word)))
    .slice(0, limit);

  return {
    title: document.title,
    url: location.href,
    hits,
    nodes,
  };
}
