import { useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

let sharedSocket = null

/**
 * One socket for the whole app.
 *
 * #10: only create a new socket when none exists. A socket that is merely
 * `disconnected` is still auto-reconnecting; replacing it would leave two live
 * connections (double online count, duplicate queue joins).
 */
function getSocket() {
  if (!sharedSocket) {
    sharedSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    })
  }
  return sharedSocket
}

export function useSocket() {
  const socketRef = useRef(null)
  if (!socketRef.current) socketRef.current = getSocket()

  useEffect(() => {
    const sock = getSocket()
    socketRef.current = sock

    // #11: in socket.io v4 'reconnect' is emitted on the Manager (sock.io), not
    // on the socket. 'connect' fires both on the first connection after a page
    // refresh and after every automatic reconnection, so it covers both cases.
    const handleRejoin = () => {
      try {
        const { gameId, playerId } = JSON.parse(sessionStorage.getItem('game_data') || '{}')
        if (gameId && playerId) sock.emit('rejoin_game', { gameId, playerId })
      } catch {}
    }
    sock.on('connect', handleRejoin)

    return () => {
      sock.off('connect', handleRejoin)
    }
  }, [])

  const emit = useCallback((event, data) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data)
    }
  }, [])

  const on = useCallback((event, handler) => {
    const sock = socketRef.current
    sock?.on(event, handler)
    return () => sock?.off(event, handler)
  }, [])

  const off = useCallback((event, handler) => {
    socketRef.current?.off(event, handler)
  }, [])

  return { socket: socketRef, emit, on, off }
}

export function disconnectSocket() {
  if (sharedSocket) {
    sharedSocket.disconnect()
    sharedSocket = null
  }
}
