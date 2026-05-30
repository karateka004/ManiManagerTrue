import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { TabBar, type Tab } from './components/TabBar'
import { HomePage } from './pages/Home'
import { AnalyticsPage } from './pages/Analytics'
import { ChartsPage } from './pages/Charts'
import { SettingsPage } from './pages/Settings'
import { useTheme } from './lib/useTheme'

export default function App() {
  useTheme()
  const [tab, setTab] = useState<Tab>('home')

  return (
    <div className="min-h-screen" style={{ paddingTop: 'var(--safe-top)' }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
        >
          {tab === 'home' && <HomePage />}
          {tab === 'analytics' && <AnalyticsPage />}
          {tab === 'charts' && <ChartsPage />}
          {tab === 'settings' && <SettingsPage />}
        </motion.div>
      </AnimatePresence>

      <TabBar value={tab} onChange={setTab} />
    </div>
  )
}
