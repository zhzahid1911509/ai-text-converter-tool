/* ============================================================
   AI TEXT CONVERTER PRO — script.js
   Advanced AI-text format detection • Mermaid diagram rendering
   • PDF / DOCX export • Fullscreen workspace
   ============================================================ */
(function () {
'use strict';

/* ============================================================
   1. UTILITIES
   ============================================================ */
const $  = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

function debounce(fn, delay) {
  let t;
  return function () {
    const args = arguments, ctx = this;
    clearTimeout(t);
    t = setTimeout(() => fn.apply(ctx, args), delay);
  };
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sanitizeFilename(name) {
  let s = String(name || 'document').trim();
  try {
    s = s.replace(/[^\p{L}\p{N}\s._-]/gu, '');
  } catch (e) {
    s = s.replace(/[\\/:*?"<>|]/g, '');
  }
  return s.replace(/\s+/g, '_').replace(/_+/g, '_').slice(0, 80) || 'document';
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(36);
}

function formatDateHuman(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

const ICONS = {
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>',
  info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
  warn:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>'
};

function toast(message, type) {
  type = type || 'info';
  const box = $('#toastContainer');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = (ICONS[type] || ICONS.info) + '<span>' + escapeHtml(message) + '</span>';
  box.appendChild(el);
  const kill = () => { el.style.opacity = '0'; el.style.transform = 'translateX(40px)'; setTimeout(() => el.remove(), 250); };
  el.addEventListener('click', kill);
  setTimeout(kill, 4200);
}

/* ============================================================
   2. THEME MANAGER
   ============================================================ */
const SUN = '<path d="M12 3a1 1 0 0 1 1 1v1a1 1 0 0 1-2 0V4a1 1 0 0 1 1-1zm0 15a1 1 0 0 1 1 1v1a1 1 0 0 1-2 0v-1a1 1 0 0 1 1-1zm9-6a1 1 0 0 1-1 1h-1a1 1 0 0 1 0-2h1a1 1 0 0 1 1 1zM6 12a1 1 0 0 1-1 1H4a1 1 0 0 1 0-2h1a1 1 0 0 1 1 1zm12.36-5.36a1 1 0 0 1 0 1.41l-.7.71a1 1 0 1 1-1.42-1.42l.71-.7a1 1 0 0 1 1.41 0zM7.76 16.24a1 1 0 0 1 0 1.42l-.71.7a1 1 0 0 1-1.41-1.41l.7-.71a1 1 0 0 1 1.42 0zm10.48.71a1 1 0 0 1-1.41 0l-.71-.71a1 1 0 0 1 1.42-1.41l.7.7a1 1 0 0 1 0 1.42zM7.76 7.76a1 1 0 0 1-1.42 0l-.7-.71a1 1 0 0 1 1.41-1.41l.71.7a1 1 0 0 1 0 1.42zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/>';
const MOON = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';

const ThemeManager = {
  init() {
    const saved = localStorage.getItem('atc-theme');
    const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.apply(saved || (dark ? 'dark' : 'light'), true);
    const t = $('#themeToggle');
    t.addEventListener('click', () => this.toggle());
    t.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.toggle(); }
    });
  },
  apply(theme, silent) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('atc-theme', theme);
    $('#themeIcon').innerHTML = theme === 'dark' ? MOON : SUN;
    DiagramEngine.setTheme(theme);
    if (!silent) App.refresh(true);
  },
  toggle() {
    const cur = document.documentElement.getAttribute('data-theme');
    this.apply(cur === 'dark' ? 'light' : 'dark');
  },
  isDark() { return document.documentElement.getAttribute('data-theme') === 'dark'; }
};

/* ============================================================
   3. FORMAT DETECTOR  —  advanced multi-signal analysis
   ============================================================ */
const FormatDetector = {

  /** Platform fingerprints — ordered by specificity */
  PLATFORM_SIGNALS: [
    { id: 'deepseek',   name: 'DeepSeek',   tests: [/<think>[\s\S]*?<\/think>/i, /^\s*Thought for \d+ seconds?/im, /深度思考/] },
    { id: 'perplexity', name: 'Perplexity', tests: [/^\s*Sources?\s*$/im, /\[\d+\]\s*(https?:\/\/|[a-z0-9-]+\.[a-z]{2,})/i, /Related\s+Questions/i, /Answer\s*\n+.*\[\d\]/] },
    { id: 'chatgpt',    name: 'ChatGPT',    tests: [/^\s*(You said:|ChatGPT said:)/im, /Ask ChatGPT/i, /Regenerate response/i, /【\d+†source】/, /\u200B/] },
    { id: 'gemini',     name: 'Gemini',     tests: [/Show drafts/i, /^\s*Google (Gemini|Bard)/im, /Double-check response/i] },
    { id: 'copilot',    name: 'Copilot',    tests: [/Microsoft Copilot/i, /^\s*Learn more\s*\n\s*\d+/im, /GitHub Copilot/i] },
    { id: 'grok',       name: 'Grok',       tests: [/\bGrok\b\s*(said|:)/i, /xAI/] },
    { id: 'claude',     name: 'Claude',     tests: [/\bClaude\b\s*(said|:)/i, /<artifact/i, /Anthropic/i] }
  ],

  /** UI artifacts that get copied along with the answer */
  ARTIFACTS: [
    { re: /^[ \t]*Copy code[ \t]*$/gim,                         label: 'Copy-code buttons' },
    { re: /^[ \t]*(Copy|Edit|Retry|Share|Regenerate)[ \t]*$/gim, label: 'UI button text', guard: true },
    { re: /^[ \t]*(You said:|ChatGPT said:|Assistant:|User:)[ \t]*$/gim, label: 'Chat role labels' },
    { re: /^[ \t]*Show drafts[ \t]*$/gim,                        label: 'Gemini drafts bar' },
    { re: /^[ \t]*(Was this response helpful\??|Ask ChatGPT|Double-check response)[ \t]*$/gim, label: 'Feedback prompts' },
    { re: /【\d+†[^】]*】/g,                                      label: 'Inline citation markers' },
    { re: /\[\^?\d+\^?\]\(#cite[^)]*\)/g,                        label: 'Citation links' }
  ],

  /** Guess the language of an unlabeled code block */
  guessLanguage(code) {
    const c = code.slice(0, 2500);
    const rules = [
      ['python',     /^\s*(from\s+\w[\w.]*\s+import|import\s+\w+|def\s+\w+\s*\(|class\s+\w+\s*[\(:]|print\s*\()/m],
      ['javascript', /\b(const|let|var)\s+\w+\s*=|=>|function\s+\w*\s*\(|console\.log\(|document\.|require\(/],
      ['typescript', /:\s*(string|number|boolean|any|void)\b|\binterface\s+\w+\s*\{|\bexport\s+type\b/],
      ['java',       /\b(public|private|protected)\s+(static\s+)?(class|void|int|String)\b|System\.out\.print/],
      ['csharp',     /\busing\s+System\b|\bnamespace\s+\w+|Console\.WriteLine/],
      ['cpp',        /#include\s*<[\w.]+>|std::|cout\s*<</],
      ['c',          /#include\s*<\w+\.h>|\bprintf\s*\(|\bint\s+main\s*\(/],
      ['go',         /\bpackage\s+main\b|\bfunc\s+\w+\s*\(|fmt\.Print/],
      ['rust',       /\bfn\s+\w+\s*\(|\blet\s+mut\b|println!/],
      ['php',        /<\?php|\$\w+\s*=|echo\s+/],
      ['ruby',       /\bdef\s+\w+\s*$|\bputs\b|\bend\s*$/m],
      ['swift',      /\bfunc\s+\w+\s*\(|\bvar\s+\w+\s*:\s*\w+|import\s+Foundation/],
      ['kotlin',     /\bfun\s+main\s*\(|\bval\s+\w+\s*=|println\(/],
      ['sql',        /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE)\b/i],
      ['bash',       /^\s*(#!\/bin\/(ba)?sh|sudo\s+|apt(-get)?\s+|npm\s+|yarn\s+|pip\s+install|cd\s+|ls\s+-)/m],
      ['dockerfile', /^\s*(FROM|RUN|CMD|ENTRYPOINT|COPY|WORKDIR)\s+/m],
      ['yaml',       /^\s*[\w-]+:\s*(\||>|$)/m],
      ['json',       /^\s*[\{\[][\s\S]*[\}\]]\s*$/],
      ['xml',        /^\s*<\?xml|<\/[a-z][\w-]*>/i],
      ['css',        /[.#]?[\w-]+\s*\{[^}]*:[^}]*;\s*\}/],
      ['r',          /<-\s*(function|c\()|library\(/],
      ['lua',        /\blocal\s+\w+\s*=|\bfunction\s+\w+\s*\(.*\)\s*$/m]
    ];
    for (const [lang, re] of rules) if (re.test(c)) return lang;
    return 'text';
  },

  /** Full analysis of raw pasted text */
  analyze(raw) {
    const r = {
      platform: null, platformName: 'Unknown', platformScore: 0,
      formats: [], fixes: [], stats: {}, isHtml: false, isEmpty: !raw || !raw.trim()
    };
    if (r.isEmpty) return r;

    /* -------- platform fingerprint -------- */
    let best = null, bestScore = 0;
    for (const p of this.PLATFORM_SIGNALS) {
      let score = 0;
      for (const t of p.tests) if (t.test(raw)) score++;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (best && bestScore > 0) { r.platform = best.id; r.platformName = best.name; r.platformScore = bestScore; }

    /* -------- structural format signals -------- */
    const add = (name, count) => r.formats.push({ name, count: count || 0 });

    const fenced   = (raw.match(/^[ \t]*```/gm) || []).length;
    const mermaidF = (raw.match(/```\s*mermaid/gi) || []).length;
    const headings = (raw.match(/^#{1,6}\s+\S/gm) || []).length;
    const setext   = (raw.match(/^[^\n]+\n(=+|-{3,})\s*$/gm) || []).length;
    const bullets  = (raw.match(/^[ \t]*([-*+•‣⁃▪●○]|\u2022)\s+\S/gm) || []).length;
    const numbered = (raw.match(/^[ \t]*[\d\u09E6-\u09EF]+[.)]\s+\S/gm) || []).length;
    const tableRow = (raw.match(/^[ \t]*\|.*\|[ \t]*$/gm) || []).length;
    const asciiTbl = (raw.match(/^[ \t]*\+[-+=]{3,}\+[ \t]*$/gm) || []).length;
    const unicodeTbl = (raw.match(/^[ \t]*[┌╔╭├╠┝└╚╰].*[┐╗╮┤╣┥┘╝╯][ \t]*$/gm) || []).length;
    const tsvRows  = (raw.match(/^[^\n]*\t[^\n]*$/gm) || []).length;
    const csvRows  = (raw.match(/^[^\n,]+(?:,"?[^"]*"?){1,}$/gm) || []).length;
    const htmlTbl  = (raw.match(/<table\b/gi) || []).length;
    const quotes   = (raw.match(/^[ \t]*>\s?/gm) || []).length;
    const bold     = (raw.match(/\*\*[^*\n]+\*\*|__[^_\n]+__/g) || []).length;
    const italics  = (raw.match(/(^|[^*])\*[^*\n]+\*($|[^*])/g) || []).length;
    const strike   = (raw.match(/~~[^~\n]+~~/g) || []).length;
    const inlineC  = (raw.match(/`[^`\n]+`/g) || []).length;
    const links    = (raw.match(/\[[^\]\n]+\]\([^)\s]+\)/g) || []).length;
    const images   = (raw.match(/!\[[^\]]*\]\([^)\s]+\)/g) || []).length;
    const hrs      = (raw.match(/^[ \t]*(-{3,}|\*{3,}|_{3,})[ \t]*$/gm) || []).length;
    const tasks    = (raw.match(/^[ \t]*[-*+]\s+\[[ xX]\]/gm) || []).length;
    const mathInl  = (raw.match(/\$[^$\n]+\$|\\\([\s\S]*?\\\)/g) || []).length;
    const mathBlk  = (raw.match(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]/g) || []).length;
    const bareMerm = (raw.match(/^[ \t]*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart)\b/gim) || []).length;
    const arrows   = (raw.match(/^[^\n`]*\S\s*(-->|->|→|=>|⇒)\s*\S[^\n]*$/gm) || []).length;
    const boxDraw  = (raw.match(/[┌┐└┘├┤┬┴┼─│╔╗╚╝═║▲▼◄►]/g) || []).length;
    const htmlTags = (raw.match(/<\/(p|div|li|ul|ol|table|h[1-6]|span|strong|em|code|pre)>/gi) || []).length;
    const thinkTag = (raw.match(/<think>[\s\S]*?<\/think>/gi) || []).length;
    const footnote = (raw.match(/^\[\^\w+\]:/gm) || []).length;

    r.stats = { fenced, headings, bullets, numbered, tableRow, quotes, bold, links, words: raw.trim().split(/\s+/).length };

    if (htmlTags > 2) { r.isHtml = true; add('HTML markup', htmlTags); }
    if (headings || setext) add('Headings', headings + setext);
    if (fenced >= 2) add('Code blocks', Math.floor(fenced / 2));
    if (mermaidF || bareMerm) add('Mermaid diagrams', mermaidF + bareMerm);
    if (bullets) add('Bullet lists', bullets);
    if (numbered) add('Numbered lists', numbered);
    if (tasks) add('Task lists', tasks);
    if (tableRow >= 2) add('Markdown tables', 1);
    if (asciiTbl) add('ASCII tables', asciiTbl);
    if (unicodeTbl) add('Unicode tables', unicodeTbl);
    if (tsvRows >= 2) add('TSV tables', tsvRows);
    if (csvRows >= 2) add('CSV tables', csvRows);
    if (htmlTbl) add('HTML tables', htmlTbl);
    if (quotes) add('Blockquotes', quotes);
    if (bold) add('Bold', bold);
    if (italics) add('Italic', italics);
    if (strike) add('Strikethrough', strike);
    if (inlineC) add('Inline code', inlineC);
    if (links) add('Links', links);
    if (images) add('Images', images);
    if (hrs) add('Rules', hrs);
    if (mathInl || mathBlk) add('LaTeX math', mathInl + mathBlk);
    if (footnote) add('Footnotes', footnote);
    if (boxDraw > 6) add('ASCII diagram', 1);
    if (!mermaidF && arrows >= 2) add('Arrow flow', arrows);
    if (thinkTag) add('Reasoning block', thinkTag);

    const markdownish = headings + fenced + bullets + numbered + tableRow + asciiTbl + unicodeTbl +
      tsvRows + csvRows + htmlTbl + quotes + bold + inlineC + links;
    if (markdownish === 0) add('Plain text', 1);

    return r;
  }
};

/* ============================================================
   4. TABLE ENGINE — Markdown, HTML, CSV, TSV and ASCII tables
   ============================================================ */
const TableEngine = {
  /** Split a pipe row without breaking escaped pipes or inline code. */
  splitPipeRow(line) {
    let source = String(line || '').trim();
    if (source.charAt(0) === '|') source = source.slice(1);
    if (source.endsWith('|') && !source.endsWith('\\|')) source = source.slice(0, -1);

    const cells = [];
    let cell = '', escaped = false, ticks = 0;
    for (let i = 0; i < source.length; i++) {
      const ch = source.charAt(i);
      if (escaped) { cell += ch; escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '`') { ticks = ticks ? 0 : 1; cell += ch; continue; }
      if (ch === '|' && !ticks) { cells.push(cell.trim()); cell = ''; continue; }
      cell += ch;
    }
    if (escaped) cell += '\\';
    cells.push(cell.trim());
    return cells;
  },

  isAlignmentRow(cells) {
    return cells.length > 0 && cells.every(c => /^:?-{2,}:?$/.test(String(c).replace(/\s/g, '')));
  },

  alignments(cells) {
    return cells.map(c => {
      const s = String(c).replace(/\s/g, '');
      if (/^:-+:$/.test(s)) return 'center';
      if (/^-+:$/.test(s)) return 'right';
      return 'left';
    });
  },

  isGridBorder(line) {
    const s = String(line || '').trim();
    return s.length >= 5 &&
      /^[+┌┬┐├┼┤└┴┘╔╦╗╠╬╣╚╩╝╭┯╮┝┿┥╰┷╯][-─═+┬┴┼╦╩╬┯┷┿ ]+[+┐┤┘╗╣╝╮┥╯]$/.test(s);
  },

  isGridRow(line) {
    const s = String(line || '').trim();
    return /^[|│║].*[|│║]$/.test(s) && !this.isGridBorder(s);
  },

  splitGridRow(line) {
    return String(line || '').trim().replace(/^[|│║]/, '').replace(/[|│║]$/, '')
      .split(/[|│║]/).map(c => c.trim());
  },

  /** RFC-4180-style delimited row parser, also used for TSV/semicolon. */
  splitDelimited(line, delimiter) {
    const cells = [];
    let cell = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line.charAt(i);
      if (ch === '"') {
        if (quoted && line.charAt(i + 1) === '"') { cell += '"'; i++; }
        else quoted = !quoted;
      } else if (ch === delimiter && !quoted) {
        cells.push(cell.trim()); cell = '';
      } else cell += ch;
    }
    cells.push(cell.trim());
    return cells;
  },

  escapeCell(value) {
    return String(value == null ? '' : value)
      .replace(/\r?\n+/g, '<br>')
      .replace(/\|/g, '\\|')
      .trim();
  },

  rectangularize(rows) {
    const cleaned = rows.filter(r => Array.isArray(r) && r.some(c => String(c).trim() !== ''));
    if (!cleaned.length) return [];
    const width = Math.max.apply(null, cleaned.map(r => r.length));
    return cleaned.map(r => {
      const row = r.slice(0, width);
      while (row.length < width) row.push('');
      return row;
    });
  },

  toMarkdown(rows, aligns, caption) {
    rows = this.rectangularize(rows);
    if (!rows.length || rows[0].length < 2) return '';
    const width = rows[0].length;
    aligns = aligns ? aligns.slice(0, width) : [];
    while (aligns.length < width) aligns.push('left');
    const rule = aligns.map(a => a === 'center' ? ':---:' : a === 'right' ? '---:' : '---');
    const output = [];
    if (caption) output.push('**' + String(caption).trim() + '**', '');
    output.push('| ' + rows[0].map(this.escapeCell).join(' | ') + ' |');
    output.push('| ' + rule.join(' | ') + ' |');
    rows.slice(1).forEach(r => output.push('| ' + r.map(this.escapeCell).join(' | ') + ' |'));
    return output.join('\n');
  },

  /** A valid pipe-table candidate, with or without outer pipes/separator. */
  pipeCandidate(lines, start) {
    const first = lines[start] || '';
    if (!first.includes('|') || this.isGridRow(first)) return null;
    const rows = [];
    let i = start;
    while (i < lines.length && lines[i].trim() && lines[i].includes('|') &&
           !/^[ \t]*[-*+]\s+/.test(lines[i])) {
      const row = this.splitPipeRow(lines[i]);
      if (row.length < 2) break;
      rows.push(row); i++;
    }
    if (rows.length < 2) return null;
    const hasRule = rows.length > 1 && this.isAlignmentRow(rows[1]);
    const width = rows[0].length;
    const dataRows = rows.filter((r, idx) => idx !== 1 || !hasRule);
    const consistent = dataRows.filter(r => r.length === width).length >= Math.min(2, dataRows.length);
    const outerPipes = /^\s*\|/.test(first) || /\|\s*$/.test(first);
    const headerLooksTabular = dataRows[0].every(c => c.length < 45 && !/[.!?]$/.test(c));
    // A two-row borderless pipe table is accepted when its header and data
    // have short, column-like cells; prose seldom has consistent pipes.
    if (!hasRule && !outerPipes && (!consistent || (dataRows.length < 3 && !headerLooksTabular))) return null;
    return {
      rows: dataRows,
      aligns: hasRule ? this.alignments(rows[1]) : new Array(width).fill('left'),
      end: i,
      repaired: !hasRule || !outerPipes
    };
  },

  gridCandidate(lines, start) {
    // Must OPEN with a real border. A Markdown row also starts and ends with
    // `|`, so accepting bare rows here hijacked every pipe table.
    if (!this.isGridBorder(lines[start])) return null;
    const rows = [];
    let i = start;
    while (i < lines.length && (this.isGridBorder(lines[i]) || this.isGridRow(lines[i]))) {
      if (this.isGridRow(lines[i])) {
        const cells = this.splitGridRow(lines[i]);
        // Drop Markdown-style alignment rows that may appear inside grids.
        if (!this.isAlignmentRow(cells)) rows.push(cells);
      }
      i++;
    }
    if (rows.length < 2 || Math.max.apply(null, rows.map(r => r.length)) < 2) return null;
    return { rows, aligns: null, end: i };
  },

  delimitedCandidate(lines, start, delimiter) {
    const first = String(lines[start] || '');
    if (!first.includes(delimiter)) return null;
    // Never treat markdown structure or prose sentences as delimited data.
    if (/^[ \t]*(#{1,6}\s|[-*+>|]\s|\d+[.)]\s|\$\$)/.test(first)) return null;
    const rows = [];
    let i = start, width = 0;
    while (i < lines.length && lines[i].trim() && lines[i].includes(delimiter) &&
           !/^[ \t]*(#{1,6}\s|[-*+>|]\s|\d+[.)]\s|\$\$)/.test(lines[i])) {
      const row = this.splitDelimited(lines[i], delimiter);
      if (row.length < 2) break;
      if (!width) width = row.length;
      if (row.length !== width) break;
      rows.push(row); i++;
    }
    if (rows.length < 2) return null;
    const cells = rows.reduce((all, r) => all.concat(r), []);
    const compact = cells.every(c => c.length < 45) &&
                    (cells.join(' ').length / cells.length) < 30;
    const prose = cells.some(c => /[.!?]\s/.test(c) || /[.!?]$/.test(c));
    const headerLooksTabular = rows[0].every(c => c.length < 45 && !/[.!?]$/.test(c));
    const hasDataSignal = rows.slice(1).some(r => r.some(c => /^[-+]?[$€£¥]?\d[\d,.% /:-]*$/.test(c)));
    if (prose || !compact) return null;
    if (delimiter !== '\t' && rows.length < 3 && !(headerLooksTabular && hasDataSignal)) return null;
    return { rows, aligns: null, end: i };
  },

  whitespaceCandidate(lines, start) {
    const split = l => l.trim().split(/\t+| {2,}/).map(c => c.trim());
    if (!/\t| {2,}/.test(lines[start] || '') || /^[ #>*+-]/.test(lines[start] || '')) return null;
    const rows = [];
    let i = start, width = 0;
    while (i < lines.length && lines[i].trim() && /\t| {2,}/.test(lines[i])) {
      const row = split(lines[i]);
      if (row.length < 2 || row.some(c => c.length > 70)) break;
      if (!width) width = row.length;
      if (row.length !== width) break;
      rows.push(row); i++;
    }
    if (rows.length < 3) return null;
    const hasData = rows.slice(1).some(r => r.some(c => /^[-+]?[$€£¥]?\d[\d,.% /:-]*$/.test(c)));
    if (!hasData && rows.length < 4) return null;
    // Discard a dashed ruler row from fixed-width tables.
    const data = rows.filter(r => !r.every(c => /^[-=:]+$/.test(c)));
    return data.length >= 2 ? { rows: data, aligns: null, end: i } : null;
  },

  /** Convert all supported plain-text table formats to canonical GFM tables. */
  normalize(text, fixes) {
    const lines = String(text || '').split('\n');
    const out = [];
    let i = 0, conversions = [];
    while (i < lines.length) {
      let c = this.gridCandidate(lines, i);
      let kind = c ? 'ASCII/Unicode grid table' : '';
      if (!c) { c = this.pipeCandidate(lines, i); kind = c ? 'Pipe table' : ''; }
      if (!c) { c = this.delimitedCandidate(lines, i, '\t'); kind = c ? 'TSV table' : ''; }
      if (!c) { c = this.delimitedCandidate(lines, i, ','); kind = c ? 'CSV table' : ''; }
      if (!c) { c = this.delimitedCandidate(lines, i, ';'); kind = c ? 'Semicolon table' : ''; }
      if (!c) { c = this.whitespaceCandidate(lines, i); kind = c ? 'Aligned text table' : ''; }

      if (c) {
        const md = this.toMarkdown(c.rows, c.aligns);
        if (md) {
          if (out.length && out[out.length - 1].trim()) out.push('');
          out.push(...md.split('\n'), '');
          conversions.push(kind + (c.repaired ? ' repaired' : ' converted'));
          i = c.end;
          continue;
        }
      }
      out.push(lines[i]); i++;
    }
    conversions.filter((v, idx, a) => a.indexOf(v) === idx).forEach(v => fixes.push(v));
    return out.join('\n').replace(/\n{4,}/g, '\n\n\n');
  },

  /** Extract HTML tables before Turndown so rows, merged cells and captions survive. */
  htmlTablesToTokens(html) {
    if (typeof DOMParser === 'undefined' || !/<table\b/i.test(html)) return { html, tables: [] };
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tables = [];
    Array.from(doc.querySelectorAll('table')).forEach((table, tableIndex) => {
      const grid = [];
      // Ignore rows belonging to nested tables; each nested table is handled
      // independently and must not leak cells into its parent grid.
      const trs = Array.from(table.querySelectorAll('tr')).filter(tr => tr.closest('table') === table);
      const caption = table.querySelector('caption') ? table.querySelector('caption').textContent.trim() : '';
      const td = typeof TurndownService !== 'undefined'
        ? new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' }) : null;
      if (td) td.addRule('tableBreak', { filter: 'br', replacement: () => '<br>' });

      trs.forEach((tr, r) => {
        if (!grid[r]) grid[r] = [];
        let col = 0;
        Array.from(tr.children).filter(c => /^(TH|TD)$/.test(c.tagName)).forEach(cell => {
          while (grid[r][col] !== undefined) col++;
          let value = td ? td.turndown(cell.innerHTML) : cell.textContent;
          value = value.replace(/\s*\n+\s*/g, '<br>').trim();
          const rs = Math.max(1, parseInt(cell.getAttribute('rowspan') || '1', 10));
          const cs = Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10));
          for (let rr = 0; rr < rs; rr++) {
            if (!grid[r + rr]) grid[r + rr] = [];
            for (let cc = 0; cc < cs; cc++) grid[r + rr][col + cc] = (rr === 0 && cc === 0) ? value : '';
          }
          col += cs;
        });
      });

      const markdown = this.toMarkdown(grid, null, caption);
      // Letters and digits only so Turndown cannot escape the placeholder.
      const token = 'ATCTABLETOKEN' + tableIndex + 'END';
      tables.push({ token, markdown });
      const p = doc.createElement('p'); p.textContent = token;
      table.replaceWith(p);
    });
    return { html: doc.body.innerHTML, tables };
  },

  /** Read a canonical Markdown table for the document export tokenizer. */
  readMarkdown(lines, start) {
    const candidate = this.pipeCandidate(lines, start);
    if (!candidate) return null;
    const rows = this.rectangularize(candidate.rows);
    if (!rows.length) return null;
    const aligns = candidate.aligns ? candidate.aligns.slice(0, rows[0].length) : [];
    while (aligns.length < rows[0].length) aligns.push('left');
    return {
      token: { type: 'table', headers: rows[0], rows: rows.slice(1), alignments: aligns },
      end: candidate.end
    };
  }
};

/* ============================================================
   4B. MATH ENGINE — block/inline LaTeX detection and conversion
   ============================================================ */
const MathEngine = {
  GREEK: {
    alpha:'α',beta:'β',gamma:'γ',delta:'δ',epsilon:'ε',varepsilon:'ε',zeta:'ζ',eta:'η',
    theta:'θ',vartheta:'ϑ',iota:'ι',kappa:'κ',lambda:'λ',mu:'μ',nu:'ν',xi:'ξ',pi:'π',
    rho:'ρ',sigma:'σ',tau:'τ',upsilon:'υ',phi:'φ',varphi:'φ',chi:'χ',psi:'ψ',omega:'ω',
    Gamma:'Γ',Delta:'Δ',Theta:'Θ',Lambda:'Λ',Xi:'Ξ',Pi:'Π',Sigma:'Σ',Upsilon:'Υ',
    Phi:'Φ',Psi:'Ψ',Omega:'Ω'
  },
  OPS: {
    pm:'±',mp:'∓',times:'×',div:'÷',cdot:'·',ast:'∗',star:'⋆',circ:'∘',bullet:'∙',
    leq:'≤',le:'≤',geq:'≥',ge:'≥',neq:'≠',ne:'≠',approx:'≈',equiv:'≡',sim:'∼',
    simeq:'≃',cong:'≅',propto:'∝',infty:'∞',partial:'∂',nabla:'∇',forall:'∀',
    exists:'∃',nexists:'∄',in:'∈',notin:'∉',ni:'∋',subset:'⊂',subseteq:'⊆',
    supset:'⊃',supseteq:'⊇',cup:'∪',cap:'∩',emptyset:'∅',varnothing:'∅',
    sum:'∑',prod:'∏',coprod:'∐',int:'∫',iint:'∬',iiint:'∭',oint:'∮',
    angle:'∠',perp:'⊥',parallel:'∥',therefore:'∴',because:'∵',
    ldots:'…',dots:'…',cdots:'⋯',vdots:'⋮',ddots:'⋱',
    rightarrow:'→',to:'→',longrightarrow:'→',leftarrow:'←',longleftarrow:'←',
    leftrightarrow:'↔',Rightarrow:'⇒',implies:'⇒',Leftarrow:'⇐',
    Leftrightarrow:'⇔',iff:'⇔',mapsto:'↦',
    land:'∧',wedge:'∧',lor:'∨',vee:'∨',lnot:'¬',neg:'¬',
    oplus:'⊕',otimes:'⊗',odot:'⊙',prime:'′',aleph:'ℵ',hbar:'ℏ',ell:'ℓ',
    Re:'ℜ',Im:'ℑ',wp:'℘',deg:'°',degree:'°',
    lfloor:'⌊',rfloor:'⌋',lceil:'⌈',rceil:'⌉',langle:'⟨',rangle:'⟩'
  },
  SUP: {'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹',
    '+':'⁺','-':'⁻','=':'⁼','(':'⁽',')':'⁾','n':'ⁿ','i':'ⁱ','a':'ᵃ','b':'ᵇ','c':'ᶜ',
    'd':'ᵈ','e':'ᵉ','f':'ᶠ','g':'ᵍ','h':'ʰ','j':'ʲ','k':'ᵏ','l':'ˡ','m':'ᵐ','o':'ᵒ',
    'p':'ᵖ','r':'ʳ','s':'ˢ','t':'ᵗ','u':'ᵘ','v':'ᵛ','w':'ʷ','x':'ˣ','y':'ʸ','z':'ᶻ','T':'ᵀ'},
  SUB: {'0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉',
    '+':'₊','-':'₋','=':'₌','(':'₍',')':'₎','a':'ₐ','e':'ₑ','h':'ₕ','i':'ᵢ','j':'ⱼ',
    'k':'ₖ','l':'ₗ','m':'ₘ','n':'ₙ','o':'ₒ','p':'ₚ','r':'ᵣ','s':'ₛ','t':'ₜ','u':'ᵤ',
    'v':'ᵥ','x':'ₓ'},

  /** Symbols jsPDF's WinAnsi core fonts cannot encode. */
  ASCII_MAP: {
    '✅':'[Yes]','✔':'[Yes]','✓':'[v]','☑':'[x]','❌':'[No]','✖':'[x]','✗':'[x]',
    '❎':'[No]','☐':'[ ]','⚠':'(!)','★':'*','☆':'*','•':'-','‣':'-','▪':'-','●':'-',
    '○':'o','◦':'-','–':'-','—':'-','…':'...','′':"'",'″':'"','🔴':'(o)','🟢':'(o)',
    '→':'->','←':'<-','↔':'<->','⇒':'=>','⇐':'<=','⇔':'<=>','↦':'|->',
    '≤':'<=','≥':'>=','≠':'!=','≈':'~=','≡':'==','∼':'~','≃':'~=','≅':'~=',
    '∞':'inf','√':'sqrt','∑':'sum','∏':'prod','∫':'int','∬':'iint','∮':'oint',
    '∂':'d','∇':'grad','∈':' in ','∉':' not in ','∋':' owns ',
    '⊂':' subset ','⊆':' subseteq ','⊃':' supset ','⊇':' supseteq ',
    '∪':' U ','∩':' n ','∅':'{}','∀':'for all ','∃':'exists ','∄':'not exists ',
    '∧':' and ','∨':' or ','¬':'not ','⊕':'(+)','⊗':'(x)','⊙':'(.)',
    '∝':' prop ','∠':'angle ','⊥':' perp ','∥':' || ','∴':'therefore ','∵':'because ',
    '⋯':'...','⋮':'...','⋱':'...','∗':'*','⋆':'*','∘':'o','∙':'.','∓':'-/+','∐':'coprod',
    'ℵ':'aleph','ℏ':'hbar','ℓ':'l','ℜ':'Re','ℑ':'Im','℘':'P','∭':'iiint',
    '⌊':'|_','⌋':'_|','⌈':'|~','⌉':'~|','⟨':'<','⟩':'>',
    '⁰':'^0','¹':'^1','²':'^2','³':'^3','⁴':'^4','⁵':'^5','⁶':'^6','⁷':'^7',
    '⁸':'^8','⁹':'^9','ⁿ':'^n','ⁱ':'^i','⁺':'^+','⁻':'^-','⁼':'^=','⁽':'^(','⁾':'^)',
    '₀':'_0','₁':'_1','₂':'_2','₃':'_3','₄':'_4','₅':'_5','₆':'_6','₇':'_7',
    '₈':'_8','₉':'_9','₊':'_+','₋':'_-','₌':'_=','₍':'_(','₎':'_)',
    'α':'alpha','β':'beta','γ':'gamma','δ':'delta','ε':'epsilon','ζ':'zeta','η':'eta',
    'θ':'theta','ϑ':'theta','ι':'iota','κ':'kappa','λ':'lambda','μ':'mu','ν':'nu',
    'ξ':'xi','π':'pi','ρ':'rho','σ':'sigma','τ':'tau','υ':'upsilon','φ':'phi',
    'χ':'chi','ψ':'psi','ω':'omega','Γ':'Gamma','Δ':'Delta','Θ':'Theta','Λ':'Lambda',
    'Ξ':'Xi','Π':'Pi','Σ':'Sigma','Υ':'Upsilon','Φ':'Phi','Ψ':'Psi','Ω':'Omega'
  },

  BLOCK_ENVS: 'equation|align|aligned|gather|multline|split|cases|array|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|smallmatrix|eqnarray',

  /** Read a brace group, a control sequence, or a single character. */
  group(s, i) {
    while (s[i] === ' ') i++;
    if (s[i] === '{') {
      let depth = 1, j = i + 1;
      while (j < s.length && depth) {
        if (s[j] === '{') depth++;
        else if (s[j] === '}') depth--;
        j++;
      }
      return { body: s.slice(i + 1, j - 1), end: j };
    }
    if (s[i] === '\\') {
      const m = /^\\[a-zA-Z]+/.exec(s.slice(i));
      if (m) return { body: m[0], end: i + m[0].length };
    }
    return { body: s[i] || '', end: i + (s[i] ? 1 : 0) };
  },

  sup(t) {
    const chars = String(t).split('');
    return chars.length && chars.every(c => this.SUP[c])
      ? chars.map(c => this.SUP[c]).join('') : '^(' + t + ')';
  },
  sub(t) {
    const chars = String(t).split('');
    return chars.length && chars.every(c => this.SUB[c])
      ? chars.map(c => this.SUB[c]).join('') : '_(' + t + ')';
  },

  /** Expand structural LaTeX (fractions, roots, scripts, accents). */
  expand(s) {
    let out = '', i = 0;
    const ACCENTS = { hat:'\u0302', bar:'\u0304', overline:'\u0304', vec:'\u20D7',
                      tilde:'\u0303', dot:'\u0307', ddot:'\u0308', check:'\u030C',
                      acute:'\u0301', grave:'\u0300' };
    const PASSTHRU = { text:1, mathrm:1, mathbf:1, mathit:1, mathsf:1, mathtt:1, mathcal:1,
                       mathbb:1, mathfrak:1, boldsymbol:1, operatorname:1, textbf:1,
                       textit:1, textrm:1, mbox:1, displaystyle:0 };
    while (i < s.length) {
      const ch = s[i];
      if (ch === '\\') {
        const m = /^\\([a-zA-Z]+)/.exec(s.slice(i));
        if (m) {
          const name = m[1];
          let j = i + m[0].length;
          if (name === 'frac' || name === 'dfrac' || name === 'tfrac' || name === 'cfrac') {
            const a = this.group(s, j), b = this.group(s, a.end);
            const top = this.expand(a.body), bottom = this.expand(b.body);
            const wrap = v => /^[\w.]+$/.test(v) ? v : '(' + v + ')';
            out += wrap(top) + '/' + wrap(bottom);
            i = b.end; continue;
          }
          if (name === 'sqrt') {
            let idx = '';
            if (s[j] === '[') { const e = s.indexOf(']', j); if (e > 0) { idx = s.slice(j + 1, e); j = e + 1; } }
            const a = this.group(s, j);
            out += (idx ? this.sup(idx) : '') + '√(' + this.expand(a.body) + ')';
            i = a.end; continue;
          }
          if (PASSTHRU[name]) {
            const a = this.group(s, j);
            out += this.expand(a.body); i = a.end; continue;
          }
          if (ACCENTS[name]) {
            const a = this.group(s, j);
            out += this.expand(a.body) + ACCENTS[name]; i = a.end; continue;
          }
          out += m[0]; i += m[0].length; continue;
        }
        out += ch; i++; continue;
      }
      if (ch === '^' || ch === '_') {
        const a = this.group(s, i + 1);
        const inner = this.expand(a.body);
        out += (ch === '^' ? this.sup(inner) : this.sub(inner));
        i = a.end; continue;
      }
      out += ch; i++;
    }
    return out;
  },

  /** LaTeX → readable Unicode (used for DOCX and non-KaTeX fallback). */
  toUnicode(latex) {
    let s = String(latex == null ? '' : latex);
    s = s.replace(/(^|[^\\])%.*$/gm, '$1');
    s = s.replace(/\\begin\{[^}]*\}|\\end\{[^}]*\}/g, '\n');
    s = s.replace(/\\\\/g, '\n');
    s = s.replace(/\\(left|right|bigl?|Bigl?|biggl?|Biggl?)\b\s*/g, '');
    s = s.replace(/\\[,;:!>]/g, ' ').replace(/\\quad/g, '  ').replace(/\\qquad/g, '    ');
    s = s.replace(/&/g, '  ');
    s = this.expand(s);
    s = s.replace(/\\([a-zA-Z]+)/g, (m, n) => this.GREEK[n] || this.OPS[n] || n);
    s = s.replace(/\\([%$#&_{}])/g, '$1');
    s = s.replace(/[{}]/g, '');
    return s.split('\n').map(l => l.replace(/[ \t]{2,}/g, ' ').trim())
            .filter(l => l !== '').join('\n').trim();
  },

  /** Latin-1 safe text: jsPDF core fonts cannot encode astral glyphs. */
  asciiSafe(text) {
    let s = String(text == null ? '' : text);
    if (!/[^\x00-\xFF]/.test(s)) return s;
    s = s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, m => (this.ASCII_MAP[m] !== undefined ? this.ASCII_MAP[m] : ''));
    s = s.replace(/[^\x00-\xFF]/g, c => (this.ASCII_MAP[c] !== undefined ? this.ASCII_MAP[c] : ''));
    return s.replace(/[ \t]{2,}/g, ' ');
  },

  toAscii(latex) { return this.asciiSafe(this.toUnicode(latex)); },

  /** Render one expression with KaTeX, degrading to Unicode text. */
  renderHtml(latex, display) {
    if (typeof katex !== 'undefined') {
      try {
        return katex.renderToString(latex, {
          displayMode: !!display, throwOnError: false, strict: 'ignore',
          trust: false, output: 'htmlAndMathml'
        });
      } catch (e) { /* fall through to text */ }
    }
    return '<span class="math-fallback">' + escapeHtml(this.toUnicode(latex)) + '</span>';
  },

  /** Scan markdown for every math form, replacing each with a safe token.
   *  Tokens are mixed-case so heading/list/table repairs cannot match them. */
  scan(text, prefix, fixes) {
    const lines = String(text == null ? '' : text).split('\n');
    const out = [], items = [];
    const envOpen = new RegExp('^[ \\t]*\\\\begin\\{(' + this.BLOCK_ENVS + ')\\*?\\}');
    let i = 0;

    const add = (latex, display) => {
      const token = prefix + items.length + 'End';
      items.push({ token: token, latex: String(latex).trim(), display: !!display });
      return token;
    };

    while (i < lines.length) {
      const line = lines[i];

      // Fenced blocks: math fences become equations, everything else stays opaque.
      const fence = line.match(/^[ \t]*(`{3,}|~{3,})[ \t]*([A-Za-z0-9+#._-]*)/);
      if (fence) {
        const mark = fence[1].charAt(0);
        const lang = (fence[2] || '').toLowerCase();
        const close = new RegExp('^[ \\t]*' + (mark === '`' ? '`' : '~') + '{3,}[ \\t]*$');
        const body = [];
        i++;
        while (i < lines.length && !close.test(lines[i])) { body.push(lines[i]); i++; }
        i++;
        if (lang === 'math' || lang === 'latex' || lang === 'tex' || lang === 'katex') {
          out.push('', add(body.join('\n'), true), '');
          if (fixes) fixes.push('Math fence → equation');
        } else {
          out.push(line);
          body.forEach(b => out.push(b));
          out.push(mark.repeat(3));
        }
        continue;
      }

      // `$$` alone on a line — the multi-line block form that used to break.
      if (/^[ \t]*\$\$[ \t]*$/.test(line)) {
        const body = []; i++;
        while (i < lines.length && !/^[ \t]*\$\$[ \t]*$/.test(lines[i])) { body.push(lines[i]); i++; }
        i++;
        out.push('', add(body.join('\n'), true), '');
        continue;
      }

      // `\[` alone on a line.
      if (/^[ \t]*\\\[[ \t]*$/.test(line)) {
        const body = []; i++;
        while (i < lines.length && !/^[ \t]*\\\][ \t]*$/.test(lines[i])) { body.push(lines[i]); i++; }
        i++;
        out.push('', add(body.join('\n'), true), '');
        if (fixes) fixes.push('LaTeX delimiters');
        continue;
      }

      // \begin{env} … \end{env}
      const env = line.match(envOpen);
      if (env) {
        const stop = new RegExp('\\\\end\\{' + env[1] + '\\*?\\}');
        const body = [line];
        let closed = stop.test(line);
        i++;
        while (i < lines.length && !closed) { body.push(lines[i]); closed = stop.test(lines[i]); i++; }
        out.push('', add(body.join('\n'), true), '');
        if (fixes) fixes.push('LaTeX environment');
        continue;
      }

      out.push(this.scanInline(line, add));
      i++;
    }
    return { text: out.join('\n'), items: items };
  },

  /** Inline pass: honours code spans and ignores currency amounts. */
  scanInline(line, add) {
    if (line.indexOf('$') < 0 && line.indexOf('\\(') < 0 && line.indexOf('\\[') < 0) return line;
    let out = '', i = 0;
    while (i < line.length) {
      const ch = line.charAt(i);

      if (ch === '`') {
        const end = line.indexOf('`', i + 1);
        if (end < 0) { out += line.slice(i); break; }
        out += line.slice(i, end + 1); i = end + 1; continue;
      }
      if (ch === '\\' && line.charAt(i + 1) === '(') {
        const end = line.indexOf('\\)', i + 2);
        if (end > 0) { out += add(line.slice(i + 2, end), false); i = end + 2; continue; }
      }
      if (ch === '\\' && line.charAt(i + 1) === '[') {
        const end = line.indexOf('\\]', i + 2);
        if (end > 0) { out += add(line.slice(i + 2, end), true); i = end + 2; continue; }
      }
      if (ch === '$') {
        const dbl = /^\$\$([^$]+?)\$\$/.exec(line.slice(i));
        if (dbl) { out += add(dbl[1], true); i += dbl[0].length; continue; }
        const one = /^\$([^\s$][^$\n]{0,300}?)\$/.exec(line.slice(i));
        if (one) {
          const body = one[1];
          const after = line.charAt(i + one[0].length);
          const mathy = /[\\^_={}]|[a-zA-Z][+\-*/][a-zA-Z0-9]/.test(body);
          // Reject "$5 to $10" style currency runs.
          if (mathy && !/\s$/.test(body) && !/^[\d,.]+$/.test(body) && !/\d/.test(after)) {
            out += add(body, false); i += one[0].length; continue;
          }
        }
      }
      out += ch; i++;
    }
    return out;
  },

  /** Rebuild canonical `$$…$$` / `$…$` markdown from tokens. */
  restore(text, items) {
    let out = String(text == null ? '' : text);
    items.forEach(it => {
      const value = it.display ? '\n\n$$\n' + it.latex + '\n$$\n\n' : '$' + it.latex + '$';
      out = out.split(it.token).join(value);
    });
    return out.replace(/\n{4,}/g, '\n\n\n');
  },

  /** Swap preview placeholders for rendered KaTeX after sanitisation. */
  mount(root, items) {
    if (!items || !items.length) return 0;
    let mounted = 0;
    items.forEach(item => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      let node = null, target = null;
      while ((node = walker.nextNode())) {
        if (node.nodeValue && node.nodeValue.indexOf(item.token) >= 0) { target = node; break; }
      }
      if (!target) return;
      const html = this.renderHtml(item.latex, item.display);
      if (item.display) {
        const holder = document.createElement('div');
        holder.className = 'math-block';
        holder.setAttribute('data-latex', item.latex);
        holder.innerHTML = html;
        const para = target.parentElement && target.parentElement.closest('p');
        if (para && para.textContent.trim() === item.token) para.replaceWith(holder);
        else target.replaceWith(holder);
      } else {
        const span = document.createElement('span');
        span.className = 'math-inline';
        span.innerHTML = html;
        const at = target.nodeValue.indexOf(item.token);
        const tail = target.splitText(at);
        tail.nodeValue = tail.nodeValue.slice(item.token.length);
        tail.parentNode.insertBefore(span, tail);
      }
      mounted++;
    });
    return mounted;
  }
};

/* ============================================================
   5. NORMALIZER  —  fence-aware auto-repair pipeline
   ============================================================ */
const Normalizer = {

  /** Split text into fenced-code and plain segments so transforms never
   *  corrupt code. Returns [{type:'code'|'text', raw, lang, body}] */
  split(text) {
    const out = [];
    const lines = text.split('\n');
    let buf = [], i = 0;
    while (i < lines.length) {
      const m = lines[i].match(/^([ \t]*)(`{3,}|~{3,})[ \t]*([\w+#.-]*)[ \t]*$/);
      if (m) {
        if (buf.length) { out.push({ type: 'text', body: buf.join('\n') }); buf = []; }
        const fence = m[2][0].repeat(3), lang = m[3] || '';
        const code = [];
        i++;
        while (i < lines.length && !new RegExp('^[ \\t]*' + m[2][0] + '{3,}[ \\t]*$').test(lines[i])) {
          code.push(lines[i]); i++;
        }
        i++; // closing fence
        out.push({ type: 'code', lang, body: code.join('\n'), fence });
      } else { buf.push(lines[i]); i++; }
    }
    if (buf.length) out.push({ type: 'text', body: buf.join('\n') });
    return out;
  },

  join(parts) {
    return parts.map(p => p.type === 'code'
      ? '```' + (p.lang || '') + '\n' + p.body + '\n```'
      : p.body
    ).join('\n\n').replace(/\n{4,}/g, '\n\n\n');
  },

  /* ---------- individual repair passes ---------- */

  stripArtifacts(text, fixes) {
    let out = text;
    FormatDetector.ARTIFACTS.forEach(a => {
      if (a.guard) {
        // only remove standalone UI words when adjacent to a code fence
        out = out.replace(/^[ \t]*(Copy|Edit|Retry|Share|Regenerate)[ \t]*\n(?=[ \t]*```)/gim, () => {
          if (fixes.indexOf(a.label) < 0) fixes.push(a.label);
          return '';
        });
        return;
      }
      if (a.re.test(out)) {
        a.re.lastIndex = 0;
        out = out.replace(a.re, '');
        if (fixes.indexOf(a.label) < 0) fixes.push(a.label);
      }
      a.re.lastIndex = 0;
    });
    return out;
  },

  unicodeCleanup(text, fixes) {
    const before = text;
    let out = text
      .replace(/\r\n?/g, '\n')
      // Only remove invisible zero-width spaces; preserve ZWNJ (\u200C) and ZWJ (\u200D)
      // which are essential for Bengali, Indic, and Arabic conjuncts/ligatures.
      .replace(/[\u200B\u2060\uFEFF]/g, '')
      .replace(/\u00A0/g, ' ')
      .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
      .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
      .replace(/\u2026/g, '...')
      .replace(/[ \t]+$/gm, '');
    if (out !== before) fixes.push('Unicode cleanup');
    return out;
  },

  extractThinking(text, fixes) {
    if (!/<think>/i.test(text)) return text;
    fixes.push('Reasoning block removed');
    return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  },

  htmlToMarkdown(text, fixes) {
    try {
      if (typeof TurndownService === 'undefined') return text;
      const clean = (typeof DOMPurify !== 'undefined')
        ? DOMPurify.sanitize(text, { USE_PROFILES: { html: true } })
        : text;
      const extracted = TableEngine.htmlTablesToTokens(clean);
      const td = new TurndownService({
        headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*'
      });
      td.addRule('strike', {
        filter: ['del', 's'],
        replacement: c => '~~' + c + '~~'
      });
      let md = td.turndown(extracted.html);
      extracted.tables.forEach(item => {
        md = md.replace(item.token, '\n\n' + item.markdown + '\n\n');
      });
      fixes.push('HTML → Markdown');
      if (extracted.tables.length) fixes.push('HTML table preserved');
      return md;
    } catch (e) { return text; }
  },

  fixHeadings(text, fixes) {
    let out = text, changed = false;
    // "##Heading" -> "## Heading"
    out = out.replace(/^(#{1,6})([^\s#])/gm, (m, h, c) => { changed = true; return h + ' ' + c; });
    // Setext -> ATX
    out = out.replace(/^([^\n]{1,120})\n={3,}[ \t]*$/gm, (m, t) => { changed = true; return '# ' + t.trim(); });
    out = out.replace(/^([^\n|>+*-][^\n]{0,120})\n-{3,}[ \t]*$/gm, (m, t) => { changed = true; return '## ' + t.trim(); });
    // Bold-only line acting as a heading:  **Section Title**
    out = out.replace(/^[ \t]*\*\*([^*\n]{3,90})\*\*[ \t]*:?[ \t]*$/gm, (m, t) => {
      changed = true; return '### ' + t.trim();
    });
    // ALL-CAPS standalone line -> heading
    out = out.replace(/^([A-Z][A-Z0-9 ,'&/()-]{4,70})[ \t]*$/gm, (m, t) => {
      if (/^(NOTE|TIP|WARNING|IMPORTANT|TODO|FIXME)\b/.test(t)) return m;
      changed = true;
      const nice = t.charAt(0) + t.slice(1).toLowerCase();
      return '## ' + nice.replace(/\b\w/g, ch => ch.toUpperCase());
    });
    if (changed) fixes.push('Heading structure');
    return out;
  },

  fixLists(text, fixes) {
    let out = text, changed = false;
    out = out.replace(/^([ \t]*)[•‣⁃▪●○◦·][ \t]+/gm, (m, ind) => { changed = true; return ind + '- '; });
    out = out.replace(/^([ \t]*)\*[ \t]+(?=\S)/gm, (m, ind) => { changed = true; return ind + '- '; });
    out = out.replace(/^([ \t]*)([\d\u09E6-\u09EF]+)\)[ \t]+/gm, (m, ind, n) => { changed = true; return ind + n + '. '; });
    // "Step 3: xyz" or "ধাপ ১: xyz" → numbered item
    out = out.replace(/^[ \t]*(?:Step|ধাপ)[ \t]+([\d\u09E6-\u09EF]+)[ \t]*[:.\-][ \t]*/gim, (m, n) => { changed = true; return n + '. '; });
    if (changed) fixes.push('List markers');
    return out;
  },

  fenceIndentedCode(text, fixes) {
    const lines = text.split('\n');
    const out = [];
    let i = 0, changed = false;
    const codeish = /[{};=()<>]|^\s{4,}(def|class|function|import|from|const|let|var|public|private|for|while|if|return|SELECT|INSERT)\b/;
    while (i < lines.length) {
      if (/^ {4,}\S/.test(lines[i]) && !/^\s*[-*+]\s/.test(lines[i]) && !/^\s*\d+\.\s/.test(lines[i])) {
        const block = [];
        const start = i;
        while (i < lines.length && (/^ {4,}/.test(lines[i]) || lines[i].trim() === '')) { block.push(lines[i]); i++; }
        while (block.length && block[block.length - 1].trim() === '') { block.pop(); i--; }
        const joined = block.join('\n');
        if (block.length >= 2 && codeish.test(joined)) {
          const dedent = block.map(l => l.replace(/^ {4}/, ''));
          const lang = FormatDetector.guessLanguage(dedent.join('\n'));
          out.push('```' + lang, ...dedent, '```');
          changed = true;
        } else {
          for (let k = start; k < i; k++) out.push(lines[k]);
        }
        continue;
      }
      out.push(lines[i]); i++;
    }
    if (changed) fixes.push('Indented code fenced');
    return out.join('\n');
  },

  asciiTableToMarkdown(text, fixes) {
    const lines = text.split('\n');
    const out = [];
    let i = 0, changed = false;
    const isSep = l => /^[ \t]*\+[-+=]{2,}\+[ \t]*$/.test(l);
    const isRow = l => /^[ \t]*\|.*\|[ \t]*$/.test(l);
    while (i < lines.length) {
      if (isSep(lines[i]) && isRow(lines[i + 1] || '')) {
        const rows = [];
        i++;
        while (i < lines.length && (isRow(lines[i]) || isSep(lines[i]))) {
          if (isRow(lines[i])) rows.push(lines[i].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim()));
          i++;
        }
        if (rows.length) {
          const cols = rows[0].length;
          out.push('| ' + rows[0].join(' | ') + ' |');
          out.push('|' + new Array(cols).fill('---').join('|') + '|');
          rows.slice(1).forEach(rw => out.push('| ' + rw.join(' | ') + ' |'));
          changed = true;
        }
        continue;
      }
      out.push(lines[i]); i++;
    }
    if (changed) fixes.push('ASCII table → Markdown');
    return out.join('\n');
  },

  normalizeMarkdownTables(text, fixes) {
    const lines = text.split('\n');
    let changed = false;
    for (let i = 0; i < lines.length - 1; i++) {
      const isRow = /^[ \t]*\|.*\|[ \t]*$/.test(lines[i]);
      const nextSep = /^[ \t]*\|?[\s:|-]*-{2,}[\s:|-]*\|?[ \t]*$/.test(lines[i + 1] || '');
      if (isRow && !nextSep && /^[ \t]*\|.*\|[ \t]*$/.test(lines[i + 1] || '')) {
        // header row without separator — inject one
        const cols = lines[i].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').length;
        let hasSepBelow = false;
        for (let k = i + 1; k < Math.min(i + 3, lines.length); k++) {
          if (/-{2,}/.test(lines[k]) && lines[k].includes('|')) hasSepBelow = true;
        }
        if (!hasSepBelow) {
          lines.splice(i + 1, 0, '|' + new Array(cols).fill('---').join('|') + '|');
          changed = true; i++;
        }
      }
    }
    if (changed) fixes.push('Table separators repaired');
    return lines.join('\n');
  },

  stripCodeLineNumbers(parts, fixes) {
    let changed = false;
    parts.forEach(p => {
      if (p.type !== 'code') return;
      const lines = p.body.split('\n');
      if (lines.length < 3) return;
      let seq = 0;
      const numbered = lines.every((l, idx) => {
        if (l.trim() === '') return true;
        const m = l.match(/^\s*(\d+)[ \t.:|]\s?/);
        if (!m) return false;
        const n = parseInt(m[1], 10);
        if (seq && n !== seq + 1) return false;
        seq = n; return true;
      });
      if (numbered && seq >= 3) {
        p.body = lines.map(l => l.replace(/^\s*\d+[ \t.:|]\s?/, '')).join('\n');
        changed = true;
      }
    });
    if (changed) fixes.push('Code line numbers stripped');
    return parts;
  },

  /* ---------- DIAGRAM DETECTION ---------- */

  MERMAID_KEYWORDS: /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|C4Context|xychart-beta|block-beta)\b/i,

  /** Relabel code blocks that contain mermaid syntax but wrong/no language */
  retagMermaidBlocks(parts, fixes) {
    let changed = false;
    parts.forEach(p => {
      if (p.type !== 'code') return;
      const lang = (p.lang || '').toLowerCase();
      if (lang === 'mermaid') return;
      if (['', 'text', 'plaintext', 'txt', 'diagram', 'flow', 'chart', 'mmd'].indexOf(lang) >= 0 &&
          this.MERMAID_KEYWORDS.test(p.body)) {
        p.lang = 'mermaid'; changed = true;
      }
    });
    if (changed) fixes.push('Mermaid blocks detected');
    return parts;
  },

  /** Wrap bare (unfenced) mermaid source found in plain text */
  wrapBareMermaid(text, fixes) {
    const lines = text.split('\n');
    const out = [];
    let i = 0, changed = false;
    while (i < lines.length) {
      if (this.MERMAID_KEYWORDS.test(lines[i])) {
        const block = [lines[i]]; i++;
        while (i < lines.length && lines[i].trim() !== '' && !/^#{1,6}\s/.test(lines[i]) && !/^```/.test(lines[i])) {
          block.push(lines[i]); i++;
        }
        if (block.length >= 2) {
          out.push('```mermaid', ...block, '```'); changed = true;
        } else out.push(...block);
        continue;
      }
      out.push(lines[i]); i++;
    }
    if (changed) fixes.push('Bare Mermaid wrapped');
    return out.join('\n');
  },

  /** Convert plain arrow chains (A -> B -> C) into real mermaid flowcharts */
  arrowChainsToMermaid(text, fixes) {
    const lines = text.split('\n');
    const out = [];
    let i = 0, changed = false;
    const arrowLine = l => {
      if (/^\s*[-*+>#|]/.test(l)) return false;             // list / quote / heading / table
      if (/[`\[\]()]/.test(l) && !/-->/.test(l)) return false;
      const parts = l.split(/\s*(?:-->|->|→|=>|⇒)\s*/);
      return parts.length >= 2 && parts.every(p => p.trim().length > 0 && p.trim().length < 60);
    };
    while (i < lines.length) {
      if (arrowLine(lines[i])) {
        const chunk = [];
        while (i < lines.length && arrowLine(lines[i])) { chunk.push(lines[i].trim()); i++; }
        if (chunk.length && chunk.join(' ').split(/-->|->|→|=>|⇒/).length >= 3) {
          const idMap = {}; let n = 0;
          const idOf = label => {
            const key = label.toLowerCase();
            if (!idMap[key]) idMap[key] = 'N' + (++n);
            return idMap[key];
          };
          const edges = [];
          chunk.forEach(line => {
            const nodes = line.split(/\s*(?:-->|->|→|=>|⇒)\s*/).map(s => s.trim()).filter(Boolean);
            for (let k = 0; k < nodes.length - 1; k++) {
              const a = nodes[k], b = nodes[k + 1];
              const shape = t => /\?$/.test(t) ? '{"' + t.replace(/"/g, "'") + '"}' : '["' + t.replace(/"/g, "'") + '"]';
              edges.push('    ' + idOf(a) + shape(a) + ' --> ' + idOf(b) + shape(b));
            }
          });
          out.push('```mermaid', 'flowchart LR', ...edges, '```');
          changed = true;
          continue;
        } else out.push(...chunk);
        continue;
      }
      out.push(lines[i]); i++;
    }
    if (changed) fixes.push('Arrow flow → Flowchart');
    return out.join('\n');
  },

  /** Preserve box-drawing ASCII art inside a code fence (keeps alignment) */
  preserveAsciiArt(text, fixes) {
    const lines = text.split('\n');
    const out = [];
    let i = 0, changed = false;
    // A Markdown separator such as `|---|---|` previously matched the old
    // `[+|]` pattern, so every table was swallowed into a ```text fence.
    // Pipe rows are now excluded outright and plus-borders require a `+`.
    const pipeRow = l => /^[ \t]*\|/.test(l);
    const artish = l => !pipeRow(l) && (
      /[┌┐└┘├┤┬┴┼─│╔╗╚╝═║▲▼◄►╭╮╰╯]/.test(l) ||
      /^\s*\+[-+= ]{4,}\+\s*$/.test(l)
    );
    while (i < lines.length) {
      if (artish(lines[i])) {
        const block = [];
        while (i < lines.length && (artish(lines[i]) ||
               (lines[i].trim() !== '' && block.length && !pipeRow(lines[i]) && artish(lines[i - 1])))) {
          block.push(lines[i]); i++;
        }
        if (block.length >= 2) { out.push('```text', ...block, '```'); changed = true; }
        else out.push(...block);
        continue;
      }
      out.push(lines[i]); i++;
    }
    if (changed) fixes.push('ASCII art preserved');
    return out.join('\n');
  },

  spacing(text) {
    return text
      .replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2')
      .replace(/^(#{1,6}\s[^\n]+)\n(?=[^\n#])/gm, '$1\n\n')
      // Never insert blank lines between pipe rows: a blank line terminates
      // a GFM table and was the original cause of broken table previews.
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();
  },

  /* ---------- MAIN ---------- */
  run(raw, analysis, autoRepair) {
    if (!raw || !raw.trim()) return { markdown: '', fixes: [] };
    const fixes = [];
    let text = raw;

    text = this.unicodeCleanup(text, fixes);
    if (autoRepair) text = this.stripArtifacts(text, fixes);
    text = this.extractThinking(text, fixes);
    if (analysis.isHtml || /<table\b/i.test(text)) text = this.htmlToMarkdown(text, fixes);

    // Math is lifted out first. Equations contain `_`, `*`, `&`, `|` and `\\`
    // which every downstream repair would otherwise mangle.
    const guarded = MathEngine.scan(text, 'AtcMathG', fixes);
    text = guarded.text;
    if (guarded.items.length) fixes.push('Math isolated');

    // segment-aware work
    let parts = this.split(text);
    parts = this.stripCodeLineNumbers(parts, fixes);
    parts = this.retagMermaidBlocks(parts, fixes);

    parts = parts.map(p => {
      if (p.type === 'code') return p;
      let t = p.body;
      if (autoRepair) {
        // Tables run first so CSV headers, all-caps column names and aligned
        // columns cannot be mistaken for headings or list items.
        t = TableEngine.normalize(t, fixes);
        t = this.fixLists(t, fixes);
        t = this.fixHeadings(t, fixes);
      }
      t = this.wrapBareMermaid(t, fixes);
      t = this.arrowChainsToMermaid(t, fixes);
      t = this.preserveAsciiArt(t, fixes);
      if (autoRepair) t = this.fenceIndentedCode(t, fixes);
      return { type: 'text', body: t };
    });

    // re-split because text segments may now contain new fences
    text = this.join(parts);
    parts = this.split(text);
    parts = this.retagMermaidBlocks(parts, fixes);
    parts.forEach(p => {
      if (p.type === 'code' && (!p.lang || p.lang === 'text') && p.body.trim()) {
        const g = FormatDetector.guessLanguage(p.body);
        if (g !== 'text') { p.lang = g; if (fixes.indexOf('Code language guessed') < 0) fixes.push('Code language guessed'); }
      }
    });

    text = this.spacing(this.join(parts));
    text = MathEngine.restore(text, guarded.items).trim();
    return { markdown: text, fixes: fixes.filter((v, i, a) => a.indexOf(v) === i) };
  }
};

/* ============================================================
   5. DIAGRAM ENGINE (Mermaid)
   ============================================================ */
const DiagramEngine = {
  ready: false,
  seq: 0,
  cache: {},          // hash -> svg (current theme)
  exportCache: {},    // hash -> svg (light theme, for documents)

  baseConfig(theme) {
    return {
      startOnLoad: false,
      securityLevel: 'loose',
      theme: theme === 'dark' ? 'dark' : 'default',
      fontFamily: "'Inter', system-ui, sans-serif",
      flowchart: { htmlLabels: true, curve: 'basis', useMaxWidth: true, padding: 14 },
      sequence: { useMaxWidth: true, actorMargin: 40 },
      gantt: { useMaxWidth: true },
      themeVariables: theme === 'dark'
        ? { primaryColor: '#312e81', primaryTextColor: '#e8eefc', primaryBorderColor: '#818cf8', lineColor: '#94a3b8', secondaryColor: '#1e293b', tertiaryColor: '#0f172a' }
        : { primaryColor: '#eef2ff', primaryTextColor: '#1e1b4b', primaryBorderColor: '#6366f1', lineColor: '#64748b', secondaryColor: '#f5f3ff', tertiaryColor: '#ffffff' }
    };
  },

  init() {
    if (typeof mermaid === 'undefined') return;
    mermaid.initialize(this.baseConfig(ThemeManager.isDark() ? 'dark' : 'light'));
    this.ready = true;
  },

  setTheme(theme) {
    if (typeof mermaid === 'undefined') return;
    this.cache = {};
    mermaid.initialize(this.baseConfig(theme));
  },

  async render(code) {
    if (typeof mermaid === 'undefined') throw new Error('Mermaid not loaded');
    const key = hashCode(code + (ThemeManager.isDark() ? 'd' : 'l'));
    if (this.cache[key]) return this.cache[key];
    const id = 'mmd-' + (++this.seq) + '-' + key;
    const { svg } = await mermaid.render(id, code);
    this.cache[key] = svg;
    return svg;
  },

  /** Always render on a light theme for embedding into documents */
  async renderForExport(code) {
    if (typeof mermaid === 'undefined') throw new Error('Mermaid not loaded');
    const key = hashCode(code);
    if (this.exportCache[key]) return this.exportCache[key];
    mermaid.initialize(this.baseConfig('light'));
    try {
      const id = 'mmdx-' + (++this.seq) + '-' + key;
      const { svg } = await mermaid.render(id, code);
      this.exportCache[key] = svg;
      return svg;
    } finally {
      mermaid.initialize(this.baseConfig(ThemeManager.isDark() ? 'dark' : 'light'));
    }
  },

  /** Convert an SVG string into a high-DPI PNG data URL */
  svgToPng(svgString, scale) {
    scale = scale || 2.5;
    return new Promise((resolve, reject) => {
      let svg = svgString;
      // determine intrinsic size
      let w = 900, h = 500;
      const vb = svg.match(/viewBox="([\d.\-\s]+)"/);
      if (vb) {
        const p = vb[1].trim().split(/\s+/).map(Number);
        if (p.length === 4 && p[2] > 0 && p[3] > 0) { w = p[2]; h = p[3]; }
      }
      const wa = svg.match(/\bwidth="([\d.]+)(px)?"/);
      const ha = svg.match(/\bheight="([\d.]+)(px)?"/);
      if (wa && parseFloat(wa[1]) > 10) w = parseFloat(wa[1]);
      if (ha && parseFloat(ha[1]) > 10) h = parseFloat(ha[1]);

      // force explicit dimensions + white background for documents
      svg = svg.replace(/<svg([^>]*)>/, (m, attrs) => {
        let a = attrs
          .replace(/\bwidth="[^"]*"/, '')
          .replace(/\bheight="[^"]*"/, '')
          .replace(/style="[^"]*"/, '');
        return '<svg' + a + ' width="' + w + '" height="' + h + '" style="background:#ffffff">';
      });
      if (!/xmlns=/.test(svg)) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');

      const url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        try {
          resolve({ dataUrl: canvas.toDataURL('image/png'), width: w, height: h });
        } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error('Diagram rasterisation failed'));
      img.src = url;
    });
  },

  /** Mount all diagram placeholders inside a container */
  async mountAll(container) {
    const nodes = $$('.mermaid-wrap[data-code]', container);
    for (const node of nodes) {
      const code = decodeURIComponent(node.getAttribute('data-code'));
      try {
        const svg = await this.render(code);
        node.innerHTML =
          '<span class="mermaid-tag">Diagram</span>' +
          '<div class="mermaid-tools">' +
            '<button data-act="png">PNG</button>' +
            '<button data-act="svg">SVG</button>' +
            '<button data-act="src">Source</button>' +
          '</div>' + svg;
        node.removeAttribute('data-code');
        node.__code = code;
        node.__svg = svg;
      } catch (err) {
        node.className = 'mermaid-error';
        node.innerHTML = '<strong>Diagram error:</strong> ' + escapeHtml(err.message || 'invalid syntax') +
                         '<pre><code>' + escapeHtml(code) + '</code></pre>';
      }
    }
  }
};

/* ============================================================
   6. INLINE MARKDOWN PARSER (for PDF / DOCX)
   ============================================================ */
function parseInline(text, base) {
  base = base || {};
  const segs = [];
  let rest = String(text == null ? '' : text);

  const push = (t, extra) => {
    if (!t) return;
    segs.push(Object.assign({ text: t }, base, extra || {}));
  };
  const recurse = (inner, extra) => {
    parseInline(inner, Object.assign({}, base, extra)).forEach(s => segs.push(s));
  };

  while (rest.length) {
    let m;
    if ((m = rest.match(/^!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/))) { push(m[1] || '[image]', { italic: true }); rest = rest.slice(m[0].length); continue; }
    if ((m = rest.match(/^\[([^\]]+)\]\(([^)\s]+)[^)]*\)/)))  { recurse(m[1], { link: m[2] }); rest = rest.slice(m[0].length); continue; }
    if ((m = rest.match(/^`([^`]+)`/)))                       { push(m[1], { code: true }); rest = rest.slice(m[0].length); continue; }
    if ((m = rest.match(/^\*\*\*([\s\S]+?)\*\*\*/)))          { recurse(m[1], { bold: true, italic: true }); rest = rest.slice(m[0].length); continue; }
    if ((m = rest.match(/^___([\s\S]+?)___/)))                { recurse(m[1], { bold: true, italic: true }); rest = rest.slice(m[0].length); continue; }
    if ((m = rest.match(/^\*\*([\s\S]+?)\*\*/)))              { recurse(m[1], { bold: true }); rest = rest.slice(m[0].length); continue; }
    if ((m = rest.match(/^__([\s\S]+?)__/)))                  { recurse(m[1], { bold: true }); rest = rest.slice(m[0].length); continue; }
    if ((m = rest.match(/^~~([\s\S]+?)~~/)))                  { recurse(m[1], { strike: true }); rest = rest.slice(m[0].length); continue; }
    if ((m = rest.match(/^\*([^*\n]+)\*/)))                   { recurse(m[1], { italic: true }); rest = rest.slice(m[0].length); continue; }
    if ((m = rest.match(/^_([^_\n]+)_/)))                     { recurse(m[1], { italic: true }); rest = rest.slice(m[0].length); continue; }
    if ((m = rest.match(/^\$\$?([^$]+)\$\$?/)))               { push(MathEngine.toUnicode(m[1]), { italic: true, mathLatex: m[1] }); rest = rest.slice(m[0].length); continue; }
    if ((m = rest.match(/^[^*_`~\[!$]+/)))                    { push(m[0]); rest = rest.slice(m[0].length); continue; }
    push(rest[0]); rest = rest.slice(1);
  }
  return segs.length ? segs : [{ text: '' }];
}

function plainText(md) {
  return parseInline(md).map(s => s.text).join('');
}

function tableCellText(md) {
  return plainText(String(md == null ? '' : md).replace(/<br\s*\/?\s*>/gi, '\n'));
}

/* ============================================================
   7. BLOCK TOKENIZER (for PDF / DOCX)
   ============================================================ */
function tokenizeBlocks(md) {
  const tokens = [];
  const lines = md.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }

    // fenced code / diagram
    const fence = line.match(/^[ \t]*(`{3,}|~{3,})[ \t]*([\w+#.-]*)/);
    if (fence) {
      const lang = (fence[2] || 'text').toLowerCase();
      const body = [];
      i++;
      while (i < lines.length && !/^[ \t]*(`{3,}|~{3,})[ \t]*$/.test(lines[i])) { body.push(lines[i]); i++; }
      i++;
      tokens.push(lang === 'mermaid'
        ? { type: 'diagram', code: body.join('\n') }
        : { type: 'code', lang, content: body.join('\n') });
      continue;
    }

    // heading
    let m = line.match(/^[ \t]*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (m) { tokens.push({ type: 'heading', level: m[1].length, content: m[2] }); i++; continue; }

    // hr
    if (/^[ \t]*(-{3,}|\*{3,}|_{3,})[ \t]*$/.test(line)) { tokens.push({ type: 'hr' }); i++; continue; }

    // display math — `$$` fence or single-line `$$ … $$`
    if (/^[ \t]*\$\$/.test(line)) {
      const single = line.match(/^[ \t]*\$\$([\s\S]+?)\$\$[ \t]*$/);
      if (single) { tokens.push({ type: 'math', latex: single[1].trim() }); i++; continue; }
      const body = []; i++;
      while (i < lines.length && !/^[ \t]*\$\$[ \t]*$/.test(lines[i])) { body.push(lines[i]); i++; }
      i++;
      tokens.push({ type: 'math', latex: body.join('\n').trim() });
      continue;
    }

    // Canonical or repaired Markdown table. TableEngine understands
    // escaped pipes, inline-code pipes, alignment rows and uneven rows.
    const table = TableEngine.readMarkdown(lines, i);
    if (table) {
      tokens.push(table.token);
      i = table.end;
      continue;
    }

    // blockquote
    if (/^[ \t]*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^[ \t]*>/.test(lines[i])) { buf.push(lines[i].replace(/^[ \t]*>\s?/, '')); i++; }
      tokens.push({ type: 'quote', content: buf.join('\n').trim() });
      continue;
    }

    // lists (mixed ordered/unordered, nested, supporting Latin and Bengali digits)
    if (/^[ \t]*([-*+]|[\d\u09E6-\u09EF]+[.)])\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[ \t]*([-*+]|[\d\u09E6-\u09EF]+[.)])\s+/.test(lines[i])) {
        const mm = lines[i].match(/^([ \t]*)([-*+]|([\d\u09E6-\u09EF]+)[.)])\s+(.*)$/);
        const indent = mm[1].replace(/\t/g, '  ').length;
        const level = Math.min(3, Math.floor(indent / 2));
        let content = mm[4];
        // continuation lines
        let j = i + 1;
        while (j < lines.length && lines[j].trim() !== '' &&
               !/^[ \t]*([-*+]|[\d\u09E6-\u09EF]+[.)])\s+/.test(lines[j]) &&
               /^[ \t]{2,}/.test(lines[j])) { content += ' ' + lines[j].trim(); j++; }
        const task = content.match(/^\[([ xX])\]\s+(.*)$/);
        items.push({
          level,
          ordered: !!mm[3],
          num: mm[3] ? mm[3] : null,
          checked: task ? /[xX]/.test(task[1]) : null,
          content: task ? task[2] : content
        });
        i = j;
      }
      tokens.push({ type: 'list', items });
      continue;
    }

    // paragraph
    const para = [];
    while (i < lines.length && lines[i].trim() !== '' &&
           !/^[ \t]*#{1,6}\s/.test(lines[i]) &&
           !/^[ \t]*(`{3,}|~{3,})/.test(lines[i]) &&
           !/^[ \t]*>/.test(lines[i]) &&
           !/^[ \t]*([-*+]|[\d\u09E6-\u09EF]+[.)])\s+/.test(lines[i]) &&
           !/^[ \t]*(-{3,}|\*{3,}|_{3,})[ \t]*$/.test(lines[i]) &&
           !/^[ \t]*\$\$/.test(lines[i]) &&
           !TableEngine.readMarkdown(lines, i)) {
      para.push(lines[i]); i++;
    }
    if (para.length) tokens.push({ type: 'paragraph', content: para.join(' ').trim() });
    else i++;
  }
  return tokens;
}

/* ============================================================
   8. PREVIEW RENDERER
   ============================================================ */
const PreviewRenderer = {
  init() {
    if (typeof marked === 'undefined') return;

    // Works with both the legacy positional API and the token-object API
    const pick = (a, keys) => {
      if (a && typeof a === 'object' && !Array.isArray(a)) return a;
      return null;
    };

    const renderer = {
      code(a, b) {
        const tok = pick(a);
        const text = tok ? (tok.text || '') : (a || '');
        const lang = ((tok ? tok.lang : b) || '').split(/\s+/)[0].toLowerCase();
        if (lang === 'mermaid') {
          return '<div class="mermaid-wrap" data-code="' + encodeURIComponent(text) + '"></div>';
        }
        const shown = lang || 'plaintext';
        return '<pre><div class="code-header"><span class="lang-label">' + escapeHtml(shown) +
               '</span><button class="copy-code-btn" type="button">Copy</button></div>' +
               '<code class="language-' + escapeHtml(shown) + '">' + escapeHtml(text) + '</code></pre>';
      },
      heading(a, b) {
        const tok = pick(a);
        let text, depth;
        if (tok) {
          depth = tok.depth || 1;
          text = (tok.tokens && this.parser) ? this.parser.parseInline(tok.tokens) : escapeHtml(tok.text || '');
        } else { text = a || ''; depth = b || 1; }
        const id = String(text).replace(/<[^>]+>/g, '').trim().toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
        return '<h' + depth + ' id="h-' + id + '">' + text + '</h' + depth + '>';
      },
      link(a, b, c) {
        const tok = pick(a);
        let href, title, text;
        if (tok) {
          href = tok.href || '#'; title = tok.title || '';
          text = (tok.tokens && this.parser) ? this.parser.parseInline(tok.tokens) : escapeHtml(tok.text || '');
        } else { href = a; title = b; text = c; }
        return '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer"' +
               (title ? ' title="' + escapeHtml(title) + '"' : '') + '>' + text + '</a>';
      }
    };

    marked.use({ gfm: true, breaks: true, renderer });
  },

  render(markdown) {
    const el = $('#previewContent');
    if (!markdown || !markdown.trim()) { el.innerHTML = ''; $('#previewStats').textContent = 'Ready'; return; }
    // Lift math out BEFORE marked runs. With `breaks:true` a multi-line
    // `$$` block became `$$<br>…<br>$$`, which split the text nodes and made
    // delimiter-based auto-render impossible to match.
    const math = MathEngine.scan(markdown, 'AtcMathPv', null);

    let html;
    try { html = marked.parse(math.text); }
    catch (e) { el.innerHTML = '<p style="color:var(--danger)">Parse error: ' + escapeHtml(e.message) + '</p>'; return; }

    if (typeof DOMPurify !== 'undefined') {
      html = DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'data-code', 'id'], ADD_TAGS: ['svg', 'foreignObject'] });
    }
    el.innerHTML = html;

    // wrap wide tables for horizontal scroll
    $$('table', el).forEach(t => {
      if (t.parentElement && t.parentElement.classList.contains('table-scroll')) return;
      const w = document.createElement('div'); w.className = 'table-scroll';
      t.parentNode.insertBefore(w, t); w.appendChild(t);

      t.classList.add('smart-table');
      const headers = Array.from(t.querySelectorAll('thead th'));
      const rows = Array.from(t.querySelectorAll('tbody tr'));
      headers.forEach(th => th.setAttribute('scope', 'col'));
      headers.forEach((th, col) => {
        const cells = rows.map(r => r.children[col]).filter(Boolean);
        const populated = cells.filter(c => c.textContent.trim());
        const numeric = populated.filter(c => /^[-+]?[$€£¥]?\s*\d[\d,.% /:-]*$/.test(c.textContent.trim()));
        if (populated.length && numeric.length / populated.length >= 0.6) {
          th.classList.add('is-numeric');
          cells.forEach(c => c.classList.add('is-numeric'));
        }
        cells.filter(c => !c.textContent.trim()).forEach(c => c.classList.add('cell-empty'));
      });

      const previous = w.previousElementSibling;
      if (previous && previous.tagName === 'P' && previous.children.length === 1 && previous.firstElementChild.tagName === 'STRONG') {
        previous.classList.add('table-caption');
        t.setAttribute('aria-label', previous.textContent.trim());
      }
    });

    // syntax highlighting
    if (typeof hljs !== 'undefined') {
      $$('pre code', el).forEach(b => { try { hljs.highlightElement(b); } catch (e) {} });
    }

    // math — placeholders are swapped for KaTeX after sanitisation so the
    // sanitizer cannot strip KaTeX's spans, MathML or inline styles.
    const mathCount = MathEngine.mount(el, math.items);

    // diagrams
    DiagramEngine.mountAll(el).then(() => {
      const d = $$('.mermaid-wrap svg', el).length;
      const c = $$('pre code', el).length;
      const t = $$('table', el).length;
      $('#previewStats').textContent =
        [d ? d + ' diagram' + (d > 1 ? 's' : '') : null,
         c ? c + ' code block' + (c > 1 ? 's' : '') : null,
         t ? t + ' table' + (t > 1 ? 's' : '') : null,
         mathCount ? mathCount + ' equation' + (mathCount > 1 ? 's' : '') : null
        ].filter(Boolean).join(' • ') || 'Rendered';
    });
  }
};

/* delegated actions inside preview */
document.addEventListener('click', e => {
  const copyBtn = e.target.closest('.copy-code-btn');
  if (copyBtn) {
    const code = copyBtn.closest('pre').querySelector('code');
    navigator.clipboard.writeText(code.textContent).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => (copyBtn.textContent = 'Copy'), 1800);
    }).catch(() => toast('Copy failed', 'error'));
    return;
  }
  const tool = e.target.closest('.mermaid-tools button');
  if (tool) {
    const wrap = tool.closest('.mermaid-wrap');
    const act = tool.getAttribute('data-act');
    if (act === 'src') {
      navigator.clipboard.writeText(wrap.__code || '').then(() => toast('Diagram source copied', 'success'));
    } else if (act === 'svg') {
      const blob = new Blob([wrap.__svg || ''], { type: 'image/svg+xml' });
      saveAs(blob, 'diagram.svg'); toast('SVG downloaded', 'success');
    } else if (act === 'png') {
      DiagramEngine.svgToPng(wrap.__svg || '', 3)
        .then(r => { const a = document.createElement('a'); a.href = r.dataUrl; a.download = 'diagram.png'; a.click(); toast('PNG downloaded', 'success'); })
        .catch(() => toast('PNG export failed', 'error'));
    }
  }
});

/* ============================================================
   9. FULLSCREEN MANAGER
   ============================================================ */
const Fullscreen = {
  activePanel: null,
  workspace: false,

  init() {
    $$('.fs-btn').forEach(btn => {
      btn.addEventListener('click', () => this.togglePanel(btn.getAttribute('data-fullscreen')));
    });
    $('#workspaceFsBtn').addEventListener('click', () => this.toggleWorkspace());

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { this.exitAll(); return; }
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey &&
          tag !== 'TEXTAREA' && tag !== 'INPUT' && tag !== 'SELECT') {
        e.preventDefault();
        this.togglePanel(this.activePanel || 'previewPanel');
      }
    });
  },

  togglePanel(id) {
    const panel = document.getElementById(id);
    if (!panel) return;
    if (this.workspace) this.toggleWorkspace();
    const on = panel.classList.toggle('is-fullscreen');
    $$('.panel').forEach(p => { if (p !== panel) p.classList.remove('is-fullscreen'); });
    document.body.classList.toggle('no-scroll', on);
    this.activePanel = on ? id : null;
    $$('.fs-btn').forEach(b => b.classList.toggle('active', on && b.getAttribute('data-fullscreen') === id));
    if (on) toast('Fullscreen — press Esc to exit', 'info');
  },

  toggleWorkspace() {
    $$('.panel').forEach(p => p.classList.remove('is-fullscreen'));
    this.activePanel = null;
    const grid = $('#converterGrid');
    this.workspace = grid.classList.toggle('is-fullscreen');
    document.body.classList.toggle('no-scroll', this.workspace);
    $$('.fs-btn').forEach(b => b.classList.remove('active'));
    if (this.workspace) toast('Workspace fullscreen — Esc to exit', 'info');
  },

  exitAll() {
    let did = false;
    $$('.panel.is-fullscreen').forEach(p => { p.classList.remove('is-fullscreen'); did = true; });
    const grid = $('#converterGrid');
    if (grid.classList.contains('is-fullscreen')) { grid.classList.remove('is-fullscreen'); this.workspace = false; did = true; }
    if (did) { document.body.classList.remove('no-scroll'); $$('.fs-btn').forEach(b => b.classList.remove('active')); }
    this.activePanel = null;
    if (!$('#shortcutModal').hidden) $('#shortcutModal').hidden = true;
  }
};

/* ============================================================
   10. ZOOM (preview)
   ============================================================ */
const Zoom = {
  level: 1,
  init() {
    $('#zoomInBtn').addEventListener('click', () => this.set(this.level + 0.1));
    $('#zoomOutBtn').addEventListener('click', () => this.set(this.level - 0.1));
  },
  set(v) {
    this.level = Math.min(1.8, Math.max(0.6, Math.round(v * 10) / 10));
    const el = $('#previewContent');
    el.style.zoom = this.level;
    if (!('zoom' in el.style)) { el.style.transform = 'scale(' + this.level + ')'; }
    $('#zoomLabel').textContent = Math.round(this.level * 100) + '%';
  }
};

/* ============================================================
   11. OPTIONS
   ============================================================ */
const ACCENTS = {
  indigo:  { rgb: [99, 102, 241],  hex: '6366F1' },
  blue:    { rgb: [37, 99, 235],   hex: '2563EB' },
  emerald: { rgb: [5, 150, 105],   hex: '059669' },
  slate:   { rgb: [71, 85, 105],   hex: '475569' },
  rose:    { rgb: [225, 29, 72],   hex: 'E11D48' }
};

const Options = {
  flags: {
    pageNumbers: true, headerTitle: true, footerDate: true,
    coverPage: false, toc: false, renderDiagrams: true,
    styledCode: true, autoRepair: true
  },
  init() {
    $('#docDate').valueAsDate = new Date();
    const toggle = $('#optionsToggle'), panel = $('#optionsPanel');
    toggle.addEventListener('click', () => {
      const open = toggle.classList.toggle('open');
      panel.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
    });
    $$('.switch').forEach(sw => {
      sw.addEventListener('click', e => {
        e.preventDefault();
        sw.classList.toggle('active');
        this.flags[sw.getAttribute('data-option')] = sw.classList.contains('active');
        if (sw.getAttribute('data-option') === 'autoRepair') App.refresh();
      });
    });
  },
  get() {
    const acc = ACCENTS[$('#accentChoice').value] || ACCENTS.indigo;
    return Object.assign({
      title:   $('#docTitle').value.trim() || 'AI Response',
      author:  $('#docAuthor').value.trim(),
      subject: $('#docSubject').value.trim(),
      date:    $('#docDate').value || new Date().toISOString().slice(0, 10),
      pageSize: $('#pageSize').value,
      font:     $('#fontFamily').value,
      fontSize: parseInt($('#fontSize').value, 10),
      spacing:  parseFloat($('#lineSpacing').value),
      margin:   parseInt($('#margins').value, 10),
      accent:   acc
    }, this.flags);
  }
};

/* ============================================================
   12. PDF EXPORT
   ============================================================ */
function getJsPDF() {
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
  if (window.jsPDF) return window.jsPDF;
  throw new Error('jsPDF failed to load — check your connection and refresh.');
}

// PDF document renderer helpers and utilities

async function prepareDiagrams(tokens, enabled) {
  if (!enabled) return 0;
  let n = 0;
  for (const t of tokens) {
    if (t.type !== 'diagram') continue;
    try {
      const svg = await DiagramEngine.renderForExport(t.code);
      t.png = await DiagramEngine.svgToPng(svg, 2.5);
      n++;
    } catch (e) { t.png = null; }
  }
  return n;
}

async function generatePDF(markdown, o) {
  const jsPDF = getJsPDF();
  
  // 1. Page Dimensions in PT & baseline rendering width in PX (at 96 DPI)
  const pageSpecs = {
    a4:     { wPt: 595.28, hPt: 841.89, pxW: 794 },
    letter: { wPt: 612.00, hPt: 792.00, pxW: 816 },
    legal:  { wPt: 612.00, hPt: 1008.00, pxW: 816 }
  };
  const spec = pageSpecs[o.pageSize] || pageSpecs.a4;
  const W_pt = spec.wPt;
  const H_pt = spec.hPt;
  
  // Font Family Map — supporting Bangla & all international scripts
  const fontFamilies = {
    sans: "'Inter', 'Noto Sans Bengali', 'Hind Siliguri', 'Segoe UI', Roboto, Arial, sans-serif",
    bengali: "'Noto Sans Bengali', 'Hind Siliguri', 'Kalpurush', 'Vrinda', 'Inter', sans-serif",
    times: "'Times New Roman', 'Noto Sans Bengali', 'Tiro Bangla', Georgia, serif",
    courier: "'JetBrains Mono', 'Courier New', 'Noto Sans Bengali', monospace",
    georgia: "Georgia, 'Noto Sans Bengali', 'Tiro Bangla', 'Times New Roman', serif"
  };
  const fontFamily = fontFamilies[o.font] || fontFamilies.sans;
  const accentHex = '#' + o.accent.hex;
  const marginPx = Math.round((o.margin || 72) * (96 / 72));
  
  // 2. Create or Reset Offscreen PDF Render Container
  let container = document.getElementById('pdfRenderContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'pdfRenderContainer';
    document.body.appendChild(container);
  }
  container.innerHTML = '';
  container.style.width = spec.pxW + 'px';
  container.style.padding = marginPx + 'px';
  container.style.fontFamily = fontFamily;
  container.style.fontSize = (o.fontSize || 12) + 'pt';
  container.style.lineHeight = String(o.spacing || 1.5);
  container.style.setProperty('--accent-primary', accentHex);
  container.className = 'pdf-doc';

  // 3. Render HTML Content
  // Extract math blocks with MathEngine so marked doesn't mangle equations
  const math = MathEngine.scan(markdown, 'AtcMathPdf', null);
  let parsedHtml = marked.parse(math.text);
  
  if (typeof DOMPurify !== 'undefined') {
    parsedHtml = DOMPurify.sanitize(parsedHtml, {
      ADD_ATTR: ['target', 'data-code', 'id', 'align', 'colspan', 'rowspan'],
      ADD_TAGS: ['svg', 'foreignObject', 'colgroup', 'col']
    });
  }

  // Build Full Document HTML
  let docHtml = '';
  
  // Optional Cover Page
  if (o.coverPage) {
    docHtml += `
      <div class="pdf-cover-page" style="page-break-after:always; break-after:always; min-height:850px; display:flex; flex-direction:column; justify-content:center;">
        <div class="pdf-cover-title" style="font-size:2.3em; font-weight:800; color:#0f172a; margin-bottom:1rem;">${escapeHtml(o.title)}</div>
        <div class="pdf-cover-bar" style="width:110px; height:4px; background:${accentHex}; margin-bottom:2rem;"></div>
        <div class="pdf-cover-meta" style="color:#64748b; font-size:1.1em; line-height:1.8;">
          ${o.subject ? `<p style="margin:0.4em 0;"><strong>Subject:</strong> ${escapeHtml(o.subject)}</p>` : ''}
          ${o.author ? `<p style="margin:0.4em 0;"><strong>Author:</strong> ${escapeHtml(o.author)}</p>` : ''}
          <p style="margin:0.4em 0;"><strong>Date:</strong> ${escapeHtml(formatDateHuman(o.date))}</p>
        </div>
      </div>
    `;
  }

  // Optional Table of Contents
  if (o.toc) {
    const headings = tokenizeBlocks(markdown).filter(t => t.type === 'heading' && t.level <= 3);
    if (headings.length) {
      docHtml += `
        <div class="pdf-toc" style="page-break-after:always; break-after:always; margin-bottom:2.5rem; padding-bottom:1.5rem; border-bottom:2px solid #e2e8f0;">
          <h2 style="font-size:1.6em; font-weight:800; color:#0f172a; margin-bottom:1.2rem; border-bottom:2px solid ${accentHex}; padding-bottom:0.4rem;">Table of Contents</h2>
          <ul style="list-style:none; padding-left:0;">
            ${headings.map(h => `
              <li style="padding:0.35rem 0; margin-left:${(h.level - 1) * 1.5}rem; font-size:${h.level === 1 ? '1.05em' : '0.95em'}; font-weight:${h.level === 1 ? '700' : '500'}; color:${h.level === 1 ? '#0f172a' : '#475569'};">
                ${escapeHtml(plainText(h.content))}
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }
  }

  docHtml += `<div class="pdf-body">${parsedHtml}</div>`;
  container.innerHTML = docHtml;

  // Mount KaTeX Math expressions
  MathEngine.mount(container, math.items);

  // Mount Mermaid diagrams as light theme SVGs
  const diagramNodes = $$('.mermaid-wrap[data-code]', container);
  for (const node of diagramNodes) {
    const code = decodeURIComponent(node.getAttribute('data-code'));
    try {
      const svg = await DiagramEngine.renderForExport(code);
      node.innerHTML = svg;
      node.removeAttribute('data-code');
    } catch (err) {
      node.innerHTML = `<pre><code>${escapeHtml(code)}</code></pre>`;
    }
  }

  // Style tables with headers, borders, zebra stripes and cell padding
  $$('table', container).forEach(t => {
    t.style.width = '100%';
    t.style.borderCollapse = 'collapse';
    t.style.margin = '1.2em 0';
    t.style.fontSize = '0.88em';
    t.style.breakInside = 'auto';
    $$('th', t).forEach(th => {
      th.style.backgroundColor = accentHex;
      th.style.color = '#ffffff';
      th.style.fontWeight = '700';
      th.style.padding = '8px 12px';
      th.style.border = '1px solid #cbd5e1';
    });
    $$('td', t).forEach(td => {
      td.style.padding = '7px 12px';
      td.style.border = '1px solid #cbd5e1';
      td.style.verticalAlign = 'top';
    });
    $$('tr', t).forEach(tr => { tr.style.breakInside = 'avoid'; });
    $$('tr:nth-child(even) td', t).forEach(td => {
      td.style.backgroundColor = '#f8fafc';
    });
  });

  // Apply syntax highlighting to code blocks
  if (typeof hljs !== 'undefined') {
    $$('pre code', container).forEach(b => {
      try { hljs.highlightElement(b); } catch (e) {}
    });
  }

  // Wait for Google Bengali fonts & KaTeX webfonts to finish loading
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }
  await new Promise(resolve => setTimeout(resolve, 300));

  // 4. High-DPI Capture with html2canvas (2.2x scale for ultra-crisp print quality)
  if (typeof html2canvas === 'undefined') {
    throw new Error('html2canvas library is missing. Please refresh the page.');
  }

  const canvas = await html2canvas(container, {
    scale: 2.2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    windowWidth: spec.pxW + 100
  });

  // 5. Multi-Page Document Construction
  const doc = new jsPDF({
    unit: 'pt',
    format: o.pageSize,
    orientation: 'portrait',
    compress: true
  });
  doc.setProperties({
    title: o.title,
    author: o.author || 'AI Text Converter Pro',
    subject: o.subject || 'Converted AI Document',
    creator: 'AI Text Converter Pro'
  });

  const headerHeightPt = o.headerTitle ? 32 : 16;
  const footerHeightPt = (o.footerDate || o.pageNumbers) ? 32 : 16;
  const contentTopPt = headerHeightPt;
  const contentHeightPt = H_pt - headerHeightPt - footerHeightPt;
  const contentWidthPt = W_pt;

  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  const ptToCanvasRatio = (canvasWidth / contentWidthPt);
  const pageHeightInCanvasPx = Math.floor(contentHeightPt * ptToCanvasRatio);

  let currentCanvasY = 0;
  const pageSlices = [];

  while (currentCanvasY < canvasHeight) {
    let sliceHeight = Math.min(pageHeightInCanvasPx, canvasHeight - currentCanvasY);
    
    // Create an individual page slice canvas
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvasWidth;
    pageCanvas.height = sliceHeight;
    const ctx = pageCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, sliceHeight);
    ctx.drawImage(
      canvas,
      0, currentCanvasY, canvasWidth, sliceHeight,
      0, 0, canvasWidth, sliceHeight
    );

    const sliceHeightPt = sliceHeight / ptToCanvasRatio;
    pageSlices.push({
      dataUrl: pageCanvas.toDataURL('image/jpeg', 0.95),
      heightPt: sliceHeightPt
    });

    currentCanvasY += sliceHeight;
  }

  const totalPages = Math.max(1, pageSlices.length);

  for (let i = 0; i < pageSlices.length; i++) {
    if (i > 0) doc.addPage();
    const slice = pageSlices[i];
    const pageNo = i + 1;

    // Add Rendered Canvas Slice
    doc.addImage(
      slice.dataUrl,
      'JPEG',
      0,
      contentTopPt,
      contentWidthPt,
      slice.heightPt,
      undefined,
      'FAST'
    );

    // Overlay Header (title & author)
    if (o.headerTitle && (!o.coverPage || pageNo > 1)) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(148, 163, 184);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.6);
      doc.line(o.margin * 0.5, 24, W_pt - (o.margin * 0.5), 24);
      
      const headerTitle = doc.splitTextToSize(o.title, W_pt - (o.margin) - 100)[0];
      doc.text(headerTitle, o.margin * 0.5, 18);
      if (o.author) {
        const authorText = doc.splitTextToSize(o.author, 120)[0];
        doc.text(authorText, W_pt - (o.margin * 0.5) - doc.getTextWidth(authorText), 18);
      }
    }

    // Overlay Footer (date & page numbering)
    if ((o.footerDate || o.pageNumbers) && (!o.coverPage || pageNo > 1)) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(148, 163, 184);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.6);
      doc.line(o.margin * 0.5, H_pt - 24, W_pt - (o.margin * 0.5), H_pt - 24);

      if (o.footerDate) {
        doc.text(formatDateHuman(o.date), o.margin * 0.5, H_pt - 12);
      }
      if (o.pageNumbers) {
        const pageText = `Page ${pageNo} of ${totalPages}`;
        doc.text(pageText, W_pt - (o.margin * 0.5) - doc.getTextWidth(pageText), H_pt - 12);
      }
    }
  }

  // 6. Clean up temporary container & Save
  container.innerHTML = '';
  doc.save(sanitizeFilename(o.title) + '.pdf');
}

/* ============================================================
   13. DOCX EXPORT
   ============================================================ */
function dataUrlToUint8(dataUrl) {
  const b64 = dataUrl.split(',')[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function generateDOCX(markdown, o) {
  if (!window.docx) throw new Error('DOCX library failed to load — refresh the page.');
  const D = window.docx;
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
    WidthType, BorderStyle, AlignmentType, ShadingType, PageNumber, Footer, Header,
    ExternalHyperlink, LevelFormat, ImageRun, PageBreak, TabStopType, TabStopPosition
  } = D;

  const tokens = tokenizeBlocks(markdown);
  await prepareDiagrams(tokens, o.renderDiagrams);

  const fontName = o.font === 'bengali' ? 'Kalpurush' :
                   o.font === 'times' ? 'Times New Roman' :
                   o.font === 'courier' ? 'Courier New' :
                   o.font === 'georgia' ? 'Georgia' : 'Arial';
  const sz = o.fontSize * 2;                 // half-points
  const line = Math.round(o.spacing * 240);
  const accHex = o.accent.hex;

  const runs = (text, extra) => parseInline(text).map(s => {
    const common = {
      font: s.code ? 'Consolas' : fontName,
      size: s.code ? sz - 3 : sz,
      bold: !!s.bold || (extra && extra.bold) || false,
      italics: !!s.italic || (extra && extra.italics) || false,
      strike: !!s.strike,
      color: s.code ? 'B02A46' : ((extra && extra.color) || '1E2637'),
      shading: s.code ? { type: ShadingType.SOLID, color: 'EEF2F8', fill: 'EEF2F8' } : undefined
    };
    if (s.link) {
      return new ExternalHyperlink({
        link: s.link,
        children: [new TextRun(Object.assign({}, common, {
          text: s.text, color: '2563EB', underline: { type: 'single' }
        }))]
      });
    }
    return new TextRun(Object.assign({ text: s.text }, common));
  });

  const tableRuns = (text, extra) => {
    const output = [];
    String(text == null ? '' : text).split(/<br\s*\/?\s*>/i).forEach((part, index) => {
      if (index) output.push(new TextRun({ break: 1 }));
      runs(part, extra).forEach(run => output.push(run));
    });
    return output;
  };

  const children = [];

  /* cover page */
  if (o.coverPage) {
    children.push(new Paragraph({ spacing: { before: 2600, after: 0 } }));
    children.push(new Paragraph({
      children: [new TextRun({ text: o.title, bold: true, size: 64, font: fontName, color: '141A2A' })],
      spacing: { after: 200 }
    }));
    children.push(new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 24, color: accHex, space: 6 } },
      spacing: { after: 300 }
    }));
    if (o.subject) children.push(new Paragraph({ children: [new TextRun({ text: o.subject, size: 28, color: '5A6478', font: fontName })], spacing: { after: 120 } }));
    if (o.author)  children.push(new Paragraph({ children: [new TextRun({ text: 'By ' + o.author, size: 26, color: '5A6478', font: fontName })], spacing: { after: 120 } }));
    children.push(new Paragraph({ children: [new TextRun({ text: formatDateHuman(o.date), size: 24, color: '8A94A6', font: fontName })] }));
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  /* table of contents (manual) */
  if (o.toc) {
    const hs = tokens.filter(t => t.type === 'heading' && t.level <= 3);
    if (hs.length) {
      children.push(new Paragraph({
        children: [new TextRun({ text: 'Table of Contents', bold: true, size: 40, font: fontName, color: '141A2A' })],
        border: { bottom: { style: BorderStyle.SINGLE, size: 16, color: accHex, space: 6 } },
        spacing: { after: 260 }
      }));
      hs.forEach(h => {
        children.push(new Paragraph({
          children: [new TextRun({ text: plainText(h.content), size: h.level === 1 ? sz : sz - 2, bold: h.level === 1, font: fontName, color: h.level === 1 ? '1E2637' : '55607A' })],
          indent: { left: (h.level - 1) * 320 },
          spacing: { after: 70 }
        }));
      });
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
  }

  const headingMap = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3, 4: HeadingLevel.HEADING_4, 5: HeadingLevel.HEADING_5, 6: HeadingLevel.HEADING_6 };
  const headSizes = { 1: 46, 2: 36, 3: 30, 4: 26, 5: 24, 6: 22 };

  tokens.forEach(t => {
    switch (t.type) {

      case 'heading':
        children.push(new Paragraph({
          heading: headingMap[t.level] || HeadingLevel.HEADING_4,
          children: parseInline(t.content).map(s => new TextRun({
            text: s.text, bold: true, italics: !!s.italic,
            font: fontName, size: headSizes[t.level] || 26,
            color: t.level === 1 ? accHex : '141A2A'
          })),
          border: t.level <= 2 ? { bottom: { style: BorderStyle.SINGLE, size: t.level === 1 ? 16 : 6, color: t.level === 1 ? accHex : 'D7DDE8', space: 4 } } : undefined,
          spacing: { before: t.level <= 2 ? 380 : 280, after: 160 }
        }));
        break;

      case 'paragraph':
        children.push(new Paragraph({ children: runs(t.content), spacing: { after: 160, line } }));
        break;

      case 'list':
        t.items.forEach(item => {
          const isBengaliNum = item.ordered && /[\u09E6-\u09EF]/.test(String(item.num));
          const prefix = item.checked === null || item.checked === undefined
            ? (isBengaliNum ? (item.num + '. ') : '')
            : (item.checked ? '☑ ' : '☐ ');
          const cfg = {
            children: (prefix ? [new TextRun({ text: prefix, font: fontName, size: sz, bold: isBengaliNum })] : []).concat(runs(item.content)),
            spacing: { after: 70, line }
          };
          if (item.ordered && !isBengaliNum) cfg.numbering = { reference: 'atc-numbers', level: Math.min(2, item.level || 0) };
          else if (!item.ordered) cfg.bullet = { level: Math.min(4, item.level || 0) };
          else cfg.indent = { left: 720 + (item.level || 0) * 360, hanging: 360 };
          children.push(new Paragraph(cfg));
        });
        children.push(new Paragraph({ spacing: { after: 60 } }));
        break;

      case 'code': {
        const dark = o.styledCode;
        const bg = dark ? '1B2333' : 'F4F6FA';
        const fg = dark ? 'E4EAF6' : '1E2637';
        children.push(new Paragraph({
          children: [new TextRun({ text: (t.lang || 'text').toUpperCase(), font: 'Consolas', size: 15, bold: true, color: dark ? '93A4C3' : '6B7A95' })],
          shading: { type: ShadingType.SOLID, color: dark ? '10182A' : 'E8ECF4', fill: dark ? '10182A' : 'E8ECF4' },
          spacing: { before: 220, after: 0 }
        }));
        t.content.split('\n').forEach(l => {
          children.push(new Paragraph({
            children: [new TextRun({ text: l.replace(/\t/g, '  ') || ' ', font: 'Consolas', size: Math.max(16, sz - 5), color: fg })],
            shading: { type: ShadingType.SOLID, color: bg, fill: bg },
            spacing: { after: 0, line: 240 },
            indent: { left: 220 }
          }));
        });
        children.push(new Paragraph({
          children: [new TextRun({ text: ' ', size: 8 })],
          shading: { type: ShadingType.SOLID, color: bg, fill: bg },
          spacing: { after: 220 }
        }));
        break;
      }

      case 'quote':
        t.content.split('\n').forEach((ln, i, arr) => {
          children.push(new Paragraph({
            children: runs(ln, { italics: true, color: '4E5C73' }),
            indent: { left: 460 },
            shading: { type: ShadingType.SOLID, color: 'F6F8FC', fill: 'F6F8FC' },
            border: { left: { style: BorderStyle.SINGLE, size: 22, space: 10, color: accHex } },
            spacing: { before: i === 0 ? 180 : 0, after: i === arr.length - 1 ? 180 : 0, line }
          }));
        });
        break;

      case 'table': {
        const bs = { style: BorderStyle.SINGLE, size: 4, color: 'DEE4EE' };
        const borders = { top: bs, bottom: bs, left: bs, right: bs };
        const alignFor = col => {
          const a = (t.alignments || [])[col];
          return a === 'right' ? AlignmentType.RIGHT : a === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT;
        };
        const head = new TableRow({
          tableHeader: true,
          children: t.headers.map((h, col) => new TableCell({
            shading: { type: ShadingType.SOLID, color: accHex, fill: accHex },
            borders, margins: { top: 90, bottom: 90, left: 130, right: 130 },
            children: [new Paragraph({ alignment: alignFor(col), children: tableRuns(h, { bold: true, color: 'FFFFFF' }) })]
          }))
        });
        const body = t.rows.map((row, ri) => new TableRow({
          children: row.map((c, col) => new TableCell({
            shading: ri % 2 ? { type: ShadingType.SOLID, color: 'F7F9FD', fill: 'F7F9FD' } : undefined,
            borders, margins: { top: 70, bottom: 70, left: 130, right: 130 },
            children: [new Paragraph({ alignment: alignFor(col), children: tableRuns(c) })]
          }))
        }));
        children.push(new Table({ rows: [head].concat(body), width: { size: 100, type: WidthType.PERCENTAGE } }));
        children.push(new Paragraph({ spacing: { after: 220 } }));
        break;
      }

      case 'diagram': {
        if (t.png) {
          const maxW = 560;
          let w = Math.min(maxW, t.png.width);
          let h = w * (t.png.height / t.png.width);
          if (h > 720) { h = 720; w = h * (t.png.width / t.png.height); }
          try {
            children.push(new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 220, after: 60 },
              children: [new ImageRun({ data: dataUrlToUint8(t.png.dataUrl), transformation: { width: Math.round(w), height: Math.round(h) } })]
            }));
            children.push(new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: 'Diagram', italics: true, size: 16, color: '8A94A6', font: fontName })],
              spacing: { after: 220 }
            }));
          } catch (e) {
            children.push(new Paragraph({ children: [new TextRun({ text: t.code, font: 'Consolas', size: 16 })] }));
          }
        } else {
          children.push(new Paragraph({
            children: [new TextRun({ text: t.code, font: 'Consolas', size: 16, color: '4E5C73' })],
            shading: { type: ShadingType.SOLID, color: 'F4F6FA', fill: 'F4F6FA' },
            spacing: { before: 180, after: 180 }
          }));
        }
        break;
      }

      case 'math': {
        const lines = MathEngine.toUnicode(t.latex).split('\n');
        lines.forEach((ln, idx) => {
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            shading: { type: ShadingType.SOLID, color: 'F7F9FD', fill: 'F7F9FD' },
            border: { left: { style: BorderStyle.SINGLE, size: 18, space: 10, color: accHex } },
            spacing: {
              before: idx === 0 ? 220 : 0,
              after: idx === lines.length - 1 ? 220 : 0,
              line: 300
            },
            children: [new TextRun({
              text: ln, italics: true, font: 'Cambria Math',
              size: sz + 4, color: '1C2436'
            })]
          }));
        });
        break;
      }

      case 'hr':
        children.push(new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: accHex, space: 8 } },
          spacing: { before: 220, after: 220 }
        }));
        break;
    }
  });

  /* header / footer */
  const header = o.headerTitle ? {
    default: new Header({
      children: [new Paragraph({
        children: [new TextRun({ text: o.title + (o.author ? '  •  ' + o.author : ''), font: fontName, size: 17, color: '96A0B4', italics: true })],
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E2E7F0', space: 6 } },
        spacing: { after: 120 }
      })]
    })
  } : undefined;

  const fkids = [];
  if (o.footerDate) { fkids.push(new TextRun({ text: formatDateHuman(o.date), font: fontName, size: 17, color: '96A0B4' })); fkids.push(new TextRun({ text: '\t' })); }
  if (o.pageNumbers) {
    if (!o.footerDate) fkids.push(new TextRun({ text: '\t' }));
    fkids.push(new TextRun({ text: 'Page ', font: fontName, size: 17, color: '96A0B4' }));
    fkids.push(new TextRun({ children: [PageNumber.CURRENT], font: fontName, size: 17, color: '96A0B4' }));
    fkids.push(new TextRun({ text: ' of ', font: fontName, size: 17, color: '96A0B4' }));
    fkids.push(new TextRun({ children: [PageNumber.TOTAL_PAGES], font: fontName, size: 17, color: '96A0B4' }));
  }
  const footer = fkids.length ? {
    default: new Footer({
      children: [new Paragraph({
        children: fkids,
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'E2E7F0', space: 6 } },
        spacing: { before: 120 }
      })]
    })
  } : undefined;

  const sizes = { a4: { w: 11906, h: 16838 }, letter: { w: 12240, h: 15840 }, legal: { w: 12240, h: 20160 } };
  const ps = sizes[o.pageSize] || sizes.a4;
  const mg = o.margin * 20;

  const docObj = new Document({
    creator: o.author || 'AI Text Converter Pro',
    title: o.title,
    subject: o.subject || 'Converted AI response',
    description: 'Generated by AI Text Converter Pro',
    numbering: {
      config: [{
        reference: 'atc-numbers',
        levels: [
          { level: 0, format: LevelFormat.DECIMAL,      text: '%1.',        alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720,  hanging: 360 } } } },
          { level: 1, format: LevelFormat.LOWER_LETTER, text: '%2.',        alignment: AlignmentType.START, style: { paragraph: { indent: { left: 1140, hanging: 360 } } } },
          { level: 2, format: LevelFormat.LOWER_ROMAN,  text: '%3.',        alignment: AlignmentType.START, style: { paragraph: { indent: { left: 1560, hanging: 360 } } } }
        ]
      }]
    },
    sections: [{
      properties: { page: { size: { width: ps.w, height: ps.h }, margin: { top: mg, right: mg, bottom: mg, left: mg } } },
      headers: header, footers: footer, children
    }]
  });

  const blob = await Packer.toBlob(docObj);
  saveAs(blob, sanitizeFilename(o.title) + '.docx');
}

/* ============================================================
   14. APP CONTROLLER
   ============================================================ */
const App = {
  markdown: '',
  analysis: null,

  init() {
    ThemeManager.init();
    DiagramEngine.init();
    PreviewRenderer.init();
    Options.init();
    Fullscreen.init();
    Zoom.init();
    this.bindInput();
    this.bindExports();
    this.bindShortcuts();
    this.bindModal();
    this.refresh();
  },

  /* ---------- input ---------- */
  bindInput() {
    const ta = $('#inputText');
    const update = debounce(() => this.refresh(), 260);
    ta.addEventListener('input', update);
    ta.addEventListener('paste', e => {
      const html = e.clipboardData && e.clipboardData.getData('text/html');
      // Rich clipboard tables from Word, Docs, ChatGPT and web pages lose
      // merged cells and row boundaries when pasted as plain text. Convert
      // the HTML payload first and insert canonical Markdown instead.
      if (html && /<table\b/i.test(html)) {
        e.preventDefault();
        const fixes = [];
        const markdown = Normalizer.htmlToMarkdown(html, fixes);
        const start = ta.selectionStart, end = ta.selectionEnd;
        ta.value = ta.value.slice(0, start) + markdown + ta.value.slice(end);
        ta.selectionStart = ta.selectionEnd = start + markdown.length;
        this.refresh();
        toast('Rich table preserved from clipboard', 'success');
        return;
      }
      setTimeout(() => this.refresh(), 30);
    });
    $('#sourceSelect').addEventListener('change', () => this.refresh());

    // drag & drop (whole wrapper)
    const overlay = $('#dropOverlay');
    const wrap = ta.parentElement;
    ['dragenter', 'dragover'].forEach(ev =>
      wrap.addEventListener(ev, e => { e.preventDefault(); overlay.classList.add('active'); }));
    ['dragleave', 'dragend'].forEach(ev =>
      wrap.addEventListener(ev, e => { if (e.target === wrap || e.target === overlay || e.target === ta) overlay.classList.remove('active'); }));
    wrap.addEventListener('drop', e => {
      e.preventDefault(); overlay.classList.remove('active');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) this.readFile(f);
    });

    $('#uploadBtn').addEventListener('click', () => $('#fileInput').click());
    $('#fileInput').addEventListener('change', e => { if (e.target.files[0]) this.readFile(e.target.files[0]); e.target.value = ''; });

    $('#pasteBtn').addEventListener('click', async () => {
      try {
        const txt = await navigator.clipboard.readText();
        if (!txt) { toast('Clipboard is empty', 'warn'); return; }
        ta.value = txt; this.refresh(); toast('Pasted from clipboard', 'success');
      } catch (e) { toast('Clipboard blocked — use Ctrl+V', 'error'); }
    });

    $('#clearBtn').addEventListener('click', () => {
      ta.value = ''; $('#docTitle').value = ''; this.refresh(); toast('Cleared', 'info');
    });

    $('#sampleBtn').addEventListener('click', () => {
      ta.value = SAMPLE; this.refresh(); toast('Sample loaded — includes diagrams, tables & math', 'success');
    });

    $('#printBtn').addEventListener('click', () => window.print());
  },

  readFile(file) {
    if (!/\.(txt|md|markdown|text)$/i.test(file.name)) { toast('Only .txt or .md files', 'error'); return; }
    const fr = new FileReader();
    fr.onload = e => {
      $('#inputText').value = e.target.result;
      if (!$('#docTitle').value) $('#docTitle').value = file.name.replace(/\.[^.]+$/, '');
      this.refresh(); toast('Loaded ' + file.name, 'success');
    };
    fr.onerror = () => toast('Could not read file', 'error');
    fr.readAsText(file);
  },

  /* ---------- main refresh ---------- */
  refresh(keepText) {
    const raw = $('#inputText').value;
    const analysis = FormatDetector.analyze(raw);
    const forced = $('#sourceSelect').value;
    if (forced !== 'auto') {
      const p = FormatDetector.PLATFORM_SIGNALS.filter(x => x.id === forced)[0];
      analysis.platform = forced;
      analysis.platformName = p ? p.name : forced.charAt(0).toUpperCase() + forced.slice(1);
    }
    const res = Normalizer.run(raw, analysis, Options.flags.autoRepair);
    this.analysis = analysis;
    this.markdown = res.markdown;

    PreviewRenderer.render(this.markdown);
    this.renderChips(analysis, res.fixes);
    this.updateStats(raw);
    if (!keepText) this.autoTitle();
  },

  renderChips(a, fixes) {
    const box = $('#detectChips');
    if (a.isEmpty) { box.innerHTML = '<span class="chip muted">Awaiting input…</span>'; return; }
    const chips = [];
    if (a.platform) chips.push('<span class="chip plat">' + escapeHtml(a.platformName) + '</span>');
    else chips.push('<span class="chip muted">Platform: generic</span>');
    a.formats.slice(0, 12).forEach(f => {
      chips.push('<span class="chip ok">' + escapeHtml(f.name) + (f.count > 1 ? ' <span class="num">×' + f.count + '</span>' : '') + '</span>');
    });
    fixes.slice(0, 8).forEach(fx => chips.push('<span class="chip fix">✓ ' + escapeHtml(fx) + '</span>'));
    box.innerHTML = chips.join('');
  },

  updateStats(raw) {
    const words = raw.trim() ? raw.trim().split(/\s+/).length : 0;
    $('#wordCount').textContent = words.toLocaleString() + ' word' + (words === 1 ? '' : 's');
    $('#charCount').textContent = raw.length.toLocaleString() + ' character' + (raw.length === 1 ? '' : 's');
    $('#readTime').textContent = Math.max(0, Math.ceil(words / 220)) + ' min read';
  },

  autoTitle() {
    const el = $('#docTitle');
    if (el.value.trim()) return;
    const m = this.markdown.match(/^#{1,2}\s+(.+)$/m);
    if (m) el.value = plainText(m[1]).slice(0, 90);
  },

  /* ---------- exports ---------- */
  bindExports() {
    const guard = () => {
      if (!this.markdown.trim()) { toast('Paste some AI text first!', 'warn'); return false; }
      return true;
    };

    $('#downloadPDF').addEventListener('click', async function () {
      if (!guard()) return;
      this.classList.add('loading');
      try {
        await generatePDF(App.markdown, Options.get());
        toast('PDF downloaded successfully', 'success');
      } catch (e) { console.error(e); toast('PDF error: ' + e.message, 'error'); }
      this.classList.remove('loading');
    });

    $('#downloadDOCX').addEventListener('click', async function () {
      if (!guard()) return;
      this.classList.add('loading');
      try {
        await generateDOCX(App.markdown, Options.get());
        toast('DOCX downloaded successfully', 'success');
      } catch (e) { console.error(e); toast('DOCX error: ' + e.message, 'error'); }
      this.classList.remove('loading');
    });

    $('#copyRichText').addEventListener('click', async () => {
      const html = $('#previewContent').innerHTML;
      if (!html) { toast('Nothing to copy', 'warn'); return; }
      try {
        const item = new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plainText(this.markdown)], { type: 'text/plain' })
        });
        await navigator.clipboard.write([item]);
        toast('Rich text copied — paste into Word or Docs', 'success');
      } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = html; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove();
        toast('Copied as HTML source', 'success');
      }
    });

    $('#copyMarkdown').addEventListener('click', () => {
      if (!this.markdown) { toast('Nothing to copy', 'warn'); return; }
      navigator.clipboard.writeText(this.markdown)
        .then(() => toast('Normalized Markdown copied', 'success'))
        .catch(() => toast('Copy failed', 'error'));
    });

    $('#copyHTML').addEventListener('click', () => {
      const html = $('#previewContent').innerHTML;
      if (!html) { toast('Nothing to copy', 'warn'); return; }
      navigator.clipboard.writeText(html)
        .then(() => toast('HTML copied', 'success'))
        .catch(() => toast('Copy failed', 'error'));
    });

    $('#downloadMD').addEventListener('click', () => {
      if (!this.markdown) { toast('Nothing to save', 'warn'); return; }
      const blob = new Blob([this.markdown], { type: 'text/markdown;charset=utf-8' });
      saveAs(blob, sanitizeFilename(Options.get().title) + '.md');
      toast('Markdown file saved', 'success');
    });
  },

  /* ---------- shortcuts & modal ---------- */
  bindShortcuts() {
    document.addEventListener('keydown', e => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;
      const k = e.key.toUpperCase();
      if (k === 'P') { e.preventDefault(); $('#downloadPDF').click(); }
      else if (k === 'D') { e.preventDefault(); $('#downloadDOCX').click(); }
      else if (k === 'L') { e.preventDefault(); ThemeManager.toggle(); }
      else if (k === 'F') { e.preventDefault(); Fullscreen.toggleWorkspace(); }
      else if (k === 'S') { e.preventDefault(); $('#sampleBtn').click(); }
      else if (k === 'X') { e.preventDefault(); $('#clearBtn').click(); }
    });
  },

  bindModal() {
    const modal = $('#shortcutModal');
    $('#shortcutBtn').addEventListener('click', () => { modal.hidden = false; });
    $('#closeModal').addEventListener('click', () => { modal.hidden = true; });
    modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });
  }
};

/* ============================================================
   15. SAMPLE TEXT
   ============================================================ */
const SAMPLE = [
'# Complete Guide to Machine Learning',
'',
'Machine Learning (ML) is a subset of **artificial intelligence** that enables systems to learn and improve from experience. This guide covers the *fundamental concepts* and ***advanced techniques*** used in modern ML, including ~~outdated~~ current best practices.',
'',
'## 1. The ML Workflow',
'',
'```mermaid',
'flowchart LR',
'    A[Raw Data] --> B[Preprocessing]',
'    B --> C{Enough Data?}',
'    C -->|Yes| D[Feature Engineering]',
'    C -->|No| E[Collect More]',
'    E --> A',
'    D --> F[Train Model]',
'    F --> G{Good Metrics?}',
'    G -->|Yes| H[Deploy]',
'    G -->|No| I[Tune Hyperparameters]',
'    I --> F',
'    H --> J[(Monitor in Production)]',
'```',
'',
'## 2. Types of Machine Learning',
'',
'### Supervised Learning',
'',
'In supervised learning, the algorithm learns from **labeled training data**. Key algorithms include:',
'',
'- **Linear Regression** — predicts continuous values',
'- **Logistic Regression** — binary classification',
'- **Decision Trees** — tree-based models',
'  - Random Forests (ensemble of trees)',
'  - Gradient Boosted Trees (sequential boosting)',
'- **Support Vector Machines (SVM)**',
'- **Neural Networks**',
'',
'### Unsupervised Learning',
'',
'1. **Clustering algorithms**',
'   1. K-Means Clustering',
'   2. Hierarchical Clustering',
'   3. DBSCAN',
'2. **Dimensionality Reduction**',
'   1. PCA (Principal Component Analysis)',
'   2. t-SNE',
'3. **Association Rules**',
'',
'### Training Sequence',
'',
'```mermaid',
'sequenceDiagram',
'    participant U as Engineer',
'    participant P as Pipeline',
'    participant M as Model',
'    participant S as Store',
'    U->>P: submit training job',
'    P->>P: validate & split data',
'    P->>M: fit(X_train, y_train)',
'    M-->>P: weights + metrics',
'    P->>S: register artifact v1.2',
'    S-->>U: deployment ready',
'```',
'',
'## 3. Python Code Example',
'',
'Here is a compact example using `scikit-learn`:',
'',
'```python',
'import numpy as np',
'from sklearn.model_selection import train_test_split',
'from sklearn.ensemble import RandomForestClassifier',
'from sklearn.metrics import accuracy_score, classification_report',
'',
'# Load and prepare data',
'X = np.random.rand(1000, 10)',
'y = (X[:, 0] + X[:, 1] > 1).astype(int)',
'',
'X_train, X_test, y_train, y_test = train_test_split(',
'    X, y, test_size=0.2, random_state=42',
')',
'',
'model = RandomForestClassifier(n_estimators=100, max_depth=5)',
'model.fit(X_train, y_train)',
'',
'predictions = model.predict(X_test)',
'print(f"Accuracy: {accuracy_score(y_test, predictions):.4f}")',
'print(classification_report(y_test, predictions))',
'```',
'',
'## 4. Model Comparison',
'',
'| Algorithm | Type | Accuracy | Speed | Best Use Case |',
'|-----------|------|----------|-------|---------------|',
'| Linear Regression | Supervised | Medium | Fast | Continuous prediction |',
'| Random Forest | Supervised | High | Medium | Tabular classification |',
'| K-Means | Unsupervised | Medium | Fast | Customer segmentation |',
'| Neural Network | Both | Very High | Slow | Images, text, audio |',
'| SVM | Supervised | High | Medium | High-dimensional data |',
'',
'## 5. The Mathematics',
'',
'The mean squared error is defined as $MSE = \\frac{1}{n}\\sum_{i=1}^{n}(y_i - \\hat{y}_i)^2$, while gradient descent updates weights using:',
'',
'$$\\theta_{t+1} = \\theta_t - \\eta \\nabla_\\theta J(\\theta_t)$$',
'',
'## 6. Important Considerations',
'',
'> **Note:** Always split your data into training and testing sets *before* evaluating performance. This prevents overfitting and gives a realistic estimate on unseen data.',
'',
'> *"The goal is to turn data into information, and information into insight."* — Carly Fiorina',
'',
'### Deployment Checklist',
'',
'- [x] Baseline model trained',
'- [x] Cross-validation completed',
'- [ ] A/B test configured',
'- [ ] Drift monitoring enabled',
'',
'---',
'',
'## 7. System Architecture',
'',
'```mermaid',
'graph TD',
'    subgraph Client',
'      W[Web App]',
'      M2[Mobile App]',
'    end',
'    subgraph Backend',
'      API[REST API]',
'      Q[Message Queue]',
'      INF[Inference Service]',
'    end',
'    DB[(Feature Store)]',
'    W --> API',
'    M2 --> API',
'    API --> Q',
'    Q --> INF',
'    INF --> DB',
'    INF --> API',
'```',
'',
'## 8. SQL for Feature Extraction',
'',
'```sql',
'SELECT',
'    customer_id,',
'    COUNT(*)            AS total_orders,',
'    SUM(order_amount)   AS total_spent,',
'    AVG(order_amount)   AS avg_order_value',
'FROM orders',
'WHERE order_date >= \'2024-01-01\'',
'GROUP BY customer_id',
'HAVING SUM(order_amount) > 1000',
'ORDER BY total_spent DESC',
'LIMIT 100;',
'```',
'',
'## 9. Conclusion',
'',
'Machine learning keeps evolving. Success depends on:',
'',
'- Understanding your **data** thoroughly',
'- Choosing the **right algorithm** for the task',
'- Rigorous **evaluation** and **validation**',
'- Continuous **iteration** and monitoring',
'',
'For more, see the [scikit-learn documentation](https://scikit-learn.org) or [TensorFlow tutorials](https://www.tensorflow.org/tutorials).',
'',
'---',
'',
'*Generated to demonstrate AI Text Converter Pro — diagrams, tables, math, code and formatting all export cleanly.*'
].join('\n');

/* ============================================================
   BOOT
   ============================================================ */
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => App.init());
else App.init();

})();
