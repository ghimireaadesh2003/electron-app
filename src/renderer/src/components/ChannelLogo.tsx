import React, { useState } from 'react'

interface ChannelLogoProps {
  logo: string
  name: string
  size?: 'sm' | 'md' | 'lg'
}

export function ChannelLogo({ logo, name, size = 'md' }: ChannelLogoProps) {
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)

  const sizeClass = size === 'sm' ? 'w-3/4 h-3/4' : size === 'lg' ? 'w-4/5 h-4/5' : 'w-3/4 h-3/4'

  if (!logo || errored) {
    return (
      <div className="w-full h-full flex items-center justify-center p-2">
        <span className="text-zinc-500 text-[11px] text-center leading-tight line-clamp-2">
          {name}
        </span>
      </div>
    )
  }

  return (
    <>
      {/* Skeleton */}
      {!loaded && (
        <div className="absolute inset-0 bg-zinc-800 animate-pulse" />
      )}
      <img
        src={logo}
        alt={name}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => { setErrored(true); setLoaded(true) }}
        className={`${sizeClass} object-contain transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </>
  )
}

