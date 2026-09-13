'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { isShellPath, parseRoute, type Route } from '@/lib/routes'

/* ------------------------------------------------------------------ *
 * The client router behind /r/… and /u/….
 *
 * `output: 'export'` cannot emit a page per sub, so those paths are served
 * by the 404.html that app/not-found.tsx becomes, and this is the small
 * router it mounts: it reads window.location after mount (never during
 * render, so the prerendered shell hydrates cleanly), listens to popstate,
 * and pushes state for links into shell paths. Links to static pages stay
 * ordinary anchors — Next's own router is never asked to fetch a payload
 * that does not exist.
 * ------------------------------------------------------------------ */

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

interface RouterState {
  /** Null until mounted — the server render has no location. */
  route: Route | null
  navigate: (path: string) => void
}

const RouterContext = createContext<RouterState>({ route: null, navigate: () => {} })

export function RouterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<{ pathname: string; search: string } | null>(null)

  useEffect(() => {
    const read = () => setLocation({ pathname: window.location.pathname, search: window.location.search })
    read()
    window.addEventListener('popstate', read)
    return () => window.removeEventListener('popstate', read)
  }, [])

  const navigate = useCallback((path: string) => {
    const url = new URL(withBase(path), window.location.href)
    window.history.pushState(null, '', url)
    setLocation({ pathname: url.pathname, search: url.search })
    window.scrollTo(0, 0)
  }, [])

  const value = useMemo<RouterState>(
    () => ({ route: location ? parseRoute(location.pathname, location.search) : null, navigate }),
    [location, navigate],
  )

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

export function useRoute(): Route | null {
  return useContext(RouterContext).route
}

export function useNavigate(): (path: string) => void {
  return useContext(RouterContext).navigate
}

/** Prefix the base path once, for hrefs built by lib/routes. */
export function withBase(path: string): string {
  if (!BASE || !path.startsWith('/') || path.startsWith(BASE + '/')) return path
  return BASE + path
}

/**
 * An anchor that the shell handles when the target is a shell path and the
 * click is an ordinary one. Everything else — modifier keys, external hrefs,
 * static pages — is left to the browser.
 */
export function A({ href, onClick, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const navigate = useNavigate()
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (event.defaultPrevented) return
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (rest.target && rest.target !== '_self') return
    if (!href.startsWith('/')) return
    const [pathname] = href.split(/[?#]/)
    if (!isShellPath(withBase(pathname))) return
    event.preventDefault()
    navigate(href)
  }
  return (
    <a href={withBase(href)} onClick={handle} {...rest}>
      {children}
    </a>
  )
}
