# epub-dl

CLI tool and Node.js library to download books from [epub.pub](https://www.epub.pub/) reader pages and save them as standards-compliant `.epub` files.

## Install

### From npm (recommended)

Requires Node.js ≥ 18.

```bash
npm install -g epub-dl
```

Verify the install:

```bash
epub-dl --version
```

### From source

```bash
# 1. Clone the repository
git clone https://github.com/HadenHiles/epub_pub_generator.git
cd epub_pub_generator

# 2. Install dependencies
npm install

# 3. Link the binary globally so `epub-dl` is available anywhere
npm link
```

To unlink later: `npm unlink -g epub-dl`

You can also run without linking by invoking Node directly from the repo root:

```bash
node bin/epub-dl.js <url> [options]
```

## CLI usage

```bash
epub-dl <url> [options]
```

**Arguments**

| Argument | Description                                                                 |
| -------- | --------------------------------------------------------------------------- |
| `<url>`  | epub.pub listing URL, viewer URL, **or** a direct `asset.epub.pub` base URL |

**Options**

| Flag                  | Default | Description                        |
| --------------------- | ------- | ---------------------------------- |
| `-o, --output <path>` | `.`     | Output folder or `.epub` file path |
| `-v, --verbose`       | false   | Print per-file download progress   |
| `-d, --delay <ms>`    | 100     | Milliseconds between requests      |
| `-V, --version`       |         | Print version                      |
| `-h, --help`          |         | Show help                          |

**Examples**

```bash
# Basic — saves to ./liberty-street-by-heather-marshall.epub
epub-dl https://www.epub.pub/book/liberty-street-by-heather-marshall -o ./

# Output folder with verbose progress
epub-dl https://www.epub.pub/book/liberty-street-by-heather-marshall \
  -o ~/Books \
  -v

# Pass the asset base URL directly (bypasses epub.pub page scrape)
epub-dl https://asset.epub.pub/epub/liberty-street-by-heather-marshall.epub/ -o ./
```

### Finding the asset URL manually

If Cloudflare blocks the epub.pub page fetch, open the page in a browser, view source (`⌘U` / `Ctrl+U`), and search for `asset.epub.pub`. You'll find a URL like:

```
https://asset.epub.pub/epub/my-book-title.epub/content.opf
```

Pass the base portion (up to and including `.epub/`) directly to `epub-dl`.

## Programmatic use

```js
import { generateEpub } from "epub-dl";

const outputPath = await generateEpub(
  "https://www.epub.pub/book/liberty-street-by-heather-marshall",
  {
    output: "./Books", // optional folder or exact .epub file path
    verbose: true, // optional
    delay: 100, // ms between requests, optional
    onProgress: ({ current, total, file }) => {
      process.stdout.write(`\r${current}/${total} ${file}`);
    },
  },
);

console.log("Saved to:", outputPath);
```

## How it works

1. Accepts a listing page, reader page, or direct asset URL.
2. Resolves the `asset.epub.pub` base URL from the page or book slug.
3. Downloads `META-INF/container.xml` and `content.opf` to discover all manifest files.
4. Downloads every file listed in the manifest (HTML chapters, images, fonts, CSS, etc.).
5. Assembles everything into a valid EPUB 2/3 zip archive using [JSZip](https://stuk.github.io/jszip/) — `mimetype` first, uncompressed, as required by the spec.

## Requirements

- Node.js ≥ 18

## License

MIT
