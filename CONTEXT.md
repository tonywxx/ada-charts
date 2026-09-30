# ada-charts

A library of chart components that wrap third-party charting engines so downstream projects can render financial and general data visualizations declaratively.

## Language

**Engine**:
The third-party charting library a component wraps — `lightweight-charts` or `klinecharts`. An engine's own vocabulary stays visible through the wrapper.
_Avoid_: backend, provider, dependency

**Wrapper**:
The React component that presents an engine as props and lifecycle, without hiding the engine's full surface.
_Avoid_: bridge, adapter, proxy

**Feature flag**:
A named switch that decides whether an optional part of a Wrapper exists on a given chart. The Pro layer is one component whose capabilities are turned on per flag, not several components to choose between.
_Avoid_: option, toggle, mode

**Series**:
One plotted stream of data on a chart, of a single kind. A chart may hold several series; each is added and configured independently.
_Avoid_: dataset, plot, line

**Chart type**:
The visual kind of a series — candlestick, line, area, bar, histogram or baseline. It describes how values are drawn, not what they mean. A scheme that decides which candles exist at all — Renko, Kagi, point & figure, range bars — is not a chart type: it re-samples the data, which is bar aggregation and belongs to the source.
_Avoid_: chart kind, series type, style

**Candle**:
A single price observation over a period, carrying open, high, low and close. The OHLC spelling is used when the four fields are meant individually.
_Avoid_: K-line, bar (bar means the histogram series kind)

**Open candle**:
The candle for the period that has not ended yet. Its high, low, close and volume are still changing, and the source may revise them. The source states that a candle is open; the chart does not infer it from a clock.
_Avoid_: realtime candle, live candle, forming bar

**Closed candle**:
A candle whose period has ended, so its four fields are final. Only a closed candle may be relied on as a record; an open candle describes activity so far and nothing more. A chart is wrong both ways round: treating an open candle as final freezes a number that was going to move, and treating a closed one as open lets a late revision overwrite history.
_Avoid_: finished bar, confirmed candle, final candle

**Bar size**:
The time span one candle covers (`1D`, `4H`, `1m`). Distinct from the number of bars requested.
_Avoid_: interval, timeframe, resolution

**Data item**:
One entry in a series: either a candle, or a time plus a single value.
_Avoid_: datapoint, record, row

**Marker**:
An annotation attached to a point on the chart. It labels an existing series rather than adding data to it.
_Avoid_: label, pin, annotation

**Reference line**:
A straight line drawn at a fixed axis value, independent of any series' data.
_Avoid_: guide, gridline, rule

**Drawing manager**:
The panel that lists the shapes drawn on a chart and acts on one of them — naming, locking, hiding, raising or deleting it. TradingView calls its version an *object tree*, which names the structure; this names the responsibility, as the rest of this list does.
_Avoid_: object tree, overlay list, drawing list

**Watermark**:
Non-interactive text or logo drawn behind the series as attribution or branding.
_Avoid_: overlay (an overlay is a data-attached shape)

**Indicator**:
A derived series computed from candles — a moving average, RSI, volume and the like — that analyses data rather than presenting it.
_Avoid_: study, metric, derived series

**Pane**:
A horizontal region of the chart with its own axis. A chart has a main pane plus any number of stacked panes.
_Avoid_: panel, subplot, region

**Price precision**:
How many decimals a price is shown with. Distinct from the **minimum move** — the smallest price change the instrument can express. The two are configured together but mean different things, and both come from the instrument, not from the magnitude of the data.
_Avoid_: tick size, granularity, decimals, scale

**Theme**:
The coordinated colour and typography treatment applied across a chart's parts.
_Avoid_: style (style means a single part's settings), skin

**DataLoader**:
The source of a chart's data, named the way the engine names it — `getBars`, plus optional `subscribeBar` and `unsubscribeBar`, asked for a `SymbolInfo` and a `Period`. TradingView spells this same seam *datafeed*, and the symbol string it takes is this `SymbolInfo`'s `ticker`. Which venue answers it is the caller's business: a chart is given one loader and one instrument and knows nothing else.
_Avoid_: provider, connector, adapter

**Live data**:
Market data fetched from its source when the page is opened. It arrives once, as a set; a source that keeps pushing after that is supplying streaming data.
_Avoid_: real data, remote data

**Streaming data**:
Market data a source keeps pushing while the page is open. It begins as a set fetched once — that part is live data — and continues as revisions to the newest candle. The chart never aggregates raw trades into candles itself; the aggregation is the source's, so both sides agree on where a period ends.
_Avoid_: realtime data, push data, socket data

**Snapshot**:
A committed capture of previously fetched market data, used so docs still render offline. Always labelled with the time it was taken.
_Avoid_: fallback, mock, sample

**Downstream project**:
A consumer that installs these components. The library's public surface is sized for it, not for this repo's own docs.
_Avoid_: user, client, app
