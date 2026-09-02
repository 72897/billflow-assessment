import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // These packages must stay outside the bundler: they rely on Node built-ins
  // (fs / WASM loading) that webpack cannot statically analyse.
  serverExternalPackages: ['@electric-sql/pglite', 'pg', '@react-pdf/renderer', 'nodemailer'],
  eslint: {
    // Lint is run explicitly via `npm run lint`; a lint warning should not fail a build.
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Server Actions receive base64 logo payloads (up to ~2 MB) from Settings.
    serverActions: { bodySizeLimit: '5mb' },
  },
  async headers() {
    /**
     * A share token is a bearer credential, so no crawler may keep a copy of
     * anything it opens. The public page already says `noindex` in its metadata;
     * this is the same instruction as a header, which is the version that also
     * covers the PDF and receipt downloads — a `<meta>` tag cannot.
     */
    const noIndex = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' }]

    return [
      { source: '/i/:token*', headers: noIndex },
      { source: '/api/public/:path*', headers: noIndex },
    ]
  },
}

export default nextConfig
