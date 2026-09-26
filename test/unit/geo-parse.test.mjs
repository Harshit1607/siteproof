import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRobots, rulesFor, isBlocked, scoreLlms } from '../../scripts/checks/geo.mjs';

test('robots: grouped user-agents, wildcard fallback, longest match', () => {
  const { groups, sitemaps } = parseRobots([
    'User-agent: GPTBot', 'Disallow: /', '',
    'User-agent: OAI-SearchBot', 'User-agent: PerplexityBot', 'Disallow: /private', 'Allow: /private/ok', '',
    'User-agent: *', 'Allow: /', 'Disallow: /admin', '',
    'Sitemap: https://x.test/sitemap.xml',
  ].join('\n'));
  assert.deepEqual(sitemaps, ['https://x.test/sitemap.xml']);
  assert.equal(isBlocked(rulesFor(groups, 'gptbot'), '/'), true);
  assert.equal(isBlocked(rulesFor(groups, 'PerplexityBot'), '/'), false);
  assert.equal(isBlocked(rulesFor(groups, 'PerplexityBot'), '/private/x'), true);
  assert.equal(isBlocked(rulesFor(groups, 'PerplexityBot'), '/private/ok/1'), false);
  assert.equal(isBlocked(rulesFor(groups, 'ClaudeBot'), '/admin/x'), true);
  assert.equal(isBlocked(rulesFor(groups, 'ClaudeBot'), '/'), false);
  assert.equal(isBlocked([['disallow', '']], '/'), false);
  assert.equal(isBlocked([['disallow', '/*.pdf']], '/a/b.pdf'), true);
});

test('llms.txt: structure scoring', () => {
  const good = ['# Fixture Co', '> We build fast websites.', '', '## Key pages',
    '- [About](https://x.test/about): who we are', '- [Blog](https://x.test/blog): articles',
    '## Contact', '- Email: hi@x.test', '- Based in Pune', '- Since 2015', '- Next.js on Cloudflare'].join('\n');
  assert.ok(scoreLlms(good).score >= 70);
  assert.deepEqual(scoreLlms(good).links, ['https://x.test/about', 'https://x.test/blog']);
  assert.ok(scoreLlms('Fixture Co makes websites.').score < 70);
});
