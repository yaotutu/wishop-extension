import type { TaobaoSecurityChallengeKind, TaobaoSecurityChallengeSnapshot } from '../../../shared/types';
import { normalizeText } from '../dom/text';

interface ChallengeSignal {
  kind: TaobaoSecurityChallengeKind;
  reason: string;
  matched: boolean;
}

function includesAny(value: string, parts: string[]): string[] {
  return parts.filter(part => value.includes(part));
}

function domSignal(): ChallengeSignal {
  const nodes = Array.from(document.querySelectorAll('iframe, [id], [class]'));
  const matched = nodes
    .map(node => [
      (node as HTMLIFrameElement).src || '',
      (node as HTMLElement).id || '',
      String((node as HTMLElement).className || ''),
    ].join(' '))
    .map(value => value.toLowerCase())
    .filter(value => ['captcha', 'slider', 'verify', 'punish', 'nc_'].some(part => value.includes(part)));
  return {
    kind: matched.some(value => value.includes('slider') || value.includes('nc_')) ? 'slider' : 'captcha',
    reason: '页面出现验证相关元素',
    matched: matched.length > 0,
  };
}

function classifySignals(url: string, title: string, text: string): { kind: TaobaoSecurityChallengeKind; signals: string[] } {
  const signals: string[] = [];
  const lowerUrl = url.toLowerCase();
  const urlMatches = includesAny(lowerUrl, ['login.taobao.com', 'passport.taobao.com', 'punish', 'sec.taobao.com', 'verify', 'captcha']);
  signals.push(...urlMatches.map(item => `url:${item}`));

  const titleMatches = includesAny(title, ['验证', '安全验证', '身份验证', '登录', '访问受限']);
  signals.push(...titleMatches.map(item => `title:${item}`));

  const textMatches = includesAny(text, [
    '请完成验证',
    '拖动滑块',
    '安全验证',
    '验证码',
    '访问受限',
    '登录后继续',
    '为了你的账户安全',
    '环境存在异常',
  ]);
  signals.push(...textMatches.map(item => `text:${item}`));

  const dom = domSignal();
  if (dom.matched) signals.push(`dom:${dom.reason}`);

  if (urlMatches.some(item => item.includes('login') || item.includes('passport')) || text.includes('登录后继续')) {
    return { kind: 'login', signals };
  }
  if (text.includes('拖动滑块') || dom.kind === 'slider') return { kind: 'slider', signals };
  if (text.includes('验证码') || dom.kind === 'captcha') return { kind: 'captcha', signals };
  if (text.includes('访问受限') || text.includes('环境存在异常') || lowerUrl.includes('punish')) {
    return { kind: 'access-denied', signals };
  }
  return { kind: signals.length > 0 ? 'unknown' : 'unknown', signals };
}

export function detectTaobaoSecurityChallenge(): TaobaoSecurityChallengeSnapshot {
  const title = document.title;
  const url = location.href;
  const text = normalizeText(document.body.innerText || document.body.textContent || '');
  const { kind, signals } = classifySignals(url, title, text);

  return {
    detected: signals.length > 0,
    kind,
    reason: signals[0] || '',
    title,
    url,
    matchedSignals: signals,
  };
}
