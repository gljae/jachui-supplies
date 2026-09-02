import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * PWA 아이콘을 만든다. `node scripts/make-icons.mjs`
 *
 * 이미지 라이브러리를 쓰지 않고 PNG를 직접 인코딩한다. 아이콘 하나 만들자고
 * sharp 같은 네이티브 의존성을 물고 들어오면 설치가 무거워지고 CI에서 잘 깨진다.
 * 도형 몇 개를 4배로 그린 뒤 줄여 계단을 없애는 정도면 충분하다.
 */

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const INDIGO = [79, 70, 229] // #4f46e5 — 앱 액센트와 같은 색
const WHITE = [255, 255, 255]
const SS = 4 // 슈퍼샘플링 배수

// ─── PNG 인코딩 ───────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = -1
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** rgba: Uint8Array(size * size * 4) */
function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  // 10~12은 compression / filter / interlace, 전부 0

  // 각 줄 앞에 필터 바이트 0을 붙인다
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    const at = y * (size * 4 + 1)
    raw[at] = 0
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, at + 1)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ─── 도형 ─────────────────────────────────────────────────────────────────

function makeCanvas(size) {
  return { size, px: new Uint8Array(size * size * 4) }
}

function setPixel(canvas, x, y, [r, g, b]) {
  const at = (y * canvas.size + x) * 4
  canvas.px[at] = r
  canvas.px[at + 1] = g
  canvas.px[at + 2] = b
  canvas.px[at + 3] = 255
}

function insideRoundRect(px, py, x, y, w, h, radius) {
  if (px < x || py < y || px >= x + w || py >= y + h) return false
  const r = Math.min(radius, w / 2, h / 2)
  if (r <= 0) return true

  // 네 모서리에서만 원 안쪽인지 본다
  const cx = px < x + r ? x + r : px > x + w - r ? x + w - r : px
  const cy = py < y + r ? y + r : py > y + h - r ? y + h - r : py
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r
}

function fillRoundRect(canvas, x, y, w, h, radius, color) {
  for (let py = Math.max(0, Math.floor(y)); py < Math.min(canvas.size, Math.ceil(y + h)); py++) {
    for (let px = Math.max(0, Math.floor(x)); px < Math.min(canvas.size, Math.ceil(x + w)); px++) {
      if (insideRoundRect(px + 0.5, py + 0.5, x, y, w, h, radius)) setPixel(canvas, px, py, color)
    }
  }
}

function downsample(canvas, factor) {
  const size = canvas.size / factor
  const out = makeCanvas(size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const at = ((y * factor + dy) * canvas.size + (x * factor + dx)) * 4
          r += canvas.px[at]
          g += canvas.px[at + 1]
          b += canvas.px[at + 2]
          a += canvas.px[at + 3]
        }
      }
      const n = factor * factor
      const at = (y * size + x) * 4
      out.px[at] = Math.round(r / n)
      out.px[at + 1] = Math.round(g / n)
      out.px[at + 2] = Math.round(b / n)
      out.px[at + 3] = Math.round(a / n)
    }
  }
  return out
}

/**
 * 세제통 실루엣. 몸통 + 목 + 뚜껑.
 *
 * maskable은 런처가 원이나 물방울로 잘라내므로 바깥 20%를 안전지대로 비워둔다.
 * 배경도 모서리를 둥글리지 않고 꽉 채운다 — 런처가 알아서 자른다.
 */
function drawIcon(size, { maskable }) {
  const canvas = makeCanvas(size * SS)
  const s = size * SS

  fillRoundRect(canvas, 0, 0, s, s, maskable ? 0 : s * 0.22, INDIGO)

  // 안전지대를 감안해 글리프를 줄인다
  const scale = maskable ? 0.56 : 0.72
  const gw = s * 0.34 * scale * (1 / 0.72)
  const bodyH = s * 0.44 * scale * (1 / 0.72)
  const cx = s / 2

  const bodyTop = s / 2 - bodyH * 0.34
  fillRoundRect(canvas, cx - gw / 2, bodyTop, gw, bodyH, gw * 0.22, WHITE)

  const neckW = gw * 0.4
  const neckH = bodyH * 0.22
  fillRoundRect(canvas, cx - neckW / 2, bodyTop - neckH, neckW, neckH + 1, neckW * 0.15, WHITE)

  const capW = gw * 0.54
  const capH = bodyH * 0.15
  fillRoundRect(canvas, cx - capW / 2, bodyTop - neckH - capH, capW, capH, capH * 0.35, WHITE)

  // 라벨 — 통 가운데를 비워 실루엣이 밋밋해 보이지 않게 한다
  const labelW = gw * 0.62
  const labelH = bodyH * 0.26
  fillRoundRect(
    canvas,
    cx - labelW / 2,
    bodyTop + bodyH * 0.42,
    labelW,
    labelH,
    labelH * 0.25,
    INDIGO,
  )

  return downsample(canvas, SS)
}

// ─── 출력 ─────────────────────────────────────────────────────────────────

mkdirSync(OUT, { recursive: true })

const targets = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  // iOS는 apple-touch-icon에 PNG만 받는다. SVG는 무시된다
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
]

for (const { file, size, maskable } of targets) {
  const canvas = drawIcon(size, { maskable })
  writeFileSync(join(OUT, file), encodePng(canvas.px, size))
  console.log(`${file}  ${size}x${size}`)
}
