/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pure static export — no server runtime. All dynamism is client-side
  // (Nostr relay websockets + NIP-07 signing), so this bundles to `out/`
  // and hosts anywhere (GitHub Pages, Netlify, Vercel, Cloudflare, IPFS).
  output: 'export',

  // No image-optimization server exists in a static export, and picture URLs
  // come from arbitrary schemas and posters anyway — serve them as-is via <img>.
  images: { unoptimized: true },

  // Emit `foo/index.html` instead of `foo.html` so routes resolve cleanly
  // on static hosts that don't rewrite extensions.
  trailingSlash: true,

  // Only needed when hosting under a sub-path (https://user.github.io/repo)
  // rather than a domain root. Set at build time:
  //   NEXT_PUBLIC_BASE_PATH=/curare.to npm run build
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
}

export default nextConfig
