import { Home } from '@/components/shell/Home'

/**
 * The page that was the home page until the countdown went up at /: the
 * viewer's feed, or the directory's. Built with NEXT_PUBLIC_SINGLE_LIST the
 * site has no directory, and this page is as unlinked as /all/ and /new/.
 */
export default function LandingPage() {
  return <Home />
}
