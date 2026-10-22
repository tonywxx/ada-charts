import type { Chart } from 'klinecharts'

export function ChartDataControls({ locale, onRefresh, clearDrawings = false, chart, onChange }: {
  locale: string, onRefresh: () => void, clearDrawings?: boolean,
  chart?: () => Chart | null, onChange?: () => void,
}) {
  const t = (en: string, zh: string) => locale.startsWith('zh') ? zh : en
  return <><button type="button" className="text-button" onClick={onRefresh}>{t('Refresh candles', '刷新 K 线')}</button>{clearDrawings ? <button type="button" className="text-button" onClick={() => { chart?.()?.removeOverlay(); onChange?.() }}>{t('Clear drawings', '清除画线')}</button> : null}</>
}
