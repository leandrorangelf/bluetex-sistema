'use client'
export const dynamic = 'force-dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import { hoje } from '@/lib/utils'
import { TABELAS_AUDITADAS, OPERACOES_LABEL, diffRegistro, resumoRegistro } from '@/lib/auditoria'
import { UNIDADES, type AuditoriaEstoque } from '@/types'

function diasAtras(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function dataHora(valor: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(valor))
}

const TODOS = '__todos__'

export default function AuditoriaPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const sb = useMemo(() => createClient(), [])
  const [registros, setRegistros] = useState<AuditoriaEstoque[]>([])
  const [nomesUsuarios, setNomesUsuarios] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  const [de, setDe] = useState(diasAtras(7))
  const [ate, setAte] = useState(hoje())
  const [filtroUsuario, setFiltroUsuario] = useState(TODOS)
  const [filtroTabela, setFiltroTabela] = useState(TODOS)
  const [filtroOperacao, setFiltroOperacao] = useState(TODOS)
  const [filtroUnidade, setFiltroUnidade] = useState(TODOS)
  const [busca, setBusca] = useState('')

  const carregar = useCallback(async () => {
    if (!isAdmin) return
    setLoading(true)
    setErro('')
    const { data, error } = await sb
      .from('btx_auditoria_estoque')
      .select('*')
      .gte('created_at', `${de}T00:00:00`)
      .lte('created_at', `${ate}T23:59:59`)
      .order('created_at', { ascending: false })
      .limit(2000)
    if (error) { setErro('Não foi possível carregar o log.'); setLoading(false); return }
    const linhas = (data ?? []) as AuditoriaEstoque[]
    setRegistros(linhas)

    const ids = [...new Set(linhas.map(r => r.usuario_id).filter((id): id is string => Boolean(id)))]
    if (ids.length) {
      const { data: perfis } = await sb.from('btx_profiles').select('id,nome').in('id', ids)
      setNomesUsuarios(Object.fromEntries(((perfis ?? []) as { id: string; nome: string }[]).map(p => [p.id, p.nome])))
    } else {
      setNomesUsuarios({})
    }
    setLoading(false)
  }, [sb, isAdmin, de, ate])

  useEffect(() => { carregar() }, [carregar])

  const usuariosNoLog = useMemo(() => {
    const ids = [...new Set(registros.map(r => r.usuario_id).filter((id): id is string => Boolean(id)))]
    return ids.map(id => ({ id, nome: nomesUsuarios[id] ?? id.slice(0, 8) })).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [registros, nomesUsuarios])

  const tabelasNoLog = useMemo(() => [...new Set(registros.map(r => r.tabela))].sort(), [registros])

  const linhas = useMemo(() => registros
    .filter(r => filtroUsuario === TODOS || r.usuario_id === filtroUsuario)
    .filter(r => filtroTabela === TODOS || r.tabela === filtroTabela)
    .filter(r => filtroOperacao === TODOS || r.operacao === filtroOperacao)
    .filter(r => filtroUnidade === TODOS || r.unidade === filtroUnidade)
    .map(r => ({
      registro: r,
      alteracoes: r.operacao === 'UPDATE' ? diffRegistro(r.dados_anteriores, r.dados_novos) : [],
      resumo: r.operacao === 'DELETE' ? resumoRegistro(r.dados_anteriores) : r.operacao === 'INSERT' ? resumoRegistro(r.dados_novos) : '',
    }))
    .filter(item => {
      if (!busca.trim()) return true
      const alvo = busca.trim().toLocaleLowerCase('pt-BR')
      const texto = [
        item.resumo,
        ...item.alteracoes.map(a => `${a.label} ${a.antes} ${a.depois}`),
      ].join(' ').toLocaleLowerCase('pt-BR')
      return texto.includes(alvo)
    }),
  [registros, filtroUsuario, filtroTabela, filtroOperacao, filtroUnidade, busca])

  if (!isAdmin) {
    return <div className="empty-state">Log de edições disponível só para administradores.</div>
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Log de Edições</h1>
          <div className="page-subtitle">Quem editou o quê, quando — em parcelas, vendas, compras e ajustes de estoque</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">De</label>
          <input className="form-input" type="date" value={de} onChange={e => setDe(e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Até</label>
          <input className="form-input" type="date" value={ate} onChange={e => setAte(e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Usuário</label>
          <select className="form-select" value={filtroUsuario} onChange={e => setFiltroUsuario(e.target.value)}>
            <option value={TODOS}>Todos</option>
            {usuariosNoLog.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Tabela</label>
          <select className="form-select" value={filtroTabela} onChange={e => setFiltroTabela(e.target.value)}>
            <option value={TODOS}>Todas</option>
            {tabelasNoLog.map(t => <option key={t} value={t}>{TABELAS_AUDITADAS[t] ?? t}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Ação</label>
          <select className="form-select" value={filtroOperacao} onChange={e => setFiltroOperacao(e.target.value)}>
            <option value={TODOS}>Todas</option>
            <option value="INSERT">Criação</option>
            <option value="UPDATE">Edição</option>
            <option value="DELETE">Exclusão</option>
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Unidade</label>
          <select className="form-select" value={filtroUnidade} onChange={e => setFiltroUnidade(e.target.value)}>
            <option value={TODOS}>Todas</option>
            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0, gridColumn: '1/-1' }}>
          <label className="form-label">Buscar no que mudou</label>
          <input className="form-input" placeholder="Ex.: nome de cliente, valor, boleto..." value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
      </div>

      {erro && <div className="alert alert-red" style={{ marginBottom: 12 }}>{erro}</div>}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{linhas.length} de {registros.length} registro(s) no período</div>

      <div className="table-wrap">
        <table className="stock-audit-table">
          <thead>
            <tr>
              <th>Data e hora</th><th>Usuário</th><th>Unidade</th><th>Tabela</th><th>Ação</th><th>O que mudou</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="empty-state">Carregando...</td></tr>
            : linhas.length === 0 ? <tr><td colSpan={6} className="empty-state">Nenhum registro no período/filtro selecionado.</td></tr>
            : linhas.map(({ registro: r, alteracoes, resumo }) => (
              <tr key={r.id}>
                <td className="mono">{dataHora(r.created_at)}</td>
                <td>{r.usuario_id ? (nomesUsuarios[r.usuario_id] || r.usuario_id.slice(0, 8)) : 'Sistema'}</td>
                <td>{r.unidade ?? '—'}</td>
                <td>{TABELAS_AUDITADAS[r.tabela] ?? r.tabela.replace('btx_', '')}</td>
                <td><span className={`stock-audit-operation operation-${r.operacao.toLowerCase()}`}>{OPERACOES_LABEL[r.operacao]}</span></td>
                <td className="stock-audit-data">
                  {r.operacao === 'UPDATE'
                    ? (alteracoes.length === 0 ? '—' : alteracoes.map(a => (
                        <div key={a.campo}>
                          <strong>{a.label}:</strong> {a.antes} → {a.depois}
                        </div>
                      )))
                    : resumo}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
