#!/usr/bin/env node
/**
 * 包装 `expo start`：在 dev server 就绪前显示 spinner / 进度信息。
 *
 * 用法（参数原样转发给 expo start）：
 *   pnpm start --dev-client --clear
 *
 * - 注入 expo-tty-preload 让 Expo 认为 stdout 是 TTY，保留二维码和交互界面；
 * - 过滤 Metro 逐条刷屏的打包进度行，改成单行 spinner 展示百分比；
 * - 就绪后原样透传其余输出。
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const expoCli = path.join(ROOT, 'node_modules', 'expo', 'bin', 'cli');
const ttyPreload = path.join(__dirname, 'expo-tty-preload.js');

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const READY_RE = /Waiting on https?:\/\/\S+|Logs for your project will appear/;
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1B\[[0-9;?]*[\x20-\x2F]*[\x40-\x7E]/g;
const PROGRESS_RE = /(\d+(?:\.\d+)?)%\s*\(\s*(\d+)\s*\/\s*(\d+)\s*\)/;

// Expo 在等键盘输入（例如端口被占用时问 "Use port 8082 instead?"）时不会再输出，
// 缓冲会导致问句永远看不见，所以静默超过这个时长就把缓冲直接刷出去。
const QUIET_FLUSH_MS = 600;

const startedAt = Date.now();
const canAnimate = Boolean(process.stdout.isTTY);
const pending = { stdout: '', stderr: '' };
const lineBuf = { stdout: '', stderr: '' };

let ready = false;
let exited = false;
let suppress = canAnimate;
let lastDataAt = Date.now();
let isBundling = false;
let frame = 0;
let stage = '正在启动 Expo 开发服务器';
let timer = null;

const child = spawn(process.execPath, ['-r', ttyPreload, expoCli, 'start', ...args], {
  cwd: ROOT,
  stdio: ['inherit', 'pipe', 'pipe'],
});

function elapsed() {
  return ((Date.now() - startedAt) / 1000).toFixed(1);
}

function updateStage(text) {
  if (isBundling) return;
  if (/Starting Metro Bundler/i.test(text)) stage = '正在启动 Metro Bundler';
  else if (/cache is empty|rebuilding/i.test(text)) stage = '缓存为空，正在重建依赖图';
}

function render() {
  flushIfIdle();
  // 已因等待键盘输入停掉 spinner，不能再画，否则会盖掉提问
  if (!timer) return;
  const prefix = isBundling ? '[打包]' : '[启动]';
  if (canAnimate) {
    process.stdout.write(`\r\x1B[2K${FRAMES[frame++ % FRAMES.length]} ${prefix} ${stage} · ${elapsed()}s`);
  } else {
    process.stdout.write(`${prefix} ${stage} · 已等待 ${elapsed()}s\n`);
  }
}

/**
 * 缓冲期间如果子进程静默了，说明它在等输入，立刻把已缓冲的内容显示出来。
 * 半行输出（交互提问通常不带换行）还要停掉 spinner，否则每帧重画会把它擦掉。
 */
function flushIfIdle() {
  if (ready) return;
  if (Date.now() - lastDataAt < QUIET_FLUSH_MS) return;
  if (!pending.stdout && !pending.stderr && !lineBuf.stdout && !lineBuf.stderr) return;

  const hasPartial = Boolean(lineBuf.stdout || lineBuf.stderr);
  if (hasPartial) stopSpinner();
  if (canAnimate) process.stdout.write('\r\x1B[2K');

  if (suppress) {
    suppress = false;
    if (pending.stdout) process.stdout.write(pending.stdout);
    if (pending.stderr) process.stderr.write(pending.stderr);
    pending.stdout = '';
    pending.stderr = '';
  }
  if (lineBuf.stdout) {
    process.stdout.write(lineBuf.stdout);
    lineBuf.stdout = '';
  }
  if (lineBuf.stderr) {
    process.stderr.write(lineBuf.stderr);
    lineBuf.stderr = '';
  }
}

function startSpinner() {
  if (timer) return;
  timer = setInterval(render, canAnimate ? 80 : 3000);
  render();
}

function stopSpinner() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  if (canAnimate) process.stdout.write('\r\x1B[2K');
}

function markReady() {
  if (ready) return;
  ready = true;
  stopSpinner();
  if (canAnimate) {
    process.stdout.write(pending.stdout);
    process.stderr.write(pending.stderr);
  } else {
    process.stdout.write(`[启动] 开发服务器已就绪 · 耗时 ${elapsed()}s\n`);
  }
  pending.stdout = '';
  pending.stderr = '';
}

/** 丢掉 Metro 的逐条进度行，用 spinner 展示；保留其他日志（含最终 Bundled 行）。 */
function filterChunk(name, text) {
  const combined = lineBuf[name] + text;
  const lines = combined.split('\n');
  lineBuf[name] = lines.pop() ?? '';
  const out = [];

  for (const line of lines) {
    const kept = [];
    for (const seg of line.split('\r')) {
      const plain = seg.replace(ANSI_RE, '').trim();
      if (!plain) continue;
      const m = plain.match(PROGRESS_RE);
      if (m) {
        stage = `正在打包 ${m[1]}% (${m[2]}/${m[3]})`;
        isBundling = true;
        startSpinner();
        continue;
      }
      if (/Bundled\s+\d+\s*ms/i.test(plain)) {
        stopSpinner();
        isBundling = false;
        stage = '打包完成';
        kept.push(seg.replace(ANSI_RE, ''));
        continue;
      }
      kept.push(seg);
    }
    if (kept.length) out.push(kept.join('\r'));
  }
  return out.length ? `${out.join('\n')}\n` : '';
}

function onData(name, target) {
  return (chunk) => {
    const raw = chunk.toString();
    lastDataAt = Date.now();
    updateStage(raw);
    const filtered = filterChunk(name, raw);
    if (suppress && !ready) {
      pending[name] += filtered;
    } else if (filtered) {
      target.write(filtered);
    }
    const readyText = raw + pending.stdout + pending.stderr + lineBuf.stdout + lineBuf.stderr;
    if (!ready && READY_RE.test(readyText)) markReady();
  };
}

child.stdout.on('data', onData('stdout', process.stdout));
child.stderr.on('data', onData('stderr', process.stderr));

child.on('error', (error) => {
  stopSpinner();
  process.stderr.write(`启动失败：${error.message}\n`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  exited = true;
  stopSpinner();
  for (const name of ['stdout', 'stderr']) {
    if (lineBuf[name]) {
      const rest = filterChunk(name, '\n');
      if (rest) process.stdout.write(rest);
    }
  }
  if (pending.stdout) process.stdout.write(pending.stdout);
  if (pending.stderr) process.stderr.write(pending.stderr);
  pending.stdout = '';
  pending.stderr = '';
  process.exitCode = signal ? 1 : (code ?? 0);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (!exited && !child.killed) child.kill(sig);
  });
}

startSpinner();
