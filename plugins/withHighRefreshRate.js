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

  const insertion = [
    '  private fun applyHighRefreshRate() {',
    '    val display = window.decorView.display ?: return',
    '    val maxRefreshRate = display.supportedModes.maxOfOrNull { it.refreshRate } ?: return',
    '    val attrs = window.attributes',
    '    attrs.preferredRefreshRate = maxRefreshRate',
    '    window.attributes = attrs',
    '  }',
    '',
    '  override fun onResume() {',
    '    super.onResume()',
    '    applyHighRefreshRate()',
    '  }',
    '',
  ].join('\n')

  return contents.replace(anchor, `\n${insertion}$1`)
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
