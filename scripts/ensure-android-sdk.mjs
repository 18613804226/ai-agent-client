import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * `expo prebuild --clean` 会删除 android/local.properties。
 * 本机没有配置 ANDROID_HOME 时，干净生成的工程会直接报 SDK location not found。
 * 这里在每次本地出包前根据常见 SDK 路径补回来，避免再手动改生成目录。
 */
const sdk =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
    'Android',
    'Sdk',
  );

if (!fs.existsSync(sdk)) {
  console.error(`[android] Android SDK not found: ${sdk}`);
  process.exit(1);
}

const escaped = sdk.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
fs.writeFileSync('android/local.properties', `sdk.dir=${escaped}\n`);
console.log(`[android] local.properties -> ${sdk}`);
