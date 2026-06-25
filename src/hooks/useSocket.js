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
        reconnectionAttempts: 5
      })
    }
    socketRef.current = sharedSocket

    return () => {
      // Don't disconnect on unmount — keep socket alive across routes
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
