import type { Metadata } from 'next'
import './globals.css'
import { SiteHeader } from '@/components/shell/SiteHeader'
import { SiteFooter } from '@/components/shell/SiteFooter'
import { ServiceWorker } from '@/components/shell/ServiceWorker'

export const metadata: Metadata = {
  metadataBase: new URL('https://curare.to'),
  title: {
    default: 'curare.to — curated lists on Nostr',
    template: '%s · curare.to',
  },
  description:
    'A decentralized reddit: every sub is a curated list on Nostr — a schema anyone can suggest to, and a front page its curator signs.',
  openGraph: {
    title: 'curare.to',
    description: 'A decentralized reddit built on curated lists, on Nostr.',
    url: 'https://curare.to',
    siteName: 'curare.to',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col">
        <SiteHeader />
        <main className="w-full flex-1">{children}</main>
        <SiteFooter />
        <ServiceWorker />
      </body>
    </html>
  )
}
