#!/usr/bin/env bash
set -euo pipefail

REPO="nxank4/yeastbook"
INSTALL_DIR="$HOME/.local/bin"
BIN_NAME="yeastbook"

# Detect OS
OS="$(uname -s)"
case "$OS" in
  Linux*)  OS_NAME="linux" ;;
  Darwin*) OS_NAME="darwin" ;;
  *)       echo "Error: Unsupported OS: $OS"; exit 1 ;;
esac

# Detect architecture
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)       ARCH_NAME="x64" ;;
  aarch64|arm64) ARCH_NAME="arm64" ;;
  *)            echo "Error: Unsupported architecture: $ARCH"; exit 1 ;;
esac

# Map to binary name
case "${OS_NAME}-${ARCH_NAME}" in
  linux-x64)   BINARY="yeastbook-linux" ;;
  linux-arm64)  BINARY="yeastbook-linux-arm64" ;;
  darwin-arm64) BINARY="yeastbook-macos-arm" ;;
  darwin-x64)   BINARY="yeastbook-macos-x64" ;;
  *)            echo "Error: No binary for ${OS_NAME}-${ARCH_NAME}"; exit 1 ;;
esac

echo "Detected: ${OS_NAME} ${ARCH_NAME} → ${BINARY}"

# Get latest release tag
echo "Fetching latest release..."
TAG=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | cut -d'"' -f4)
if [ -z "$TAG" ]; then
  echo "Error: Could not fetch latest release"
  exit 1
fi
echo "Latest release: ${TAG}"

# Download binary
DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/${BINARY}"
echo "Downloading ${DOWNLOAD_URL}..."
mkdir -p "$INSTALL_DIR"
curl -fsSL "$DOWNLOAD_URL" -o "${INSTALL_DIR}/${BIN_NAME}"
chmod +x "${INSTALL_DIR}/${BIN_NAME}"

echo ""
echo "Installed ${BIN_NAME} ${TAG} to ${INSTALL_DIR}/${BIN_NAME}"

# Check if install dir is in PATH
if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
  echo ""
  echo "WARNING: ${INSTALL_DIR} is not in your PATH."
  echo "Add it by running:"
  echo ""
  echo "  echo 'export PATH=\"${INSTALL_DIR}:\$PATH\"' >> ~/.bashrc && source ~/.bashrc"
  echo ""
fi

echo ""
echo "Get started:"
echo "  yeastbook new    # Create a new notebook"
echo "  yeastbook open   # Open an existing notebook"
