/**
 * channels.ts — tedeyTV hardcoded channel list
 *
 * Fields:
 *   type    – explicit engine override ('hls' | 'dash' | 'mpegts').
 *             Omit to let streamDetector auto-detect.
 *   headers – per-channel request headers injected by the main-process
 *             session hook (see main/index.ts setupSessionHooks).
 *             Use 'X-UA' to override User-Agent, 'Referer' for Referer.
 *
 * DO NOT change any URLs.
 */
import { Channel } from '../types'

export const channels: Channel[] = [
  // ── DASH streams ──────────────────────────────────────────────────────────
  {
    id: 'ch-1',
    name: 'Kantipur max HD',
    logo: 'https://i.imgur.com/EZUyzhG.jpg',
    url: 'http://202.79.40.247/iptvlivestream/netKANTIPURCINEPLEX1500.stream/chunks.m3u8',
    category: 'Sports',
    isHD: true,
    type: 'dash'
  },
  
  {
    id: 'ch-3',
    name: 'Kantipur max-2 HD',
    logo: 'https://i.ibb.co/ShK58p6/Kantipur-Max-2-HD.jpg',
    url: 'http://202.79.40.235/iptvlivestream/KTVMax2HD.stream/chunks.m3u8',
    category: 'Sports',
    isHD: true,
    type: 'dash'
  },

  // ── HLS streams (raw-IP servers; VLC-style UA set globally) ───────────────
  {
    id: 'Himalaya Sports HD',
    name: 'Himalaya Sports HD',
    logo: 'https://i.ibb.co/MD6ycv7h/Himalayan-Sports-HD.jpg',
    url: 'http://202.79.40.235/iptvlivestream/hpremiumPAID/chunks.m3u8',
    category: 'Sports',
    isHD: true,
    type: 'hls'
  },
  {
    id: 'unite8 sports1 HD',
    name: 'united8 sports1 HD',
    logo: 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_SYMANDFLIX/images/LOGO_HD/LOGO_HD_BvXTgRk6Y_UNITE8-SPORTS-2_264X144.webp',
    url: 'http://202.79.40.247/iptvlivestream/BeinSports2/chunks.m3u8',
    category: 'Sports',
    isHD: true,
    type: 'hls'
  },
  {
    id: 'one sports HD',
    name: 'One sports HD',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/1/1f/ONE_Championship.png',
    url: 'http://202.79.40.235/iptvlivestream/BeinSports1/chunks.m3u8',
    category: 'Sports',
    isHD: true,
    type: 'hls'
  },

  // ── HTTPS HLS (needs Referer to avoid 403 from the CDN) ──────────────────
  {
    id: 'kantipur-tv-hd',
    name: 'Kantipur TV (1080p)',
    logo: 'https://i.imgur.com/HEVo2Gc.png',
    url: 'https://ktvhdsg.ekantipur.com:8443/high_quality_85840165/hd/playlist.m3u8',
    category: 'News',
    isHD: true,
    type: 'hls',
    referer: 'https://www.ekantipur.com/'
  },
  {
    id: 'ch-111',
    name: 'Kantipur max HD',
    logo: 'https://i.imgur.com/EZUyzhG.jpg',
    url: 'http://103.154.47.133/media/test11.mpd',
    category: 'Sports',
    isHD: true,
    type: 'dash'
  },
  {
    id: 'ch-222',
    name: 'Kantipur max-2 HD',
    logo: 'https://i.ibb.co/ShK58p6/Kantipur-Max-2-HD.jpg',
    url: 'http://103.154.47.137/media/test60.mpd',
    category: 'Sports',
    isHD: true,
    type: 'dash'
  },
]
