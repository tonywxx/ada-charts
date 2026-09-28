# The volume overlay is a study of its own

`CONTEXT.md` gives **Indicator** as "a derived series computed from candles", and **Pane** as "a horizontal region of the chart with its own axis". The default view `AdaChart` opens on — a moving average over the candles with volume in the pane below — took the first of those for granted and ignored the second, and the mismatch is what this ADR records. The new default is **`EMA` plus `vol-main` over the candles, one `MACD` pane below**.

The engine ships a volume study, `VOL`, and this library does not touch it. It gains a second study, registered under a name of its own, `vol-main`, which draws one bar per candle and nothing else. The two are different studies, not two settings of one, and `VOL` — its three moving averages included — keeps the pane it has always had.

## Why not the engine's `VOL`

`VOL` is `calcParams: [5, 10, 20]` with four figures: three line figures and one bar figure. The averages are not a decoration that could be switched off; they are the study's shape, and the reader who wants the bars alone — the TradingView-style overlay, one bar per candle with no line through it — cannot have them from `VOL` at any setting.

Reusing the name was the cheaper-looking option and it is the wrong one, for a reason specific to `klinecharts`: the indicator registry is a **global, per-page map**, and `registerIndicator` writes into it by assignment. A second registration under an existing name silently replaces the first, for every chart on the page. That is one page's worth of collateral — the frozen `TChartPro`, every `KChartPro` story, and any caller who asked for `VOL` — in exchange for not typing a new name. There is no way to wrap the engine's own template instead: `getIndicatorClass` is not exported, so the built-in `VOL` cannot be cloned and trimmed. A new name is not a compromise here; it is the only way to add without subtracting.

## Why the candles' pane, and why an axis of its own

Volume in a pane below is a second chart. A reader comparing a bar's height with the candle that produced it — the only question the overlay answers — had to move their eyes and re-find the same column. Overlaying the bars on the candles is the whole point of the change.

But a count cannot share a price axis. The engine computes one axis' range from the union of the values drawn against it, so a volume series on the price axis stretches the range to cover both magnitudes and squeezes the candles: they are still drawn, still correct, and no longer readable. The study is therefore given its **own y-axis** inside the candle pane — a fact stated as an id on the indicator entry, since in v10 an indicator with no `yAxisId` silently adopts the pane's default axis. Its axis carries **no widget** (`needWidget: false`): the pane's default axis already labels the price, and a second column of numbers for a study nobody reads numerically is a column of numbers too many. The price-axis range is untouched by any of this, which is the property the whole arrangement exists to keep.

## Why the bars sit in the bottom fifth

An independent axis fixes the union problem but creates its own: the axis' range is the volume range, so the bars fill the pane's full height and the candles are overdrawn from top to bottom. A **band** — the bars keeping the bottom 20% of the pane, a margin above them — is what makes the two readable together, and TradingView's overlay does the same thing.

Two engine details decide how the band is expressed.

`overrideYAxis` carries a `gap`, which looks like the natural place for it, and it is not usable here: the engine reads a gap value of 1 or more as *pixels* and anything below 1 as a *fraction of the data range*, and a fraction cannot exceed 1 — so the largest band `gap` can express leaves the data in the bottom half. The band is therefore put on the axis' **`createRange`**, which scales the range the engine derived from the data: with the visible range multiplied by `1 / 0.2`, the bars' own range is the bottom fifth of the axis and the rest is empty space above them. The `gap` is pinned to zero in the same override, because the pane's layout template gives every axis `{top: 0.2, bottom: 0.1}` — left alone it would pad the already-scaled range and float the bars off the bottom.

`overrideYAxis` returns early when the axis it names does not exist yet, and the axis comes into being with the indicator, so the order is fixed: create the indicator, then override its axis. The interaction is not an accident of timing but the price of using the axis as the band's carrier.

## Why the legend reads the instrument's decimals

The overlay's legend reads `VOLUME: 0.68` on the `1m` window and `VOLUME: 6.356K` on the daily one, and the number it rounds to is the instrument's rather than the study's. `series: "volume"` is what routes it there: the engine hands every volume series the symbol's `volumePrecision`, in the study's legend and in the candle tooltip's `Volume` alike. An instrument that names none resolves to the engine's own fallback of **zero decimals**, which is how a fractional volume of `0.68` came to be drawn as `0`.

Stating the precision on the template does not fix that, and this was measured rather than assumed: the engine's `override` does lock a numeric precision, and the indicator's constructor clears that lock immediately afterwards, so the instrument's precision passes through either way. The completion happens where the symbol is assembled (`resolveSymbol`), and it is done for volume only — the engine's price fallback of two decimals is a usable default for a price, while its volume fallback of zero decimals is not usable for a volume.

## One inventory, or two

`ADACHART_BUILT_IN_INDICATORS` is the engine's own list — the result of `getSupportedIndicators()` — and is kept as such. It is what a compile-time invariant in `adachart-window-config.test.ts` is checked against: every indicator `klinecharts` ships must appear in exactly one of `MAIN_INDICATORS` / `SUB_INDICATORS`, or the build fails. A name the engine has never heard of, added to that list, would make it an inventory of something other than the engine, and the invariant would no longer be about `klinecharts`. `vol-main` is therefore registered by this library and appears only in `MAIN_INDICATORS`.

The split itself is unchanged: main-pane studies are drawn in the instrument's own units, sub-pane studies are not. `vol-main` is a main-pane study in the sense that matters here — it is drawn in the candles' pane — and it is the one entry in that list which is not the engine's and does not share the price axis; how it gets its own axis is `AdaChart`'s business, and that is where the y-axis id and the band live.

The panel's two dropdowns now list the two groups rather than one list twice, so the labels are the actual choice being offered. The cost is explicit: `RSI` can no longer be put on the candles' pane — it never could be drawn there meaningfully, since an oscillator has no price, but it was previously *offered*.

## Considered options

- **Re-register `VOL` without the averages.** Rejected: the registry is global and keyed by name, so this rewrites the study for every chart on the page, including the frozen components and callers outside this library.
- **Give `vol-main` the same style of tooltip as `VOL`.** Nothing to port: the tooltip is the engine's and is drawn from the study's figures, and a study whose only figure is a bar reports one value — which is what the overlay is.
- **Draw the bars as a drawing tool (overlay).** Rejected: an overlay is a shape attached to the data (see **Marker** in `CONTEXT.md`), not a series. It would have to be rebuilt by hand on every data change, would not take part in the indicator list, and could not be toggled, configured or removed like a study.
- **Volume in its own pane by default, no overlay.** Rejected as the default, not as a feature: it is what `VOL` already is, and it answers a different question. The pane list still opens one study long, so the grid opens on a chart rather than a wall of axes.

## Measured behaviour

The band was measured on the live grid rather than reasoned about — `MultiPeriodGrid` in `src/components/adachart/AdaChart.stories.tsx`, six windows over BTC-USDT on 2026-09-27 local (2026-09-28 UTC), Playwright reading the six candle-pane canvases. Each pane was composited onto white first, because the bars are drawn at 0.7 alpha and the candles solid: over a known background the two are told apart by colour, and every bar pixel is otherwise invisible to a probe that looks for opaque ones.

| Bar size (`INITIAL_BAR_KEYS`) | Tallest bar's top | Deepest bar's bottom |
| --- | --- | --- |
| `1m` | 0.503 | 0.993 |
| `5m` | **0.797** | 0.993 |
| `15m` | **0.797** | 0.993 |
| `1H` | 0.399 | 0.993 |
| `4H` | 0.582 | 0.993 |
| `1Dutc` | **0.797** | 0.993 |

Read the columns separately. The **bottom** is the band working: every bar is anchored on the pane's last row (0.993 of its height), which is the `gap: {top: 0, bottom: 0}` override taking effect — the layout template's own bottom gap of 0.1 would have floated them clear of it.

The **top** is `1 / 0.2` applied to the axis' range, and it lands where the design says on the three windows whose tallest volume is on screen: 0.797 against an intended 0.800. The other three sit lower because the range is the engine's, taken over the window's data rather than over the pixels — a taller bar outside the visible range raises the top of the range, and the bars on screen then keep less of the band. That is the same reading a TradingView overlay gives at the same scroll position: the band is a fixed share of the axis, not of the tallest bar currently in view.

Two things the same run confirms. The **candles are untouched**: their price axis still spans the pane, so the separate axis is doing what it exists for and the union problem is absent. And the overlay's own data is the bar's own `volume`, arriving at `calc` exactly as the engine's `VOL` reads it — 300 bars, none rewritten — so nothing about the data path needed changing for this study.

## Consequences

- **Registration is guarded and per-page.** The template is registered once, on the same "only ever needed a single time per page" reasoning as `ensureExtensionOverlays`, and the guard is what keeps a remount from re-registering.
- **`AdaChartPro` inherits all of it** by rendering `AdaChart` internally: its main-pane studies are stacked the same way, so `vol-main` is registered, banded, and hidden behind its own axis there too, with no second implementation.
- **A caller who never names `vol-main` pays nothing but the template.** The registration is a map entry; no chart gains an axis unless the study is asked for.
- **The band is not a prop.** The share of the pane the bars take is a constant, and a per-chart override would be a second way to express something the axis already expresses. If it ever needs to be a setting, it is a setting on the axis, not on the chart.