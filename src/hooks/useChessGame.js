import { useState, useRef, useCallback, useEffect } from 'react'
import { Chess } from 'chess.js'

export function useChessGame(playerColor) {
  const chessRef = useRef(new Chess())
  const [fen, setFen] = useState(chessRef.current.fen())
  const [moves, setMoves] = useState([])
  const [isCheck, setIsCheck] = useState(false)
  const [isCheckmate, setIsCheckmate] = useState(false)
  const [isDraw, setIsDraw] = useState(false)
  const [selectedSquare, setSelectedSquare] = useState(null)
  const [legalMoves, setLegalMoves] = useState([])
  const [capturedPieces, setCapturedPieces] = useState({ white: [], black: [] })
  const [gameOver, setGameOver] = useState(null)

  const chess = chessRef.current

  /**
   * Apply a move received from the server.
   * Returns the move result for animation purposes.
   */
  const applyServerMove = useCallback((moveData) => {
    const { from, to, san, fen: newFen, captured, isCheck: check, isCheckmate: mate, isDraw: draw } = moveData

    try {
      // Load the authoritative FEN from server
      chess.load(newFen)
      setFen(newFen)
    } catch (e) {
      console.error('Failed to load FEN:', e)
    }
    setIsCheck(check)
    setIsCheckmate(mate)
    setIsDraw(draw)
    setSelectedSquare(null)
    setLegalMoves([])

    if (captured) {
      // Determine capturing color: the move was made by the player who just moved
      // After the move, it's the OTHER player's turn, so the mover was the opposite of current turn
      const capturer = chess.turn() === 'w' ? 'black' : 'white'
      setCapturedPieces(prev => ({
        ...prev,
        [capturer]: [...prev[capturer], captured]
      }))
    }

    setMoves(prev => {
      const newMoves = [...prev]
      // M5: newMoves is an array of pair objects; check the last pair's black slot,
      // not the array length parity, to decide whether to start a new pair.
      if (newMoves.length === 0 || newMoves[newMoves.length - 1].black !== null) {
        newMoves.push({ number: newMoves.length + 1, white: san, black: null })
      } else {
        newMoves[newMoves.length - 1] = { ...newMoves[newMoves.length - 1], black: san }
      }
      return newMoves
    })

    return { from, to, captured, isCheck: check, isCheckmate: mate }
  }, [chess])

  /**
   * Select a square — returns legal destination squares or null.
   */
  const selectSquare = useCallback((square) => {
    const currentTurn = chess.turn() // 'w' or 'b'
    const myTurn = playerColor === 'white' ? currentTurn === 'w' : currentTurn === 'b'

    if (!myTurn) {
      setSelectedSquare(null)
      setLegalMoves([])
      return null
    }

    const piece = chess.get(square)

    // Clicking own piece
    if (piece && ((piece.color === 'w' && playerColor === 'white') ||
                  (piece.color === 'b' && playerColor === 'black'))) {
      const moves = chess.moves({ square, verbose: true })
      const targets = moves.map(m => m.to)
      setSelectedSquare(square)
      setLegalMoves(targets)
      return { selected: square, legalMoves: targets }
    }

    // Clicking elsewhere when a piece is selected
    if (selectedSquare) {
      if (legalMoves.includes(square)) {
        // Valid move target
        return { from: selectedSquare, to: square, isMove: true }
      } else {
        setSelectedSquare(null)
        setLegalMoves([])
        return null
      }
    }

    return null
  }, [chess, playerColor, selectedSquare, legalMoves])

  /**
   * Clear selection state.
   */
  const clearSelection = useCallback(() => {
    setSelectedSquare(null)
    setLegalMoves([])
  }, [])

  /**
   * Check if a move requires promotion.
   */
  const needsPromotion = useCallback((from, to) => {
    const piece = chess.get(from)
    if (!piece || piece.type !== 'p') return false
    const toRank = parseInt(to[1])
    return (piece.color === 'w' && toRank === 8) || (piece.color === 'b' && toRank === 1)
  }, [chess])

  /**
   * Reset the game.
   */
  const resetGame = useCallback(() => {
    chess.reset()
    setFen(chess.fen())
    setMoves([])
    setIsCheck(false)
    setIsCheckmate(false)
    setIsDraw(false)
    setSelectedSquare(null)
    setLegalMoves([])
    setCapturedPieces({ white: [], black: [] })
    setGameOver(null)
  }, [chess])

  /**
   * Get all pieces on the board from the FEN.
   */
  const getBoardState = useCallback(() => {
    const board = chess.board()
    const pieces = []
    board.forEach((row, rowIdx) => {
      row.forEach((piece, colIdx) => {
        if (piece) {
          const file = String.fromCharCode(97 + colIdx)
          const rank = (8 - rowIdx).toString()
          pieces.push({
            type: piece.type,
            color: piece.color === 'w' ? 'white' : 'black',
            square: file + rank
          })
        }
      })
    })
    return pieces
  }, [chess, fen]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    chess: chessRef,
    fen,
    moves,
    isCheck,
    isCheckmate,
    isDraw,
    selectedSquare,
    legalMoves,
    capturedPieces,
    gameOver,
    setGameOver,
    applyServerMove,
    selectSquare,
    clearSelection,
    needsPromotion,
    resetGame,
    getBoardState
  }
}
