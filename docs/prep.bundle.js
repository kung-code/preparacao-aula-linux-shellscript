// Arquivo gerado por tools/build.js — NÃO edite à mão.
(function () {
'use strict';
const __m = {};
__m["m1"] = (function () {
// Motor do editor vi simplificado (puro, sem DOM) — testado em tests/vi.test.js.
//
// Modos: normal, insert e comando (:). Suporta o essencial para iniciantes:
//   i a I A o O · Esc · h j k l / setas · 0 $ · w b · gg G · x dd D yy p P u · ZZ
//   :w  :q  :wq  :x  :q!  :w!  :NÚMERO

function createVi(text, { readonly = false, name = '' } = {}) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return {
    lines, row: 0, col: 0, mode: 'normal', cmd: '', pending: '',
    msg: name ? '"' + name + '" ' + lines.length + 'L' : '',
    modified: false, readonly, undo: [], register: null, quit: false,
  };
}

function viText(s) {
  return s.lines.join('\n') + '\n';
}

const snapshot = (s) => ({ lines: s.lines.slice(), row: s.row, col: s.col });
function pushUndo(s) {
  s.undo.push(snapshot(s));
  if (s.undo.length > 100) s.undo.shift();
}

function clampCol(s) {
  const len = s.lines[s.row].length;
  const max = s.mode === 'insert' ? len : Math.max(0, len - 1);
  s.col = Math.max(0, Math.min(s.col, max));
}

function clampRow(s) {
  s.row = Math.max(0, Math.min(s.row, s.lines.length - 1));
}

function changed(s) { s.modified = true; }

// Executa um comando de ":". save(text) grava o arquivo (pode lançar erro).
function runCommand(s, raw, save) {
  const c = raw.trim();
  s.mode = 'normal';
  s.cmd = '';
  if (c === '') return;
  if (/^\d+$/.test(c)) { s.row = parseInt(c, 10) - 1; clampRow(s); s.col = 0; return; }
  const m = /^(w|q|wq|x|wq!|w!|q!|x!)$/.exec(c);
  if (!m) { s.msg = 'E492: Não é um comando do editor: ' + c; s.error = true; return; }
  const force = c.endsWith('!');
  const wantsWrite = c.startsWith('w') || c.startsWith('x');
  const wantsQuit = c.includes('q') || c.startsWith('x');
  if (wantsWrite && !(c.startsWith('x') && !s.modified)) {
    if (s.readonly && !force) { s.msg = "E45: a opção 'readonly' está ativa (adicione ! para forçar)"; s.error = true; return; }
    try {
      save(viText(s));
      s.modified = false;
      s.msg = 'gravado: ' + s.lines.length + 'L';
      s.error = false;
    } catch (e) {
      s.msg = 'E212: Não foi possível abrir o arquivo para escrita' + (e && e.code === 'EACCES' ? ' (Permissão negada)' : '');
      s.error = true;
      return;
    }
  }
  if (wantsQuit) {
    if (s.modified && !force && !wantsWrite) {
      s.msg = 'E37: Sem gravação desde a última alteração (adicione ! para forçar)';
      s.error = true;
      return;
    }
    s.quit = true;
  }
}

function wordForward(s) {
  let { row, col } = s;
  const line = s.lines[row];
  const isW = (ch) => /\w/.test(ch);
  if (col < line.length) {
    const startW = isW(line[col]);
    while (col < line.length && isW(line[col]) === startW && line[col] !== ' ') col++;
    while (col < line.length && line[col] === ' ') col++;
  }
  if (col >= line.length && row < s.lines.length - 1) { row++; col = 0; while (s.lines[row][col] === ' ') col++; }
  s.row = row; s.col = col;
}

function wordBack(s) {
  let { row, col } = s;
  if (col === 0 && row > 0) { row--; col = s.lines[row].length; }
  const line = s.lines[row];
  col--;
  while (col > 0 && line[col] === ' ') col--;
  const isW = /\w/.test(line[col] || '');
  while (col > 0 && /\w/.test(line[col - 1]) === isW && line[col - 1] !== ' ') col--;
  s.row = row; s.col = Math.max(0, col);
}

// Processa uma tecla. key: 'a', 'Escape', 'Enter', 'Backspace', 'ArrowLeft', 'Tab'...
// Retorna o estado (mutado). s.quit = true quando o editor deve fechar.
function viKey(s, key, { save = () => {} } = {}) {
  s.error = false;
  if (s.mode === 'command') {
    if (key === 'Escape') { s.mode = 'normal'; s.cmd = ''; }
    else if (key === 'Enter') runCommand(s, s.cmd, save);
    else if (key === 'Backspace') { if (s.cmd === '') s.mode = 'normal'; else s.cmd = s.cmd.slice(0, -1); }
    else if (key.length === 1) s.cmd += key;
    return s;
  }

  if (s.mode === 'insert') {
    const line = s.lines[s.row];
    if (key === 'Escape') { s.mode = 'normal'; s.msg = ''; s.col--; clampCol(s); }
    else if (key === 'Enter') {
      const indent = /^\s*/.exec(line)[0];
      s.lines.splice(s.row, 1, line.slice(0, s.col), indent + line.slice(s.col));
      s.row++; s.col = indent.length; changed(s);
    } else if (key === 'Backspace') {
      if (s.col > 0) { s.lines[s.row] = line.slice(0, s.col - 1) + line.slice(s.col); s.col--; changed(s); }
      else if (s.row > 0) {
        const prev = s.lines[s.row - 1];
        s.lines.splice(s.row - 1, 2, prev + line);
        s.row--; s.col = prev.length; changed(s);
      }
    } else if (key === 'Delete') {
      if (s.col < line.length) { s.lines[s.row] = line.slice(0, s.col) + line.slice(s.col + 1); changed(s); }
    } else if (key === 'Tab') { insertText(s, '  '); }
    else if (key === 'ArrowLeft') { s.col--; clampCol(s); }
    else if (key === 'ArrowRight') { s.col++; clampCol(s); }
    else if (key === 'ArrowUp') { s.row--; clampRow(s); clampCol(s); }
    else if (key === 'ArrowDown') { s.row++; clampRow(s); clampCol(s); }
    else if (key.length === 1) insertText(s, key);
    return s;
  }

  // ----- modo normal -----
  const p = s.pending;
  s.pending = '';
  if (p === 'd') {
    if (key === 'd') {
      pushUndo(s);
      s.register = { lines: [s.lines[s.row]] };
      s.lines.splice(s.row, 1);
      if (!s.lines.length) s.lines.push('');
      clampRow(s); s.col = 0; changed(s);
    }
    return s;
  }
  if (p === 'y') { if (key === 'y') { s.register = { lines: [s.lines[s.row]] }; s.msg = '1 linha copiada'; } return s; }
  if (p === 'g') { if (key === 'g') { s.row = 0; s.col = 0; } return s; }
  if (p === 'Z') { if (key === 'Z') runCommand(s, 'x', save); return s; }

  const enterInsert = () => { pushUndo(s); s.mode = 'insert'; s.msg = '-- INSERÇÃO --'; };
  switch (key) {
    case 'i': enterInsert(); break;
    case 'a': enterInsert(); if (s.lines[s.row].length) s.col++; break;
    case 'I': enterInsert(); s.col = /^\s*/.exec(s.lines[s.row])[0].length; break;
    case 'A': enterInsert(); s.col = s.lines[s.row].length; break;
    case 'o': enterInsert(); s.lines.splice(s.row + 1, 0, /^\s*/.exec(s.lines[s.row])[0]); s.row++; s.col = s.lines[s.row].length; changed(s); break;
    case 'O': enterInsert(); s.lines.splice(s.row, 0, /^\s*/.exec(s.lines[s.row])[0]); s.col = s.lines[s.row].length; changed(s); break;
    case 'h': case 'ArrowLeft': case 'Backspace': s.col--; break;
    case 'l': case 'ArrowRight': case ' ': s.col++; break;
    case 'k': case 'ArrowUp': s.row--; break;
    case 'j': case 'ArrowDown': case 'Enter': s.row++; break;
    case '0': case 'Home': s.col = 0; break;
    case '$': case 'End': s.col = s.lines[s.row].length; break;
    case 'w': wordForward(s); break;
    case 'b': wordBack(s); break;
    case 'G': s.row = s.lines.length - 1; s.col = 0; break;
    case 'x': case 'Delete': {
      const line = s.lines[s.row];
      if (line.length) { pushUndo(s); s.lines[s.row] = line.slice(0, s.col) + line.slice(s.col + 1); changed(s); }
      break;
    }
    case 'D': pushUndo(s); s.lines[s.row] = s.lines[s.row].slice(0, s.col); changed(s); break;
    case 'p': case 'P':
      if (s.register) {
        pushUndo(s);
        const at = key === 'p' ? s.row + 1 : s.row;
        s.lines.splice(at, 0, ...s.register.lines);
        s.row = at; s.col = 0; changed(s);
      }
      break;
    case 'u':
      if (s.undo.length) { const u = s.undo.pop(); s.lines = u.lines; s.row = u.row; s.col = u.col; s.modified = true; s.msg = '1 alteração desfeita'; }
      else s.msg = 'Já está na alteração mais antiga';
      break;
    case 'd': case 'y': case 'g': case 'Z': s.pending = key; break;
    case ':': s.mode = 'command'; s.cmd = ''; break;
    case 'Escape': s.msg = ''; break;
    default: break;
  }
  clampRow(s);
  clampCol(s);
  return s;
}

function insertText(s, text) {
  const parts = text.replace(/\r/g, '').split('\n');
  const line = s.lines[s.row];
  const before = line.slice(0, s.col);
  const after = line.slice(s.col);
  if (parts.length === 1) {
    s.lines[s.row] = before + text + after;
    s.col += text.length;
  } else {
    const newLines = [before + parts[0]].concat(parts.slice(1, -1), [parts[parts.length - 1] + after]);
    s.lines.splice(s.row, 1, ...newLines);
    s.row += parts.length - 1;
    s.col = parts[parts.length - 1].length;
  }
  changed(s);
}

// Colar texto (no modo de inserção)
function viPaste(s, text) {
  if (s.mode !== 'insert') return s;
  insertText(s, text);
  return s;
}

return { createVi, viText, viKey, viPaste };
})();

__m["m2"] = (function () {
// Terminal no navegador: saída com cores ANSI, linha de entrada, histórico, Tab e editores nano/vi.

const { createVi, viKey, viPaste } = __m["m1"];

const ANSI_RE = /\x1b\[([0-9;]*)m/g;
const FG = { 30: 'k', 31: 'r', 32: 'g', 33: 'y', 34: 'b', 35: 'm', 36: 'c', 37: 'w', 90: 'gray', 91: 'r', 92: 'g', 93: 'y', 94: 'b', 95: 'm', 96: 'c', 97: 'w' };
const MAX_CHUNK_LINES = 3000;
const MAX_NODES = 2500;

class Terminal {
  constructor(root, { onTab, onInterrupt } = {}) {
    this.root = root;
    this.onTab = onTab;
    this.onInterrupt = onInterrupt;
    this.history = [];
    this.histPos = 0;
    this.pending = '';
    this.flushScheduled = false;
    this.style = { bold: false, fg: null };
    this.resolveInput = null;
    this.busy = false;

    root.classList.add('term');
    root.innerHTML = '';
    this.output = el('div', 'term-output');
    this.output.setAttribute('aria-live', 'polite');
    this.line = el('div', 'term-line');
    this.promptEl = el('span', 'term-prompt');
    this.input = el('input', 'term-input');
    Object.assign(this.input, { type: 'text', autocomplete: 'off', spellcheck: false, autocapitalize: 'off' });
    this.input.setAttribute('aria-label', 'Linha de comando');
    this.input.setAttribute('autocorrect', 'off');
    this.line.append(this.promptEl, this.input);
    this.measure = el('span', 'term-measure');
    this.measure.textContent = 'MMMMMMMMMM';
    root.append(this.output, this.line, this.measure);
    this.line.hidden = true;

    this.input.addEventListener('keydown', (e) => this.onKey(e));
    root.addEventListener('mouseup', () => {
      if (!window.getSelection || String(window.getSelection()) === '') this.focus();
    });
    document.addEventListener('keydown', (e) => {
      if (this.busy && e.ctrlKey && (e.key === 'c' || e.key === 'C') && !this.editorOpen) {
        e.preventDefault();
        if (this.onInterrupt) this.onInterrupt();
      }
    });
  }

  get columns() {
    const w = this.measure.getBoundingClientRect().width / 10 || 8;
    return Math.max(20, Math.floor((this.output.clientWidth - 4) / w));
  }

  focus() { if (!this.line.hidden && !this.editorOpen) this.input.focus({ preventScroll: true }); }

  // ---------- saída ----------
  write(text) {
    if (!text) return;
    this.pending += text;
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (f) => setTimeout(f, 16);
      raf(() => this.flush());
    }
  }

  flush() {
    this.flushScheduled = false;
    let text = this.pending;
    this.pending = '';
    if (!text) return;
    const lines = text.split('\n');
    if (lines.length > MAX_CHUNK_LINES) {
      const omitted = lines.length - MAX_CHUNK_LINES;
      text = '\x1b[90m… (' + omitted + ' linhas anteriores não exibidas na tela)\x1b[0m\n' + lines.slice(-MAX_CHUNK_LINES).join('\n');
    }
    const frag = document.createDocumentFragment();
    let last = 0;
    let m;
    ANSI_RE.lastIndex = 0;
    while ((m = ANSI_RE.exec(text))) {
      if (m.index > last) frag.append(this.span(text.slice(last, m.index)));
      this.applySgr(m[1]);
      last = ANSI_RE.lastIndex;
    }
    if (last < text.length) frag.append(this.span(text.slice(last)));
    this.output.append(frag);
    while (this.output.childNodes.length > MAX_NODES) this.output.removeChild(this.output.firstChild);
    this.scrollToEnd();
  }

  span(text) {
    if (!this.style.bold && !this.style.fg) return document.createTextNode(text);
    const s = document.createElement('span');
    if (this.style.bold) s.classList.add('b');
    if (this.style.fg) s.classList.add('c-' + this.style.fg);
    s.textContent = text;
    return s;
  }

  applySgr(params) {
    const codes = params === '' ? [0] : params.split(';').map(Number);
    for (const c of codes) {
      if (c === 0) this.style = { bold: false, fg: null };
      else if (c === 1) this.style.bold = true;
      else if (c === 22) this.style.bold = false;
      else if (c === 39) this.style.fg = null;
      else if (FG[c]) this.style.fg = FG[c];
    }
  }

  clear() {
    this.pending = '';
    this.output.innerHTML = '';
  }

  scrollToEnd() { this.root.scrollTop = this.root.scrollHeight; }

  // ---------- entrada ----------
  // Mostra o prompt e espera uma linha. Resolve com a string, ou null se o usuário apertar Ctrl+C.
  readLine(promptAnsi, { history = true } = {}) {
    this.flush();
    this.style = { bold: false, fg: null };
    this.busy = false;
    this.useHistory = history;
    this.histPos = this.history.length;
    this.currentPrompt = promptAnsi;
    this.promptEl.innerHTML = '';
    const saved = this.output;
    this.output = this.promptEl;
    this.pending = promptAnsi;
    this.flush();
    this.output = saved;
    this.style = { bold: false, fg: null };
    this.input.value = '';
    this.line.hidden = false;
    this.scrollToEnd();
    this.focus();
    return new Promise((resolve) => { this.resolveInput = resolve; });
  }

  finishInput(value, suffix = '') {
    const resolve = this.resolveInput;
    this.resolveInput = null;
    this.line.hidden = true;
    this.busy = true;
    this.write(this.currentPrompt + '\x1b[0m' + (value === null ? this.input.value : value) + suffix + '\n');
    this.flush();
    if (resolve) resolve(value);
  }

  onKey(e) {
    if (!this.resolveInput) return;
    const key = e.key;
    if (key === 'Enter') {
      e.preventDefault();
      const v = this.input.value;
      if (this.useHistory && v.trim() && this.history[this.history.length - 1] !== v) this.history.push(v);
      this.finishInput(v);
    } else if (e.ctrlKey && (key === 'c' || key === 'C')) {
      if (this.input.selectionStart !== this.input.selectionEnd) return; // permite copiar seleção
      e.preventDefault();
      this.finishInput(null, '^C');
    } else if (e.ctrlKey && (key === 'l' || key === 'L')) {
      e.preventDefault();
      this.clear();
    } else if (e.ctrlKey && (key === 'u' || key === 'U')) {
      e.preventDefault();
      this.input.value = '';
    } else if (key === 'ArrowUp' && this.useHistory) {
      e.preventDefault();
      if (this.histPos > 0) { this.histPos--; this.setInput(this.history[this.histPos]); }
    } else if (key === 'ArrowDown' && this.useHistory) {
      e.preventDefault();
      if (this.histPos < this.history.length - 1) { this.histPos++; this.setInput(this.history[this.histPos]); }
      else { this.histPos = this.history.length; this.setInput(''); }
    } else if (key === 'Tab') {
      e.preventDefault();
      this.tab();
    }
  }

  tab() {
    if (!this.onTab) return;
    const pos = this.input.selectionStart;
    const before = this.input.value.slice(0, pos);
    const after = this.input.value.slice(pos);
    const r = this.onTab(before);
    if (r.options && r.options.length) {
      this.write(this.currentPrompt + '\x1b[0m' + this.input.value + '\n' + r.options.join('  ') + '\n');
      this.flush();
    }
    this.setInput(r.line + after, r.line.length);
  }

  setInput(v, cursor) {
    this.input.value = v;
    const c = cursor === undefined ? v.length : cursor;
    this.input.setSelectionRange(c, c);
  }

  // Simula uma tecla (barra de atalhos no celular)
  virtualKey(name) {
    if (name === 'ctrl-c') {
      if (this.busy && this.onInterrupt) this.onInterrupt();
      else if (this.resolveInput) this.finishInput(null, '^C');
      return;
    }
    if (!this.resolveInput) return;
    if (name === 'tab') this.tab();
    else if (name === 'enter') { this.onKey({ key: 'Enter', preventDefault() {}, ctrlKey: false }); return; }
    else if (name === 'up' || name === 'down') this.onKey({ key: name === 'up' ? 'ArrowUp' : 'ArrowDown', preventDefault() {}, ctrlKey: false });
    else {
      const pos = this.input.selectionStart;
      const v = this.input.value;
      this.setInput(v.slice(0, pos) + name + v.slice(pos), pos + name.length);
    }
    this.focus();
  }

  // ---------- editor vi (modal) ----------
  editVi({ name, content, readonly, save }) {
    return new Promise((resolve) => {
      this.editorOpen = true;
      const s = createVi(content, { readonly, name });
      if (!content) s.msg = '"' + name + '" [Novo]';
      const overlay = el('div', 'vi');
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-label', 'Editor vi: ' + name);
      const screen = el('pre', 'vi-screen');
      const status = el('div', 'vi-status');
      const help = el('div', 'vi-help');
      help.innerHTML = '<span><b>i</b> inserir</span><span><b>Esc</b> modo normal</span><span><b>:wq</b> salvar e sair</span><span><b>:q!</b> sair sem salvar</span><span><b>dd</b> apaga linha</span><span><b>u</b> desfaz</span>';
      const input = el('textarea', 'vi-input');
      input.setAttribute('aria-label', 'Entrada do editor vi');
      input.setAttribute('autocapitalize', 'off');
      input.spellcheck = false;
      const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const render = () => {
        let html = '';
        s.lines.forEach((line, r) => {
          let body;
          if (r === s.row) {
            const ch = line[s.col];
            const curCls = s.mode === 'insert' ? 'vi-cur ins' : 'vi-cur';
            body = esc(line.slice(0, s.col)) + '<span class="' + curCls + '">' + (ch === undefined ? ' ' : esc(ch)) + '</span>' + esc(line.slice(s.col + 1));
          } else body = esc(line) || ' ';
          html += '<span class="vi-line' + (r === s.row ? ' cur' : '') + '">' + body + '</span>';
        });
        for (let i = 0; i < 6; i++) html += '<span class="vi-line vi-tilde">~</span>';
        screen.innerHTML = html;
        const left = s.mode === 'command' ? ':' + esc(s.cmd) + '<span class="vi-cur ins"> </span>'
          : '<span class="' + (s.error ? 'vi-err' : '') + '">' + esc(s.mode === 'insert' ? '-- INSERÇÃO --' : s.msg || '') + '</span>';
        status.innerHTML = '<span class="vi-left">' + left + '</span><span class="vi-pos">' + (s.modified ? '[+] ' : '') + (s.row + 1) + ',' + (s.col + 1) + '</span>';
        const cur = screen.querySelector('.vi-cur');
        if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
      };
      const close = () => {
        overlay.remove();
        this.editorOpen = false;
        resolve();
        setTimeout(() => this.input.focus(), 0);
      };
      input.addEventListener('keydown', (e) => {
        if (e.isComposing) return;
        let key = e.key;
        if (e.ctrlKey && (key === 'c' || key === 'C')) {
          e.preventDefault();
          if (s.mode === 'insert') viKey(s, 'Escape');
          s.msg = 'Para sair do vi, digite :q! e aperte Enter (ou :wq para salvar e sair)';
          render();
          return;
        }
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (key === 'Unidentified' || key === 'Process') return;
        if (key.length !== 1 && !['Escape', 'Enter', 'Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) return;
        e.preventDefault();
        viKey(s, key, { save });
        if (s.quit) { close(); return; }
        render();
      });
      // celulares: teclados virtuais nem sempre enviam keydown com a tecla certa
      input.addEventListener('input', () => {
        const v = input.value;
        input.value = '';
        if (!v) return;
        for (const ch of v) viKey(s, ch === '\n' ? 'Enter' : ch, { save });
        if (s.quit) { close(); return; }
        render();
      });
      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text');
        viPaste(s, text);
        render();
      });
      overlay.addEventListener('mousedown', (e) => { if (e.target !== input) { e.preventDefault(); input.focus(); } });
      overlay.append(screen, status, help, input);
      this.root.parentElement.append(overlay);
      render();
      input.focus();
    });
  }

  // ---------- editor (nano simplificado) ----------
  edit(opts) {
    if (opts.mode === 'vi') return this.editVi(opts);
    const { name, content, readonly, save } = opts;
    return new Promise((resolve) => {
      this.editorOpen = true;
      const overlay = el('div', 'nano');
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-label', 'Editor nano: ' + name);
      const header = el('div', 'nano-header');
      header.textContent = '  GNU nano (simulado)          ' + name + (readonly ? '  [somente leitura]' : '');
      const area = el('textarea', 'nano-area');
      area.value = content;
      area.spellcheck = false;
      area.readOnly = !!readonly;
      const status = el('div', 'nano-status');
      const footer = el('div', 'nano-footer');
      const btn = (label, action) => {
        const b = el('button', 'nano-btn');
        b.type = 'button';
        b.innerHTML = label;
        b.addEventListener('click', action);
        return b;
      };
      let modified = false;
      let asking = false;
      const close = () => {
        overlay.remove();
        this.editorOpen = false;
        resolve();
        setTimeout(() => this.input.focus(), 0);
      };
      const doSave = () => {
        if (readonly) { status.textContent = '[ Sem permissão de escrita neste arquivo ]'; return false; }
        try {
          save(area.value);
          modified = false;
          const lines = area.value === '' ? 0 : area.value.split('\n').length - (area.value.endsWith('\n') ? 1 : 0);
          status.textContent = '[ ' + lines + ' linha(s) gravada(s) ]';
          return true;
        } catch (err) {
          status.textContent = '[ Erro ao salvar: ' + (err.code === 'EACCES' ? 'Permissão negada' : err.message) + ' ]';
          return false;
        }
      };
      const doExit = () => {
        if (!modified || readonly) { close(); return; }
        asking = true;
        status.textContent = 'Salvar alterações? (S = sim, N = não, Esc = cancelar)';
      };
      footer.append(
        btn('<b>^O</b> Salvar', () => { doSave(); area.focus(); }),
        btn('<b>^X</b> Sair', () => { doExit(); area.focus(); }),
      );
      area.addEventListener('input', () => { modified = true; asking = false; status.textContent = ''; });
      area.addEventListener('keydown', (e) => {
        if (asking) {
          e.preventDefault();
          const k = e.key.toLowerCase();
          if (k === 's' || k === 'y') { if (doSave()) close(); }
          else if (k === 'n') close();
          else if (k === 'escape') { asking = false; status.textContent = ''; }
          return;
        }
        if (e.ctrlKey && (e.key === 'o' || e.key === 'O' || e.key === 's' || e.key === 'S')) { e.preventDefault(); doSave(); }
        else if (e.ctrlKey && (e.key === 'x' || e.key === 'X')) { e.preventDefault(); doExit(); }
        else if (e.key === 'Tab') {
          e.preventDefault();
          const s = area.selectionStart;
          area.setRangeText('  ', s, area.selectionEnd, 'end');
          modified = true;
        }
      });
      overlay.append(header, area, status, footer);
      this.root.parentElement.append(overlay);
      area.focus();
    });
  }
}

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

return { Terminal };
})();

__m["m3"] = (function () {
// Lexer + parser de um subconjunto do bash.
//
// Suporta: palavras com aspas simples/duplas e escape, $VAR, ${VAR}, $(cmd), `cmd`, $((expr)),
// pipes, &&, ||, ;, quebras de linha, redirecionamentos (> >> < 2> 2>> &> 2>&1),
// if/elif/else/fi, for/in/do/done, while/until, comentários (#) e continuação de linha.

class ParseError extends Error {}
// Lançado quando a entrada termina no meio de uma estrutura (ex.: "if" sem "fi").
class IncompleteError extends ParseError {}

const RESERVED = new Set(['if', 'then', 'elif', 'else', 'fi', 'for', 'in', 'do', 'done', 'while', 'until', '!']);

// Encontra o fim de $( ... ), respeitando aspas e parênteses aninhados.
function scanParen(src, i) {
  let depth = 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') { i += 2; continue; }
    if (ch === "'") {
      const end = src.indexOf("'", i + 1);
      if (end === -1) throw new IncompleteError("aspas simples não fechadas");
      i = end + 1; continue;
    }
    if (ch === '"') {
      i++;
      while (i < src.length && src[i] !== '"') { if (src[i] === '\\') i++; i++; }
      if (i >= src.length) throw new IncompleteError('aspas duplas não fechadas');
      i++; continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth === 0) return i; }
    i++;
  }
  throw new IncompleteError('parêntese não fechado');
}

// Lê um "$..." a partir de src[i] === '$'. Retorna [segmento, novoIndice].
function scanDollar(src, i, quoted) {
  const next = src[i + 1];
  if (next === '(' && src[i + 2] === '(') {
    const end = scanParen(src, i + 3); // fecha o primeiro )
    if (src[end + 1] !== ')') throw new ParseError('esperado ")" em expressão aritmética');
    return [{ type: 'arith', expr: src.slice(i + 3, end), quoted }, end + 2];
  }
  if (next === '(') {
    const end = scanParen(src, i + 2);
    return [{ type: 'cmd', src: src.slice(i + 2, end), quoted }, end + 1];
  }
  if (next === '{') {
    const end = src.indexOf('}', i + 2);
    if (end === -1) throw new IncompleteError('chave não fechada');
    const name = src.slice(i + 2, end);
    if (name.startsWith('#') && /^#[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      return [{ type: 'var', name: name.slice(1), length: true, quoted }, end + 1];
    }
    if (!/^([A-Za-z_][A-Za-z0-9_]*|[0-9]+|[?#@*$])$/.test(name)) throw new ParseError('${' + name + '}: substituição incorreta');
    return [{ type: 'var', name, quoted }, end + 1];
  }
  if (next !== undefined && /[?#@*$0-9]/.test(next)) return [{ type: 'var', name: next, quoted }, i + 2];
  const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i + 1));
  if (m) return [{ type: 'var', name: m[0], quoted }, i + 1 + m[0].length];
  return [{ type: 'lit', text: '$', quoted }, i + 1];
}

function isWordBreak(ch) {
  return ch === undefined || /[\s|&;<>()]/.test(ch);
}

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\' && src[i + 1] === '\n') { i += 2; continue; }
    if (ch === ' ' || ch === '\t' || ch === '\r') { i++; continue; }
    if (ch === '\n') { tokens.push({ t: 'op', v: '\n' }); i++; continue; }
    if (ch === '#') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    // operadores
    const two = src.slice(i, i + 2);
    const four = src.slice(i, i + 4);
    if (four === '2>&1') { tokens.push({ t: 'op', v: '2>&1' }); i += 4; continue; }
    if (src.slice(i, i + 3) === '2>>') { tokens.push({ t: 'op', v: '2>>' }); i += 3; continue; }
    if (two === '2>' && (i === 0 || isWordBreak(src[i - 1]))) { tokens.push({ t: 'op', v: '2>' }); i += 2; continue; }
    if (two === '&>') { tokens.push({ t: 'op', v: '&>' }); i += 2; continue; }
    if (two === '&&' || two === '||' || two === '>>' || two === ';;') { tokens.push({ t: 'op', v: two }); i += 2; continue; }
    if (two === '<<') throw new ParseError('here-documents (<<) não são suportados neste simulador');
    if ('|;<>'.includes(ch)) { tokens.push({ t: 'op', v: ch }); i++; continue; }
    if (ch === '&') throw new ParseError('execução em segundo plano (&) não é suportada neste simulador');
    if (ch === '(' || ch === ')') throw new ParseError('subshells com ( ) não são suportados neste simulador');

    // palavra
    const segs = [];
    let lit = '';
    const flush = (quoted) => { if (lit) { segs.push({ type: 'lit', text: lit, quoted }); lit = ''; } };
    while (i < src.length && !isWordBreak(src[i])) {
      const c = src[i];
      if (c === '\\') {
        if (src[i + 1] === '\n') { i += 2; continue; }
        flush(false);
        if (i + 1 < src.length) segs.push({ type: 'lit', text: src[i + 1], quoted: true });
        i += 2;
      } else if (c === "'") {
        flush(false);
        const end = src.indexOf("'", i + 1);
        if (end === -1) throw new IncompleteError('aspas simples não fechadas');
        segs.push({ type: 'lit', text: src.slice(i + 1, end), quoted: true });
        i = end + 1;
      } else if (c === '"') {
        flush(false);
        i++;
        let any = false;
        while (true) {
          if (i >= src.length) throw new IncompleteError('aspas duplas não fechadas');
          const d = src[i];
          if (d === '"') { i++; break; }
          if (d === '\\' && '"\\$`\n'.includes(src[i + 1])) {
            if (src[i + 1] !== '\n') lit += src[i + 1];
            i += 2; continue;
          }
          if (d === '$') {
            flush(true);
            const [seg, ni] = scanDollar(src, i, true);
            segs.push(seg); i = ni; any = true; continue;
          }
          if (d === '`') {
            flush(true);
            const end = src.indexOf('`', i + 1);
            if (end === -1) throw new IncompleteError('crase não fechada');
            segs.push({ type: 'cmd', src: src.slice(i + 1, end), quoted: true });
            i = end + 1; any = true; continue;
          }
          lit += d; i++;
        }
        if (lit || !any) { segs.push({ type: 'lit', text: lit, quoted: true }); lit = ''; }
      } else if (c === '$') {
        flush(false);
        const [seg, ni] = scanDollar(src, i, false);
        segs.push(seg); i = ni;
      } else if (c === '`') {
        flush(false);
        const end = src.indexOf('`', i + 1);
        if (end === -1) throw new IncompleteError('crase não fechada');
        segs.push({ type: 'cmd', src: src.slice(i + 1, end), quoted: false });
        i = end + 1;
      } else {
        lit += c; i++;
      }
    }
    flush(false);
    tokens.push({ t: 'word', segs });
  }
  return tokens;
}

// Texto "cru" da palavra se ela for um literal simples sem aspas (para palavras reservadas).
function plainWord(tok) {
  if (!tok || tok.t !== 'word') return null;
  if (tok.segs.length !== 1) return null;
  const s = tok.segs[0];
  return s.type === 'lit' && !s.quoted ? s.text : null;
}

const REDIR_OPS = new Set(['>', '>>', '<', '2>', '2>>', '&>', '2>&1']);

class Parser {
  constructor(tokens) {
    this.toks = tokens;
    this.pos = 0;
  }
  peek() { return this.toks[this.pos]; }
  next() { return this.toks[this.pos++]; }
  atEnd() { return this.pos >= this.toks.length; }
  isOp(v) { const t = this.peek(); return t && t.t === 'op' && t.v === v; }
  isReserved(v) { return plainWord(this.peek()) === v; }

  skipNewlines() { while (this.isOp('\n')) this.pos++; }
  skipSeparators() { while (this.isOp('\n') || this.isOp(';')) this.pos++; }

  expectReserved(v) {
    this.skipSeparators();
    if (this.atEnd()) throw new IncompleteError('esperado "' + v + '"');
    if (!this.isReserved(v)) throw new ParseError('erro de sintaxe próximo a "' + this.describe(this.peek()) + '" (esperado "' + v + '")');
    this.pos++;
  }

  describe(tok) {
    if (!tok) return 'fim da linha';
    if (tok.t === 'op') return tok.v === '\n' ? 'nova linha' : tok.v;
    return tok.segs.map((s) => s.text || ('$' + (s.name || ''))).join('');
  }

  // list: and_or ((; | \n) and_or)*   — para nas palavras de 'stops'
  parseList(stops) {
    const items = [];
    while (true) {
      this.skipSeparators();
      if (this.atEnd()) break;
      const pw = plainWord(this.peek());
      if (pw && stops.has(pw)) break;
      if (this.peek().t === 'op' && !REDIR_OPS.has(this.peek().v)) {
        throw new ParseError('erro de sintaxe próximo ao token inesperado "' + this.describe(this.peek()) + '"');
      }
      items.push(this.parseAndOr(stops));
      if (!this.atEnd() && !this.isOp(';') && !this.isOp('\n')) {
        const pw2 = plainWord(this.peek());
        if (pw2 && stops.has(pw2)) break;
        throw new ParseError('erro de sintaxe próximo ao token inesperado "' + this.describe(this.peek()) + '"');
      }
    }
    return { type: 'list', items };
  }

  parseAndOr(stops) {
    const first = this.parsePipeline(stops);
    const rest = [];
    while (this.isOp('&&') || this.isOp('||')) {
      const op = this.next().v;
      this.skipNewlines();
      if (this.atEnd()) throw new IncompleteError('comando esperado após ' + op);
      rest.push({ op, pipeline: this.parsePipeline(stops) });
    }
    return { type: 'andor', first, rest };
  }

  parsePipeline(stops) {
    let negate = false;
    if (this.isReserved('!')) { this.pos++; negate = true; }
    const commands = [this.parseCommand(stops)];
    while (this.isOp('|')) {
      this.pos++;
      this.skipNewlines();
      if (this.atEnd()) throw new IncompleteError('comando esperado após |');
      commands.push(this.parseCommand(stops));
    }
    return { type: 'pipeline', negate, commands };
  }

  parseCommand(stops) {
    const pw = plainWord(this.peek());
    let node;
    if (pw === 'if') node = this.parseIf();
    else if (pw === 'for') node = this.parseFor();
    else if (pw === 'while' || pw === 'until') node = this.parseWhile(pw === 'until');
    else if (pw && RESERVED.has(pw) && pw !== '!') {
      throw new ParseError('erro de sintaxe próximo ao token inesperado "' + pw + '"');
    } else return this.parseSimple(stops);
    node.redirs = this.parseRedirs();
    return node;
  }

  parseRedirs() {
    const redirs = [];
    while (!this.atEnd() && this.peek().t === 'op' && REDIR_OPS.has(this.peek().v)) {
      redirs.push(this.parseRedir());
    }
    return redirs;
  }

  parseRedir() {
    const op = this.next().v;
    if (op === '2>&1') return { op };
    const target = this.peek();
    if (!target || target.t !== 'word') {
      if (!target || target.v === '\n') throw new ParseError('erro de sintaxe próximo ao token inesperado "nova linha"');
      throw new ParseError('erro de sintaxe próximo ao token inesperado "' + this.describe(target) + '"');
    }
    this.pos++;
    return { op, target };
  }

  parseSimple() {
    const assigns = [];
    const words = [];
    const redirs = [];
    while (!this.atEnd()) {
      const tok = this.peek();
      if (tok.t === 'op') {
        if (REDIR_OPS.has(tok.v)) { redirs.push(this.parseRedir()); continue; }
        break;
      }
      if (words.length === 0) {
        const first = tok.segs[0];
        if (first && first.type === 'lit' && !first.quoted) {
          const m = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(first.text);
          if (m) {
            const rest = first.text.slice(m[0].length);
            const valueSegs = (rest ? [{ type: 'lit', text: rest, quoted: false }] : []).concat(tok.segs.slice(1));
            assigns.push({ name: m[1], value: { t: 'word', segs: valueSegs } });
            this.pos++;
            continue;
          }
        }
      }
      words.push(tok);
      this.pos++;
    }
    if (!words.length && !assigns.length && !redirs.length) {
      throw new ParseError('erro de sintaxe próximo ao token inesperado "' + this.describe(this.peek()) + '"');
    }
    return { type: 'simple', assigns, words, redirs };
  }

  parseIf() {
    this.pos++; // if
    const clauses = [];
    let elseBody = null;
    const cond = this.parseList(new Set(['then']));
    this.expectReserved('then');
    const body = this.parseList(new Set(['elif', 'else', 'fi']));
    clauses.push({ cond, body });
    while (true) {
      this.skipSeparators();
      if (this.atEnd()) throw new IncompleteError('esperado "fi"');
      if (this.isReserved('elif')) {
        this.pos++;
        const c = this.parseList(new Set(['then']));
        this.expectReserved('then');
        const b = this.parseList(new Set(['elif', 'else', 'fi']));
        clauses.push({ cond: c, body: b });
      } else if (this.isReserved('else')) {
        this.pos++;
        elseBody = this.parseList(new Set(['fi']));
      } else break;
    }
    this.expectReserved('fi');
    this.checkEmpty(clauses.map((c) => c.cond).concat(clauses.map((c) => c.body)), 'if');
    return { type: 'if', clauses, elseBody };
  }

  checkEmpty(lists, kw) {
    for (const l of lists) if (l && l.items.length === 0) throw new ParseError('erro de sintaxe: bloco vazio no "' + kw + '"');
  }

  parseFor() {
    this.pos++; // for
    const nameTok = this.next();
    if (this.atEnd() && !nameTok) throw new IncompleteError('esperado nome de variável');
    const name = plainWord(nameTok);
    if (!name || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new ParseError('for: nome de variável inválido');
    let words = null;
    if (this.isReserved('in')) {
      this.pos++;
      words = [];
      while (!this.atEnd() && this.peek().t === 'word') {
        if (plainWord(this.peek()) === 'do') break;
        words.push(this.next());
      }
    }
    this.expectReserved('do');
    const body = this.parseList(new Set(['done']));
    this.expectReserved('done');
    this.checkEmpty([body], 'for');
    return { type: 'for', name, words, body };
  }

  parseWhile(until) {
    this.pos++;
    const cond = this.parseList(new Set(['do']));
    this.expectReserved('do');
    const body = this.parseList(new Set(['done']));
    this.expectReserved('done');
    this.checkEmpty([cond, body], until ? 'until' : 'while');
    return { type: 'while', until, cond, body };
  }
}

function parse(src) {
  const tokens = tokenize(src);
  // Operador no final da entrada => comando incompleto (continua na próxima linha)
  const last = tokens.filter((t) => !(t.t === 'op' && t.v === '\n')).pop();
  if (last && last.t === 'op' && (last.v === '|' || last.v === '&&' || last.v === '||')) {
    throw new IncompleteError('comando esperado após ' + last.v);
  }
  const p = new Parser(tokens);
  const list = p.parseList(new Set());
  if (!p.atEnd()) {
    const pw = plainWord(p.peek());
    throw new ParseError('erro de sintaxe próximo ao token inesperado "' + (pw || p.describe(p.peek())) + '"');
  }
  return list;
}

return { ParseError, IncompleteError, tokenize, plainWord, parse };
})();

__m["m4"] = (function () {
// Sistema de arquivos virtual em memória, com dono e permissões no estilo Unix.

class FsError extends Error {
  constructor(code, path) {
    super(code + ': ' + path);
    this.code = code;
    this.path = path;
  }
}

const MENSAGENS_ERRO = {
  ENOENT: 'Arquivo ou diretório inexistente',
  EACCES: 'Permissão negada',
  EISDIR: 'É um diretório',
  ENOTDIR: 'Não é um diretório',
  EEXIST: 'Arquivo existe',
  ENOTEMPTY: 'Diretório não vazio',
  EPERM: 'Operação não permitida',
  EINVAL: 'Argumento inválido',
};

function mensagemErro(e) {
  if (e instanceof FsError) return MENSAGENS_ERRO[e.code] || e.code;
  return String(e && e.message ? e.message : e);
}

let clock = () => Date.now();
function setClock(fn) { clock = fn; }

function makeNode(type, name, opts = {}) {
  const node = {
    type,
    name,
    parent: null,
    mode: opts.mode !== undefined ? opts.mode : type === 'dir' ? 0o755 : 0o644,
    owner: opts.owner || 'root',
    group: opts.group || opts.owner || 'root',
    mtime: opts.mtime || clock(),
  };
  if (type === 'dir') node.children = new Map();
  else {
    node.content = opts.content || '';
    if (opts.exec) node.exec = opts.exec; // "binário" implementado em JS
    if (opts.device) node.device = opts.device; // ex.: /dev/null
  }
  return node;
}

function splitPath(abs) {
  return abs.split('/').filter(Boolean);
}

function normalizePath(path, cwd = '/') {
  const base = path.startsWith('/') ? [] : splitPath(cwd);
  for (const part of splitPath(path)) {
    if (part === '.') continue;
    if (part === '..') base.pop();
    else base.push(part);
  }
  return '/' + base.join('/');
}

function dirname(abs) {
  const parts = splitPath(abs);
  parts.pop();
  return '/' + parts.join('/');
}

function basename(abs) {
  const parts = splitPath(abs);
  return parts.length ? parts[parts.length - 1] : '/';
}

class VFS {
  constructor(user = 'aluno') {
    this.user = user;
    this.root = makeNode('dir', '', { mode: 0o755 });
  }

  // ---------- permissões ----------
  perm(node, bit) {
    // bit: 4 = r, 2 = w, 1 = x
    if (this.user === 'root') return bit !== 1 || node.type === 'dir' || (node.mode & 0o111) !== 0;
    let shift;
    if (node.owner === this.user) shift = 6;
    else if (node.group === this.user) shift = 3;
    else shift = 0;
    return ((node.mode >> shift) & bit) !== 0;
  }
  canRead(node) { return this.perm(node, 4); }
  canWrite(node) { return this.perm(node, 2); }
  canExec(node) { return this.perm(node, 1); }

  // ---------- navegação ----------
  // Retorna o nó do caminho absoluto. Lança FsError.
  // checkTraverse: exige permissão x nos diretórios intermediários.
  lookup(abs, { checkTraverse = true } = {}) {
    let node = this.root;
    const parts = splitPath(abs);
    for (let i = 0; i < parts.length; i++) {
      if (node.type !== 'dir') throw new FsError('ENOTDIR', abs);
      if (checkTraverse && !this.canExec(node)) throw new FsError('EACCES', abs);
      const next = node.children.get(parts[i]);
      if (!next) throw new FsError('ENOENT', abs);
      node = next;
    }
    return node;
  }

  exists(abs) {
    try { this.lookup(abs); return true; } catch (e) { return false; }
  }

  tryLookup(abs) {
    try { return this.lookup(abs); } catch (e) { return null; }
  }

  pathOf(node) {
    const parts = [];
    while (node && node.parent) { parts.unshift(node.name); node = node.parent; }
    return '/' + parts.join('/');
  }

  // Diretório-pai (já validado) para criar/remover uma entrada.
  parentFor(abs, { needWrite = true } = {}) {
    if (abs === '/') throw new FsError('EEXIST', abs);
    const parent = this.lookup(dirname(abs));
    if (parent.type !== 'dir') throw new FsError('ENOTDIR', abs);
    if (needWrite && !this.canWrite(parent)) throw new FsError('EACCES', abs);
    return parent;
  }

  attach(parent, node) {
    node.parent = parent;
    parent.children.set(node.name, node);
    parent.mtime = clock();
  }

  // ---------- leitura ----------
  readFile(abs) {
    const node = this.lookup(abs);
    if (node.type === 'dir') throw new FsError('EISDIR', abs);
    if (!this.canRead(node)) throw new FsError('EACCES', abs);
    if (node.device === 'null') return '';
    return node.content;
  }

  readDir(abs) {
    const node = this.lookup(abs);
    if (node.type !== 'dir') throw new FsError('ENOTDIR', abs);
    if (!this.canRead(node)) throw new FsError('EACCES', abs);
    return Array.from(node.children.values());
  }

  // ---------- escrita ----------
  writeFile(abs, content, { append = false, mode, owner, exec } = {}) {
    let node = this.tryLookup(abs);
    if (node) {
      if (node.type === 'dir') throw new FsError('EISDIR', abs);
      if (node.device === 'null') return node;
      if (!this.canWrite(node)) throw new FsError('EACCES', abs);
      node.content = append ? node.content + content : content;
      node.mtime = clock();
      return node;
    }
    const parent = this.parentFor(abs);
    node = makeNode('file', basename(abs), {
      content,
      mode: mode !== undefined ? mode : 0o644,
      owner: owner || this.user,
      exec,
    });
    this.attach(parent, node);
    return node;
  }

  touch(abs) {
    const node = this.tryLookup(abs);
    if (node) { node.mtime = clock(); return node; }
    return this.writeFile(abs, '');
  }

  mkdir(abs, { parents = false, mode, owner } = {}) {
    if (parents) {
      let cur = '';
      let node = this.root;
      for (const part of splitPath(abs)) {
        cur += '/' + part;
        const next = node.children.get(part);
        if (next) {
          if (next.type !== 'dir') throw new FsError('ENOTDIR', cur);
          node = next;
          continue;
        }
        if (!this.canWrite(node)) throw new FsError('EACCES', cur);
        const created = makeNode('dir', part, { mode: mode !== undefined ? mode : 0o755, owner: owner || this.user });
        this.attach(node, created);
        node = created;
      }
      return node;
    }
    if (this.tryLookup(abs)) throw new FsError('EEXIST', abs);
    const parent = this.parentFor(abs);
    const node = makeNode('dir', basename(abs), { mode: mode !== undefined ? mode : 0o755, owner: owner || this.user });
    this.attach(parent, node);
    return node;
  }

  remove(abs, { recursive = false } = {}) {
    const node = this.lookup(abs);
    if (node === this.root) throw new FsError('EPERM', abs);
    const parent = this.parentFor(abs);
    if (node.type === 'dir') {
      if (!recursive && node.children.size > 0) throw new FsError('ENOTEMPTY', abs);
      if (recursive) this.checkRemovable(node, abs);
    }
    parent.children.delete(node.name);
    parent.mtime = clock();
  }

  // Remoção recursiva exige permissão de escrita/leitura em toda a subárvore.
  checkRemovable(dir, abs) {
    if (!this.canRead(dir) || !this.canWrite(dir) || !this.canExec(dir)) throw new FsError('EACCES', abs);
    for (const child of dir.children.values()) {
      if (child.type === 'dir') this.checkRemovable(child, abs + '/' + child.name);
    }
  }

  cloneNode(node, name) {
    const copy = makeNode(node.type, name, {
      mode: node.mode, owner: this.user, content: node.content, exec: node.exec, device: node.device,
    });
    if (node.type === 'dir') {
      for (const child of node.children.values()) {
        if (!this.canRead(child)) throw new FsError('EACCES', this.pathOf(child));
        const c = this.cloneNode(child, child.name);
        c.parent = copy;
        copy.children.set(c.name, c);
      }
    }
    return copy;
  }

  copy(src, dest) {
    const node = this.lookup(src);
    if (!this.canRead(node)) throw new FsError('EACCES', src);
    const existing = this.tryLookup(dest);
    if (existing && existing.type === 'dir' && node.type === 'dir') throw new FsError('EEXIST', dest);
    if (existing && node.type === 'file') {
      return this.writeFile(dest, node.content);
    }
    const parent = this.parentFor(dest);
    const copy = this.cloneNode(node, basename(dest));
    this.attach(parent, copy);
    return copy;
  }

  move(src, dest) {
    const node = this.lookup(src);
    if (node === this.root) throw new FsError('EPERM', src);
    if (node.type === 'dir' && (dest + '/').startsWith(src + '/')) throw new FsError('EINVAL', dest);
    const oldParent = this.parentFor(src);
    const newParent = this.parentFor(dest);
    const existing = newParent.children.get(basename(dest));
    if (existing && existing.type === 'dir') {
      if (node.type !== 'dir') throw new FsError('EISDIR', dest);
      if (existing.children.size > 0) throw new FsError('ENOTEMPTY', dest);
    }
    oldParent.children.delete(node.name);
    node.name = basename(dest);
    this.attach(newParent, node);
    oldParent.mtime = clock();
    return node;
  }

  chmod(abs, mode) {
    const node = this.lookup(abs);
    if (this.user !== 'root' && node.owner !== this.user) throw new FsError('EPERM', abs);
    node.mode = mode & 0o7777;
    return node;
  }

  // Caminhada recursiva (pré-ordem). onError recebe FsError de diretórios ilegíveis.
  walk(abs, visit, onError) {
    const node = this.lookup(abs);
    const rec = (n, path, depth) => {
      visit(n, path, depth);
      if (n.type !== 'dir') return;
      if (!this.canRead(n) || !this.canExec(n)) {
        if (onError) onError(new FsError('EACCES', path));
        return;
      }
      const kids = Array.from(n.children.values()).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      for (const k of kids) rec(k, path === '/' ? '/' + k.name : path + '/' + k.name, depth + 1);
    };
    rec(node, abs, 0);
  }

  // ---------- serialização ----------
  serialize() {
    const ser = (n) => {
      const o = { t: n.type === 'dir' ? 'd' : 'f', n: n.name, m: n.mode, o: n.owner, g: n.group, ti: n.mtime };
      if (n.type === 'dir') o.c = Array.from(n.children.values()).map(ser);
      else {
        o.x = n.content;
        if (n.exec) o.e = n.exec;
        if (n.device) o.dv = n.device;
      }
      return o;
    };
    return JSON.stringify({ user: this.user, root: ser(this.root) });
  }

  static deserialize(json) {
    const data = JSON.parse(json);
    const vfs = new VFS(data.user);
    const de = (o) => {
      const n = makeNode(o.t === 'd' ? 'dir' : 'file', o.n, {
        mode: o.m, owner: o.o, group: o.g, mtime: o.ti, content: o.x, exec: o.e, device: o.dv,
      });
      if (o.c) for (const c of o.c) { const child = de(c); child.parent = n; n.children.set(child.name, child); }
      return n;
    };
    vfs.root = de(data.root);
    return vfs;
  }
}

// Formata o modo como no ls -l: drwxr-xr-x
function modeString(node) {
  const t = node.type === 'dir' ? 'd' : node.device ? 'c' : '-';
  let s = t;
  for (const shift of [6, 3, 0]) {
    const bits = (node.mode >> shift) & 7;
    s += (bits & 4 ? 'r' : '-') + (bits & 2 ? 'w' : '-') + (bits & 1 ? 'x' : '-');
  }
  return s;
}

return { FsError, MENSAGENS_ERRO, mensagemErro, setClock, splitPath, normalizePath, dirname, basename, VFS, modeString };
})();

__m["m5"] = (function () {
// Utilitários puros (sem DOM), compatíveis com navegador e Node.

// ---------- UTF-8 ----------
function utf8Encode(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const c2 = str.charCodeAt(i + 1);
      if (c2 >= 0xdc00 && c2 <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return bytes;
}

function utf8Decode(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    let c;
    if (b < 0x80) { c = b; i += 1; }
    else if (b >= 0xf0) { c = ((b & 7) << 18) | ((bytes[i + 1] & 63) << 12) | ((bytes[i + 2] & 63) << 6) | (bytes[i + 3] & 63); i += 4; }
    else if (b >= 0xe0) { c = ((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63); i += 3; }
    else if (b >= 0xc0) { c = ((b & 31) << 6) | (bytes[i + 1] & 63); i += 2; }
    else { c = 0xfffd; i += 1; }
    out += String.fromCodePoint(c);
  }
  return out;
}

function byteLength(str) {
  let n = 0;
  for (const ch of str) {
    const c = ch.codePointAt(0);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

// ---------- Base64 ----------
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64Encode(str) {
  const bytes = utf8Encode(str);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

function base64Decode(b64) {
  const clean = b64.replace(/[\s=]/g, '');
  if (/[^A-Za-z0-9+/]/.test(clean)) throw new Error('entrada inválida');
  const bytes = [];
  for (let i = 0; i < clean.length; i += 4) {
    const chunk = clean.slice(i, i + 4);
    let n = 0;
    for (let j = 0; j < 4; j++) n = (n << 6) | (j < chunk.length ? B64.indexOf(chunk[j]) : 0);
    bytes.push((n >> 16) & 255);
    if (chunk.length > 2) bytes.push((n >> 8) & 255);
    if (chunk.length > 3) bytes.push(n & 255);
  }
  return utf8Decode(bytes);
}

// ---------- SHA-256 ----------
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function sha256(str) {
  const bytes = utf8Encode(str);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255);
  bytes.push((lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);

  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const W = new Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));

  for (let off = 0; off < bytes.length; off += 64) {
    for (let t = 0; t < 16; t++) {
      const i = off + t * 4;
      W[t] = ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
      const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return H.map((x) => x.toString(16).padStart(8, '0')).join('');
}

// ---------- PRNG determinístico (mulberry32) ----------
function makeRng(seedHex) {
  let s = parseInt(String(seedHex).slice(0, 8), 16) >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min, max) { return min + Math.floor(next() * (max - min + 1)); },
    pick(arr) { return arr[Math.floor(next() * arr.length)]; },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      }
      return arr;
    },
  };
}

// ---------- ANSI ----------
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', gray: '\x1b[90m',
  bblue: '\x1b[1;34m', bgreen: '\x1b[1;32m', bred: '\x1b[1;31m', byellow: '\x1b[1;33m', bcyan: '\x1b[1;36m',
};

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// ---------- Datas pt-BR ----------
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const DIAS_LONGOS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

const pad2 = (n) => String(n).padStart(2, '0');

// Converte um padrão glob (*, ?, [..]) em RegExp ancorada.
function globToRegex(glob, { ignoreCase = false } = {}) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '\\' && i + 1 < glob.length) { re += glob[++i].replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'); continue; }
    if (ch === '*') re += '.*';
    else if (ch === '?') re += '.';
    else if (ch === '[') {
      const end = glob.indexOf(']', i + 2);
      if (end === -1) { re += '\\['; continue; }
      let body = glob.slice(i + 1, end);
      if (body[0] === '!' || body[0] === '^') body = '^' + body.slice(1);
      re += '[' + body.replace(/\\/g, '\\\\') + ']';
      i = end;
    } else re += ch.replace(/[.+^${}()|\\/]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', ignoreCase ? 'i' : '');
}

// Há algum *, ? ou [ não escapado com barra invertida?
function hasGlobChars(s) {
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue; }
    if (s[i] === '*' || s[i] === '?' || s[i] === '[') return true;
  }
  return false;
}

function unescapeGlob(s) {
  return s.replace(/\\(.)/g, '$1');
}

function escapeGlob(s) {
  return s.replace(/[*?[\]\\]/g, '\\$&');
}

return { utf8Encode, utf8Decode, byteLength, base64Encode, base64Decode, sha256, makeRng, C, stripAnsi, MESES, MESES_LONGOS, DIAS, DIAS_LONGOS, pad2, globToRegex, hasGlobChars, unescapeGlob, escapeGlob };
})();

__m["m6"] = (function () {
// Interpretador: executa a AST do parser sobre o VFS.

const { parse, ParseError, IncompleteError, tokenize } = __m["m3"];
const { normalizePath, mensagemErro, FsError } = __m["m4"];
const { C, stripAnsi, globToRegex, hasGlobChars, unescapeGlob, escapeGlob } = __m["m5"];

class ExitSignal { constructor(code) { this.code = code; } }
class BreakSignal { constructor(levels) { this.levels = levels; } }
class ContinueSignal { constructor(levels) { this.levels = levels; } }
class InterruptSignal {}
class StepLimitSignal {}

// ---------- saídas ----------
class StringSink {
  constructor() { this.buf = ''; this.isTTY = false; }
  write(s) { this.buf += s; }
}
class FnSink {
  constructor(fn, isTTY = true) { this.fn = fn; this.isTTY = isTTY; }
  write(s) { if (s) this.fn(this.isTTY ? s : stripAnsi(s)); }
}
class NullSink {
  constructor() { this.isTTY = false; }
  write() {}
}
class FileSink {
  constructor(vfs, abs) { this.vfs = vfs; this.abs = abs; this.isTTY = false; }
  write(s) { if (s) this.vfs.writeFile(this.abs, stripAnsi(s), { append: true }); }
}

// Comandos que existem no Linux real mas não neste simulador.
const INDISPONIVEIS = new Set([
  'awk', 'sed', 'emacs', 'python', 'python3', 'git', 'curl', 'wget', 'ssh', 'ping', 'docker',
  'top', 'htop', 'ps', 'kill', 'killall', 'apt', 'apt-get', 'snap', 'gcc', 'make', 'node', 'java',
  'xargs', 'diff', 'tar', 'zip', 'unzip', 'gzip', 'ln', 'du', 'df', 'free', 'ifconfig', 'ip', 'systemctl', 'service',
  'su', 'passwd', 'useradd', 'adduser', 'crontab', 'nc', 'nmap', 'tee', 'stat', 'paste', 'awk',
]);

const MAX_DEPTH = 40;
const YIELD_EVERY = 256;

class Shell {
  constructor({ vfs, io, commands, user = 'aluno', home = '/home/aluno', hostname = 'pinguimcorp', maxSteps = 500000 }) {
    this.vfs = vfs;
    this.io = io;
    this.user = user;
    this.home = home;
    this.hostname = hostname;
    this.commands = Object.assign({}, commands);
    this.binaries = {};
    this.history = [];
    this.lastStatus = 0;
    this.cwd = vfs.exists(home) ? home : '/';
    this.oldpwd = this.cwd;
    this.maxSteps = maxSteps;
    this.steps = 0;
    this.interrupted = false;
    this.exported = new Set(['HOME', 'USER', 'LOGNAME', 'PATH', 'PWD', 'SHELL', 'HOSTNAME', 'LANG', 'TERM', 'OLDPWD']);
    this.vars = new Map([
      ['HOME', home], ['USER', user], ['LOGNAME', user], ['PATH', '/usr/local/bin:/usr/bin:/bin'],
      ['PWD', this.cwd], ['OLDPWD', this.cwd], ['SHELL', '/bin/bash'], ['HOSTNAME', hostname],
      ['LANG', 'pt_BR.UTF-8'], ['TERM', 'xterm-256color'], ['IFS', ' \t\n'],
    ]);
    const tty = (fn) => new FnSink((s) => fn(s), true);
    this.ttyOut = tty((s) => this.io.write(s));
    this.ttyErr = tty((s) => (this.io.writeErr ? this.io.writeErr(s) : this.io.write(s)));
  }

  // ---------- utilidades públicas ----------
  resolve(path) {
    if (path === '~' || path.startsWith('~/')) path = this.home + path.slice(1);
    return normalizePath(path, this.cwd);
  }

  displayPath(abs) {
    if (abs === this.home) return '~';
    if (abs.startsWith(this.home + '/')) return '~' + abs.slice(this.home.length);
    return abs;
  }

  prompt() {
    return C.bgreen + this.user + '@' + this.hostname + C.reset + ':' + C.bblue + this.displayPath(this.cwd) + C.reset + '$ ';
  }

  setCwd(abs) {
    this.oldpwd = this.cwd;
    this.cwd = abs;
    this.vars.set('OLDPWD', this.oldpwd);
    this.vars.set('PWD', abs);
  }

  // A linha está incompleta (ex.: "for ...; do" sem "done")?
  isIncomplete(src) {
    try { parse(src); return false; } catch (e) { return e instanceof IncompleteError; }
  }

  interrupt() { this.interrupted = true; }

  newFrame(overrides) {
    return Object.assign({
      vars: this.vars,
      positional: [],
      name: 'bash',
      stdin: { data: null },
      stdout: this.ttyOut,
      stderr: this.ttyErr,
      depth: 0,
    }, overrides);
  }

  // Executa uma linha digitada no terminal.
  async run(src, { history = true } = {}) {
    const trimmed = src.trim();
    if (history && trimmed) this.history.push(src.replace(/\n+$/, ''));
    this.steps = 0;
    this.interrupted = false;
    const frame = this.newFrame();
    let status;
    try {
      status = await this.execSource(src, frame);
    } catch (e) {
      status = this.handleTopError(e, frame);
    }
    this.lastStatus = status;
    return status;
  }

  handleTopError(e, frame) {
    if (e instanceof ExitSignal) {
      frame.stdout.write('exit\n' + C.gray + '(no Linux real, isto fecharia o terminal 😉)' + C.reset + '\n');
      return e.code;
    }
    if (e instanceof InterruptSignal) { frame.stdout.write('^C\n'); return 130; }
    if (e instanceof StepLimitSignal) {
      frame.stderr.write(C.red + 'bash: limite de execução atingido (possível laço infinito). Interrompido.' + C.reset + '\n');
      return 1;
    }
    if (e instanceof BreakSignal || e instanceof ContinueSignal) return 0;
    if (e instanceof ParseError) { frame.stderr.write('bash: ' + e.message + '\n'); return 2; }
    frame.stderr.write('bash: erro interno: ' + (e && e.message ? e.message : e) + '\n');
    return 1;
  }

  async execSource(src, frame) {
    const ast = parse(src);
    return this.execList(ast, frame);
  }

  // ---------- execução ----------
  async execList(list, frame) {
    let status = 0;
    for (const item of list.items) status = await this.execAndOr(item, frame);
    return status;
  }

  async execAndOr(node, frame) {
    let status = await this.execPipeline(node.first, frame);
    for (const { op, pipeline } of node.rest) {
      if ((op === '&&' && status === 0) || (op === '||' && status !== 0)) {
        status = await this.execPipeline(pipeline, frame);
      }
    }
    return status;
  }

  async execPipeline(node, frame) {
    let status;
    if (node.commands.length === 1) {
      status = await this.execCommand(node.commands[0], frame);
    } else {
      let input = frame.stdin;
      for (let i = 0; i < node.commands.length; i++) {
        const last = i === node.commands.length - 1;
        const sink = last ? frame.stdout : new StringSink();
        const sub = Object.assign({}, frame, { stdin: input, stdout: sink });
        status = await this.execCommand(node.commands[i], sub);
        if (!last) input = { data: sink.buf };
      }
    }
    if (node.negate) status = status === 0 ? 1 : 0;
    this.lastStatus = status;
    return status;
  }

  async setupRedirs(redirs, frame) {
    const io = { stdin: frame.stdin, stdout: frame.stdout, stderr: frame.stderr };
    for (const r of redirs) {
      if (r.op === '2>&1') { io.stderr = io.stdout; continue; }
      const fields = await this.expandWord(r.target, frame);
      if (fields.length !== 1) throw new RedirError(this.wordText(r.target) + ': redirecionamento ambíguo');
      const abs = this.resolve(fields[0]);
      if (r.op === '<') {
        try { io.stdin = { data: this.vfs.readFile(abs) }; }
        catch (e) { throw new RedirError(fields[0] + ': ' + mensagemErro(e)); }
        continue;
      }
      let sink;
      const node = this.vfs.tryLookup(abs);
      if (node && node.device === 'null') sink = new NullSink();
      else {
        try {
          const append = r.op === '>>' || r.op === '2>>';
          if (node && node.type === 'dir') throw new FsError('EISDIR', abs);
          this.vfs.writeFile(abs, '', { append });
        } catch (e) { throw new RedirError(fields[0] + ': ' + mensagemErro(e)); }
        sink = new FileSink(this.vfs, abs);
      }
      if (r.op === '>' || r.op === '>>') io.stdout = sink;
      else if (r.op === '2>' || r.op === '2>>') io.stderr = sink;
      else if (r.op === '&>') { io.stdout = sink; io.stderr = sink; }
    }
    return io;
  }

  async execCommand(node, frame) {
    let io;
    try {
      io = await this.setupRedirs(node.redirs || [], frame);
    } catch (e) {
      if (e instanceof RedirError) { frame.stderr.write('bash: ' + e.message + '\n'); return 1; }
      throw e;
    }
    const f = Object.assign({}, frame, io);
    switch (node.type) {
      case 'simple': return this.execSimple(node, f);
      case 'if': return this.execIf(node, f);
      case 'for': return this.execFor(node, f);
      case 'while': return this.execWhile(node, f);
      default: throw new Error('nó desconhecido: ' + node.type);
    }
  }

  async tick() {
    this.steps++;
    if (this.interrupted) { this.interrupted = false; throw new InterruptSignal(); }
    if (this.steps > this.maxSteps) throw new StepLimitSignal();
    if (this.steps % YIELD_EVERY === 0) {
      await new Promise((r) => setTimeout(r, 0));
      if (this.interrupted) { this.interrupted = false; throw new InterruptSignal(); }
    }
  }

  async execIf(node, frame) {
    for (const clause of node.clauses) {
      if ((await this.execList(clause.cond, frame)) === 0) return this.execList(clause.body, frame);
    }
    if (node.elseBody) return this.execList(node.elseBody, frame);
    return 0;
  }

  async execFor(node, frame) {
    let items;
    if (node.words === null) items = frame.positional.slice();
    else {
      items = [];
      for (const w of node.words) items.push(...(await this.expandWord(w, frame)));
    }
    let status = 0;
    for (const item of items) {
      await this.tick();
      frame.vars.set(node.name, item);
      try {
        status = await this.execList(node.body, frame);
      } catch (e) {
        if (e instanceof BreakSignal) { if (e.levels > 1) { e.levels--; throw e; } break; }
        if (e instanceof ContinueSignal) { if (e.levels > 1) { e.levels--; throw e; } continue; }
        throw e;
      }
    }
    return status;
  }

  async execWhile(node, frame) {
    let status = 0;
    while (true) {
      await this.tick();
      const c = await this.execList(node.cond, frame);
      if (node.until ? c === 0 : c !== 0) break;
      try {
        status = await this.execList(node.body, frame);
      } catch (e) {
        if (e instanceof BreakSignal) { if (e.levels > 1) { e.levels--; throw e; } break; }
        if (e instanceof ContinueSignal) { if (e.levels > 1) { e.levels--; throw e; } continue; }
        throw e;
      }
    }
    return status;
  }

  async execSimple(node, frame) {
    await this.tick();
    this.substStatus = null;
    const argv = [];
    for (const w of node.words) argv.push(...(await this.expandWord(w, frame)));

    for (const a of node.assigns) {
      const value = (await this.expandWord(a.value, frame, { split: false, glob: false })).join('');
      if (a.name === 'PWD' || a.name === 'HOME') {
        if (a.name === 'HOME') this.home = value;
      }
      frame.vars.set(a.name, value);
    }
    if (!argv.length) return this.substStatus !== null ? this.substStatus : 0;
    return this.invoke(argv, frame);
  }

  // Executa argv (já expandido).
  async invoke(argv, frame) {
    const name = argv[0];
    const args = argv.slice(1);

    if (name.includes('/')) return this.execPath(name, args, frame);

    const cmd = this.commands[name];
    if (cmd) {
      const ctx = this.makeCtx(name, args, frame);
      if (args[0] === '--help' && cmd.help && name !== 'echo') {
        ctx.out(cmd.help.trim() + '\n');
        return 0;
      }
      try {
        const st = await cmd(ctx);
        return typeof st === 'number' ? st : 0;
      } catch (e) {
        if (e instanceof FsError) { ctx.err(name + ': ' + mensagemErro(e) + '\n'); return 1; }
        throw e;
      }
    }

    let msg = name + ': comando não encontrado\n';
    if (INDISPONIVEIS.has(name)) {
      msg = name + ': este comando existe no Linux real, mas não está disponível neste simulador.\n';
    } else {
      const local = this.vfs.tryLookup(this.resolve(name));
      if (local && local.type === 'file') {
        msg += C.gray + 'Dica: para executar um arquivo do diretório atual, use ./' + name + C.reset + '\n';
      }
    }
    frame.stderr.write(msg);
    return 127;
  }

  async execPath(path, args, frame) {
    const abs = this.resolve(path);
    let node;
    try { node = this.vfs.lookup(abs); } catch (e) {
      frame.stderr.write('bash: ' + path + ': ' + mensagemErro(e) + '\n');
      return e.code === 'EACCES' ? 126 : 127;
    }
    if (node.type === 'dir') { frame.stderr.write('bash: ' + path + ': É um diretório\n'); return 126; }
    if (!this.vfs.canExec(node)) {
      let msg = 'bash: ' + path + ': Permissão negada\n';
      msg += C.gray + 'Dica: o arquivo não tem permissão de execução. Use: chmod +x ' + path + C.reset + '\n';
      frame.stderr.write(msg);
      return 126;
    }
    if (node.exec) {
      const bin = this.binaries[node.exec] || this.commands[node.exec];
      if (!bin) { frame.stderr.write('bash: ' + path + ': não é possível executar o arquivo binário\n'); return 126; }
      const ctx = this.makeCtx(path, args, frame);
      return (await bin(ctx)) || 0;
    }
    return this.runScript(abs, path, args, frame);
  }

  // Executa um arquivo como script. source=true roda no mesmo contexto (comando "source").
  async runScript(abs, displayName, args, frame, { source = false } = {}) {
    let content;
    try { content = this.vfs.readFile(abs); } catch (e) {
      frame.stderr.write('bash: ' + displayName + ': ' + mensagemErro(e) + '\n');
      return 126;
    }
    const node = this.vfs.tryLookup(abs);
    if (node && node.exec) {
      const bin = this.binaries[node.exec] || this.commands[node.exec];
      if (bin) return (await bin(this.makeCtx(displayName, args, frame))) || 0;
    }
    if (frame.depth >= MAX_DEPTH) {
      frame.stderr.write('bash: ' + displayName + ': profundidade máxima de chamadas excedida\n');
      return 1;
    }
    let ast;
    try { ast = parse(content); } catch (e) {
      if (e instanceof ParseError) {
        frame.stderr.write(displayName + ': ' + (e instanceof IncompleteError ? 'fim de arquivo inesperado: ' : '') + e.message + '\n');
        return 2;
      }
      throw e;
    }
    let vars = frame.vars;
    if (!source) {
      vars = new Map();
      for (const [k, v] of this.vars) if (this.exported.has(k)) vars.set(k, v);
      for (const [k, v] of frame.vars) if (this.exported.has(k)) vars.set(k, v);
      vars.set('IFS', ' \t\n');
    }
    const sub = Object.assign({}, frame, {
      vars,
      positional: source && !args.length ? frame.positional : args,
      name: source ? frame.name : displayName,
      depth: frame.depth + 1,
    });
    const savedCwd = this.cwd;
    const savedOld = this.oldpwd;
    try {
      return await this.execList(ast, sub);
    } catch (e) {
      if (e instanceof ExitSignal) return e.code;
      if (e instanceof BreakSignal || e instanceof ContinueSignal) return 0;
      throw e;
    } finally {
      if (!source) {
        this.cwd = savedCwd;
        this.oldpwd = savedOld;
        this.vars.set('PWD', savedCwd);
      }
    }
  }

  makeCtx(name, args, frame) {
    const shell = this;
    let warned = false;
    return {
      shell,
      vfs: this.vfs,
      frame,
      name,
      args,
      stdin: frame.stdin,
      stdout: frame.stdout,
      stderr: frame.stderr,
      get isTTY() { return frame.stdout.isTTY; },
      get cwd() { return shell.cwd; },
      get home() { return shell.home; },
      out(s) { frame.stdout.write(s); },
      err(s) { frame.stderr.write(s); },
      resolve(p) { return shell.resolve(p); },
      hasStdin() { return frame.stdin && frame.stdin.data !== null; },
      // Lê toda a entrada padrão (pipe/arquivo). No terminal interativo, não há entrada.
      readStdin() {
        if (frame.stdin && frame.stdin.data !== null) {
          const d = frame.stdin.data;
          frame.stdin.data = '';
          return d;
        }
        if (!warned) {
          warned = true;
          frame.stderr.write(C.gray + name + ': nenhum arquivo informado. Exemplo: ' + name + ' arquivo.txt (ou use um pipe: cmd | ' + name + ')' + C.reset + '\n');
        }
        return '';
      },
    };
  }

  // ---------- expansões ----------
  wordText(word) {
    return word.segs.map((s) => (s.type === 'lit' ? s.text : s.type === 'var' ? '$' + s.name : '$(' + (s.src || s.expr) + ')')).join('');
  }

  getVar(name, frame) {
    switch (name) {
      case '?': return String(this.lastStatus);
      case '#': return String(frame.positional.length);
      case '@': case '*': return frame.positional.join(' ');
      case '$': return '4242';
      case '0': return frame.name;
      case 'RANDOM': return String(Math.floor(Math.random() * 32768));
      case 'PWD': return this.cwd;
      default:
        if (/^[0-9]+$/.test(name)) { const v = frame.positional[Number(name) - 1]; return v === undefined ? '' : v; }
        if (frame.vars.has(name)) return frame.vars.get(name);
        return '';
    }
  }

  async commandSubst(src, frame) {
    const sink = new StringSink();
    const sub = Object.assign({}, frame, { stdout: sink, vars: new Map(frame.vars) });
    const savedCwd = this.cwd;
    let status;
    try {
      status = await this.execSource(src, sub);
    } catch (e) {
      if (e instanceof ExitSignal) status = e.code;
      else if (e instanceof ParseError) { frame.stderr.write('bash: ' + e.message + '\n'); status = 2; }
      else throw e;
    } finally {
      if (this.cwd !== savedCwd) { this.cwd = savedCwd; this.vars.set('PWD', savedCwd); }
    }
    this.lastStatus = status;
    this.substStatus = status;
    return stripAnsi(sink.buf).replace(/\n+$/, '');
  }

  async segValue(seg, frame) {
    if (seg.type === 'var') {
      const v = this.getVar(seg.name, frame);
      return seg.length ? String(v.length) : v;
    }
    if (seg.type === 'cmd') return this.commandSubst(seg.src, frame);
    if (seg.type === 'arith') return String(this.evalArith(await this.expandArithText(seg.expr, frame), frame));
    return seg.text;
  }

  async expandArithText(expr, frame) {
    // expande $var, ${var} e $(cmd) dentro de $(( ))
    const word = tokenize('"' + expr.replace(/"/g, '\\"') + '"')[0];
    const parts = [];
    for (const s of word.segs) parts.push(s.type === 'lit' ? s.text : await this.segValue(s, frame));
    return parts.join('');
  }

  evalArith(expr, frame) {
    return evalArithmetic(expr, (name) => {
      const v = this.getVar(name, frame);
      const n = parseInt(v, 10);
      return isNaN(n) ? 0 : n;
    });
  }

  // Expande uma palavra em zero ou mais campos.
  async expandWord(word, frame, { split = true, glob = true } = {}) {
    const variants = split ? braceExpand(word.segs) : [word.segs];
    const out = [];
    for (const segs of variants) {
      const fields = [];
      let cur = null;
      const newField = () => { cur = { text: '', pat: '', glob: false, keep: false }; fields.push(cur); };
      newField();
      for (let idx = 0; idx < segs.length; idx++) {
        let seg = segs[idx];
        if (idx === 0 && seg.type === 'lit' && !seg.quoted && /^~(\/|$)/.test(seg.text)) {
          seg = { type: 'lit', text: this.home + seg.text.slice(1), quoted: false, tilde: true };
        }
        if (seg.type === 'lit') {
          cur.text += seg.text;
          cur.keep = true;
          if (seg.quoted || seg.tilde) cur.pat += escapeGlob(seg.text);
          else { cur.pat += seg.text; if (hasGlobChars(seg.text)) cur.glob = true; }
          continue;
        }
        if (seg.type === 'var' && seg.quoted && seg.name === '@') {
          const vals = frame.positional;
          cur.keep = true;
          vals.forEach((v, k) => {
            if (k > 0) { newField(); cur.keep = true; }
            cur.text += v; cur.pat += escapeGlob(v);
          });
          if (!vals.length && cur.text === '' && fields.length === 1 && segs.length === 1) fields.length = 0;
          continue;
        }
        const value = await this.segValue(seg, frame);
        if (seg.quoted || !split) {
          cur.text += value; cur.pat += escapeGlob(value); cur.keep = true;
          continue;
        }
        const parts = value.split(/[ \t\n]+/);
        parts.forEach((p, k) => {
          if (k > 0) { if (cur.text !== '' || cur.keep) newField(); }
          cur.text += p; cur.pat += p;
          if (p && hasGlobChars(p)) cur.glob = true;
        });
      }
      for (const f of fields) {
        if (!f.keep && f.text === '') continue;
        if (glob && f.glob) {
          const matches = this.globMatch(f.pat);
          if (matches.length) { out.push(...matches); continue; }
        }
        out.push(f.text);
      }
    }
    return out;
  }

  globMatch(pattern) {
    const absolute = pattern.startsWith('/');
    const trailingSlash = pattern.endsWith('/');
    const comps = pattern.split('/').filter((c) => c !== '');
    let cur = [{ disp: absolute ? '' : null, abs: absolute ? '/' : this.cwd }];
    const join = (disp, name) => (disp === null ? name : disp === '' ? '/' + name : disp + '/' + name);
    comps.forEach((comp, idx) => {
      const last = idx === comps.length - 1;
      const next = [];
      for (const c of cur) {
        if (hasGlobChars(comp)) {
          let kids;
          try { kids = this.vfs.readDir(c.abs); } catch (e) { continue; }
          const re = globToRegex(comp);
          const showHidden = comp.startsWith('.');
          for (const k of kids) {
            if (!showHidden && k.name.startsWith('.')) continue;
            if (!re.test(k.name)) continue;
            if ((!last || trailingSlash) && k.type !== 'dir') continue;
            next.push({ disp: join(c.disp, k.name), abs: normalizePath(k.name, c.abs) });
          }
        } else {
          const name = unescapeGlob(comp);
          const abs = normalizePath(name, c.abs);
          const node = this.vfs.tryLookup(abs);
          if (!node) continue;
          if ((!last || trailingSlash) && node.type !== 'dir') continue;
          next.push({ disp: join(c.disp, name), abs });
        }
      }
      cur = next;
    });
    return cur.map((c) => c.disp + (trailingSlash ? '/' : '')).sort();
  }

  // ---------- autocompletar (Tab) ----------
  complete(line) {
    const m = /(?:^|[\s|;&])((?:\\ |[^\s|;&])*)$/.exec(line);
    const word = m ? m[1] : '';
    const before = line.slice(0, line.length - word.length);
    const isCommand = /^\s*$|[|;&]\s*$/.test(before);
    const raw = word.replace(/\\ /g, ' ');
    let candidates = [];

    if (isCommand && !raw.includes('/')) {
      candidates = Object.keys(this.commands).filter((c) => c.startsWith(raw)).sort().map((c) => ({ name: c, suffix: ' ' }));
    } else {
      const slash = raw.lastIndexOf('/');
      const dirPart = slash >= 0 ? raw.slice(0, slash + 1) : '';
      const prefix = slash >= 0 ? raw.slice(slash + 1) : raw;
      let dirAbs;
      try { dirAbs = this.resolve(dirPart || '.'); } catch (e) { return { line, options: [] }; }
      let kids = [];
      try { kids = this.vfs.readDir(dirAbs); } catch (e) { kids = []; }
      candidates = kids
        .filter((k) => k.name.startsWith(prefix) && (prefix.startsWith('.') || !k.name.startsWith('.')))
        .filter((k) => !isCommand || k.type === 'dir' || this.vfs.canExec(k))
        .map((k) => ({ name: dirPart + k.name, suffix: k.type === 'dir' ? '/' : ' ', display: k.name + (k.type === 'dir' ? '/' : '') }))
        .sort((a, b) => (a.name < b.name ? -1 : 1));
    }
    const esc = (s) => s.replace(/([ '"()&;|<>$`\\])/g, '\\$1');
    if (candidates.length === 0) return { line, options: [] };
    if (candidates.length === 1) {
      return { line: before + esc(candidates[0].name) + candidates[0].suffix, options: [] };
    }
    let common = candidates[0].name;
    for (const c of candidates) { while (!c.name.startsWith(common)) common = common.slice(0, -1); }
    return {
      line: before + esc(common.length > raw.length ? common : raw),
      options: candidates.map((c) => c.display || c.name),
    };
  }
}

class RedirError extends Error {}

// ---------- expansão de chaves {a,b} e {1..5} ----------
function findBrace(text) {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    let depth = 0;
    for (let j = i; j < text.length; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') {
        depth--;
        if (depth === 0) {
          const body = text.slice(i + 1, j);
          const alts = splitTopLevel(body);
          if (alts.length > 1) return { start: i, end: j, alts };
          const range = /^(-?\d+)\.\.(-?\d+)$/.exec(body) || /^([a-zA-Z])\.\.([a-zA-Z])$/.exec(body);
          if (range) return { start: i, end: j, alts: expandRange(range[1], range[2]) };
          break;
        }
      }
    }
  }
  return null;
}

function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  return parts;
}

function expandRange(a, b) {
  const out = [];
  if (/^-?\d+$/.test(a)) {
    const x = parseInt(a, 10);
    const y = parseInt(b, 10);
    const width = (a.length > 1 && a.startsWith('0')) || (b.length > 1 && b.startsWith('0')) ? Math.max(a.length, b.length) : 0;
    const step = x <= y ? 1 : -1;
    for (let i = x; step > 0 ? i <= y : i >= y; i += step) out.push(width ? String(i).padStart(width, '0') : String(i));
  } else {
    const x = a.charCodeAt(0);
    const y = b.charCodeAt(0);
    const step = x <= y ? 1 : -1;
    for (let i = x; step > 0 ? i <= y : i >= y; i += step) out.push(String.fromCharCode(i));
  }
  return out;
}

function braceExpand(segs) {
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.type !== 'lit' || s.quoted) continue;
    const b = findBrace(s.text);
    if (!b) continue;
    const pre = s.text.slice(0, b.start);
    const post = s.text.slice(b.end + 1);
    const results = [];
    for (const alt of b.alts) {
      const nseg = segs.slice(0, i).concat([{ type: 'lit', text: pre + alt + post, quoted: false }], segs.slice(i + 1));
      results.push(...braceExpand(nseg));
    }
    return results;
  }
  return [segs];
}

// ---------- aritmética $(( )) ----------
function evalArithmetic(expr, lookup) {
  const toks = [];
  const re = /\s*(\d+|[A-Za-z_][A-Za-z0-9_]*|\*\*|<=|>=|==|!=|&&|\|\||[-+*/%()<>!])/y;
  let m;
  let pos = 0;
  const src = expr.trim();
  while (pos < src.length) {
    re.lastIndex = pos;
    m = re.exec(src);
    if (!m) throw new ArithError('erro de sintaxe na expressão aritmética: "' + src.slice(pos).trim() + '"');
    toks.push(m[1]);
    pos = re.lastIndex;
    while (pos < src.length && /\s/.test(src[pos])) pos++;
  }
  let i = 0;
  const peek = () => toks[i];
  const take = () => toks[i++];
  const prec = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, '**': 7 };
  const primary = () => {
    const t = take();
    if (t === undefined) throw new ArithError('expressão aritmética incompleta');
    if (t === '(') { const v = expr_(1); if (take() !== ')') throw new ArithError('esperado ")"'); return v; }
    if (t === '-') return -primary();
    if (t === '+') return primary();
    if (t === '!') return primary() ? 0 : 1;
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    if (/^[A-Za-z_]/.test(t)) return lookup(t);
    throw new ArithError('erro de sintaxe na expressão aritmética: "' + t + '"');
  };
  const expr_ = (minPrec) => {
    let left = primary();
    while (peek() !== undefined && prec[peek()] !== undefined && prec[peek()] >= minPrec) {
      const op = take();
      const right = expr_(op === '**' ? prec[op] : prec[op] + 1);
      switch (op) {
        case '+': left = left + right; break;
        case '-': left = left - right; break;
        case '*': left = left * right; break;
        case '/': if (right === 0) throw new ArithError('divisão por 0'); left = Math.trunc(left / right); break;
        case '%': if (right === 0) throw new ArithError('divisão por 0'); left = left % right; break;
        case '**': left = Math.pow(left, right); break;
        case '<': left = left < right ? 1 : 0; break;
        case '>': left = left > right ? 1 : 0; break;
        case '<=': left = left <= right ? 1 : 0; break;
        case '>=': left = left >= right ? 1 : 0; break;
        case '==': left = left === right ? 1 : 0; break;
        case '!=': left = left !== right ? 1 : 0; break;
        case '&&': left = left && right ? 1 : 0; break;
        case '||': left = left || right ? 1 : 0; break;
      }
    }
    return left;
  };
  if (!toks.length) return 0;
  const v = expr_(1);
  if (i < toks.length) throw new ArithError('erro de sintaxe na expressão aritmética: "' + toks[i] + '"');
  return v;
}

class ArithError extends ParseError {}

return { ExitSignal, BreakSignal, ContinueSignal, InterruptSignal, StepLimitSignal, StringSink, FnSink, NullSink, Shell, braceExpand, evalArithmetic, ArithError };
})();

__m["m7"] = (function () {
// Páginas de manual resumidas (pt-BR). Usadas por "man <cmd>" e "<cmd> --help".

const MAN = {
  pwd: `pwd - mostra o diretório atual (print working directory)
USO: pwd
EXEMPLO: pwd   →   /home/aluno`,

  cd: `cd - muda de diretório (change directory)
USO: cd [DIRETÓRIO]
  cd          vai para a sua home (~)
  cd ..       sobe um nível
  cd -        volta ao diretório anterior
  cd /etc     caminho absoluto     cd docs   caminho relativo`,

  ls: `ls - lista o conteúdo de diretórios
USO: ls [OPÇÕES] [ARQUIVO...]
  -a   mostra também os arquivos ocultos (que começam com .)
  -A   como -a, mas sem . e ..
  -l   formato longo (permissões, dono, tamanho, data)
  -h   tamanhos legíveis (1,5K, 2M) — use com -l
  -R   lista subdiretórios recursivamente
  -S   ordena por tamanho      -t  ordena por data      -r  inverte a ordem
  -d   lista o diretório em si, não o conteúdo
  -1   um item por linha       -F  indica tipo (/ diretório, * executável)
EXEMPLOS: ls -la      ls -lh /etc      ls *.txt`,

  cat: `cat - concatena e mostra o conteúdo de arquivos
USO: cat [OPÇÕES] [ARQUIVO...]
  -n   numera as linhas
EXEMPLOS: cat notas.txt      cat a.txt b.txt > juntos.txt
DICA: nome com espaço → cat "meu arquivo.txt"   nome começando com - → cat ./-arquivo`,

  less: `less - mostra o conteúdo de um arquivo (no Linux real, permite rolar; aqui funciona como o cat)
USO: less ARQUIVO`,

  more: `more - mostra o conteúdo de um arquivo (aqui funciona como o cat)
USO: more ARQUIVO`,

  head: `head - mostra o início de um arquivo
USO: head [-n N] [ARQUIVO...]
  -n N   mostra as N primeiras linhas (padrão: 10). Também aceita: head -5
EXEMPLO: head -n 3 /etc/passwd`,

  tail: `tail - mostra o final de um arquivo
USO: tail [-n N] [ARQUIVO...]
  -n N    mostra as N últimas linhas (padrão: 10)
  -n +N   mostra a partir da linha N
EXEMPLO: tail -n 5 /var/log/syslog`,

  wc: `wc - conta linhas, palavras e bytes
USO: wc [-l] [-w] [-c] [ARQUIVO...]
  -l  linhas     -w  palavras     -c  bytes
EXEMPLOS: wc -l /etc/passwd      ls | wc -l`,

  echo: `echo - imprime um texto
USO: echo [-n] [-e] [TEXTO...]
  -n   não pula linha no final
  -e   interpreta \\n (nova linha), \\t (tab), \\e (cores)
EXEMPLOS: echo "Olá, $USER"      echo "linha" >> arquivo.txt`,

  printf: `printf - imprime texto formatado
USO: printf FORMATO [ARGUMENTOS...]
  %s texto   %d número inteiro   %.2f decimal   \\n nova linha
EXEMPLO: printf "%s tem %d anos\\n" Ana 20`,

  touch: `touch - cria um arquivo vazio (ou atualiza a data de um existente)
USO: touch ARQUIVO...
EXEMPLO: touch notas.txt foto{1..3}.jpg`,

  mkdir: `mkdir - cria diretórios
USO: mkdir [-p] DIRETÓRIO...
  -p   cria os diretórios intermediários, sem erro se já existir
EXEMPLOS: mkdir projeto      mkdir -p projeto/{src,docs,testes}`,

  rmdir: `rmdir - remove diretórios VAZIOS
USO: rmdir DIRETÓRIO...`,

  rm: `rm - remove arquivos e diretórios (NÃO existe lixeira!)
USO: rm [OPÇÕES] ARQUIVO...
  -r   remove diretórios e todo o conteúdo (recursivo)
  -f   força, sem avisar se não existir
  -i   pergunta antes de remover
  -v   mostra o que está sendo removido
CUIDADO: rm -rf apaga tudo sem perguntar.`,

  cp: `cp - copia arquivos e diretórios
USO: cp [-r] ORIGEM... DESTINO
  -r   copia diretórios recursivamente
  -v   mostra o que está sendo copiado
EXEMPLOS: cp a.txt b.txt      cp -r projeto projeto_backup      cp *.txt docs/`,

  mv: `mv - move ou renomeia arquivos e diretórios
USO: mv ORIGEM... DESTINO
EXEMPLOS: mv velho.txt novo.txt (renomeia)      mv foto.jpg imagens/ (move)`,

  grep: `grep - procura linhas que contêm um padrão
USO: grep [OPÇÕES] PADRÃO [ARQUIVO...]
  -i   ignora maiúsculas/minúsculas      -v   mostra as linhas que NÃO combinam
  -n   mostra o número da linha          -c   conta as linhas que combinam
  -r   procura recursivamente em diretórios
  -l   mostra só o nome dos arquivos     -o   mostra só o trecho que combinou
  -w   palavra inteira                   -E   expressão regular estendida
  -q   silencioso (só o código de saída)
EXEMPLOS: grep root /etc/passwd      grep -ri "erro" /var/log      ls | grep txt`,

  find: `find - procura arquivos e diretórios
USO: find [CAMINHO...] [EXPRESSÃO]
  -name PADRÃO    pelo nome (use aspas: -name "*.txt")
  -iname PADRÃO   pelo nome, ignorando maiúsculas/minúsculas
  -type f|d       f = arquivo, d = diretório
  -size [+-]N[c|k|M]   pelo tamanho (+1M = maior que 1 MB)
  -maxdepth N     limita a profundidade      -empty   vazios
  ! / -not        nega o teste seguinte
EXEMPLOS: find ~ -name "*.txt"      find . -type d      find /etc -name "*.conf"`,

  chmod: `chmod - altera permissões
USO: chmod [-R] MODO ARQUIVO...
  Numérico: r=4 w=2 x=1, somados para dono/grupo/outros
    chmod 755 script.sh   → rwxr-xr-x       chmod 644 notas.txt → rw-r--r--
  Simbólico: [u g o a][+ - =][r w x]
    chmod +x script.sh     chmod u+r arquivo     chmod go-w arquivo
  -R   aplica recursivamente`,

  sort: `sort - ordena linhas
USO: sort [OPÇÕES] [ARQUIVO...]
  -r  ordem reversa     -n  numérica     -u  remove repetidas     -f  ignora maiúsculas
  -t SEP -k N   ordena pelo campo N, separado por SEP
EXEMPLOS: sort nomes.txt      sort -n numeros.txt      cut -d: -f1 /etc/passwd | sort`,

  uniq: `uniq - remove/conta linhas repetidas VIZINHAS (use sort antes!)
USO: uniq [OPÇÕES] [ARQUIVO]
  -c  conta as repetições     -u  só as linhas que aparecem uma vez     -d  só as repetidas
EXEMPLOS: sort nomes.txt | uniq      sort nomes.txt | uniq -c      sort x | uniq -u`,

  cut: `cut - extrai colunas de cada linha
USO: cut -d SEPARADOR -f CAMPOS [ARQUIVO...]   ou   cut -c CARACTERES
  -d  separador (padrão: tab)     -f  campos (ex.: 1   1,3   2-4)     -c  caracteres
EXEMPLO: cut -d: -f1 /etc/passwd   (lista os usuários)`,

  tr: `tr - troca ou apaga caracteres
USO: tr CONJUNTO1 CONJUNTO2     tr -d CONJUNTO
EXEMPLOS: echo "oi" | tr a-z A-Z      echo "a-b-c" | tr -d "-"`,

  seq: `seq - gera uma sequência de números
USO: seq [-w] [-s SEP] [INÍCIO [PASSO]] FIM
  -w   iguala a largura com zeros à esquerda (001, 002, ...)
EXEMPLOS: seq 5      seq 2 2 10      seq -w 0 999`,

  date: `date - mostra a data e hora
USO: date [+FORMATO]
  %d dia  %m mês  %Y ano  %H hora  %M minuto  %S segundo  %A dia da semana
EXEMPLOS: date      date +%d/%m/%Y      date +%H:%M`,

  whoami: `whoami - mostra o nome do usuário atual`,
  id: `id - mostra o usuário e os grupos (uid/gid)`,
  hostname: `hostname - mostra o nome da máquina`,
  uname: `uname - informações do sistema
USO: uname [-a]
  -a   todas as informações (kernel, máquina, arquitetura)`,
  clear: `clear - limpa a tela (atalho: Ctrl+L)`,
  history: `history - mostra os comandos já digitados
USO: history      history | grep cd      history -c (limpa)
DICA: use as setas ↑ ↓ para navegar no histórico`,
  man: `man - mostra o manual de um comando
USO: man COMANDO
EXEMPLO: man ls`,
  which: `which - mostra onde está o programa de um comando
USO: which COMANDO
EXEMPLO: which ls   →   /usr/bin/ls`,
  type: `type - diz se um comando é interno do shell ou um programa
USO: type COMANDO`,
  tree: `tree - mostra a árvore de diretórios
USO: tree [-a] [-d] [-L NÍVEL] [DIRETÓRIO]
  -a  inclui ocultos     -d  só diretórios     -L N  limita a profundidade`,
  file: `file - descobre o tipo de um arquivo
USO: file ARQUIVO...`,
  base64: `base64 - codifica/decodifica em Base64
USO: base64 [-d] [ARQUIVO]
  -d   decodifica
EXEMPLO: echo "oi" | base64      echo "b2kK" | base64 -d`,
  rev: `rev - inverte os caracteres de cada linha
EXEMPLO: echo "abc" | rev   →   cba`,
  sha256sum: `sha256sum - calcula o hash SHA-256
USO: sha256sum [ARQUIVO...]`,
  nano: `nano - editor de texto simples
USO: nano ARQUIVO
ATALHOS: Ctrl+O salva     Ctrl+X sai`,
  vi: `vi / vim - editor de texto com modos (o clássico dos servidores Linux)
USO: vi ARQUIVO
MODOS:
  normal    (ao abrir) as teclas são comandos      Esc volta para ele
  inserção  i (antes do cursor) · a (depois) · o (nova linha abaixo) · A (fim da linha)
  comando   : seguido de um comando e Enter
COMANDOS:
  :w  salva     :q  sai     :wq ou :x ou ZZ  salva e sai     :q!  sai SEM salvar
  h j k l ou setas  movem o cursor     0 / $  início / fim da linha     gg / G  início / fim do arquivo
  x apaga caractere   dd apaga linha   yy copia linha   p cola   u desfaz
DICA: travou? Aperte Esc e digite :q!`,

  test: `test / [ ] - avalia condições (usado com if e while)
USO: [ EXPRESSÃO ]   (os espaços dentro dos colchetes são obrigatórios!)
  Números:  -eq igual  -ne diferente  -lt menor  -le menor/igual  -gt maior  -ge maior/igual
  Textos:   =  igual    != diferente   -z vazio   -n não vazio
  Arquivos: -e existe   -f é arquivo   -d é diretório   -r legível   -w gravável   -x executável
  !  nega
EXEMPLOS: [ "$idade" -ge 18 ]     [ -f notas.txt ]     [ -z "$nome" ]`,
  read: `read - lê uma linha digitada pelo usuário e guarda em variáveis
USO: read [-p "PERGUNTA"] VARIÁVEL...
EXEMPLO: read -p "Seu nome: " nome; echo "Olá, $nome"`,
  export: `export - torna uma variável visível para os scripts executados
USO: export NOME=valor`,
  unset: `unset - remove uma variável
USO: unset NOME`,
  exit: `exit - encerra o script (ou o shell) com um código de saída
USO: exit [CÓDIGO]    (0 = sucesso, outro valor = erro)`,
  source: `source - executa um script no shell atual (as variáveis permanecem)
USO: source ARQUIVO   ou   . ARQUIVO`,
  bash: `bash - executa um script com o interpretador bash
USO: bash SCRIPT [ARGUMENTOS...]     bash -c "COMANDOS"`,
  sleep: `sleep - espera N segundos
USO: sleep N`,
  env: `env - mostra as variáveis de ambiente`,
  printenv: `printenv - mostra variáveis de ambiente
USO: printenv [NOME]`,
  sudo: `sudo - executa um comando como administrador (root)
Neste simulador você é um usuário comum, sem sudo.`,
};

MAN['['] = MAN.test;
MAN.vim = MAN.vi;
MAN.sh = MAN.bash;
MAN['.'] = MAN.source;

return { MAN };
})();

__m["m8"] = (function () {
// Implementação dos comandos do terminal simulado.
// Cada comando recebe um ctx (ver Shell.makeCtx) e retorna o código de saída.

const { FsError, mensagemErro, modeString, normalizePath, basename } = __m["m4"];
const { C, stripAnsi, byteLength, base64Encode, base64Decode, sha256, globToRegex, MESES, MESES_LONGOS, DIAS, DIAS_LONGOS, pad2 } = __m["m5"];
const { ExitSignal, BreakSignal, ContinueSignal, InterruptSignal } = __m["m6"];
const { MAN } = __m["m7"];
const { ParseError } = __m["m3"];

// ---------- auxiliares ----------

// Interpreta opções no estilo getopt. Retorna null (e imprime erro) se houver opção inválida.
function parseOpts(ctx, { flags = '', values = '', long = {}, numeric = false } = {}) {
  const opts = {};
  const operands = [];
  const args = ctx.args;
  const bad = (msg) => {
    ctx.err(ctx.name + ': ' + msg + "\nTente '" + ctx.name + " --help' para mais informações.\n");
    return null;
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { operands.push(...args.slice(i + 1)); break; }
    if (a.startsWith('--') && a.length > 2) {
      const eq = a.indexOf('=');
      const key = eq >= 0 ? a.slice(0, eq) : a;
      const mapped = long[key];
      if (!mapped) return bad("opção não reconhecida '" + a + "'");
      if (values.includes(mapped)) {
        const v = eq >= 0 ? a.slice(eq + 1) : args[++i];
        if (v === undefined) return bad("a opção '" + key + "' requer um argumento");
        opts[mapped] = v;
      } else opts[mapped] = true;
      continue;
    }
    if (numeric && /^-\d+$/.test(a)) { opts.num = a.slice(1); continue; }
    if (a.length > 1 && a[0] === '-') {
      for (let j = 1; j < a.length; j++) {
        const ch = a[j];
        if (values.includes(ch)) {
          const rest = a.slice(j + 1);
          const v = rest !== '' ? rest : args[++i];
          if (v === undefined) return bad("a opção requer um argumento -- '" + ch + "'");
          opts[ch] = v;
          break;
        }
        if (!flags.includes(ch)) return bad("opção inválida -- '" + ch + "'");
        opts[ch] = true;
      }
      continue;
    }
    operands.push(a);
  }
  return { opts, operands };
}

function splitLines(text) {
  if (text === '') return [];
  const lines = text.split('\n');
  if (text.endsWith('\n')) lines.pop();
  return lines;
}

function joinLines(lines) {
  return lines.length ? lines.join('\n') + '\n' : '';
}

// Lê o conteúdo das entradas (arquivos ou stdin). Retorna [{name, content}] e reporta erros.
function readInputs(ctx, operands, { label = true } = {}) {
  const inputs = [];
  let failed = false;
  if (!operands.length) {
    inputs.push({ name: '-', content: ctx.readStdin(), stdin: true });
    return { inputs, failed };
  }
  for (const op of operands) {
    if (op === '-') { inputs.push({ name: '-', content: ctx.readStdin(), stdin: true }); continue; }
    try {
      inputs.push({ name: op, content: ctx.vfs.readFile(ctx.resolve(op)) });
    } catch (e) {
      failed = true;
      if (label) ctx.err(ctx.name + ': ' + op + ': ' + mensagemErro(e) + '\n');
    }
  }
  return { inputs, failed };
}

function quoteName(name) {
  if (/[\s'"$`\\!*?;&|<>()]/.test(name)) return "'" + name.replace(/'/g, "'\\''") + "'";
  return name;
}

function colorName(ctx, node, name) {
  if (!ctx.isTTY) return name;
  if (node.type === 'dir') return C.bblue + name + C.reset;
  if (node.exec || (node.mode & 0o111)) return C.bgreen + name + C.reset;
  return name;
}

function nodeSize(node) {
  return node.type === 'dir' ? 4096 : byteLength(node.content);
}

function humanSize(n) {
  if (n < 1024) return String(n);
  const units = ['K', 'M', 'G', 'T'];
  let v = n;
  let u = -1;
  do { v /= 1024; u++; } while (v >= 1024 && u < units.length - 1);
  if (v < 10) return (Math.ceil(v * 10) / 10).toFixed(1).replace('.', ',') + units[u];
  return Math.ceil(v) + units[u];
}

function formatDate(ms) {
  const d = new Date(ms);
  const now = Date.now();
  const recent = Math.abs(now - ms) < 1000 * 60 * 60 * 24 * 182;
  const day = String(d.getDate()).padStart(2, ' ');
  const tail = recent ? pad2(d.getHours()) + ':' + pad2(d.getMinutes()) : ' ' + d.getFullYear();
  return MESES[d.getMonth()] + ' ' + day + ' ' + tail;
}

let collator = null;
function compareText(a, b) {
  if (!collator) {
    try { collator = new Intl.Collator('pt-BR'); } catch (e) { collator = { compare: (x, y) => (x < y ? -1 : x > y ? 1 : 0) }; }
  }
  return collator.compare(a, b);
}

function columnize(items, width) {
  // items: [{text, len}] — layout em colunas, preenchido coluna a coluna (como o ls)
  // Cada coluna tem a largura do seu maior item + 2 (igual ao GNU ls).
  if (!items.length) return '';
  const n = items.length;
  let rows = 1;
  let widths;
  for (; rows <= n; rows++) {
    const cols = Math.ceil(n / rows);
    widths = [];
    for (let c = 0; c < cols; c++) {
      const col = items.slice(c * rows, (c + 1) * rows);
      widths.push(Math.max(...col.map((i) => i.len)) + (c < cols - 1 ? 2 : 0));
    }
    if (widths.reduce((a, b) => a + b, 0) <= width) break;
  }
  let out = '';
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < widths.length; c++) {
      const idx = c * rows + r;
      if (idx >= n) break;
      const it = items[idx];
      const lastInRow = (c + 1) * rows + r >= n;
      line += it.text + (lastInRow ? '' : ' '.repeat(widths[c] - it.len));
    }
    out += line + '\n';
  }
  return out;
}

function interpretEscapes(s) {
  return s.replace(/\\(\\|n|t|e|a|r|0?33|x1b|c)/g, (m, g) => {
    switch (g) {
      case '\\': return '\\';
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '';
      case 'a': return '';
      case 'c': return '\u0000STOP';
      default: return '\x1b';
    }
  });
}

// ---------- comandos ----------
const commands = {};

commands.pwd = (ctx) => { ctx.out(ctx.cwd + '\n'); return 0; };

commands.cd = (ctx) => {
  const sh = ctx.shell;
  if (ctx.args.length > 1) { ctx.err('bash: cd: número excessivo de argumentos\n'); return 1; }
  let target = ctx.args[0];
  let print = false;
  if (target === undefined || target === '') target = sh.home;
  if (target === '-') { target = sh.oldpwd; print = true; }
  const abs = sh.resolve(target);
  let node;
  try { node = ctx.vfs.lookup(abs); } catch (e) {
    ctx.err('bash: cd: ' + target + ': ' + mensagemErro(e) + '\n');
    return 1;
  }
  if (node.type !== 'dir') { ctx.err('bash: cd: ' + target + ': Não é um diretório\n'); return 1; }
  if (!ctx.vfs.canExec(node)) { ctx.err('bash: cd: ' + target + ': Permissão negada\n'); return 1; }
  sh.setCwd(abs);
  if (print) ctx.out(abs + '\n');
  return 0;
};

commands.ls = (ctx) => {
  const p = parseOpts(ctx, { flags: 'aAlhR1StrdFG', long: { '--all': 'a', '--human-readable': 'h', '--recursive': 'R' } });
  if (!p) return 2;
  const o = p.opts;
  const vfs = ctx.vfs;
  let status = 0;
  const operands = p.operands.length ? p.operands : ['.'];
  const files = [];
  const dirs = [];
  for (const op of operands) {
    let node;
    try { node = vfs.lookup(ctx.resolve(op)); } catch (e) {
      ctx.err("ls: não foi possível acessar '" + op + "': " + mensagemErro(e) + '\n');
      status = 2;
      continue;
    }
    if (node.type === 'dir' && !o.d) dirs.push({ op, node });
    else files.push({ name: op, node });
  }

  const sortEntries = (entries) => {
    entries.sort((a, b) => compareText(a.name.replace(/^\.+/, ''), b.name.replace(/^\.+/, '')) || compareText(a.name, b.name));
    if (o.S) entries.sort((a, b) => nodeSize(b.node) - nodeSize(a.node));
    else if (o.t) entries.sort((a, b) => b.node.mtime - a.node.mtime);
    if (o.r) entries.reverse();
    return entries;
  };

  const render = (entries, showTotal) => {
    if (o.l) {
      const rows = entries.map((e) => {
        const n = e.node;
        const links = n.type === 'dir' ? 2 + Array.from(n.children.values()).filter((c) => c.type === 'dir').length : 1;
        const size = o.h ? humanSize(nodeSize(n)) : String(nodeSize(n));
        let name = ctx.isTTY ? quoteName(e.name) : e.name;
        name = colorName(ctx, n, name);
        if (o.F) name += n.type === 'dir' ? '/' : n.mode & 0o111 ? '*' : '';
        return [modeString(n), String(links), n.owner, n.group, size, formatDate(n.mtime), name];
      });
      const w = [1, 2, 3, 4].map((i) => Math.max(0, ...rows.map((r) => r[i].length)));
      let out = '';
      if (showTotal) {
        const blocks = entries.reduce((acc, e) => acc + (e.node.type === 'dir' ? 4 : Math.ceil(nodeSize(e.node) / 4096) * 4), 0);
        out += 'total ' + blocks + '\n';
      }
      for (const r of rows) {
        out += r[0] + ' ' + r[1].padStart(w[0]) + ' ' + r[2].padEnd(w[1]) + ' ' + r[3].padEnd(w[2]) + ' ' + r[4].padStart(w[3]) + ' ' + r[5] + ' ' + r[6] + '\n';
      }
      return out;
    }
    const items = entries.map((e) => {
      let text = ctx.isTTY ? quoteName(e.name) : e.name;
      if (o.F) text += e.node.type === 'dir' ? '/' : e.node.mode & 0o111 ? '*' : '';
      return { text: colorName(ctx, e.node, text), len: text.length };
    });
    if (!ctx.isTTY || o['1']) return items.map((i) => i.text).join('\n') + (items.length ? '\n' : '');
    return columnize(items, ctx.shell.io.columns || 80);
  };

  let out = '';
  if (files.length) out += render(sortEntries(files), false);

  const listDir = (label, node, abs, first) => {
    let kids;
    try { kids = vfs.readDir(abs); } catch (e) {
      ctx.out(out); out = '';
      ctx.err("ls: não foi possível abrir o diretório '" + label + "': " + mensagemErro(e) + '\n');
      status = 2;
      return;
    }
    let entries = kids.filter((k) => o.a || o.A || !k.name.startsWith('.')).map((k) => ({ name: k.name, node: k }));
    if (o.a) entries.push({ name: '.', node }, { name: '..', node: node.parent || node });
    entries = sortEntries(entries);
    const header = operands.length > 1 || files.length || o.R;
    if (header) out += (first && !files.length ? '' : '\n') + label + ':\n';
    out += render(entries, true);
    if (o.R) {
      for (const e of entries) {
        if (e.node.type === 'dir' && e.name !== '.' && e.name !== '..') {
          listDir(label.replace(/\/$/, '') + '/' + e.name, e.node, normalizePath(e.name, abs), false);
        }
      }
    }
  };
  dirs.sort((a, b) => compareText(a.op, b.op));
  dirs.forEach((d, i) => listDir(d.op, d.node, ctx.resolve(d.op), i === 0));
  ctx.out(out);
  return status;
};

commands.cat = (ctx) => {
  const p = parseOpts(ctx, { flags: 'n', long: { '--number': 'n' } });
  if (!p) return 1;
  let status = 0;
  let lineNo = 1;
  const emit = (content) => {
    if (!p.opts.n) { ctx.out(content); return; }
    const lines = splitLines(content);
    ctx.out(lines.map((l) => String(lineNo++).padStart(6) + '\t' + l).join('\n') + (lines.length ? '\n' : ''));
  };
  if (!p.operands.length) { emit(ctx.readStdin()); return 0; }
  for (const op of p.operands) {
    if (op === '-') { emit(ctx.readStdin()); continue; }
    try { emit(ctx.vfs.readFile(ctx.resolve(op))); } catch (e) {
      ctx.err('cat: ' + op + ': ' + mensagemErro(e) + '\n');
      status = 1;
    }
  }
  return status;
};
commands.less = (ctx) => commands.cat(ctx);
commands.more = (ctx) => commands.cat(ctx);

function headTail(ctx, which) {
  const p = parseOpts(ctx, { values: 'n', numeric: true, long: { '--lines': 'n' } });
  if (!p) return 1;
  let spec = p.opts.n !== undefined ? p.opts.n : p.opts.num !== undefined ? p.opts.num : '10';
  let fromStart = false;
  if (which === 'tail' && spec.startsWith('+')) { fromStart = true; spec = spec.slice(1); }
  if (!/^\d+$/.test(spec)) { ctx.err(which + ": número de linhas inválido: '" + spec + "'\n"); return 1; }
  const n = parseInt(spec, 10);
  const { inputs, failed } = readInputs(ctx, p.operands);
  inputs.forEach((inp, i) => {
    if (inputs.length > 1) ctx.out((i ? '\n' : '') + '==> ' + (inp.stdin ? 'entrada padrão' : inp.name) + ' <==\n');
    const lines = splitLines(inp.content);
    let sel;
    if (which === 'head') sel = lines.slice(0, n);
    else if (fromStart) sel = lines.slice(Math.max(0, n - 1));
    else sel = n === 0 ? [] : lines.slice(-n);
    ctx.out(joinLines(sel));
  });
  return failed ? 1 : 0;
}
commands.head = (ctx) => headTail(ctx, 'head');
commands.tail = (ctx) => headTail(ctx, 'tail');

commands.wc = (ctx) => {
  const p = parseOpts(ctx, { flags: 'lwcm', long: { '--lines': 'l', '--words': 'w', '--bytes': 'c' } });
  if (!p) return 1;
  let { l, w, c, m } = p.opts;
  if (m) c = true;
  if (!l && !w && !c) { l = true; w = true; c = true; }
  const { inputs, failed } = readInputs(ctx, p.operands);
  const rows = inputs.map((inp) => ({
    name: inp.stdin ? '' : inp.name,
    l: (inp.content.match(/\n/g) || []).length,
    w: inp.content.split(/\s+/).filter(Boolean).length,
    c: byteLength(inp.content),
  }));
  if (rows.length > 1) {
    rows.push({ name: 'total', l: rows.reduce((a, r) => a + r.l, 0), w: rows.reduce((a, r) => a + r.w, 0), c: rows.reduce((a, r) => a + r.c, 0) });
  }
  const cols = [l && 'l', w && 'w', c && 'c'].filter(Boolean);
  let width = Math.max(1, ...rows.map((r) => String(r.c).length));
  if (cols.length === 1 && rows.length === 1) width = 1;
  if (rows.length === 1 && rows[0].name === '' && cols.length > 1) width = 7;
  for (const r of rows) {
    ctx.out(cols.map((k) => String(r[k]).padStart(width)).join(' ') + (r.name ? ' ' + r.name : '') + '\n');
  }
  return failed ? 1 : 0;
};

commands.echo = (ctx) => {
  let args = ctx.args.slice();
  let newline = true;
  let escapes = false;
  while (args.length && /^-[neE]+$/.test(args[0])) {
    for (const ch of args[0].slice(1)) {
      if (ch === 'n') newline = false;
      if (ch === 'e') escapes = true;
      if (ch === 'E') escapes = false;
    }
    args.shift();
  }
  let text = args.join(' ');
  if (escapes) {
    text = interpretEscapes(text);
    const stop = text.indexOf('\u0000STOP');
    if (stop >= 0) { text = text.slice(0, stop); newline = false; }
  }
  ctx.out(text + (newline ? '\n' : ''));
  return 0;
};

commands.printf = (ctx) => {
  if (!ctx.args.length) { ctx.err('printf: uso: printf formato [argumentos]\n'); return 2; }
  const fmt = interpretEscapes(ctx.args[0]).replace('\u0000STOP', '');
  const args = ctx.args.slice(1);
  let ai = 0;
  let out = '';
  let status = 0;
  const once = () => {
    let used = false;
    const res = fmt.replace(/%(-?)(\d*)(?:\.(\d+))?([sdifcx%])/g, (m, left, width, precision, conv) => {
      if (conv === '%') return '%';
      used = true;
      let v = ai < args.length ? args[ai++] : '';
      let s;
      if (conv === 's') s = precision !== undefined ? v.slice(0, Number(precision)) : v;
      else if (conv === 'c') s = v.charAt(0);
      else if (conv === 'd' || conv === 'i' || conv === 'x') {
        let n = parseInt(v || '0', 10);
        if (isNaN(n)) { ctx.err("printf: '" + v + "': número inválido\n"); status = 1; n = 0; }
        s = conv === 'x' ? n.toString(16) : String(n);
      } else {
        let f = parseFloat((v || '0').replace(',', '.'));
        if (isNaN(f)) { ctx.err("printf: '" + v + "': número inválido\n"); status = 1; f = 0; }
        s = f.toFixed(precision !== undefined ? Number(precision) : 6).replace('.', ',');
      }
      const wNum = width ? Number(width) : 0;
      return left ? s.padEnd(wNum) : s.padStart(wNum);
    });
    out += res;
    return used;
  };
  const used = once();
  while (used && ai < args.length) once();
  ctx.out(out);
  return status;
};

commands.touch = (ctx) => {
  const p = parseOpts(ctx, { flags: 'c' });
  if (!p) return 1;
  if (!p.operands.length) { ctx.err('touch: falta o operando arquivo\n'); return 1; }
  let status = 0;
  for (const op of p.operands) {
    try {
      const abs = ctx.resolve(op);
      if (p.opts.c && !ctx.vfs.exists(abs)) continue;
      ctx.vfs.touch(abs);
    } catch (e) {
      ctx.err("touch: não foi possível tocar '" + op + "': " + mensagemErro(e) + '\n');
      status = 1;
    }
  }
  return status;
};

commands.mkdir = (ctx) => {
  const p = parseOpts(ctx, { flags: 'pv', long: { '--parents': 'p', '--verbose': 'v' } });
  if (!p) return 1;
  if (!p.operands.length) { ctx.err('mkdir: falta o operando\n'); return 1; }
  let status = 0;
  for (const op of p.operands) {
    try {
      ctx.vfs.mkdir(ctx.resolve(op), { parents: !!p.opts.p });
      if (p.opts.v) ctx.out("mkdir: foi criado o diretório '" + op + "'\n");
    } catch (e) {
      ctx.err("mkdir: não foi possível criar o diretório '" + op + "': " + mensagemErro(e) + '\n');
      status = 1;
    }
  }
  return status;
};

commands.rmdir = (ctx) => {
  const p = parseOpts(ctx, {});
  if (!p) return 1;
  if (!p.operands.length) { ctx.err('rmdir: falta o operando\n'); return 1; }
  let status = 0;
  for (const op of p.operands) {
    try {
      const abs = ctx.resolve(op);
      const node = ctx.vfs.lookup(abs);
      if (node.type !== 'dir') throw new FsError('ENOTDIR', abs);
      ctx.vfs.remove(abs);
    } catch (e) {
      ctx.err("rmdir: falhou em remover '" + op + "': " + mensagemErro(e) + '\n');
      status = 1;
    }
  }
  return status;
};

commands.rm = async (ctx) => {
  const p = parseOpts(ctx, { flags: 'rRfivd', long: { '--recursive': 'r', '--force': 'f', '--verbose': 'v' } });
  if (!p) return 1;
  const o = p.opts;
  const recursive = o.r || o.R;
  if (!p.operands.length) {
    if (o.f) return 0;
    ctx.err('rm: falta o operando\n');
    return 1;
  }
  let status = 0;
  for (const op of p.operands) {
    const abs = ctx.resolve(op);
    if (abs === '/' && recursive) {
      ctx.err("rm: é perigoso operar recursivamente em '/'\nrm: use --no-preserve-root para ignorar esta proteção (mas, por favor, nunca faça isso 😅)\n");
      status = 1;
      continue;
    }
    if (basename(op) === '.' || basename(op) === '..') {
      ctx.err("rm: recusando-se a remover os diretórios '.' ou '..': ignorando '" + op + "'\n");
      status = 1;
      continue;
    }
    let node;
    try { node = ctx.vfs.lookup(abs); } catch (e) {
      if (!o.f || e.code !== 'ENOENT') { ctx.err("rm: não foi possível remover '" + op + "': " + mensagemErro(e) + '\n'); status = 1; }
      continue;
    }
    if (node.type === 'dir' && !recursive) {
      ctx.err("rm: não foi possível remover '" + op + "': É um diretório\n");
      status = 1;
      continue;
    }
    if (o.i && !o.f) {
      const kind = node.type === 'dir' ? 'diretório' : 'arquivo comum';
      const ans = ctx.shell.io.readLine ? await ctx.shell.io.readLine("rm: remover " + kind + " '" + op + "'? ") : 's';
      if (!ans || !/^[sSyY]/.test(ans)) continue;
    }
    try {
      ctx.vfs.remove(abs, { recursive: true });
      if (o.v) ctx.out("removido '" + op + "'\n");
    } catch (e) {
      ctx.err("rm: não foi possível remover '" + op + "': " + mensagemErro(e) + '\n');
      status = 1;
    }
  }
  return status;
};

function copyRec(vfs, src, dst) {
  const node = vfs.lookup(src);
  if (node.type === 'file') {
    const content = vfs.readFile(src);
    const created = vfs.writeFile(dst, content, { mode: node.mode, exec: node.exec });
    if (node.exec) created.exec = node.exec;
    return;
  }
  if (!vfs.exists(dst)) vfs.mkdir(dst, { mode: node.mode });
  for (const child of vfs.readDir(src)) copyRec(vfs, normalizePath(child.name, src), normalizePath(child.name, dst));
}

commands.cp = (ctx) => {
  const p = parseOpts(ctx, { flags: 'rRvfa', long: { '--recursive': 'r', '--verbose': 'v' } });
  if (!p) return 1;
  const recursive = p.opts.r || p.opts.R || p.opts.a;
  const ops = p.operands;
  if (ops.length === 0) { ctx.err('cp: falta o operando arquivo\n'); return 1; }
  if (ops.length === 1) { ctx.err("cp: falta o operando arquivo de destino após '" + ops[0] + "'\n"); return 1; }
  const dest = ops[ops.length - 1];
  const destAbs = ctx.resolve(dest);
  const destNode = ctx.vfs.tryLookup(destAbs);
  const destIsDir = destNode && destNode.type === 'dir';
  if (ops.length > 2 && !destIsDir) { ctx.err("cp: o destino '" + dest + "' não é um diretório\n"); return 1; }
  let status = 0;
  for (const src of ops.slice(0, -1)) {
    const srcAbs = ctx.resolve(src);
    let node;
    try { node = ctx.vfs.lookup(srcAbs); } catch (e) {
      ctx.err("cp: não foi possível obter estado de '" + src + "': " + mensagemErro(e) + '\n');
      status = 1; continue;
    }
    if (node.type === 'dir' && !recursive) {
      ctx.err("cp: -r não especificado; omitindo o diretório '" + src + "'\n");
      status = 1; continue;
    }
    const target = destIsDir ? normalizePath(basename(srcAbs), destAbs) : destAbs;
    if (node.type === 'dir' && (target + '/').startsWith(srcAbs + '/')) {
      ctx.err("cp: não é possível copiar um diretório, '" + src + "', para dentro de si mesmo\n");
      status = 1; continue;
    }
    if (target === srcAbs) { ctx.err("cp: '" + src + "' e '" + dest + "' são o mesmo arquivo\n"); status = 1; continue; }
    try {
      copyRec(ctx.vfs, srcAbs, target);
      if (p.opts.v) ctx.out("'" + src + "' -> '" + ctx.shell.displayPath(target) + "'\n");
    } catch (e) {
      ctx.err("cp: não foi possível copiar '" + src + "': " + mensagemErro(e) + '\n');
      status = 1;
    }
  }
  return status;
};

commands.mv = (ctx) => {
  const p = parseOpts(ctx, { flags: 'vfi', long: { '--verbose': 'v' } });
  if (!p) return 1;
  const ops = p.operands;
  if (ops.length === 0) { ctx.err('mv: falta o operando arquivo\n'); return 1; }
  if (ops.length === 1) { ctx.err("mv: falta o operando arquivo de destino após '" + ops[0] + "'\n"); return 1; }
  const dest = ops[ops.length - 1];
  const destAbs = ctx.resolve(dest);
  const destNode = ctx.vfs.tryLookup(destAbs);
  const destIsDir = destNode && destNode.type === 'dir';
  if (ops.length > 2 && !destIsDir) { ctx.err("mv: o destino '" + dest + "' não é um diretório\n"); return 1; }
  let status = 0;
  for (const src of ops.slice(0, -1)) {
    const srcAbs = ctx.resolve(src);
    if (!ctx.vfs.exists(srcAbs)) {
      ctx.err("mv: não foi possível obter estado de '" + src + "': Arquivo ou diretório inexistente\n");
      status = 1; continue;
    }
    const target = destIsDir ? normalizePath(basename(srcAbs), destAbs) : destAbs;
    if (target === srcAbs) continue;
    try {
      ctx.vfs.move(srcAbs, target);
      if (ctx.shell.cwd === srcAbs || ctx.shell.cwd.startsWith(srcAbs + '/')) {
        ctx.shell.cwd = target + ctx.shell.cwd.slice(srcAbs.length);
      }
      if (p.opts.v) ctx.out("renomeado '" + src + "' -> '" + dest + "'\n");
    } catch (e) {
      ctx.err("mv: não foi possível mover '" + src + "' para '" + dest + "': " + mensagemErro(e) + '\n');
      status = 1;
    }
  }
  return status;
};

// Converte expressão regular básica (BRE, padrão do grep) para a sintaxe do JavaScript.
function breToJs(pattern) {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\' && i + 1 < pattern.length) {
      const n = pattern[i + 1];
      if ('+?|(){}'.includes(n)) out += n;
      else out += '\\' + n;
      i++;
    } else if ('+?|(){}'.includes(ch)) out += '\\' + ch;
    else out += ch;
  }
  return out;
}

commands.grep = (ctx) => {
  const p = parseOpts(ctx, {
    flags: 'ivcnlLrRqoEFwhHs', values: 'e',
    long: { '--ignore-case': 'i', '--invert-match': 'v', '--count': 'c', '--recursive': 'r', '--color': 'G' },
  });
  if (!p) return 2;
  const o = p.opts;
  const ops = p.operands.slice();
  let pattern = o.e;
  if (pattern === undefined) {
    if (!ops.length) { ctx.err("Uso: grep [OPÇÃO]... PADRÕES [ARQUIVO]...\nTente 'grep --help' para mais informações.\n"); return 2; }
    pattern = ops.shift();
  }
  let src = o.F ? pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : o.E ? pattern : breToJs(pattern);
  if (o.w) src = '(?<![\\wÀ-ú])(?:' + src + ')(?![\\wÀ-ú])';
  let re;
  try { re = new RegExp(src, o.i ? 'i' : ''); } catch (e) {
    try { if (o.w) re = new RegExp('\\b(?:' + (o.F ? pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : breToJs(pattern)) + ')\\b', o.i ? 'i' : ''); else throw e; }
    catch (e2) { ctx.err('grep: expressão regular inválida\n'); return 2; }
  }
  const reG = new RegExp(re.source, re.flags + 'g');
  const recursive = o.r || o.R;
  let targets = [];
  let hadError = false;
  const vfs = ctx.vfs;

  if (!ops.length) {
    if (recursive) ops.push('.');
    else targets.push({ name: '(entrada padrão)', content: ctx.readStdin(), stdin: true });
  }
  for (const op of ops) {
    const abs = ctx.resolve(op);
    let node;
    try { node = vfs.lookup(abs); } catch (e) {
      if (!o.s) ctx.err('grep: ' + op + ': ' + mensagemErro(e) + '\n');
      hadError = true; continue;
    }
    if (node.type === 'dir') {
      if (!recursive) { if (!o.s) ctx.err('grep: ' + op + ': É um diretório\n'); hadError = true; continue; }
      const walk = (n, disp, nabs) => {
        if (n.type !== 'dir') {
          if (!vfs.canRead(n)) { if (!o.s) ctx.err('grep: ' + disp + ': Permissão negada\n'); hadError = true; return; }
          targets.push({ name: disp, content: n.content, binary: !!n.exec || n.content.includes('\u0000') });
          return;
        }
        if (!vfs.canRead(n) || !vfs.canExec(n)) { if (!o.s) ctx.err('grep: ' + disp + ': Permissão negada\n'); hadError = true; return; }
        const kids = Array.from(n.children.values()).sort((a, b) => compareText(a.name, b.name));
        for (const k of kids) walk(k, disp.replace(/\/$/, '') + '/' + k.name, normalizePath(k.name, nabs));
      };
      walk(node, op, abs);
    } else {
      if (!vfs.canRead(node)) { if (!o.s) ctx.err('grep: ' + op + ': Permissão negada\n'); hadError = true; continue; }
      targets.push({ name: op, content: node.device === 'null' ? '' : node.content, binary: !!node.exec || node.content.includes('\u0000') });
    }
  }

  const showName = o.H || (!o.h && (targets.length > 1 || recursive));
  const tty = ctx.isTTY;
  const fname = (n) => (tty ? C.magenta + n + C.reset + C.cyan + ':' + C.reset : n + ':');
  const lnum = (n) => (tty ? C.green + n + C.reset + C.cyan + ':' + C.reset : n + ':');
  const hl = (line) => (tty && !o.v ? line.replace(reG, (m) => (m ? C.bred + m + C.reset : m)) : line);
  let matchedAny = false;

  for (const t of targets) {
    const lines = splitLines(t.content);
    let count = 0;
    let out = '';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const ok = re.test(line) !== !!o.v;
      if (!ok) continue;
      count++;
      if (o.q || o.l || o.L || o.c || t.binary) continue;
      const prefix = (showName ? fname(t.name) : '') + (o.n ? lnum(i + 1) : '');
      if (o.o && !o.v) {
        const ms = line.match(reG) || [];
        for (const m of ms) if (m) out += prefix + (tty ? C.bred + m + C.reset : m) + '\n';
      } else out += prefix + hl(line) + '\n';
    }
    if (count) matchedAny = true;
    if (o.q) { if (matchedAny) return 0; continue; }
    if (t.binary) { if (count && !o.c && !o.l) ctx.out('grep: ' + t.name + ': arquivo binário corresponde\n'); }
    if (o.l) { if (count) ctx.out((tty ? C.magenta + t.name + C.reset : t.name) + '\n'); continue; }
    if (o.L) { if (!count) ctx.out(t.name + '\n'); continue; }
    if (o.c) { ctx.out((showName ? fname(t.name) : '') + count + '\n'); continue; }
    ctx.out(out);
  }
  if (hadError && !(o.q && matchedAny)) return 2;
  return matchedAny ? 0 : 1;
};

commands.find = (ctx) => {
  const args = ctx.args.slice();
  const paths = [];
  while (args.length && !args[0].startsWith('-') && args[0] !== '!' && args[0] !== '(') paths.push(args.shift());
  if (!paths.length) paths.push('.');
  const tests = [];
  let maxdepth = Infinity;
  let mindepth = 0;
  while (args.length) {
    let a = args.shift();
    let negate = false;
    if (a === '!' || a === '-not') {
      negate = true;
      a = args.shift();
      if (a === undefined) { ctx.err("find: esperava uma expressão após '!'\n"); return 1; }
    }
    const need = () => {
      const v = args.shift();
      if (v === undefined) { ctx.err("find: faltando argumento para '" + a + "'\n"); return null; }
      return v;
    };
    let test;
    switch (a) {
      case '-name': case '-iname': {
        const v = need(); if (v === null) return 1;
        const re = globToRegex(v, { ignoreCase: a === '-iname' });
        test = (n) => re.test(n.name || '/');
        break;
      }
      case '-type': {
        const v = need(); if (v === null) return 1;
        if (v !== 'f' && v !== 'd') { ctx.err("find: tipo desconhecido para -type: '" + v + "' (use f ou d)\n"); return 1; }
        test = (n) => (v === 'd' ? n.type === 'dir' : n.type === 'file');
        break;
      }
      case '-size': {
        const v = need(); if (v === null) return 1;
        const m = /^([+-]?)(\d+)([ckMG]?)$/.exec(v);
        if (!m) { ctx.err("find: tamanho inválido em -size: '" + v + "'\n"); return 1; }
        const unit = { c: 1, k: 1024, M: 1024 * 1024, G: 1024 * 1024 * 1024, '': 512 }[m[3]];
        const num = parseInt(m[2], 10);
        test = (n) => {
          const s = Math.ceil(nodeSize(n) / unit);
          return m[1] === '+' ? s > num : m[1] === '-' ? s < num : s === num;
        };
        break;
      }
      case '-empty':
        test = (n) => (n.type === 'dir' ? n.children.size === 0 : n.content.length === 0);
        break;
      case '-user': {
        const v = need(); if (v === null) return 1;
        test = (n) => n.owner === v;
        break;
      }
      case '-perm': {
        const v = need(); if (v === null) return 1;
        const mode = parseInt(v.replace(/^[-/]/, ''), 8);
        test = v.startsWith('-') ? (n) => (n.mode & mode) === mode : (n) => (n.mode & 0o777) === mode;
        break;
      }
      case '-maxdepth': case '-mindepth': {
        const v = need(); if (v === null) return 1;
        if (!/^\d+$/.test(v)) { ctx.err("find: argumento inválido para " + a + ": '" + v + "'\n"); return 1; }
        if (a === '-maxdepth') maxdepth = parseInt(v, 10); else mindepth = parseInt(v, 10);
        continue;
      }
      case '-print':
        continue;
      case '-exec': case '-delete': case '-o': case '-or':
        ctx.err('find: ' + a + ' não é suportado neste simulador. Dica: combine find com pipes, ex.: find . -name "*.txt" | grep algo\n');
        return 1;
      default:
        ctx.err("find: predicado desconhecido '" + a + "'\n");
        return 1;
    }
    tests.push(negate ? (n) => !test(n) : test);
  }

  const vfs = ctx.vfs;
  let status = 0;
  let out = '';
  for (const start of paths) {
    const abs = ctx.resolve(start);
    let root;
    try { root = vfs.lookup(abs); } catch (e) {
      ctx.out(out); out = '';
      ctx.err("find: '" + start + "': " + mensagemErro(e) + '\n');
      status = 1; continue;
    }
    const rec = (node, disp, depth) => {
      if (depth >= mindepth && tests.every((t) => t(node))) out += disp + '\n';
      if (node.type !== 'dir' || depth >= maxdepth) return;
      if (!vfs.canRead(node) || !vfs.canExec(node)) {
        ctx.out(out); out = '';
        ctx.err("find: '" + disp + "': Permissão negada\n");
        status = 1;
        return;
      }
      const kids = Array.from(node.children.values()).sort((a, b) => compareText(a.name, b.name));
      for (const k of kids) rec(k, (disp.endsWith('/') ? disp : disp + '/') + k.name, depth + 1);
    };
    rec(root, start, 0);
  }
  ctx.out(out);
  return status;
};

// Calcula o novo modo a partir de uma especificação numérica ou simbólica.
function applyMode(spec, current, isDir) {
  if (/^[0-7]{1,4}$/.test(spec)) return parseInt(spec, 8);
  let mode = current;
  for (const clause of spec.split(',')) {
    const m = /^([ugoa]*)([-+=])([rwxX]*)$/.exec(clause);
    if (!m) return null;
    const who = m[1] || 'a';
    let bits = 0;
    for (const ch of m[3]) {
      if (ch === 'r') bits |= 4;
      if (ch === 'w') bits |= 2;
      if (ch === 'x') bits |= 1;
      if (ch === 'X' && (isDir || (current & 0o111))) bits |= 1;
    }
    let mask = 0;
    let set = 0;
    for (const w of who) {
      const shifts = w === 'a' ? [6, 3, 0] : [{ u: 6, g: 3, o: 0 }[w]];
      for (const s of shifts) { mask |= 7 << s; set |= bits << s; }
    }
    if (m[2] === '+') mode |= set;
    else if (m[2] === '-') mode &= ~set;
    else mode = (mode & ~mask) | set;
  }
  return mode;
}

commands.chmod = (ctx) => {
  let recursive = false;
  let verbose = false;
  let modeSpec = null;
  const files = [];
  for (const a of ctx.args) {
    if (modeSpec === null && /^[-+=][rwxX]+$/.test(a)) { modeSpec = a; continue; }
    if (a === '-R' || a === '--recursive') { recursive = true; continue; }
    if (a === '-v' || a === '--verbose') { verbose = true; continue; }
    if (a.startsWith('-') && a.length > 1 && a !== '--') { ctx.err("chmod: opção inválida -- '" + a.slice(1) + "'\n"); return 1; }
    if (modeSpec === null) modeSpec = a;
    else files.push(a);
  }
  if (modeSpec === null) { ctx.err('chmod: falta o operando\n'); return 1; }
  if (!files.length) { ctx.err("chmod: falta o operando após '" + modeSpec + "'\n"); return 1; }
  if (applyMode(modeSpec, 0, false) === null) { ctx.err("chmod: modo inválido: '" + modeSpec + "'\n"); return 1; }
  let status = 0;
  const vfs = ctx.vfs;
  const apply = (abs, disp) => {
    let node;
    try { node = vfs.lookup(abs); } catch (e) {
      ctx.err("chmod: não foi possível acessar '" + disp + "': " + mensagemErro(e) + '\n');
      status = 1; return;
    }
    try {
      const old = node.mode;
      vfs.chmod(abs, applyMode(modeSpec, node.mode, node.type === 'dir'));
      if (verbose) ctx.out("o modo de '" + disp + "' foi alterado de " + old.toString(8).padStart(4, '0') + ' para ' + node.mode.toString(8).padStart(4, '0') + '\n');
    } catch (e) {
      ctx.err("chmod: alterando as permissões de '" + disp + "': " + mensagemErro(e) + '\n');
      status = 1; return;
    }
    if (recursive && node.type === 'dir' && vfs.canRead(node)) {
      for (const k of Array.from(node.children.values())) apply(normalizePath(k.name, abs), disp.replace(/\/$/, '') + '/' + k.name);
    }
  };
  for (const f of files) apply(ctx.resolve(f), f);
  return status;
};

commands.chown = (ctx) => {
  if (ctx.args.length < 2) { ctx.err('chown: falta o operando\n'); return 1; }
  for (const f of ctx.args.slice(1)) ctx.err("chown: alterando o dono de '" + f + "': Operação não permitida\n");
  return 1;
};

commands.sudo = (ctx) => {
  ctx.err('[sudo] senha para ' + ctx.shell.user + ': \n');
  ctx.err(ctx.shell.user + ' não está no arquivo sudoers. Este incidente será reportado. 🚨\n');
  ctx.err(C.gray + '(neste simulador você é um usuário comum — e nada aqui exige sudo)' + C.reset + '\n');
  return 1;
};
commands.su = commands.sudo;

commands.sort = (ctx) => {
  const p = parseOpts(ctx, { flags: 'rnufb', values: 'tk', long: { '--reverse': 'r', '--numeric-sort': 'n', '--unique': 'u' } });
  if (!p) return 2;
  const o = p.opts;
  const { inputs, failed } = readInputs(ctx, p.operands);
  let lines = [];
  for (const i of inputs) lines.push(...splitLines(i.content));
  const keyOf = (line) => {
    let s = line;
    if (o.k) {
      const k = parseInt(o.k, 10);
      const fields = o.t !== undefined ? line.split(o.t) : line.trim().split(/\s+/);
      s = fields.slice(k - 1).join(o.t !== undefined ? o.t : ' ');
    }
    if (o.b) s = s.trim();
    if (o.f) s = s.toLowerCase();
    return s;
  };
  const cmp = (a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    if (o.n) {
      const na = parseFloat(ka) || 0;
      const nb = parseFloat(kb) || 0;
      if (na !== nb) return na - nb;
      return compareText(a, b);
    }
    return compareText(ka, kb) || (ka < kb ? -1 : ka > kb ? 1 : 0);
  };
  lines.sort(cmp);
  if (o.r) lines.reverse();
  if (o.u) lines = lines.filter((l, i) => i === 0 || cmp(lines[i - 1], l) !== 0);
  ctx.out(joinLines(lines));
  return failed ? 2 : 0;
};

commands.uniq = (ctx) => {
  const p = parseOpts(ctx, { flags: 'cdui', long: { '--count': 'c', '--unique': 'u', '--repeated': 'd' } });
  if (!p) return 1;
  const o = p.opts;
  const { inputs, failed } = readInputs(ctx, p.operands.slice(0, 1));
  if (failed) return 1;
  const lines = splitLines(inputs[0].content);
  const groups = [];
  for (const l of lines) {
    const last = groups[groups.length - 1];
    if (last && (o.i ? last.line.toLowerCase() === l.toLowerCase() : last.line === l)) last.n++;
    else groups.push({ line: l, n: 1 });
  }
  let out = '';
  for (const g of groups) {
    if (o.u && g.n !== 1) continue;
    if (o.d && g.n === 1) continue;
    out += (o.c ? String(g.n).padStart(7) + ' ' : '') + g.line + '\n';
  }
  ctx.out(out);
  return 0;
};

function parseRanges(spec) {
  const ranges = [];
  for (const part of spec.split(',')) {
    const m = /^(\d*)(-?)(\d*)$/.exec(part);
    if (!m || (!m[1] && !m[3])) return null;
    const a = m[1] ? parseInt(m[1], 10) : 1;
    const b = m[2] ? (m[3] ? parseInt(m[3], 10) : Infinity) : a;
    if (a < 1) return null;
    ranges.push([a, b]);
  }
  return ranges;
}

commands.cut = (ctx) => {
  const p = parseOpts(ctx, { flags: 's', values: 'dfcb', long: { '--delimiter': 'd', '--fields': 'f' } });
  if (!p) return 1;
  const o = p.opts;
  const spec = o.f || o.c || o.b;
  if (!spec) { ctx.err('cut: você deve especificar uma lista de bytes, caracteres ou campos\n'); return 1; }
  const ranges = parseRanges(spec);
  if (!ranges) { ctx.err("cut: lista inválida: '" + spec + "'\n"); return 1; }
  const inRange = (i) => ranges.some(([a, b]) => i >= a && i <= b);
  const delim = o.d !== undefined ? o.d : '\t';
  if (o.d !== undefined && o.d.length !== 1) { ctx.err('cut: o delimitador deve ser um único caractere\n'); return 1; }
  const { inputs, failed } = readInputs(ctx, p.operands);
  let out = '';
  for (const inp of inputs) {
    for (const line of splitLines(inp.content)) {
      if (o.f) {
        if (!line.includes(delim)) { if (!o.s) out += line + '\n'; continue; }
        out += line.split(delim).filter((_, i) => inRange(i + 1)).join(delim) + '\n';
      } else {
        out += Array.from(line).filter((_, i) => inRange(i + 1)).join('') + '\n';
      }
    }
  }
  ctx.out(out);
  return failed ? 1 : 0;
};

function expandSet(set) {
  set = set.replace(/\[:upper:\]/g, 'A-Z').replace(/\[:lower:\]/g, 'a-z').replace(/\[:digit:\]/g, '0-9')
    .replace(/\[:space:\]/g, ' \t\n').replace(/\[:alpha:\]/g, 'a-zA-Z');
  set = interpretEscapes(set);
  const chars = [];
  const arr = Array.from(set);
  for (let i = 0; i < arr.length; i++) {
    if (arr[i + 1] === '-' && arr[i + 2] !== undefined) {
      const a = arr[i].codePointAt(0);
      const b = arr[i + 2].codePointAt(0);
      for (let c = a; c <= b; c++) chars.push(String.fromCodePoint(c));
      i += 2;
    } else chars.push(arr[i]);
  }
  return chars;
}

commands.tr = (ctx) => {
  const p = parseOpts(ctx, { flags: 'ds' });
  if (!p) return 1;
  const ops = p.operands;
  if (!ops.length || (!p.opts.d && ops.length < 2)) { ctx.err('tr: falta o operando\n'); return 1; }
  const input = ctx.readStdin();
  const s1 = expandSet(ops[0]);
  let out;
  if (p.opts.d) {
    const del = new Set(s1);
    out = Array.from(input).filter((c) => !del.has(c)).join('');
  } else {
    const s2 = expandSet(ops[1]);
    const map = new Map();
    s1.forEach((c, i) => map.set(c, s2[Math.min(i, s2.length - 1)]));
    out = Array.from(input).map((c) => (map.has(c) ? map.get(c) : c)).join('');
  }
  if (p.opts.s) out = out.replace(/(.)\1+/g, '$1');
  ctx.out(out);
  return 0;
};

commands.seq = (ctx) => {
  let pad = false;
  let sep = '\n';
  const nums = [];
  const args = ctx.args.slice();
  while (args.length) {
    const a = args.shift();
    if (a === '-w' || a === '--equal-width') pad = true;
    else if (a === '-s') sep = interpretEscapes(args.shift() || '');
    else if (/^-s./.test(a)) sep = interpretEscapes(a.slice(2));
    else if (/^-?\d+$/.test(a)) nums.push(parseInt(a, 10));
    else { ctx.err("seq: argumento de ponto flutuante inválido: '" + a + "'\n"); return 1; }
  }
  if (!nums.length || nums.length > 3) { ctx.err('seq: falta o operando\n'); return 1; }
  let first = 1;
  let step = 1;
  let last;
  if (nums.length === 1) last = nums[0];
  else if (nums.length === 2) { first = nums[0]; last = nums[1]; }
  else { first = nums[0]; step = nums[1]; last = nums[2]; }
  if (step === 0) { ctx.err('seq: valor de incremento zero inválido\n'); return 1; }
  const width = Math.max(String(first).length, String(last).length);
  const out = [];
  for (let i = first; step > 0 ? i <= last : i >= last; i += step) {
    out.push(pad ? (i < 0 ? '-' + String(-i).padStart(width - 1, '0') : String(i).padStart(width, '0')) : String(i));
    if (out.length > 100000) break;
  }
  ctx.out(out.length ? out.join(sep) + '\n' : '');
  return 0;
};

function formatDateCmd(d, fmt) {
  const tz = -d.getTimezoneOffset();
  const tzs = (tz >= 0 ? '+' : '-') + pad2(Math.floor(Math.abs(tz) / 60));
  return fmt.replace(/%([a-zA-Z%])/g, (m, c) => {
    switch (c) {
      case 'd': return pad2(d.getDate());
      case 'e': return String(d.getDate()).padStart(2, ' ');
      case 'm': return pad2(d.getMonth() + 1);
      case 'Y': return String(d.getFullYear());
      case 'y': return pad2(d.getFullYear() % 100);
      case 'H': return pad2(d.getHours());
      case 'M': return pad2(d.getMinutes());
      case 'S': return pad2(d.getSeconds());
      case 'A': return DIAS_LONGOS[d.getDay()];
      case 'a': return DIAS[d.getDay()];
      case 'B': return MESES_LONGOS[d.getMonth()];
      case 'b': case 'h': return MESES[d.getMonth()];
      case 'u': return String(d.getDay() || 7);
      case 'j': return String(Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000)).padStart(3, '0');
      case 'F': return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
      case 'T': return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
      case 'D': return pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()) + '/' + pad2(d.getFullYear() % 100);
      case 's': return String(Math.floor(d.getTime() / 1000));
      case 'Z': return tzs;
      case 'z': return tzs + pad2(Math.abs(tz) % 60);
      case 'n': return '\n';
      case 't': return '\t';
      case '%': return '%';
      default: return m;
    }
  });
}

commands.date = (ctx) => {
  const fmtArg = ctx.args.find((a) => a.startsWith('+'));
  const bad = ctx.args.find((a) => !a.startsWith('+'));
  if (bad) { ctx.err("date: data inválida '" + bad + "'\n"); return 1; }
  const fmt = fmtArg ? fmtArg.slice(1) : '%a %e %b %Y %T %Z';
  ctx.out(formatDateCmd(new Date(), fmt) + '\n');
  return 0;
};

commands.whoami = (ctx) => { ctx.out(ctx.shell.user + '\n'); return 0; };
commands.id = (ctx) => { const u = ctx.shell.user; ctx.out('uid=1000(' + u + ') gid=1000(' + u + ') grupos=1000(' + u + ')\n'); return 0; };
commands.groups = (ctx) => { ctx.out(ctx.shell.user + '\n'); return 0; };
commands.hostname = (ctx) => { ctx.out(ctx.shell.hostname + '\n'); return 0; };
commands.uname = (ctx) => {
  const a = ctx.args.join(' ');
  if (/-a/.test(a)) ctx.out('Linux ' + ctx.shell.hostname + ' 6.8.0-pinguim #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux\n');
  else if (/-r/.test(a)) ctx.out('6.8.0-pinguim\n');
  else if (/-m/.test(a)) ctx.out('x86_64\n');
  else if (/-n/.test(a)) ctx.out(ctx.shell.hostname + '\n');
  else ctx.out('Linux\n');
  return 0;
};

commands.clear = (ctx) => { if (ctx.shell.io.clear) ctx.shell.io.clear(); return 0; };

commands.history = (ctx) => {
  if (ctx.args[0] === '-c') { ctx.shell.history.length = 0; return 0; }
  const h = ctx.shell.history;
  ctx.out(h.map((l, i) => String(i + 1).padStart(5) + '  ' + l).join('\n') + (h.length ? '\n' : ''));
  return 0;
};

commands.man = (ctx) => {
  const name = ctx.args[0];
  if (!name) { ctx.err("Qual página de manual você deseja?\nPor exemplo, tente 'man ls'.\n"); return 1; }
  const page = MAN[name] || (ctx.shell.commands[name] && ctx.shell.commands[name].help);
  if (!page) { ctx.err('Nenhuma entrada de manual para ' + name + '\n'); return 16; }
  const lines = page.trim().split('\n');
  const tty = ctx.isTTY;
  const title = tty ? C.bold + lines[0] + C.reset : lines[0];
  const body = lines.slice(1).map((l) => (tty ? l.replace(/^(USO:|EXEMPLOS?:|DICA:|CUIDADO:|ATALHOS:)/, C.byellow + '$1' + C.reset) : l));
  ctx.out(title + '\n' + body.join('\n') + '\n');
  return 0;
};

const BUILTINS = new Set(['cd', 'echo', 'printf', 'pwd', 'exit', 'export', 'unset', 'read', 'test', '[', 'true', 'false',
  'history', 'type', 'source', '.', 'break', 'continue', 'help', ':']);

commands.which = (ctx) => {
  let status = 0;
  for (const n of ctx.args) {
    if (ctx.shell.commands[n] && !BUILTINS.has(n)) ctx.out('/usr/bin/' + n + '\n');
    else if (n === 'echo' || n === 'pwd' || n === 'true' || n === 'false' || n === 'test' || n === '[') ctx.out('/usr/bin/' + n + '\n');
    else status = 1;
  }
  return status;
};

commands.type = (ctx) => {
  let status = 0;
  for (const n of ctx.args) {
    if (BUILTINS.has(n)) ctx.out(n + ' é um comando interno do shell\n');
    else if (['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'in', 'until'].includes(n)) ctx.out(n + ' é uma palavra-chave do shell\n');
    else if (ctx.shell.commands[n]) ctx.out(n + ' é /usr/bin/' + n + '\n');
    else { ctx.err('bash: type: ' + n + ': não encontrado\n'); status = 1; }
  }
  return status;
};

// ---------- test / [ ----------
function evalTest(args, ctx) {
  const vfs = ctx.vfs;
  const isInt = (s) => /^\s*-?\d+\s*$/.test(s);
  const intErr = (s) => { throw new TestError((s === '' ? '' : s) + ': esperava expressão de número inteiro'); };
  const fileTest = (op, path) => {
    const node = vfs.tryLookup(ctx.resolve(path));
    switch (op) {
      case '-e': return !!node;
      case '-f': return !!node && node.type === 'file';
      case '-d': return !!node && node.type === 'dir';
      case '-r': return !!node && vfs.canRead(node);
      case '-w': return !!node && vfs.canWrite(node);
      case '-x': return !!node && vfs.canExec(node);
      case '-s': return !!node && nodeSize(node) > 0;
      default: return null;
    }
  };
  const unary = (op, v) => {
    if (op === '-z') return v === '';
    if (op === '-n') return v !== '';
    const r = fileTest(op, v);
    if (r === null) throw new TestError(op + ': esperado operador unário');
    return r;
  };
  const binary = (a, op, b) => {
    switch (op) {
      case '=': case '==': return a === b;
      case '!=': return a !== b;
      case '<': return a < b;
      case '>': return a > b;
      case '-eq': case '-ne': case '-lt': case '-le': case '-gt': case '-ge': {
        if (!isInt(a)) intErr(a);
        if (!isInt(b)) intErr(b);
        const x = parseInt(a, 10);
        const y = parseInt(b, 10);
        return { '-eq': x === y, '-ne': x !== y, '-lt': x < y, '-le': x <= y, '-gt': x > y, '-ge': x >= y }[op];
      }
      default: throw new TestError(op + ': esperado operador binário');
    }
  };
  const BIN = new Set(['=', '==', '!=', '<', '>', '-eq', '-ne', '-lt', '-le', '-gt', '-ge']);
  const evalSimple = (a) => {
    if (a.length === 0) return false;
    if (a[0] === '!' && a.length > 1) return !evalSimple(a.slice(1));
    if (a.length === 1) return a[0] !== '';
    if (a.length === 2) return unary(a[0], a[1]);
    if (a.length === 3 && BIN.has(a[1])) return binary(a[0], a[1], a[2]);
    if (a.length === 3 && a[0] === '!') return !unary(a[1], a[2]);
    throw new TestError('número excessivo de argumentos');
  };
  // -o tem precedência menor que -a
  const evalOr = (a) => {
    const i = a.lastIndexOf('-o');
    if (i > 0) return evalOr(a.slice(0, i)) || evalAnd(a.slice(i + 1));
    return evalAnd(a);
  };
  const evalAnd = (a) => {
    const i = a.lastIndexOf('-a');
    if (i > 0 && a.length > 3) return evalAnd(a.slice(0, i)) && evalSimple(a.slice(i + 1));
    return evalSimple(a);
  };
  return evalOr(args);
}
class TestError extends Error {}

commands.test = (ctx) => {
  try { return evalTest(ctx.args, ctx) ? 0 : 1; } catch (e) {
    if (e instanceof TestError) { ctx.err('bash: test: ' + e.message + '\n'); return 2; }
    throw e;
  }
};
commands['['] = (ctx) => {
  if (ctx.args[ctx.args.length - 1] !== ']') {
    ctx.err("bash: [: faltando ']'\n" + C.gray + 'Dica: os espaços são obrigatórios → [ "$a" -eq 1 ]' + C.reset + '\n');
    return 2;
  }
  try { return evalTest(ctx.args.slice(0, -1), ctx) ? 0 : 1; } catch (e) {
    if (e instanceof TestError) { ctx.err('bash: [: ' + e.message + '\n'); return 2; }
    throw e;
  }
};
commands['[['] = (ctx) => {
  ctx.err('bash: [[ ]] não é suportado neste simulador. Use [ ] (com espaços): if [ "$x" -gt 5 ]; then ...\n');
  return 2;
};

commands.true = () => 0;
commands[':'] = () => 0;
commands.false = () => 1;

commands.exit = (ctx) => {
  const n = ctx.args[0];
  if (n !== undefined && !/^-?\d+$/.test(n)) { ctx.err('bash: exit: ' + n + ': requer argumento numérico\n'); throw new ExitSignal(2); }
  throw new ExitSignal(n === undefined ? ctx.shell.lastStatus : ((parseInt(n, 10) % 256) + 256) % 256);
};

commands.break = (ctx) => { throw new BreakSignal(parseInt(ctx.args[0] || '1', 10) || 1); };
commands.continue = (ctx) => { throw new ContinueSignal(parseInt(ctx.args[0] || '1', 10) || 1); };

commands.export = (ctx) => {
  const sh = ctx.shell;
  if (!ctx.args.length || ctx.args[0] === '-p') {
    const names = Array.from(sh.exported).filter((n) => ctx.frame.vars.has(n)).sort();
    ctx.out(names.map((n) => 'declare -x ' + n + '="' + ctx.frame.vars.get(n) + '"').join('\n') + '\n');
    return 0;
  }
  for (const a of ctx.args) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)(?:=(.*))?$/.exec(a);
    if (!m) { ctx.err("bash: export: '" + a + "': não é um identificador válido\n"); return 1; }
    if (m[2] !== undefined) ctx.frame.vars.set(m[1], m[2]);
    sh.exported.add(m[1]);
  }
  return 0;
};

commands.unset = (ctx) => {
  for (const a of ctx.args) { ctx.frame.vars.delete(a); ctx.shell.exported.delete(a); }
  return 0;
};

commands.env = (ctx) => {
  const sh = ctx.shell;
  const names = Array.from(sh.exported).filter((n) => ctx.frame.vars.has(n) || n === 'PWD').sort();
  ctx.out(names.map((n) => n + '=' + (n === 'PWD' ? sh.cwd : ctx.frame.vars.get(n))).join('\n') + '\n');
  return 0;
};
commands.printenv = (ctx) => {
  if (!ctx.args.length) return commands.env(ctx);
  let status = 0;
  for (const n of ctx.args) {
    const v = n === 'PWD' ? ctx.shell.cwd : ctx.frame.vars.get(n);
    if (v === undefined || !ctx.shell.exported.has(n)) status = 1; else ctx.out(v + '\n');
  }
  return status;
};

commands.read = async (ctx) => {
  let prompt = '';
  const names = [];
  const args = ctx.args.slice();
  while (args.length) {
    const a = args.shift();
    if (a === '-p') prompt = args.shift() || '';
    else if (a === '-r' || a === '-s') continue;
    else if (/^-/.test(a)) { ctx.err('bash: read: ' + a + ': opção inválida\n'); return 2; }
    else names.push(a);
  }
  if (!names.length) names.push('REPLY');
  for (const n of names) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) { ctx.err("bash: read: '" + n + "': não é um identificador válido\n"); return 1; }
  }
  let line;
  if (ctx.hasStdin()) {
    const data = ctx.stdin.data;
    if (data === '') return 1;
    const nl = data.indexOf('\n');
    line = nl === -1 ? data : data.slice(0, nl);
    ctx.stdin.data = nl === -1 ? '' : data.slice(nl + 1);
  } else {
    if (!ctx.shell.io.readLine) return 1;
    line = await ctx.shell.io.readLine(prompt);
    if (line === null || line === undefined) {
      if (ctx.shell.interrupted) { ctx.shell.interrupted = false; throw new InterruptSignal(); }
      return 1;
    }
  }
  const words = line.trim() === '' ? [] : line.trim().split(/[ \t]+/);
  names.forEach((n, i) => {
    if (i === names.length - 1) ctx.frame.vars.set(n, words.slice(i).join(' '));
    else ctx.frame.vars.set(n, words[i] || '');
  });
  return 0;
};

commands.source = async (ctx) => {
  const f = ctx.args[0];
  if (!f) { ctx.err('bash: source: requer argumento de nome de arquivo\n'); return 2; }
  return ctx.shell.runScript(ctx.resolve(f), f, ctx.args.slice(1), ctx.frame, { source: true });
};
commands['.'] = commands.source;

commands.bash = async (ctx) => {
  const sh = ctx.shell;
  if (ctx.args[0] === '-c') {
    if (ctx.args[1] === undefined) { ctx.err('bash: -c: requer um argumento\n'); return 2; }
    const sub = Object.assign({}, ctx.frame, { vars: new Map(ctx.frame.vars), positional: ctx.args.slice(3), depth: ctx.frame.depth + 1 });
    try { return await sh.execSource(ctx.args[1], sub); } catch (e) {
      if (e instanceof ExitSignal) return e.code;
      if (e instanceof ParseError) { ctx.err('bash: -c: ' + e.message + '\n'); return 2; }
      throw e;
    }
  }
  const f = ctx.args.find((a) => !a.startsWith('-'));
  if (!f) {
    ctx.out('Você já está no bash! 🙂 (para executar um script: bash script.sh)\n');
    return 0;
  }
  const idx = ctx.args.indexOf(f);
  return sh.runScript(ctx.resolve(f), f, ctx.args.slice(idx + 1), ctx.frame);
};
commands.sh = commands.bash;

commands.sleep = async (ctx) => {
  const n = parseFloat((ctx.args[0] || '').replace(',', '.'));
  if (isNaN(n) || n < 0) { ctx.err("sleep: intervalo de tempo inválido '" + (ctx.args[0] || '') + "'\n"); return 1; }
  const end = Date.now() + Math.min(n, 30) * 1000;
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, Math.min(100, end - Date.now())));
    if (ctx.shell.interrupted) { ctx.shell.interrupted = false; throw new InterruptSignal(); }
  }
  return 0;
};

// Abre um arquivo no editor da interface (mode: 'nano' ou 'vi').
async function editFile(ctx, mode) {
  const name = ctx.name;
  const f = ctx.args.find((a) => !a.startsWith('-') && !a.startsWith('+'));
  if (!f) { ctx.err(name + ': informe o nome do arquivo. Exemplo: ' + name + ' script.sh\n'); return 1; }
  const io = ctx.shell.io;
  if (!io.edit) { ctx.err(name + ': editor indisponível neste ambiente\n'); return 1; }
  const abs = ctx.resolve(f);
  const node = ctx.vfs.tryLookup(abs);
  let content = '';
  if (node) {
    if (node.type === 'dir') { ctx.err(name + ": '" + f + "' é um diretório\n"); return 1; }
    try { content = ctx.vfs.readFile(abs); } catch (e) { ctx.err(name + ': ' + f + ': ' + mensagemErro(e) + '\n'); return 1; }
  } else {
    try { ctx.vfs.parentFor(abs, { needWrite: false }); } catch (e) { ctx.err(name + ': ' + f + ': ' + mensagemErro(e) + '\n'); return 1; }
  }
  const readonly = !!node && !ctx.vfs.canWrite(node);
  const save = (text) => { ctx.vfs.writeFile(abs, text); };
  try {
    await io.edit({ mode, name: f, path: abs, content, readonly, save });
  } catch (e) {
    ctx.err(name + ': ' + f + ': ' + mensagemErro(e) + '\n');
    return 1;
  }
  return 0;
}
commands.nano = (ctx) => editFile(ctx, 'nano');
commands.vi = (ctx) => editFile(ctx, 'vi');
commands.vim = commands.vi;

commands.tree = (ctx) => {
  const p = parseOpts(ctx, { flags: 'ad', values: 'L' });
  if (!p) return 1;
  const limit = p.opts.L !== undefined ? parseInt(p.opts.L, 10) : Infinity;
  const start = p.operands[0] || '.';
  const abs = ctx.resolve(start);
  let root;
  try { root = ctx.vfs.lookup(abs); } catch (e) { ctx.err(start + ' [erro ao abrir o diretório]\n'); return 1; }
  let dirs = 0;
  let files = 0;
  let out = colorName(ctx, root, start) + '\n';
  const rec = (node, prefix, depth) => {
    if (depth >= limit) return;
    if (!ctx.vfs.canRead(node)) { out += prefix + '└── [erro ao abrir o diretório]\n'; return; }
    let kids = Array.from(node.children.values()).filter((k) => p.opts.a || !k.name.startsWith('.'));
    if (p.opts.d) kids = kids.filter((k) => k.type === 'dir');
    kids.sort((a, b) => compareText(a.name, b.name));
    kids.forEach((k, i) => {
      const last = i === kids.length - 1;
      out += prefix + (last ? '└── ' : '├── ') + colorName(ctx, k, k.name) + '\n';
      if (k.type === 'dir') { dirs++; rec(k, prefix + (last ? '    ' : '│   '), depth + 1); } else files++;
    });
  };
  if (root.type === 'dir') rec(root, '', 0);
  out += '\n' + dirs + (dirs === 1 ? ' diretório' : ' diretórios') + (p.opts.d ? '' : ', ' + files + (files === 1 ? ' arquivo' : ' arquivos')) + '\n';
  ctx.out(out);
  return 0;
};

commands.file = (ctx) => {
  if (!ctx.args.length) { ctx.err('Uso: file ARQUIVO...\n'); return 1; }
  for (const f of ctx.args) {
    const node = ctx.vfs.tryLookup(ctx.resolve(f));
    let desc;
    if (!node) desc = "cannot open '" + f + "' (No such file or directory)";
    else if (node.type === 'dir') desc = 'directory';
    else if (node.device) desc = 'character special';
    else if (!ctx.vfs.canRead(node)) desc = 'regular file, no read permission';
    else if (node.exec) desc = 'ELF 64-bit LSB pie executable, x86-64, dynamically linked';
    else if (node.content === '') desc = 'empty';
    else if (/^#!.*\b(bash|sh)\b/.test(node.content)) desc = 'Bourne-Again shell script, UTF-8 text executable';
    else if (/^[\x00-\x7f]*$/.test(node.content)) desc = 'ASCII text';
    else desc = 'UTF-8 Unicode text';
    ctx.out(f + ': ' + desc + '\n');
  }
  return 0;
};

commands.base64 = (ctx) => {
  const p = parseOpts(ctx, { flags: 'dw', long: { '--decode': 'd' } });
  if (!p) return 1;
  const { inputs, failed } = readInputs(ctx, p.operands.slice(0, 1));
  if (failed) return 1;
  const data = inputs[0].content;
  if (p.opts.d) {
    try { ctx.out(base64Decode(data)); } catch (e) { ctx.err('base64: entrada inválida\n'); return 1; }
    return 0;
  }
  const enc = base64Encode(data);
  ctx.out((enc.match(/.{1,76}/g) || ['']).join('\n') + '\n');
  return 0;
};

commands.rev = (ctx) => {
  const { inputs, failed } = readInputs(ctx, ctx.args);
  for (const i of inputs) ctx.out(joinLines(splitLines(i.content).map((l) => Array.from(l).reverse().join(''))));
  return failed ? 1 : 0;
};

commands.sha256sum = (ctx) => {
  const { inputs, failed } = readInputs(ctx, ctx.args);
  for (const i of inputs) ctx.out(sha256(i.content) + '  ' + (i.stdin ? '-' : i.name) + '\n');
  return failed ? 1 : 0;
};

commands.help = (ctx) => {
  const t = ctx.isTTY;
  const h = (s) => (t ? C.byellow + s + C.reset : s);
  ctx.out([
    h('Comandos disponíveis neste simulador') + ' (use "man COMANDO" para detalhes)',
    '',
    h('Navegação:   ') + 'pwd  cd  ls  tree',
    h('Arquivos:    ') + 'touch  mkdir  rmdir  cp  mv  rm  nano  vi  file',
    h('Leitura:     ') + 'cat  less  head  tail  wc',
    h('Busca:       ') + 'grep  find',
    h('Texto:       ') + 'echo  printf  sort  uniq  cut  tr  rev  seq  base64  sha256sum',
    h('Permissões:  ') + 'chmod  whoami  id  ls -l',
    h('Sistema:     ') + 'date  uname  hostname  history  clear  man  which  type  env  sleep',
    h('Shell Script:') + ' bash  source  read  test  [ ]  if  for  while  export  exit',
    '',
    'Atalhos: Tab (completa) · ↑ ↓ (histórico) · Ctrl+C (interrompe) · Ctrl+L (limpa a tela)',
  ].join('\n') + '\n');
  if (ctx.shell.extraHelp) ctx.out(ctx.shell.extraHelp(ctx) + '\n');
  return 0;
};

// Anexa as páginas de manual (usadas por --help)
for (const name of Object.keys(commands)) {
  if (MAN[name]) commands[name].help = MAN[name];
}


const COMMAND_NAMES = Object.keys(commands);

return { breToJs, applyMode, formatDateCmd, evalTest, COMMAND_NAMES, commands };
})();

__m["m9"] = (function () {
// Monta o sistema de arquivos "base" da máquina simulada (estilo Ubuntu).

const { VFS } = __m["m4"];
const { COMMAND_NAMES } = __m["m8"];

const BIN_CONTENT = '\x7fELF\u0002\u0001\u0001\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0003\u0000>\u0000\u0001\u0000\u0000\u0000@\u0010\u0000\u0000ÿÿ ×ª¬¶§ (binário simulado)\n';

const PASSWD = `root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
syslog:x:104:110::/home/syslog:/usr/sbin/nologin
mysql:x:105:113:MySQL Server:/nonexistent:/bin/false
aluno:x:1000:1000:Aluno PinguimCorp:/home/aluno:/bin/bash
tux:x:1001:1001:Tux,,,:/home/tux:/bin/bash
admin:x:1002:1002:Administrador:/home/admin:/bin/bash
`;

const GROUP = `root:x:0:
daemon:x:1:
sudo:x:27:admin
www-data:x:33:
aluno:x:1000:
tux:x:1001:
admin:x:1002:
`;

const OS_RELEASE = `PRETTY_NAME="PinguimOS 24.04 LTS (simulador educacional)"
NAME="PinguimOS"
VERSION_ID="24.04"
ID=pinguimos
ID_LIKE=ubuntu debian
HOME_URL="https://www.kernel.org/"
`;

const BASHRC = `# ~/.bashrc: executado pelo bash em shells interativos.
# Arquivos que começam com "." são ocultos: veja com  ls -a

# histórico
HISTSIZE=1000

# atalhos (aliases) — no Linux real, funcionam após "source ~/.bashrc"
alias ll='ls -la'
alias la='ls -A'

export EDITOR=nano
`;

const SYSLOG_MSGS = [
  'systemd[1]: Started Daily apt download activities.',
  'kernel: [ 0.000000] Linux version 6.8.0-pinguim',
  'CRON[812]: (root) CMD (test -x /usr/sbin/anacron)',
  'sshd[901]: Server listening on 0.0.0.0 port 22.',
  'nginx[1022]: error: connection refused while connecting to upstream',
  'systemd[1]: Starting Cleanup of Temporary Directories...',
  'kernel: [ 12.53101] EXT4-fs (sda1): mounted filesystem',
  'app-pinguim[1500]: erro: falha ao conectar no banco de dados',
  'app-pinguim[1500]: aviso: tentativa 2 de 5',
  'app-pinguim[1500]: conectado ao banco de dados',
  'systemd[1]: Finished Cleanup of Temporary Directories.',
  'nginx[1022]: GET /index.html 200',
  'nginx[1022]: GET /admin 403',
  'kernel: [ 98.11023] usb 1-1: new high-speed USB device',
  'CRON[1730]: (aluno) CMD (/home/aluno/backup.sh)',
  'app-pinguim[1500]: ERRO: disco quase cheio (92%)',
];

const AUTH_LOG = `out 15 22:01:13 pinguimcorp sshd[3301]: Failed password for root from 203.0.113.7 port 51022 ssh2
out 15 22:01:15 pinguimcorp sshd[3301]: Failed password for root from 203.0.113.7 port 51022 ssh2
out 15 22:01:18 pinguimcorp sshd[3301]: Failed password for admin from 203.0.113.7 port 51022 ssh2
out 15 22:05:40 pinguimcorp sshd[3355]: Accepted password for tux from 198.51.100.23 port 40112 ssh2
out 15 23:10:02 pinguimcorp sudo:    admin : TTY=pts/0 ; PWD=/home/admin ; USER=root ; COMMAND=/usr/bin/apt update
out 16 07:45:11 pinguimcorp sshd[4100]: Accepted password for aluno from 192.0.2.10 port 50500 ssh2
`;

function buildSystem({ user = 'aluno', home = '/home/aluno', now = Date.now() } = {}) {
  const vfs = new VFS('root'); // monta como root e depois troca para o usuário
  const dir = (p, mode = 0o755, owner = 'root') => vfs.mkdir(p, { parents: true, mode, owner });
  const file = (p, content, mode = 0o644, owner = 'root', extra = {}) => {
    const n = vfs.writeFile(p, content, Object.assign({ mode, owner }, extra));
    n.group = owner;
    n.mtime = extra.mtime || now - 1000 * 60 * 60 * 24 * 30;
    return n;
  };

  ['/bin', '/usr/bin', '/usr/local/bin', '/usr/share', '/etc', '/var/log', '/var/www', '/opt', '/dev', '/home', '/mnt', '/media', '/srv', '/proc', '/sys', '/boot', '/lib'].forEach((d) => dir(d));
  dir('/root', 0o700);
  dir('/tmp', 0o777);

  for (const name of COMMAND_NAMES) {
    if (/^[a-z][a-z0-9]*$/.test(name)) {
      file('/usr/bin/' + name, BIN_CONTENT, 0o755, 'root', { exec: name });
      file('/bin/' + name, BIN_CONTENT, 0o755, 'root', { exec: name });
    }
  }
  file('/usr/bin/[', BIN_CONTENT, 0o755, 'root', { exec: '[' });

  const devnull = file('/dev/null', '', 0o666);
  devnull.device = 'null';

  file('/etc/passwd', PASSWD);
  file('/etc/group', GROUP);
  file('/etc/shadow', 'root:$6$y8Kq...:19700:0:99999:7:::\naluno:$6$Pz2...:19700:0:99999:7:::\n', 0o640);
  file('/etc/hostname', 'pinguimcorp\n');
  file('/etc/hosts', '127.0.0.1\tlocalhost\n127.0.1.1\tpinguimcorp\n');
  file('/etc/os-release', OS_RELEASE);
  file('/etc/shells', '# /etc/shells: shells de login válidos\n/bin/sh\n/bin/bash\n/usr/bin/bash\n');
  file('/etc/motd', 'Bem-vindo ao servidor da PinguimCorp! Use com responsabilidade.\n');
  file('/etc/resolv.conf', 'nameserver 1.1.1.1\nnameserver 8.8.8.8\n');
  file('/etc/host.conf', 'multi on\n');
  file('/etc/sysctl.conf', '# configurações do kernel\nnet.ipv4.ip_forward=0\n');
  file('/etc/adduser.conf', 'DSHELL=/bin/bash\nDHOME=/home\n');
  dir('/etc/ssh');
  file('/etc/ssh/sshd_config', 'Port 22\nPermitRootLogin no\nPasswordAuthentication yes\n');
  dir('/etc/nginx');
  file('/etc/nginx/nginx.conf', 'user www-data;\nworker_processes auto;\nhttp {\n  server { listen 80; root /var/www/html; }\n}\n');
  dir('/var/www/html');
  file('/var/www/html/index.html', '<h1>PinguimCorp</h1>\n<p>Em manutenção.</p>\n');

  const syslog = [];
  for (let i = 0; i < 60; i++) {
    const msg = SYSLOG_MSGS[(i * 7) % SYSLOG_MSGS.length];
    const h = 6 + Math.floor(i / 10);
    syslog.push('out 16 ' + String(h).padStart(2, '0') + ':' + String((i * 13) % 60).padStart(2, '0') + ':' + String((i * 29) % 60).padStart(2, '0') + ' pinguimcorp ' + msg);
  }
  file('/var/log/syslog', syslog.join('\n') + '\n', 0o644, 'root');
  file('/var/log/auth.log', AUTH_LOG, 0o640);

  // Outros usuários
  dir('/home/tux', 0o755, 'tux');
  file('/home/tux/leia.txt', 'Oi! Eu sou o Tux, o mascote do Linux. 🐧\nVocê consegue ler este arquivo porque ele tem permissão de leitura para "outros".\n', 0o644, 'tux');
  file('/home/tux/diario.txt', 'Querido diário... (você não deveria conseguir ler isto)\n', 0o600, 'tux');
  dir('/home/admin', 0o700, 'admin');
  file('/root/segredo.txt', 'Só o root lê isto.\n', 0o600);

  // Home do aluno
  dir(home, 0o755, user);
  file(home + '/.bashrc', BASHRC, 0o644, user);
  file(home + '/.profile', '# ~/.profile\nif [ -f ~/.bashrc ]; then . ~/.bashrc; fi\n', 0o644, user);
  dir(home + '/Documentos', 0o755, user);
  file(home + '/Documentos/notas.txt', 'Linux é um kernel.\nO shell interpreta comandos.\nO terminal é a janela.\n', 0o644, user);
  file(home + '/Documentos/compras.txt', 'banana\nmaçã\nleite\nbanana\npão\nleite\nbanana\ncafé\n', 0o644, user);
  file(home + '/Documentos/numeros.txt', '10\n2\n33\n7\n100\n25\n', 0o644, user);
  dir(home + '/Downloads', 0o755, user);
  for (const f of ['foto_praia.jpg', 'foto_festa.jpg', 'trabalho_final.pdf', 'musica.mp3', 'relatorio.txt', 'instalar.sh']) {
    file(home + '/Downloads/' + f, f.endsWith('.txt') ? 'Relatório de vendas — Q3\nTotal: 42 pinguins\n' : f.endsWith('.sh') ? '#!/bin/bash\necho "Instalando..."\n' : 'conteúdo binário de ' + f + '\n', 0o644, user);
  }
  dir(home + '/Imagens', 0o755, user);

  // Ajusta donos/grupos dos diretórios criados com mkdir -p
  vfs.walk('/', (n) => { if (!n.group || n.group === 'root') n.group = n.owner; });
  vfs.user = user;
  return vfs;
}

return { buildSystem };
})();

__m["m10"] = (function () {
// Dados do diagrama interativo "As camadas do Linux".

const LAYERS = [
  {
    id: 'user', name: 'Você', sub: 'o usuário', icon: 'i-user', space: 'user',
    desc: 'É quem dá as ordens. Você digita comandos no terminal (ou clica em ícones numa interface gráfica).',
    examples: ['digitar ls -l', 'rodar um script', 'abrir o navegador'],
  },
  {
    id: 'shell', name: 'Shell', sub: 'bash · zsh · sh', icon: 'i-shell', space: 'user',
    desc: 'O intérprete de comandos. Lê o que você digitou, expande variáveis e curingas (*.txt), e chama o programa certo.',
    examples: ['separa comando e opções', 'expande $USER e *.txt', 'liga programas com |'],
  },
  {
    id: 'apps', name: 'Programas', sub: 'ls · grep · cat · navegador', icon: 'i-apps', space: 'user',
    desc: 'Cada comando é um programa (fica em /usr/bin). Programas não mexem direto no hardware: eles pedem ao kernel por meio de chamadas de sistema.',
    examples: ['/usr/bin/ls', '/usr/bin/grep', 'firefox, python, docker'],
  },
  {
    id: 'kernel', name: 'Kernel', sub: 'o núcleo do Linux', icon: 'i-chip', space: 'kernel',
    desc: 'O coração do sistema. Gerencia processos, memória, sistema de arquivos, permissões, rede e os drivers de cada dispositivo.',
    examples: ['agenda os processos', 'confere permissões', 'drivers: disco, rede, USB'],
  },
  {
    id: 'hw', name: 'Hardware', sub: 'CPU · RAM · disco · rede', icon: 'i-drive', space: 'hw',
    desc: 'A parte física: processador, memória, disco, placa de rede. Só o kernel conversa diretamente com ela.',
    examples: ['CPU executa instruções', 'SSD guarda os arquivos', 'placa de rede'],
  },
];

// Jornada de um comando: o que acontece quando você digita "ls -l".
const JOURNEY = [
  { layer: 'user', dir: 'down', text: 'Você digita <code>ls -l</code> no terminal e aperta Enter.' },
  { layer: 'shell', dir: 'down', text: 'O <b>shell</b> lê a linha, separa o comando (<code>ls</code>) da opção (<code>-l</code>) e encontra o programa <code>/usr/bin/ls</code>.' },
  { layer: 'apps', dir: 'down', text: 'O programa <b>ls</b> começa a rodar. Para ler o diretório, ele faz uma <b>chamada de sistema</b> (system call) ao kernel.' },
  { layer: 'kernel', dir: 'down', text: 'O <b>kernel</b> confere suas <b>permissões</b>, consulta o sistema de arquivos e aciona o driver do disco.' },
  { layer: 'hw', dir: 'down', text: 'O <b>disco</b> entrega os dados pedidos.' },
  { layer: 'kernel', dir: 'up', text: 'O kernel devolve a lista de arquivos para o <code>ls</code>.' },
  { layer: 'apps', dir: 'up', text: 'O <code>ls</code> formata o resultado: permissões, dono, tamanho e data.' },
  { layer: 'user', dir: 'up', text: 'O resultado aparece no seu terminal. Tudo isso em poucos <b>milissegundos</b>!' },
];

return { LAYERS, JOURNEY };
})();

__m["m11"] = (function () {
// Funções puras dos slides (sem DOM) — testadas em tests/deck.test.js.

function clampIndex(i, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(total - 1, i | 0));
}

// "#/5" ou "#5" → índice 4 (slides numerados a partir de 1 na URL)
function parseHash(hash, total) {
  const m = /^#\/?(\d+)$/.exec(hash || '');
  if (!m) return 0;
  return clampIndex(parseInt(m[1], 10) - 1, total);
}

function formatTime(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

// Texto a copiar de um bloco de código: remove o prompt "$ " do início das linhas.
function copyText(code) {
  return code.split('\n').map((l) => l.replace(/^\$ /, '')).join('\n').replace(/\n+$/, '');
}

// Separa um bloco "$ cmd" em comandos. Linhas sem "$ " continuam o comando anterior.
function splitCommands(text) {
  const cmds = [];
  for (const line of text.replace(/\r/g, '').split('\n')) {
    if (line.startsWith('$ ')) cmds.push(line.slice(2));
    else if (cmds.length && line.trim() !== '') cmds[cmds.length - 1] += '\n' + line;
  }
  return cmds;
}

// ---------- sumário ----------
// items: [{ title, group?, tags? }] na ordem dos slides. Um item com "group" abre uma nova seção.
function buildToc(items, firstGroup = 'Abertura') {
  const groups = [];
  items.forEach((it, index) => {
    if (it.group || !groups.length) groups.push({ name: it.group || firstGroup, slides: [] });
    groups[groups.length - 1].slides.push({ index, title: it.title, tags: it.tags || [] });
  });
  return groups;
}

function norm(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Filtra o sumário por texto (sem acentos) ou número do slide. Remove seções vazias.
function filterToc(groups, query) {
  const q = norm(query).trim();
  if (!q) return groups;
  const num = /^\d+$/.test(q) ? parseInt(q, 10) : null;
  return groups
    .map((g) => ({
      name: g.name,
      slides: g.slides.filter((s) => (num !== null ? String(s.index + 1).startsWith(q) : norm(s.title).includes(q) || norm(g.name).includes(q) || s.tags.some((t) => norm(t).includes(q)))),
    }))
    .filter((g) => g.slides.length);
}

// Número digitado no campo de busca → índice do slide (ou -1)
function tocJump(query, total) {
  const q = String(query).trim();
  if (!/^\d+$/.test(q)) return -1;
  const n = parseInt(q, 10);
  return n >= 1 && n <= total ? n - 1 : -1;
}

// ---------- navegação por passos ----------
// states: [{ step, total }] dos componentes do slide, na ordem do documento.
// Retorna o índice do componente que deve avançar, ou -1 (ir para o próximo slide).
function navNext(states) {
  return states.findIndex((s) => s.step < s.total);
}
// Retorna o índice do componente que deve voltar, ou -1 (ir para o slide anterior).
function navPrev(states) {
  for (let i = states.length - 1; i >= 0; i--) if (states[i].step > 0) return i;
  return -1;
}

// ---------- permissões ----------
// bits: array de 9 booleanos [r,w,x do dono, r,w,x do grupo, r,w,x dos outros]
function permString(bits) {
  return '-' + bits.map((b, i) => (b ? 'rwx'[i % 3] : '-')).join('');
}
function permOctal(bits) {
  let out = '';
  for (let g = 0; g < 3; g++) out += String((bits[g * 3] ? 4 : 0) + (bits[g * 3 + 1] ? 2 : 0) + (bits[g * 3 + 2] ? 1 : 0));
  return out;
}
function octalToBits(oct) {
  const bits = [];
  for (const ch of String(oct).padStart(3, '0').slice(-3)) {
    const n = parseInt(ch, 8) || 0;
    bits.push(!!(n & 4), !!(n & 2), !!(n & 1));
  }
  return bits;
}

// ---------- HTML ----------
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const FG = { 30: 'k', 31: 'r', 32: 'g', 33: 'y', 34: 'b', 35: 'm', 36: 'c', 37: 'w', 90: 'gray', 91: 'r', 92: 'g', 93: 'y', 94: 'b', 95: 'm', 96: 'c', 97: 'w' };

// Converte a saída do terminal (com códigos de cor ANSI) em HTML seguro.
function ansiToHtml(text) {
  let out = '';
  let bold = false;
  let fg = null;
  const re = /\x1b\[([0-9;]*)m/g;
  let last = 0;
  let m;
  const emit = (t) => {
    if (!t) return;
    if (bold || fg) {
      out += '<span class="' + [bold ? 'b' : '', fg ? 'c-' + fg : ''].filter(Boolean).join(' ') + '">' + escapeHtml(t) + '</span>';
    } else out += escapeHtml(t);
  };
  while ((m = re.exec(text))) {
    emit(text.slice(last, m.index));
    const codes = m[1] === '' ? [0] : m[1].split(';').map(Number);
    for (const c of codes) {
      if (c === 0) { bold = false; fg = null; }
      else if (c === 1) bold = true;
      else if (c === 22) bold = false;
      else if (c === 39) fg = null;
      else if (FG[c]) fg = FG[c];
    }
    last = re.lastIndex;
  }
  emit(text.slice(last));
  return out;
}

const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'fi', 'for', 'in', 'do', 'done', 'while', 'until', 'exit', 'break', 'continue', 'case', 'esac', 'function', 'return']);

// Realce de sintaxe simples para bash. Retorna HTML.
function highlightBash(src) {
  let out = '';
  let i = 0;
  let lineStart = true;
  const span = (cls, text) => '<span class="hl-' + cls + '">' + escapeHtml(text) + '</span>';
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\n') { out += '\n'; i++; lineStart = true; continue; }
    if (lineStart && src.startsWith('$ ', i)) { out += span('prompt', '$ '); i += 2; lineStart = false; continue; }
    if (ch === '#' && (i === 0 || /\s/.test(src[i - 1]))) {
      let j = src.indexOf('\n', i);
      if (j === -1) j = src.length;
      out += span('comment', src.slice(i, j));
      i = j;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== ch) { if (src[j] === '\\' && ch === '"') j++; j++; }
      const str = src.slice(i, j + 1);
      if (ch === '"') {
        out += '<span class="hl-string">' + escapeHtml(str).replace(/\$(\{[^}]*\}|\(\(?|[A-Za-z_][A-Za-z0-9_]*|[0-9#?@$])/g, (mm) => '<span class="hl-var">' + mm + '</span>') + '</span>';
      } else out += span('string', str);
      i = j + 1;
      lineStart = false;
      continue;
    }
    if (ch === '$') {
      const mm = /^\$(\{[^}]*\}|\(\(?|[A-Za-z_][A-Za-z0-9_]*|[0-9#?@$])/.exec(src.slice(i));
      if (mm) { out += span('var', mm[0]); i += mm[0].length; lineStart = false; continue; }
    }
    if (/[A-Za-z_]/.test(ch)) {
      const w = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(src.slice(i))[0];
      const prev = src[i - 1];
      if (KEYWORDS.has(w) && (prev === undefined || /[\s;]/.test(prev))) out += span('kw', w);
      else out += escapeHtml(w);
      i += w.length;
      lineStart = false;
      continue;
    }
    if (ch === '|' || ch === '>' || ch === '<' || ch === '&' || ch === ';') {
      out += span('op', ch);
      i++;
      lineStart = false;
      continue;
    }
    out += escapeHtml(ch);
    if (!/\s/.test(ch)) lineStart = false;
    i++;
  }
  return out;
}

return { clampIndex, parseHash, formatTime, copyText, splitCommands, buildToc, filterToc, tocJump, navNext, navPrev, permString, permOctal, octalToBits, escapeHtml, ansiToHtml, highlightBash };
})();

__m["m12"] = (function () {
// Lógica pura dos visuais da página de preparação (testada em tests/preparacao.test.js).

const { tokenize } = __m["m3"];

// Como o shell separa uma linha em palavras (usa o parser de verdade do simulador).
function splitWords(line) {
  return tokenize(line)
    .filter((t) => t.t === 'word')
    .map((t) => t.segs.map((s) => (s.type === 'lit' ? s.text : '$' + s.name)).join(''));
}

// Passo a passo de como o shell encontra o programa de um comando.
// exists(caminho) → true se o arquivo existe. Retorna [{ dir, path, found }] e o resultado final.
function resolveSteps(cmd, pathDirs, exists, cwd) {
  if (cmd.includes('/')) {
    const full = cmd.startsWith('/') ? cmd : (cwd.replace(/\/$/, '') + '/' + cmd.replace(/^\.\//, ''));
    const found = exists(full);
    return { direct: true, steps: [{ dir: cmd.startsWith('./') ? '. (pasta atual)' : '', path: full, found }], result: found ? full : null };
  }
  const steps = [];
  for (const dir of pathDirs) {
    const full = dir.replace(/\/$/, '') + '/' + cmd;
    const found = exists(full);
    steps.push({ dir, path: full, found });
    if (found) return { direct: false, steps, result: full };
  }
  return { direct: false, steps, result: null };
}

// Para onde vão a saída (stdout) e os erros (stderr) em cada cenário do diagrama.
const STREAM_SCENARIOS = {
  padrao: { cmd: 'ls /etc /nao_existe', stdout: 'tela', stderr: 'tela', note: 'Sem redirecionamento, a saída e os erros vão para a tela.' },
  arquivo: { cmd: 'ls /etc /nao_existe > lista.txt', stdout: 'arquivo lista.txt', stderr: 'tela', note: 'O > desvia só a saída. O erro continua aparecendo na tela.' },
  erros: { cmd: 'ls /etc /nao_existe 2> erros.txt', stdout: 'tela', stderr: 'arquivo erros.txt', note: 'O 2> desvia só os erros (o canal 2).' },
  pipe: { cmd: 'ls /etc | wc -l', stdout: 'programa wc', stderr: 'tela', note: 'O | entrega a saída de um programa como entrada do próximo.' },
};

function streamRoute(name) {
  const s = STREAM_SCENARIOS[name];
  if (!s) throw new Error('cenário desconhecido: ' + name);
  return s;
}

return { splitWords, resolveSteps, STREAM_SCENARIOS, streamRoute };
})();

__m["m13"] = (function () {
// Conteúdo de apoio da página de preparação: glossário e arquivos de exemplo do terminal.

const GLOSSARIO = {
  sublinhadas: ['Assim!', 'Toque de novo (ou em outro lugar) para fechar.'],
  kernel: ['Kernel:', 'o núcleo do sistema operacional. Controla o hardware, a memória, os processos e as permissões.'],
  shell: ['Shell:', 'o programa que lê o que você digita e executa os comandos. No Linux, normalmente é o bash.'],
  raiz: ['Raiz:', 'o diretório /, o topo da árvore. Todos os arquivos e pastas ficam dentro dele.'],
  home: ['Home:', 'sua pasta pessoal (/home/seu-usuario). O atalho ~ sempre leva até ela.'],
  argumento: ['Argumento:', 'cada palavra que vem depois do comando. Diz sobre o que ele vai agir, como um arquivo ou uma pasta.'],
  opcao: ['Opção:', 'um argumento que começa com - e muda o jeito de o comando funcionar. Exemplo: o -l em ls -l.'],
  path: ['PATH:', 'a lista de pastas onde o shell procura os programas. Veja a sua com: echo $PATH'],
  stdin: ['stdin (0):', 'a entrada padrão, de onde o programa lê. Normalmente é o teclado, ou o que chega por um pipe.'],
  stdout: ['stdout (1):', 'a saída padrão, onde o programa escreve os resultados. Normalmente vai para a tela.'],
  stderr: ['stderr (2):', 'o canal de erros. Também vai para a tela, mas é separado da saída normal.'],
  codigo: ['Código de saída:', 'o número que todo comando devolve ao terminar: 0 é sucesso, qualquer outro valor é erro. Fica em $?'],
  root: ['root:', 'o administrador do sistema, que pode tudo. O sudo executa um comando como root.'],
};

// Arquivos usados pelos exemplos dos terminais da página.
function setupPrepFiles(vfs, home) {
  vfs.writeFile(home + '/meu arquivo.txt', 'Este arquivo tem um espaço no nome.\nPara o shell, "meu arquivo.txt" (com aspas) é uma palavra só.\n');
  vfs.writeFile(home + '/ola.sh', '#!/bin/bash\necho "Olá, $USER! Você rodou um script da pasta atual."\n', { mode: 0o755 });
}

return { GLOSSARIO, setupPrepFiles };
})();

__m["m14"] = (function () {
// Página de preparação pré-aula: visuais interativos + terminais simulados embutidos.
// Nada é salvo: sem progresso, sem respostas, sem cadastro.

const { Terminal } = __m["m2"];
const { Shell } = __m["m6"];
const { commands } = __m["m8"];
const { buildSystem } = __m["m9"];
const { C } = __m["m5"];
const { LAYERS, JOURNEY } = __m["m10"];
const { permString, permOctal, octalToBits, escapeHtml } = __m["m11"];
const { splitWords, resolveSteps, STREAM_SCENARIOS, streamRoute } = __m["m12"];
const { GLOSSARIO, setupPrepFiles } = __m["m13"];

const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, REDUCED ? 0 : ms));
const $ = (sel, root = document) => root.querySelector(sel);
const icon = (name) => '<svg class="i" aria-hidden="true"><use href="#' + name + '"/></svg>';

// ---------- máquina simulada compartilhada pelos terminais da página ----------
const vfs = buildSystem();
setupPrepFiles(vfs, '/home/aluno');

function mountTerminal(host) {
  const cmds = host.dataset.cmds.split('||');
  host.innerHTML =
    '<div class="mt-chrome" aria-hidden="true"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span>Experimente: toque num comando e aperte Enter</span></div>' +
    '<div class="mt-chips"></div>' +
    '<div class="mt-holder"><div class="mt-term"></div></div>';
  const chips = $('.mt-chips', host);
  const term = new Terminal($('.mt-term', host), {
    onTab: (line) => shell.complete(line),
    onInterrupt: () => shell.interrupt(),
  });
  const io = {
    write: (s) => term.write(s),
    writeErr: (s) => term.write(s),
    readLine: (p) => term.readLine(p, { history: false }),
    edit: (opts) => term.edit(opts),
    clear: () => term.clear(),
    get columns() { return term.columns; },
  };
  const shell = new Shell({ vfs, io, commands });
  shell.history = term.history;
  for (const c of cmds) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mt-chip';
    b.textContent = c;
    b.addEventListener('click', () => { term.setInput(c); term.focus(); });
    chips.append(b);
  }
  term.write(C.gray + 'Terminal simulado. Os comandos funcionam como no Linux de verdade.' + C.reset + '\n');
  (async () => {
    while (true) {
      let src = await term.readLine(shell.prompt());
      if (src === null) continue;
      while (shell.isIncomplete(src)) {
        const more = await term.readLine('> ', { history: false });
        if (more === null) { src = null; break; }
        src += '\n' + more;
      }
      if (src === null || !src.trim()) continue;
      await shell.run(src, { history: false });
    }
  })();
}

// ---------- diagrama das camadas ----------
function mountLayers(host) {
  let step = 0;
  host.innerHTML =
    '<div class="ly-stack">' + LAYERS.map((l) =>
      '<button type="button" class="ly ly-' + l.id + '" data-id="' + l.id + '">' + icon(l.icon) +
      '<span><b>' + l.name + '</b><small>' + l.sub + '</small></span></button>' +
      (l.id === 'apps' ? '<div class="ly-sys"><span>chamadas de sistema</span></div>' : '')).join('') +
      '<div class="ly-token" aria-hidden="true">ls -l</div>' +
    '</div>' +
    '<div class="ly-side"><div class="ly-panel" aria-live="polite"></div>' +
    '<div class="ctrl"><button type="button" data-act="prev">‹ Voltar</button><span class="ctrl-n"></span><button type="button" data-act="next" class="primary">Próximo passo ›</button></div></div>';
  const panel = $('.ly-panel', host);
  const token = $('.ly-token', host);
  const render = (pickId) => {
    const btns = host.querySelectorAll('.ly');
    btns.forEach((b) => b.classList.remove('active', 'visited', 'picked'));
    if (pickId) {
      const l = LAYERS.find((x) => x.id === pickId);
      host.querySelector('.ly-' + pickId).classList.add('picked');
      panel.innerHTML = '<small class="ly-k">Camada</small><h3>' + l.name + '</h3><p>' + l.desc + '</p>';
    } else if (step === 0) {
      token.classList.remove('show');
      panel.innerHTML = '<small class="ly-k">O caminho de um comando</small><h3>Do teclado ao disco</h3><p>Toque em <b>Próximo passo</b> para seguir o <code>ls -l</code> descendo pelas camadas e voltando com a resposta. Ou toque numa camada para saber o que ela faz.</p>';
    } else {
      const j = JOURNEY[step - 1];
      const seen = new Set(JOURNEY.slice(0, step).map((x) => x.layer));
      btns.forEach((b) => { if (seen.has(b.dataset.id)) b.classList.add('visited'); if (b.dataset.id === j.layer) b.classList.add('active'); });
      const t = host.querySelector('.ly-' + j.layer);
      token.style.transform = 'translateY(' + (t.offsetTop + t.offsetHeight / 2) + 'px)';
      token.textContent = j.dir === 'up' ? (j.layer === 'user' ? 'resultado' : 'dados') : 'ls -l';
      token.classList.toggle('up', j.dir === 'up');
      token.classList.add('show');
      panel.innerHTML = '<small class="ly-k">Passo ' + step + ' de ' + JOURNEY.length + (j.dir === 'up' ? ' · subindo' : ' · descendo') + '</small><p>' + j.text + '</p>';
    }
    panel.classList.remove('swap'); void panel.offsetWidth; panel.classList.add('swap');
    $('.ctrl-n', host).textContent = step + '/' + JOURNEY.length;
    $('[data-act="prev"]', host).disabled = step === 0;
    $('[data-act="next"]', host).textContent = step >= JOURNEY.length ? 'Recomeçar ↺' : 'Próximo passo ›';
  };
  host.addEventListener('click', (e) => {
    const ly = e.target.closest('.ly');
    if (ly) { render(ly.dataset.id); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'next') step = step >= JOURNEY.length ? 0 : step + 1;
    else step = Math.max(0, step - 1);
    render();
  });
  render();
}

// ---------- como o shell separa as palavras ----------
function mountSplit(host) {
  const presets = ['cat meu arquivo.txt', 'cat "meu arquivo.txt"', 'ls -l /etc', 'cp "foto 1.jpg" fotos/'];
  host.innerHTML =
    '<label class="sp-label" for="sp-in">Digite uma linha de comando:</label>' +
    '<input id="sp-in" class="sp-in" spellcheck="false" autocomplete="off" autocapitalize="off">' +
    '<div class="sp-presets">' + presets.map((p) => '<button type="button">' + escapeHtml(p) + '</button>').join('') + '</div>' +
    '<div class="sp-words" aria-live="polite"></div><p class="sp-note"></p>';
  const input = $('.sp-in', host);
  const out = $('.sp-words', host);
  const note = $('.sp-note', host);
  const render = () => {
    let words;
    try { words = splitWords(input.value); } catch (e) { out.innerHTML = ''; note.textContent = 'Aspas abertas e não fechadas: o shell ficaria esperando o resto da linha.'; return; }
    out.innerHTML = words.map((w, i) => '<span class="sp-w' + (i === 0 ? ' cmd' : w.startsWith('-') ? ' opt' : '') + '" style="--i:' + i + '"><small>' + (i === 0 ? 'comando' : w.startsWith('-') ? 'opção' : 'argumento ' + i) + '</small>' + escapeHtml(w) + '</span>').join('');
    const args = Math.max(0, words.length - 1);
    note.textContent = words.length ? 'O shell entrega ao programa "' + words[0] + '" ' + args + (args === 1 ? ' argumento.' : ' argumentos.') + (words.some((w) => w.includes(' ')) ? ' As aspas mantiveram o espaço dentro de um argumento só.' : '') : '';
  };
  input.value = presets[0];
  input.addEventListener('input', render);
  host.querySelectorAll('.sp-presets button').forEach((b, i) => b.addEventListener('click', () => { input.value = presets[i]; render(); }));
  render();
}

// ---------- como o shell encontra o programa ----------
function mountPath(host) {
  const PATH = ['/usr/local/bin', '/usr/bin', '/bin'];
  const cases = ['ls', 'ola.sh', './ola.sh', 'LS'];
  host.innerHTML =
    '<div class="pa-top"><span>Você digitou:</span>' + cases.map((c) => '<button type="button" data-c="' + c + '">' + c + '</button>').join('') + '</div>' +
    '<div class="pa-steps" aria-live="polite"></div><p class="pa-result"></p>';
  const stepsEl = $('.pa-steps', host);
  const result = $('.pa-result', host);
  let run = 0;
  const play = async (cmd) => {
    const my = ++run;
    host.querySelectorAll('.pa-top button').forEach((b) => b.classList.toggle('on', b.dataset.c === cmd));
    const r = resolveSteps(cmd, PATH, (p) => { const n = vfs.tryLookup(p); return !!n && n.type === 'file'; }, '/home/aluno');
    stepsEl.innerHTML = '';
    result.textContent = '';
    result.className = 'pa-result';
    if (r.direct) {
      stepsEl.innerHTML = '<div class="pa-s info">Tem uma <code>/</code> no nome: o shell <b>não</b> consulta o PATH e vai direto ao caminho indicado.</div>';
      await sleep(500);
    }
    for (const s of r.steps) {
      if (my !== run) return;
      const row = document.createElement('div');
      row.className = 'pa-s';
      row.innerHTML = '<span class="pa-dir">' + escapeHtml(s.dir || s.path) + '</span><span class="pa-q">procurando…</span>';
      stepsEl.append(row);
      await sleep(550);
      if (my !== run) return;
      row.classList.add(s.found ? 'found' : 'miss');
      row.querySelector('.pa-q').innerHTML = s.found ? '✓ achei <code>' + escapeHtml(s.path) + '</code>' : '✗ não está aqui';
    }
    await sleep(250);
    if (my !== run) return;
    if (r.result) { result.innerHTML = '▶ Executa <code>' + escapeHtml(r.result) + '</code>'; result.classList.add('ok'); }
    else {
      result.innerHTML = '<code>' + escapeHtml(cmd) + ': comando não encontrado</code>' +
        (cmd === 'ola.sh' ? ' · o arquivo existe na sua pasta, mas ela não está no PATH. Use <code>./ola.sh</code>.' : cmd === 'LS' ? ' · para o Linux, <code>LS</code> e <code>ls</code> são nomes diferentes.' : '');
      result.classList.add('err');
    }
  };
  host.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b) play(b.dataset.c); });
  play('ls');
}

// ---------- entrada, saída e erros ----------
function mountStreams(host) {
  const labels = { padrao: 'Sem redirecionar', arquivo: 'Saída para arquivo  >', erros: 'Erros para arquivo  2>', pipe: 'Ligar a outro programa  |' };
  host.innerHTML =
    '<div class="st-tabs">' + Object.keys(STREAM_SCENARIOS).map((k) => '<button type="button" data-s="' + k + '">' + escapeHtml(labels[k]) + '</button>').join('') + '</div>' +
    '<div class="st-cmd"><span class="st-p">$</span> <code></code></div>' +
    '<div class="st-diagram">' +
      '<div class="st-node st-in"><small>stdin (0)</small>teclado</div>' +
      '<div class="st-pipe st-pin"><i></i><i></i></div>' +
      '<div class="st-node st-prog"><small>programa</small><b>ls</b></div>' +
      '<div class="st-lanes">' +
        '<div class="st-lane out"><span class="st-tag">stdout (1)</span><div class="st-pipe"><i></i><i></i><i></i></div><div class="st-dest"></div></div>' +
        '<div class="st-lane err"><span class="st-tag">stderr (2)</span><div class="st-pipe"><i></i><i></i><i></i></div><div class="st-dest"></div></div>' +
      '</div>' +
    '</div>' +
    '<p class="st-note" aria-live="polite"></p>';
  const show = (name) => {
    const s = streamRoute(name);
    host.querySelectorAll('.st-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.s === name));
    $('.st-cmd code', host).textContent = s.cmd;
    const dest = (lane, where) => {
      const el = $('.st-lane.' + lane + ' .st-dest', host);
      el.className = 'st-dest ' + (where.startsWith('tela') ? 'screen' : where.startsWith('arquivo') ? 'file' : 'prog');
      el.textContent = where;
      el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    };
    dest('out', s.stdout);
    dest('err', s.stderr);
    $('.st-note', host).textContent = s.note;
  };
  host.addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b) show(b.dataset.s); });
  show('padrao');
}

// ---------- permissões (opcional) ----------
function mountPerm(host) {
  const bits = octalToBits(host.dataset.initial || '754');
  const groups = ['dono', 'grupo', 'outros'];
  host.innerHTML = '<div class="pm-groups">' + groups.map((g, gi) =>
    '<div class="pm-g pm-' + gi + '"><small>' + g + '</small><div>' +
    ['r', 'w', 'x'].map((b, bi) => '<button type="button" data-i="' + (gi * 3 + bi) + '" aria-label="' + g + ' ' + { r: 'ler', w: 'escrever', x: 'executar' }[b] + '"><b>' + b + '</b><small>' + [4, 2, 1][bi] + '</small></button>').join('') +
    '</div><span class="pm-sum"></span></div>').join('') + '</div><div class="pm-out"><code class="pm-str"></code><code class="pm-cmd"></code></div>';
  const render = () => {
    host.querySelectorAll('[data-i]').forEach((b, i) => { b.classList.toggle('on', bits[i]); b.setAttribute('aria-pressed', String(bits[i])); });
    const oct = permOctal(bits);
    host.querySelectorAll('.pm-g').forEach((g, gi) => {
      const parts = [4, 2, 1].filter((v, bi) => bits[gi * 3 + bi]);
      $('.pm-sum', g).textContent = (parts.length ? parts.join('+') : '0') + ' = ' + oct[gi];
    });
    $('.pm-str', host).textContent = permString(bits);
    $('.pm-cmd', host).textContent = 'chmod ' + oct + ' arquivo';
  };
  host.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) { bits[+b.dataset.i] = !bits[+b.dataset.i]; render(); } });
  render();
}

// ---------- glossário em balões ----------
function setupGlossary() {
  const box = $('#gloss');
  let current = null;
  const hide = () => { box.hidden = true; if (current) current.setAttribute('aria-expanded', 'false'); current = null; };
  document.addEventListener('click', (e) => {
    const g = e.target.closest('.g');
    if (!g) { if (!e.target.closest('#gloss')) hide(); return; }
    if (current === g) { hide(); return; }
    const def = GLOSSARIO[g.dataset.g];
    if (!def) return;
    current = g;
    g.setAttribute('aria-expanded', 'true');
    box.innerHTML = '<b>' + escapeHtml(def[0]) + '</b> ' + escapeHtml(def[1]);
    box.hidden = false;
    const r = g.getBoundingClientRect();
    const w = Math.min(300, window.innerWidth - 24);
    box.style.width = w + 'px';
    box.style.left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2)) + 'px';
    box.style.top = (r.bottom + window.scrollY + 8) + 'px';
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  window.addEventListener('resize', hide);
  for (const g of document.querySelectorAll('.g')) { g.setAttribute('aria-expanded', 'false'); g.setAttribute('aria-controls', 'gloss'); }
}

// ---------- revelação ao rolar e destaque do tema atual ----------
function setupScroll() {
  const items = document.querySelectorAll('.reveal');
  if (REDUCED || typeof IntersectionObserver !== 'function') { items.forEach((el) => el.classList.add('in')); }
  else {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    }, { rootMargin: '0px 0px -8% 0px' });
    items.forEach((el) => io.observe(el));
  }
  const links = document.querySelectorAll('[data-spy]');
  if (typeof IntersectionObserver === 'function') {
    const spy = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) links.forEach((a) => a.classList.toggle('on', a.dataset.spy === en.target.id));
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('.topic[id]').forEach((s) => spy.observe(s));
  }
}

document.querySelectorAll('.v-layers').forEach(mountLayers);
document.querySelectorAll('.v-split').forEach(mountSplit);
document.querySelectorAll('.v-path').forEach(mountPath);
document.querySelectorAll('.v-streams').forEach(mountStreams);
document.querySelectorAll('.v-perm').forEach(mountPerm);
document.querySelectorAll('.mini-term').forEach(mountTerminal);
setupGlossary();
setupScroll();

return {  };
})();
})();
