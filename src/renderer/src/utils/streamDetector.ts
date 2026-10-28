import { StreamType } from '../types'

export function detectStreamType(url: string, contentType?: string): StreamType {
  const u = url.toLowerCase().split('?')[0]
  const ct = (contentType || '').toLowerCase()

  if (u.endsWith('.mpd') || ct.includes('dash+xml') || ct.includes('mpd')) return 'dash'
  if (
    u.endsWith('.m3u8') ||
    u.endsWith('.m3u') ||
    u.includes('/playlist') ||
    u.includes('/chunks') ||
    ct.includes('mpegurl') ||
    ct.includes('x-mpegurl')
  )
    return 'hls'
  if (
    u.endsWith('.ts') ||
    u.endsWith('.flv') ||
    u.endsWith('.mpeg') ||
    ct.includes('mpegts') ||
    ct.includes('mp2t') ||
    ct.includes('flv')
  )
    return 'ts'
  if (
    u.endsWith('.mp4') ||
    u.endsWith('.m4v') ||
    u.endsWith('.mkv') ||
    ct.includes('mp4') ||
    ct.includes('x-matroska')
  )
    return 'mp4'
  if (u.endsWith('.webm') || ct.includes('webm')) return 'webm'
  if (u.startsWith('rtsp://') || u.startsWith('rtmp://')) return 'rtsp'

  // Ports commonly used by IPTV streamers (e.g. :8000/play/…)
  if (/:\d{4,5}\//.test(url)) return 'hls'

  return 'unknown'
}

