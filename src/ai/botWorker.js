import { Chess } from 'chess.js'

const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 }

const PST = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0
  ],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50
  ],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20
  ],
  r: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0
  ],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20
  ],
  k: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20
  ]
}

function squareToIndex(square) {
  const file = square.charCodeAt(0) - 97
  const rank = parseInt(square[1]) - 1
  return (7 - rank) * 8 + file
}

function evaluate(chess) {
  if (chess.isCheckmate()) return chess.turn() === 'w' ? -100000 : 100000
  if (chess.isDraw()) return 0

  let score = 0
  const board = chess.board()
  board.forEach((row, ri) => {
    row.forEach((piece, ci) => {
      if (!piece) return
      const sq = String.fromCharCode(97 + ci) + (8 - ri)
      const idx = squareToIndex(sq)
      const base = PIECE_VALUES[piece.type] || 0
      const pst = PST[piece.type] ? PST[piece.type][piece.color === 'w' ? idx : 63 - idx] : 0
      score += piece.color === 'w' ? base + pst : -(base + pst)
    })
  })
  return score
}

function minimax(chess, depth, alpha, beta, maximizing) {
  if (depth === 0 || chess.isGameOver()) return evaluate(chess)

  const moves = chess.moves()
  if (maximizing) {
    let best = -Infinity
    for (const move of moves) {
      chess.move(move)
      best = Math.max(best, minimax(chess, depth - 1, alpha, beta, false))
      chess.undo()
      alpha = Math.max(alpha, best)
      if (beta <= alpha) break
    }
    return best
  } else {
    let best = Infinity
    for (const move of moves) {
      chess.move(move)
      best = Math.min(best, minimax(chess, depth - 1, alpha, beta, true))
      chess.undo()
      beta = Math.min(beta, best)
      if (beta <= alpha) break
    }
    return best
  }
}

function getBotMove(fen, difficulty) {
  const chess = new Chess(fen)
  const moves = chess.moves()
  if (!moves.length) return null

  if (difficulty === 'easy') {
    const captures = moves.filter(m => m.includes('x'))
    return captures.length && Math.random() < 0.6
      ? captures[Math.floor(Math.random() * captures.length)]
      : moves[Math.floor(Math.random() * moves.length)]
  }

  const depth = difficulty === 'hard' ? 4 : 2
  const isMaximizing = chess.turn() === 'w'

  let bestMove = moves[0]
  let bestScore = isMaximizing ? -Infinity : Infinity

  for (const move of moves) {
    chess.move(move)
    const score = minimax(chess, depth - 1, -Infinity, Infinity, !isMaximizing)
    chess.undo()
    if (isMaximizing ? score > bestScore : score < bestScore) {
      bestScore = score
      bestMove = move
    }
  }
  return bestMove
}

self.onmessage = ({ data: { fen, difficulty } }) => {
  const move = getBotMove(fen, difficulty)
  self.postMessage({ move })
}
