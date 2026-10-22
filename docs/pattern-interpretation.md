# Pattern interpretation (rules v1)

Enable `patternInterpretation` on either AdaChart or AdaChartPro. AdaChartPro forwards this feature to AdaChart; there is one detector and one UI. The chart control hides/shows automatic shapes. Click a directional marker or choose a signal from the accessible list to open details. The list and drawing layer show the latest 40 signals from at most 5,000 loaded candles.

Supply `closed: true` on completed candles and `closed: false` on open candles. Alternatively, supply `isCandleClosed(candle)` on either component. Missing finality is not inferred from a clock or from array position; it produces no confirmed signal. OKX's native completion flag is retained by the built-in loader and the adabet integration. Static data must state its own finality.

## The twenty patterns

The ten families each have bullish and bearish definitions and English/Chinese names. Bearish recognition reflects prices and high/low roles before applying the same rules. This makes the tolerances symmetric.

| Family | Bullish | Bearish | Geometry in bullish coordinates |
| --- | --- | --- | --- |
| Double | W bottom | M top | Low-high-low; troughs within 15% of shape range |
| Triple | Triple bottom | Triple top | Low-high-low-high-low; all troughs within 15% |
| Shoulders | Inverse head and shoulders | Head and shoulders | Three troughs; shoulders within 15%; head at least 20% of range deeper |
| Rounding | Rounding bottom | Rounding top | 24/40/64 closes fit a U-shaped quadratic, normalized mean squared error at most 1.5%; rims within 15% of depth |
| Megaphone | Megaphone bottom | Megaphone top | Three successively higher highs and lower lows, each moving by over 8% of shape range |
| Flag | Bullish flag | Bearish flag | Three touches per boundary; falling, nearly parallel channel after an upward impulse |
| Symmetrical triangle | Bullish symmetrical triangle | Bearish symmetrical triangle | Falling upper and rising lower boundary after an upward impulse |
| Diamond | Bullish continuation diamond | Bearish continuation diamond | Five highs/lows; boundaries expand to the middle then contract; middle width over 1.5 times each end |
| Wedge | Bullish continuation wedge | Bearish continuation wedge | Two falling boundaries after an upward impulse; upper falls faster |
| Triangle | Bullish continuation triangle | Bearish continuation triangle | Approximately flat upper boundary and rising lower boundary after an upward impulse |

Pivots require a strict high or low against two candles on each side, and are observable only after the two right-side candles close. An outside candle that is both a high and low is ambiguous and creates no pivot. Consecutive same-side pivots retain the more extreme value. Geometry uses the most recent alternating pivots. Non-rounding shapes span 8–180 candles; the prior trend is measured 12 candles before the shape starts. Reversal families require the preceding close above the first point by 35% of shape range; continuation families require it below by 60%.

For channel families, least-squares boundaries must fit each pivot within 12% of total range. Slopes below are normalized by shape duration / range. Flag upper/lower slopes are both below -0.12 and differ by less than 0.18; end/start width is between 0.75 and 1.25. Symmetrical triangle slopes are below -0.12 and above +0.12. Wedge slopes are below -0.20 and -0.04 with a difference above 0.12. Triangle upper magnitude is below 0.08 and lower is above +0.20. Converging widths must fall below 80% of starting width but remain positive.

A signal requires a closed candle crossing the neckline/upper boundary by 2% of shape range (reflected for bearish patterns). The preceding close must be on or below that buffered boundary. Confirmation must be within 20 candles of the last shape point. The same definition cannot produce overlapping signals. Missing periods, invalid OHLC and open/unknown candles break the detection segment. Scanning never fills gaps. Calendar continuity uses the selected source period's timestamp alignment.

These are independent, explicit heuristics, not a reproduction of Futu's undisclosed algorithm. Pattern interpretation and the twenty-family scope are informed by [Futu's help page](https://support.futunn.com/hant/topic521). Visual matching is not a validated prediction model. Unit fixtures demonstrate rule behavior; they do not measure accuracy on markets.

## Historical outcomes

The horizon is three closed candles at the selected bar size, measured against the confirmation close. Daily means three daily candles; hourly means three hourly candles. Rise, fall and unchanged are separate outcomes. The feature calculates observed historical frequencies, not a calibrated future probability or a shape match score.

For each selected signal, use only earlier occurrences of the exact same definition from the same chart's symbol and bar size. Their outcomes must have completed strictly before the selected confirmation candle. Entire shape/outcome windows must not overlap. All outcome candles must be valid, closed and consecutive. Display percentages only at 30 or more eligible samples; otherwise show "Insufficient data". Display sample count, sample date range and the actual bounded loaded-history window. Loading more history may change the estimate; future candles do not change statistics for an older selected signal.

Support and resistance are the minimum and maximum prices among shape points, with percentage distances from the confirmation close. These are structural levels, not forecasts of future extremes. No separate reversal probability is invented.

## Drawing ownership and limitations

Automatic shapes are a separate SVG/DOM layer, positioned through klinecharts' coordinate conversion. They follow scrolling, zoom and pane/container resize, and their markers are keyboard accessible. They never enter the engine's manual overlays, Pro's drawing manager or adabet's persisted drawing configuration. Native engine-only image exports do not include the DOM shape layer; add explicit composite capture if that becomes a requirement.

Recognition yields between chunks of 256 candles and cancels obsolete scans so history loads do not monopolize the UI thread.

Only loaded data is scanned: no market-wide screener, background full-history download or shared multi-instrument statistical model is included. Unknown/open candles are excluded conservatively. Large datasets are bounded to 5,000 candles; only the latest 40 signals are rendered/listed. The library feature is opt-in; adabet enables it on both chart variants. Its show/hide preference is local to the mounted chart.

## Verification

- Unit tests cover all twenty shapes, pre-breakout/open-candle rejection, missing trend, invalid observations, future-data isolation, missing periods, finality-only revisions and historical sample eligibility/thresholds.
- Deterministic synthetic Storybook examples for both wrappers exercise marker selection, finality changes, Escape/focus restoration, show/hide, bar-size changes, Chinese/dark presentation and megaphone direction/symbol changes.
- Synthetic examples are labeled; they are not market observations or success-rate evidence.
