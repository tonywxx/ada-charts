import type { Chart, OverlayCreate } from 'klinecharts'
import { chartDrawingSchema, chartIndicatorSchema, chartSettingsSchema, proMainIndicators } from './chart-config'
import type { ChartSettings } from './chart-config'

export const indicatorPane = (name: string) => proMainIndicators.some(value => value === name) ? 'candle_pane' : `ada-${name}`

export function captureChart(chart: Chart, settings: ChartSettings, instrument: string, captureView: boolean, capturePanes: boolean): ChartSettings {
  const indicators = chart.getIndicators().map(value => {
    const previous = settings.indicators.find(item => item.name === value.name)
    const options = chart.getPaneOptions(value.paneId)
    return chartIndicatorSchema.parse({ name: value.name, calcParams: value.calcParams, visible: value.visible, ...(value.styles?.lines ? { styles: { lines: value.styles.lines } } : previous?.styles ? { styles: previous.styles } : {}), ...(capturePanes && options && !Array.isArray(options) && value.paneId !== 'candle_pane' ? { paneHeight: options.height } : previous?.paneHeight ? { paneHeight: previous.paneHeight } : {}) })
  })
  const drawings = chart.getOverlays().filter(value => value.currentStep < 0 && value.points.length).map(value => chartDrawingSchema.parse({
    id: value.id, name: value.name, pane: value.paneId === 'candle_pane' ? 'candle_pane' : chart.getIndicators().find(item => item.paneId === value.paneId)?.name,
    groupId: 'drawing_tools', points: value.points.map(point => ({ timestamp: point.timestamp ?? (point.dataIndex === undefined ? undefined : chart.getDataList()[point.dataIndex]?.timestamp), value: point.value })),
    mode: value.mode, modeSensitivity: value.modeSensitivity, lock: value.lock, visible: value.visible,
    // Hover temporarily raises an unfixed drawing; that transient layer is not configuration.
    zLevel: !value.fixedZLevel && value.zLevel === Number.MAX_SAFE_INTEGER ? settings.drawings[instrument]?.find(saved => saved.id === value.id)?.zLevel ?? 0 : value.zLevel, fixedZLevel: value.fixedZLevel,
    ...(value.styles ? { styles: Object.fromEntries(Object.entries(value.styles).filter(([name]) => ['line', 'arc', 'polygon', 'circle', 'rect', 'point'].includes(name))) } : {})
  }))
  // Engine data/results, inherited palettes and transient armed tools never enter configuration.
  const barSpace = chart.getBarSpace().bar
  const rightOffset = chart.getOffsetRightDistance()
  // The native getter clamps historical pans to zero; restore their visible bar position.
  const signedOffset = rightOffset > 0 ? rightOffset : Math.min(0, (chart.getVisibleRange().realTo - chart.getDataList().length - 0.5) * barSpace)
  const view = captureView ? { ...settings.view, barSpace, offsetRightDistance: signedOffset } : settings.view
  const savedDrawings = settings.drawings[instrument] ?? []
  return chartSettingsSchema.parse({ period: settings.period, indicators, view, drawings: !drawings.length && !savedDrawings.length ? settings.drawings : { ...settings.drawings, [instrument]: drawings } })
}

export function restoreDrawings(chart: Chart, settings: ChartSettings, instrument: string, changed: () => void) {
  chart.removeOverlay()
  for (const saved of settings.drawings[instrument] ?? []) {
    const { pane, ...record } = saved
    const paneId = pane === 'candle_pane' ? pane : chart.getIndicators().find(value => value.name === pane)?.paneId ?? indicatorPane(pane)
    const value: OverlayCreate = { ...record, paneId, onDrawEnd: changed, onPressedMoveEnd: changed, onRemoved: changed }
    chart.createOverlay(value)
  }
}
