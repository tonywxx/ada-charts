import React from 'react'
import { createRoot } from 'react-dom/client'
const { AdaChartPro } = new URL(location.href).searchParams.has('built') ? await import('../../dist/adachart-pro.js') : await import('../../src/components/adachart-pro/index.ts')
if (new URL(location.href).searchParams.has('built')) await import('../../dist/adachart-pro.css')
const timestamp = Math.floor(Date.now() / 60000) * 60000 - 100 * 60000
const bars = Array.from({ length: 100 }, (_, i) => ({ timestamp: timestamp + i * 60000, open: 100 + i, high: 105 + i, low: 95 + i, close: 102 + i, volume: 1.25 }))
const loader = { getBars: params => params.callback(params.type === 'init' ? bars : [], false), subscribeBar: params => { window.pushBar = params.callback }, unsubscribeBar() {} }
createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode, null, React.createElement(AdaChartPro, { fill: true, theme: 'dark', locale: 'en-US', symbol: { ticker: 'TEST', pricePrecision: 2, volumePrecision: 2 }, period: { type: 'minute', span: 1 }, periods: [{ type: 'minute', span: 1 }, { type: 'hour', span: 1 }], dataLoader: loader, drawingManager: true, onChartReady: api => { window.chartApi = api } })))
