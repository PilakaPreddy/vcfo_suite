/**
 * robots.txt for the Watch crawler. A pure parser and matcher per RFC 9309: the group naming our
 * product token wins over `*`, the longest matching path rule decides and Allow wins a tie.
 * `Crawl-delay` is not in the RFC, but it is honoured because the owner asked for rate limits.
 */
export const ROBOTS_AGENT_TOKEN = 'vcfo-suite';

export interface RobotsRules {
  rules: Array<{ allow: boolean; path: string }>;
  crawlDelayMs: number | null;
}

interface Group {
  agents: string[];
  rules: RobotsRules['rules'];
  crawlDelayMs: number | null;
}

export const ALLOW_ALL: RobotsRules = { rules: [], crawlDelayMs: null };
export const DENY_ALL: RobotsRules = { rules: [{ allow: false, path: '/' }], crawlDelayMs: null };

export function parseRobots(text: string): RobotsRules {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], crawlDelayMs: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === 'allow' || key === 'disallow') {
      if (value) current.rules.push({ allow: key === 'allow', path: value });
    } else if (key === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelayMs = seconds * 1000;
    }
  }
  const named = groups.filter((g) => g.agents.some((a) => a !== '*' && ROBOTS_AGENT_TOKEN.startsWith(a)));
  const chosen = named.length > 0 ? named : groups.filter((g) => g.agents.includes('*'));
  return {
    rules: chosen.flatMap((g) => g.rules),
    crawlDelayMs: chosen.reduce<number | null>((max, g) => (g.crawlDelayMs == null ? max : Math.max(max ?? 0, g.crawlDelayMs)), null),
  };
}

function ruleMatches(rulePath: string, target: string): boolean {
  const anchored = rulePath.endsWith('$');
  const body = anchored ? rulePath.slice(0, -1) : rulePath;
  const pattern = body.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${pattern}${anchored ? '$' : ''}`).test(target);
}

export function robotsAllows(robots: RobotsRules, pathAndQuery: string): boolean {
  let best: { allow: boolean; length: number } | null = null;
  for (const rule of robots.rules) {
    if (!ruleMatches(rule.path, pathAndQuery)) continue;
    if (!best || rule.path.length > best.length || (rule.path.length === best.length && rule.allow)) {
      best = { allow: rule.allow, length: rule.path.length };
    }
  }
  return best ? best.allow : true;
}
