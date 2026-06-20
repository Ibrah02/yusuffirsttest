import { useState } from 'react'
import { SquadExplorer } from './views/SquadExplorer'
import { MarketValue } from './views/MarketValue'
import { Performance } from './views/Performance'
import { RiskContracts } from './views/RiskContracts'
import { PlayerComparison } from './views/PlayerComparison'

type Tab = 'squad' | 'value' | 'performance' | 'risk' | 'compare'

const TABS: { id: Tab; label: string }[] = [
  { id: 'squad', label: 'Squad Explorer' },
  { id: 'value', label: 'Market Value' },
  { id: 'performance', label: 'Performance' },
  { id: 'risk', label: 'Risk & Contracts' },
  { id: 'compare', label: 'Player Comparison' },
]

export function App() {
  const [tab, setTab] = useState<Tab>('squad')

  return (
    <div className="app">
      <header className="app-header">
        <span className="source-badge source-mock">Mock data · synthetic dataset</span>
        <h1>FIFA Player Dashboards</h1>
        <p className="subtitle">
          2,800 players explored by squad, value, performance and risk. The data is synthetic — relationships
          are flat by design.
        </p>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {tab === 'squad' && <SquadExplorer />}
        {tab === 'value' && <MarketValue />}
        {tab === 'performance' && <Performance />}
        {tab === 'risk' && <RiskContracts />}
        {tab === 'compare' && <PlayerComparison />}
      </main>
    </div>
  )
}
