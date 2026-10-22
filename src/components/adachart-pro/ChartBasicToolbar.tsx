import type { Chart } from 'klinecharts'
import { chartDrawingNames, chartPeriods } from './chart-config'
import type { ChartPeriod } from './public-candles'
export function ChartBasicToolbar({ locale, period, onPeriodChange, chart, onChange }: { locale: string, period: ChartPeriod, onPeriodChange: (period: ChartPeriod) => void, chart: () => Chart | null, onChange: () => void }) {
  const t = (en: string, zh: string) => locale.startsWith('zh') ? zh : en
  return <><label>{t('Chart period', '图表周期')}<select aria-label={t('Chart period', '图表周期')} value={period} onChange={event => { const period = chartPeriods.find(value => value === event.target.value); if (period) onPeriodChange(period) }}>{chartPeriods.map(value => <option key={value}>{value}</option>)}</select></label><label>{t('Drawing tool', '画线工具')}<select aria-label={t('Drawing tool', '画线工具')} defaultValue="" onChange={event => { if (event.target.value) chart()?.createOverlay({ name: event.target.value, groupId: 'drawing_tools', paneId: 'candle_pane', onDrawEnd: onChange, onPressedMoveEnd: onChange, onRemoved: onChange }); event.target.value = '' }}><option value="">{t('Choose drawing', '选择画线')}</option>{chartDrawingNames.map(name => <option key={name}>{name}</option>)}</select></label></>
}
