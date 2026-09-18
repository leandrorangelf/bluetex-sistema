'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { AuthProvider, useAuth } from '@/lib/auth-context'
import Sidebar from './Sidebar'

function Shell({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [user, loading, router])

  // Diretoria só enxerga o Painel Executivo — qualquer outra rota manda de volta pra lá.
  useEffect(() => {
    if (!loading && profile?.role === 'diretoria' && pathname !== '/dashboard') router.replace('/dashboard')
  }, [loading, profile, pathname, router])

  // Duas ciladas clássicas de formulário, corrigidas pro sistema inteiro:
  // 1) rolar a rodinha do mouse em cima de um campo numérico focado muda o
  //    valor sem querer — tira o foco do campo antes de deixar o scroll agir.
  // 2) apertar Backspace sem estar dentro de um campo de texto faz o
  //    navegador voltar de página, o que fecha modais de lançamento no meio.
  useEffect(() => {
    function blurNumeroNoScroll(e: WheelEvent) {
      const el = document.activeElement
      if (el instanceof HTMLInputElement && el.type === 'number') el.blur()
    }
    function bloquearBackspaceFora(e: KeyboardEvent) {
      if (e.key !== 'Backspace') return
      const el = document.activeElement as HTMLElement | null
      const editavel = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (!editavel) e.preventDefault()
    }
    window.addEventListener('wheel', blurNumeroNoScroll, { passive: true })
    window.addEventListener('keydown', bloquearBackspaceFora)
    return () => {
      window.removeEventListener('wheel', blurNumeroNoScroll)
      window.removeEventListener('keydown', bloquearBackspaceFora)
    }
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)' }}>
      Carregando...
    </div>
  )
  if (!user) return null

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">{children}</main>
    </div>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Shell>{children}</Shell>
    </AuthProvider>
  )
}
