/**
 * Generates PWA icons for CheckFlow.
 * Run: node scripts/generate-icons.cjs
 */
const { createCanvas } = require('canvas')
const fs = require('fs')
const path = require('path')

const PUBLIC = path.join(__dirname, '..', 'public')
const GREEN = '#16A34A'
const WHITE = '#FFFFFF'

function drawIcon(size, maskable) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  if (maskable) {
    // Maskable: fill entire canvas — OS applies its own mask
    ctx.fillStyle = GREEN
    ctx.fillRect(0, 0, size, size)
  } else {
    // Standard: rounded-square background (iOS-style ~22% corner radius)
    const r = size * 0.22
    ctx.fillStyle = GREEN
    ctx.beginPath()
    ctx.moveTo(r, 0)
    ctx.lineTo(size - r, 0)
    ctx.quadraticCurveTo(size, 0, size, r)
    ctx.lineTo(size, size - r)
    ctx.quadraticCurveTo(size, size, size - r, size)
    ctx.lineTo(r, size)
    ctx.quadraticCurveTo(0, size, 0, size - r)
    ctx.lineTo(0, r)
    ctx.quadraticCurveTo(0, 0, r, 0)
    ctx.closePath()
    ctx.fill()
  }

  // Safe zone — maskable must keep content inside central 80%
  const safeInset = maskable ? size * 0.10 : 0
  const safeSize = size - safeInset * 2

  // "CF" — bold, modern sans-serif, centered
  const fontSize = Math.round(safeSize * 0.58)
  ctx.fillStyle = WHITE
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `900 ${fontSize}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`
  // tiny downward optical nudge so the glyphs sit visually centered
  ctx.fillText('CF', size / 2, size / 2 + size * 0.02)

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
  console.log(`wrote ${name}  ${size}x${size}  maskable=${maskable}  ${buffer.length} bytes`)
}

console.log('\nAll icons written to public/')
