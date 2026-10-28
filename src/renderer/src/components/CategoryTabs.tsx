import React, { useMemo } from 'react'
import { useLiveTVStore } from '../store/useLiveTVStore'

export function CategoryTabs() {
  const { activeCategory, setActiveCategory, channels, favorites } = useLiveTVStore()

  const categories = useMemo(() => {
    const cats = Array.from(new Set(channels.map((c) => c.category))).sort()
    return ['All', 'Favorites', ...cats]
  }, [channels])

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800 overflow-x-auto no-scrollbar shrink-0">
      {categories.map((category) => {
        const isActive = activeCategory === category
        const count =
          category === 'All'
            ? channels.length
            : category === 'Favorites'
            ? favorites.length
            : channels.filter((c) => c.category === category).length

        return (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold
                        whitespace-nowrap transition-colors no-drag flex-shrink-0
              ${isActive
                ? 'bg-red-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'}`}
          >
            {category === 'Favorites' && '♥ '}
            {category}
            {count > 0 && (
              <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-bold tabular-nums
                ${isActive ? 'bg-red-800/70' : 'bg-zinc-700'}`}>
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
