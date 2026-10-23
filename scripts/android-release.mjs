import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const isWindows = process.platform === 'win32';

/** 与 expo 的 .env 加载顺序保持一致，shell 里已有的变量优先 */
function loadEnvFiles() {
  const inherited = new Set(Object.keys(process.env));
  const merged = {};
  for (const file of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    const filePath = path.join(root, file);
    if (!fs.existsSync(filePath)) continue;
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*)\s*$/);
      if (match) merged[match[1]] = match[2];
    }
  }
  for (const [key, value] of Object.entries(merged)) {
    if (!inherited.has(key)) process.env[key] = value;
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: true,
    env: process.env,
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

loadEnvFiles();
if (!process.env.EXPO_PUBLIC_API_URL) {
  console.error('[release] EXPO_PUBLIC_API_URL is missing');
  process.exit(1);
}
console.log(`[release] EXPO_PUBLIC_API_URL=${process.env.EXPO_PUBLIC_API_URL}`);

if (process.argv.includes('--dry-run')) process.exit(0);

run('npx', ['expo', 'prebuild', '--clean', '--platform', 'android', '--no-install']);
run('node', ['scripts/ensure-android-sdk.mjs']);
fs.copyFileSync('release.keystore', path.join('android', 'app', 'release.keystore'));
run('node', ['scripts/patch-android-signing.mjs']);
run(
  // ".\" 前缀必需:NoDefaultCurrentDirectoryInExePath=1 时 cmd 不从当前目录解析裸 gradlew.bat
  isWindows ? '.\\gradlew.bat' : './gradlew',
  ['assembleRelease', '--no-daemon', '-PreactNativeArchitectures=arm64-v8a'],
  { cwd: path.join(root, 'android') },
);
