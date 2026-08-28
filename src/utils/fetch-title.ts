import { requestUrl } from 'obsidian';

/**
 * Fetch the page at `url` and extract a human-readable title, preferring Open
 * Graph / Twitter-card metadata over the <title> element. Makes one network
 * request to the linked site. Resolves to null on any failure — network error,
 * non-HTML response, timeout, or no title found — so callers can fall back
 * silently.
 */
export async function fetchPageTitle(url: string, timeoutMs = 8000): Promise<string | null> {
  return Promise.race([
    extractTitle(url),
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

async function extractTitle(url: string): Promise<string | null> {
  let res;
  try {
    res = await requestUrl({ url, method: 'GET', throw: false });
  } catch {
    return null;
  }
  if (res.status < 200 || res.status >= 300) return null;

  const headers = res.headers ?? {};
  const contentType = (headers['content-type'] ?? headers['Content-Type'] ?? '').toLowerCase();
  if (contentType && !contentType.includes('html') && !contentType.includes('xml')) return null;

  const html = res.text;
  if (!html) return null;

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return null;
  }

  const meta = (selector: string): string | null => {
    const v = doc.querySelector(selector)?.getAttribute('content')?.trim();
    return v ? v : null;
  };

  const title =
    meta('meta[property="og:title"]') ??
    meta('meta[name="twitter:title"]') ??
    doc.querySelector('title')?.textContent?.trim() ??
    null;

  return title && title.length ? title : null;
}
