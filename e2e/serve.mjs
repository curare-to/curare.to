// Serves ./out the way GitHub Pages does: the file when it exists, else
// 404.html with a 404 status — which is how /r/… and /u/… reach the shell.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.argv[2] ?? 'out')
const port = Number(process.argv[3] ?? 3000)
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.woff2': 'font/woff2',
}

http
  .createServer((req, res) => {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    if (pathname.endsWith('/')) pathname += 'index.html'
    let file = path.join(root, pathname)
    let status = 200
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(root, '404.html')
      status = 404
    }
    res.writeHead(status, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
  .listen(port, '127.0.0.1', () => console.log(`serving ${root} at http://localhost:${port}`))
