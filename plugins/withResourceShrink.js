/**
 * 本地 Expo Config Plugin:裁剪 APK 内的 classpath 资源(写入 android/app/build.gradle)。
 *
 * android/ 每次 prebuild --clean 都会重新生成(在 .gitignore 里),手改不保留;
 * config plugin 在每次 prebuild 时自动注入,本地与 CI 行为一致。
 *
 * 裁掉什么:org/bouncycastle/pqc/**(~1.5MB)—— expo-updates 依赖 BouncyCastle
 * 顺带打包的后量子算法数据文件(picnic/lowmcL*.bin.properties 等 133 个)。
 * expo-updates 的更新签名校验走 ES256/RS256,不会触发 picnic 算法加载;
 * BouncyCastle 对这些数据是懒读取,缺文件不影响其它算法。
 */
const { withAppBuildGradle } = require('expo/config-plugins');

/** 纯字符串变换,单独导出便于单测 */
const injectResourceExcludes = (contents) => {
  if (/org\/bouncycastle\/pqc/.test(contents)) {
    return contents;
  }
  const block = [
    '    // ✅ injected by plugins/withResourceShrink.js(裁掉 expo-updates 依赖 BouncyCastle 的 PQC 数据文件,~1.5MB)',
    '    packagingOptions {',
    '        resources {',
    '            excludes += ["org/bouncycastle/pqc/**"]',
    '        }',
    '    }',
    '',
  ].join('\n');
  return contents.replace(/(^android[ \t]*\{)/m, `$1\n${block}`);
};

const withResourceShrink = (config) =>
  withAppBuildGradle(config, (modRequest) => {
    modRequest.modResults.contents = injectResourceExcludes(
      modRequest.modResults.contents
    );
    return modRequest;
  });

module.exports = withResourceShrink;
module.exports.injectResourceExcludes = injectResourceExcludes;
