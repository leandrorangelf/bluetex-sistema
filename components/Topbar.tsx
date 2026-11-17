'use client'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { UNIDADES, type Unidade } from '@/types'

export default function Topbar({ onMenu }: { onMenu: () => void }) {
  const { profile, unidadeAtiva, setUnidadeAtiva } = useAuth()
  const role = profile?.role

  return (
    <header className="topbar">
      <button className="topbar-menu" onClick={onMenu} aria-label="Abrir menu">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M3 5h14M3 10h14M3 15h14" />
        </svg>
      </button>

      <div className="topbar-unit">
        {role === 'admin' ? (
          <>
            <span className="topbar-label">Unidade</span>
            <select
              className="topbar-select"
              value={unidadeAtiva ?? ''}
              onChange={e => setUnidadeAtiva(e.target.value as Unidade)}
              aria-label="Unidade ativa"
            >
              {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </>
        ) : role === 'unidade' && unidadeAtiva ? (
          <>
            <span className="topbar-label">Unidade</span>
            <strong className="topbar-unit-name">{unidadeAtiva}</strong>
          </>
        ) : null}
      </div>

      {role !== 'diretoria' && (
        <Link href="/lancar" className="btn btn-primary topbar-launch">
          <span aria-hidden="true">+</span> Lançar
        </Link>
      )}
    </header>
  )
}
