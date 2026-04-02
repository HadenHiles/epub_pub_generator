/**
 * opf-parser.js — Parse epub META-INF/container.xml and content.opf files.
 */

import path from 'path';

/**
 * Parse META-INF/container.xml and return the OPF rootfile path
 * (e.g. "content.opf" or "OEBPS/content.opf").
 *
 * @param {string} xml
 * @returns {string}
 */
export function parseContainerXml(xml) {
    const match = xml.match(/\bfull-path="([^"]+)"/);
    if (!match) {
        throw new Error('Could not find rootfile full-path in META-INF/container.xml');
    }
    return match[1];
}

/**
 * Parse a content.opf document and extract:
 *   - manifestItems: array of href strings from <manifest>
 *   - spineOrder:    array of idref strings from <spine>
 *   - metadata:      { title, creator, publisher, language, date }
 *
 * @param {string} opfXml   Raw OPF XML text
 * @returns {{ manifestItems: string[], spineOrder: string[], metadata: Object }}
 */
export function parseOpf(opfXml) {
    // --- manifest ---
    // Match every <item …/> or <item …></item> tag and pluck href="…"
    const manifestItems = [];
    const itemRe = /<item\b([^>]+)(?:\/>|>.*?<\/item>)/gs;
    let m;
    while ((m = itemRe.exec(opfXml)) !== null) {
        const hrefMatch = m[1].match(/\bhref="([^"]+)"/);
        if (hrefMatch) manifestItems.push(hrefMatch[1]);
    }

    // --- spine ---
    const spineOrder = [];
    const itemrefRe = /<itemref\b([^>]+)(?:\/>|>)/g;
    while ((m = itemrefRe.exec(opfXml)) !== null) {
        const idrefMatch = m[1].match(/\bidref="([^"]+)"/);
        if (idrefMatch) spineOrder.push(idrefMatch[1]);
    }

    // --- metadata ---
    const pick = (tag) => {
        const re = new RegExp(`<(?:[a-z]+:)?${tag}[^>]*>([^<]+)<\\/(?:[a-z]+:)?${tag}>`);
        const hit = opfXml.match(re);
        return hit ? hit[1].trim() : null;
    };

    const metadata = {
        title: pick('title'),
        creator: pick('creator'),
        publisher: pick('publisher'),
        language: pick('language'),
        date: pick('date'),
    };

    return { manifestItems, spineOrder, metadata };
}

/**
 * Resolve manifest href values to paths relative to the epub root,
 * taking into account the OPF file's own location.
 *
 * Example:
 *   opfPath = "OEBPS/content.opf"
 *   href    = "xhtml/chapter1.xhtml"
 *   result  = "OEBPS/xhtml/chapter1.xhtml"
 *
 * @param {string}   opfPath  Path of the OPF file within the epub
 * @param {string[]} hrefs    href values from the manifest
 * @returns {string[]}
 */
export function resolveManifestPaths(opfPath, hrefs) {
    const opfDir = path.posix.dirname(opfPath);
    return hrefs.map((href) => {
        // Already absolute-style paths (start with /) or under OEBPS/ when opfDir is '.'
        if (opfDir === '.') return href;
        return path.posix.normalize(path.posix.join(opfDir, href));
    });
}
