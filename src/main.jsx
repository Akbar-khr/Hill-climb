import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Cegah context menu di seluruh halaman
document.addEventListener('contextmenu', e => e.preventDefault())
document.addEventListener('touchstart', e => {
  if (e.touches.length > 1) e.preventDefault()
}, { passive: false })

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
