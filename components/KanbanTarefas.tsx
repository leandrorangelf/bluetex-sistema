'use client'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import { UNIDADES } from '@/types'
import type { ItemChecklist, PrioridadeTarefa, StatusTarefa, Tarefa, Unidade } from '@/types'

const COLUNAS: { id: StatusTarefa; titulo: string; cor: string }[] = [
  { id: 'pendente', titulo: 'Pendente', cor: 'var(--amber)' },
  { id: 'andamento', titulo: 'Em andamento', cor: 'var(--brand)' },
  { id: 'concluido', titulo: 'Concluído', cor: 'var(--green)' },
]
const PRIORIDADES: { id: PrioridadeTarefa; label: string; badge: string }[] = [
  { id: 'urgente', label: 'Urgente', badge: 'badge-red' },
  { id: 'alta', label: 'Alta', badge: 'badge-amber' },
  { id: 'media', label: 'Média', badge: 'badge-purple' },
  { id: 'baixa', label: 'Baixa', badge: 'badge-gray' },
]
const CATEGORIAS = [
  ['cadastro', 'Cadastros'], ['estoque', 'Estoque'], ['financeiro', 'Financeiro'],
  ['vendas', 'Vendas'], ['vhsys', 'VHSYS'], ['outros', 'Outros'],
] as const
const catLabel = (c: string) => CATEGORIAS.find(x => x[0] === c)?.[1] ?? c

// Pendências típicas de implantação de uma unidade — "coisas que faltam".
const PADRAO: { titulo: string; categoria: string; prioridade: PrioridadeTarefa; checklist: string[] }[] = [
  { titulo: 'Cadastrar produtos da unidade', categoria: 'cadastro', prioridade: 'alta', checklist: ['Conferir nomes e unidades de medida', 'Definir fator de conversão (caixa/carteira)'] },
  { titulo: 'Cadastrar clientes', categoria: 'cadastro', prioridade: 'media', checklist: ['Importar lista de clientes', 'Conferir CNPJ e telefone'] },
  { titulo: 'Cadastrar fornecedores', categoria: 'cadastro', prioridade: 'media', checklist: ['Importar lista de fornecedores'] },
  { titulo: 'Definir categorias de despesas', categoria: 'financeiro', prioridade: 'media', checklist: [] },
  { titulo: 'Lançar estoque inicial', categoria: 'estoque', prioridade: 'alta', checklist: ['Contagem física', 'Lançar no sistema', 'Conferir contra o estoque atual'] },
  { titulo: 'Lançar saldo de caixa inicial', categoria: 'financeiro', prioridade: 'alta', checklist: [] },
  { titulo: 'Lançar contas a pagar em aberto', categoria: 'financeiro', prioridade: 'media', checklist: [] },
  { titulo: 'Lançar contas a receber em aberto', categoria: 'financeiro', prioridade: 'media', checklist: [] },
  { titulo: 'Conferir vendas do mês', categoria: 'vendas', prioridade: 'media', checklist: [] },
  { titulo: 'Validar integração VHSYS da unidade', categoria: 'vhsys', prioridade: 'baixa', checklist: ['Credenciais configuradas', 'Sincronização rodou sem erro'] },
]

const EMPTY = {
  unidade: '' as Unidade | '', titulo: '', descricao: '', status: 'pendente' as StatusTarefa, prioridade: 'media' as PrioridadeTarefa,
  categoria: 'outros', responsavel: '', prazo: '', checklist: [] as ItemChecklist[], bloqueada: false, motivo_bloqueio: '',
}

const hoje = () => new Date().toLocaleDateString('sv-SE') // AAAA-MM-DD no fuso local
const diasPara = (prazo: string) => Math.round((new Date(prazo + 'T00:00:00').getTime() - new Date(hoje() + 'T00:00:00').getTime()) / 864e5)
const fmtData = (d: string) => d.split('-').reverse().join('/')

// todas=true (rota /time): admin vê e edita as atividades de todas as unidades.
export default function KanbanTarefas({ todas = false }: { todas?: boolean }) {
  const { profile, unidadeAtiva } = useAuth()
  const verTodas = todas && profile?.role === 'admin'
  const isAdmin = profile?.role === 'admin'
  const [fUnidade, setFUnidade] = useState('')
  const [rows, setRows] = useState<Tarefa[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [novoItem, setNovoItem] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [sobre, setSobre] = useState<StatusTarefa | null>(null)
  const [busca, setBusca] = useState('')
  const [fPrioridade, setFPrioridade] = useState('')
  const [fCategoria, setFCategoria] = useState('')
  const [fResp, setFResp] = useState('')
  const [fSo, setFSo] = useState<'' | 'atrasadas' | 'bloqueadas'>('')
  const sb = createClient()
  const somenteLeitura = profile?.role === 'diretoria'

  useEffect(() => { if (unidadeAtiva) load() }, [unidadeAtiva, verTodas]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    let q = sb.from('btx_tarefas').select('*').order('ordem')
    if (!verTodas) q = q.eq('unidade', unidadeAtiva!)
    const { data } = await q
    setRows((data ?? []) as Tarefa[])
    setLoading(false)
  }

  const atrasada = (t: Tarefa) => !!t.prazo && t.status !== 'concluido' && diasPara(t.prazo) < 0
  const responsaveis = useMemo(() => [...new Set(rows.map(r => r.responsavel).filter(Boolean))] as string[], [rows])

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return rows.filter(t =>
      (!q || t.titulo.toLowerCase().includes(q) || (t.descricao ?? '').toLowerCase().includes(q)) &&
      (!fPrioridade || t.prioridade === fPrioridade) &&
      (!fCategoria || t.categoria === fCategoria) &&
      (!fResp || t.responsavel === fResp) &&
      (!fUnidade || t.unidade === fUnidade) &&
      (fSo !== 'atrasadas' || atrasada(t)) &&
      (fSo !== 'bloqueadas' || t.bloqueada))
  }, [rows, busca, fPrioridade, fCategoria, fResp, fUnidade, fSo]) // eslint-disable-line react-hooks/exhaustive-deps

  const contagem = {
    total: rows.length,
    atrasadas: rows.filter(atrasada).length,
    bloqueadas: rows.filter(t => t.bloqueada && t.status !== 'concluido').length,
  }
  const pctConcluido = rows.length ? Math.round(rows.filter(t => t.status === 'concluido').length / rows.length * 100) : 0

  function openNew(status: StatusTarefa = 'pendente') {
    setForm({ ...EMPTY, status, unidade: unidadeAtiva ?? '' }); setNovoItem(''); setEditId(null); setErr(''); setModal(true)
  }
  function openEdit(t: Tarefa) {
    setForm({
      unidade: t.unidade, titulo: t.titulo, descricao: t.descricao ?? '', status: t.status, prioridade: t.prioridade, categoria: t.categoria,
      responsavel: t.responsavel ?? '', prazo: t.prazo ?? '', checklist: t.checklist ?? [], bloqueada: t.bloqueada, motivo_bloqueio: t.motivo_bloqueio ?? '',
    })
    setNovoItem(''); setEditId(t.id); setErr(''); setModal(true)
  }

  function proximaOrdem(status: StatusTarefa) {
    return Math.max(0, ...rows.filter(r => r.status === status).map(r => r.ordem)) + 1
  }

  async function save() {
    if (!form.titulo.trim()) return setErr('Título é obrigatório.')
    const unidade = verTodas ? form.unidade : unidadeAtiva
    if (!unidade) return setErr('Selecione a unidade.')
    setSaving(true)
    const atual = rows.find(r => r.id === editId)
    const mudouStatus = !atual || atual.status !== form.status
    const payload = {
      titulo: form.titulo.trim(), descricao: form.descricao.trim() || null, status: form.status, prioridade: form.prioridade,
      categoria: form.categoria, responsavel: form.responsavel.trim() || null, prazo: form.prazo || null,
      checklist: form.checklist, bloqueada: form.bloqueada, motivo_bloqueio: form.bloqueada ? form.motivo_bloqueio.trim() || null : null,
      concluida_em: form.status === 'concluido' ? (atual?.concluida_em ?? new Date().toISOString()) : null,
      ...(form.status !== 'concluido' ? { confirmada_em: null, confirmada_por: null } : {}),
      updated_at: new Date().toISOString(),
      ...(mudouStatus ? { ordem: proximaOrdem(form.status) } : {}),
    }
    const { error } = editId
      ? await sb.from('btx_tarefas').update(payload).eq('id', editId)
      : await sb.from('btx_tarefas').insert({ ...payload, unidade, criado_por: profile?.nome ?? null })
    setSaving(false)
    if (error) return setErr('Erro ao salvar: ' + error.message)
    setModal(false); load()
  }

  async function remove(id: string) {
    setSaving(true)
    await sb.from('btx_tarefas').delete().eq('id', id)
    setSaving(false); setConfirm(null); load()
  }

  // Move para outra coluna (ou reordena) — posição = antes de `antesDe`, ou fim da coluna.
  async function mover(id: string, status: StatusTarefa, antesDe?: string) {
    const t = rows.find(r => r.id === id)
    if (!t || somenteLeitura) return
    if (t.status === status && antesDe === undefined) return
    const col = rows.filter(r => r.status === status && r.id !== id).sort((a, b) => a.ordem - b.ordem)
    const idx = antesDe ? col.findIndex(r => r.id === antesDe) : -1
    let ordem: number
    if (idx < 0) ordem = (col.at(-1)?.ordem ?? 0) + 1
    else ordem = ((col[idx - 1]?.ordem ?? col[idx].ordem - 2) + col[idx].ordem) / 2
    const patch = {
      status, ordem,
      concluida_em: status === 'concluido' ? (t.concluida_em ?? new Date().toISOString()) : null,
      ...(status !== 'concluido' ? { confirmada_em: null, confirmada_por: null } : {}),
      updated_at: new Date().toISOString(),
    }
    const anterior = rows
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))        // otimista
    const { error } = await sb.from('btx_tarefas').update(patch).eq('id', id)
    if (error) { setRows(anterior); alert('Não foi possível mover: ' + error.message) }
  }

  // Admin confirma (ou desfaz a confirmação) de uma atividade concluída pela unidade.
  async function confirmar(t: Tarefa) {
    if (!isAdmin) return
    const patch = t.confirmada_em
      ? { confirmada_em: null, confirmada_por: null }
      : { confirmada_em: new Date().toISOString(), confirmada_por: profile?.nome ?? null }
    setRows(rs => rs.map(r => r.id === t.id ? { ...r, ...patch } : r))
    await sb.from('btx_tarefas').update(patch).eq('id', t.id)
  }

  async function alternarItem(t: Tarefa, i: number) {
    if (somenteLeitura) return
    const checklist = t.checklist.map((c, k) => k === i ? { ...c, feito: !c.feito } : c)
    setRows(rs => rs.map(r => r.id === t.id ? { ...r, checklist } : r))
    await sb.from('btx_tarefas').update({ checklist, updated_at: new Date().toISOString() }).eq('id', t.id)
  }

  async function carregarPadrao() {
    if (!unidadeAtiva) return
    setSaving(true)
    const base = proximaOrdem('pendente')
    const { error } = await sb.from('btx_tarefas').insert(PADRAO.map((p, i) => ({
      unidade: unidadeAtiva, titulo: p.titulo, categoria: p.categoria, prioridade: p.prioridade,
      checklist: p.checklist.map(texto => ({ texto, feito: false })), ordem: base + i, criado_por: profile?.nome ?? null,
    })))
    setSaving(false)
    if (error) alert('Erro: ' + error.message)
    load()
  }

  function addItem() {
    const texto = novoItem.trim()
    if (!texto) return
    setForm(f => ({ ...f, checklist: [...f.checklist, { texto, feito: false }] }))
    setNovoItem('')
  }

  const filtrosAtivos = !!(busca || fPrioridade || fCategoria || fResp || fUnidade || fSo)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{verTodas ? 'Atividades do time' : 'Atividades'}</h1>
          <div className="page-subtitle">{verTodas ? 'Todas as unidades' : `Kanban de pendências da unidade${unidadeAtiva ? ` · ${unidadeAtiva}` : ''}`}</div>
        </div>
        {!somenteLeitura && (
          <div style={{ display: 'flex', gap: 8 }}>
            {rows.length === 0 && !loading && (
              <button className="btn btn-secondary" onClick={carregarPadrao} disabled={saving}>Carregar checklist de implantação</button>
            )}
            <button className="btn btn-primary" onClick={() => openNew()}>+ Nova atividade</button>
          </div>
        )}
      </div>

      {/* Resumo */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <span className="badge badge-gray">{contagem.total} atividades</span>
        <button className={`badge ${contagem.atrasadas ? 'badge-red' : 'badge-gray'}`} style={{ border: 0, cursor: 'pointer' }}
          onClick={() => setFSo(fSo === 'atrasadas' ? '' : 'atrasadas')}>{contagem.atrasadas} atrasadas</button>
        <button className={`badge ${contagem.bloqueadas ? 'badge-amber' : 'badge-gray'}`} style={{ border: 0, cursor: 'pointer' }}
          onClick={() => setFSo(fSo === 'bloqueadas' ? '' : 'bloqueadas')}>{contagem.bloqueadas} bloqueadas</button>
        <div style={{ flex: 1, minWidth: 160, maxWidth: 320, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${pctConcluido}%`, height: '100%', background: 'var(--green)' }} />
          </div>
          <span className="text-muted">{pctConcluido}% concluído</span>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <input className="form-input" style={{ maxWidth: 240 }} placeholder="Buscar atividade..." value={busca} onChange={e => setBusca(e.target.value)} />
        {verTodas && (
          <select className="form-select" style={{ maxWidth: 200 }} value={fUnidade} onChange={e => setFUnidade(e.target.value)}>
            <option value="">Todas as unidades</option>
            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        )}
        <select className="form-select" style={{ maxWidth: 160 }} value={fPrioridade} onChange={e => setFPrioridade(e.target.value)}>
          <option value="">Toda prioridade</option>
          {PRIORIDADES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <select className="form-select" style={{ maxWidth: 160 }} value={fCategoria} onChange={e => setFCategoria(e.target.value)}>
          <option value="">Toda categoria</option>
          {CATEGORIAS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
        </select>
        <select className="form-select" style={{ maxWidth: 180 }} value={fResp} onChange={e => setFResp(e.target.value)}>
          <option value="">Todo responsável</option>
          {responsaveis.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        {filtrosAtivos && (
          <button className="btn btn-secondary btn-sm" onClick={() => { setBusca(''); setFPrioridade(''); setFCategoria(''); setFResp(''); setFUnidade(''); setFSo('') }}>Limpar filtros</button>
        )}
      </div>

      {/* Quadro */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(260px, 1fr))', gap: 16, alignItems: 'start', overflowX: 'auto' }}>
        {COLUNAS.map(col => {
          const cards = filtradas.filter(t => t.status === col.id).sort((a, b) => a.ordem - b.ordem)
          return (
            <section key={col.id}
              onDragOver={e => { if (arrastando) { e.preventDefault(); setSobre(col.id) } }}
              onDragLeave={() => setSobre(s => s === col.id ? null : s)}
              onDrop={e => { e.preventDefault(); if (arrastando) mover(arrastando, col.id); setArrastando(null); setSobre(null) }}
              style={{
                background: sobre === col.id ? 'var(--brand-light)' : 'rgba(0,0,0,0.03)', border: '1px solid var(--border)',
                borderTop: `3px solid ${col.cor}`, borderRadius: 10, padding: 12, minHeight: 200,
              }}>
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <strong style={{ fontSize: 13, color: 'var(--navy)' }}>{col.titulo} <span className="text-muted">({cards.length})</span></strong>
                {!somenteLeitura && <button className="btn btn-secondary btn-sm" onClick={() => openNew(col.id)} title="Nova atividade nesta coluna">+</button>}
              </header>
              {loading ? <div className="empty-state">Carregando...</div>
              : cards.length === 0 ? <div className="empty-state" style={{ padding: 24 }}>Nenhuma atividade.</div>
              : cards.map(t => {
                const prio = PRIORIDADES.find(p => p.id === t.prioridade)!
                const feitos = t.checklist.filter(c => c.feito).length
                const dias = t.prazo ? diasPara(t.prazo) : null
                const corPrazo = t.status === 'concluido' ? 'var(--text-muted)' : dias !== null && dias < 0 ? 'var(--red)' : dias !== null && dias <= 2 ? 'var(--amber)' : 'var(--text-muted)'
                const idx = COLUNAS.findIndex(c => c.id === t.status)
                return (
                  <article key={t.id} className="card"
                    draggable={!somenteLeitura}
                    onDragStart={e => { setArrastando(t.id); e.dataTransfer.effectAllowed = 'move' }}
                    onDragEnd={() => { setArrastando(null); setSobre(null) }}
                    onDragOver={e => { if (arrastando && arrastando !== t.id) e.preventDefault() }}
                    onDrop={e => { e.preventDefault(); e.stopPropagation(); if (arrastando && arrastando !== t.id) mover(arrastando, col.id, t.id); setArrastando(null); setSobre(null) }}
                    style={{
                      padding: 12, marginBottom: 10, cursor: somenteLeitura ? 'default' : 'grab', opacity: arrastando === t.id ? 0.4 : 1,
                      borderLeft: `4px solid ${t.bloqueada ? 'var(--amber)' : atrasada(t) ? 'var(--red)' : 'transparent'}`,
                    }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                      {verTodas && <span className="badge badge-green">{t.unidade.replace('NEW BLUETEX ', '')}</span>}
                      <span className={`badge ${prio.badge}`}>{prio.label}</span>
                      <span className="badge badge-gray">{catLabel(t.categoria)}</span>
                      {t.bloqueada && <span className="badge badge-amber">Bloqueada</span>}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 14, cursor: 'pointer', textDecoration: t.status === 'concluido' ? 'line-through' : 'none' }}
                      onClick={() => !somenteLeitura && openEdit(t)}>{t.titulo}</div>
                    {t.descricao && <div className="text-muted" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{t.descricao.length > 120 ? t.descricao.slice(0, 120) + '…' : t.descricao}</div>}
                    {t.bloqueada && t.motivo_bloqueio && <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 4 }}>⚠ {t.motivo_bloqueio}</div>}

                    {t.checklist.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
                          <div style={{ width: `${feitos / t.checklist.length * 100}%`, height: '100%', background: 'var(--green)' }} />
                        </div>
                        <div className="text-muted" style={{ fontSize: 11, marginBottom: 2 }}>{feitos}/{t.checklist.length} itens</div>
                        {t.checklist.map((c, i) => (
                          <label key={i} style={{ display: 'flex', gap: 6, fontSize: 12, alignItems: 'center', cursor: somenteLeitura ? 'default' : 'pointer' }}>
                            <input type="checkbox" checked={c.feito} disabled={somenteLeitura} onChange={() => alternarItem(t, i)} />
                            <span style={{ textDecoration: c.feito ? 'line-through' : 'none', color: c.feito ? 'var(--text-muted)' : 'inherit' }}>{c.texto}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {t.status === 'concluido' && (
                      <div style={{ marginTop: 8, fontSize: 12 }}>
                        {t.confirmada_em
                          ? <span className="badge badge-green">✓ Confirmada{t.confirmada_por ? ` por ${t.confirmada_por}` : ''} em {fmtData(t.confirmada_em.slice(0, 10))}</span>
                          : <span className="badge badge-amber">Aguardando confirmação</span>}
                        {isAdmin && (
                          <button className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={() => confirmar(t)}>
                            {t.confirmada_em ? 'Desfazer' : '✓ Confirmar'}
                          </button>
                        )}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 6 }}>
                      <div style={{ fontSize: 12, color: corPrazo }}>
                        {t.prazo ? `📅 ${fmtData(t.prazo)}${t.status !== 'concluido' && dias !== null ? (dias < 0 ? ` (${-dias}d atrasada)` : dias === 0 ? ' (hoje)' : ` (${dias}d)`) : ''}` : ''}
                        {t.responsavel && <span className="text-muted" style={{ marginLeft: t.prazo ? 8 : 0 }}>👤 {t.responsavel}</span>}
                      </div>
                      {!somenteLeitura && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-secondary btn-sm" disabled={idx === 0} onClick={() => mover(t.id, COLUNAS[idx - 1].id)} title="Mover para a esquerda" aria-label="Mover para a esquerda">←</button>
                          <button className="btn btn-secondary btn-sm" disabled={idx === COLUNAS.length - 1} onClick={() => mover(t.id, COLUNAS[idx + 1].id)} title="Mover para a direita" aria-label="Mover para a direita">→</button>
                          <button className="btn btn-danger btn-sm" onClick={() => setConfirm(t.id)} title="Excluir" aria-label="Excluir">×</button>
                        </div>
                      )}
                    </div>
                  </article>
                )
              })}
            </section>
          )
        })}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} size="lg" title={editId ? 'Editar atividade' : 'Nova atividade'}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </>}
      >
        {err && <div className="alert alert-red">{err}</div>}
        {verTodas && (
          <div className="form-group">
            <label className="form-label">Unidade *</label>
            <select className="form-select" value={form.unidade} onChange={e => setForm(f => ({ ...f, unidade: e.target.value as Unidade }))}>
              <option value="">Selecione...</option>
              {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Título *</label>
          <input className="form-input" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">Descrição</label>
          <textarea className="form-input" rows={3} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
        </div>
        <div className="grid-3">
          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-select" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as StatusTarefa }))}>
              {COLUNAS.map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Prioridade</label>
            <select className="form-select" value={form.prioridade} onChange={e => setForm(f => ({ ...f, prioridade: e.target.value as PrioridadeTarefa }))}>
              {PRIORIDADES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Categoria</label>
            <select className="form-select" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
              {CATEGORIAS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
            </select>
          </div>
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Responsável</label>
            <input className="form-input" list="resp-sugestoes" value={form.responsavel} onChange={e => setForm(f => ({ ...f, responsavel: e.target.value }))} />
            <datalist id="resp-sugestoes">{responsaveis.map(r => <option key={r} value={r} />)}</datalist>
          </div>
          <div className="form-group">
            <label className="form-label">Prazo</label>
            <input type="date" className="form-input" value={form.prazo} onChange={e => setForm(f => ({ ...f, prazo: e.target.value }))} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Checklist</label>
          {form.checklist.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={c.feito} onChange={() => setForm(f => ({ ...f, checklist: f.checklist.map((x, k) => k === i ? { ...x, feito: !x.feito } : x) }))} />
              <input className="form-input" style={{ flex: 1 }} value={c.texto}
                onChange={e => setForm(f => ({ ...f, checklist: f.checklist.map((x, k) => k === i ? { ...x, texto: e.target.value } : x) }))} />
              <button type="button" className="btn btn-danger btn-sm" aria-label="Remover item"
                onClick={() => setForm(f => ({ ...f, checklist: f.checklist.filter((_, k) => k !== i) }))}>×</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="form-input" style={{ flex: 1 }} placeholder="Novo item (Enter para adicionar)" value={novoItem}
              onChange={e => setNovoItem(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }} />
            <button type="button" className="btn btn-secondary" onClick={addItem}>Adicionar</button>
          </div>
        </div>

        <div className="form-group">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={form.bloqueada} onChange={e => setForm(f => ({ ...f, bloqueada: e.target.checked }))} />
            Atividade bloqueada (aguardando algo)
          </label>
          {form.bloqueada && (
            <input className="form-input" placeholder="Motivo do bloqueio" value={form.motivo_bloqueio} onChange={e => setForm(f => ({ ...f, motivo_bloqueio: e.target.value }))} />
          )}
        </div>
      </Modal>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm && remove(confirm)} loading={saving}
        title="Excluir atividade" message="A atividade e o checklist serão apagados. Esta ação não pode ser desfeita." />
    </div>
  )
}
