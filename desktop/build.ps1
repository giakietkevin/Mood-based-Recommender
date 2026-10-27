# Builds the KietStation Windows installer (KietStation-Setup-<version>.exe) with the Python backend bundled.
#
#   powershell -ExecutionPolicy Bypass -File desktop\build.ps1 [-BuildDir D:\KietStation-build] [-Version 1.0.0] [-IncludeEnv]
#
# Needs: Node.js, Rust (MSVC toolchain), Inno Setup 6, ffmpeg on PATH, internet for the downloads.
# Everything heavy (Python + TensorFlow, Rust build output, pip cache, temp files) goes under -BuildDir:
# the build takes ~6-8 GB, so point it at a drive with room.
# -IncludeEnv ships the repo's .env (MongoDB login, API keys) inside the installer. Leave it off for an
# installer you hand to other people: anyone who has the file can read those secrets.

param(
    [string]$BuildDir = "D:\KietStation-build",
    [string]$Version = "1.0.0",
    [switch]$IncludeEnv
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # Invoke-WebRequest is many times slower with the progress bar
$Repo = Split-Path $PSScriptRoot -Parent
$PyVersion = "3.12.9"
$App = Join-Path $BuildDir "app"
$Cache = Join-Path $BuildDir "cache"
$Py = Join-Path $App "python"
$PyExe = Join-Path $Py "python.exe"

New-Item -ItemType Directory -Force $App, $Cache, (Join-Path $BuildDir "tmp") | Out-Null
# pip unpacks TensorFlow through TEMP and keeps its cache under LOCALAPPDATA: keep both off the system drive
$env:TEMP = Join-Path $BuildDir "tmp"
$env:TMP = $env:TEMP
$env:PIP_CACHE_DIR = Join-Path $Cache "pip"

function Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Check($what) { if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE)" } }
function Download($url, $dest) {
    if (-not (Test-Path $dest)) {
        Write-Host "    download $url"
        Invoke-WebRequest -Uri $url -OutFile "$dest.part" -UseBasicParsing
        Move-Item "$dest.part" $dest
    }
}

# --- 1. Python runtime + packages (reused between builds until requirements.txt changes) ---
$reqHash = (Get-FileHash (Join-Path $Repo "requirements.txt")).Hash.Substring(0, 12)
$marker = Join-Path $Py ".requirements-$reqHash"
if (Test-Path $marker) {
    Step "Python $PyVersion with requirements.txt already installed"
} else {
    Step "Installing Python $PyVersion (embeddable) and requirements.txt"
    if (Test-Path $Py) { Remove-Item -Recurse -Force $Py }
    $zip = Join-Path $Cache "python-$PyVersion-embed-amd64.zip"
    Download "https://www.python.org/ftp/python/$PyVersion/python-$PyVersion-embed-amd64.zip" $zip
    Expand-Archive $zip $Py

    # The ._pth file is the whole sys.path of an embeddable Python: add site-packages and the server folder
    $tag = ($PyVersion.Split(".")[0..1] -join "")
    Set-Content -Encoding ascii (Join-Path $Py "python$tag._pth") @(
        "python$tag.zip", ".", "Lib\site-packages", "..\server", "import site"
    )

    # TensorFlow needs the C++ runtime next to python.exe; machines without the VC++ redistributable lack it
    foreach ($dll in "msvcp140.dll", "msvcp140_1.dll", "msvcp140_2.dll", "vcruntime140_1.dll", "concrt140.dll") {
        $src = Join-Path $env:WINDIR "System32\$dll"
        if (Test-Path $src) { Copy-Item $src $Py }
    }

    $getPip = Join-Path $Cache "get-pip.py"
    Download "https://bootstrap.pypa.io/get-pip.py" $getPip
    & $PyExe $getPip --no-warn-script-location; Check "get-pip"
    & $PyExe -m pip install --no-warn-script-location setuptools wheel; Check "pip install setuptools"
    # build isolation cannot see the ._pth paths, so sdist-only packages are built with the setuptools above
    & $PyExe -m pip install --no-warn-script-location --no-build-isolation -r (Join-Path $Repo "requirements.txt")
    Check "pip install -r requirements.txt"
    New-Item -ItemType File $marker | Out-Null
}

# --- 2. Backend + web UI ---
Step "Copying the server files"
$Server = Join-Path $App "server"
if (Test-Path $Server) { Remove-Item -Recurse -Force $Server }
New-Item -ItemType Directory $Server | Out-Null
$files = @(
    "index.html", "manifest.json", "sw.js", "main.py", "auth.py", "config.py", "hf_music_gen.py", "rvc_engine.py",
    "trending_songs.json", "favicon.ico", "favicon-16x16.png", "favicon-32x32.png", "apple-touch-icon.png",
    "android-chrome-192x192.png", "android-chrome-512x512.png", "maskable-512x512.png"
)
foreach ($f in $files) { Copy-Item (Join-Path $Repo $f) $Server }
foreach ($d in "routers", "services", "css", "js", "beats", "models") {
    Copy-Item -Recurse (Join-Path $Repo $d) $Server
}
Get-ChildItem -Recurse -Directory -Filter "__pycache__" $Server | Remove-Item -Recurse -Force
if ($IncludeEnv) {
    Write-Host "    including .env (do not share this installer)" -ForegroundColor Yellow
    Copy-Item (Join-Path $Repo ".env") $Server
}

Step "Downloading CDN libraries and fonts so the UI works offline"
& $PyExe -I (Join-Path $PSScriptRoot "vendor_assets.py") $Server; Check "vendor_assets.py"

# --- 3. ffmpeg (pydub) and the DeepFace emotion model ---
Step "Bundling ffmpeg"
$ff = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (-not $ff) { throw "ffmpeg not found on PATH. Install it with: winget install Gyan.FFmpeg" }
$ffPath = $ff.Source
$target = (Get-Item $ffPath).Target   # winget puts a symlink on PATH
if ($target) { $ffPath = @($target)[0] }
$Bin = Join-Path $App "bin"
New-Item -ItemType Directory -Force $Bin | Out-Null
$ffDir = Split-Path $ffPath
Copy-Item (Join-Path $ffDir "ffmpeg.exe") $Bin
if (Test-Path (Join-Path $ffDir "ffprobe.exe")) { Copy-Item (Join-Path $ffDir "ffprobe.exe") $Bin }

Step "Bundling the DeepFace emotion model"
# the launcher sets DEEPFACE_HOME=<app>\deepface, so DeepFace never downloads it at runtime
$weights = Join-Path $App "deepface\.deepface\weights"
New-Item -ItemType Directory -Force $weights | Out-Null
$model = "facial_expression_model_weights.h5"
$local = Join-Path $env:USERPROFILE ".deepface\weights\$model"
if (Test-Path $local) { Copy-Item $local $weights }
else { Download "https://github.com/serengil/deepface_models/releases/download/v1.0/$model" (Join-Path $weights $model) }

# --- 4. Launcher ---
Step "Building the launcher (Tauri)"
# Rust picks the newest Visual Studio by itself, even one installed without the C++ libraries (LNK1104 msvcrt.lib).
# Load the environment of an install that has the x64 C++ tools; rustc uses it when VCINSTALLDIR is set.
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vswhere) {
    $vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    $vcvars = if ($vs) { Join-Path $vs "VC\Auxiliary\Build\vcvars64.bat" }
    if ($vcvars -and (Test-Path $vcvars)) {
        Write-Host "    using $vs"
        cmd /c "`"$vcvars`" >nul && set" | ForEach-Object {
            if ($_ -match "^([^=]+)=(.*)$") { Set-Item "env:$($Matches[1])" $Matches[2] }
        }
    }
}
$launcher = Join-Path $PSScriptRoot "launcher"
$env:CARGO_TARGET_DIR = Join-Path $BuildDir "cargo-target"
Push-Location $launcher
try {
    if (-not (Test-Path "node_modules")) { npm install --no-audit --no-fund; Check "npm install" }
    npx tauri build --no-bundle; Check "tauri build"
} finally { Pop-Location }
Copy-Item (Join-Path $env:CARGO_TARGET_DIR "release\kietstation.exe") (Join-Path $App "KietStation.exe")
Copy-Item (Join-Path $launcher "src-tauri\icons\icon.ico") (Join-Path $App "KietStation.ico")

# --- 5. Installer ---
Step "Building the installer (Inno Setup)"
$iscc = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe"),
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw "Inno Setup 6 not found. Install it with: winget install JRSoftware.InnoSetup" }
$Out = Join-Path $BuildDir "out"
& $iscc "/DAppDir=$App" "/DOutDir=$Out" "/DAppVersion=$Version" (Join-Path $PSScriptRoot "installer.iss")
Check "ISCC"

Step "Done: $(Join-Path $Out "KietStation-Setup-$Version.exe")"
