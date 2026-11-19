/**
 * 本地 Expo Config Plugin:禁用 release 构建的 lint 检查(写入 android/app/build.gradle)。
 *
 * android/ 每次 prebuild --clean 都会重新生成(在 .gitignore 里),手改不保留;
 * config plugin 在每次 prebuild 时自动注入,本地与 CI 行为一致。
 *
 * 为什么禁用:Android lint 在 CI (ubuntu,内存受限) 上分析 expo-modules-core 时
 * 频繁 OOM(Metaspace),导致 :expo-modules-core:lintVitalAnalyzeRelease 失败。
 * lint 是静态检查,不影响运行时;release 构建时跳过可以避免这种环境性故障。
 * 本地开发时 lint 仍可通过 `./gradlew lint` 手动跑。
 */
const {
  withAppBuildGradle,
  withGradleProperties
} = require('expo/config-plugins')

/** 纯字符串变换,单独导出便于单测 */
const injectLintDisable = (contents) => {
  if (/checkReleaseBuilds\s+false/.test(contents)) {
    return contents
  }
  const block = [
    '    // ✅ injected by plugins/withLintDisable.js(禁用 release lint,避免 CI 上 OOM)',
    '    lint {',
    '        checkReleaseBuilds false',
    '    }',
    ''
  ].join('\n')
  return contents.replace(/(^android[ \t]*\{)/m, `$1\n${block}`)
}

const setGradleProperty = (props, key, value) => {
  const existing = props.find((p) => p.type === 'property' && p.key === key)
  if (existing) {
    existing.value = value
  } else {
    props.push({ type: 'property', key, value })
  }
}

const withLintDisable = (config) => {
  config = withAppBuildGradle(config, (modRequest) => {
    modRequest.modResults.contents = injectLintDisable(
      modRequest.modResults.contents
    )
    return modRequest
  })
  // 同时加大 Gradle daemon 的 Metaspace、开启全局构建缓存并关闭 Release PNG 重压缩
  config = withGradleProperties(config, (modRequest) => {
    const props = modRequest.modResults
    setGradleProperty(
      props,
      'org.gradle.jvmargs',
      '-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError'
    )
    setGradleProperty(props, 'org.gradle.caching', 'true')
    setGradleProperty(props, 'org.gradle.configureondemand', 'true')
    setGradleProperty(props, 'org.gradle.daemon.idletimeout', '1800000')
    setGradleProperty(props, 'kotlin.incremental', 'true')
    setGradleProperty(props, 'kotlin.caching.enabled', 'true')
    setGradleProperty(props, 'android.enablePngCrunchInReleaseBuilds', 'false')
    return modRequest
  })
  return config
}

module.exports = withLintDisable
module.exports.injectLintDisable = injectLintDisable
module.exports.setGradleProperty = setGradleProperty
