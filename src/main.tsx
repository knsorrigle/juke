import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './ui/App.tsx'
import { applyHighContrast, initialHighContrast } from './ui/theme/highContrast.ts'

applyHighContrast(initialHighContrast())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
