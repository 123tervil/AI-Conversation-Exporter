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

```
allow pasting
```

### 4. Paste the script for your platform

- ChatGPT → `export-chatgpt-thread-script.js`
- DeepSeek → `export-deepseek-thread-script.js`
- Gemini → `export-gemini-thread-script.js`

Copy the entire file, paste into the console, press Enter.

### 5. Click **Start export** in the overlay

A small panel appears in the bottom-right. Click **Start export**.

### 6. Wait for the file

When it finishes, a file like `chatgpt-thread-2026-10-16-14-30.txt` downloads automatically. Open it in any text editor.

---

## Platform notes

### ChatGPT

- **Container:** `.thread-scroll-container`
- **Message markers:** `<h4>` elements with text exactly `You said:` or `ChatGPT said:`
- **Scroll direction:** flex column-reverse — `scrollTop` is **negative** going up
- **Lazy-load trigger:** fires on genuine wheel events near the top edge, not on `scrollTop` assignment. You must scroll manually before running.
- **Writing blocks / inline documents:** captured whether visually expanded or collapsed. ChatGPT collapses with CSS clipping (`max-height` + `overflow: hidden`), not `display: none`, so the text is still in the DOM. The script preserves content inside `aria-hidden` wrappers when they're large enough to be real content (collapsed writing blocks mark their content wrapper `aria-hidden="true"`).
- **Data attribute shortcut:** when ChatGPT stores a clean plain-text copy on a rich block (`data-markdown-copy-text`), the exporter uses that directly — it's already stripped of UI chrome. When absent, the exporter falls back to cloning the wrapper and reading `innerText`.
- **Code blocks:** fenced as ` ```lang ` when `preserveCodeLanguage` is on.
- **LaTeX:** rewrapped as `$…$` / `$$…$$` from the KaTeX TeX annotation when `preserveLatex` is on.

### DeepSeek

- **Container:** `.ds-virtual-list` (also matches `.ds-scroll-area`)
- **Message key:** `[data-virtual-list-item-key]` — a stable numeric ID per turn. This gives exact ordering and lossless dedup.
- **Role classification (three-way):**
  - **User** → `.fbb737a4 > .ds-collapsible-text` with no `.ds-markdown` sibling
  - **Reasoning** → `.ds-think-content > .ds-markdown` (present on R1 and similar thinking models)
  - **Response** → `.ds-markdown.ds-assistant-message-main-content`
- **Reasoning and response share the same `item-key`.** Output uses `#N` for both, distinguished by label (`DEEPSEEK REASONING` vs `DEEPSEEK`).
- **Collapsed reasoning still present in DOM.** DeepSeek's "Thinking…" panel keeps its text rendered even when visually collapsed. No pre-expansion pass needed.
- **Toggle:** set `includeReasoning: false` to skip reasoning blocks and produce clean transcripts only.

### Gemini

- **Container:** `infinite-scroller.chat-history`
- **Message elements:** `<user-query>` and `<model-response>` custom elements. Role detection is free — the tag name is the role.
- **User text:** `.query-text`
- **Assistant text:** `.response-content` (falls back to `.response-container-content` / `<message-content>`)
- **Thinking:** `<thinking-overlay>` on every model response, but only populated on thinking models. Filtered out when empty or shorter than `thinkingMinChars`.
- **Trusted Types:** Gemini enforces `require-trusted-types-for 'script'`, which blocks every `innerHTML` assignment. The Gemini script is written without any HTML sinks — it builds UI with `createElement`, `textContent`, and `append`, and clears nodes with `removeChild` loops. If you fork and add UI code, follow the same pattern or it will throw `This document requires 'TrustedHTML' assignment`.
- **Scroll direction:** normal — `scrollTop = 0` at the top.

---

## Configuration

Every script exposes a `CONFIG` object at the top. All options are optional; defaults work for most cases.

| Option | Default | Meaning |
|---|---|---|
| `format` | `'txt'` | `'txt'` or `'md'`. Markdown keeps headings, lists, code fences, and math delimiters. |
| `sweepStepRatio` | `0.6` | Fraction of viewport to scroll per step. Lower = safer, slower. |
| `sweepWaitMs` | `700` | Wait between steps. Increase if you see missed messages. |
| `settleMs` | `2000`–`2500` | Wait after clicking Start before sweeping. |
| `maxIters` | `800`–`2000` | Safety cap on sweep steps. |
| `filenamePrefix` | platform-specific | Downloaded filename prefix. |
| `confirmBeforeStart` | `true` | Show Start button. Set `false` to auto-run. |

Platform-specific:

| Option | Platform | Default | Meaning |
|---|---|---|---|
| `preserveCodeLanguage` | all | `true` | Wrap code blocks in ` ```lang ` fences. |
| `preserveLatex` | ChatGPT, Gemini | `true` | Rewrap KaTeX math as `$…$` / `$$…$$`. |
| `includeReasoning` | DeepSeek | `true` | Include reasoning blocks in output. |
| `includeThinking` | Gemini | `true` | Include thinking panels when non-empty. |
| `thinkingMinChars` | Gemini | `100` | Ignore thinking panels shorter than this. |

---

## What gets captured

| Content type | Captured | Notes |
|---|---|---|
| Plain text messages | ✅ | Clean |
| Model reasoning / thinking | ✅ DeepSeek, ✅ Gemini | ChatGPT doesn't expose internal reasoning |
| Code blocks | ✅ | Fenced as ` ```lang ` when enabled |
| Tables | ✅ | Flattened to tab/newline text via `innerText` |
| Lists, headings, bold, links | ✅ | Text preserved; visual formatting flattened |
| Writing blocks / inline documents | ✅ ChatGPT | Collapsed or expanded; see ChatGPT notes |
| Inline & block LaTeX | ✅ ChatGPT, Gemini | Rewrapped from KaTeX TeX source |
| Inline images | ❌ | No text to capture |
| Side-panel artifacts (Canvas / Gemini Apps) | ❌ | Live outside the transcript container; not present in tested builds |
| Embedded iframes | ❌ | Only UI chrome in tested builds |

---

## Output format

Plain text by default:

```
ChatGPT Conversation Export
Exported: 2026-10-16T19:30:00.000Z
URL: https://chatgpt.com/c/xxxxxxxx
Messages: 175

============================================================

===== USER #1 =====
<your first message>

===== CHATGPT #2 =====
<assistant reply>

===== USER #3 =====
...
```

DeepSeek includes a third label:

```
===== DEEPSEEK REASONING #78 =====
<the model's scratchpad>

===== DEEPSEEK #78 =====
<the model's answer>
```

Set `CONFIG.format = 'md'` for a Markdown version with `## #N — User` headers.

---

## Troubleshooting

**The export is missing early messages.**
You didn't scroll to the top far enough before running. Reload the page, scroll to the top *slowly*, wait for each chunk of older messages to load, and only then run the script. This is the most common failure.

**The file is empty or tiny.**
Make sure you're on a specific conversation page. A fresh empty conversation has nothing to export.

**The console refuses paste.**
Type `allow pasting` and press Enter, then paste the script again. Browser safety feature, not a bug.

**Gemini: `Failed to set the 'innerHTML' property on 'ShadowRoot': This document requires 'TrustedHTML' assignment`.**
Gemini enforces Trusted Types. The shipped script doesn't use `innerHTML` anywhere. If you've modified the script and see this, replace any `innerHTML = ...` with `createElement` + `textContent` + `append`.

**A message lost formatting (code block language, math).**
Code fences and math are best-effort from `preserveCodeLanguage` and `preserveLatex`. If you find a case they miss, open an issue with a redacted sample.

**DeepSeek: reasoning blocks appear even though I don't want them.**
Set `includeReasoning: false` in the CONFIG at the top of the DeepSeek script.

**Gemini: thinking panels appear even though the model didn't think.**
Set `includeThinking: false`, or raise `thinkingMinChars` so empty panels are filtered out.

**The script hangs or stalls mid-sweep.**
Click Cancel to download a partial file, then reload and try again with a larger `sweepWaitMs` (e.g. `1200`). This usually means the platform was loading a large chunk and the script gave up too early.

**The DOM structure changed and nothing is found.**
Vendor markup changes. If a script stops finding messages, open DevTools, inspect a message, and file an issue with a redacted snippet of the surrounding DOM. See [Contributing](#contributing).

---

## Adding a new provider

The whole process for a new platform is four steps. It's the same for every provider, and it's documented here so anyone can extend this repo.

### 1. Run a diagnostic

Paste a small script into the console on the target platform that:

- Lists every scrollable element and its `scrollHeight` / `clientHeight` / `scrollTop` / class.
- Enumerates custom elements (tags containing a dash).
- Tries common message marker selectors (`[data-message-author-role]`, `[data-testid*="message"]`, `user-query`, `model-response`, etc.).
- Walks the DOM for text nodes containing likely role labels ("You said:", "Gemini said", etc.) and prints the ancestry chain for each.

### 2. Identify three things

- **Container:** the one scrollable element whose `scrollHeight` is huge and whose text is the conversation.
- **Message markers:** how the DOM distinguishes one message from the next. Prefer a stable, semantic signal (a data attribute, a custom element tag, an accessible label) over class names or index.
- **Role signal:** how user vs. assistant vs. reasoning is expressed. Sometimes it's a tag name (Gemini), sometimes a class (DeepSeek), sometimes a hidden `<h4>` label (ChatGPT).

### 3. Write the extractor

Copy an existing script and adapt `findContainer`, `snapshot`, and `extractOne` / `extractUser` / `extractModel`. Keep the overlay, sweep loop, dedup, and output logic. The structure is deliberately identical across platforms so a new provider only needs to change the extraction layer.

### 4. Test with a long conversation

Run the script on a conversation with at least 100 turns. Verify:

- The **first** message in the output is the first message in the conversation.
- The **last** message is the most recent.
- A distinctive phrase from mid-conversation appears exactly once.
- Collapsed panels (reasoning, writing blocks) are captured if they exist.

If any check fails, adjust the container, the marker selector, or the role classifier.

---

## Contributing

Pull requests welcome. A few notes:

- Keep each script **self-contained** — one file per platform, no shared module.
- **No build step.** Plain JavaScript that runs when pasted into a browser console.
- **No external dependencies.**
- **Trusted Types safe.** Don't use `innerHTML` on Gemini, and prefer not to use it anywhere — `createElement` + `textContent` is a portable habit.
- Test on a conversation of **100+ turns** before opening a PR.
- If you change a selector, explain what changed and how you verified it in the PR description.
- Update this README if you change a user-facing option or behavior.

### Reporting a broken selector

Vendor DOM changes are the most common issue. The most useful report includes:

- Platform and browser version
- A redacted snippet of the current markup around one user message and one assistant message
- What the script output vs. what you expected

Redact actual conversation content — a syntactic skeleton is enough.

---

## Disclaimer

Unofficial tools. Not affiliated with, endorsed by, or supported by OpenAI, DeepSeek, or Google. Use on your own conversations and in accordance with each platform's terms of service. The scripts run entirely in your browser and never send data anywhere.

---

## License

MIT — see [LICENSE](./LICENSE).
```

---
