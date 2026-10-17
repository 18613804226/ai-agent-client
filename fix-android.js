// Re-apply the Android native fixes that `expo prebuild` wipes on every run.
// Idempotent. Run: node fix-android.js
const fs = require('fs');
const path = require('path');

const AND = 'D:/personal/ai-agent-client/android';
const RES = AND + '/app/src/main/res';

const STYLES_LIGHT = `<resources xmlns:tools="http://schemas.android.com/tools">
  <style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar">
    <item name="android:editTextBackground">@drawable/rn_edit_text_material</item>
    <item name="colorPrimary">@color/colorPrimary</item>
    <item name="android:statusBarColor">@android:color/transparent</item>
    <item name="android:navigationBarColor">@android:color/transparent</item>
    <item name="android:windowBackground">@drawable/window_background</item>
    <item name="android:colorBackground">#F0F4F9</item>
  </style>
</resources>
`;

const STYLES_NIGHT = `<resources xmlns:tools="http://schemas.android.com/tools">
  <style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar">
    <item name="android:editTextBackground">@drawable/rn_edit_text_material</item>
    <item name="colorPrimary">@color/colorPrimary</item>
    <item name="android:statusBarColor">@android:color/transparent</item>
    <item name="android:navigationBarColor">@android:color/transparent</item>
    <item name="android:windowBackground">@drawable/window_background</item>
    <item name="android:colorBackground">#000000</item>
  </style>
</resources>
`;

const WINDOW_BG = `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item android:drawable="@android:color/white"/>
</layer-list>
`;

const LOCAL_PROPS = 'sdk.dir=C:/Users/User/AppData/Local/Android/Sdk\n';

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function write(p, s) { ensureDir(path.dirname(p)); fs.writeFileSync(p, s); console.log('wrote', p.replace(AND, 'android')); }

write(RES + '/values/styles.xml', STYLES_LIGHT);
write(RES + '/values-night/styles.xml', STYLES_NIGHT);
write(RES + '/drawable/window_background.xml', WINDOW_BG);
write(AND + '/local.properties', LOCAL_PROPS);

// Patch AndroidManifest: MainActivity theme -> @style/AppTheme (drop the native splash theme)
const manifestPath = AND + '/app/src/main/AndroidManifest.xml';
let manifest = fs.readFileSync(manifestPath, 'utf8');
const before = manifest;
manifest = manifest.replace(/android:theme="@style\/Theme\.App\.SplashScreen"/g, 'android:theme="@style/AppTheme"');
if (manifest !== before) { fs.writeFileSync(manifestPath, manifest); console.log('patched AndroidManifest.xml theme -> AppTheme'); }
else console.log('AndroidManifest.xml theme already AppTheme');

// Strip the expo-splash-screen comment in MainActivity.kt (cosmetic)
const ktPath = AND + '/app/src/main/java/com/yourname/toto/MainActivity.kt';
if (fs.existsSync(ktPath)) {
  let kt = fs.readFileSync(ktPath, 'utf8');
  const ktBefore = kt;
  kt = kt.replace(/\s*\/\/ Set the theme to AppTheme BEFORE onCreate to support[\s\S]*?\/\/ This is required for expo-splash-screen\./, '');
  if (kt !== ktBefore) { fs.writeFileSync(ktPath, kt); console.log('cleaned MainActivity.kt comment'); }
}
console.log('android native fixes applied');
