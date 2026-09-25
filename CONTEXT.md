# ada-charts

A library of chart components that wrap third-party charting engines so downstream projects can render financial and general data visualizations declaratively.

## Language

**Engine**:
The third-party charting library a component wraps — `lightweight-charts` or `klinecharts`. An engine's own vocabulary stays visible through the wrapper.
_Avoid_: backend, provider, dependency

**Wrapper**:
The React component that presents an engine as props and lifecycle, without hiding the engine's full surface.
_Avoid_: bridge, adapter, proxy

**Series**:
One plotted stream of data on a chart, of a single kind. A chart may hold several series; each is added and configured independently.
_Avoid_: dataset, plot, line

**Chart type**:
The visual kind of a series — candlestick, line, area, bar, histogram or baseline. It describes how values are drawn, not what they mean.
_Avoid_: chart kind, series type, style

**Candle**:
A single price observation over a period, carrying open, high, low and close. The OHLC spelling is used when the four fields are meant individually.
_Avoid_: K-line, bar (bar means the histogram series kind)

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

**Live data**:
Market data fetched from its source when the page is opened.
_Avoid_: real data, remote data

**Snapshot**:
A committed capture of previously fetched market data, used so docs still render offline. Always labelled with the time it was taken.
_Avoid_: fallback, mock, sample

**Downstream project**:
A consumer that installs these components. The library's public surface is sized for it, not for this repo's own docs.
_Avoid_: user, client, app
