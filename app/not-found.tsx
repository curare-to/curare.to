import { Shell } from '@/components/shell/Shell'

/**
 * The static export turns this into out/404.html, which GitHub Pages serves
 * for every path it has no file for — /r/… and /u/… among them. The shell
 * reads the real address from the browser and renders the sub or the person
 * it names; a path that is neither is a genuine not-found.
 */
export default function NotFound() {
  return <Shell />
}
