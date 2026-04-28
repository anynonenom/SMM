import type { Metadata } from 'next'
import './globals.css'
import Providers from './providers'

export const metadata: Metadata = {
  title: 'HYDRA — Social Media Analytics',
  description: 'HYDRA by EIDEN Group — Social media analytics platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: 'var(--creme)' }}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
