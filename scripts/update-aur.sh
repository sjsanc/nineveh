#!/usr/bin/env bash
set -euo pipefail

AUR_REPO="aur@aur.archlinux.org:nineveh-bin.git"

# ── Configure SSH ─────────────────────────────────────────────────────────────
mkdir -p ~/.ssh
printf '%s\n' "${AUR_SSH_KEY}" > ~/.ssh/aur_key
chmod 600 ~/.ssh/aur_key

# AUR's known ed25519 host key — https://wiki.archlinux.org/title/AUR_submission_guidelines
cat >> ~/.ssh/known_hosts << 'EOF'
aur.archlinux.org ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEuBInoXFzoS8oj69DcEMQMdiVOJrNm/UBKCpQkLpCOA
EOF

export GIT_SSH_COMMAND="ssh -i ~/.ssh/aur_key -o IdentitiesOnly=yes"

# ── Clone AUR repo ────────────────────────────────────────────────────────────
git clone "${AUR_REPO}" aur-pkg
cd aur-pkg

# ── Update PKGBUILD ───────────────────────────────────────────────────────────
cp ../aur/PKGBUILD PKGBUILD
sed -i "s|^pkgver=.*|pkgver=${VERSION}|" PKGBUILD
sed -i "s|^pkgrel=.*|pkgrel=1|" PKGBUILD
sed -i "s|sha256sums=('PLACEHOLDER')|sha256sums=('${SHA256}')|" PKGBUILD

# ── Generate .SRCINFO via archlinux container ─────────────────────────────────
# makepkg is Arch-only; use the official image just for this one command.
docker run --rm \
  -v "$(pwd)":/pkg \
  -w /pkg \
  --user "$(id -u):$(id -g)" \
  archlinux:base \
  bash -c "makepkg --printsrcinfo > .SRCINFO"

# ── Commit and push ───────────────────────────────────────────────────────────
git config user.email "sjsanc@protonmail.com"
git config user.name "sjsanc"
git add PKGBUILD .SRCINFO
git commit -m "update to v${VERSION}"
git push origin master
