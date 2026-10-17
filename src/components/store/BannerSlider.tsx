import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Banner } from '../../lib/types'

export default function BannerSlider() {
  const [banners, setBanners] = useState<Banner[]>([])
  const [current, setCurrent] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    supabase.from('banners').select('*').eq('is_active', true).order('priority').then(({ data }) => {
      if (data) setBanners(data as Banner[])
    })
  }, [])

  useEffect(() => {
    if (banners.length <= 1 || paused) return
    const t = setInterval(() => setCurrent(p => (p + 1) % banners.length), 5000)
    return () => clearInterval(t)
  }, [banners.length, paused])

  if (banners.length === 0) return null

  return (
    <div
      className="sf-banner-slider"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="sf-banner-track" style={{ transform: `translateX(${current * 100}%)` }}>
        {banners.map(b => (
          <div key={b.id} className="sf-banner-slide" style={{ background: `linear-gradient(135deg, ${b.color}15, ${b.color}30)` }}>
            <span style={{ color: b.color }}>{b.title}: {b.content}</span>
          </div>
        ))}
      </div>
      {banners.length > 1 && (
        <div className="sf-banner-dots">
          {banners.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`sf-banner-dot ${i === current ? 'active' : ''}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
