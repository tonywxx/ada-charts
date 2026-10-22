import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const server = await createServer({ server: { host: '127.0.0.1', port: 0 } })
await server.listen()
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  const errors = []
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message) })
  await page.route(url => url.pathname === '/__standalone', async route => route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml('/__standalone', '<html><head><style>html,body,#root{height:100%;margin:0}#root{transform:translateZ(0)}</style></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/standalone-chart.mjs"></script></body></html>') }))
  await page.goto(`${server.resolvedUrls.local[0]}__standalone${process.argv.includes('--source') ? '' : '?built'}`)
  await page.waitForFunction(() => window.chartApi?.chart()?.getDataList().length === 100)
  await page.getByRole('button', { name: 'Reset', exact: true }).waitFor()
  assert.equal(await page.locator('.adachart-pro').evaluate(element => Math.round(element.getBoundingClientRect().height)), 900)
  await page.getByRole('button', { name: 'Line chart', exact: true }).click()
  await page.waitForFunction(() => window.chartApi.chart().getStyles().candle.type === 'area')
  await page.getByRole('button', { name: /^Chart period:/ }).click()
  assert.equal(await page.getByRole('dialog', { name: 'Chart period', exact: true }).getByRole('button').count(), 14)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
  await page.evaluate(() => {
    const cover = document.createElement('div'); cover.id = 'stacking-regression';
    cover.style.cssText = 'position:fixed;inset:0;z-index:2147483647';
    document.body.appendChild(cover);
  })
  await settings.getByRole('combobox', { name: 'Price axis', exact: true }).selectOption('left')
  await page.waitForFunction(() => { const chart = window.chartApi.chart(); return chart.getDom('candle_pane', 'main').getBoundingClientRect().left > chart.getDom().getBoundingClientRect().left + 10 })
  await settings.getByRole('combobox', { name: 'Candle tooltip position', exact: true }).selectOption('right')
  await settings.getByLabel('Background transparency', { exact: true }).fill('60')
  await settings.getByRole('button', { name: 'Confirm', exact: true }).click()
  await page.evaluate(() => document.getElementById('stacking-regression').remove())
  const host = page.locator('[k-line-chart-id]')
  await host.hover({ position: { x: 400, y: 100 } })
  await page.locator('.ada-chart-quote[data-position="right"]').waitFor()
  const snapshot = await page.evaluate(() => {
    const api = window.chartApi, chart = api.chart()
    chart.createOverlay({ name: 'segment', id: 'saved-line', points: [{ timestamp: chart.getDataList()[10].timestamp, value: 110 }, { timestamp: chart.getDataList()[20].timestamp, value: 120 }] })
    chart.setBarSpace(8); chart.scrollByDistance(150)
    return api.getConfiguration(undefined, 'other:TEST')
  })
  assert.deepEqual(snapshot.candleTooltip, { position: 'right', transparency: 60 })
  assert.equal(snapshot.drawings['other:TEST'][0].id, 'saved-line')
  await page.evaluate(async snapshot => { const api = window.chartApi; api.chart().removeOverlay(); await api.setConfiguration(snapshot, 'other:TEST') }, snapshot)
  assert.equal(await page.evaluate(() => window.chartApi.chart().getOverlays().length), 1)
  assert.equal(await page.evaluate(() => window.chartApi.chart().getBarSpace().bar), 8)
  const paneGeometry = await page.evaluate(async snapshot => {
    const api = window.chartApi, chart = api.chart();
    const pane = chart.getIndicators().find(value => value.paneId !== 'candle_pane');
    const previous = snapshot.indicators.find(value => value.name === pane.name).paneHeight;
    chart.setPaneOptions({ id: pane.paneId, height: previous + 40 });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const passive = api.getConfiguration(snapshot, 'other:TEST').indicators.find(value => value.name === pane.name).paneHeight;
    return { previous, passive, id: pane.paneId, name: pane.name };
  }, snapshot)
  assert.equal(paneGeometry.passive, paneGeometry.previous, 'automatic geometry does not overwrite saved pane height')
  const separator = await page.locator('[k-line-chart-id] [style*="cursor: ns-resize"][style*="z-index: 20"]').first().boundingBox()
  assert.ok(separator, 'a native pane separator is available')
  await page.mouse.move(separator.x + separator.width / 2, separator.y + separator.height / 2)
  await page.mouse.down()
  await page.mouse.move(separator.x + separator.width / 2, separator.y - 20, { steps: 5 })
  await page.mouse.up()
  const draggedPane = await page.evaluate(async ({ snapshot, pane }) => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const api = window.chartApi;
    return { actual: api.chart().getPaneOptions(pane.id).height, saved: api.getConfiguration(snapshot, 'other:TEST').indicators.find(value => value.name === pane.name).paneHeight };
  }, { snapshot, pane: paneGeometry })
  assert.equal(draggedPane.saved, draggedPane.actual, 'explicit pane drag updates saved geometry')
  assert.notEqual(draggedPane.saved, paneGeometry.previous)
  const before = await page.evaluate(() => {
    const chart = window.chartApi.chart(); chart.scrollByDistance(120); return chart.getVisibleRange().realTo
  })
  await page.evaluate(() => {
    const bar = window.chartApi.chart().getDataList().at(-1)
    window.pushBar({ ...bar, timestamp: bar.timestamp + 60000 })
  })
  const after = await page.evaluate(() => window.chartApi.chart().getVisibleRange().realTo)
  assert.ok(Math.abs(after - before) < 0.1, 'manual view survives new bars')
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  assert.equal(await page.evaluate(() => window.chartApi.chart().getBarSpace().bar), 6)
  assert.equal(await page.evaluate(() => window.chartApi.chart().getOffsetRightDistance()), 10)
  assert.deepEqual(errors, [])
  console.log(`${process.argv.includes('--source') ? 'Source' : 'Built'} AdaChartPro: toolbar, tooltip, fill, configuration, drawings, view retention and Reset passed`)
} finally { await browser.close(); await server.close() }
