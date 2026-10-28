// ─── Channel ────────────────────────────────────────────────────────────────
export type Channel = {
  id: string
  name: string
  logo: string       // image URL or empty string
  url: string        // HLS m3u8 / DASH mpd / MPEG-TS / MP4 / RTSP
  category: string
  group?: string
  isHD?: boolean
  language?: string
  epgId?: string       // tvg-id from M3U
  userAgent?: string   // per-stream UA override (sent via X-Custom-UA)
  referer?: string     // per-stream Referer override (sent via X-Custom-Referer)
  /** Explicit engine override — skips auto-detection */
  type?: 'hls' | 'dash' | 'mpegts'
  /** Extra request headers injected by the main-process session hook */
  headers?: Record<string, string>
}

// ─── Stream type detection ───────────────────────────────────────────────────
export type StreamType = 'hls' | 'dash' | 'ts' | 'mp4' | 'webm' | 'rtsp' | 'unknown'

// ─── Player ──────────────────────────────────────────────────────────────────
export type AspectMode = 'contain' | 'fill' | '16/9' | '4/3' | 'none'

export type AudioTrack = {
  id: number
  name: string
  lang?: string
  default?: boolean
}

export type SubtitleTrack = {
  id: number
  name: string
  lang?: string
}

export type PlaybackStatus =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'buffering'
  | 'reconnecting'
  | 'error'

export type PlayerError = {
  code: 'network' | 'codec' | 'geo' | 'timeout' | 'offline' | 'unknown'
  message: string
}

export type PlayerSettings = {
  volume: number        // 0–150
  muted: boolean
  aspectMode: AspectMode
  lastChannelId: string | null
}

// ─── M3U parsing ─────────────────────────────────────────────────────────────
export type M3UEntry = {
  id: string
  name: string
  logo: string
  group: string
  language: string
  epgId: string
  userAgent: string
  referer: string
  url: string
}
