/**
 * index.js — Public API for epub-dl.
 *
 * Usage (programmatic):
 *   import { generateEpub } from 'epub-dl';
 *   const outputPath = await generateEpub('https://continuous.epub.pub/epub/<id>', {
 *     output: './my-book.epub',
 *     verbose: true,
 *   });
 */

import fs from 'fs';
import path from 'path';

import { fetchAsBuffer, fetchAsText } from './scraper.js';
import { parseContainerXml, parseOpf, resolveManifestPaths } from './opf-parser.js';
import { buildEpub } from './epub-builder.js';

// ─── helpers ────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Extract the asset.epub.pub base URL embedded in an epub.pub viewer page.
 *
 * The page source contains a string like:
 *   'https://asset.epub.pub/epub/my-book-title.epub/content.opf\'
 *
 * @param {string} html
 * @returns {string|null}
 */
function extractAssetBaseUrl(html) {
    const match = html.match(/https:\/\/asset\.epub\.pub\/epub\/[^"'\\]+\.epub\//);
    return match ? match[0] : null;
}

/**
 * Derive an output filename from the asset base URL.
 *   https://asset.epub.pub/epub/liberty-street-by-heather-marshall.epub/
 *   → "liberty-street-by-heather-marshall.epub"
 */
function deriveFilename(assetBaseUrl) {
    const match = assetBaseUrl.match(/\/([^/]+\.epub)\//);
    return match ? match[1] : 'output.epub';
}

function normalizeAssetBaseUrl(url) {
    return url.endsWith('/') ? url : `${url}/`;
}

function deriveAssetBaseUrlFromSlug(slug) {
    return `https://asset.epub.pub/epub/${slug}.epub/`;
}

function extractSlugFromListingUrl(url) {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/book\/([^/?#]+)/);
    return match ? match[1] : null;
}

function extractSlugFromListingHtml(html) {
    const imageMatch = html.match(/https:\/\/image\.epub\.pub\/([^/?#]+?)\.jpg(?:\?cover)?/i);
    if (imageMatch) {
        return imageMatch[1];
    }

    const canonicalMatch = html.match(/<link[^>]+rel="canonical"[^>]+href="https:\/\/www\.epub\.pub\/book\/([^"?#]+)"/i);
    return canonicalMatch ? canonicalMatch[1] : null;
}

function resolveOutputPath(output, assetBaseUrl) {
    const filename = deriveFilename(assetBaseUrl);

    if (!output) {
        return path.resolve(filename);
    }

    const resolved = path.resolve(output);
    const looksLikeDirectory =
        output.endsWith(path.sep) ||
        output.endsWith('/') ||
        output === '.' ||
        output === '..' ||
        (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) ||
        path.extname(resolved).toLowerCase() !== '.epub';

    if (looksLikeDirectory) {
        fs.mkdirSync(resolved, { recursive: true });
        return path.join(resolved, filename);
    }

    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    return resolved;
}

// ─── main export ────────────────────────────────────────────────────────────

/**
 * Download all files from an epub.pub book page and assemble them into a
 * standards-compliant .epub archive.
 *
 * @param {string} url
 *   An epub.pub listing URL (https://www.epub.pub/book/<slug>), viewer URL
 *   (https://continuous.epub.pub/epub/<id>), or direct asset base URL
 *   (https://asset.epub.pub/epub/<slug>.epub/).
 *
 * @param {object} [options]
 * @param {string}  [options.output]   Output folder or file path. Defaults to
 *                                     the book filename in the current directory.
 * @param {boolean} [options.verbose]  Print per-file download progress.
 * @param {number}  [options.delay]    Milliseconds to wait between requests (default 100).
 * @param {function} [options.onProgress]  Callback({ current, total, file }) for custom UIs.
 *
 * @returns {Promise<string>} Absolute path to the written .epub file.
 */
export async function generateEpub(url, options = {}) {
    const { output, verbose = false, delay = 100, onProgress } = options;
    const log = verbose ? (...a) => process.stdout.write(a.join(' ') + '\n') : () => { };

    // ── 1. Resolve asset base URL ──────────────────────────────────────────────
    let assetBaseUrl;

    if (url.includes('asset.epub.pub')) {
        assetBaseUrl = normalizeAssetBaseUrl(url);
        log(`Asset base URL (direct): ${assetBaseUrl}`);
    } else if (url.includes('www.epub.pub/book/')) {
        log(`Fetching epub.pub listing page: ${url}`);
        const html = await fetchAsText(url);
        const slug = extractSlugFromListingHtml(html) ?? extractSlugFromListingUrl(url);

        if (!slug) {
            throw new Error(
                'Could not determine the book slug from the listing page.\n' +
                'Pass the direct asset URL instead: https://asset.epub.pub/epub/<slug>.epub/'
            );
        }

        assetBaseUrl = deriveAssetBaseUrlFromSlug(slug);
        log(`Derived asset base URL from listing page: ${assetBaseUrl}`);
    } else {
        log(`Fetching epub.pub page: ${url}`);
        const html = await fetchAsText(url);
        assetBaseUrl = extractAssetBaseUrl(html);

        if (!assetBaseUrl) {
            throw new Error(
                'Could not find the asset.epub.pub URL in the epub.pub page source.\n' +
                'Tip: pass a listing URL such as https://www.epub.pub/book/<slug>\n' +
                'or pass the asset URL directly: epub-dl https://asset.epub.pub/epub/<slug>.epub/'
            );
        }
        log(`Found asset base URL: ${assetBaseUrl}`);
    }

    // ── 2. container.xml ───────────────────────────────────────────────────────
    log('Fetching META-INF/container.xml ...');
    const containerXml = await fetchAsText(`${assetBaseUrl}META-INF/container.xml`);
    const opfPath = parseContainerXml(containerXml);
    log(`OPF path: ${opfPath}`);

    // ── 3. OPF manifest ────────────────────────────────────────────────────────
    log(`Fetching OPF: ${opfPath} ...`);
    const opfXml = await fetchAsText(`${assetBaseUrl}${opfPath}`);
    const { manifestItems, metadata } = parseOpf(opfXml);
    log(`Manifest items: ${manifestItems.length}`);

    if (metadata.title) {
        log(`Book: "${metadata.title}"${metadata.creator ? ` — ${metadata.creator}` : ''}`);
    }

    // ── 4. Build download list ─────────────────────────────────────────────────
    const resolvedManifest = resolveManifestPaths(opfPath, manifestItems);

    // All files we need; use insertion order so mimetype / container come first
    const fileSet = new Set([
        'META-INF/container.xml',
        'mimetype',
        opfPath,
        ...resolvedManifest,
    ]);
    const fileList = [...fileSet];

    // ── 5. Download ────────────────────────────────────────────────────────────
    log(`\nDownloading ${fileList.length} files ...`);

    const downloaded = {
        // Pre-populate with already-fetched text files as Buffers
        'META-INF/container.xml': Buffer.from(containerXml, 'utf8'),
        [opfPath]: Buffer.from(opfXml, 'utf8'),
    };

    const progressLine = (i) => {
        if (!verbose) {
            process.stdout.write(`\r  Downloading … ${i}/${fileList.length}`);
        }
    };

    let fetched = 0;
    for (let i = 0; i < fileList.length; i++) {
        const filePath = fileList[i];

        // Skip files already in memory
        if (downloaded[filePath] !== undefined) {
            onProgress?.({ current: i + 1, total: fileList.length, file: filePath, cached: true });
            continue;
        }

        log(`  [${i + 1}/${fileList.length}] ${filePath} ... `);
        progressLine(i + 1);

        try {
            const data = await fetchAsBuffer(`${assetBaseUrl}${filePath}`);
            downloaded[filePath] = data;
            fetched++;
            if (verbose) process.stdout.write(`${data.length} bytes\n`);
        } catch (err) {
            // Non-fatal: log and continue; file simply won't be in the epub
            if (verbose) process.stdout.write(`SKIP (${err.message})\n`);
        }

        onProgress?.({ current: i + 1, total: fileList.length, file: filePath });

        if (delay > 0 && i < fileList.length - 1) await sleep(delay);
    }

    if (!verbose) process.stdout.write('\n');

    const total = Object.keys(downloaded).length;
    log(`\nDownloaded ${fetched} new + ${total - fetched} cached = ${total} files total`);

    if (total === 0) {
        throw new Error('No files downloaded. Verify the URL and your network connection.');
    }

    // ── 6. Assemble epub ───────────────────────────────────────────────────────
    log('\nAssembling epub archive ...');
    const epubBuffer = await buildEpub(downloaded, containerXml);

    // ── 7. Write to disk ───────────────────────────────────────────────────────
    const outputPath = resolveOutputPath(output, assetBaseUrl);

    fs.writeFileSync(outputPath, epubBuffer);

    const sizeMb = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
    log(`\nWrote ${outputPath} (${sizeMb} MB)`);

    return outputPath;
}
