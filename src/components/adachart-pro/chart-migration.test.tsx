import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseCandles, PublicMarketError, nextCandleTimestamp } from './public-candles'
import { chartProSettingsSchema, defaultChartProSettings } from './chart-config'
import { ChartTooltipSettings } from './ChartQuoteTooltip'
import { resolveAdaChartProps, buildStyles } from '../adachart/adachart-options'
import { ChartDataObservation } from './ChartDataObservation'

// Pure option resolution does not instantiate the browser chart engine.
vi.mock('klinecharts', () => ({ registerIndicator: vi.fn(), registerOverlay: vi.fn() }))
vi.mock('@klinecharts/extension', () => ({}))

const time = Date.UTC(2026, 0, 1)
const row = (timestamp = time) => [String(timestamp), '100', '110', '90', '105', '1.25', '125', '125', '1']
describe('migrated candle adapter', () => {
  it('deduplicates and sorts history while preserving finality and precision', () => {
    const page = parseCandles([row(time + 60000), row(), row()], '1m')
    expect(page.candles.map(value => value.bar.timestamp)).toEqual([time, time + 60000])
    expect(page.candles[0].bar).toMatchObject({ closed: true, volume: 1.25, turnover: 125 })
    expect(page.gaps).toBe(0)
  })
  it('rejects conflicting duplicates, inconsistent prices and lossy conversion', () => {
    const changed = row(); changed[4] = '106'
    const invalid = row(); invalid[2] = '99'
    const lossy = row(); lossy[5] = '1.00000000000000000001'
    for (const data of [[row(), changed], [invalid], [lossy]]) expect(() => parseCandles(data, '1m')).toThrow(PublicMarketError)
  })
  it('detects gaps and handles variable-length monthly boundaries', () => {
    expect(parseCandles([row(), row(time + 120000)], '1m').gaps).toBe(1)
    expect(nextCandleTimestamp(Date.UTC(2024, 0, 1), '1Mutc')).toBe(Date.UTC(2024, 1, 1))
    expect(nextCandleTimestamp(Date.UTC(2024, 0, 1), '3Mutc')).toBe(Date.UTC(2024, 3, 1))
  })
})
describe('portable chart configuration', () => {
  it('accepts old saved settings and identities from other venues', () => {
    expect(chartProSettingsSchema.parse(defaultChartProSettings)).toEqual(defaultChartProSettings)
    const settings = { ...defaultChartProSettings, drawings: { 'binance:spot:BTCUSDT': [] }, candleTooltip: { position: 'right', transparency: 60 } }
    expect(chartProSettingsSchema.parse(settings)).toEqual(settings)
    expect(chartProSettingsSchema.parse({ ...settings, view: { ...settings.view, barSpace: 80 } }).view.barSpace).toBe(80)
    expect(() => chartProSettingsSchema.parse({ ...settings, candleTooltip: { position: 'right', transparency: 101 } })).toThrow()
  })
  it('renders tooltip settings without an application store or stylesheet', () => {
    const html = renderToStaticMarkup(<ChartTooltipSettings locale="en-US" settings={{ position: 'follow', transparency: 30 }} onChange={() => {}} />)
    expect(html).toContain('Candle tooltip position')
    expect(html).toContain('Follow crosshair')
    expect(html).toContain('30%')
  })
})

describe('consumer-independent presentation', () => {
  it('derives the base palette from the theme while respecting explicit overrides', () => {
    const dark = resolveAdaChartProps({ theme: 'dark' })
    expect(dark.backgroundColor).toBe('#292929')
    expect(buildStyles(dark).xAxis?.tickText?.color).toBe('#b2b5be')
    expect(resolveAdaChartProps({ theme: 'dark', textColor: '#ff0000' }).textColor).toBe('#ff0000')
  })
  it('renders candle units and finality without application state', () => {
    const page = parseCandles([row()], '1m')
    const html = renderToStaticMarkup(<ChartDataObservation locale="en-US" status="ready" page={page} units={{ volume: 'contracts', turnover: 'USDT' }} />)
    expect(html).toContain('Candles ready')
    expect(html).toContain('Volume: contracts')
    expect(html).toContain('Confirmed')
  })
})
