// Gemeinsame Helfer für Browser-Tests: statischer Server für den geprüften Build, simulierte Kamera (Y4M).
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

export const DIST = process.env.DM_DIST || 'dist'
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png' }

export async function serve(dir = DIST) {
  const server = createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    if (p.endsWith('/')) p += 'index.html'
    try { const body = await readFile(join(dir, p)); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(body) } catch { res.writeHead(404); res.end('nf') }
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return { base: `http://localhost:${server.address().port}/`, close: () => server.close() }
}

/** Graustufen-Kamerabild W×H; draw(matrix, cx, cy, modulPx, grad) zeichnet einen Code mit 4 Modulen weißem Rand */
export function cameraFrame(W = 1280, H = 720, bg = 170) {
  const Y = new Uint8Array(W * H).fill(bg)
  const draw = (m, cx, cy, mod, deg, quiet = 4) => {
    const size = m.length, total = size + 2 * quiet
    const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a), half = (total * mod) / 2 * 1.5
    for (let y = Math.floor(cy - half); y < cy + half; y++) for (let x = Math.floor(cx - half); x < cx + half; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue
      const dx = x - cx, dy = y - cy
      const u = (dx * cos + dy * sin) / mod + total / 2, v = (-dx * sin + dy * cos) / mod + total / 2
      if (u < 0 || v < 0 || u >= total || v >= total) continue
      const mx = Math.floor(u) - quiet, my = Math.floor(v) - quiet
      Y[y * W + x] = mx >= 0 && my >= 0 && mx < size && my < size && m[my][mx] ? 20 : 240
    }
  }
  const save = async (file) => {
    for (let i = 0; i < Y.length; i++) Y[i] = Math.max(0, Math.min(255, Y[i] + ((i * 2654435761) % 17) - 8))
    const frame = Buffer.concat([Buffer.from('FRAME\n'), Buffer.from(Y), Buffer.alloc((W * H) / 2, 128)])
    await writeFile(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), frame, frame]))
  }
  return { draw, save, W, H }
}

export const ANSWER_RGB = { A: [239, 68, 82], B: [59, 108, 240], C: [242, 157, 11], D: [22, 167, 92] }
