$ErrorActionPreference = 'Continue'
$log = 'D:\personal\ai-agent-client\logs\build-install.log'
New-Item -ItemType Directory -Force -Path 'D:\personal\ai-agent-client\logs' | Out-Null
function Log($m) { "$(Get-Date -Format 'HH:mm:ss') $m" | Out-File -Append -Encoding utf8 $log }
Set-Content -Path $log -Value "start $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Set-Location D:\personal\ai-agent-client
$env:CI = '1'

Log '=== [1/3] expo prebuild -p android ==='
npx expo prebuild -p android --no-install 2>&1 | Out-File -Append -Encoding utf8 $log
Log "prebuild exit=$LASTEXITCODE"

Log '=== [2/3] fix-android.js ==='
node D:\personal\ai-agent-client\fix-android.js 2>&1 | Out-File -Append -Encoding utf8 $log
Log "fix-android exit=$LASTEXITCODE"

Log '=== [3/3] gradlew :app:installDebug ==='
Set-Location D:\personal\ai-agent-client\android
.\gradlew.bat --console=plain :app:installDebug 2>&1 | Out-File -Append -Encoding utf8 $log
Log "gradle exit=$LASTEXITCODE"
Log 'ALL_DONE'
