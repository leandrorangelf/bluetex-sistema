import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NEW BLUETEX · Sistema',
  description: 'Sistema de controle de distribuidoras NEW BLUETEX',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
