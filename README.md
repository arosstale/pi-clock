# pi-clock ⏰

Beautiful terminal clock, timer, stopwatch, and pomodoro for [pi](https://github.com/nicobailon/pi-mono).

## Install

```bash
npm install -g pi-clock
```

## Commands

| Command | Description |
|---------|-------------|
| `/clock` | Big beautiful clock with day progress |
| `/timer 5m` | Countdown timer (5m, 90s, 2:30, 1h) |
| `/stopwatch` | Stopwatch with lap times |
| `/pomodoro` | 25/5 focus/break cycles |

## Controls

| Key | Action |
|-----|--------|
| T | Cycle color theme (Cyan, Amber, Green, Rose, Purple, White) |
| SPACE / P | Pause/resume |
| L | Lap (stopwatch) |
| S | Skip to break/work (pomodoro) |
| R | Reset |
| Q / ESC | Quit |

## Features

- **Big digit display** — 3×5 block character font
- **6 color themes** — Cyan, Amber, Green, Rose, Purple, White
- **Progress bars** — second + day progress (clock), countdown (timer), cycle dots (pomodoro)
- **Flexible duration parsing** — `5m`, `90s`, `1h`, `2:30`, `1:30:00`
- **Auto-cycle pomodoro** — switches between focus and break automatically

## License

MIT
