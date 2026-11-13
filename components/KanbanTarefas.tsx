'use client'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import { UNIDADES } from '@/types'
import type { ItemChecklist, PrioridadeTarefa, StatusTarefa, Tarefa, Unidade } from '@/types'

// Paleta estilo Monday: célula inteira colorida, texto branco.
const COLUNAS: { id: StatusTarefa; titulo: string; cor: string }[] = [
  { id: 'pendente', titulo: 'Não iniciado', cor: '#797E93' },
  { id: 'andamento', titulo: 'Em andamento', cor: '#E08A00' },
  { id: 'concluido', titulo: 'Concluído', cor: '#00A35C' },
]
const COR_BLOQUEADA = '#D83A52'
const PRIORIDADES: { id: PrioridadeTarefa; label: string; cor: string }[] = [
  { id: 'urgente', label: 'Urgente', cor: '#333333' },
  { id: 'alta', label: 'Alta', cor: '#401694' },
  { id: 'media', label: 'Média', cor: '#5559DF' },
  { id: 'baixa', label: 'Baixa', cor: '#3B82C4' },
]
const CATEGORIAS = [
  ['cadastro', 'Cadastros'], ['estoque', 'Estoque'], ['financeiro', 'Financeiro'],
  ['vendas', 'Vendas'], ['vhsys', 'VHSYS'], ['outros', 'Outros'],
] as const
const catLabel = (c: string) => CATEGORIAS.find(x => x[0] === c)?.[1] ?? c

const AVATAR_CORES = ['#E2445C', '#00A35C', '#5559DF', '#E08A00', '#0086C0', '#A25DDC', '#037F4C', '#BB3354']
function Avatar({ nome, size = 28 }: { nome: string | null; size?: number }) {
  if (!nome) return <span title="Sem responsável" style={{ width: size, height: size, borderRadius: '50%', border: '1.5px dashed var(--border)', display: 'inline-block', flexShrink: 0 }} />
  const ini = nome.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()
  const cor = AVATAR_CORES[[...nome].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_CORES.length]
  return (
    <span title={nome} style={{
      width: size, height: size, borderRadius: '50%', background: cor, color: '#fff', fontSize: size * 0.4, fontWeight: 700,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>{ini}</span>
  )
}

// Pílula colorida; vira <select> nativo invisível por cima quando editável.
function Pilula({ cor, label, opcoes, valor, onChange, disabled }: {
  cor: string; label: string; opcoes: { id: string; label: string }[]; valor: string; onChange: (v: string) => void; disabled?: boolean
}) {
  return (
    <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', background: cor, color: '#fff', fontWeight: 600, fontSize: 12, height: '100%', minHeight: 38, padding: '0 6px', textAlign: 'center' }}>
      {label}
      {!disabled && (
        <select aria-label={label} value={valor} onChange={e => onChange(e.target.value)}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}>
          {opcoes.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      )}
    </span>
  )
}

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
  categoria: 'outros', responsavel: '', prazo: '', checklist: [] as ItemChecklist[], bloqueada: false, motivo_bloqueio: '', sigilosa: false,
}

const hoje = () => new Date().toLocaleDateString('sv-SE') // AAAA-MM-DD no fuso local
const diasPara = (prazo: string) => Math.round((new Date(prazo + 'T00:00:00').getTime() - new Date(hoje() + 'T00:00:00').getTime()) / 864e5)
const fmtData = (d: string) => d.split('-').reverse().join('/')
const curtaUnidade = (u: string) => u.replace('NEW BLUETEX ', '')
const atrasada = (t: Tarefa) => !!t.prazo && t.status !== 'concluido' && diasPara(t.prazo) < 0

function Prazo({ t }: { t: Tarefa }) {
  if (!t.prazo) return <span className="text-muted">—</span>
  const dias = diasPara(t.prazo)
  const fim = t.status === 'concluido'
  const cor = fim ? 'var(--text-muted)' : dias < 0 ? 'var(--red)' : dias <= 2 ? 'var(--amber)' : 'var(--text-mid)'
  return (
    <span style={{ fontSize: 12, color: cor, fontWeight: !fim && dias <= 2 ? 600 : 400, whiteSpace: 'nowrap' }}>
      {fmtData(t.prazo).slice(0, 5)}{!fim && (dias < 0 ? ` · ${-dias}d atraso` : dias === 0 ? ' · hoje' : '')}
    </span>
  )
}

function Progresso({ t }: { t: Tarefa }) {
  const n = t.checklist.length
  // ponytail: sem checklist, "em andamento" conta 50% — heurística visual simples.
  const pct = t.status === 'concluido' ? 100 : n ? Math.round(t.checklist.filter(c => c.feito).length / n * 100) : t.status === 'andamento' ? 50 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
      <div style={{ flex: 1, height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#00A35C' : '#5559DF', transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 30, textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

function SelosTarefa({ t }: { t: Tarefa }) {
  return (
    <>
      {t.sigilosa && <span className="badge" style={{ background: '#2E2E4A', color: '#fff', flexShrink: 0 }} title="Visível só para a gestão">🔒 Sigilosa</span>}
      {t.status === 'concluido' && (t.confirmada_em
        ? <span className="badge badge-green" style={{ flexShrink: 0 }} title={t.confirmada_por ? `Confirmada por ${t.confirmada_por}` : undefined}>✓ Confirmada</span>
        : <span className="badge badge-amber" style={{ flexShrink: 0 }}>Aguardando confirmação</span>)}
    </>
  )
}

const VISAO_KEY = 'btx_tarefas_visao'

// todas=true (rota /time): admin vê e edita as atividades de todas as unidades.
export default function KanbanTarefas({ todas = false }: { todas?: boolean }) {
  const { profile, unidadeAtiva } = useAuth()
  const verTodas = todas && profile?.role === 'admin'
  const isAdmin = profile?.role === 'admin'
  const [visao, setVisao] = useState<'tabela' | 'quadro'>('tabela')
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set())
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
  const [fSo, setFSo] = useState<'' | 'atrasadas' | 'bloqueadas' | 'sigilosas'>('')
  const sb = createClient()
  const somenteLeitura = profile?.role === 'diretoria'

  useEffect(() => { try { const v = localStorage.getItem(VISAO_KEY); if (v === 'quadro' || v === 'tabela') setVisao(v) } catch {} }, [])
  function trocarVisao(v: 'tabela' | 'quadro') { setVisao(v); try { localStorage.setItem(VISAO_KEY, v) } catch {} }

  useEffect(() => { if (unidadeAtiva) load() }, [unidadeAtiva, verTodas]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    let q = sb.from('btx_tarefas').select('*').order('ordem')
    if (!verTodas) q = q.eq('unidade', unidadeAtiva!)
    const { data } = await q
    // A RLS já esconde as sigilosas de quem não é admin; este filtro é só redundância.
    setRows(((data ?? []) as Tarefa[]).filter(t => isAdmin || !t.sigilosa))
    setLoading(false)
  }

  const responsaveis = useMemo(() => [...new Set(rows.map(r => r.responsavel).filter(Boolean))] as string[], [rows])

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return rows.filter(t =>
      (!q || t.titulo.toLowerCase().includes(q) || (t.descricao ?? '').toLowerCase().includes(q) || (t.responsavel ?? '').toLowerCase().includes(q)) &&
      (!fPrioridade || t.prioridade === fPrioridade) &&
      (!fCategoria || t.categoria === fCategoria) &&
      (!fResp || t.responsavel === fResp) &&
      (!fUnidade || t.unidade === fUnidade) &&
      (fSo !== 'atrasadas' || atrasada(t)) &&
      (fSo !== 'bloqueadas' || t.bloqueada) &&
      (fSo !== 'sigilosas' || t.sigilosa))
  }, [rows, busca, fPrioridade, fCategoria, fResp, fUnidade, fSo])

  const contagem = {
    total: rows.length,
    concluidas: rows.filter(t => t.status === 'concluido').length,
    andamento: rows.filter(t => t.status === 'andamento').length,
    atrasadas: rows.filter(atrasada).length,
    bloqueadas: rows.filter(t => t.bloqueada && t.status !== 'concluido').length,
    sigilosas: rows.filter(t => t.sigilosa).length,
  }
  const pctConcluido = rows.length ? Math.round(contagem.concluidas / rows.length * 100) : 0

  // Andamento por unidade (painel do gestor na rota /time).
  const porUnidade = useMemo(() => UNIDADES.map(u => {
    const ts = rows.filter(t => t.unidade === u)
    return { u, total: ts.length, feitas: ts.filter(t => t.status === 'concluido').length, andamento: ts.filter(t => t.status === 'andamento').length, atrasadas: ts.filter(atrasada).length }
  }).filter(x => x.total > 0), [rows])

  function openNew(status: StatusTarefa = 'pendente') {
    setForm({ ...EMPTY, status, unidade: (fUnidade as Unidade) || unidadeAtiva || '' }); setNovoItem(''); setEditId(null); setErr(''); setModal(true)
  }
  function openEdit(t: Tarefa) {
    if (somenteLeitura) return
    setForm({
      unidade: t.unidade, titulo: t.titulo, descricao: t.descricao ?? '', status: t.status, prioridade: t.prioridade, categoria: t.categoria,
      responsavel: t.responsavel ?? '', prazo: t.prazo ?? '', checklist: t.checklist ?? [], bloqueada: t.bloqueada, motivo_bloqueio: t.motivo_bloqueio ?? '',
      sigilosa: !!t.sigilosa,
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
      ...(isAdmin ? { sigilosa: form.sigilosa } : {}), // só o gestor decide o sigilo
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
    setSaving(false); setConfirm(null); setModal(false); load()
  }

  // Atualização rápida (status/prioridade/checklist/confirmação), otimista com rollback.
  async function patchRapido(t: Tarefa, patch: Partial<Tarefa>) {
    if (somenteLeitura) return
    const anterior = rows
    setRows(rs => rs.map(r => r.id === t.id ? { ...r, ...patch } : r))
    const { error } = await sb.from('btx_tarefas').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', t.id)
    if (error) { setRows(anterior); alert('Não foi possível salvar: ' + error.message) }
  }

  // Move para outra coluna (ou reordena) — posição = antes de `antesDe`, ou fim da coluna.
  function mover(id: string, status: StatusTarefa, antesDe?: string) {
    const t = rows.find(r => r.id === id)
    if (!t || somenteLeitura) return
    if (t.status === status && antesDe === undefined) return
    const col = rows.filter(r => r.status === status && r.id !== id).sort((a, b) => a.ordem - b.ordem)
    const idx = antesDe ? col.findIndex(r => r.id === antesDe) : -1
    const ordem = idx < 0 ? (col.at(-1)?.ordem ?? 0) + 1 : ((col[idx - 1]?.ordem ?? col[idx].ordem - 2) + col[idx].ordem) / 2
    patchRapido(t, {
      status, ordem,
      concluida_em: status === 'concluido' ? (t.concluida_em ?? new Date().toISOString()) : null,
      ...(status !== 'concluido' ? { confirmada_em: null, confirmada_por: null } : {}),
    })
  }

  // Admin confirma (ou desfaz a confirmação) de uma atividade concluída pela unidade.
  function confirmar(t: Tarefa) {
    if (!isAdmin) return
    patchRapido(t, t.confirmada_em
      ? { confirmada_em: null, confirmada_por: null }
      : { confirmada_em: new Date().toISOString(), confirmada_por: profile?.nome ?? null })
  }

  function alternarItem(t: Tarefa, i: number) {
    patchRapido(t, { checklist: t.checklist.map((c, k) => k === i ? { ...c, feito: !c.feito } : c) })
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

  function alternarGrupo(id: string) {
    setRecolhidos(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  const filtrosAtivos = !!(busca || fPrioridade || fCategoria || fResp || fUnidade || fSo)
  const statusInfo = (t: Tarefa) => {
    if (t.bloqueada && t.status !== 'concluido') return { cor: COR_BLOQUEADA, label: 'Bloqueada' }
    const c = COLUNAS.find(c => c.id === t.status)!
    return { cor: c.cor, label: c.titulo }
  }

  const dragProps = (t: Tarefa) => ({
    draggable: !somenteLeitura,
    onDragStart: (e: React.DragEvent) => { setArrastando(t.id); e.dataTransfer.effectAllowed = 'move' },
    onDragEnd: () => { setArrastando(null); setSobre(null) },
  })
  const dropProps = (status: StatusTarefa) => ({
    onDragOver: (e: React.DragEvent) => { if (arrastando) { e.preventDefault(); setSobre(status) } },
    onDragLeave: () => setSobre(s => s === status ? null : s),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); if (arrastando) mover(arrastando, status); setArrastando(null); setSobre(null) },
  })

  // Colunas da tabela (estilo Monday)
  const gridCols = `6px minmax(260px, 1fr) ${verTodas ? '110px ' : ''}64px 130px 110px 120px 130px`
  const celula: React.CSSProperties = { borderLeft: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 38 }

  const kpis = [
    { label: 'Total', valor: contagem.total, cor: 'var(--navy)', filtro: '' as const },
    { label: 'Em andamento', valor: contagem.andamento, cor: '#E08A00', filtro: null },
    { label: 'Concluídas', valor: `${contagem.concluidas} · ${pctConcluido}%`, cor: '#00A35C', filtro: null },
    { label: 'Atrasadas', valor: contagem.atrasadas, cor: contagem.atrasadas ? 'var(--red)' : 'var(--text-muted)', filtro: 'atrasadas' as const },
    { label: 'Bloqueadas', valor: contagem.bloqueadas, cor: contagem.bloqueadas ? COR_BLOQUEADA : 'var(--text-muted)', filtro: 'bloqueadas' as const },
    ...(isAdmin ? [{ label: '🔒 Sigilosas', valor: contagem.sigilosas, cor: '#2E2E4A', filtro: 'sigilosas' as const }] : []),
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{verTodas ? 'Atividades do time' : 'Atividades'}</h1>
          <div className="page-subtitle">{verTodas ? 'Todas as unidades · acompanhe o andamento do que foi delegado' : `Painel de tarefas da unidade${unidadeAtiva ? ` · ${unidadeAtiva}` : ''}`}</div>
        </div>
        {!somenteLeitura && (
          <div style={{ display: 'flex', gap: 8 }}>
            {rows.length === 0 && !loading && !verTodas && (
              <button className="btn btn-secondary" onClick={carregarPadrao} disabled={saving}>Carregar checklist de implantação</button>
            )}
            <button className="btn btn-primary" onClick={() => openNew()}>+ Nova atividade</button>
          </div>
        )}
      </div>

      {/* Resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        {kpis.map(k => (
          <button key={k.label} type="button" className="card" disabled={k.filtro === null}
            onClick={() => k.filtro !== null && setFSo(fSo === k.filtro ? '' : k.filtro)}
            style={{ padding: '10px 14px', textAlign: 'left', cursor: k.filtro === null ? 'default' : 'pointer', outline: k.filtro && fSo === k.filtro ? `2px solid ${k.cor}` : 'none', color: 'inherit', font: 'inherit' }}>
            <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: k.cor }}>{k.valor}</div>
          </button>
        ))}
      </div>

      {/* Andamento por unidade */}
      {verTodas && porUnidade.length > 0 && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 10 }}>Andamento por unidade</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {porUnidade.map(p => (
              <button key={p.u} type="button" onClick={() => setFUnidade(fUnidade === p.u ? '' : p.u)}
                style={{ textAlign: 'left', background: fUnidade === p.u ? 'var(--brand-light)' : 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: 10, cursor: 'pointer', color: 'inherit', font: 'inherit' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600 }}>
                  <span>{curtaUnidade(p.u)}</span><span>{Math.round(p.feitas / p.total * 100)}%</span>
                </div>
                {/* barra segmentada: concluído / andamento / restante */}
                <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--surface2)', margin: '6px 0' }}>
                  <div style={{ width: `${p.feitas / p.total * 100}%`, background: '#00A35C' }} />
                  <div style={{ width: `${p.andamento / p.total * 100}%`, background: '#E08A00' }} />
                </div>
                <div className="text-muted" style={{ fontSize: 11 }}>
                  {p.feitas}/{p.total} concluídas{p.atrasadas > 0 && <span style={{ color: 'var(--red)', fontWeight: 600 }}> · {p.atrasadas} atrasada{p.atrasadas > 1 ? 's' : ''}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Barra de ferramentas */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <div role="tablist" style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {(['tabela', 'quadro'] as const).map(v => (
            <button key={v} role="tab" aria-selected={visao === v} onClick={() => trocarVisao(v)}
              style={{ padding: '7px 14px', border: 0, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: visao === v ? 'var(--brand)' : 'var(--surface)', color: visao === v ? '#fff' : 'var(--text-mid)' }}>
              {v === 'tabela' ? '☰ Tabela' : '▦ Quadro'}
            </button>
          ))}
        </div>
        <input className="form-input" style={{ maxWidth: 240 }} placeholder="Buscar atividade ou pessoa..." value={busca} onChange={e => setBusca(e.target.value)} />
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
        {/* Filtro por pessoa — avatares clicáveis */}
        {responsaveis.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {responsaveis.map(r => (
              <button key={r} type="button" onClick={() => setFResp(fResp === r ? '' : r)} title={`Filtrar: ${r}`} aria-pressed={fResp === r}
                style={{ border: 0, background: 'none', padding: 1, borderRadius: '50%', cursor: 'pointer', outline: fResp === r ? '2px solid var(--brand)' : 'none', opacity: fResp && fResp !== r ? 0.4 : 1 }}>
                <Avatar nome={r} size={26} />
              </button>
            ))}
          </div>
        )}
        {filtrosAtivos && (
          <button className="btn btn-secondary btn-sm" onClick={() => { setBusca(''); setFPrioridade(''); setFCategoria(''); setFResp(''); setFUnidade(''); setFSo('') }}>Limpar filtros</button>
        )}
      </div>

      {loading ? <div className="empty-state">Carregando...</div> : visao === 'tabela' ? (
        /* ---------- Visão tabela (estilo Monday) ---------- */
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: verTodas ? 940 : 830 }}>
            {COLUNAS.map(col => {
              const itens = filtradas.filter(t => t.status === col.id).sort((a, b) => a.ordem - b.ordem)
              const fechado = recolhidos.has(col.id)
              return (
                <section key={col.id} style={{ marginBottom: 22 }} {...dropProps(col.id)}>
                  <button type="button" onClick={() => alternarGrupo(col.id)} aria-expanded={!fechado}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, border: 0, background: 'none', cursor: 'pointer', padding: '0 0 8px', color: col.cor, fontWeight: 700, fontSize: 15 }}>
                    <span style={{ display: 'inline-block', transform: fechado ? 'rotate(-90deg)' : 'none', transition: 'transform .15s' }}>▾</span>
                    {col.titulo}
                    <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 13 }}>{itens.length} {itens.length === 1 ? 'atividade' : 'atividades'}</span>
                  </button>
                  {!fechado && (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: sobre === col.id ? 'var(--brand-light)' : 'var(--surface)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: gridCols, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                        <span style={{ background: col.cor }} />
                        <span style={{ padding: '8px 12px' }}>Atividade</span>
                        {verTodas && <span style={celula}>Unidade</span>}
                        <span style={celula}>Resp.</span>
                        <span style={celula}>Status</span>
                        <span style={celula}>Prioridade</span>
                        <span style={celula}>Prazo</span>
                        <span style={celula}>Progresso</span>
                      </div>
                      {itens.map(t => {
                        const st = statusInfo(t)
                        const prio = PRIORIDADES.find(p => p.id === t.prioridade)!
                        return (
                          <div key={t.id} {...dragProps(t)}
                            style={{ display: 'grid', gridTemplateColumns: gridCols, borderTop: '1px solid var(--border)', opacity: arrastando === t.id ? 0.4 : 1, background: 'var(--surface)' }}>
                            <span style={{ background: col.cor, opacity: 0.85 }} />
                            <div style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, cursor: somenteLeitura ? 'default' : 'pointer' }} onClick={() => openEdit(t)}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14, textDecoration: t.status === 'concluido' ? 'line-through' : 'none', color: t.status === 'concluido' ? 'var(--text-muted)' : 'var(--text)' }}>{t.titulo}</span>
                              {t.checklist.length > 0 && <span className="text-muted" style={{ fontSize: 11, flexShrink: 0 }}>☑ {t.checklist.filter(c => c.feito).length}/{t.checklist.length}</span>}
                              <SelosTarefa t={t} />
                              {isAdmin && t.status === 'concluido' && (
                                <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto', flexShrink: 0 }} onClick={e => { e.stopPropagation(); confirmar(t) }}>
                                  {t.confirmada_em ? 'Desfazer' : '✓ Confirmar'}
                                </button>
                              )}
                            </div>
                            {verTodas && <span style={{ ...celula, fontSize: 12, fontWeight: 600, color: 'var(--text-mid)' }}>{curtaUnidade(t.unidade)}</span>}
                            <span style={celula}><Avatar nome={t.responsavel} /></span>
                            <span style={{ ...celula, display: 'block' }}>
                              <Pilula cor={st.cor} label={st.label} valor={t.status} disabled={somenteLeitura}
                                opcoes={COLUNAS.map(c => ({ id: c.id, label: c.titulo }))} onChange={v => mover(t.id, v as StatusTarefa)} />
                            </span>
                            <span style={{ ...celula, display: 'block' }}>
                              <Pilula cor={prio.cor} label={prio.label} valor={t.prioridade} disabled={somenteLeitura}
                                opcoes={PRIORIDADES} onChange={v => patchRapido(t, { prioridade: v as PrioridadeTarefa })} />
                            </span>
                            <span style={celula}><Prazo t={t} /></span>
                            <span style={{ ...celula, padding: '0 10px' }}><Progresso t={t} /></span>
                          </div>
                        )
                      })}
                      {!somenteLeitura && (
                        <button type="button" onClick={() => openNew(col.id)}
                          style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, borderTop: '1px solid var(--border)', background: 'transparent', padding: '9px 22px', fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer' }}>
                          + Adicionar atividade
                        </button>
                      )}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </div>
      ) : (
        /* ---------- Visão quadro (kanban) ---------- */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(270px, 1fr))', gap: 16, alignItems: 'start', overflowX: 'auto' }}>
          {COLUNAS.map(col => {
            const cards = filtradas.filter(t => t.status === col.id).sort((a, b) => a.ordem - b.ordem)
            return (
              <section key={col.id} {...dropProps(col.id)}
                style={{ background: sobre === col.id ? 'var(--brand-light)' : 'var(--surface2)', borderRadius: 10, minHeight: 200, overflow: 'hidden' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: col.cor, color: '#fff', padding: '10px 12px' }}>
                  <strong style={{ fontSize: 14 }}>{col.titulo} <span style={{ opacity: 0.85, fontWeight: 400 }}>· {cards.length}</span></strong>
                  {!somenteLeitura && <button onClick={() => openNew(col.id)} title="Nova atividade nesta coluna" aria-label="Nova atividade nesta coluna"
                    style={{ border: 0, background: 'rgba(255,255,255,.25)', color: '#fff', borderRadius: 6, width: 26, height: 26, cursor: 'pointer', fontSize: 16 }}>+</button>}
                </header>
                <div style={{ padding: 10 }}>
                  {cards.length === 0 ? <div className="empty-state" style={{ padding: 24 }}>Nenhuma atividade.</div>
                  : cards.map(t => {
                    const prio = PRIORIDADES.find(p => p.id === t.prioridade)!
                    return (
                      <article key={t.id} className="card" {...dragProps(t)}
                        onDragOver={e => { if (arrastando && arrastando !== t.id) e.preventDefault() }}
                        onDrop={e => { e.preventDefault(); e.stopPropagation(); if (arrastando && arrastando !== t.id) mover(arrastando, col.id, t.id); setArrastando(null); setSobre(null) }}
                        style={{ padding: 12, marginBottom: 10, cursor: somenteLeitura ? 'default' : 'grab', opacity: arrastando === t.id ? 0.4 : 1 }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                          {verTodas && <span className="badge badge-gray">{curtaUnidade(t.unidade)}</span>}
                          <span className="badge" style={{ background: prio.cor, color: '#fff' }}>{prio.label}</span>
                          <span className="badge badge-gray">{catLabel(t.categoria)}</span>
                          {t.bloqueada && t.status !== 'concluido' && <span className="badge" style={{ background: COR_BLOQUEADA, color: '#fff' }}>Bloqueada</span>}
                          <SelosTarefa t={t} />
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 14, cursor: somenteLeitura ? 'default' : 'pointer', textDecoration: t.status === 'concluido' ? 'line-through' : 'none' }}
                          onClick={() => openEdit(t)}>{t.titulo}</div>
                        {t.descricao && <div className="text-muted" style={{ marginTop: 4, whiteSpace: 'pre-wrap', fontSize: 12 }}>{t.descricao.length > 120 ? t.descricao.slice(0, 120) + '…' : t.descricao}</div>}
                        {t.bloqueada && t.motivo_bloqueio && <div style={{ fontSize: 12, color: COR_BLOQUEADA, marginTop: 4 }}>⚠ {t.motivo_bloqueio}</div>}

                        {t.checklist.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            {t.checklist.map((c, i) => (
                              <label key={i} style={{ display: 'flex', gap: 6, fontSize: 12, alignItems: 'center', cursor: somenteLeitura ? 'default' : 'pointer' }}>
                                <input type="checkbox" checked={c.feito} disabled={somenteLeitura} onChange={() => alternarItem(t, i)} />
                                <span style={{ textDecoration: c.feito ? 'line-through' : 'none', color: c.feito ? 'var(--text-muted)' : 'inherit' }}>{c.texto}</span>
                              </label>
                            ))}
                          </div>
                        )}
                        <div style={{ marginTop: 8 }}><Progresso t={t} /></div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Avatar nome={t.responsavel} size={24} />
                            <Prazo t={t} />
                          </div>
                          {isAdmin && t.status === 'concluido' && (
                            <button className="btn btn-secondary btn-sm" onClick={() => confirmar(t)}>{t.confirmada_em ? 'Desfazer' : '✓ Confirmar'}</button>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} size="lg" title={editId ? 'Editar atividade' : 'Nova atividade'}
        footer={<>
          {editId && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => setConfirm(editId)}>Excluir</button>}
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

        {isAdmin && (
          <div className="form-group" style={{ background: 'var(--surface2)', borderRadius: 8, padding: 10 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 600 }}>
              <input type="checkbox" checked={form.sigilosa} onChange={e => setForm(f => ({ ...f, sigilosa: e.target.checked }))} />
              🔒 Sigilosa — visível só para a gestão
            </label>
            <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>A unidade e a diretoria não veem esta atividade.</div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm && remove(confirm)} loading={saving}
        title="Excluir atividade" message="A atividade e o checklist serão apagados. Esta ação não pode ser desfeita." />
    </div>
  )
}
