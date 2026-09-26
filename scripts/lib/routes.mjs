// Pure: map changed Next.js files to the routes they affect, and pick the pages the UI check shoots.

const PAGE = /^(?:src\/)?app\/(.*?)\/?(page|layout|template|loading|error|not-found)\.(?:js|jsx|ts|tsx|mdx)$/;
const PAGES_ROUTER = /^(?:src\/)?pages\/(?!api\/)(.*)\.(?:js|jsx|ts|tsx|mdx)$/;

/**
 * file → { route, subtree } or null when the file isn't a route file (components, CSS, public/…).
 * route uses Next's own pattern syntax, e.g. "/blog/[slug]". subtree: the change affects every page below.
 */
export function routeOfFile(file) {
  const f = file.replace(/\\/g, '/');
  let m = f.match(PAGE);
  if (m) {
    if (/(^|\/)\(\.{1,3}\)/.test(m[1])) return null; // intercepting routes aren't standalone URLs
    const segs = m[1].split('/').filter(s => s && !/^\(.*\)$/.test(s) && !s.startsWith('@'));
    return { route: '/' + segs.join('/'), subtree: m[2] !== 'page' };
  }
  m = f.match(PAGES_ROUTER);
  if (m) {
    if (/^_(app|document)$/.test(m[1])) return { route: '/', subtree: true };
    return { route: '/' + m[1].replace(/(^|\/)index$/, ''), subtree: false };
  }
  return null;
}

function patternRe(route) {
  const body = route.split('/').map(s =>
    /^\[\[\.\.\..+\]\]$/.test(s) ? '(?:/.*)?' : /^\[\.\.\..+\]$/.test(s) ? '/.+' : /^\[.+\]$/.test(s) ? '/[^/]+' : s ? '/' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '').join('');
  return new RegExp('^' + (body || '/') + '/?$');
}

/**
 * samplePaths: pages known on the site (homepage first). touched: [{route, subtree}].
 * Returns the UI-check pages: homepage, one page per route type, and a page for every touched route.
 */
export function uiPages(samplePaths, touched = []) {
  const out = ['/'];
  const add = (p) => { if (p && !out.includes(p)) out.push(p); };
  const seen = new Set();
  for (const p of samplePaths) {
    const type = p.split('/')[1] ?? '';
    if (type && !seen.has(type)) { seen.add(type); add(p); }
  }
  for (const t of touched) {
    if (!t) continue;
    if (t.subtree) {
      const prefix = t.route === '/' ? '/' : t.route;
      const re = patternRe(t.route);
      add(samplePaths.find(p => re.test(p)));
      add(samplePaths.find(p => p !== prefix && (prefix === '/' || p.startsWith(prefix + '/') || patternRe(t.route + '/[...rest]').test(p))));
    } else {
      add(samplePaths.find(p => patternRe(t.route).test(p)));
    }
  }
  return out;
}
