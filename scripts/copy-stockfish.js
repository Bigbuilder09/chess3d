const fs = require('fs')
const path = require('path')

const binDir = path.join(__dirname, '..', 'node_modules', 'stockfish', 'bin')
const publicDir = path.join(__dirname, '..', 'public')

const files = [
  'stockfish-18-lite-single.js',
  'stockfish-18-lite-single.wasm'
]

files.forEach(file => {
  const src = path.join(binDir, file)
  const dest = path.join(publicDir, file)
  fs.copyFileSync(src, dest)
  console.log(`Copied ${file} → public/`)
})
