# Sound of Market — proof of concept

A single-page site that plays one piece of music. Live market data changes the arrangement. The piece keeps its identity: the same motifs, tempo, and ensemble, heard in different variations, voicings, and sections.

The market is an input to a musical system. Prices are not mapped onto loudness or pitch.

## Decisions so far

- **Run it locally first.** The musical proof happens on this machine. The public home, later, is OriginalDatum.com.
- **The piece is in D major at 80 BPM.** Loops share that grid.
- **Four parts exist today:** cello (stocks), guitar (bonds), bass (gold), and percussion (volatility). They are 12-second loops. Directional variations come next.
- **The music answers direction, not relationships.** Stocks, bonds, and gold each answer: rising, falling, or resting. Volatility answers: spike or calm. The stock–bond correlation harmony rule is parked; it can return later if we want a second layer.
- **The speed of musical change is something we listen for.** The local app plays the same scenario at several speeds so we can hear what stays musical and what still tells you what the market did.
- **One chart plays along.** SPY, TLT, gold, and VIX share a time axis and keep separate y-axes. A playhead marks the moment you are hearing. Lines that are changing the arrangement go bold; the others sit at half opacity.
- **Each directional signal is a current value against a rolling window.** The page toggles the window and the kind of average. Rising and falling use the same gap with opposite bands.

## What the music is asking

| Question | Series | Part | Musical consequence |
| --- | --- | --- | --- |
| Are stocks rising? | SPY | Cello | Rising variation of the cello motif |
| Are stocks falling? | SPY | Cello | Falling variation of the cello motif |
| Are bonds rising? | TLT | Guitar | Rising variation of the guitar figure |
| Are bonds falling? | TLT | Guitar | Falling variation of the guitar figure |
| Is gold rising? | GLD | Bass | Rising variation of the bass figure |
| Is gold falling? | GLD | Bass | Falling variation of the bass figure |
| Is volatility spiking? | VIX | Percussion | Storm figure enters and holds as a section |

Resting means the home take for that part. A part is only ever in one of three states: home, rising, or falling. Volatility is separate: out, in, or resolving.

Magnitude still only opens the door. Once cello is in its rising variation, a bigger gap does not make it louder or busier. The music holds the idea until the gap falls back through the exit band.

## What the first version has to prove

1. The song can change and still be the same song.
2. Each of stocks, bonds, and gold can be heard as rising, falling, or home, once those stems exist.
3. A volatility spike can start a section, hold it, and later resolve it, without retriggering while the condition persists.
4. Those musical decisions can be changed without rewriting the market math, and the market math can be changed without rewriting the player.
5. We can hear, on the parts we have, which response speed is still listenable and still informative.
6. One chart shows the same moment the music is playing, with the driving lines emphasized.

## What stays out of the first version

- A price-to-pitch sonification, or any rule that makes the music louder because a price moved more.
- Binding the arrangement to every quote. A change lands on a phrase boundary, after a condition has persisted. How long that phrase is, and how long "persisted" means, is the listening test below.
- More than one piece, a score editor, user accounts, or a historical playback timeline.
- Generative synthesis. Every note comes from stems rendered ahead of time. The engine chooses, layers, and crossfades them.
- A downtrend variation, a second bass figure, and a second cello figure. Those are the first additions after the core is audible.
- Deploying to OriginalDatum.com. The app should be easy to move there. Doing that move is a later step.

## Three layers

```
market quotes
    →  market analysis     snapshots become a small set of named conditions
    →  compositional logic  conditions become a musical state, held until a phrase ends
    →  audio engine         the state chooses stems and crossfades them on the phrase
```

Each layer talks to the next through a plain data object. The audio engine never sees a price. The market layer never sees a stem.

### 1. Market analysis

Each price series is reduced to a current value compared with a rolling value. The page has a toggle for how that comparison is made. The named conditions below are what the music is allowed to hear.

| Condition | Meaning | Comparison |
| --- | --- | --- |
| `stockTrend` | `resting`, `rising`, or `falling` | SPY last vs its rolling average |
| `bondTrend` | `resting`, `rising`, or `falling` | TLT last vs its rolling average |
| `goldTrend` | `resting`, `rising`, or `falling` | GLD last vs its rolling average |
| `volatility` | `calm` or `elevated` | VIX last vs its rolling average, or vs its upper Bollinger band |

The stock–bond correlation (`relationship`) stays available as a chart readout if we want it later. It no longer drives the arrangement.

Output of this layer is a `SignalFrame`: the conditions, the time they last changed, and for each series the last value, the rolling value, and the gap. No musical words live in this layer.

| Role | Symbol | Why this one |
| --- | --- | --- |
| Stocks | SPY | Broad equity trend |
| Bonds | TLT | Long Treasuries, the other leg of the harmony |
| Gold | GLD | Gold, via the SPDR Gold Shares ETF |
| Volatility | VIX | The volatility index itself |

### Where the numbers come from

Use Twelve Data. Its indicator endpoints already compute the rolling values, and the window is a request parameter, which is what the toggles need.

| Need | Endpoint | Who computes it |
| --- | --- | --- |
| Live last, and the previous close | `/quote` | The vendor |
| Simple moving average | `/sma?interval=1day&time_period={window}` | The vendor |
| Exponential moving average | `/ema?interval=1day&time_period={window}` | The vendor |
| Bollinger bands, for VIX | `/bbands?interval=1day&time_period={window}&sd=2` | The vendor. Returns the upper band, the lower band, and the middle average |
| Daily closes, for the chart and for correlation | `/time_series?interval=1day` | The vendor returns closes. We only compute the correlation |

Ask for the latest indicator point (`outputsize=1`). A daily average does not need to be rebuilt every poll. Cache each result under symbol, type, and window, and refresh it when the toggle changes or the session date changes.

The free plan allows 800 credits a day and 8 a minute. Four quotes every minute would spend the day. Poll the four lasts every 5 minutes. Fetch a rolling value only when that toggle is selected and the cache is cold. The listening-test scenario does not use the API, so comparing presets stays free of that budget.

Alpha Vantage publishes the same SMA, EMA, and Bollinger endpoints. Its free key allows 25 requests a day, which is too few once four symbols and several windows are in play. It stays a fallback only if Twelve Data rejects a symbol.

Two things stay local, because they are the musical comparison rather than a published indicator:

- The percent gap, `(last − rolling) / rolling`, and the enter/exit bands around it.
- Pearson correlation of SPY and TLT daily returns. Neither vendor offers a two-symbol rolling correlation you can retune from a toggle. Given closes `c`, the daily return is `c[t] / c[t−1] − 1`. The correlation over `n` sessions is the Pearson correlation of the two return lists. Fetch about 120 daily closes once per session so a 90-day window has room.

If the vendor rejects the VIX symbol on an indicator call, take VIX from the daily time series and average those closes locally for that one series. Confirm the vendor's VIX symbol when the key is added. If VIX is missing entirely, use the realized range of SPY over the selected window and keep the same `calm | elevated` output.

### Current versus rolling

The gap for a price or for VIX is:

```
gap = (last − rolling) / rolling
```

`last` is the live quote. `rolling` is the latest daily SMA or EMA for the window selected on that row. For a Bollinger comparison, there is no percent gap: elevated means `last` is above the upper band the API returned, and calm means `last` has fallen back through the middle band.

Entering a condition and leaving it use different cuts, so a value sitting on the line does not flicker. The hold time from the listening-test preset still applies on top of these bands.

| Series | Default reference | Default window | Enters | Leaves | Why this default |
| --- | --- | --- | --- | --- | --- |
| SPY | SMA | 30 sessions | gap ≥ +1.0% | gap < +0.25% | About six weeks. One percent above that average is a trend worth a variation. A single green day is not. The violin returns as the trend weakens, before the average itself breaks. |
| GLD | SMA | 50 sessions | gap ≥ +1.0% | gap < +0.25% | Gold's part is the ground. A longer average moves the bass more slowly than the violin. The arrangement does not use this until a bass variation exists. |
| TLT | SMA | 30 sessions | gap ≥ +1.0% | gap < +0.25% | Same window as equities, so the chart's two legs of the harmony are comparable. The cello variation is later. The correlation below is the signal that changes harmony. |
| VIX | SMA | 20 sessions | gap ≥ +15% | gap < +5% | Volatility's normal range has a shorter memory than a price trend. VIX also moves in larger percentages, so the band is wider than the price bands. |

The window toggle, on every series, is **5, 10, 20, 30, 50, 200** sessions. The reference toggle is **Session, SMA, EMA**. Session ignores the window and compares the live last with `previous_close` from the quote. Its starting bands are the old day-scale cuts: enter at +0.35%, leave below +0.15% for SPY, TLT, and GLD. For VIX in session mode, enter when the last is at least 10% above the previous close, and leave below 3%. Session mode is the reactive end of the listening test.

VIX has one more reference: **Bollinger**. The window toggle then offers **10, 20, 30**. The API returns the bands. Elevated is above the upper band. Calm is back through the middle band.

EMA uses the same windows and the same bands as SMA. It weights recent sessions more, so the same trend will move the music sooner. That is the comparison the toggle is for.

### Stocks and bonds, as a relationship

Harmony listens to the relationship, not to either average alone.

Daily returns come from the cached closes. Two correlations are computed locally:

- `ρ_long`, default **60** sessions. This is the familiar regime.
- `ρ_short`, default **10** sessions. This is the current relationship.

The relationship is `shifted` when the two correlations have opposite signs and both are at least 0.20 away from zero. It returns to `familiar` when that stops being true. A short correlation near zero is a quiet relationship, not a new chord.

The long-window toggle is **30, 60, 90**. The short-window toggle is **5, 10, 20**.

A second mode, **Session vs long**, compares the sign of today's SPY return and today's TLT return with the sign of `ρ_long`. It shifts only when those signs disagree and both session returns have left a ±0.15% dead zone. This mode is twitchier. It exists so the listening test can hear a one-day disagreement against a slow correlation change. The default mode is short versus long.

Gold is not part of this pair.

While the session is closed, keep publishing the last frame and mark it `session: closed`. The music holds. It does not drift overnight.

### 2. Compositional logic

This layer is a pure function plus a little memory:

```
SignalFrame + current MusicalState + phrase clock + response preset
    → MusicalState to play now
    → MusicalState queued for the next phrase boundary
```

`MusicalState` for the proof of concept:

| Field | Values | What you hear |
| --- | --- | --- |
| `cello` | `home`, `rising`, or `falling` | Stock theme, rising variation, or falling variation |
| `guitar` | `home`, `rising`, or `falling` | Bond theme, rising variation, or falling variation |
| `bass` | `home`, `rising`, or `falling` | Gold theme, rising variation, or falling variation |
| `percussion` | `out`, `in`, or `resolving` | Storm absent, held as a section, or one exit phrase |

With the four parts we have, every melodic field stays `home`. The readout still shows rising and falling when the math fires. Only `percussion` is audible as an arrangement change until the directional stems arrive.

Rules:

- `stockTrend` maps to `cello`. `bondTrend` maps to `guitar`. `goldTrend` maps to `bass`.
- `volatility: elevated` queues `percussion: in`. It stays `in` while elevated. It does not restart. When calm returns, the next phrase is `resolving` if that stem exists, otherwise percussion leaves at the phrase boundary.
- A new signal updates the queue only after the active preset's persistence window. The speakers change only at the next phrase boundary. If two signals qualify inside one phrase, both land together.
- Minimum dwell: after a field changes, ignore a reversal of that same field for one full phrase, so rising cannot flip to falling inside a single phrase without a beat of rest.

Rising and falling are artistic opposites of the same motif, not louder/softer copies. The listener should recognize the part.

### 3. Audio engine

Web Audio, one clock, stems scheduled against it.

- The piece is **D major** at **80 BPM**, **4/4**.
- The default phrase is **8 bars**, which is 24 seconds. At 48 kHz that loop is exactly 1,152,000 samples, so an 8-bar file can be sample-aligned. The listening test also runs phrases of 4 bars (12 seconds) and 16 bars (48 seconds). Every stem is rendered as a loop on the 4-bar grid so the longer phrases are repeats of the same file.
- Every stem shares that grid: same start, no pickup before beat 1.
- Cello, violin, and bass loop for the whole piece. They are the song. Percussion is mixed in only while its state is `in` or `resolving`.
- A queued state is applied on the upcoming phrase downbeat. Overlapping material crossfades across one bar (3 seconds at 80 BPM), equal-power. Percussion may enter on the downbeat with a short fade and leaves by finishing the phrase.
- Gains are written by hand per stem so a later variation can be busier without being louder. No gain is bound to a price.
- The proof of concept does not pitch-shift to fake a new harmony. Harmony means a different stem, rendered in that harmony, added when you have it.

The engine accepts a `MusicalState` and returns playback status. A hand-built state and a live state use the same path.

## Listening test: how fast is still music

This is the first experiment, and it happens before any response speed is treated as final.

Two things are easy to confuse. **Looking** at the market happens about every five minutes on the live feed, because that is what the free quote budget supports. **Changing the song** happens on a phrase, and only after a condition has lasted long enough to be worth a musical event. The test varies the second one. The scripted session can step faster than the live poll, so the presets can be compared in one sitting.

Three presets ship in the local page. The bands in the market layer stay put. Only phrase length and persistence change.

| Preset | Phrase | Persistence before a change can queue | What we expect to learn |
| --- | --- | --- | --- |
| Reactive | 4 bars, 12s | First poll that crosses the band | Where "informative" starts to stop sounding like a piece |
| Balanced | 8 bars, 24s | About 2 minutes | The starting point we listen against |
| Patient | 16 bars, 48s | About 10 minutes | Where the music stays calm and the news arrives late |

A fourth pass, **Session**, collapses the script to one mood for the whole scenario. It is the slow end of the same question.

We do not wait through a real trading day to compare these. A scripted session drives the same `SignalFrame` path the live feed will use, compressed onto the phrase clock:

1. A quiet open. Everything resting.
2. A short volatility poke that dies. Reactive should answer it. Patient should let it go.
3. A rise in equities that lasts. The violin field should queue `elaborate` while that is still the story.
4. Volatility that stays high. Percussion enters once and keeps looping. It must not retrigger.
5. The rise fades and volatility cools. Percussion leaves on a phrase boundary. The violin field returns to `theme`.

Listen to that script under each preset, with the four parts actually playing. Write down, in a few lines at the bottom of this file:

- Which presets still sound like one piece.
- Which presets make the poke, the lasting storm, and the trend distinguishable.
- Which preset we keep as the default.

Judging it takes two ears. Someone who knows the mapping should be able to tell the conditions apart. Someone who does not should still hear music. The chart is there so you can see the moment you are hearing. A preset that is only intelligible by staring at the lines has not passed the listening half.

Until the elaborate violin and the shifted voicing exist, judge the trend and the relationship on the readout's timing, and judge listenability on the percussion entrance against the cello, violin, and bass. If muting percussion punches a hole in the song, then this percussion part is bed, not a storm figure. In that case it stays in, the volatility event waits for another percussion stem, and we still keep the timing notes from the readout.

## Stems

### What we have now

Four loops, D major, 80 BPM. Drop them in `public/stems/` under these names:

| File | Role while it is the only take |
| --- | --- |
| `cello.wav` | Stocks. The theme. Always playing, until an elaborate take exists. |
| `guitar.wav` | Bonds. Harmonic bed. Always playing. |
| `bass.wav` | Gold. Grounded bed. Always playing. |
| `percussion.wav` | Volatility. The part the listening test brings in and out. |

WAV, 48 kHz. Trimmed to a shared downbeat, with no tail past the loop point. A 4-bar loop is 12 seconds and 576,000 samples. An 8-bar loop is 24 seconds and 1,152,000 samples. Either length works. Mixed lengths do not.

These files are not in the repo yet. The player starts once they are in `public/stems/`.

### What we add when the first test has a winner

Same tempo, key, and grid. The shifted version is the same piece in a voicing you choose. The listener should recognize the motif.

| File | Contents |
| --- | --- |
| `cello_rising.wav` | Stocks rising |
| `cello_falling.wav` | Stocks falling |
| `guitar_rising.wav` | Bonds rising |
| `guitar_falling.wav` | Bonds falling |
| `bass_rising.wav` | Gold rising |
| `bass_falling.wav` | Gold falling |
| `perc_resolve.wav` | One phrase that plays once on the way out of a volatility spike |

Also on disk, not mapped yet: `cello_quiet.wav`, `cello_solo.wav`, `guitar_quiet.wav`, `guitar_superquiet.wav`. Say when those should enter and they can be wired.

`cello.wav`, `guitar.wav`, and `bass.wav` remain the home takes. When a directional file is missing, that part stays on home and the readout still shows the queued direction.

Bounce parts from the same session and trim them to the same sample length. Separately generated files almost never share a downbeat.

## The chart

One line chart on the page, beside the piece. It shows the values the music is responding to, on the same clock as the audio.

Four lines, each with its own y-axis. The levels are not comparable: a stock price, a bond price, a gold price, and a volatility index would flatten each other on a shared scale. Independent axes keep every line readable and keep the units honest.

| Line | Reading | Axis | Color tied to |
| --- | --- | --- | --- |
| SPY | last price | its own, left | Cello |
| TLT | last price | its own, left, offset | Guitar |
| GLD | last price, labeled Gold | its own, right | Bass |
| VIX | last level | its own, right, offset | Percussion |

The x-axis is trading days, long enough to show the selected window. A one-day intraday chart would hide a 30-day average. Today's point is the live last and updates on each poll. Each series also draws its rolling value as a dashed line on that same y-axis, so the toggle and the picture stay tied together. Switching from a 30-day SMA to a 200-day SMA replaces that dashed line. Bollinger mode draws the upper band instead of the average.

A playhead marks the moment currently sounding. In the scripted session the whole path is drawn, and the playhead walks it as the music plays, so a spike and the percussion entrance can be seen as two different times. In live mode the playhead sits on today.

When the arrangement actually changes, a thin marker is drawn at that time and labeled in musical language ("percussion enters", and later "violin elaborates", "harmony shifts"). The gap between a line moving and that marker is the preset, made visible. That gap is what the listening test is choosing.

The chart reads a `ReadingPoint` history (`time`, `spy`, `tlt`, `gld`, `vix`) appended by the same poll or the same script that feeds the analyzer. It does not fetch quotes itself. The scripted session has to carry numeric paths, not only the named conditions, or the chart has nothing to draw during the test.

Axes are labeled with the symbol and the unit. The legend uses the instrument name as well as the symbol, so the line and the part are one idea. Gridlines stay light. There is one chart, not a panel per symbol.

## The page

One local screen.

- Play and stop. Playback starts on a user gesture, because browsers require that for audio.
- The chart, with the playhead locked to playback and a dashed rolling line for each series.
- The current musical state in musical language.
- The response preset: Reactive, Balanced, Patient, Session.
- Signal toggles, one row per series (SPY, TLT, GLD, VIX): reference (Session, SMA, EMA, and Bollinger on VIX) and window (5, 10, 20, 30, 50, 200). Each row shows last, rolling value, and gap. Changing a toggle refetches that rolling value if it is not cached, then recomputes the condition. The piece does not restart.
- Relationship toggles: mode (short vs long correlation, or session vs long), short window (5, 10, 20), long window (30, 60, 90), and the two correlation numbers.
- Play scenario, so the scripted session can be heard, and seen, without a live market. The scenario includes a rolling value on each point so the dashed lines exist without the API.
- A small readout: each condition, whether a change is waiting on persistence, and whether it is waiting on the next phrase. Violin, gold, and harmony show here even while those variation stems are missing.
- Demo toggles for `rising`, `shifted`, and `elevated`, writing a `SignalFrame` through the same function as the live feed.
- Session status once the live feed exists: live, or holding because the session is closed.

## Where it runs

**Now:** this repo, on localhost. `npm run dev`. Stems load from `public/stems/`. The quote proxy, when we add it, runs beside the page so the API key stays off the client.

**Later:** OriginalDatum.com. The page should stay a self-contained front end with a small quote endpoint, so it can be mounted on that site without rewriting the musical layers. We look at how OriginalDatum.com is served when we do that move. Nothing in the market, composition, or audio code should mention the host.

## Shape of the code

A small TypeScript app. Vite and React for the page. One local server function proxies the market feed when we reach that step.

```
src/
  market/
    types.ts          SignalFrame
    fetchQuotes.ts    quotes and daily closes
    indicators.ts     SMA, EMA, and Bollinger from the vendor, cached by symbol, type, and window
    correlation.ts    the SPY–TLT correlation, the statistic the vendor does not serve
    analyze.ts        gap, bands, and persistence → conditions
    history.ts        ReadingPoint buffer shared by the chart and the analyzer
  composition/
    types.ts          MusicalState
    arrange.ts        SignalFrame → queued MusicalState
    rules.ts          the artistic mapping, and only that
    presets.ts        Reactive, Balanced, Patient, Session
  audio/
    loadStems.ts      missing files are skipped, not fatal
    engine.ts         clock, phrase boundary, crossfades
  ui/
    App.tsx           play, preset, signal toggles, scenario, chart
    Chart.tsx         one time-series chart, one y-axis per line, playhead
  mock/
    scenarios.ts      the scripted session, including price paths
server/
  quotes.ts           thin proxy, added with the live feed
public/stems/         cello.wav, guitar.wav, bass.wav, percussion.wav
```

`arrange.ts` is pure. Scripted frames check it: a poke shorter than the preset's persistence never queues percussion; a lasting storm queues it once; a rising trend queues the elaborate violin at a time we can read off the scenario, whether or not that file exists yet.

## Build order

1. **Player, four parts, no market.** Loop cello, violin, and bass in sync. Bring percussion in and out from a button, on a phrase boundary. Success: the downbeat does not drift, and a switch does not cut a note in half.
2. **The listening test and the chart.** Wire the four presets, the scripted price paths, and the chart. The playhead moves with the music, and arrangement changes leave markers. Listen, watch the gap between the line and the marker, and record the default we keep.
3. **Market proxy, vendor indicators, and toggles.** Quotes, SMA, EMA, and Bollinger come from Twelve Data. Correlation is computed from the daily closes. The signal toggles switch window and reference. Success: changing a window changes the dashed line and the condition, and a value sitting on the band does not flicker.
4. **Connect the live feed** to the same arranger and the same chart the scenario already uses.
5. **More stems.** Shifted harmony and the elaborate violin, after the timing is a choice we have heard.

## How we know it is done

- The four parts loop together in D major at 80 BPM, locally.
- The same scripted session has been heard under each preset, with the chart's playhead on the sounding moment, and this file says which preset we kept.
- Percussion, when it is used as the volatility event, enters once, holds, and leaves on a phrase. A short poke does not flicker it under the preset we kept.
- Pointing the arranger at live quotes uses the same code as the scenario.
- Adding `violin_elaborate.wav` later makes an already-queued change audible, without a new musical rule.

## Assumptions

- The four parts map to cello (stocks), guitar (bonds), bass (gold), and percussion (volatility).
- US cash equities session for the live feed. Outside it, the last arrangement holds.
- Twelve Data's free tier is enough if quotes are polled about every 5 minutes and rolling values are cached. The musical clock stays finer than that poll through the scenario.
- You trim stems onto a shared grid before they go in `public/stems/`.
- A bass variation that follows gold waits until the listening test has a default preset.
- OriginalDatum.com is the later host. The local app does not depend on how that site is built.

## Listening notes

Fill this in after step 2. One or two lines per preset is enough.

| Preset | Still a piece? | Could you tell the events apart? | Keep? |
| --- | --- | --- | --- |
| Reactive | | | |
| Balanced | | | |
| Patient | | | |
| Session | | | |

Default preset:
