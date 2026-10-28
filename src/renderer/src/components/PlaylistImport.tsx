/**
 * PlaylistImport.tsx — M3U/M3U8 import modal
 * Supports: URL fetch and local file pick.
 */
import React, { useState, useRef } from 'react'
import { fetchAndParseM3U, parseM3UText } from '../utils/m3uParser'
import { useLiveTVStore } from '../store/useLiveTVStore'

interface PlaylistImportProps {
  onClose: () => void
}

type ImportStep = 'idle' | 'loading' | 'done' | 'error'

export function PlaylistImport({ onClose }: PlaylistImportProps) {
  const { importChannels, clearImported } = useLiveTVStore()
  const [tab, setTab] = useState<'url' | 'file'>('url')
  const [url, setUrl] = useState('')
  const [step, setStep] = useState<ImportStep>('idle')
  const [message, setMessage] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleUrlImport = async () => {
    if (!url.trim()) return
    setStep('loading')
    setMessage('')
    try {
      const channels = await fetchAndParseM3U(url.trim())
      if (channels.length === 0) throw new Error('No valid channels found in playlist.')
      importChannels(channels)
      setStep('done')
      setMessage(`Imported ${channels.length} channels successfully.`)
    } catch (e: unknown) {
      setStep('error')
      setMessage(e instanceof Error ? e.message : 'Failed to fetch playlist.')
    }
  }

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setStep('loading')
    setMessage('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      try {
        const channels = parseM3UText(text)
        if (channels.length === 0) throw new Error('No valid channels found in file.')
        importChannels(channels)
        setStep('done')
        setMessage(`Imported ${channels.length} channels from ${file.name}.`)
      } catch (err: unknown) {
        setStep('error')
        setMessage(err instanceof Error ? err.message : 'Failed to parse playlist file.')
      }
    }
    reader.onerror = () => { setStep('error'); setMessage('Could not read file.') }
    reader.readAsText(file)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md mx-4 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-bold text-lg">Import Playlist</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-zinc-800 rounded-lg p-1">
          {(['url', 'file'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setStep('idle'); setMessage('') }}
              className={`flex-1 py-1.5 rounded-md text-sm font-semibold transition-colors
                ${tab === t ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              {t === 'url' ? '🌐 URL' : '📁 File'}
            </button>
          ))}
        </div>

        {tab === 'url' ? (
          <div className="flex flex-col gap-3">
            <input
              type="url"
              placeholder="https://example.com/playlist.m3u8"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUrlImport()}
              className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2.5 text-sm
                         text-zinc-100 placeholder-zinc-500 outline-none focus:ring-1 focus:ring-red-600"
            />
            <button
              onClick={handleUrlImport}
              disabled={step === 'loading' || !url.trim()}
              className="w-full py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed
                         rounded-lg text-sm font-semibold text-white transition-colors"
            >
              {step === 'loading' ? 'Fetching…' : 'Import'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-dashed border-zinc-600
                         hover:border-red-600 rounded-lg text-sm text-zinc-300 transition-colors"
            >
              Click to choose .m3u / .m3u8 file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".m3u,.m3u8,.txt"
              className="hidden"
              onChange={handleFileImport}
            />
          </div>
        )}

        {/* Status */}
        {step === 'done' && (
          <div className="mt-4 p-3 bg-green-900/40 border border-green-700/60 rounded-lg text-sm text-green-300">
            ✅ {message}
          </div>
        )}
        {step === 'error' && (
          <div className="mt-4 p-3 bg-red-900/40 border border-red-700/60 rounded-lg text-sm text-red-300">
            ❌ {message}
          </div>
        )}
        {step === 'loading' && (
          <div className="mt-4 flex items-center gap-2 text-sm text-zinc-400">
            <div className="w-4 h-4 border-2 border-zinc-600 border-t-red-500 rounded-full animate-spin" />
            Parsing playlist…
          </div>
        )}

        {/* Clear imported */}
        <div className="mt-5 flex justify-between items-center pt-4 border-t border-zinc-800">
          <button
            onClick={() => { clearImported(); setStep('idle'); setMessage('') }}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Reset to built-in channels
          </button>
          {step === 'done' && (
            <button
              onClick={onClose}
              className="text-sm text-red-400 hover:text-red-300 font-semibold transition-colors"
            >
              Done →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

