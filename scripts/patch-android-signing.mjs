#!/usr/bin/env node
/**
 * 把 release 签名注入 prebuild 生成的 android/app/build.gradle（CI 用）。
 *
 * - 签名 secrets 缺失 → 不动文件，保留模板的 debug 签名兜底（可安装，
 *   但 CI 的 debug keystore 每次都是新的，无法覆盖升级）。
 * - 已存在 release 签名配置（本地手改过的 android/）→ 保持原样不覆盖。
 * - CI 每次都是 `prebuild --clean` 的全新模板 → 必走插入分支。
 *
 * 依赖 env：KEYSTORE_FILE KEYSTORE_PASSWORD KEY_ALIAS KEY_PASSWORD
 * 本地也可在项目根目录放 keystore.properties（已 gitignore）：
 *   storeFile=../../release.keystore
 *   storePassword=...
 *   keyAlias=...
 *   keyPassword=...
 */
import fs from 'node:fs';
import path from 'node:path';

const GRADLE = 'android/app/build.gradle';

/** 本地签名：优先环境变量，其次忽略提交的 keystore.properties */
function readLocalSigningConfig() {
  const propsPath = path.join(process.cwd(), 'keystore.properties');
  if (!fs.existsSync(propsPath)) return {};
  const props = {};
  for (const line of fs.readFileSync(propsPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*)\s*$/);
    if (match) props[match[1]] = match[2];
  }
  return props;
}

const local = readLocalSigningConfig();
const KEYSTORE_FILE = process.env.KEYSTORE_FILE || local.storeFile;
const KEYSTORE_PASSWORD = process.env.KEYSTORE_PASSWORD || local.storePassword;
const KEY_ALIAS = process.env.KEY_ALIAS || local.keyAlias;
const KEY_PASSWORD = process.env.KEY_PASSWORD || local.keyPassword;

if (!KEYSTORE_FILE || !KEYSTORE_PASSWORD || !KEY_ALIAS || !KEY_PASSWORD) {
  console.log('[signing] 签名 secrets 未配置 → 保留模板 debug 签名兜底');
  process.exit(0);
}

let contents = fs.readFileSync(GRADLE, 'utf8');

// 定位整个 signingConfigs { ... }：用「与开括号同缩进的闭括号」回引，
// 精确吃掉本级块，不会越界扫到 buildTypes 里的 release。
const scRe = /^([ \t]*)signingConfigs[ \t]*\{[\s\S]*?^\1\}/m;
const scMatch = contents.match(scRe);

if (!scMatch) {
  console.error('[signing] 未找到 signingConfigs 块 → build.gradle 结构与预期不符');
  process.exit(1);
}

if (/\brelease\s*\{/.test(scMatch[0])) {
  console.log('[signing] 已存在 release 签名配置 → 保持不变');
} else {
  const releaseCfg = [
    '        release {',
    `            storeFile file('${KEYSTORE_FILE}')`,
    `            storePassword '${KEYSTORE_PASSWORD}'`,
    `            keyAlias '${KEY_ALIAS}'`,
    `            keyPassword '${KEY_PASSWORD}'`,
    '        }',
  ].join('\n');
  const block = scMatch[0];
  const closeAt = block.lastIndexOf('\n'); // 最后一行是本级闭括号
  const newBlock = `${block.slice(0, closeAt)}\n${releaseCfg}${block.slice(closeAt)}`;
  // 函数式替换：密码里可能含 $，避免 String.replace 的 $ 转义问题
  contents = contents.replace(scRe, () => newBlock);
  console.log('[signing] release signingConfig 已插入');
}

// buildTypes.release 默认指向 debug 签名 → 改指 release（已改过则不匹配、无操作）
const before = contents;
contents = contents.replace(
  /(buildTypes[ \t]*\{[\s\S]*?^[ \t]*release[ \t]*\{[\s\S]*?)(signingConfig[ \t]+signingConfigs\.debug)/m,
  '$1signingConfig signingConfigs.release',
);
if (contents === before) {
  console.log('[signing] buildTypes.release 未指向 debug（已配置或结构不符）→ 跳过改写');
} else {
  console.log('[signing] buildTypes.release → signingConfigs.release');
}

fs.writeFileSync(GRADLE, contents);
console.log(`[signing] 完成: ${GRADLE}`);
