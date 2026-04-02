#!/usr/bin/env node
/**
 * epub-dl — CLI entry point for epub-dl.
 *
 * Install globally:
 *   npm install -g epub-dl
 *
 * Usage:
 *   epub-dl <url> [options]
 */

import { Command } from 'commander';
import { createRequire } from 'module';
import { generateEpub } from '../src/index.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const program = new Command();

program
    .name('epub-dl')
    .description(
        'Download a book from an epub.pub listing or reader URL and save it as a local .epub file.'
    )
    .version(pkg.version, '-V, --version')
    .argument('<url>', 'epub.pub listing URL, viewer URL, or asset.epub.pub base URL')
    .option('-o, --output <path>', 'output folder or .epub file path (default: current directory)', '.')
    .option('-v, --verbose', 'print per-file download progress', false)
    .option(
        '-d, --delay <ms>',
        'milliseconds to wait between requests (reduce to speed up, increase to avoid rate-limits)',
        '100'
    )
    .addHelpText(
        'after',
        `
Examples:
  $ epub-dl https://www.epub.pub/book/liberty-street-by-heather-marshall -o ./
  $ epub-dl https://www.epub.pub/book/liberty-street-by-heather-marshall -o ~/Books -v
  $ epub-dl https://asset.epub.pub/epub/liberty-street-by-heather-marshall.epub/ -o ./downloads
`
    )
    .action(async (url, options) => {
        const delayMs = parseInt(options.delay, 10);
        if (isNaN(delayMs) || delayMs < 0) {
            console.error('Error: --delay must be a non-negative integer (milliseconds)');
            process.exit(1);
        }

        try {
            const outputPath = await generateEpub(url, {
                output: options.output,
                verbose: options.verbose,
                delay: delayMs,
            });
            console.log(`\nDone! Saved to: ${outputPath}`);
        } catch (err) {
            console.error(`\nError: ${err.message}`);
            if (options.verbose) {
                console.error(err.stack);
            }
            process.exit(1);
        }
    });

program.parse();