#!/bin/bash
# Print a generated sheet (HTML) to a Letter PDF with headless Chrome.
# Usage: ./render_pdf.sh sheet.html sheet.pdf
set -e
HTML="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-pdf-header-footer \
  --virtual-time-budget=10000 --print-to-pdf="$2" "file://$HTML"
