import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import {
  joinQueue,
  leaveQueue,
  scanQueue,
  processMove,
  handleDisconnect,
  offerDraw,
  resignGame,
  getGame,
  handleTimeout
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

// Scan queue every 5 seconds for expanded-tolerance matches
setInterval(() => scanQueue(io), 5000)

io.on('connection', (socket) => {
  onlinePlayers++
  io.emit('online_count', onlinePlayers)
  console.log(`[CONNECT] socket=${socket.id} total=${onlinePlayers}`)

  // --- MATCHMAKING ---
  socket.on('join_queue', ({ playerId, rating, name, preferredColor }) => {
    console.log(`[QUEUE] ${name} (${rating}) joined queue preferredColor=${preferredColor}`)
    const match = joinQueue(playerId, rating || 1200, name || 'Guest', socket.id, preferredColor)

    if (match) {
      const { gameId, white, black } = match

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
      }, 3000)
    }
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
      io.to(whiteSocketId).emit('game_over', data.gameOver)
      io.to(blackSocketId).emit('game_over', data.gameOver)
      console.log(`[GAME OVER] ${gameId} winner=${data.gameOver.winner}`)
    }
  })

  // --- DRAW ---
  socket.on('offer_draw', ({ gameId, playerId }) => {
    console.log(`[DRAW OFFER] gameId=${gameId} playerId=${playerId} socketId=${socket.id}`)
    const result = offerDraw(gameId, playerId, socket.id)
    console.log(`[DRAW OFFER RESULT]`, result ? (result.accepted ? 'accepted' : 'sent to opponent') : 'failed')
    if (!result) return

    if (result.accepted) {
      io.to(result.whiteSocketId).emit('draw_accepted')
      io.to(result.blackSocketId).emit('draw_accepted')
      io.to(result.whiteSocketId).emit('game_over', { reason: 'draw', winner: null })
      io.to(result.blackSocketId).emit('game_over', { reason: 'draw', winner: null })
    } else {
      io.to(result.opponentSocketId).emit('draw_offered')
      socket.emit('draw_offer_sent') // confirm to the offerer
    }
  })

  socket.on('decline_draw', ({ gameId, playerId }) => {
    // C1: Send only to the player who offered the draw (the opponent of the decliner)
    const game = getGame(gameId)
    if (!game) return
    const offererSocketId =
      game.white.playerId === playerId ? game.black.socketId : game.white.socketId
    // Clear the pending offer so a fresh offer can be made later
    game.drawOfferedBy = null
    io.to(offererSocketId).emit('draw_declined')
  })

  // --- RESIGN ---
  socket.on('resign', ({ gameId, playerId }) => {
    const result = resignGame(gameId, playerId, socket.id)
    if (!result) return

    const { winner, reason, whiteSocketId, blackSocketId } = result
    io.to(whiteSocketId).emit('game_over', { reason, winner })
    io.to(blackSocketId).emit('game_over', { reason, winner })
    console.log(`[RESIGN] ${gameId} winner=${winner}`)
  })

  // --- TIMEOUT ---
  socket.on('timeout', ({ gameId, playerId }) => {
    const result = handleTimeout(gameId, playerId, socket.id)
    if (!result) return
    const { winner, whiteSocketId, blackSocketId } = result
    io.to(whiteSocketId).emit('game_over', { reason: 'timeout', winner })
    io.to(blackSocketId).emit('game_over', { reason: 'timeout', winner })
    console.log(`[TIMEOUT] ${gameId} winner=${winner}`)
  })

  // --- DISCONNECT ---
  socket.on('disconnect', () => {
    onlinePlayers = Math.max(0, onlinePlayers - 1)
    io.emit('online_count', onlinePlayers)

    const opponentSocketId = handleDisconnect(socket.id)
    if (opponentSocketId) {
      // C2: Only emit opponent_disconnected; the client handles game_over with the correct winner.
      // Emitting a second game_over { winner: null } would overwrite the win with a draw.
      io.to(opponentSocketId).emit('opponent_disconnected')
    }

    console.log(`[DISCONNECT] socket=${socket.id} total=${onlinePlayers}`)
  })
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', online: onlinePlayers })
})

const PORT = process.env.PORT || 3001
httpServer.listen(PORT, () => {
  console.log(`REGICIDE server running on port ${PORT}`)
})
