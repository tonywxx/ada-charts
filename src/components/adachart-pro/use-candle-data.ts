import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DataLoader, DataLoaderGetBarsParams, SymbolInfo } from 'klinecharts'
import { chartPeriods } from './chart-config'
import { candleKey, nativePeriods, nextCandleTimestamp, readCandlePage, subscribeCandles, PublicMarketError } from './public-candles'
import type { Candle, CandlePage, ChartPeriod, MarketInstrument, PublicMarketStatus } from './public-candles'

export function useCandleData<T extends MarketInstrument>({ instrument, period, active = true, choices = [], readPage = readCandlePage, onSelectionChange }: {
  instrument: T, period: ChartPeriod, active?: boolean,
  choices?: { identity: T, symbol: SymbolInfo }[],
  readPage?: (instrument: T, period: ChartPeriod, signal: AbortSignal, before?: number) => Promise<CandlePage>,
  onSelectionChange?: (instrument: T, period: ChartPeriod) => void,
}) {
  const key = candleKey(instrument, period)
  const runtime = useRef({ key, epoch: 0, active, unsubscribe: null as (() => void) | null, loaded: false, loadedKey: '', records: new Map<number, Candle>() })
  const [observation, setObservation] = useState<{ key: string, status: PublicMarketStatus, page?: CandlePage }>({ key, status: 'loading' })
  const pending = useRef<DataLoaderGetBarsParams | null>(null)
  const delegate = useRef<DataLoader>({ getBars: () => {} })
  const [loader] = useState<DataLoader>(() => ({ getBars: params => delegate.current.getBars(params), subscribeBar: params => delegate.current.subscribeBar?.(params), unsubscribeBar: params => delegate.current.unsubscribeBar?.(params) }))
  // AdaChart forwards only ticker/precision to the engine; full identity remains in our guarded key.
  useLayoutEffect(() => {
    const matches = (params: Pick<DataLoaderGetBarsParams, 'symbol' | 'period'>) => active && params.symbol.ticker === instrument.instId && params.period.type === nativePeriods[period].type && params.period.span === nativePeriods[period].span
    runtime.current.key = key; runtime.current.active = active
    delegate.current = {
    async getBars(params) {
      if (!matches(params)) {
        if (!active || params.type !== 'init') return
        const selected = choices.find(choice => choice.symbol.ticker === params.symbol.ticker)?.identity ?? (params.symbol.ticker === instrument.instId ? instrument : undefined)
        const selectedPeriod = chartPeriods.find(value => nativePeriods[value].type === params.period.type && nativePeriods[value].span === params.period.span)
        if (!selected || !selectedPeriod) return
        runtime.current.epoch++; runtime.current.unsubscribe?.(); runtime.current.unsubscribe = null
        const requestedKey = candleKey(selected, selectedPeriod)
        runtime.current.key = requestedKey
        setObservation({ key: requestedKey, status: 'loading' })
        pending.current = params
        onSelectionChange?.(selected, selectedPeriod)
        return
      }
      const state = runtime.current
      const retained = state.loadedKey === key && state.records.size > 0
      if (params.type === 'init') {
        state.epoch++; state.unsubscribe?.(); state.unsubscribe = null
        if (!retained) { state.loaded = false; state.records.clear(); params.callback([], false) }
        setObservation(previous => ({ ...(retained && previous.key === key ? previous : {}), key, status: 'loading' }))
      }
      const epoch = state.epoch
      const current = () => runtime.current.active && runtime.current.key === key && runtime.current.epoch === epoch
      if (params.type === 'backward' || params.type === 'update') { params.callback([], false); return }
      try {
        const before = params.type === 'forward' && params.timestamp !== null ? params.timestamp : undefined
        const page = await readPage(instrument, period, new AbortController().signal, before)
        if (!current()) return
        if (!page.candles.length) {
          if (params.type === 'forward') params.callback([], false)
          else { state.loaded = true; state.loadedKey = key; if (retained) params.callback([...state.records.values()].sort((a,b) => a.bar.timestamp - b.bar.timestamp).map(value => value.bar), false); setObservation(previous => ({ ...previous, key, status: 'empty' })) }
          return
        }
        if (params.type === 'init') state.records.clear()
        state.loaded = true; state.loadedKey = key
        for (const candle of page.candles) state.records.set(candle.bar.timestamp, candle)
        params.callback(page.candles.map(candle => candle.bar), { forward: page.candles.length === 300, backward: false })
        if (params.type === 'init') setObservation({ key, status: page.candles.length ? 'ready' : 'empty', page })
      } catch (failure) {
        if (!current()) return
        if (params.type === 'forward') params.callback([], false)
        else if (retained) params.callback([...state.records.values()].sort((a,b) => a.bar.timestamp - b.bar.timestamp).map(value => value.bar), false)
        setObservation(previous => ({ ...previous, key, status: failure instanceof PublicMarketError ? failure.status : 'unavailable' }))
      }
    },
    subscribeBar(params) {
      if (!matches(params) || runtime.current.unsubscribe) return
      const epoch = runtime.current.epoch
      runtime.current.unsubscribe = subscribeCandles(instrument, period, value => {
        if (!runtime.current.active || runtime.current.key !== key || runtime.current.epoch !== epoch) return
        if (typeof value === 'string') { setObservation(previous => ({ ...previous, status: value })); return }
        if (!runtime.current.loaded) return
        let accepted = false, gaps = 0
        for (const candle of value.candles) {
          const records = runtime.current.records, latest = Math.max(0, ...records.keys())
          if (candle.bar.timestamp < latest) continue
          const previous = records.get(candle.bar.timestamp)
          if (previous?.confirm && JSON.stringify(previous.bar) !== JSON.stringify(candle.bar)) { setObservation(previous => ({ ...previous, status: 'malformed' })); return }
          if (latest && candle.bar.timestamp > nextCandleTimestamp(latest, period)) gaps++
          records.set(candle.bar.timestamp, candle)
          params.callback(candle.bar)
          accepted = true
        }
        if (accepted) setObservation(previous => ({ key, status: 'ready', page: { ...value, gaps: (previous.page?.gaps ?? 0) + gaps } }))
      })
    },
    unsubscribeBar() { runtime.current.unsubscribe?.(); runtime.current.unsubscribe = null }
    }
    if (pending.current && matches(pending.current)) { const params = pending.current; pending.current = null; void delegate.current.getBars(params) }
  }, [active, key, instrument, period, readPage, onSelectionChange, choices])
  useLayoutEffect(() => () => { runtime.current.epoch++; runtime.current.unsubscribe?.(); runtime.current.unsubscribe = null }, [key, active])
  const [now, setNow] = useState(Date.now)
  useEffect(() => { if (!active) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [active])
  const status = observation.status === 'ready' && observation.page && now - observation.page.receivedAt > 15000 ? 'stale' : observation.status
  return { loader, observation: { ...observation, status } }

}
