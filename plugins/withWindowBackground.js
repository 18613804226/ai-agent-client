/**
 * 本地 Expo Config Plugin：为 AppTheme 注入 android:windowBackground。
 *
 * 问题：AppTheme 继承自 Theme.AppCompat.DayNight.NoActionBar，但未设置
 * android:windowBackground。当系统处于深色模式时，DayNight 默认窗背景为深色；
 * 在 JS 线程接管之前（导航转场、首屏渲染），原生窗口会短暂闪烟；导致「深色闪烫」。
 *
 * 解决：显式设置 AppTheme 的 android:windowBackground 为 @color/splashscreen_background
 * （colors.xml 中 = #FFFFFF）。这样原生窗背景永远为白色，与 JS 主题初始值一致，
 * 转场前后无色差。
 *
 * 为什么不用直接编辑 styles.xml：android/ 在 .gitignore 中，每次 prebuild --clean
 * 会被清空；config plugin 在每次 prebuild 时自动注入，本地与 CI 行为一致。
 *
 * 实现：使用 withFinalizedMod 在 prebuild 阶段最后一步修改 styles.xml 字符串。
 * 选择 finalized 而非 dangerous：dangerous 阶段在 styles 基态提供者之前执行，
 * 基态提供者会重新读取并写回 XML（丢失我们的改动）；finalized 阶段在所有
 * 基态提供者 write 之后执行，确保我们的改动是最后一次写。
 * 与本项目其他插件 (withAbiSplits、withResourceShrink 等) 保持一致的
 * 字符串操作模式。
 */
const { withFinalizedMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const STYLES_XML_PATH = 'android/app/src/main/res/values/styles.xml';

/** 纯字符串变换，单独导出便于单测 */
const injectWindowBackground = (contents) => {
  if (/<item name="android:windowBackground">@color\/splashscreen_background<\/item>/.test(contents)) {
    return contents;
  }
  return contents.replace(
    /(<style name="AppTheme"[^>]*>)/,
    '$1\n    <item name="android:windowBackground">@color/splashscreen_background</item>'
  );
};

const withWindowBackground = (config) => {
  return withFinalizedMod(config, [
    'android',
    (config) => {
      const filePath = path.join(config.modRequest.projectRoot, STYLES_XML_PATH);
      if (!fs.existsSync(filePath)) return config;
      const contents = fs.readFileSync(filePath, 'utf8');
      const newContents = injectWindowBackground(contents);
      if (newContents !== contents) {
        fs.writeFileSync(filePath, newContents);
      }
      return config;
    },
  ]);
};

module.exports = withWindowBackground;
module.exports.injectWindowBackground = injectWindowBackground;
