import { Chess } from 'chess.js'
import { v4 as uuidv4 } from 'uuid'

const matchmakingQueue = []
const activeGames = {}

/**
 * Add a player to the matchmaking queue.
 * Returns a match object if a suitable opponent was found, otherwise null.
 */
export function joinQueue(playerId, rating, name, socketId) {
  // M7: Reject if the player is already in an active game
  const alreadyInGame = Object.values(activeGames).some(
    g => g.white.playerId === playerId || g.black.playerId === playerId
  )
  if (alreadyInGame) return null

  // Remove any existing entry for this player
  const existingIdx = matchmakingQueue.findIndex(p => p.playerId === playerId)
  if (existingIdx !== -1) matchmakingQueue.splice(existingIdx, 1)

  const joinedAt = Date.now()
  matchmakingQueue.push({ playerId, rating, name, socketId, joinedAt })

  return tryMatch(playerId, rating, joinedAt)
}

/**
 * Remove a player from the matchmaking queue.
 */
export function leaveQueue(playerId) {
  const idx = matchmakingQueue.findIndex(p => p.playerId === playerId)
  if (idx !== -1) matchmakingQueue.splice(idx, 1)
}

/**
 * Try to find a match for the given player.
 * Rating tolerance expands by +50 every 30 seconds.
 */
function tryMatch(playerId, rating, joinedAt) {
  const now = Date.now()
  const waitSeconds = (now - joinedAt) / 1000
  const tolerance = 150 + Math.floor(waitSeconds / 30) * 50

  const myIdx = matchmakingQueue.findIndex(p => p.playerId === playerId)
  if (myIdx === -1) return null

  for (let i = 0; i < matchmakingQueue.length; i++) {
    if (i === myIdx) continue
    const candidate = matchmakingQueue[i]
    if (Math.abs(candidate.rating - rating) <= tolerance) {
      // Found a match — remove both from queue
      const me = matchmakingQueue[myIdx]
      matchmakingQueue.splice(Math.max(myIdx, i), 1)
      matchmakingQueue.splice(Math.min(myIdx, i), 1)

      const gameId = uuidv4()
      const whitePlayer = Math.random() < 0.5 ? me : candidate
      const blackPlayer = whitePlayer === me ? candidate : me

      const game = {
        gameId,
        chess: new Chess(),
        white: { playerId: whitePlayer.playerId, socketId: whitePlayer.socketId, name: whitePlayer.name, rating: whitePlayer.rating },
        black: { playerId: blackPlayer.playerId, socketId: blackPlayer.socketId, name: blackPlayer.name, rating: blackPlayer.rating },
        drawOfferedBy: null,
        createdAt: Date.now()
      }

      activeGames[gameId] = game

      return {
        gameId,
        white: game.white,
        black: game.black
      }
    }
  }

  return null
}

/**
 * Periodically scan queue for matches with expanded tolerance.
 * Call this from a setInterval in the server.
 */
export function scanQueue(io) {
  const now = Date.now()
  for (let i = 0; i < matchmakingQueue.length; i++) {
    const player = matchmakingQueue[i]
    const waitSeconds = (now - player.joinedAt) / 1000
    const tolerance = 150 + Math.floor(waitSeconds / 30) * 50

    for (let j = i + 1; j < matchmakingQueue.length; j++) {
      const candidate = matchmakingQueue[j]
      if (Math.abs(candidate.rating - player.rating) <= tolerance) {
        matchmakingQueue.splice(j, 1)
        matchmakingQueue.splice(i, 1)
        i--

        const gameId = uuidv4()
        const whitePlayer = Math.random() < 0.5 ? player : candidate
        const blackPlayer = whitePlayer === player ? candidate : player

        const game = {
          gameId,
          chess: new Chess(),
          white: { playerId: whitePlayer.playerId, socketId: whitePlayer.socketId, name: whitePlayer.name, rating: whitePlayer.rating },
          black: { playerId: blackPlayer.playerId, socketId: blackPlayer.socketId, name: blackPlayer.name, rating: blackPlayer.rating },
          drawOfferedBy: null,
          createdAt: Date.now()
        }

        activeGames[gameId] = game

        const matchData = { gameId, white: game.white, black: game.black }

        io.to(whitePlayer.socketId).emit('match_found', {
          opponent: { name: blackPlayer.name, rating: blackPlayer.rating },
          color: 'white',
          gameId
        })
        io.to(blackPlayer.socketId).emit('match_found', {
          opponent: { name: whitePlayer.name, rating: whitePlayer.rating },
          color: 'black',
          gameId
        })

        setTimeout(() => {
          io.to(whitePlayer.socketId).emit('game_start', { color: 'white', gameId })
          io.to(blackPlayer.socketId).emit('game_start', { color: 'black', gameId })
        }, 3000)

        break
      }
    }
  }
}

/**
 * Process a move. Returns { success, data, error }.
 */
export function processMove(gameId, playerId, socketId, from, to, promotion) {
  const game = activeGames[gameId]
  if (!game) return { success: false, error: 'Game not found' }

  const chess = game.chess
  const turn = chess.turn() // 'w' or 'b'

  // C3: Verify both playerId AND socketId own the slot
  const isWhite = game.white.playerId === playerId && game.white.socketId === socketId
  const isBlack = game.black.playerId === playerId && game.black.socketId === socketId

  if (!isWhite && !isBlack) return { success: false, error: 'Unauthorized' }
  if (turn === 'w' && !isWhite) return { success: false, error: 'Not your turn' }
  if (turn === 'b' && !isBlack) return { success: false, error: 'Not your turn' }

  let moveResult
  try {
    moveResult = chess.move({ from, to, promotion: promotion || 'q' })
  } catch (e) {
    return { success: false, error: 'Invalid move' }
  }

  if (!moveResult) return { success: false, error: 'Invalid move' }

  const captured = moveResult.captured || null
  const isCheck = chess.isCheck()
  const isCheckmate = chess.isCheckmate()
  const isDraw = chess.isDraw()
  const isStalemate = chess.isStalemate()

  let gameOver = null
  if (isCheckmate) {
    const winner = turn === 'w' ? 'white' : 'black'
    gameOver = { reason: 'checkmate', winner }
    delete activeGames[gameId]
  } else if (isDraw || isStalemate) {
    gameOver = { reason: isDraw ? 'draw' : 'stalemate', winner: null }
    delete activeGames[gameId]
  }

  return {
    success: true,
    data: {
      from,
      to,
      san: moveResult.san,
      fen: chess.fen(),
      captured,
      flags: moveResult.flags,
      promotion: moveResult.promotion || null,
      isCheck,
      isCheckmate,
      isDraw: isDraw || isStalemate,
      gameOver
    },
    whiteSocketId: game.white.socketId,
    blackSocketId: game.black.socketId
  }
}

/**
 * Handle player disconnect from a game.
 */
export function handleDisconnect(socketId) {
  // Remove from queue
  const qIdx = matchmakingQueue.findIndex(p => p.socketId === socketId)
  if (qIdx !== -1) matchmakingQueue.splice(qIdx, 1)

  // Find active game
  for (const [gameId, game] of Object.entries(activeGames)) {
    if (game.white.socketId === socketId || game.black.socketId === socketId) {
      const opponentSocketId =
        game.white.socketId === socketId ? game.black.socketId : game.white.socketId
      delete activeGames[gameId]
      return opponentSocketId
    }
  }
  return null
}

/**
 * Offer or accept a draw.
 */
export function offerDraw(gameId, playerId, socketId) {
  const game = activeGames[gameId]
  if (!game) return null

  // C3: Verify both playerId AND socketId own the slot
  const isWhite = game.white.playerId === playerId && game.white.socketId === socketId
  const isBlack = game.black.playerId === playerId && game.black.socketId === socketId
  if (!isWhite && !isBlack) return null

  if (game.drawOfferedBy && game.drawOfferedBy !== playerId) {
    // Accept draw
    delete activeGames[gameId]
    return { accepted: true, whiteSocketId: game.white.socketId, blackSocketId: game.black.socketId }
  }

  game.drawOfferedBy = playerId
  const opponentSocketId =
    game.white.playerId === playerId ? game.black.socketId : game.white.socketId
  return { accepted: false, opponentSocketId }
}

/**
 * Resign a game.
 */
export function resignGame(gameId, playerId, socketId) {
  const game = activeGames[gameId]
  if (!game) return null

  // C3: Verify both playerId AND socketId own the slot
  const isWhite = game.white.playerId === playerId && game.white.socketId === socketId
  const isBlack = game.black.playerId === playerId && game.black.socketId === socketId
  if (!isWhite && !isBlack) return null

  const winner = isWhite ? 'black' : 'white'
  const result = {
    winner,
    reason: 'resignation',
    whiteSocketId: game.white.socketId,
    blackSocketId: game.black.socketId
  }
  delete activeGames[gameId]
  return result
}

export function getGame(gameId) {
  return activeGames[gameId] || null
}

/**
 * Handle a timeout — the losing player ran out of time.
 * Returns { winner, whiteSocketId, blackSocketId } or null.
 */
export function handleTimeout(gameId, losingPlayerId, socketId) {
  const game = activeGames[gameId]
  if (!game) return null

  // C3: Verify both playerId AND socketId own the slot
  const isWhite = game.white.playerId === losingPlayerId && game.white.socketId === socketId
  const isBlack = game.black.playerId === losingPlayerId && game.black.socketId === socketId
  if (!isWhite && !isBlack) return null

  const winner = isWhite ? 'black' : 'white'
  const result = {
    winner,
    whiteSocketId: game.white.socketId,
    blackSocketId: game.black.socketId
  }
  delete activeGames[gameId]
  return result
}
