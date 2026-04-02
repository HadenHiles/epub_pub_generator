/**
 * epub-builder.js — Assemble a valid EPUB 2/3 zip archive from downloaded files.
 *
 * Per the EPUB spec:
 *   1. The "mimetype" file must be the first entry in the ZIP archive.
 *   2. The "mimetype" file must be stored without compression (STORE method).
 *   3. META-INF/container.xml must be present and point to the OPF rootfile.
 */

import JSZip from 'jszip';

const MIMETYPE = 'application/epub+zip';

const DEFAULT_CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

/**
 * Build an epub Buffer from a map of downloaded files.
 *
 * @param {Record<string, Buffer>} files       path → Buffer for every epub file
 * @param {string|null}            containerXml text of META-INF/container.xml
 *                                             (already in `files`, but provided
 *                                              as a fallback if the server 404'd)
 * @returns {Promise<Buffer>}
 */
export async function buildEpub(files, containerXml = null) {
    const zip = new JSZip();

    // 1. mimetype — first entry, uncompressed
    const mimetypeData = files['mimetype'] ?? Buffer.from(MIMETYPE, 'utf8');
    zip.file('mimetype', mimetypeData, { compression: 'STORE', compressionOptions: {} });

    // 2. META-INF/container.xml — use downloaded version, fallback to provided text, else default
    const containerData =
        files['META-INF/container.xml'] ??
        (containerXml ? Buffer.from(containerXml, 'utf8') : null) ??
        Buffer.from(DEFAULT_CONTAINER_XML, 'utf8');

    zip.file('META-INF/container.xml', containerData);

    // 3. All other files, compressed
    const skip = new Set(['mimetype', 'META-INF/container.xml']);
    for (const [filePath, data] of Object.entries(files)) {
        if (skip.has(filePath)) continue;
        zip.file(filePath, data);
    }

    return zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
    });
}
