# VerbatimYT

> Export & translate YouTube transcripts as PDF, EPUB, DOCX, or TXT — in one click.

**Built by Kowsik Ratnagiri** &nbsp;|&nbsp; ![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg) ![Version](https://img.shields.io/badge/version-3.4-red) ![Platform](https://img.shields.io/badge/platform-Chrome%20%7C%20Firefox-blue)

---

## Features

- 📄 **Export as PDF** — Clean A4 formatted document with title, channel, date, word count, reading time and clickable video link
- 📖 **Export as EPUB** — E-reader ready format with video thumbnail as cover page and reading time
- 📝 **Export as DOCX** — Properly formatted Word document
- 📃 **Export as TXT** — Plain text with header block
- 🌐 **Translate transcript** — 20 languages including Hindi, Spanish, French, Arabic, Chinese, Japanese and more
- ⏱️ **Timestamp toggle** — Keep or remove timestamps from the export
- 📋 **Copy to clipboard** — One click copy without downloading a file
- 🔄 **Auto-detect captions** — Automatically opens transcript panel and reads content
- 📑 **Paragraph formatter** — Transcript formatted into readable paragraphs by default
- 🎨 **Oceanic theme** — Switch between red and teal accent in the popup
- 🛡️ **Works on Chrome & Firefox**

---

## Installation

### Chrome
1. Go to `chrome://extensions/`
2. Enable **Developer Mode** (top right toggle)
3. Click **"Load unpacked"**
4. Select the `verbatimyt-extension` folder
5. VerbatimYT icon appears in your toolbar ✅

### Firefox
1. Go to `about:debugging`
2. Click **"This Firefox"** on the left sidebar
3. Click **"Load Temporary Add-on..."**
4. Open the `verbatimyt-extension` folder and select `manifest.json`
5. VerbatimYT icon appears in your toolbar ✅

> **Firefox note:** Temporary add-ons are removed on restart.
> For permanent install, sign the extension at [addons.mozilla.org](https://addons.mozilla.org/developers/).

---

## How to Use

1. Open any YouTube video with captions enabled
2. Click the **VerbatimYT** icon in your toolbar
3. Choose your options:
   - **Caption language** — auto-detected
   - **Translate to** — pick a target language (optional)
   - **Keep timestamps** — toggle on/off
   - **Export format** — PDF, EPUB, DOCX, or TXT
4. Click **Export** or **📋 Copy**
5. File downloads automatically ✅

---

## Translation

Uses the [MyMemory API](https://mymemory.translated.net/) — free, no API key needed.

- **Limit:** 5,000 words/day per IP address
- **Languages:** English, Hindi, Spanish, French, German, Arabic, Chinese, Japanese, Korean, Portuguese, Russian, Italian, Turkish, Dutch, Polish, Tamil, Telugu, Malayalam, Bengali, Indonesian
- Resets daily at midnight UTC

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "No transcript found" | Video has no captions — try a different video |
| "Transcript panel not open" | Scroll down to the description first, then click Export |
| Export button does nothing | Make sure you're on a `youtube.com/watch?v=...` page |
| Translation not working | Daily limit reached — try again tomorrow |
| Firefox icon not showing | Reload from `about:debugging` → This Firefox → Reload |

**Debug mode:** Hold the 🔄 button for 2 seconds — copies a diagnostic report to your clipboard.

---

## Tech Stack

- **Manifest V3** — Chrome & Firefox compatible
- **jsPDF** — PDF generation (bundled, no CDN)
- **docx.js** — DOCX generation (bundled, no CDN)
- **JSZip** — EPUB generation (bundled, no CDN)
- **MyMemory API** — Free translation
- **YouTube transcript panel DOM** — No YouTube API key needed

---

## Author

**Kowsik Ratnagiri**

Built with ☕ and too many YouTube videos.

---

## Version History

| Version | Changes |
|---------|---------|
| v3.4 | EPUB with thumbnail cover, clickable PDF title, word count, chapter markers, paragraph formatter, oceanic theme, bug fixes |
| v3.2 | Updated for YouTube 2026 UI, fixed timestamp parsing, debug mode |
| v3.0 | Added DOCX, TXT, translation, timestamp toggle, copy to clipboard |
| v1.0 | Initial release — PDF export only |

---

## License

MIT License — © 2025 Kowsik Ratnagiri

Free to use, modify and distribute. See [LICENSE](LICENSE) for full details.
