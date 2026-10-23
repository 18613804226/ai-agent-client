import fs from 'node:fs';
import path from 'node:path';

/**
 * 包体积优化:裁掉未使用的图标字体。
 *
 * @expo/vector-icons/build/index.js 会 re-export 全部 19 个图标集合,每个集合文件
 * 顶部都 `import font from './vendor/.../Fonts/<Name>.ttf'` —— Metro 不做 tree-shaking,
 * 即使项目只 import 了 Feather / MaterialCommunityIcons,其余字体也全部被打进安装包
 * (res/raw 资源,共 ~4.2MB,含 expo-symbols 带入的 Material Symbols 1.25MB)。
 *
 * 做法:把白名单之外的字体文件内容替换为 Feather.ttf(54KB)。
 * 不删除文件 —— 各集合 JS 顶部的 import 仍要能解析;替换内容后,
 * 打包产物里那些字体只剩 54KB 的无效占位,而 Feather / MaterialCommunityIcons
 * 本身不受影响(在白名单里,保持原文件)。
 *
 * ⚠️ 以后若 import 了新图标集,把它的 .ttf 文件名加进 USED_ICON_FONTS,
 * 否则该集合的图标显示会破(字体内容不对)。
 * 在 postinstall 阶段运行(npm ci / npm i 后自动生效,本地与 CI 一致)。
 */
const USED_ICON_FONTS = new Set([
  'Feather.ttf',
  'MaterialCommunityIcons.ttf',
]);

const fontDirs = [
  'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts',
];

// expo-symbols(被 expo-ui 依赖带入,本项目未使用)的 Material Symbols 各字重
const globDirs = ['node_modules/@expo-google-fonts/material-symbols'];

const root = process.cwd();
let replaced = 0;

// Feather.ttf 内容来源(必然存在,项目在用)。大小写敏感:Linux 上目录名为 Fonts(大写 F)
const featherPath = path.join(
  root,
  'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Feather.ttf'
);
if (!fs.existsSync(featherPath)) {
  console.warn('[trim-icon-fonts] Feather.ttf not found, skipping (CI/dev env?)');
  process.exit(0);
}
const featherBuf = fs.readFileSync(featherPath);

for (const dir of fontDirs) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) continue;
  for (const f of fs.readdirSync(abs)) {
    if (!f.endsWith('.ttf') || USED_ICON_FONTS.has(f)) continue;
    const target = path.join(abs, f);
    if (fs.readFileSync(target).equals(featherBuf)) continue;
    fs.writeFileSync(target, featherBuf);
    replaced++;
  }
}

// Material Symbols:所有字重全部替换(本项目不使用 expo-ui/expo-symbols)
function walkReplace(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, f.name);
    if (f.isDirectory()) {
      walkReplace(abs);
    } else if (f.name.endsWith('.ttf')) {
      if (fs.readFileSync(abs).equals(featherBuf)) continue;
      fs.writeFileSync(abs, featherBuf);
      replaced++;
    }
  }
}
for (const dir of globDirs) {
  walkReplace(path.join(root, dir));
}

console.log(`[trim-icon-fonts] replaced ${replaced} unused icon font(s) with Feather.ttf`);
