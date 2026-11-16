/**
 * 本地 Expo Config Plugin：ABI 分包（写入 android/app/build.gradle）。
 *
 * 为什么不用手改 build.gradle：CI 每次都执行 `expo prebuild --clean`
 * 重新生成 android/（它在 .gitignore 里），手改不会保留；config plugin
 * 在每次 prebuild 时自动注入，本地与 CI 行为一致。
 *
 * 产物（universalApk false，不产出全架构包，仅保留服务端与主流设备所需的 arm64-v8a）：
 *   app-arm64-v8a-release.apk
 */
const { withAppBuildGradle } = require('expo/config-plugins');

// 仅构建 arm64-v8a，避免 Gradle 为无用架构重复执行资源收缩、打包与签名
const ABI_INCLUDE = ['arm64-v8a'];

/** 纯字符串变换，单独导出便于单测 */
const injectSplits = (contents) => {
  // 幂等：已有 splits（手改残留 / 未来模板自带）就不再注入
  if (/^[ \t]*splits[ \t]*\{/m.test(contents)) {
    return contents;
  }
  const block = [
    '',
    '    // ✅ injected by plugins/withAbiSplits.js（ABI 分包：按架构出独立 APK，CI 仅推送 arm64-v8a）',
    '    splits {',
    '        abi {',
    '            reset()',
    '            enable true',
    '            universalApk false',
    `            include ${ABI_INCLUDE.map((abi) => `"${abi}"`).join(', ')}`,
    '        }',
    '    }',
    '',
  ].join('\n');
  return contents.replace(/(^android[ \t]*\{)/m, `$1${block}`);
};

const withAbiSplits = (config) =>
  withAppBuildGradle(config, (modRequest) => {
    modRequest.modResults.contents = injectSplits(modRequest.modResults.contents);
    return modRequest;
  });

module.exports = withAbiSplits;
module.exports.injectSplits = injectSplits;
