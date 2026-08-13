import { useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

let sharedSocket = null

export function useSocket() {
  const socketRef = useRef(null)

  useEffect(() => {
    if (!sharedSocket || sharedSocket.disconnected) {
      sharedSocket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000
      })
    }
    socketRef.current = sharedSocket

    const handleRejoin = () => {
      try {
        const { gameId, playerId } = JSON.parse(sessionStorage.getItem('game_data') || '{}')
        if (gameId && playerId) sharedSocket.emit('rejoin_game', { gameId, playerId })
      } catch {}
    }
    sharedSocket.on('reconnect', handleRejoin)
    sharedSocket.on('connect', handleRejoin)

    return () => {
      sharedSocket.off('reconnect', handleRejoin)
      sharedSocket.off('connect', handleRejoin)
    }
  }, [])

  const emit = useCallback((event, data) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data)
    }
  }, [])

  const on = useCallback((event, handler) => {
    socketRef.current?.on(event, handler)
    return () => socketRef.current?.off(event, handler)
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
