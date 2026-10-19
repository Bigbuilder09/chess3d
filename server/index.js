import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import {
  joinQueue,
  leaveQueue,
  scanQueue,
  abandonGames,
  processMove,
  handleDisconnect,
  rejoinGame,
  offerDraw,
  declineDraw,
  resignGame,
  sweepTimeouts,
  START_DELAY_MS
} from './gameManager.js'

const app = express()
const httpServer = createServer(app)

app.use(cors())
app.use(express.json())

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:4173']

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
})

// Online player count
let onlinePlayers = 0

function announceMatch({ gameId, white, black }) {
  io.to(white.socketId).emit('match_found', {
    opponent: { name: black.name, rating: black.rating },
    color: 'white',
    gameId
  })
  io.to(black.socketId).emit('match_found', {
    opponent: { name: white.name, rating: white.rating },
    color: 'black',
    gameId
  })

  setTimeout(() => {
    io.to(white.socketId).emit('game_start', { color: 'white', gameId })
    io.to(black.socketId).emit('game_start', { color: 'black', gameId })
    console.log(`[GAME START] ${gameId}`)
  }, START_DELAY_MS)
}

function broadcastGameOver({ whiteSocketId, blackSocketId }, payload) {
  io.to(whiteSocketId).emit('game_over', payload)
  io.to(blackSocketId).emit('game_over', payload)
}

function runTimeoutSweep() {
  for (const r of sweepTimeouts()) {
    broadcastGameOver(r, { reason: 'timeout', winner: r.winner })
    console.log(`[TIMEOUT] ${r.gameId} winner=${r.winner}`)
  }
}

// Scan queue every 5 seconds for expanded-tolerance matches
setInterval(() => scanQueue().forEach(announceMatch), 5000)

// #5: the server owns the clock — flag players who run out of time
setInterval(runTimeoutSweep, 500)

io.on('connection', (socket) => {
  onlinePlayers++
  io.emit('online_count', onlinePlayers)
  console.log(`[CONNECT] socket=${socket.id} total=${onlinePlayers}`)

  // --- ONLINE COUNT ---
  socket.on('get_online_count', () => {
    socket.emit('online_count', onlinePlayers)
  })

  // --- MATCHMAKING ---
  socket.on('join_queue', ({ playerId, rating, name, preferredColor }) => {
    console.log(`[QUEUE] ${name} (${rating}) joined queue preferredColor=${preferredColor}`)

    // #3: a player who queues again has left any game they were still in
    for (const r of abandonGames(playerId)) {
      broadcastGameOver(r, { reason: r.reason, winner: r.winner })
      console.log(`[ABANDON] ${r.gameId} winner=${r.winner}`)
    }

    const match = joinQueue(playerId, rating || 1200, name || 'Guest', socket.id, preferredColor)
    if (match) announceMatch(match)
  })

  socket.on('leave_queue', ({ playerId }) => {
    leaveQueue(playerId)
  })

  // --- GAME MOVES ---
  socket.on('move_piece', ({ gameId, playerId, from, to, promotion }) => {
    const result = processMove(gameId, playerId, socket.id, from, to, promotion)

    if (!result.success) {
      socket.emit('invalid_move', { error: result.error, from, to })
      return
    }

    const { data, whiteSocketId, blackSocketId } = result

    // Broadcast move to both players
    io.to(whiteSocketId).emit('move_made', data)
    io.to(blackSocketId).emit('move_made', data)

    console.log(`[MOVE] ${gameId} ${from}-${to} ${data.san}`)

    if (data.gameOver) {
      broadcastGameOver(result, data.gameOver)
      console.log(`[GAME OVER] ${gameId} winner=${data.gameOver.winner}`)
    }
  })

  // --- DRAW ---
  socket.on('offer_draw', ({ gameId, playerId }) => {
    const result = offerDraw(gameId, playerId, socket.id)
    if (!result) return

    if (result.accepted) {
      // #7: send a single game_over — clients no longer need 'draw_accepted'
      broadcastGameOver(result, { reason: 'draw', winner: null })
      console.log(`[DRAW AGREED] ${gameId}`)
    } else {
      io.to(result.opponentSocketId).emit('draw_offered')
      socket.emit('draw_offer_sent') // confirm to the offerer
    }
  })

  socket.on('decline_draw', ({ gameId, playerId }) => {
    const offererSocketId = declineDraw(gameId, playerId, socket.id)
    if (offererSocketId) io.to(offererSocketId).emit('draw_declined')
  })

  // --- RESIGN ---
  socket.on('resign', ({ gameId, playerId }) => {
    const result = resignGame(gameId, playerId, socket.id)
    if (!result) return

    broadcastGameOver(result, { reason: result.reason, winner: result.winner })
    console.log(`[RESIGN] ${gameId} winner=${result.winner}`)
  })

  // --- TIMEOUT ---
  // Clients may nudge the server when their display hits 0:00; the server
  // checks its own clock, so a client can neither fake nor delay a timeout.
  socket.on('timeout', () => runTimeoutSweep())

  // --- DISCONNECT ---
  socket.on('disconnect', () => {
    onlinePlayers = Math.max(0, onlinePlayers - 1)
    io.emit('online_count', onlinePlayers)

    const result = handleDisconnect(socket.id, (gameId, winner, oppSocketId) => {
      io.to(oppSocketId).emit('game_over', { reason: 'disconnect', winner })
      console.log(`[GRACE EXPIRED] gameId=${gameId} winner=${winner}`)
    })

    if (result) {
      io.to(result.opponentSocketId).emit('opponent_disconnecting', { gracePeriod: 30 })
      console.log(`[DISCONNECT] socket=${socket.id} gameId=${result.gameId} grace=30s`)
    } else {
      console.log(`[DISCONNECT] socket=${socket.id} total=${onlinePlayers}`)
    }
  })

  // --- REJOIN ---
  socket.on('rejoin_game', ({ gameId, playerId }) => {
    const result = rejoinGame(gameId, playerId, socket.id)
    if (!result) {
      socket.emit('rejoin_failed')
      console.log(`[REJOIN FAILED] gameId=${gameId} playerId=${playerId}`)
      return
    }
    const { opponentSocketId, wasDisconnected, ...state } = result
    socket.emit('rejoin_success', state)
    if (wasDisconnected) io.to(opponentSocketId).emit('opponent_reconnected')
    console.log(`[REJOIN] gameId=${gameId} color=${result.color}`)
  })
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', online: onlinePlayers })
})

const PORT = process.env.PORT || 3001
httpServer.listen(PORT, () => {
  console.log(`REGICIDE server running on port ${PORT}`)
})
