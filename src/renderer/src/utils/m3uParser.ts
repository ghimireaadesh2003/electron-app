import { Channel, M3UEntry } from '../types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function attr(line: string, key: string): string {
  // Handles:  key="value"  and  key=value (no quotes)
  const dq = line.match(new RegExp(`${key}="([^"]*)"`, 'i'))
  if (dq) return dq[1].trim()
  const sq = line.match(new RegExp(`${key}='([^']*)'`, 'i'))
  if (sq) return sq[1].trim()
  const nq = line.match(new RegExp(`${key}=([^\\s,]+)`, 'i'))
  if (nq) return nq[1].trim()
  return ''
}

function slug(name: string, index: number): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `ch-${index}`
  )
}

// ─── Core parser ─────────────────────────────────────────────────────────────

export function parseM3U(text: string): M3UEntry[] {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')

  const entries: M3UEntry[] = []
  let pending: Partial<M3UEntry> | null = null
  let counter = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    if (line.startsWith('#EXTINF')) {
      // Parse #EXTINF:-1 tvg-id="..." tvg-name="..." ...  ,Channel Name
      const commaIdx = line.lastIndexOf(',')
      const metaPart = commaIdx >= 0 ? line.slice(0, commaIdx) : line
      const displayName = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : ''

      const tvgName = attr(metaPart, 'tvg-name') || displayName
      const tvgId = attr(metaPart, 'tvg-id') || attr(metaPart, 'tvg-ID')
      const logo =
        attr(metaPart, 'tvg-logo') ||
        attr(metaPart, 'logo') ||
        attr(metaPart, 'tvg-icon')
      const group =
        attr(metaPart, 'group-title') ||
        attr(metaPart, 'group') ||
        'Uncategorized'
      const lang = attr(metaPart, 'tvg-language') || attr(metaPart, 'tvg-lang') || ''
      const ua = attr(metaPart, 'user-agent') || attr(metaPart, 'useragent') || ''
      const ref = attr(metaPart, 'referrer') || attr(metaPart, 'referer') || ''

      counter++
      pending = {
        id: slug(tvgName || displayName, counter),
        name: tvgName || displayName || `Channel ${counter}`,
        logo,
        group,
        language: lang,
        epgId: tvgId,
        userAgent: ua,
        referer: ref,
        url: ''
      }
      continue
    }

    if (line.startsWith('#')) continue // other directives, skip

    // This should be a URL
    if (line.startsWith('http') || line.startsWith('rtsp') || line.startsWith('udp')) {
      if (pending) {
        pending.url = line
        entries.push(pending as M3UEntry)
        pending = null
      }
      // URL without a preceding #EXTINF — still add it
      else {
        counter++
        entries.push({
          id: `ch-${counter}`,
          name: `Channel ${counter}`,
          logo: '',
          group: 'Uncategorized',
          language: '',
          epgId: '',
          userAgent: '',
          referer: '',
          url: line
        })
      }
    }
  }

  return entries
}

// ─── Convert to Channel ───────────────────────────────────────────────────────

export function m3uEntriesToChannels(entries: M3UEntry[]): Channel[] {
  return entries.map((e) => ({
    id: e.id,
    name: e.name,
    logo: e.logo,
    url: e.url,
    category: e.group || 'Uncategorized',
    group: e.group,
    isHD:
      e.name.toUpperCase().includes('HD') ||
      e.name.toUpperCase().includes('FHD') ||
      e.name.toUpperCase().includes('4K'),
    language: e.language || undefined,
    epgId: e.epgId || undefined,
    userAgent: e.userAgent || undefined,
    referer: e.referer || undefined
  }))
}

// ─── Fetch and parse from URL ─────────────────────────────────────────────────

export async function fetchAndParseM3U(url: string): Promise<Channel[]> {
  const resp = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36'
    }
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)
  const text = await resp.text()
  return m3uEntriesToChannels(parseM3U(text))
}

// ─── Parse from File text ─────────────────────────────────────────────────────

export function parseM3UText(text: string): Channel[] {
  return m3uEntriesToChannels(parseM3U(text))
}

