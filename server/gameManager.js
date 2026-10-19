import { Chess } from 'chess.js'
import { v4 as uuidv4 } from 'uuid'

export const INITIAL_TIME_MS = 10 * 60 * 1000   // 10 minutes per side
export const START_DELAY_MS = 3000              // matches the "Starting in 3…" countdown

const matchmakingQueue = []
const activeGames = {}
const disconnectTimers = new Map()  // gameId → { white?: timeoutId, black?: timeoutId }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sideOf(game, playerId) {
  if (game.white.playerId === playerId) return 'white'
  if (game.black.playerId === playerId) return 'black'
  return null
}

/** Side that playerId owns *and* is currently connected with socketId (C3). */
function authSide(game, playerId, socketId) {
  const side = sideOf(game, playerId)
  if (!side) return null
  return game[side].socketId === socketId ? side : null
}

function turnSide(game) {
  return game.chess.turn() === 'w' ? 'white' : 'black'
}

/**
 * Current clock values (ms). The side to move has the time elapsed since its
 * turn started subtracted. Clocks don't run before the start countdown ends.
 */
export function getClocks(game, now = Date.now()) {
  const clocks = { white: game.clock.white, black: game.clock.black }
  const elapsed = Math.max(0, now - game.clock.turnStartedAt)
  const side = turnSide(game)
  clocks[side] = Math.max(0, clocks[side] - elapsed)
  return clocks
}

/** Remove the game and every pending disconnect timer that belongs to it. */
function endGame(gameId) {
  delete activeGames[gameId]
  const timers = disconnectTimers.get(gameId)
  if (timers) {
    for (const tid of Object.values(timers)) clearTimeout(tid)
    disconnectTimers.delete(gameId)
  }
}

function pickColors(a, b) {
  if (a.preferredColor === 'white' && b.preferredColor !== 'white') return [a, b]
  if (a.preferredColor === 'black' && b.preferredColor !== 'black') return [b, a]
  if (b.preferredColor === 'white' && a.preferredColor !== 'white') return [b, a]
  if (b.preferredColor === 'black' && a.preferredColor !== 'black') return [a, b]
  return Math.random() < 0.5 ? [a, b] : [b, a]
}

function createGame(a, b) {
  const [whitePlayer, blackPlayer] = pickColors(a, b)
  const gameId = uuidv4()
  const game = {
    gameId,
    chess: new Chess(),
    white: { playerId: whitePlayer.playerId, socketId: whitePlayer.socketId, name: whitePlayer.name, rating: whitePlayer.rating },
    black: { playerId: blackPlayer.playerId, socketId: blackPlayer.socketId, name: blackPlayer.name, rating: blackPlayer.rating },
    drawOfferedBy: null,
    createdAt: Date.now(),
    clock: {
      white: INITIAL_TIME_MS,
      black: INITIAL_TIME_MS,
      // White's clock starts when the client countdown finishes
      turnStartedAt: Date.now() + START_DELAY_MS
    }
  }
  activeGames[gameId] = game
  return { gameId, white: game.white, black: game.black }
}

// ─── Matchmaking ──────────────────────────────────────────────────────────────

/**
 * #3: Forfeit every active game the player is still in (e.g. they left the
 * game screen and are now queueing again). Returns results to broadcast.
 */
export function abandonGames(playerId) {
  const results = []
  for (const [gameId, game] of Object.entries(activeGames)) {
    const side = sideOf(game, playerId)
    if (!side) continue
    results.push({
      gameId,
      winner: side === 'white' ? 'black' : 'white',
      reason: 'resignation',
      whiteSocketId: game.white.socketId,
      blackSocketId: game.black.socketId
    })
    endGame(gameId)
  }
  return results
}

/**
 * Add a player to the matchmaking queue.
 * Returns a match object if a suitable opponent was found, otherwise null.
 */
export function joinQueue(playerId, rating, name, socketId, preferredColor) {
  // Remove any existing entry for this player
  const existingIdx = matchmakingQueue.findIndex(p => p.playerId === playerId)
  if (existingIdx !== -1) matchmakingQueue.splice(existingIdx, 1)

  const joinedAt = Date.now()
  matchmakingQueue.push({ playerId, rating, name, socketId, joinedAt, preferredColor })
  console.log(`[QUEUE SIZE] ${matchmakingQueue.length} player(s) waiting`)

  return tryMatch(playerId, rating, joinedAt)
}

export function leaveQueue(playerId) {
  const idx = matchmakingQueue.findIndex(p => p.playerId === playerId)
  if (idx !== -1) matchmakingQueue.splice(idx, 1)
}

/**
 * Try to find a match for the given player.
 * Rating tolerance expands by +50 every 30 seconds.
 */
function tryMatch(playerId, rating, joinedAt) {
  const waitSeconds = (Date.now() - joinedAt) / 1000
  const tolerance = 150 + Math.floor(waitSeconds / 30) * 50

  const myIdx = matchmakingQueue.findIndex(p => p.playerId === playerId)
  if (myIdx === -1) return null

  for (let i = 0; i < matchmakingQueue.length; i++) {
    if (i === myIdx) continue
    const candidate = matchmakingQueue[i]
    if (Math.abs(candidate.rating - rating) <= tolerance) {
      const me = matchmakingQueue[myIdx]
      matchmakingQueue.splice(Math.max(myIdx, i), 1)
      matchmakingQueue.splice(Math.min(myIdx, i), 1)
      return createGame(me, candidate)
    }
  }
  return null
}

/**
 * Periodically scan queue for matches with expanded tolerance.
 * Returns the list of new matches; the caller notifies the players.
 */
export function scanQueue() {
  const matches = []
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
        matches.push(createGame(player, candidate))
        break
      }
    }
  }
  return matches
}

// ─── Moves ────────────────────────────────────────────────────────────────────

/**
 * Process a move. Returns { success, data, error }.
 */
export function processMove(gameId, playerId, socketId, from, to, promotion) {
  const game = activeGames[gameId]
  if (!game) return { success: false, error: 'Game not found' }

  const side = authSide(game, playerId, socketId)
  if (!side) return { success: false, error: 'Unauthorized' }
  if (turnSide(game) !== side) return { success: false, error: 'Not your turn' }

  const now = Date.now()
  const clocks = getClocks(game, now)
  if (clocks[side] <= 0) {
    // Flagged before the move arrived — the sweeper will end the game
    return { success: false, error: 'Out of time' }
  }

  let moveResult
  try {
    moveResult = game.chess.move({ from, to, promotion: promotion || 'q' })
  } catch (e) {
    return { success: false, error: 'Invalid move' }
  }
  if (!moveResult) return { success: false, error: 'Invalid move' }

  // #5: commit the mover's clock and start the opponent's
  game.clock.white = clocks.white
  game.clock.black = clocks.black
  game.clock.turnStartedAt = now
  // #8: a pending draw offer lapses once a move is made
  game.drawOfferedBy = null

  const chess = game.chess
  const isCheck = chess.isCheck()
  const isCheckmate = chess.isCheckmate()
  const isStalemate = chess.isStalemate()
  const isDraw = chess.isDraw() // includes stalemate in chess.js v1

  let gameOver = null
  if (isCheckmate) {
    gameOver = { reason: 'checkmate', winner: side }
  } else if (isStalemate) {
    gameOver = { reason: 'stalemate', winner: null }
  } else if (isDraw) {
    gameOver = { reason: 'draw', winner: null }
  }

  const result = {
    success: true,
    data: {
      from,
      to,
      san: moveResult.san,
      fen: chess.fen(),
      captured: moveResult.captured || null,
      flags: moveResult.flags,
      promotion: moveResult.promotion || null,
      isCheck,
      isCheckmate,
      isDraw,
      clocks: { white: game.clock.white, black: game.clock.black },
      gameOver
    },
    whiteSocketId: game.white.socketId,
    blackSocketId: game.black.socketId
  }

  if (gameOver) endGame(gameId)
  return result
}

// ─── Clock ────────────────────────────────────────────────────────────────────

/**
 * #5: End every game whose side-to-move has run out of time.
 * Called periodically by the server. Returns results to broadcast.
 */
export function sweepTimeouts(now = Date.now()) {
  const results = []
  for (const [gameId, game] of Object.entries(activeGames)) {
    const side = turnSide(game)
    if (getClocks(game, now)[side] > 0) continue
    results.push({
      gameId,
      winner: side === 'white' ? 'black' : 'white',
      whiteSocketId: game.white.socketId,
      blackSocketId: game.black.socketId
    })
    endGame(gameId)
  }
  return results
}

// ─── Disconnect / rejoin ──────────────────────────────────────────────────────

/**
 * Handle player disconnect from a game.
 * Starts a 30-second grace period before forfeiting the game.
 */
export function handleDisconnect(socketId, onExpire) {
  const qIdx = matchmakingQueue.findIndex(p => p.socketId === socketId)
  if (qIdx !== -1) { matchmakingQueue.splice(qIdx, 1); return null }

  for (const [gameId, game] of Object.entries(activeGames)) {
    const isWhite = game.white.socketId === socketId
    const isBlack = game.black.socketId === socketId
    if (!isWhite && !isBlack) continue

    const side = isWhite ? 'white' : 'black'
    const opponentSocketId = isWhite ? game.black.socketId : game.white.socketId
    const winner = isWhite ? 'black' : 'white'

    game[side].disconnected = true

    const timerId = setTimeout(() => {
      const liveGame = activeGames[gameId]
      if (!liveGame || !liveGame[side].disconnected) return
      const oppSocket = isWhite ? liveGame.black.socketId : liveGame.white.socketId
      endGame(gameId)
      onExpire(gameId, winner, oppSocket)
    }, 30000)

    const existing = disconnectTimers.get(gameId) || {}
    if (existing[side]) clearTimeout(existing[side])
    existing[side] = timerId
    disconnectTimers.set(gameId, existing)
    return { opponentSocketId, gameId }
  }
  return null
}

/**
 * Attempt to rejoin an active game after reconnection / page refresh.
 *
 * #4: Does NOT require the server to have noticed the old socket's disconnect
 * yet — a client can reconnect before the server's ping timeout fires. Once
 * the slot points at the new socket, the late disconnect of the old socket no
 * longer matches anything and is ignored.
 */
export function rejoinGame(gameId, playerId, newSocketId) {
  const game = activeGames[gameId]
  if (!game) return null

  const side = sideOf(game, playerId)
  if (!side) return null

  const wasDisconnected = !!game[side].disconnected

  const gameTimers = disconnectTimers.get(gameId)
  if (gameTimers?.[side]) {
    clearTimeout(gameTimers[side])
    delete gameTimers[side]
    if (!gameTimers.white && !gameTimers.black) disconnectTimers.delete(gameId)
  }

  game[side].socketId = newSocketId
  game[side].disconnected = false

  const oppSide = side === 'white' ? 'black' : 'white'
  return {
    fen: game.chess.fen(),
    color: side,
    history: game.chess.history({ verbose: true }).map(m => ({
      san: m.san, captured: m.captured || null, color: m.color
    })),
    clocks: getClocks(game),
    drawOffer: game.drawOfferedBy === null
      ? null
      : game.drawOfferedBy === playerId ? 'sent' : 'received',
    opponentSocketId: game[oppSide].socketId,
    wasDisconnected
  }
}

// ─── Draw / resign ────────────────────────────────────────────────────────────

/**
 * Offer or accept a draw.
 */
export function offerDraw(gameId, playerId, socketId) {
  const game = activeGames[gameId]
  if (!game) return null

  const side = authSide(game, playerId, socketId)
  if (!side) return null

  if (game.drawOfferedBy && game.drawOfferedBy !== playerId) {
    const result = { accepted: true, whiteSocketId: game.white.socketId, blackSocketId: game.black.socketId }
    endGame(gameId)
    return result
  }

  game.drawOfferedBy = playerId
  const opponentSocketId = side === 'white' ? game.black.socketId : game.white.socketId
  return { accepted: false, opponentSocketId }
}

/**
 * Decline a pending draw offer. Returns the offerer's socket id, or null.
 */
export function declineDraw(gameId, playerId, socketId) {
  const game = activeGames[gameId]
  if (!game) return null

  const side = authSide(game, playerId, socketId)
  if (!side) return null
  // Only meaningful if the *opponent* has an offer pending
  if (!game.drawOfferedBy || game.drawOfferedBy === playerId) return null

  game.drawOfferedBy = null
  return side === 'white' ? game.black.socketId : game.white.socketId
}

/**
 * Resign a game.
 */
export function resignGame(gameId, playerId, socketId) {
  const game = activeGames[gameId]
  if (!game) return null

  const side = authSide(game, playerId, socketId)
  if (!side) return null

  const result = {
    winner: side === 'white' ? 'black' : 'white',
    reason: 'resignation',
    whiteSocketId: game.white.socketId,
    blackSocketId: game.black.socketId
  }
  endGame(gameId)
  return result
}

export function getGame(gameId) {
  return activeGames[gameId] || null
}
