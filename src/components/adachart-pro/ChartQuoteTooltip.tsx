import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Chart } from 'klinecharts'
import type { CandleTooltipSettings } from './candle-tooltip-settings'
const text = (locale: string) => (en: string, zh: string) => locale.startsWith('zh') ? zh : en

export function ChartTooltipSettings({ locale, settings, onChange }: { locale: string, settings: CandleTooltipSettings, onChange: (settings: CandleTooltipSettings) => void }) {
  const id = useId(), t = text(locale)
  const { position, transparency } = settings
  const setPosition = (position: CandleTooltipSettings['position']) => onChange({ ...settings, position })
  const setTransparency = (transparency: number) => onChange({ ...settings, transparency })
  return <fieldset className="ada-chart-tooltip-settings"><legend>{t('Candle tooltip', '行情提示框')}</legend><div className="adachart-pro__field">
    <label className="adachart-pro__field-label" htmlFor={id}>{t('Candle tooltip position', '提示框位置')}</label>
    <select id={id} className="adachart-pro__select" value={position} onChange={event => { const value = event.target.value; if (value === 'left' || value === 'right' || value === 'follow') setPosition(value) }}>
      <option value="left">{t('Left', '固定左侧')}</option>
      <option value="right">{t('Right', '固定右侧')}</option>
      <option value="follow">{t('Follow crosshair', '跟随十字光标')}</option>
    </select>
  </div><div className="ada-chart-tooltip-opacity">
    <label htmlFor={`${id}-transparency`}>{t('Background transparency', '背景透明度')}</label>
    <output htmlFor={`${id}-transparency`}>{transparency}%</output>
    <input id={`${id}-transparency`} type="range" min="0" max="100" step="1" value={transparency} onChange={event => setTransparency(Number(event.target.value))} />
  </div></fieldset>
}

export function ChartQuoteTooltip({ chart, period, timezone, locale, settings }: { chart: Chart, period: string, timezone: string, locale: string, settings: CandleTooltipSettings }) {
  const [pointer, setPointer] = useState<{ x: number, y: number, paneId: string } | null>(null)
  const quote = useRef<HTMLElement>(null)
  const [bounds, setBounds] = useState({ width: 248, height: 208, plotLeft: 0, plotWidth: 0, chartHeight: 0 })
  const { position, transparency } = settings, t = text(locale)
  const showing = pointer !== null
  useEffect(() => {
    const moved = (event: unknown) => {
      if (event && typeof event === 'object' && 'x' in event && typeof event.x === 'number' && 'y' in event && typeof event.y === 'number' && 'paneId' in event && typeof event.paneId === 'string') setPointer({ x: event.x, y: event.y, paneId: event.paneId })
    }
    const clear = () => setPointer(null)
    const host = chart.getDom()
    chart.subscribeAction('onCrosshairChange', moved)
    host?.addEventListener('pointerleave', clear)
    return () => { chart.unsubscribeAction('onCrosshairChange', moved); host?.removeEventListener('pointerleave', clear) }
  }, [chart])
  useLayoutEffect(() => {
    const element = quote.current, host = chart.getDom(), plot = chart.getDom('candle_pane', 'main')
    if (!element || !host || !plot) return
    const measure = () => {
      const box = element.getBoundingClientRect(), root = host.getBoundingClientRect(), main = plot.getBoundingClientRect()
      setBounds({ width: box.width, height: box.height, plotLeft: main.left - root.left, plotWidth: main.width, chartHeight: root.height })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element); observer.observe(host); measure()
    return () => observer.disconnect()
  }, [chart, showing])
  if (!pointer) return null
  const points = chart.convertFromPixel([{ x: pointer.x }], { paneId: 'candle_pane' })
  const point = Array.isArray(points) ? points[0] : points
  const bars = chart.getDataList(), symbol = chart.getSymbol()
  const bar = point?.dataIndex !== undefined ? bars[Math.max(0, Math.min(bars.length - 1, point.dataIndex))] : undefined
  if (!bar || !symbol) return null
  const tooltip = chart.getStyles().indicator.tooltip
  const rowHeight = Math.max(tooltip.title.marginTop + tooltip.title.size + tooltip.title.marginBottom, ...tooltip.features.map(feature => feature.marginTop + feature.size + feature.marginBottom))
  const indicatorBottom = tooltip.offsetTop + chart.getIndicators().filter(indicator => indicator.paneId === 'candle_pane').length * rowHeight + 8
  let left = position === 'right' ? bounds.plotLeft + bounds.plotWidth - bounds.width - 8 : bounds.plotLeft + 8
  let top = position === 'left' ? indicatorBottom : 8
  if (position === 'follow') {
    const root = chart.getDom()?.getBoundingClientRect(), pane = chart.getDom(pointer.paneId, 'main')?.getBoundingClientRect()
    const x = pointer.x + (pane && root ? pane.left - root.left : 0), y = pointer.y + (pane && root ? pane.top - root.top : 0)
    left = x + 16 + bounds.width <= bounds.plotLeft + bounds.plotWidth - 8 ? x + 16 : x - bounds.width - 16
    top = y + 16 + bounds.height <= bounds.chartHeight - 8 ? y + 16 : y - bounds.height - 16
  }
  left = Math.max(bounds.plotLeft + 8, Math.min(left, bounds.plotLeft + bounds.plotWidth - bounds.width - 8))
  top = Math.max(8, Math.min(top, bounds.chartHeight - bounds.height - 8))
  return <aside ref={quote} className="ada-chart-quote" data-position={position} style={{ left, top, '--tooltip-background-opacity': `${100 - transparency}%` } as CSSProperties} aria-label={t('Candle details', 'K 线详情')}>
    <strong>{symbol.ticker}<span>{period.replace('utc', '')}</span></strong>
    <time dateTime={new Date(bar.timestamp).toISOString()}>{new Date(bar.timestamp).toLocaleString(locale, { timeZone: timezone })} · {timezone}</time>
    <dl>{([
      [t('Open price', '开盘价'), bar.open, symbol.pricePrecision],
      [t('High price', '最高价'), bar.high, symbol.pricePrecision],
      [t('Low price', '最低价'), bar.low, symbol.pricePrecision],
      [t('Close price', '收盘价'), bar.close, symbol.pricePrecision],
      [t('Volume', '成交量'), bar.volume, symbol.volumePrecision]
    ] as const).map(([label, value, precision]) => <div key={label}><dt>{label}</dt><dd>{value?.toLocaleString(locale, { maximumFractionDigits: precision }) ?? '—'}</dd></div>)}</dl>
  </aside>
}
