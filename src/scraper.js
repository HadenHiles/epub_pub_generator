/**
 * scraper.js — Cloudflare-aware HTTP client built on got-scraping.
 *
 * got-scraping applies TLS fingerprinting and browser-like headers that
 * bypass Cloudflare's bot-score checks in most cases.  A shared instance
 * is used so cookies set during page fetches carry through to asset fetches.
 */

import { gotScraping } from 'got-scraping';

const DEFAULT_HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
};

/** Detect Cloudflare JS-challenge / managed-challenge pages. */
function isCfChallenge(text) {
    return (
        typeof text === 'string' &&
        text.includes('Just a moment') &&
        (text.includes('cf-mitigated') || text.includes('_cf_chl_opt'))
    );
}

const SHARED_OPTIONS = {
    headers: DEFAULT_HEADERS,
    retry: { limit: 2, calculateDelay: ({ attemptCount }) => attemptCount * 1000 },
    timeout: { request: 30_000 },
    followRedirect: true,
    throwHttpErrors: false,
};

/**
 * Fetch a URL and return its body as a Node.js Buffer.
 * Throws on network errors or Cloudflare challenges.
 */
export async function fetchAsBuffer(url) {
    const response = await gotScraping({
        ...SHARED_OPTIONS,
        url,
        responseType: 'buffer',
    });

    if (response.statusCode === 404) {
        throw new Error(`HTTP 404: ${url}`);
    }

    if (response.statusCode >= 400) {
        throw new Error(`HTTP ${response.statusCode}: ${url}`);
    }

    // Detect CF challenge in what looks like an HTML error page
    const preview = response.body.slice(0, 512).toString('utf8');
    if (isCfChallenge(preview)) {
        throw new CfChallengeError(url);
    }

    return response.body;
}

/**
 * Fetch a URL and return its body as a UTF-8 string.
 * Throws on network errors or Cloudflare challenges.
 */
export async function fetchAsText(url) {
    const response = await gotScraping({
        ...SHARED_OPTIONS,
        url,
        responseType: 'text',
    });

    if (response.statusCode === 404) {
        throw new Error(`HTTP 404: ${url}`);
    }

    if (response.statusCode >= 400) {
        throw new Error(`HTTP ${response.statusCode}: ${url}`);
    }

    if (isCfChallenge(response.body)) {
        throw new CfChallengeError(url);
    }

    return response.body;
}

export class CfChallengeError extends Error {
    constructor(url) {
        super(
            `Cloudflare bot-protection challenge at: ${url}\n` +
            'The site requires JavaScript/browser execution to pass this check.\n\n' +
            'Workaround: pass the asset base URL directly instead of the epub.pub page URL.\n' +
            'Format: https://asset.epub.pub/epub/<book-slug>.epub/\n' +
            'The slug can be found in the page source (search for "asset.epub.pub").'
        );
        this.name = 'CfChallengeError';
        this.url = url;
    }
}
