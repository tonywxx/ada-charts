import type { CandlePage, PublicMarketStatus } from './public-candles'

export function ChartDataObservation({ locale, status, page, units }: {
  locale: string, status: PublicMarketStatus, page?: CandlePage,
  units?: { volume: string, turnover: string },
}) {
  const t = (en: string, zh: string) => locale.startsWith('zh') ? zh : en
  const last = page?.candles.at(-1)
  return <>
    <p role="status">{status === 'ready' ? t('Candles ready', 'K 线已就绪') : t(`Candles: ${status}`, `K 线：${status}`)}</p>
    {units ? <p className="market-units">{t(`Volume: ${units.volume} · Turnover: ${units.turnover}`, `成交量：${units.volume === 'contracts' ? '张' : units.volume} · 成交额：${units.turnover}`)}</p> : null}
    {last && units ? <p>{t(`Last candle close: ${last.close} ${units.turnover}`, `最新 K 线收盘价：${last.close} ${units.turnover}`)} · {last.confirm ? t('Confirmed', '已完成') : t('Forming', '未完成')}</p> : null}
    {page ? <p>{t('Last successful read', '最近成功读取')}: <time className="chart-source-time" dateTime={new Date(page.receivedAt).toISOString()}>{new Date(page.receivedAt).toISOString()}</time>{page.gaps ? ` · ${t('Gaps', '缺口')}: ${page.gaps}` : ''}</p> : null}
  </>
}
