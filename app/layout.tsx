import type { Metadata } from 'next'
import './globals.css'
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

/**
 * Only the document: the header and footer are app/(site)/layout.tsx's, so
 * the home page can stand without them while the countdown is up.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col">
        {children}
        <ServiceWorker />
      </body>
    </html>
  )
}
