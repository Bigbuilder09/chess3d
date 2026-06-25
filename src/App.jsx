import React, { useState } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import LandingPage from './components/LandingPage.jsx'
import MatchmakingScreen from './components/MatchmakingScreen.jsx'
import GameScreen from './components/GameScreen.jsx'
import EndScreen from './components/EndScreen.jsx'
import BotGameScreen from './components/BotGameScreen.jsx'

export default function App() {
  const [gameResult, setGameResult] = useState(null)
  const [playerInfo, setPlayerInfo] = useState({
    name: 'Guest',
    rating: 1200
  })
  const [botDifficulty, setBotDifficulty] = useState('medium')
  const [settings, setSettings] = useState({ pieceStyle: 'lowpoly', boardStyle: 'wood' })

  return (
    <Routes>
      <Route
        path="/"
        element={
          <LandingPage
            playerInfo={playerInfo}
            setPlayerInfo={setPlayerInfo}
            botDifficulty={botDifficulty}
            setBotDifficulty={setBotDifficulty}
            settings={settings}
            setSettings={setSettings}
          />
        }
      />
      <Route
        path="/matchmaking"
        element={<MatchmakingScreen playerInfo={playerInfo} />}
      />
      <Route
        path="/game"
        element={
          <GameScreen
            setGameResult={setGameResult}
            playerInfo={playerInfo}
            settings={settings}
            setSettings={setSettings}
          />
        }
      />
      <Route
        path="/end"
        element={<EndScreen result={gameResult} />}
      />
      <Route
        path="/bot-game"
        element={
          <BotGameScreen
            difficulty={botDifficulty}
            playerInfo={playerInfo}
            settings={settings}
            setSettings={setSettings}
          />
        }
      />
    </Routes>
  )
}
