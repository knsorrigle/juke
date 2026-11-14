import { MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
import './index.css'
import App from './ui/App.tsx'
import { applyHighContrast, initialHighContrast } from './ui/theme/highContrast.ts'

applyHighContrast(initialHighContrast())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Every motion animation follows the system's reduced-motion setting. */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
)
