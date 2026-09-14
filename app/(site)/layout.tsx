import { SiteChrome } from '@/components/shell/SiteChrome'

/** The static pages, in the site's chrome. The group leaves the URLs alone. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>
}
