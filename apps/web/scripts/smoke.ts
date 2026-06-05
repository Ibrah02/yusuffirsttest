// P2 runtime smoke test: dispatch the three operations through the real engine
// session and confirm the mock interceptors + inspectors fire. Not part of the app.
import { Session } from '../src/peer-colab-model/Session'
import { EarlyWarningMonitor } from '@gen/East_Africa_dashbaord/Client/PathItems'

async function main() {
  Session.initialize()
  const client = Session.getClient()

  const r1 = await client.request(EarlyWarningMonitor.getRegionalOutlook())
  console.log('REGIONAL  ok=%s dir=%s countries=%d', r1.success, r1.value?.overallDirection, r1.value?.countrySignals.length)

  const r2 = await client.request(EarlyWarningMonitor.getCountrySignal({ countryCode: 'et' }))
  console.log('COUNTRY ET ok=%s dir=%s pathway="%s"', r2.success, r2.value?.direction, r2.value?.dominantPathway.name)

  const r3 = await client.request(EarlyWarningMonitor.getCountrySignal({ countryCode: 'ZZ' }))
  console.log('COUNTRY ZZ ok=%s status=%d (expect not-found)', r3.success, r3.statusCode)

  const r4 = await client.request(EarlyWarningMonitor.searchAtRiskCountries({}))
  console.log('WATCH default ok=%s count=%d codes=%s', r4.success, r4.value?.length, r4.value?.map((s) => s.country.code).join(','))

  const r5 = await client.request(EarlyWarningMonitor.searchAtRiskCountries({ direction: 'TowardDividend' }))
  console.log('WATCH dividend count=%d codes=%s', r5.value?.length, r5.value?.map((s) => s.country.code).join(','))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
