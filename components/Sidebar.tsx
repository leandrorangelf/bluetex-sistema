'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { UNIDADES, type Unidade } from '@/types'
import Logo from './Logo'

const NAV = [
  { href: '/dashboard', label: 'Painel' },
  { href: '/lancar', label: 'Lançar' },
  { href: '/vendas', label: 'Vendas' },
  { href: '/parcelas-pagar', label: 'Contas a Pagar' },
  { href: '/parcelas-receber', label: 'Contas a Receber' },
  { href: '/estoque-atual', label: 'Estoque' },
  { section: 'Cadastros' },
  { href: '/produtos', label: 'Produtos' },
  { href: '/clientes', label: 'Clientes', unidadeHidden: true },
  { href: '/fornecedores', label: 'Fornecedores' },
  { href: '/categorias', label: 'Categorias', unidadeHidden: true },
  { section: 'Integrações' },
  { href: '/integracoes/vhsys', label: 'Integração VHSYS', adminOnly: true },
  { section: 'Administração' },
  { href: '/auditoria', label: 'Log de Edições', adminOnly: true },
]

export default function Sidebar() {
  const path = usePathname()
  const { profile, unidadeAtiva, setUnidadeAtiva, signOut } = useAuth()

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div style={{ padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <Logo tamanho="sm" cor="claro" />
        {unidadeAtiva && (
          <div style={{ fontSize: 11, color: 'var(--brand-on-dark)', fontWeight: 600, marginTop: 8 }}>
            {unidadeAtiva}
          </div>
        )}
      </div>

      {/* Seletor de unidade — admin (diretoria já troca de unidade pelas abas do Painel) */}
      {profile?.role === 'admin' && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>
            Unidade Ativa
          </div>
          <select
            style={{
              width: '100%', padding: '7px 10px', fontSize: 12, fontWeight: 600,
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 6, color: '#fff', outline: 'none', cursor: 'pointer'
            }}
            value={unidadeAtiva ?? ''}
            onChange={e => setUnidadeAtiva(e.target.value as Unidade)}
          >
            <option value="" style={{ background: '#1A1A2E', color: '#fff' }}>— Selecione a unidade —</option>
            {UNIDADES.map(u => (
              <option key={u} value={u} style={{ background: '#1A1A2E', color: '#fff' }}>{u}</option>
            ))}
          </select>
        </div>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, paddingTop: 8 }}>
        {NAV.map((item, i) => {
          if (profile?.role === 'diretoria' && ('section' in item || item.href !== '/dashboard')) return null
          if (profile?.role === 'unidade' && 'unidadeHidden' in item && item.unidadeHidden) return null
          if ('section' in item) return (
            <div key={i} className="nav-section">{item.section}</div>
          )
          if ('adminOnly' in item && item.adminOnly && profile?.role !== 'admin') return null
          const active = path === item.href || path.startsWith(item.href + '/')
          return (
            <Link key={item.href} href={item.href} className={`nav-link${active ? ' active' : ''}`}>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 2 }}>
          {profile?.nome}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>
          {profile?.role === 'admin' ? 'Administrador' : profile?.role === 'diretoria' ? 'Diretoria' : unidadeAtiva}
        </div>
        <button
          className="btn btn-secondary btn-sm"
          style={{ width: '100%', justifyContent: 'center', color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.2)' }}
          onClick={signOut}
        >
          Sair
        </button>
      </div>
    </aside>
  )
}
