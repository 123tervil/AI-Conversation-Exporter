/**
 * Gemini Thread Exporter
 * ------------------------------------------------------------------
 * Extracts the full text of a Gemini conversation and downloads it
 * as a .txt (or .md) file, working around the virtualized DOM that
 * breaks Ctrl+A / Ctrl+C / Ctrl+P on long threads.
 *
 * Trusted Types-safe: does not use innerHTML anywhere, since
 * gemini.google.com enforces require-trusted-types-for 'script'.
 *
 * HOW TO USE
 *   1. Open the Gemini conversation you want to export.
 *   2. Scroll to the very top. Wait for older messages to load.
 *   3. Open DevTools (F12 / Cmd+Opt+I), go to Console.
 *   4. If paste is blocked, type "allow pasting" and Enter.
 *   5. Paste this whole script and press Enter.
 *   6. Click "Start export" in the overlay.
 *   7. Wait. A .txt file downloads when finished.
 *
 * License: MIT. No affiliation with Google.
 */
(() => {
  'use strict';

  const CONFIG = {
    format: 'txt',                 // 'txt' or 'md'
    includeThinking: true,
    thinkingMinChars: 100,
    preserveCodeLanguage: true,
    preserveLatex: true,
    sweepStepRatio: 0.6,
    sweepWaitMs: 700,
    settleMs: 2000,
    maxIters: 2000,
    filenamePrefix: 'gemini-thread',
    confirmBeforeStart: true,
  };

  // ─────────────────────────────────────────────────────────────
  // Container
  // ─────────────────────────────────────────────────────────────
  const container =
    document.querySelector('infinite-scroller.chat-history') ||
    document.querySelector('infinite-scroller') ||
    document.querySelector('chat-window-content') ||
    document.querySelector('[class*="chat-history"]');

  if (!container) {
    alert(
      'Gemini Thread Exporter: could not find the conversation container.\n\n' +
      'Make sure you are on a specific conversation page.'
    );
    return;
  }

  const isReverse = getComputedStyle(container).flexDirection.includes('reverse');
  const maxScroll = container.scrollHeight - container.clientHeight;
  const topPos = isReverse ? -maxScroll : 0;
  const bottomPos = isReverse ? 0 : maxScroll;

  // ─────────────────────────────────────────────────────────────
  // Overlay UI — built without innerHTML (Trusted Types safe)
  // ─────────────────────────────────────────────────────────────
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .panel {
      font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background:#101418; color:#e6edf3; padding:16px; border-radius:12px;
      box-shadow:0 12px 40px rgba(0,0,0,.5); width:340px; border:1px solid #2a3038;
    }
    h3 { margin:0 0 10px; font-size:14px; color:#fff; font-weight:600; }
    .row { margin:8px 0; }
    .muted { color:#8b949e; font-size:12px; }
    .warn { color:#ffb84d; }
    .ok { color:#2fbf71; }
    .stat { font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size:12px; color:#7ee787; }
    button { background:#2a7fff; color:#fff; border:0; padding:8px 14px;
      border-radius:8px; cursor:pointer; font-size:13px; font-weight:500;
      margin-right:8px; }
    button:hover { background:#1e6ae0; }
    button.ghost { background:transparent; border:1px solid #30363d; color:#c9d1d9; }
    button.ghost:hover { background:#1a1f24; }
    .bar { height:6px; background:#1a1f24; border-radius:3px;
           overflow:hidden; margin-top:10px; }
    .bar > div { height:100%; width:0%;
      background:linear-gradient(90deg,#2a7fff,#7ee787);
      transition:width .3s; }
    ol { padding-left:18px; margin:8px 0; }
    li { margin:4px 0; font-size:12px; }
  `;
  shadow.appendChild(styleEl);

  const panel = document.createElement('div');
  panel.className = 'panel';

  const titleEl = document.createElement('h3');
  titleEl.textContent = 'Gemini Thread Exporter';

  const bodyEl = document.createElement('div');

  const barWrap = document.createElement('div');
  barWrap.className = 'bar';
  const bar = document.createElement('div');
  barWrap.appendChild(bar);

  const statEl = document.createElement('div');
  statEl.className = 'stat row';
  statEl.style.display = 'none';

  const actionsEl = document.createElement('div');
  actionsEl.className = 'row';

  panel.append(titleEl, bodyEl, barWrap, statEl, actionsEl);
  shadow.appendChild(panel);

  const setStat = t => { statEl.style.display = 'block'; statEl.textContent = t; };
  const setProgress = p => { bar.style.width = Math.min(100, Math.max(0, p)) + '%'; };

  function clearNode(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function clearActions() { clearNode(actionsEl); }
  function clearBody() { clearNode(bodyEl); }

  function makeDiv(cls, text) {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    if (text != null) d.textContent = text;
    return d;
  }

  function addButton(label, onClick, ghost = false) {
    const b = document.createElement('button');
    b.textContent = label;
    if (ghost) b.classList.add('ghost');
    b.addEventListener('click', onClick);
    actionsEl.appendChild(b);
    return b;
  }

  // ─────────────────────────────────────────────────────────────
  // Extraction
  // ─────────────────────────────────────────────────────────────
  const sandbox = document.createElement('div');
  sandbox.style.cssText = 'position:absolute;left:-99999px;top:0;width:800px;';
  document.body.appendChild(sandbox);

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function applyCodeFences(root) {
    root.querySelectorAll('pre').forEach(pre => {
      if (!pre.parentNode) return;
      const code = pre.querySelector('code') || pre;
      const cls = (code.className || '').toString();
      const m = cls.match(/language-([a-z0-9+#._-]+)/i);
      const lang = m ? m[1] : '';
      let body = (code.textContent || '').replace(/\n+$/, '');
      if (/^\s*```/.test(body)) return;
      const fenced = '```' + lang + '\n' + body + '\n```';
      pre.parentNode.replaceChild(document.createTextNode('\n' + fenced + '\n'), pre);
    });
  }

  function applyLatex(root) {
    root.querySelectorAll('.katex, .katex-display').forEach(k => {
      if (!k.parentNode) return;
      const ann = k.querySelector('annotation[encoding="application/x-tex"]');
      if (!ann) return;
      const tex = (ann.textContent || '').trim();
      if (!tex) return;
      const isBlock = k.classList.contains('katex-display') || k.closest('.katex-display');
      const wrapped = isBlock ? `\n$$${tex}$$\n` : `$${tex}$`;
      k.parentNode.replaceChild(document.createTextNode(wrapped), k);
    });
  }

  function cleanFromElement(el, opts = {}) {
    const clone = el.cloneNode(true);

    clone.querySelectorAll('button,[role="button"]').forEach(n => n.remove());

    // size-gated aria-hidden strip: keep large content nodes (collapsed panels).
    clone.querySelectorAll('[aria-hidden="true"]').forEach(n => {
      const t = (n.innerText || n.textContent || '').trim();
      if (t.length < 50) n.remove();
    });

    if (CONFIG.preserveCodeLanguage) applyCodeFences(clone);
    if (CONFIG.preserveLatex) applyLatex(clone);

    clearNode(sandbox);
    sandbox.appendChild(clone);
    let text = (clone.innerText || clone.textContent || '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (opts.minChars && text.length < opts.minChars) return '';
    return text;
  }

  function extractUser(el) {
    const inner = el.querySelector('.query-text') ||
                  el.querySelector('user-query-content') ||
                  el;
    const text = cleanFromElement(inner);
    return text ? { role: 'user', text } : null;
  }

  function extractModel(el) {
    const parts = [];

    if (CONFIG.includeThinking) {
      const think = el.querySelector('thinking-overlay') ||
                    el.querySelector('[class*="thinking"]');
      if (think) {
        const t = cleanFromElement(think, { minChars: CONFIG.thinkingMinChars });
        if (t) parts.push({ role: 'thinking', text: t });
      }
    }

    const respEl =
      el.querySelector('.response-content') ||
      el.querySelector('.response-container-content') ||
      el.querySelector('message-content') ||
      el.querySelector('response-container') ||
      el;

    const t = cleanFromElement(respEl);
    if (t) parts.push({ role: 'assistant', text: t });

    return parts;
  }

  function snapshot() {
    const nodes = container.querySelectorAll('user-query, model-response');
    const out = [];
    for (const el of nodes) {
      if (el.tagName === 'USER-QUERY') {
        const m = extractUser(el);
        if (m) out.push(m);
      } else if (el.tagName === 'MODEL-RESPONSE') {
        for (const p of extractModel(el)) out.push(p);
      }
    }
    return out;
  }

  // ─────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────
  const seen = new Map();
  let cancelled = false;

  function addAll(list) {
    for (const m of list) {
      const key = m.role + '::' + m.text.slice(0, 200);
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, { ...m, order: seen.size });
      } else if (m.text.length > existing.text.length) {
        existing.text = m.text;
      }
    }
  }

  function sortedMessages() {
    return [...seen.values()].sort((a, b) => a.order - b.order);
  }

  // ─────────────────────────────────────────────────────────────
  // Output
  // ─────────────────────────────────────────────────────────────
  function labelFor(m) {
    if (m.role === 'user') return 'USER';
    if (m.role === 'thinking') return 'GEMINI THINKING';
    if (m.role === 'assistant') return 'GEMINI';
    return 'UNKNOWN';
  }

  function formatOutput(messages) {
    const lines = [];
    const thinkCount = messages.filter(m => m.role === 'thinking').length;

    if (CONFIG.format === 'md') {
      lines.push('# Gemini Conversation Export\n');
      lines.push(`- Exported: ${new Date().toISOString()}`);
      lines.push(`- URL: ${location.href}`);
      lines.push(`- Blocks: ${messages.length}` +
        (thinkCount ? ` (incl. ${thinkCount} thinking)` : ''));
      lines.push('\n---\n');
      messages.forEach((m, i) => {
        const label = m.role === 'user' ? 'User'
                    : m.role === 'thinking' ? 'Gemini (thinking)'
                    : 'Gemini';
        lines.push(`## #${i + 1} — ${label}\n`);
        lines.push(m.text);
        lines.push('\n---\n');
      });
    } else {
      lines.push('Gemini Conversation Export');
      lines.push(`Exported: ${new Date().toISOString()}`);
      lines.push(`URL: ${location.href}`);
      lines.push(`Blocks: ${messages.length}` +
        (thinkCount ? ` (incl. ${thinkCount} thinking)` : ''));
      lines.push('');
      lines.push('='.repeat(60));
      lines.push('');
      messages.forEach((m, i) => {
        lines.push(`===== ${labelFor(m)} #${i + 1} =====`);
        lines.push(m.text);
        lines.push('');
      });
    }
    return lines.join('\n');
  }

  function download(text, filename) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ─────────────────────────────────────────────────────────────
  // Main
  // ─────────────────────────────────────────────────────────────
  async function run() {
    clearBody();
    bodyEl.appendChild(makeDiv('row muted', 'Settling DOM…'));
    clearActions();
    setProgress(0);
    setStat('0 messages');

    await sleep(CONFIG.settleMs);

    clearBody();
    bodyEl.appendChild(makeDiv('row muted', 'Sweeping thread…'));
    addButton('Cancel', () => { cancelled = true; }, true);

    const step = Math.max(200, Math.floor(container.clientHeight * CONFIG.sweepStepRatio));
    const totalSpan = Math.abs(bottomPos - topPos);

    container.scrollTop = topPos;
    await sleep(800);
    addAll(snapshot());

    let iter = 0, stuck = 0, pos = topPos;

    while (iter++ < CONFIG.maxIters && !cancelled && pos < bottomPos - 5) {
      const before = container.scrollTop;
      pos = Math.min(bottomPos, pos + step);
      container.scrollTop = pos;
      await sleep(CONFIG.sweepWaitMs);

      if (Math.abs(container.scrollTop - before) < 5) {
        stuck++;
        if (stuck > 20) break;
        await sleep(1500);
      } else {
        stuck = 0;
      }

      addAll(snapshot());

      const pct = Math.min(99, ((pos - topPos) / totalSpan) * 100);
      setProgress(pct);
      setStat(`${seen.size} blocks · ${Math.round(pct)}%`);
    }

    if (!cancelled) {
      container.scrollTop = bottomPos;
      await sleep(1500);
      addAll(snapshot());
    }

    while (sandbox.firstChild) sandbox.removeChild(sandbox.firstChild);

    const messages = sortedMessages();
    const out = formatOutput(messages);

    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    const ext = CONFIG.format === 'md' ? 'md' : 'txt';
    const filename = `${CONFIG.filenamePrefix}-${stamp}.${ext}`;

    setProgress(100);
    setStat(`${messages.length} blocks · ${(out.length / 1024).toFixed(1)} KB`);

    if (cancelled) {
      clearBody();
      bodyEl.appendChild(makeDiv('row warn', 'Cancelled before completion.'));
      clearActions();
      addButton('Download partial', () => download(out, filename));
      addButton('Close', () => host.remove(), true);
      return;
    }

    const firstRole = messages[0]?.role;
    clearBody();
    bodyEl.appendChild(makeDiv('row ok', 'Done — file downloaded.'));
    if (firstRole && firstRole !== 'user') {
      bodyEl.appendChild(makeDiv('row warn',
        '⚠ First block is not from the user. ' +
        'You may not have scrolled fully to the top before starting.'));
    }
    bodyEl.appendChild(makeDiv('row muted',
      'If the export looks incomplete, reload the page, scroll fully to the top ' +
      '(wait for older messages), then run again.'));

    clearActions();
    addButton('Download again', () => download(out, filename));
    addButton('Close', () => host.remove(), true);

    download(out, filename);
  }

  // ─────────────────────────────────────────────────────────────
  // Entry
  // ─────────────────────────────────────────────────────────────
  if (CONFIG.confirmBeforeStart) {
    clearBody();
    bodyEl.appendChild(makeDiv('row',
      'Before starting, make sure you have:'));

    const ol = document.createElement('ol');
    const li1 = document.createElement('li');
    li1.append('Scrolled to the ');
    const strong1 = document.createElement('strong');
    strong1.textContent = 'very top';
    li1.append(strong1);
    li1.append(' of this conversation');
    const li2 = document.createElement('li');
    li2.textContent = 'Waited for older messages to finish loading';
    ol.append(li1, li2);
    bodyEl.appendChild(ol);

    bodyEl.appendChild(makeDiv('row muted',
      'If you skip this, the export will be missing early messages.'));

    addButton('Start export', run);
    addButton('Cancel', () => host.remove(), true);
  } else {
    run();
  }
})();
