function normalizeIsbn(value) {
  return String(value || '').toUpperCase().replace(/[^0-9X]/g, '');
}

function isValidIsbn(isbn) {
  if (/^(978|979)\d{10}$/.test(isbn)) {
    const sum = [...isbn].reduce(
      (total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3),
      0
    );
    return sum % 10 === 0;
  }
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const sum = [...isbn].reduce((total, digit, index) => {
      const value = digit === 'X' ? 10 : Number(digit);
      return total + value * (10 - index);
    }, 0);
    return sum % 11 === 0;
  }
  return false;
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_match, number) => String.fromCodePoint(Number.parseInt(number, 16)))
    .replace(/&#(\d+);/g, (_match, number) => String.fromCodePoint(Number(number)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function tagValues(xml, tag) {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  return [...String(xml || '').matchAll(pattern)].map(match => decodeXml(match[1])).filter(Boolean);
}

export function parseGoogleBooksFeed(xml) {
  const entry = String(xml || '').match(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/i)?.[1];
  if (!entry) return { found: false };

  const titles = [...new Set(tagValues(entry, 'dc:title'))];
  const authors = [...new Set(tagValues(entry, 'dc:creator'))];
  const formats = tagValues(entry, 'dc:format');
  const identifiers = tagValues(entry, 'dc:identifier');
  const volumeId = identifiers.find(value => !value.startsWith('ISBN:') && /^[A-Za-z0-9_-]+$/.test(value)) || '';
  const pageCount = formats
    .map(value => value.match(/^(\d+)\s+pages$/i)?.[1] || '')
    .find(value => Number(value) > 0) || '';

  return {
    found: titles.length > 0,
    title: titles.join(': '),
    author: authors.join(', '),
    pages: pageCount,
    coverUrl: volumeId
      ? `https://books.google.com/books/content?id=${encodeURIComponent(volumeId)}&printsec=frontcover&img=1&zoom=1`
      : '',
    source: 'Google Books Feed'
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}

export async function onRequestGet(context) {
  const isbn = normalizeIsbn(new URL(context.request.url).searchParams.get('isbn'));
  if (!isValidIsbn(isbn)) {
    return jsonResponse({ status: 'error', ok: false, message: 'Invalid ISBN' }, 400);
  }

  try {
    const feedUrl = new URL('https://books.google.com/books/feeds/volumes');
    feedUrl.searchParams.set('q', `isbn:${isbn}`);
    const response = await fetch(feedUrl, {
      headers: { Accept: 'application/atom+xml' },
      redirect: 'follow'
    });
    if (!response.ok) return jsonResponse({ status: 'error', ok: false, message: 'Book lookup unavailable' }, 502);
    return jsonResponse({ status: 'success', ok: true, data: parseGoogleBooksFeed(await response.text()) });
  } catch {
    return jsonResponse({ status: 'error', ok: false, message: 'Book lookup unavailable' }, 502);
  }
}
