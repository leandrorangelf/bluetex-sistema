'use client'
export const dynamic = 'force-dynamic'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
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

function inicioDoMes(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

function dataHora(valor: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(valor))
}

function soHora(valor: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date(valor))
}

const TODOS = '__todos__'
const PRESETS = [
  { label: 'Hoje', de: () => hoje() },
  { label: '7 dias', de: () => diasAtras(7) },
  { label: '30 dias', de: () => diasAtras(30) },
  { label: 'Este mês', de: inicioDoMes },
] as const

// Uma linha por registro (tabela + registro_id): agrupa todas as edições
// daquele mesmo registro no período em vez de espalhar em várias linhas
// soltas — dá pra ver de cara "esse boleto foi mexido 4 vezes" e abrir pra
// conferir cada mudança em ordem, sem poluir a lista com repetição.
interface EventoProcessado {
  registro: AuditoriaEstoque
  alteracoes: ReturnType<typeof diffRegistro>
  resumo: string
}
interface GrupoAuditoria {
  chave: string
  tabela: string
  registroId: string | null
  eventos: EventoProcessado[]
  ultimaData: string
  usuarios: Set<string>
  unidades: Set<string>
  operacoes: Record<string, number>
}

export default function AuditoriaPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const sb = useMemo(() => createClient(), [])
  const [registros, setRegistros] = useState<AuditoriaEstoque[]>([])
  const [nomesUsuarios, setNomesUsuarios] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [abertos, setAbertos] = useState<Set<string>>(new Set())

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
    setAbertos(new Set())

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

  function aplicarPreset(deFn: () => string) {
    setDe(deFn())
    setAte(hoje())
  }

  const usuariosNoLog = useMemo(() => {
    const ids = [...new Set(registros.map(r => r.usuario_id).filter((id): id is string => Boolean(id)))]
    return ids.map(id => ({ id, nome: nomesUsuarios[id] ?? id.slice(0, 8) })).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [registros, nomesUsuarios])

  const tabelasNoLog = useMemo(() => [...new Set(registros.map(r => r.tabela))].sort(), [registros])

  const nomeUsuario = useCallback((id: string | null) => id ? (nomesUsuarios[id] || id.slice(0, 8)) : 'Sistema', [nomesUsuarios])

  const eventos = useMemo(() => registros
    .filter(r => filtroUsuario === TODOS || r.usuario_id === filtroUsuario)
    .filter(r => filtroTabela === TODOS || r.tabela === filtroTabela)
    .filter(r => filtroOperacao === TODOS || r.operacao === filtroOperacao)
    .filter(r => filtroUnidade === TODOS || r.unidade === filtroUnidade)
    .map((r): EventoProcessado => ({
      registro: r,
      alteracoes: r.operacao === 'UPDATE' ? diffRegistro(r.dados_anteriores, r.dados_novos) : [],
      resumo: r.operacao === 'DELETE' ? resumoRegistro(r.dados_anteriores) : r.operacao === 'INSERT' ? resumoRegistro(r.dados_novos) : '',
    }))
    .filter(item => {
      if (!busca.trim()) return true
      const alvo = busca.trim().toLocaleLowerCase('pt-BR')
      const texto = [
        item.resumo,
        nomeUsuario(item.registro.usuario_id),
        ...item.alteracoes.map(a => `${a.label} ${a.antes} ${a.depois}`),
      ].join(' ').toLocaleLowerCase('pt-BR')
      return texto.includes(alvo)
    }),
  [registros, filtroUsuario, filtroTabela, filtroOperacao, filtroUnidade, busca, nomeUsuario])

  // Compacta em grupos por (tabela, registro_id) preservando a ordem — o
  // grupo aparece na posição do seu evento mais recente.
  const grupos = useMemo(() => {
    const porChave = new Map<string, GrupoAuditoria>()
    const ordem: string[] = []
    for (const item of eventos) {
      const r = item.registro
      const chave = `${r.tabela}:${r.registro_id ?? r.id}`
      let g = porChave.get(chave)
      if (!g) {
        g = { chave, tabela: r.tabela, registroId: r.registro_id, eventos: [], ultimaData: r.created_at, usuarios: new Set(), unidades: new Set(), operacoes: {} }
        porChave.set(chave, g)
        ordem.push(chave)
      }
      g.eventos.push(item)
      g.usuarios.add(nomeUsuario(r.usuario_id))
      if (r.unidade) g.unidades.add(r.unidade)
      g.operacoes[r.operacao] = (g.operacoes[r.operacao] ?? 0) + 1
    }
    return ordem.map(chave => porChave.get(chave)!)
  }, [eventos, nomeUsuario])

  function toggle(chave: string) {
    setAbertos(prev => {
      const n = new Set(prev)
      n.has(chave) ? n.delete(chave) : n.add(chave)
      return n
    })
  }

  if (!isAdmin) {
    return <div className="empty-state">Log de edições disponível só para administradores.</div>
  }

  const operacaoResumo = (op: Record<string, number>) => {
    const chaves = Object.keys(op)
    if (chaves.length === 1) return <span className={`stock-audit-operation operation-${chaves[0].toLowerCase()}`}>{OPERACOES_LABEL[chaves[0]]}</span>
    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {chaves.map(k => (
          <span key={k} className={`stock-audit-operation operation-${k.toLowerCase()}`}>{op[k]}× {OPERACOES_LABEL[k]}</span>
        ))}
      </div>
    )
  }

  return (
    <div>
      <div className="page-header audit-page-header">
        <div>
          <h1 className="page-title">Log de Edições</h1>
          <div className="page-subtitle">Quem editou o quê, quando — em parcelas, vendas, compras e ajustes de estoque</div>
        </div>
        <div className="audit-summary">
          <div className="audit-summary-num">{grupos.length}</div>
          <div className="audit-summary-label">registro{grupos.length === 1 ? '' : 's'} distinto{grupos.length === 1 ? '' : 's'}<br />{eventos.length} evento{eventos.length === 1 ? '' : 's'}</div>
        </div>
      </div>

      <div className="card audit-toolbar">
        <div className="audit-presets">
          {PRESETS.map(p => (
            <button key={p.label} type="button" className={`btn btn-sm ${de === p.de() && ate === hoje() ? 'btn-primary' : 'btn-secondary'}`} onClick={() => aplicarPreset(p.de)}>
              {p.label}
            </button>
          ))}
          <span className="audit-preset-sep" />
          <input className="form-input audit-date" type="date" value={de} onChange={e => setDe(e.target.value)} />
          <span className="audit-preset-sep" style={{ width: 6 }} />
          <input className="form-input audit-date" type="date" value={ate} onChange={e => setAte(e.target.value)} />
        </div>

        <div className="audit-filters">
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
            <label className="form-label">Buscar (usuário, valor, boleto, cliente...)</label>
            <input className="form-input" placeholder="Ex.: nome de cliente, valor, boleto..." value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
        </div>
      </div>

      {erro && <div className="alert alert-red" style={{ marginBottom: 12 }}>{erro}</div>}

      <div className="table-wrap">
        <table className="stock-audit-table audit-table">
          <thead>
            <tr>
              <th style={{ width: 26 }} />
              <th>Quando</th><th>Quem</th><th>Unidade</th><th>Tabela</th><th>Ação</th><th>O que mudou</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="empty-state">Carregando...</td></tr>
            : grupos.length === 0 ? <tr><td colSpan={7} className="empty-state">Nenhum registro no período/filtro selecionado.</td></tr>
            : grupos.map(g => {
              const aberto = abertos.has(g.chave)
              const multiplo = g.eventos.length > 1
              const primeiro = g.eventos[0]
              return (
                <Fragment key={g.chave}>
                  <tr
                    className={`audit-row${multiplo ? ' audit-row-grupo' : ''}`}
                    role={multiplo ? 'button' : undefined}
                    tabIndex={multiplo ? 0 : undefined}
                    onClick={multiplo ? () => toggle(g.chave) : undefined}
                    onKeyDown={multiplo ? e => { if (e.key === 'Enter') toggle(g.chave) } : undefined}
                  >
                    <td className="audit-chevron">{multiplo ? (aberto ? '▾' : '▸') : ''}</td>
                    <td className="mono">
                      {dataHora(g.ultimaData)}
                      {multiplo && <span className="badge badge-gray audit-count">×{g.eventos.length}</span>}
                    </td>
                    <td>{g.usuarios.size > 1 ? `${g.usuarios.size} pessoas` : [...g.usuarios][0]}</td>
                    <td>{g.unidades.size > 1 ? `${g.unidades.size} unidades` : ([...g.unidades][0] ?? '—')}</td>
                    <td>{TABELAS_AUDITADAS[g.tabela] ?? g.tabela.replace('btx_', '')}</td>
                    <td>{operacaoResumo(g.operacoes)}</td>
                    <td className="stock-audit-data">
                      {primeiro.registro.operacao === 'UPDATE'
                        ? (primeiro.alteracoes.length === 0 ? '—' : primeiro.alteracoes.map(a => (
                            <div key={a.campo}><strong>{a.label}:</strong> {a.antes} → {a.depois}</div>
                          )))
                        : primeiro.resumo}
                      {multiplo && !aberto && <div className="audit-ver-mais">clique pra ver as {g.eventos.length} alterações</div>}
                    </td>
                  </tr>
                  {multiplo && aberto && g.eventos.map(({ registro: r, alteracoes, resumo }) => (
                    <tr key={r.id} className="audit-subrow">
                      <td />
                      <td className="mono">{soHora(r.created_at)}</td>
                      <td colSpan={2}>{nomeUsuario(r.usuario_id)}</td>
                      <td colSpan={1} />
                      <td><span className={`stock-audit-operation operation-${r.operacao.toLowerCase()}`}>{OPERACOES_LABEL[r.operacao]}</span></td>
                      <td className="stock-audit-data">
                        {r.operacao === 'UPDATE'
                          ? (alteracoes.length === 0 ? '—' : alteracoes.map(a => (
                              <div key={a.campo}><strong>{a.label}:</strong> {a.antes} → {a.depois}</div>
                            )))
                          : resumo}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
