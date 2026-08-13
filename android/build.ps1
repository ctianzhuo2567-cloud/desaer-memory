# Build the WebView APK. Run from repo root:
#   powershell -ExecutionPolicy Bypass -File android\build.ps1
# All build-tool arguments are relative ASCII paths (native tools choke on the
# Chinese characters in the repository path), so we chdir into android/ first.
$ErrorActionPreference = "Stop"

$repo = Split-Path $PSScriptRoot -Parent
$jdk = "F:\android-tools\jdk-17.0.20+8"
$sdk = "F:\android-tools"
$androidJar = Join-Path $sdk "platforms\android-35\android.jar"
$bt = Join-Path $sdk "build-tools\35.0.0"
$proj = Join-Path $repo "android"
$passFile = Join-Path $proj "keystore.pass"
$ks = Join-Path $proj "desaer-release.jks"

$env:JAVA_HOME = $jdk
$env:PATH = "$jdk\bin;$env:PATH"

New-Item -ItemType Directory -Force (Join-Path $proj "dist"), (Join-Path $proj "classes"), (Join-Path $proj "dex") | Out-Null
Remove-Item -LiteralPath (Join-Path $proj "dex\classes.dex") -Force -ErrorAction SilentlyContinue

Push-Location $proj
try {
    & "$jdk\bin\javac.exe" -encoding UTF-8 -source 8 -target 8 -bootclasspath $androidJar -d classes "MainActivity.java"
    if($LASTEXITCODE -ne 0){ throw "javac failed" }

    & "$bt\d8.bat" --release --lib $androidJar --min-api 29 --output dex "classes\com\desaer\memory\MainActivity.class"
    if($LASTEXITCODE -ne 0){ throw "d8 failed" }

    & "$bt\aapt2.exe" compile --dir res -o res.zip
    if($LASTEXITCODE -ne 0){ throw "aapt2 compile failed" }

    & "$bt\aapt2.exe" link -o app.unsigned.apk -I $androidJar --manifest AndroidManifest.xml -R res.zip --auto-add-overlay --min-sdk-version 29 --target-sdk-version 35
    if($LASTEXITCODE -ne 0){ throw "aapt2 link failed" }

    Push-Location dex
    & "$jdk\bin\jar.exe" uf "..\app.unsigned.apk" "classes.dex"
    if($LASTEXITCODE -ne 0){ Pop-Location; throw "jar add dex failed" }
    Pop-Location

    & "$bt\zipalign.exe" -f -p 4 app.unsigned.apk app.aligned.apk
    if($LASTEXITCODE -ne 0){ throw "zipalign failed" }

    if(-not (Test-Path $ks)){
        $pass = -join ((48..57)+(97..122) | Get-Random -Count 20 | ForEach-Object {[char]$_})
        Set-Content -Path $passFile -Value $pass -Encoding ascii
        & "$jdk\bin\keytool.exe" -genkeypair -keystore desaer-release.jks -storepass $pass -keypass $pass -alias desaer -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Desaer Memory, OU=Internal, O=Desaer, L=CN" | Out-Null
        if($LASTEXITCODE -ne 0){ throw "keytool failed" }
    }
    $pass = (Get-Content -Raw $passFile).Trim()

    & "$bt\apksigner.bat" sign --ks desaer-release.jks --ks-pass "pass:$pass" --key-pass "pass:$pass" --ks-key-alias desaer --out "dist\desaer-memory.apk" app.aligned.apk
    if($LASTEXITCODE -ne 0){ throw "apksigner failed" }

    & "$bt\apksigner.bat" verify --print-certs "dist\desaer-memory.apk"
    if($LASTEXITCODE -ne 0){ throw "verify failed" }
}
finally {
    Pop-Location
}

Write-Output ""
Write-Output "APK ready: $(Join-Path $proj 'dist\desaer-memory.apk')"
