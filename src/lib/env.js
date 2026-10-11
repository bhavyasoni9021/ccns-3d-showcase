import { useEffect, useRef, useState } from 'react'

const mq = (q) => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(q).matches
export const prefersReducedMotion = () => mq('(prefers-reduced-motion: reduce)')
export const isCoarsePointer = () => mq('(pointer: coarse)')

export function webglAvailable() {
  try {
    const c = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')))
  } catch {
    return false
  }
}

/** true while the element is (nearly) on screen — used to pause WebGL when scrolled away */
export function useInView(rootMargin = '120px') {
  const ref = useRef(null)
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin })
    io.observe(el)
    return () => io.disconnect()
  }, [rootMargin])
  return [ref, visible]
}

/** adds .in to every .reveal element once it scrolls into view */
export function useRevealOnScroll() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal')
    if (typeof IntersectionObserver === 'undefined') {
      els.forEach((e) => e.classList.add('in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } }),
      { threshold: 0.12 })
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [])
}
