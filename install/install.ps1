# PeerBand installer for Windows PowerShell 5.1 and PowerShell 7+.
#
#   irm https://peerband.com/install.ps1 | iex
#       Installs the CLI, then runs the interactive `peerband login` (opens your browser).
#       Headless/CI only: use a dashboard grant instead of the browser, e.g.
#       $env:PEERBAND_GRANT = 'GRANT'; $env:PEERBAND_NAME = 'my-pc'; irm https://peerband.com/install.ps1 | iex
#
#   & ([scriptblock]::Create((irm https://peerband.com/install.ps1))) -Grant GRANT -Name my-pc
#
# Env: PEERBAND_GRANT, PEERBAND_NAME, PEERBAND_VERSION (default latest),
#      PEERBAND_PACKAGE (tarball path or git URL; overrides the npm package).
# There is deliberately no param() block so that `irm | iex` works.

$ErrorActionPreference = 'Stop'
$pbGrant = $env:PEERBAND_GRANT
$pbName = $env:PEERBAND_NAME
$pbShowHelp = $false
$pbUsageError = $null
$pbColor = -not $env:NO_COLOR
$pbIsFile = [bool]$PSCommandPath

for ($i = 0; $i -lt $args.Count; $i++) {
    switch -Regex ([string]$args[$i]) {
        '^-{1,2}(Grant)$' { if ($i + 1 -lt $args.Count) { $pbGrant = [string]$args[++$i] } else { $pbUsageError = '-Grant needs a value' } }
        '^-{1,2}(Name)$' { if ($i + 1 -lt $args.Count) { $pbName = [string]$args[++$i] } else { $pbUsageError = '-Name needs a value' } }
        '^(-{1,2}(Help|h)|/\?)$' { $pbShowHelp = $true }
        default { $pbUsageError = "unknown argument: $($args[$i])" }
    }
}

function Say($Text, $Color = $null) {
    if ($pbColor -and $Color) { Write-Host $Text -ForegroundColor $Color } else { Write-Host $Text }
}
function Fail($Message, [int]$Code = 1) {
    [Console]::Error.WriteLine("error: $Message")
    if ($script:pbIsFile) { exit $Code }
    # `exit` would close the user's shell under `irm | iex`; stop the script instead.
    throw "PeerBand installer stopped (see the error above)."
}

if ($pbShowHelp) {
    Say @'
PeerBand installer

Usage: install.ps1 [-Name NAME] [-Grant GRANT]

By default the installer runs "peerband login", which opens your browser to sign in.

  -Name NAME     machine name shown in the dashboard (default: hostname)
  -Grant GRANT   headless/CI only: short-lived enrollment grant from the PeerBand dashboard,
                 used instead of the browser sign-in
  -Help          show this help

Environment: PEERBAND_GRANT, PEERBAND_NAME, PEERBAND_VERSION, PEERBAND_PACKAGE
'@
    if ($pbIsFile) { exit 0 } else { return }
}
if ($pbUsageError) { Fail "install.ps1: $pbUsageError (try -Help)" 2 }
$env:PEERBAND_GRANT = $null

Say '==> Checking Node.js' Cyan
$nodeUrl = 'https://nodejs.org/en/download'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "Node.js 22.13 or newer is required but was not found. Install it from $nodeUrl and re-run." }
$nodeRaw = ((& node --version) | Select-Object -First 1)
$nodeVer = $null
$nodeText = ([string]$nodeRaw).Trim().TrimStart('v')
if (-not [version]::TryParse($nodeText, [ref]$nodeVer)) { Fail "Could not read the Node.js version (got '$nodeRaw'). Install Node.js 22.13+ from $nodeUrl" }
if ($nodeVer -lt [version]'22.13') { Fail "Node.js $nodeVer is too old; PeerBand needs 22.13 or newer. Install it from $nodeUrl and re-run." }
Say "  ok Node.js $nodeVer" Green
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { Fail "npm was not found next to Node.js. Reinstall Node.js from $nodeUrl" }

Say '==> Installing the peerband CLI' Cyan
$pbVersion = if ($env:PEERBAND_VERSION) { $env:PEERBAND_VERSION } else { 'latest' }
$pkg = if ($env:PEERBAND_PACKAGE) { $env:PEERBAND_PACKAGE } else { "peerband@$pbVersion" }
& npm.cmd install -g $pkg
if ($LASTEXITCODE -ne 0) { Fail "npm install -g $pkg failed (exit $LASTEXITCODE)." }
# Run the CLI this installer just put in npm's global prefix by full path, so
# another `peerband` earlier on PATH is never run in its place.
$prefix = ((& npm.cmd prefix -g) | Select-Object -First 1)
$pbExe = if ($prefix) { Join-Path $prefix 'peerband.cmd' } else { $null }
if (-not $pbExe -or -not (Test-Path $pbExe)) { Fail "peerband was installed but is missing from the npm prefix ('npm prefix -g'). Re-run the installer." }
$pbOnPath = Get-Command peerband -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $pbOnPath) {
    $env:PATH = "$prefix;$env:PATH"
    Say "  !! $prefix is not on your PATH. Add it under Settings > System > About > Advanced system settings > Environment Variables." Yellow
} elseif ([IO.Path]::GetFullPath($pbOnPath.Source) -ne [IO.Path]::GetFullPath($pbExe)) {
    Say "  !! Another peerband command comes first on your PATH: $($pbOnPath.Source)" Yellow
    Say "     Remove it, or move $prefix ahead of it in PATH, so 'peerband' runs this CLI." Yellow
}
Say '  ok peerband installed' Green

Say '==> Logging in' Cyan
$loginArgs = @('login', '--herdr-plugin', 'install')
if ($pbName) { $loginArgs += @('--name', $pbName) }
try {
    if ($pbGrant) { $env:PEERBAND_GRANT = $pbGrant }
    & $pbExe @loginArgs
    $loginCode = $LASTEXITCODE
} finally {
    $env:PEERBAND_GRANT = $null
    $pbGrant = $null
}
if ($loginCode -ne 0) { Fail "peerband login failed. Run 'peerband login' again, or on a headless machine use 'peerband login --grant GRANT' with a grant from your PeerBand dashboard." }

# `peerband login --herdr-plugin install` has already added the plugin to Herdr when Herdr is present.
$pbHasHerdr = [bool](Get-Command herdr -ErrorAction SilentlyContinue)

Say ''
if ($pbHasHerdr) {
    Say 'PeerBand is ready. Next:' Green
    Say '  peerband relay    open the PeerBand Relay tab in Herdr'
    Say '  peerband status   check your connection (and the Herdr plugin)'
} else {
    Say 'PeerBand is installed and logged in. Next:' Green
    Say '  1. Install Herdr 0.9.3 or newer: https://herdr.dev'
    Say '  2. peerband herdr install   then   peerband relay'
    Say '  peerband status   check your connection'
}
