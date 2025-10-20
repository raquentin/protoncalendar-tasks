#!/bin/bash

if ! command -v convert &> /dev/null; then
    echo "error: imagemagick not found"
    echo "install: brew install imagemagick"
    exit 1
fi

cd "$(dirname "$0")/.."

echo "generating icons from svg..."

magick -background none icons/icon.svg -resize 16x16 icons/icon16.png
magick -background none icons/icon.svg -resize 48x48 icons/icon48.png
magick -background none icons/icon.svg -resize 128x128 icons/icon128.png

echo "done"

