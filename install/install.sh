#!/bin/sh
# PeerBand installer.
#   curl -fsSL https://peerband.com/install.sh | sh
#       Installs the CLI, then runs the interactive `peerband setup` (browser login, Herdr plugin, agent skill, relay).
#   curl -fsSL https://peerband.com/install.sh | sh -s -- --grant GRANT --name NAME
#       Headless/CI only: enroll with a dashboard grant instead of the browser.
# Env: PEERBAND_GRANT, PEERBAND_NAME, PEERBAND_VERSION (default latest),
#      PEERBAND_PACKAGE (tarball path or git URL; overrides the npm package).
set -eu

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  B=$(printf '\033[1m'); G=$(printf '\033[32m'); R=$(printf '\033[31m'); Y=$(printf '\033[33m'); N=$(printf '\033[0m')
else
  B=''; G=''; R=''; Y=''; N=''
fi
step() { printf '%s==>%s %s\n' "$B" "$N" "$1"; }
ok() { printf '%s  ok%s %s\n' "$G" "$N" "$1"; }
warn() { printf '%s  !!%s %s\n' "$Y" "$N" "$1"; }
die() { printf '%serror:%s %s\n' "$R" "$N" "$1" >&2; exit 1; }

usage() {
  cat <<USAGE
PeerBand installer

Usage: install.sh [--name NAME] [--grant GRANT]

By default the installer runs "peerband setup": it opens your browser to sign in, adds the
PeerBand plugin to Herdr, offers the PeerBand skill for your coding agents and opens the relay.

  --name NAME     machine name shown in the dashboard (default: hostname)
  --grant GRANT   headless/CI only: short-lived enrollment grant from the PeerBand dashboard,
                  used instead of the browser sign-in
  -h, --help      show this help

Environment: PEERBAND_GRANT, PEERBAND_NAME, PEERBAND_VERSION, PEERBAND_PACKAGE
USAGE
}

grant=${PEERBAND_GRANT:-}
name=${PEERBAND_NAME:-}
while [ $# -gt 0 ]; do
  case $1 in
    -h|--help) usage; exit 0 ;;
    --grant) [ $# -ge 2 ] || { echo "install.sh: --grant needs a value" >&2; exit 2; }; grant=$2; shift 2 ;;
    --name) [ $# -ge 2 ] || { echo "install.sh: --name needs a value" >&2; exit 2; }; name=$2; shift 2 ;;
    *) echo "install.sh: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done
unset PEERBAND_GRANT

step "Checking Node.js"
nodeurl=https://nodejs.org/en/download
command -v node >/dev/null 2>&1 || die "Node.js 22.13 or newer is required but was not found. Install it from $nodeurl and re-run."
nodever=$(node --version 2>/dev/null | sed 's/^v//') || nodever=''
major=${nodever%%.*}; rest=${nodever#*.}; minor=${rest%%.*}
case "$major$minor" in ''|*[!0-9]*) die "Could not read the Node.js version (got '$nodever'). Install Node.js 22.13+ from $nodeurl" ;; esac
if [ "$major" -lt 22 ] || { [ "$major" -eq 22 ] && [ "$minor" -lt 13 ]; }; then
  die "Node.js $nodever is too old; PeerBand needs 22.13 or newer. Install it from $nodeurl and re-run."
fi
ok "Node.js $nodever"
command -v npm >/dev/null 2>&1 || die "npm was not found next to Node.js. Reinstall Node.js from $nodeurl"

step "Installing the peerband CLI"
pkg=${PEERBAND_PACKAGE:-peerband@${PEERBAND_VERSION:-latest}}
npm install -g "$pkg" || die "npm install -g $pkg failed. If this is a permissions error, configure an npm prefix you own (https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally)."
# Run the CLI this installer just put in npm's global prefix by full path, so
# another `peerband` earlier on PATH is never run in its place.
bindir=$(npm prefix -g 2>/dev/null || true)/bin
pb="$bindir/peerband"
[ -x "$pb" ] || die "peerband was installed but is missing from $bindir ('npm prefix -g'). Re-run the installer."
onpath=$(command -v peerband 2>/dev/null || true)
if [ -z "$onpath" ]; then
  warn "$bindir is not on your PATH. Add this to your shell profile: export PATH=\"$bindir:\$PATH\""
elif [ "$onpath" != "$pb" ]; then
  warn "Another peerband command comes first on your PATH: $onpath"
  warn "Remove it, or put $bindir ahead of it in PATH, so 'peerband' runs this CLI."
fi
ok "peerband installed"

step "Setting up"
if [ -n "$grant" ]; then
  if [ -n "$name" ]; then
    PEERBAND_GRANT=$grant "$pb" setup --herdr-plugin install --skill install --name "$name" || die "peerband setup failed. Get a fresh grant from your PeerBand dashboard."
  else
    PEERBAND_GRANT=$grant "$pb" setup --herdr-plugin install --skill install || die "peerband setup failed. Get a fresh grant from your PeerBand dashboard."
  fi
else
  # Browser sign-in. Under `curl | sh` stdin is the script itself; use the terminal instead.
  set -- --herdr-plugin install
  [ -z "$name" ] || set -- "$@" --name "$name"
  if (exec </dev/tty) 2>/dev/null; then
    "$pb" setup "$@" </dev/tty
  else
    "$pb" setup "$@"
  fi || die "peerband setup failed. Run 'peerband setup' again, or on a headless machine use 'peerband setup --grant GRANT' with a grant from your PeerBand dashboard."
fi
grant=''

# `peerband setup` has already added the plugin, offered the skill and opened the relay when Herdr is present.
if command -v herdr >/dev/null 2>&1; then
  printf '\n%sPeerBand is installed.%s Check it any time with: peerband status\n' "$G" "$N"
else
  warn "Herdr was not found. PeerBand reaches the agents you run in Herdr."
  printf '\n%sPeerBand is installed and logged in.%s Next:\n  1. Install Herdr 0.9.3 or newer: https://herdr.dev\n  2. peerband setup   adds the Herdr plugin and opens the relay\n  peerband status   check your connection\n' "$G" "$N"
fi
