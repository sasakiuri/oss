# build-win.ps1 — Saika Lane Windows Build Automation (OSS Monorepo)
#
# Usage:
#   pwsh -File scripts\build-win.ps1                              # Full build (all steps)
#   pwsh -File scripts\build-win.ps1 -Pack                        # Test build (pack only)
#   pwsh -File scripts\build-win.ps1 -SkipCopy                    # Re-build without re-copying source
#   pwsh -File scripts\build-win.ps1 -SkipCopy -SkipInstall       # Quick re-build
#   pwsh -File scripts\build-win.ps1 -Step prepare                # Steps 1-4 only
#   pwsh -File scripts\build-win.ps1 -Step install                # npm install only
#   pwsh -File scripts\build-win.ps1 -Step build                  # Build only
#   pwsh -File scripts\build-win.ps1 -Step build -Pack            # Test build only
#   pwsh -File scripts\build-win.ps1 -Step verify                 # Show results only
#
# Prerequisites:
#   - PowerShell 5.1+ (powershell.exe or pwsh.exe)
#   - Node.js / npm
#   - WSL with Debian (for source copy)
#   - Visual Studio Build Tools with "Desktop development with C++" workload
#
# WSL bash invocation (copy script to Windows first due to UNC path restrictions):
#   /c/Windows/System32/robocopy.exe \
#     '//wsl.localhost/<Distro>/<path-to-oss>/packages/saika-lane/scripts' \
#     'C:\tmp\saika-lane-build\scripts' build-win.ps1
#   powershell.exe -File 'C:\tmp\saika-lane-build\scripts\build-win.ps1' \
#     -WslMonorepoRoot '\\wsl.localhost\<Distro>\<path-to-oss>' -Step prepare

[CmdletBinding()]
param(
    [string]$BuildDir = 'C:\tmp\saika-lane-build',
    [string]$WslMonorepoRoot = '',
    [switch]$Pack,
    [switch]$SkipCopy,
    [switch]$SkipInstall,
    [ValidateSet('', 'prepare', 'install', 'build', 'verify')]
    [string]$Step = ''
)

$ErrorActionPreference = 'Stop'

# Validate required parameter
if (-not $SkipCopy -and $WslMonorepoRoot -eq '' -and ($Step -eq '' -or $Step -eq 'prepare')) {
    Write-Host "ERROR: -WslMonorepoRoot is required. Example: -WslMonorepoRoot '\\wsl.localhost\<Distro>\path\to\oss'" -ForegroundColor Red
    exit 1
}

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

# Derived paths
$PackageDir = Join-Path $BuildDir 'packages\saika-lane'
$SharedConfigPackages = @('eslint-config', 'prettier-config', 'stylelint-config', 'typescript-config')

function Write-Step {
    param([int]$Number, [string]$Message)
    Write-Host "`n[$Number] $Message" -ForegroundColor Cyan
    Write-Host ('-' * 60) -ForegroundColor DarkCyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "  OK: $Message" -ForegroundColor Green
}

function Write-Fail {
    param([string]$Message)
    Write-Host "  ERROR: $Message" -ForegroundColor Red
}

function Should-RunStep {
    param([string[]]$StepNames)
    return ($Step -eq '') -or ($Step -in $StepNames)
}

function Invoke-Robocopy {
    param([string]$Source, [string]$Dest, [string[]]$ExcludeDirs)
    $roboArgs = @($Source, $Dest, '/MIR')
    if ($ExcludeDirs.Count -gt 0) {
        $roboArgs += '/XD'
        $roboArgs += $ExcludeDirs
    }
    & robocopy @roboArgs
    if ($LASTEXITCODE -ge 8) {
        Write-Fail "robocopy failed: $Source -> $Dest (exit code $LASTEXITCODE)"
        exit 1
    }
    $LASTEXITCODE = 0
}

# --------------------------------------------------------------------------
# Steps 1-4: Prepare (stop process, copy source, patch configs)
# --------------------------------------------------------------------------
if (Should-RunStep 'prepare') {

# --------------------------------------------------------------------------
# Step 1: Stop existing process (DLL lock avoidance)
# --------------------------------------------------------------------------
Write-Step 1 'Stop existing Saika Lane process'

Stop-Process -Name 'Saika Lane' -ErrorAction SilentlyContinue
Write-Success 'Process stop attempted (ignored if not running)'

# --------------------------------------------------------------------------
# Step 2: Copy monorepo source from WSL to Windows
# --------------------------------------------------------------------------
Write-Step 2 'Copy monorepo source from WSL to Windows'

if ($SkipCopy) {
    Write-Host '  Skipped (-SkipCopy)' -ForegroundColor Yellow
} else {
    # 2a: Copy root files (package.json, turbo.json, etc.)
    Write-Host '  Copying root files...' -ForegroundColor DarkGray
    if (-not (Test-Path $BuildDir)) {
        New-Item -ItemType Directory -Path $BuildDir -Force | Out-Null
    }
    $rootFiles = @('package.json', 'package-lock.json', 'turbo.json')
    foreach ($file in $rootFiles) {
        $src = Join-Path $WslMonorepoRoot $file
        if (Test-Path $src) {
            Copy-Item -Path $src -Destination (Join-Path $BuildDir $file) -Force
            Write-Host "    Copied $file" -ForegroundColor DarkGray
        }
    }

    # 2b: Copy saika-lane package
    Write-Host '  Copying packages/saika-lane...' -ForegroundColor DarkGray
    $saikaLaneSrc = Join-Path $WslMonorepoRoot 'packages\saika-lane'
    Invoke-Robocopy $saikaLaneSrc $PackageDir @('node_modules', '.git', 'release', 'dist', 'logs', '.claude')
    Write-Success 'saika-lane copied'

    # 2c: Copy shared config packages (workspace dependencies)
    foreach ($configPkg in $SharedConfigPackages) {
        $configSrc = Join-Path $WslMonorepoRoot "packages\$configPkg"
        $configDest = Join-Path $BuildDir "packages\$configPkg"
        if (Test-Path $configSrc) {
            Write-Host "  Copying packages/$configPkg..." -ForegroundColor DarkGray
            Invoke-Robocopy $configSrc $configDest @('node_modules')
            Write-Success "$configPkg copied"
        } else {
            Write-Host "  Skipped packages/$configPkg (not found)" -ForegroundColor Yellow
        }
    }

    Write-Success "Monorepo source copied to $BuildDir"
}

# --------------------------------------------------------------------------
# Step 3: Patch root package.json for build (remove turbo, keep workspaces)
# --------------------------------------------------------------------------
Write-Step 3 'Patch root package.json for build'

$rootPkgPath = Join-Path $BuildDir 'package.json'
if (Test-Path $rootPkgPath) {
    $rootPkg = Get-Content -Path $rootPkgPath -Raw | ConvertFrom-Json

    # Remove turbo from devDependencies (not needed for build)
    if ($rootPkg.PSObject.Properties['devDependencies'] -and
        $rootPkg.devDependencies.PSObject.Properties['turbo']) {
        $rootPkg.devDependencies.PSObject.Properties.Remove('turbo')
        Write-Host '  Removed turbo from root devDependencies' -ForegroundColor DarkGray
    }

    $rootPkgContent = $rootPkg | ConvertTo-Json -Depth 20
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($rootPkgPath, $rootPkgContent, $utf8NoBom)
    Write-Success 'Root package.json patched'
} else {
    Write-Host '  No root package.json found, skipping' -ForegroundColor Yellow
}

# --------------------------------------------------------------------------
# Step 4: Replace tsconfig.json with inlined version
# --------------------------------------------------------------------------
Write-Step 4 'Replace tsconfig.json with inlined version'

# The tsconfig.json extends @sasakiuri/typescript-config/vite.json which chains
# to base.json. We inline the resolved settings so the build works without
# needing the workspace symlinks to be perfectly resolved by tsc.
$tsconfigPath = Join-Path $PackageDir 'tsconfig.json'
$tsconfigContent = @'
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "incremental": true,
    "useDefineForClassFields": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["@testing-library/jest-dom", "vitest/globals"],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist", "tests"]
}
'@

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($tsconfigPath, $tsconfigContent, $utf8NoBom)

Write-Success 'tsconfig.json replaced'

} # end prepare

# --------------------------------------------------------------------------
# Step 5: Install dependencies
# --------------------------------------------------------------------------
if (Should-RunStep 'install') {

Write-Step 5 'Run npm install (workspace root)'

if ($SkipInstall -and $Step -eq '') {
    Write-Host '  Skipped (-SkipInstall)' -ForegroundColor Yellow
} else {
    # Run npm install from the monorepo root so workspace linking works
    Push-Location $BuildDir
    try {
        & npm install --legacy-peer-deps
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "npm install failed with exit code $LASTEXITCODE"
            exit 1
        }
        Write-Success 'npm install completed'
    } finally {
        Pop-Location
    }
}

} # end install

# --------------------------------------------------------------------------
# Step 6: Run build
# --------------------------------------------------------------------------
if (Should-RunStep 'build') {

$buildCommand = if ($Pack) { 'pack:win' } else { 'build:win' }
Write-Step 6 "Run npm run $buildCommand"

# Build runs in the saika-lane package directory
Push-Location $PackageDir
try {
    & npm run $buildCommand
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "npm run $buildCommand failed with exit code $LASTEXITCODE"
        exit 1
    }
    Write-Success "npm run $buildCommand completed"
} finally {
    Pop-Location
}

} # end build

# --------------------------------------------------------------------------
# Step 7: Show results
# --------------------------------------------------------------------------
if (Should-RunStep 'verify') {

Write-Step 7 'Build results'

$releaseDir = Join-Path $PackageDir 'release'

if (Test-Path $releaseDir) {
    Write-Host "`n  Contents of $releaseDir :" -ForegroundColor White
    Get-ChildItem -Path $releaseDir -Recurse -File | ForEach-Object {
        $relativePath = $_.FullName.Substring($releaseDir.Length + 1)
        $sizeMB = [math]::Round($_.Length / 1MB, 2)
        Write-Host "    $relativePath  ($sizeMB MB)" -ForegroundColor White
    }

    Write-Host "`n  Installers / Archives:" -ForegroundColor Cyan
    $artifacts = Get-ChildItem -Path $releaseDir -Recurse -File |
        Where-Object { $_.Extension -in '.exe', '.zip', '.msi', '.nupkg' }

    if ($artifacts) {
        foreach ($file in $artifacts) {
            $sizeMB = [math]::Round($file.Length / 1MB, 2)
            Write-Host "    $($file.Name)  —  $sizeMB MB" -ForegroundColor Green
        }
    } else {
        Write-Host '    (no installer artifacts found)' -ForegroundColor Yellow
    }
} else {
    Write-Fail "Release directory not found: $releaseDir"
}

} # end verify

# --------------------------------------------------------------------------
# Done
# --------------------------------------------------------------------------
$stopwatch.Stop()
$elapsed = $stopwatch.Elapsed
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Build completed in $($elapsed.Minutes)m $($elapsed.Seconds)s" -ForegroundColor Green
Write-Host '========================================' -ForegroundColor Cyan
