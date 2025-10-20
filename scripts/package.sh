#!/bin/bash

echo "packaging extension..."

if [ ! -f "icons/icon16.png" ] || [ ! -f "icons/icon48.png" ] || [ ! -f "icons/icon128.png" ]; then
    echo "error: icons not found"
    echo "run: ./scripts/generate_icons.sh"
    exit 1
fi

mkdir -p dist

EXT_NAME="protoncalendar-tasks"
VERSION=$(grep '"version"' manifest.json | sed -E 's/.*"([0-9.]+)".*/\1/')

FILES=(
    "manifest.json"
    "content.js"
    "styles.css"
    "popup.html"
    "icons/icon16.png"
    "icons/icon48.png"
    "icons/icon128.png"
    "README.md"
    "LICENSE"
)

CHROME_ZIP="dist/${EXT_NAME}-chrome-v${VERSION}.zip"
FIREFOX_ZIP="dist/${EXT_NAME}-firefox-v${VERSION}.zip"

echo "creating packages..."
zip -q "${CHROME_ZIP}" "${FILES[@]}"
cp "${CHROME_ZIP}" "${FIREFOX_ZIP}"

echo ""
echo "done"
echo "  chrome: ${CHROME_ZIP}"
echo "  firefox: ${FIREFOX_ZIP}"
