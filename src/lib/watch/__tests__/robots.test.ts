import { describe, expect, it } from 'vitest';
import { parseRobots, robotsAllows } from '../robots';

describe('robots rules', () => {
  it('uses the star group when nothing names us', () => {
    const robots = parseRobots('User-agent: *\nDisallow: /private\nAllow: /private/open\nCrawl-delay: 5\n');
    expect(robotsAllows(robots, '/private/x')).toBe(false);
    expect(robotsAllows(robots, '/private/open/a.pdf')).toBe(true);
    expect(robotsAllows(robots, '/public')).toBe(true);
    expect(robots.crawlDelayMs).toBe(5000);
  });

  it('prefers the group naming our product over the star group', () => {
    const robots = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: VCFO-Suite\nAllow: /\n');
    expect(robotsAllows(robots, '/anything')).toBe(true);
    const shut = parseRobots('User-agent: *\nAllow: /\n\nUser-agent: vcfo-suite\nDisallow: /\n');
    expect(robotsAllows(shut, '/anything')).toBe(false);
  });

  it('handles wildcards, end anchors and comments, and an empty Disallow allows', () => {
    const robots = parseRobots('# hello\nUser-agent: *\nDisallow: /*.pdf$ # no pdfs\nDisallow:\n');
    expect(robotsAllows(robots, '/a/b.pdf')).toBe(false);
    expect(robotsAllows(robots, '/a/b.pdf?x=1')).toBe(true);
    expect(robotsAllows(parseRobots('User-agent: *\nDisallow:\n'), '/x')).toBe(true);
  });

  it('merges consecutive agent lines into one group', () => {
    const robots = parseRobots('User-agent: a\nUser-agent: *\nDisallow: /x\n');
    expect(robotsAllows(robots, '/x')).toBe(false);
  });
});
