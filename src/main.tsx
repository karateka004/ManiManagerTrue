import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initTelegram } from './lib/telegram'
import './index.css'

// Initialize Telegram WebApp (graceful fallback if outside Telegram)
initTelegram()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
