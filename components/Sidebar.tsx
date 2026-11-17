'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import Logo from './Logo'

type Item = { href: string; label: string; adminOnly?: boolean }
const GRUPOS: { titulo: string; itens: Item[] }[] = [
  { titulo: 'Visão geral', itens: [
    { href: '/dashboard', label: 'Painel' },
    { href: '/quadro', label: 'Quadro do time' },
  ] },
  { titulo: 'Financeiro', itens: [
    { href: '/vendas', label: 'Vendas' },
    { href: '/parcelas-pagar', label: 'Contas a Pagar' },
    { href: '/parcelas-receber', label: 'Contas a Receber' },
  ] },
  { titulo: 'Estoque e cadastros', itens: [
    { href: '/estoque-atual', label: 'Estoque' },
    { href: '/produtos', label: 'Produtos' },
    { href: '/clientes', label: 'Clientes' },
    { href: '/fornecedores', label: 'Fornecedores' },
    { href: '/categorias', label: 'Categorias' },
  ] },
  { titulo: 'Sistema', itens: [
    { href: '/integracoes/vhsys', label: 'Integração VHSYS' },
    { href: '/auditoria', label: 'Log de Edições', adminOnly: true },
  ] },
]

export default function Sidebar({ aberta, onFechar }: { aberta: boolean; onFechar: () => void }) {
  const path = usePathname()
  const { profile, unidadeAtiva, signOut } = useAuth()
  const role = profile?.role

  // Diretoria só enxerga o Painel; o resto vale para admin e unidade.
  const grupos = GRUPOS
    .map(g => ({
      ...g,
      itens: g.itens.filter(i =>
        role === 'diretoria' ? i.href === '/dashboard' : !i.adminOnly || role === 'admin'),
    }))
    .filter(g => g.itens.length > 0)

  return (
    <>
      {aberta && <div className="sidebar-backdrop" onClick={onFechar} aria-hidden="true" />}
      <aside className={`sidebar${aberta ? ' open' : ''}`}>
        <div className="sidebar-brand">
          <Logo tamanho="sm" cor="escuro" />
        </div>

        <nav className="sidebar-nav" onClick={onFechar}>
          {grupos.map(g => (
            <div key={g.titulo}>
              <div className="nav-section">{g.titulo}</div>
              {g.itens.map(item => {
                const active = path === item.href || path.startsWith(item.href + '/')
                return (
                  <Link key={item.href} href={item.href} className={`nav-link${active ? ' active' : ''}`}>
                    {item.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{profile?.nome}</div>
            <div className="sidebar-user-role">
              {role === 'admin' ? 'Administrador' : role === 'diretoria' ? 'Diretoria' : unidadeAtiva}
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={signOut}>Sair</button>
        </div>
      </aside>
    </>
  )
}
