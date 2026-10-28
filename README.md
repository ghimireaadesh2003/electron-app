# tedeyTV Desktop (Electron)

Live TV desktop app for macOS & Windows — built with **electron-vite + React 18 + Tailwind CSS**.

## Tech Stack

| Layer | Library |
|---|---|
| Desktop shell | [Electron 35](https://www.electronjs.org/) |
| Build tool | [electron-vite 3](https://electron-vite.org/) — Vite-powered HMR for Electron |
| UI | React 18 + TypeScript |
| Styling | Tailwind CSS 3 |
| State | Zustand 4 (persisted to `localStorage`) |
| HLS streaming | [hls.js](https://github.com/video-dev/hls.js/) (dynamic import) |
| DASH streaming | Native Chromium (built into Electron) |
| Packaging | [electron-builder](https://www.electron.build/) |

## Project Structure

```
livetv-electron/
├── src/
│   ├── main/          # Electron main process (Node.js)
│   │   └── index.ts
│   ├── preload/       # Preload bridge (contextBridge)
│   │   └── index.ts
│   └── renderer/      # React app (browser context)
│       ├── index.html
│       └── src/
│           ├── App.tsx
│           ├── main.tsx
│           ├── assets/index.css
│           ├── components/
│           │   ├── Navbar.tsx
│           │   ├── CategoryTabs.tsx
│           │   ├── ChannelCard.tsx
│           │   ├── ContinueWatching.tsx
│           │   └── VideoPlayer.tsx
│           ├── data/channels.ts
│           ├── store/useLiveTVStore.ts
│           └── types/index.ts
├── resources/          # App icons (icon.icns / icon.ico)
├── electron.vite.config.ts
├── tailwind.config.js
└── package.json
```

## Setup & Development

```bash
cd livetv-electron

# Install dependencies
npm install

# Run in dev mode (hot reload)
npm run dev
```

## Build for Distribution

```bash
# Build for macOS (creates .dmg in dist/)
npm run pack:mac

# Build for Windows (creates .exe installer in dist/)
npm run pack:win

# Build for both platforms at once
npm run pack:all
```

> **Note:** Cross-compiling Windows from macOS requires Wine or a CI runner.
> For pure macOS builds, `npm run pack:mac` works natively.

## App Icons

Place your icon files in `resources/`:
- `resources/icon.icns` — macOS icon
- `resources/icon.ico` — Windows icon

You can convert a PNG using online tools or `iconutil` on macOS.

## Key Features

- 📺 HLS & DASH live stream playback via hls.js + native Chromium
- ❤️ Favorite channels (persisted)
- 🕘 Continue Watching section
- 🔍 Real-time channel search
- 🗂️ Category filtering tabs
- ⌨️ Keyboard shortcuts: `Esc` to close player, `F` to toggle fullscreen
- 🍎 macOS traffic-light titlebar support (`hiddenInset`)
- 🪟 Windows installer via NSIS

