const { withMainActivity, withMainApplication } = require('expo/config-plugins')

const injectSelectionAskMenu = (contents, language) => {
  if (language !== 'kt') {
    throw new Error('withSelectionAskMenu only supports the Kotlin MainActivity')
  }

  let next = contents

  if (!next.includes('ASK_DIETAI_MENU_ID')) {
    const anchor =
      /(\r?\n[ \t]*\/\*\*\r?\n[ \t]*\* Returns the name of the main component registered from JavaScript)/
    if (!anchor.test(next)) {
      throw new Error('withSelectionAskMenu could not find MainActivity anchor')
    }

    const insertion = [
      '  private val ASK_DIETAI_MENU_ID = 0x51A10001',
      '  private var lastSelectedText: String = ""',
      '  private var lastSelectedTextViewRef: java.lang.ref.WeakReference<android.widget.TextView>? = null',
      '',
      '  private fun findSelectedTextView(root: android.view.View?): android.widget.TextView? {',
      '    if (root == null || root.visibility != android.view.View.VISIBLE) return null',
      '    if (root is android.widget.TextView && root !is android.widget.EditText) {',
      '      val start = root.selectionStart',
      '      val end = root.selectionEnd',
      '      if (start >= 0 && end >= 0 && start != end) {',
      '        return root',
      '      }',
      '    }',
      '    if (root is android.view.ViewGroup) {',
      '      for (i in 0 until root.childCount) {',
      '        val found = findSelectedTextView(root.getChildAt(i))',
      '        if (found != null) return found',
      '      }',
      '    }',
      '    return null',
      '  }',
      '',
      '  private fun extractSelectedText(tv: android.widget.TextView?): String {',
      '    if (tv == null) return ""',
      '    val text = tv.text ?: return ""',
      '    val start = tv.selectionStart',
      '    val end = tv.selectionEnd',
      '    if (start < 0 || end < 0 || start == end) return ""',
      '    val lo = minOf(start, end).coerceIn(0, text.length)',
      '    val hi = maxOf(start, end).coerceIn(0, text.length)',
      '    if (lo >= hi) return ""',
      '    return text.subSequence(lo, hi).toString().trim()',
      '  }',
      '',
      '  private fun attachSelectionCallbacksRecursive(root: android.view.View?) {',
      '    if (root == null || root.visibility != android.view.View.VISIBLE) return',
      '    if (root is android.widget.TextView && root !is android.widget.EditText) {',
      '      attachSelectionCallbackIfNeeded(root)',
      '    }',
      '    if (root is android.view.ViewGroup) {',
      '      for (i in 0 until root.childCount) {',
      '        attachSelectionCallbacksRecursive(root.getChildAt(i))',
      '      }',
      '    }',
      '  }',
      '',
      '  override fun dispatchTouchEvent(ev: android.view.MotionEvent?): Boolean {',
      '    if (ev?.actionMasked == android.view.MotionEvent.ACTION_DOWN) {',
      '      attachSelectionCallbacksRecursive(window?.decorView)',
      '    }',
      '    return super.dispatchTouchEvent(ev)',
      '  }',
      '',
      '  private fun handleAskDieTaiSelection(mode: android.view.ActionMode?) {',
      '    val tv = findSelectedTextView(window?.decorView) ?: lastSelectedTextViewRef?.get()',
      '    val selected = extractSelectedText(tv).ifEmpty { lastSelectedText }',
      '    lastSelectedText = ""',
      '    lastSelectedTextViewRef = null',
      '    if (selected.isNotEmpty()) {',
      '      val reactContext =',
      '        reactDelegate?.currentReactContext',
      '          ?: reactHost?.currentReactContext',
      '          ?: (application as? com.facebook.react.ReactApplication)?.reactHost?.currentReactContext',
      '      reactContext?.emitDeviceEvent("onAskDieTaiSelection", selected)',
      '    }',
      '    val spannable = tv?.text as? android.text.Spannable',
      '    if (spannable != null) {',
      '      android.text.Selection.removeSelection(spannable)',
      '    }',
      '    mode?.finish()',
      '  }',
      '',
      '  private inner class AskDieTaiActionModeCallback(',
      '    private val delegate: android.view.ActionMode.Callback?',
      '  ) : android.view.ActionMode.Callback2() {',
      '    override fun onCreateActionMode(mode: android.view.ActionMode, menu: android.view.Menu): Boolean {',
      '      val ok = delegate?.onCreateActionMode(mode, menu) ?: true',
      '      if (ok) injectAskDieTaiMenu(mode, menu)',
      '      return ok',
      '    }',
      '',
      '    override fun onPrepareActionMode(mode: android.view.ActionMode, menu: android.view.Menu): Boolean {',
      '      val changed = delegate?.onPrepareActionMode(mode, menu) ?: false',
      '      val added = injectAskDieTaiMenu(mode, menu)',
      '      return changed || added',
      '    }',
      '',
      '    override fun onActionItemClicked(mode: android.view.ActionMode, item: android.view.MenuItem): Boolean {',
      '      if (item.itemId == ASK_DIETAI_MENU_ID) {',
      '        handleAskDieTaiSelection(mode)',
      '        return true',
      '      }',
      '      return delegate?.onActionItemClicked(mode, item) ?: false',
      '    }',
      '',
      '    override fun onDestroyActionMode(mode: android.view.ActionMode) {',
      '      delegate?.onDestroyActionMode(mode)',
      '      lastSelectedText = ""',
      '      lastSelectedTextViewRef = null',
      '    }',
      '',
      '    override fun onGetContentRect(',
      '      mode: android.view.ActionMode?,',
      '      view: android.view.View?,',
      '      outRect: android.graphics.Rect?',
      '    ) {',
      '      if (delegate is android.view.ActionMode.Callback2) {',
      '        delegate.onGetContentRect(mode, view, outRect)',
      '      } else {',
      '        super.onGetContentRect(mode, view, outRect)',
      '      }',
      '    }',
      '  }',
      '',
      '  private fun attachSelectionCallbackIfNeeded(tv: android.widget.TextView) {',
      '    val current = tv.customSelectionActionModeCallback',
      '    if (current !is AskDieTaiActionModeCallback) {',
      '      tv.customSelectionActionModeCallback = AskDieTaiActionModeCallback(current)',
      '    }',
      '  }',
      '',
      '  private fun wrapActionModeCallbackIfNeeded(mode: android.view.ActionMode) {',
      '    runCatching {',
      '      var cls: Class<*>? = mode.javaClass',
      '      while (cls != null && cls != Any::class.java) {',
      '        val field = cls.declaredFields.firstOrNull { it.name == "mCallback" }',
      '        if (field != null) {',
      '          field.isAccessible = true',
      '          val current = field.get(mode) as? android.view.ActionMode.Callback ?: return',
      '          if (current !is AskDieTaiActionModeCallback) {',
      '            field.set(mode, AskDieTaiActionModeCallback(current))',
      '          }',
      '          return',
      '        }',
      '        cls = cls.superclass',
      '      }',
      '    }',
      '  }',
      '',
      '  private fun injectAskDieTaiMenu(mode: android.view.ActionMode, menu: android.view.Menu?): Boolean {',
      '    if (menu == null) return false',
      '    val focused = currentFocus',
      '    if (focused is android.widget.EditText && focused.hasSelection()) return false',
      '    val tv = findSelectedTextView(window?.decorView) ?: lastSelectedTextViewRef?.get() ?: return false',
      '    val currentText = extractSelectedText(tv)',
      '    if (currentText.isNotEmpty()) {',
      '      lastSelectedText = currentText',
      '      lastSelectedTextViewRef = java.lang.ref.WeakReference(tv)',
      '    }',
      '    if (lastSelectedText.isEmpty()) return false',
      '    attachSelectionCallbackIfNeeded(tv)',
      '    if (menu.findItem(ASK_DIETAI_MENU_ID) != null) return false',
      '    val item = menu.add(android.view.Menu.NONE, ASK_DIETAI_MENU_ID, 0, "问问 DieTai")',
      '    item.setShowAsAction(',
      '      android.view.MenuItem.SHOW_AS_ACTION_ALWAYS or android.view.MenuItem.SHOW_AS_ACTION_WITH_TEXT',
      '    )',
      '    item.setOnMenuItemClickListener {',
      '      handleAskDieTaiSelection(mode)',
      '      true',
      '    }',
      '    return true',
      '  }',
      '',
      '  override fun onWindowStartingActionMode(',
      '    callback: android.view.ActionMode.Callback?,',
      '    type: Int',
      '  ): android.view.ActionMode? {',
      '    if (type == android.view.ActionMode.TYPE_FLOATING && callback != null) {',
      '      val wrapped =',
      '        if (callback is AskDieTaiActionModeCallback) callback',
      '        else AskDieTaiActionModeCallback(callback)',
      '      return super.onWindowStartingActionMode(wrapped, type)',
      '    }',
      '    return super.onWindowStartingActionMode(callback, type)',
      '  }',
      '',
      '  override fun onActionModeStarted(mode: android.view.ActionMode?) {',
      '    super.onActionModeStarted(mode)',
      '    if (mode != null) {',
      '      wrapActionModeCallbackIfNeeded(mode)',
      '      if (injectAskDieTaiMenu(mode, mode.menu)) {',
      '        mode.invalidate()',
      '      }',
      '    }',
      '  }',
      '',
    ].join('\n')

    next = next.replace(anchor, `\n${insertion}$1`)
  }

  if (!next.includes('DieTaiNativeModule')) {
    const clearHelper = [
      '  private fun clearReplyNotification() {',
      '    val manager =',
      '      getSystemService(android.content.Context.NOTIFICATION_SERVICE)',
      '        as? android.app.NotificationManager',
      '    manager?.cancel(DIETAI_REPLY_NOTIFICATION_ID)',
      '  }',
      '',
    ].join('\n')

    if (/override fun onResume\(\)[\s\S]*?\}/.test(next)) {
      next = next.replace(
        /([ \t]*override fun onResume\(\)\s*\{[^\n]*\r?\n[ \t]*super\.onResume\(\)[^\r\n]*)/,
        `${clearHelper}$1\n    clearReplyNotification()`
      )
    } else {
      const anchor =
        /(\r?\n[ \t]*\/\*\*\r?\n[ \t]*\* Returns the name of the main component registered from JavaScript)/
      if (!anchor.test(next)) {
        throw new Error('withSelectionAskMenu could not find MainActivity anchor for DieTaiNativeModule')
      }
      next = next.replace(
        anchor,
        `\n${clearHelper}  override fun onResume() {\n    super.onResume()\n    clearReplyNotification()\n  }\n$1`
      )
    }

    const moduleBlock = [
      '',
      'private const val DIETAI_REPLY_CHANNEL_ID = "dietai_reply_channel"',
      'private const val DIETAI_REPLY_NOTIFICATION_ID = 0x51A10002',
      '',
      'class DieTaiNativeModule(',
      '  reactContext: com.facebook.react.bridge.ReactApplicationContext',
      ') : com.facebook.react.bridge.ReactContextBaseJavaModule(reactContext) {',
      '',
      '  private val wakeLockLock = Any()',
      '  private var streamWakeLock: android.os.PowerManager.WakeLock? = null',
      '',
      '  override fun getName(): String = "DieTaiNative"',
      '',
      '  @com.facebook.react.bridge.ReactMethod',
      '  fun showReplyNotification(title: String, body: String) {',
      '    val ctx = reactApplicationContext',
      '    val manager =',
      '      ctx.getSystemService(android.content.Context.NOTIFICATION_SERVICE)',
      '        as? android.app.NotificationManager ?: return',
      '',
      '    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {',
      '      val channel = android.app.NotificationChannel(',
      '        DIETAI_REPLY_CHANNEL_ID,',
      '        "AI 回复完成通知",',
      '        android.app.NotificationManager.IMPORTANCE_HIGH',
      '      ).apply {',
      '        description = "后台生成回答完成时发出提醒"',
      '        enableVibration(true)',
      '      }',
      '      manager.createNotificationChannel(channel)',
      '    }',
      '',
      '    val launchIntent =',
      '      android.content.Intent(ctx, MainActivity::class.java).apply {',
      '        flags =',
      '          android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP or',
      '            android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP',
      '      }',
      '    val pendingIntent = android.app.PendingIntent.getActivity(',
      '      ctx,',
      '      DIETAI_REPLY_NOTIFICATION_ID,',
      '      launchIntent,',
      '      android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE',
      '    )',
      '',
      '    val smallIcon =',
      '      runCatching { R.mipmap.ic_launcher_foreground }.getOrElse {',
      '        ctx.applicationInfo.icon.takeIf { it != 0 } ?: android.R.drawable.stat_notify_chat',
      '      }',
      '    val largeIcon = runCatching {',
      '      android.graphics.BitmapFactory.decodeResource(ctx.resources, R.mipmap.ic_launcher)',
      '    }.getOrNull()',
      '',
      '    val builder = androidx.core.app.NotificationCompat.Builder(ctx, DIETAI_REPLY_CHANNEL_ID)',
      '      .setSmallIcon(smallIcon)',
      '      .setContentTitle(title.ifBlank { "DieTai 已完成回答" })',
      '      .setContentText(body)',
      '      .setStyle(androidx.core.app.NotificationCompat.BigTextStyle().bigText(body))',
      '      .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH)',
      '      .setCategory(androidx.core.app.NotificationCompat.CATEGORY_MESSAGE)',
      '      .setDefaults(androidx.core.app.NotificationCompat.DEFAULT_ALL)',
      '      .setAutoCancel(true)',
      '      .setContentIntent(pendingIntent)',
      '',
      '    if (largeIcon != null) {',
      '      builder.setLargeIcon(largeIcon)',
      '    }',
      '',
      '    runCatching {',
      '      manager.notify(DIETAI_REPLY_NOTIFICATION_ID, builder.build())',
      '    }',
      '  }',
      '',
      '  @com.facebook.react.bridge.ReactMethod',
      '  fun cancelReplyNotification() {',
      '    val manager =',
      '      reactApplicationContext.getSystemService(android.content.Context.NOTIFICATION_SERVICE)',
      '        as? android.app.NotificationManager',
      '    manager?.cancel(DIETAI_REPLY_NOTIFICATION_ID)',
      '  }',
      '',
      '  @com.facebook.react.bridge.ReactMethod',
      '  fun setBackgroundStreaming(active: Boolean) {',
      '    synchronized(wakeLockLock) {',
      '      if (active) {',
      '        if (streamWakeLock?.isHeld == true) return',
      '        val pm =',
      '          reactApplicationContext.getSystemService(android.content.Context.POWER_SERVICE)',
      '            as? android.os.PowerManager ?: return',
      '        val lock = pm.newWakeLock(',
      '          android.os.PowerManager.PARTIAL_WAKE_LOCK,',
      '          "dietai:stream_wakelock"',
      '        ).apply {',
      '          setReferenceCounted(false)',
      '          acquire(180_000L)',
      '        }',
      '        streamWakeLock = lock',
      '      } else {',
      '        releaseWakeLockLocked()',
      '      }',
      '    }',
      '  }',
      '',
      '  private fun releaseWakeLockLocked() {',
      '    val lock = streamWakeLock ?: return',
      '    streamWakeLock = null',
      '    if (lock.isHeld) {',
      '      runCatching { lock.release() }',
      '    }',
      '  }',
      '',
      '  override fun invalidate() {',
      '    synchronized(wakeLockLock) {',
      '      releaseWakeLockLocked()',
      '    }',
      '    super.invalidate()',
      '  }',
      '}',
      '',
      'class DieTaiNativePackage : com.facebook.react.ReactPackage {',
      '  @Suppress("DEPRECATION")',
      '  override fun createNativeModules(',
      '    reactContext: com.facebook.react.bridge.ReactApplicationContext',
      '  ): List<com.facebook.react.bridge.NativeModule> = listOf(DieTaiNativeModule(reactContext))',
      '',
      '  override fun createViewManagers(',
      '    reactContext: com.facebook.react.bridge.ReactApplicationContext',
      '  ): List<com.facebook.react.uimanager.ViewManager<in Nothing, in Nothing>> = emptyList()',
      '}',
    ].join('\n')

    next = next.replace(/\s*$/, `\n${moduleBlock}\n`)
  }

  return next
}

const injectDieTaiNativePackage = (contents, language) => {
  if (language !== 'kt') {
    throw new Error('withSelectionAskMenu only supports the Kotlin MainApplication')
  }
  if (contents.includes('DieTaiNativePackage')) return contents

  const anchor = /(PackageList\(this\)\.packages\.apply\s*\{)/
  if (!anchor.test(contents)) {
    throw new Error('withSelectionAskMenu could not find MainApplication PackageList anchor')
  }

  return contents.replace(anchor, '$1\n          add(DieTaiNativePackage())')
}

const withSelectionAskMenu = (config) => {
  config = withMainActivity(config, (modRequest) => {
    modRequest.modResults.contents = injectSelectionAskMenu(
      modRequest.modResults.contents,
      modRequest.modResults.language
    )
    return modRequest
  })
  config = withMainApplication(config, (modRequest) => {
    modRequest.modResults.contents = injectDieTaiNativePackage(
      modRequest.modResults.contents,
      modRequest.modResults.language
    )
    return modRequest
  })
  return config
}

module.exports = withSelectionAskMenu
module.exports.injectSelectionAskMenu = injectSelectionAskMenu
module.exports.injectDieTaiNativePackage = injectDieTaiNativePackage
