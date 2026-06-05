import { useState } from 'react'
import { RegionalOutlook } from './views/RegionalOutlook'
import { CountryDrillIn } from './views/CountryDrillIn'
import { AtRiskWatchlist } from './views/AtRiskWatchlist'
import { Session } from './peer-colab-model/Session'

type Tab = 'outlook' | 'watchlist'

const SOURCE_LABEL: Record<string, string> = {
  mock: 'Mock data',
  realApi: 'Live: World Bank API',
  leadTime: 'Lead-time probe: FEWS NET prices',
  composite: 'Composite: price + conflict + climate',
}

export function App() {
  const [tab, setTab] = useState<Tab>('outlook')
  const [country, setCountry] = useState<string | null>(null)

  const selectCountry = (code: string) => setCountry(code)
  const clearCountry = () => setCountry(null)

  return (
    <div className="app">
      <header className="app-header">
        <span className={`source-badge source-${Session.dataSource}`}>
          {SOURCE_LABEL[Session.dataSource] ?? Session.dataSource}
        </span>
        <h1>East Africa Early-Warning Monitor</h1>
        <p className="subtitle">Is population growth tipping toward harm — or toward a demographic dividend?</p>
        <nav className="tabs">
          <button
            className={tab === 'outlook' && !country ? 'active' : ''}
            onClick={() => {
              setTab('outlook')
              clearCountry()
            }}
          >
            Regional outlook
          </button>
          <button
            className={tab === 'watchlist' && !country ? 'active' : ''}
            onClick={() => {
              setTab('watchlist')
              clearCountry()
            }}
          >
            Watchlist
          </button>
        </nav>
      </header>

      <main className="app-main">
        {country ? (
          <CountryDrillIn countryCode={country} onBack={clearCountry} />
        ) : tab === 'outlook' ? (
          <RegionalOutlook onSelectCountry={selectCountry} />
        ) : (
          <AtRiskWatchlist onSelectCountry={selectCountry} />
        )}
      </main>
    </div>
  )
}
