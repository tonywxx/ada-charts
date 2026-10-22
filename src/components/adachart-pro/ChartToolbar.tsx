import { useId, useRef } from 'react'
import { chartPeriods } from './chart-config'
import type { ChartPeriod } from './public-candles'


export function ChartToolbar({ locale, period, candleType, onPeriodChange, onTypeChange, manualView, onReset }: { locale: string, period: ChartPeriod, candleType: string, onPeriodChange: (period: ChartPeriod) => void, onTypeChange: (type: 'area' | 'candle_solid') => void, manualView: boolean, onReset: () => void }) {
  const t = (en: string, zh: string) => locale.startsWith('zh') ? zh : en
  const id = useId()
  const menu = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null)
  const label = (value: ChartPeriod) => value.replace('utc', '')
  return <div className="ada-chart-toolbar">
    <div className="ada-chart-types" role="group" aria-label={t('Chart type', '图表类型')}>
      <button type="button" title={t('Line chart', '折线图')} aria-label={t('Line chart', '折线图')} aria-pressed={candleType === 'area'} onClick={() => onTypeChange('area')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v18h18M6 14l4-5 5 4 5-7" /></svg></button>
      <button type="button" title={t('Candlestick chart', '蜡烛图')} aria-label={t('Candlestick chart', '蜡烛图')} aria-pressed={candleType !== 'area'} onClick={() => onTypeChange('candle_solid')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v18h18M8 5v3m0 7v3m6-15v3m0 7v4m6-12v5m0 5v3" /><rect x="6" y="8" width="4" height="7" rx="1" /><rect x="12" y="6" width="4" height="7" rx="1" /><rect x="18" y="10" width="4" height="5" rx="1" /></svg></button>
    </div>
    <button ref={trigger} type="button" className="ada-chart-period-trigger" popoverTarget={id} aria-haspopup="dialog" aria-label={t(`Chart period: ${label(period)}`, `图表周期：${label(period)}`)}>{label(period)}<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 6 5 5 5-5" /></svg></button>
    <button type="button" className="ada-chart-reset" disabled={!manualView} title={t('Reset chart view and follow latest price', '重置图表视图并跟随最新行情')} onClick={onReset}>{t('Reset', '重置')}</button>
    <div ref={menu} id={id} popover="auto" role="dialog" aria-label={t('Chart period', '图表周期')} className="ada-chart-period-menu" onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const buttons = Array.from(event.currentTarget.querySelectorAll('button')); const index = buttons.findIndex(button => button === document.activeElement); buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus() } }}>
      {chartPeriods.map(value => <button key={value} type="button" aria-pressed={period === value} onClick={() => { onPeriodChange(value); menu.current?.hidePopover(); trigger.current?.focus() }}>{label(value)}{period === value ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m3 10 4 4L17 4" /></svg> : null}</button>)}
    </div>
  </div>
}
