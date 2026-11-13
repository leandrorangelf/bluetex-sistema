import type { Metadata } from 'next'
import { Figtree } from 'next/font/google'
import { AuthProvider } from '@/lib/auth-context'

// Página fora do layout do ERP (sem sidebar): quadro de tarefas para o time todo.
const figtree = Figtree({ subsets: ['latin'], weight: ['400', '500', '600', '700'], display: 'swap' })

export const metadata: Metadata = { title: 'Quadro do time · New Bluetex' }

export default function QuadroLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className={figtree.className}>{children}</div>
    </AuthProvider>
  )
}
