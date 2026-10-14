import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The live site's headers (privacy policy, cross-origin isolation and so on)
// live in vercel.json. `vite preview` sends the same ones, so the browser
// tests check what visitors get.
const vercel = JSON.parse(
  readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'),
) as {
  headers: { source: string; headers: { key: string; value: string }[] }[]
}
const siteHeaders = Object.fromEntries(
  vercel.headers
    .find((rule) => rule.source === '/(.*)')!
    .headers.map(({ key, value }) => [key, value]),
)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  preview: { headers: siteHeaders },
})
