/**
 * Generates PWA icons for TCG Field Check.
 * Run: node scripts/generate-icons.cjs
 */
const { createCanvas } = require('canvas')
const fs = require('fs')
const path = require('path')

const PUBLIC = path.join(__dirname, '..', 'public')

function drawIcon(size, maskable) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  // Background — always fills the entire canvas
  ctx.fillStyle = '#16A34A'
  ctx.fillRect(0, 0, size, size)

  if (!maskable) {
    // Slight rounding via clip path only for non-maskable (visual hint; still square PNG)
    // (PNG has no rounded corners concept; the OS clips it. Nothing needed here.)
  }

  // Safe zone: for maskable icons content must live inside the central 80%
  const safeInset = maskable ? size * 0.10 : 0
  const safeSize = size - safeInset * 2

  // --- TCG text ---
  const tcgFontSize = Math.round(safeSize * 0.38)
  ctx.fillStyle = '#FFFFFF'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `bold ${tcgFontSize}px Arial, sans-serif`

  // Position TCG in upper-center of safe zone
  const tcgY = safeInset + safeSize * 0.56
  ctx.fillText('TCG', size / 2, tcgY)

  // --- FC text ---
  const fcFontSize = Math.round(safeSize * 0.20)
  ctx.font = `${fcFontSize}px Arial, sans-serif`
  const fcY = tcgY + fcFontSize * 1.15
  ctx.fillText('FC', size / 2, fcY)

  return canvas
}

const variants = [
  { name: 'icon-192.png',          size: 192, maskable: false },
  { name: 'icon-512.png',          size: 512, maskable: false },
  { name: 'icon-192-maskable.png', size: 192, maskable: true  },
  { name: 'icon-512-maskable.png', size: 512, maskable: true  },
]

for (const { name, size, maskable } of variants) {
  const canvas = drawIcon(size, maskable)
  const buffer = canvas.toBuffer('image/png')
  const outPath = path.join(PUBLIC, name)
  fs.writeFileSync(outPath, buffer)
  console.log(`✓ ${name}  (${size}x${size}, maskable=${maskable})  → ${buffer.length} bytes`)
}

console.log('\nAll icons written to public/')
