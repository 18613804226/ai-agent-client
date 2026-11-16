import crypto from 'node:crypto';
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

function collectSortedFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSortedFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files.sort((a, b) =>
    path
      .relative(root, a)
      .replace(/\\/g, '/')
      .localeCompare(path.relative(root, b).replace(/\\/g, '/')),
  );
}

/** 计算原生依赖/配置/插件指纹，变化时才重跑 expo prebuild --clean */
function computePrebuildHash() {
  const hash = crypto.createHash('sha256');
  const targets = [
    path.join(root, 'package.json'),
    path.join(root, 'app.json'),
    ...collectSortedFiles(path.join(root, 'plugins')),
    ...collectSortedFiles(path.join(root, 'patches')),
  ];
  for (const filePath of targets) {
    if (!fs.existsSync(filePath)) continue;
    const rel = path.relative(root, filePath).replace(/\\/g, '/');
    hash.update(rel);
    hash.update('\0');
    hash.update(fs.readFileSync(filePath));
  }
  return hash.digest('hex');
}

loadEnvFiles();
if (!process.env.EXPO_PUBLIC_API_URL) {
  console.error('[release] EXPO_PUBLIC_API_URL is missing');
  process.exit(1);
}
console.log(`[release] EXPO_PUBLIC_API_URL=${process.env.EXPO_PUBLIC_API_URL}`);

if (process.argv.includes('--dry-run')) process.exit(0);

// 智能增量：对比 package.json / app.json / plugins / patches 指纹。
// 原生配置未变时自动跳过 `prebuild --clean`，保留 Gradle 增量编译产物（FORCE_PREBUILD=1 可强制重建）。
const androidGradlePath = path.join(root, 'android', 'app', 'build.gradle');
const hashFilePath = path.join(root, 'android', '.prebuild-hash');
const currentHash = computePrebuildHash();
const savedHash = fs.existsSync(hashFilePath)
  ? fs.readFileSync(hashFilePath, 'utf8').trim()
  : '';
const forcePrebuild = process.env.FORCE_PREBUILD === '1';
const hasAndroidProject = fs.existsSync(androidGradlePath);
const skipPrebuild =
  !forcePrebuild &&
  hasAndroidProject &&
  (process.env.SKIP_PREBUILD === '1' || savedHash === currentHash);

if (skipPrebuild) {
  const reason =
    process.env.SKIP_PREBUILD === '1'
      ? 'SKIP_PREBUILD=1'
      : `原生指纹未变 (${currentHash.slice(0, 8)})`;
  console.log(`[release] ${reason} → 跳过 prebuild，复用现有 android/`);
} else {
  if (forcePrebuild) {
    console.log('[release] FORCE_PREBUILD=1 → 执行 prebuild --clean');
  } else if (!hasAndroidProject) {
    console.log('[release] 未检测到 android/ 工程 → 执行 prebuild --clean');
  } else {
    console.log('[release] 原生配置或插件已变更 → 执行 prebuild --clean');
  }
  run('npx', ['expo', 'prebuild', '--clean', '--platform', 'android', '--no-install']);
  fs.writeFileSync(hashFilePath, `${currentHash}\n`);
}
run('node', ['scripts/ensure-android-sdk.mjs']);

const srcKeystore = path.join(root, 'release.keystore');
const destKeystore = path.join(root, 'android', 'app', 'release.keystore');
if (
  !fs.existsSync(destKeystore) ||
  !fs.readFileSync(srcKeystore).equals(fs.readFileSync(destKeystore))
) {
  fs.copyFileSync(srcKeystore, destKeystore);
  console.log('[release] 已更新 android/app/release.keystore');
}

run('node', ['scripts/patch-android-signing.mjs']);

// expo-updates 的 createReleaseUpdatesResources 任务未声明 JS 源码为输入，
// 增量构建时会被判为 UP-TO-DATE 导致 APK 内 app.manifest 的 commitTime 停留在旧时间，
// 进而被手机上已缓存的旧 OTA 包覆盖。每次打包前清理该目录（仅几十 KB），强制生成最新 commitTime。
fs.rmSync(
  path.join(root, 'android', 'app', 'build', 'generated', 'assets', 'createReleaseUpdatesResources'),
  { recursive: true, force: true },
);

run(
  // ".\" 前缀必需:NoDefaultCurrentDirectoryInExePath=1 时 cmd 不从当前目录解析裸 gradlew.bat
  // 不再用 --no-daemon：每次 fork 一个一次性 JVM 会白付配置/预热成本，且失去增量编译。
  isWindows ? '.\\gradlew.bat' : './gradlew',
  ['assembleRelease', '-PreactNativeArchitectures=arm64-v8a'],
  { cwd: path.join(root, 'android') },
);
