import { z } from 'zod'
import { Decimal } from 'decimal.js'
import type { KLineData, Period } from 'klinecharts'
export type MarketInstrument = { source: string, marketType: string, instId: string, instFamily?: string }
export type PublicMarketStatus = 'loading' | 'ready' | 'stale' | 'empty' | 'malformed' | 'unavailable' | 'offline' | 'rate-limited' | 'restricted'
export class PublicMarketError extends Error {
  readonly status: PublicMarketStatus
  constructor(status: PublicMarketStatus) { super(status); this.status = status }
}
const instrumentKey = (instrument: MarketInstrument) => `${instrument.source}:${instrument.marketType}:${instrument.instId}`
const publicDecimal = z.string().max(100).regex(/^\d+(\.\d+)?$/).refine(value => Number.isFinite(Number(value)))
export type CandleRead = (path: '/market/candles' | '/market/history-candles', params: URLSearchParams, signal: AbortSignal) => Promise<unknown>
const publicRead: CandleRead = async (path, params, signal) => {
  let response: Response
  try { response = await fetch(`https://www.okx.com/api/v5${path}?${params}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]), credentials: 'omit' }) }
  catch { throw new PublicMarketError('offline') }
  if (!response.ok) throw new PublicMarketError(response.status === 429 ? 'rate-limited' : response.status === 403 ? 'restricted' : 'unavailable')
  const value = z.object({ code: z.string(), data: z.unknown() }).safeParse(await response.json())
  if (!value.success) throw new PublicMarketError('malformed')
  if (value.data.code !== '0') throw new PublicMarketError(value.data.code === '50011' ? 'rate-limited' : 'unavailable')
  return value.data.data
}
import type { chartPeriodSchema } from './chart-config'

export type ChartPeriod = z.infer<typeof chartPeriodSchema>
export const nativePeriods: Record<ChartPeriod, Period> = { '1m': { type: 'minute', span: 1 }, '3m': { type: 'minute', span: 3 }, '5m': { type: 'minute', span: 5 }, '15m': { type: 'minute', span: 15 }, '30m': { type: 'minute', span: 30 }, '1H': { type: 'hour', span: 1 }, '2H': { type: 'hour', span: 2 }, '4H': { type: 'hour', span: 4 }, '6H': { type: 'hour', span: 6 }, '12H': { type: 'hour', span: 12 }, '1Dutc': { type: 'day', span: 1 }, '1Wutc': { type: 'week', span: 1 }, '1Mutc': { type: 'month', span: 1 }, '3Mutc': { type: 'month', span: 3 } }
const intervals: Record<ChartPeriod, number> = { '1m': 60_000, '3m': 180_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000, '1H': 3_600_000, '2H': 7_200_000, '4H': 14_400_000, '6H': 21_600_000, '12H': 43_200_000, '1Dutc': 86_400_000, '1Wutc': 604_800_000, '1Mutc': 31 * 86_400_000, '3Mutc': 92 * 86_400_000 }
function candleBoundary(timestamp: number, period: ChartPeriod) {
  const date = new Date(timestamp)
  if (period === '1Mutc' || period === '3Mutc') return timestamp === Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) && date.getUTCMonth() % nativePeriods[period].span === 0
  return (timestamp - (period === '1Wutc' ? 4 * 86_400_000 : 0)) % intervals[period] === 0
}
export function nextCandleTimestamp(timestamp: number, period: ChartPeriod) {
  if (period === '1Mutc' || period === '3Mutc') {
    const date = new Date(timestamp)
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + nativePeriods[period].span, 1)
  }
  return timestamp + intervals[period]
}
const rowSchema = z.tuple([z.string().regex(/^\d+$/), publicDecimal, publicDecimal, publicDecimal, publicDecimal, publicDecimal, publicDecimal, publicDecimal, z.enum(['0', '1'])])
export type Candle = { bar: KLineData, confirm: boolean, close: string }
export type CandlePage = { candles: Candle[], gaps: number, receivedAt: number }
export function candleInterval(period: ChartPeriod) { return intervals[period] }
export function candleKey(instrument: MarketInstrument, period: ChartPeriod) { return `${instrumentKey(instrument)}:${instrument.instFamily ?? ''}:${period}` }
const number = (value: string) => {
  const result = Number(value)
  if (!Number.isFinite(result) || !new Decimal(result).eq(value)) throw new PublicMarketError('malformed')
  return result
}
export function parseCandles(raw: unknown, period: ChartPeriod): CandlePage {
  const rows = z.array(rowSchema).max(300).safeParse(raw)
  if (!rows.success) throw new PublicMarketError('malformed')
  const unique = new Map<number, Candle>()
  for (const row of rows.data) {
    const [ts, open, high, low, close, volume, , turnover, confirm] = row
    const timestamp = Number(ts)
    if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || timestamp > Date.now() || !candleBoundary(timestamp, period) || new Decimal(high).lt(open) || new Decimal(high).lt(close) || new Decimal(low).gt(open) || new Decimal(low).gt(close) || new Decimal(low).gt(high)) throw new PublicMarketError('malformed')
    const candle = { bar: { timestamp, closed: confirm === '1', open: number(open), high: number(high), low: number(low), close: number(close), volume: number(volume), turnover: number(turnover) }, confirm: confirm === '1', close }
    const prior = unique.get(timestamp)
    if (prior && (JSON.stringify(prior.bar) !== JSON.stringify(candle.bar) || prior.confirm !== candle.confirm)) throw new PublicMarketError('malformed')
    unique.set(timestamp, candle)
  }
  const candles = [...unique.values()].sort((a, b) => a.bar.timestamp - b.bar.timestamp)
  const gaps = candles.reduce((count, candle, index) => count + (index > 0 && candle.bar.timestamp > nextCandleTimestamp(candles[index - 1]!.bar.timestamp, period) ? 1 : 0), 0)
  return { candles, gaps, receivedAt: Date.now() }
}
export async function readCandlePage(instrument: MarketInstrument, period: ChartPeriod, signal: AbortSignal, before?: number, read: CandleRead = publicRead) {
  const params = new URLSearchParams({ instId: instrument.instId, bar: period, limit: '300' })
  if (before !== undefined) params.set('after', String(before))
  const page = parseCandles(await read(before === undefined ? '/market/candles' : '/market/history-candles', params, signal), period)
  if (before !== undefined && page.candles.some(candle => candle.bar.timestamp >= before)) throw new PublicMarketError('malformed')
  return page
}

type LiveListener = (value: CandlePage | PublicMarketStatus) => void
type Stream = { listeners: Set<LiveListener>, socket: WebSocket | null, retry: ReturnType<typeof setTimeout> | null, heartbeat: ReturnType<typeof setInterval> | null, lastMessage: number, stopped: boolean, delay: number }
const streams = new Map<string, Stream>()
// Sharing the transport is separate from each native chart's selection generation.
export function subscribeCandles(instrument: MarketInstrument, period: ChartPeriod, listener: LiveListener) {
  const key = candleKey(instrument, period)
  let stream = streams.get(key)
  if (!stream) {
    stream = { listeners: new Set(), socket: null, retry: null, heartbeat: null, lastMessage: Date.now(), stopped: false, delay: 1000 }
    streams.set(key, stream)
  }
  const current = stream
  current.listeners.add(listener)
  const publish = (value: CandlePage | PublicMarketStatus) => { for (const callback of current.listeners) callback(value) }
  const connect = () => {
    if (current.stopped) return
    const socket = new WebSocket('wss://ws.okx.com:8443/ws/v5/business')
    current.socket = socket
    socket.onopen = () => { current.lastMessage = Date.now(); socket.send(JSON.stringify({ op: 'subscribe', args: [{ channel: `candle${period}`, instId: instrument.instId }] })) }
    socket.onmessage = event => {
      current.lastMessage = Date.now()
      if (event.data === 'pong') return
      try {
        const message: unknown = JSON.parse(event.data)
        const envelope = z.object({ arg: z.object({ channel: z.literal(`candle${period}`), instId: z.literal(instrument.instId) }), data: z.array(z.unknown()).optional(), event: z.string().optional(), code: z.string().optional() }).safeParse(message)
        if (!envelope.success) throw new PublicMarketError('malformed')
        if (envelope.data.event === 'error' || envelope.data.code && envelope.data.code !== '0') throw new PublicMarketError(envelope.data.code === '50011' ? 'rate-limited' : 'unavailable')
        if (envelope.data.data) { const page = parseCandles(envelope.data.data, period); current.delay = 1000; publish(page) }
      } catch (failure) { publish(failure instanceof PublicMarketError ? failure.status : 'malformed') }
    }
    socket.onerror = () => publish('offline')
    socket.onclose = () => {
      if (current.heartbeat) clearInterval(current.heartbeat)
      current.socket = null
      if (!current.stopped) { publish('offline'); current.retry = setTimeout(connect, current.delay); current.delay = Math.min(current.delay * 2, 30_000) }
    }
    current.heartbeat = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) return
      if (Date.now() - current.lastMessage > 45_000) socket.close()
      else if (Date.now() - current.lastMessage > 20_000) socket.send('ping')
    }, 10_000)
  }
  if (!current.socket && !current.retry) connect()
  return () => {
    current.listeners.delete(listener)
    if (!current.listeners.size) {
      current.stopped = true
      if (current.retry) clearTimeout(current.retry)
      if (current.heartbeat) clearInterval(current.heartbeat)
      current.socket?.close(); streams.delete(key)
    }
  }
}
export function candleSymbol(instrument: MarketInstrument, metadata: { lotSz?: string, tickSz: string, priceCurrency: string }) {
  if (!metadata.lotSz) return null
  return { ticker: instrument.instId, instrumentKey: instrumentKey(instrument), pricePrecision: new Decimal(metadata.tickSz).decimalPlaces(), volumePrecision: new Decimal(metadata.lotSz).decimalPlaces(), priceCurrency: metadata.priceCurrency }
}
