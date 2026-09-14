import { SiteHeader } from './SiteHeader'
import { SiteFooter } from './SiteFooter'

/**
 * The header, the page, the footer. Every page has it except the home page
 * while the countdown is up: app/(site)/layout.tsx puts it round the static
 * pages, and the two rendered outside that group — app/page.tsx and the
 * shell in app/not-found.tsx — decide for themselves.
 */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="w-full flex-1">{children}</main>
      <SiteFooter />
    </>
  )
}
