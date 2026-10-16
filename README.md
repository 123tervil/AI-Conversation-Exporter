# AI Conversation Exporter

Extract the full text of a ChatGPT, DeepSeek, or Gemini conversation to a plain-text or Markdown file — working around the virtualized, lazy-loaded DOM that breaks `Ctrl+A`, `Ctrl+C`, `Ctrl+P`, and "Share" on long threads.

Three self-contained scripts. No install. No extension. No build step. Paste and go.

---

## Supported platforms

| Platform | Script | Reasoning captured | Notes |
|---|---|---|---|
| **ChatGPT** | [`export-chatgpt-thread-script.js`](./export-chatgpt-thread-script.js) | n/a | Writing blocks / inline documents supported. Collapsed or expanded. |
| **DeepSeek** | [`export-deepseek-thread-script.js`](./export-deepseek-thread-script.js) | ✅ (R1 thinking blocks) | Three-way split: user / reasoning / response. |
| **Gemini** | [`export-gemini-thread-script.js`](./export-gemini-thread-script.js) | ✅ (when present) | Thinking panel included if it has substantive content. |

All three scripts share the same interface: paste into the console, click **Start export** in the overlay, get a `.txt` (or `.md`) file.

---

## The problem

Long AI conversations are rendered with **virtualization**: the browser only keeps the messages currently in (or near) the viewport mounted in the DOM. Everything older is fetched from the server on demand, and only when the browser produces a real scroll event near the top of the thread.

That's why, on a long conversation:

- **`Ctrl+A → Ctrl+C`** copies only the currently rendered messages — often just the last few turns.
- **`Ctrl+P`** prints only one page.
- **"Share → Create link"** produces a public link, not a private export.
- **ChatGPT's Data Controls → Export data** works but emails a full account archive (hours of delay) and isn't a clean `.txt` of one conversation.

The browser's copy/print pipeline can't reach content that isn't mounted, and the mount trigger only fires on genuine user scroll input.

---

## How it works

The same approach on all three platforms:

1. Find the real transcript container.
2. Scroll it in small steps from top to bottom.
3. At each step, snapshot the visible messages.
4. Deduplicate by a stable per-message key (text prefix, message ID, or numeric turn key — depending on platform).
5. Emit everything in chronological order as a downloadable file.

The scroll is what forces the browser to mount older content; the snapshots collect each mounted window.

**The single most important step is scrolling to the very top of the conversation before you run the script.** Virtualization means older messages literally do not exist in the DOM until they've been scrolled into view. The script cannot see content that was never loaded. Every platform variant warns about this in the overlay — don't skip it.

---

## Quick start

### 1. Scroll to the top of the conversation *first*

Open the conversation you want to export. Scroll to the very top. **Wait.** ChatGPT, DeepSeek, and Gemini all lazy-load older messages as you approach the top — the topmost message will change as older content streams in. Scroll up again, wait again, repeat until the top stops changing.

**This step is not optional.** If you skip it, the export will be missing early messages.

### 2. Open the browser console

- **Chrome / Edge / Brave:** `F12` or `Cmd+Option+I` / `Ctrl+Shift+I` → **Console** tab
- **Safari:** enable Developer menu in Preferences → Advanced, then `Cmd+Option+C` → **Console** tab
- **Firefox:** `F12` → **Console** tab

### 3. Allow pasting (one-time per browser profile)

Modern browsers block paste into DevTools the first time. If you see a warning like *"Warning: Don't paste code you don't understand"*, type this into the console and press Enter:
