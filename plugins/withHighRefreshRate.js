const { withMainActivity } = require('expo/config-plugins')

const injectHighRefreshRate = (contents, language) => {
  if (contents.includes('applyHighRefreshRate')) return contents

  if (language !== 'kt') {
    throw new Error('withHighRefreshRate only supports the Kotlin MainActivity')
  }

  const anchor =
    /(\r?\n[ \t]*\/\*\*\r?\n[ \t]*\* Returns the name of the main component registered from JavaScript)/
  if (!anchor.test(contents)) {
    throw new Error('withHighRefreshRate could not find MainActivity anchor')
  }

  const refreshFn = [
    '  private fun applyHighRefreshRate() {',
    '    val display = window.decorView.display ?: return',
    '    val maxRefreshRate = display.supportedModes.maxOfOrNull { it.refreshRate } ?: return',
    '    val attrs = window.attributes',
    '    attrs.preferredRefreshRate = maxRefreshRate',
    '    window.attributes = attrs',
    '  }',
    '',
  ].join('\n')

  let next = contents.replace(anchor, `\n${refreshFn}$1`)

  // ⚠️ 已有 onResume（其它插件先注入过，例如 withSelectionAskMenu）时只追加调用，
  //    不能再写一个 override fun onResume()：两个同名 override 会报
  //    "Conflicting overloads"，clean prebuild 后 :app:compileReleaseKotlin 直接失败。
  const resumeRe =
    /([ \t]*override fun onResume\(\)\s*\{[^\n]*\r?\n[ \t]*super\.onResume\(\)[^\r\n]*)/
  if (resumeRe.test(next)) {
    return next.replace(resumeRe, `$1\n    applyHighRefreshRate()`)
  }

  const resume = [
    '',
    '  override fun onResume() {',
    '    super.onResume()',
    '    applyHighRefreshRate()',
    '  }',
    '',
  ].join('\n')
  return next.replace(anchor, `\n${resume}$1`)
}

const withHighRefreshRate = (config) =>
  withMainActivity(config, (modRequest) => {
    modRequest.modResults.contents = injectHighRefreshRate(
      modRequest.modResults.contents,
      modRequest.modResults.language
    )
    return modRequest
  })

module.exports = withHighRefreshRate
module.exports.injectHighRefreshRate = injectHighRefreshRate
