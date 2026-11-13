'use client'
// Quadro de tarefas do time (estilo Monday). Componente só de apresentação:
// quem usa passa as tarefas e as ações (Supabase em /quadro, memória em /quadro/demo).
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { ItemChecklist, PrioridadeTarefa, StatusTarefa, Tarefa, Unidade } from '@/types'

/* ---------- Tokens ---------- */
type Cor = { bg: string; fg: string }
const STATUS: { id: StatusTarefa; label: string; cor: Cor }[] = [
  { id: 'pendente', label: 'Não iniciado', cor: { bg: '#7E849B', fg: '#fff' } },
  { id: 'andamento', label: 'Em andamento', cor: { bg: '#FDBA45', fg: '#3B2300' } },
  { id: 'concluido', label: 'Concluído', cor: { bg: '#00A35C', fg: '#fff' } },
]
const BLOQUEADA: Cor = { bg: '#E2445C', fg: '#fff' }
const PRIORIDADE: { id: PrioridadeTarefa; label: string; cor: Cor }[] = [
  { id: 'urgente', label: 'Urgente', cor: { bg: '#2B2D42', fg: '#fff' } },
  { id: 'alta', label: 'Alta', cor: { bg: '#5034C4', fg: '#fff' } },
  { id: 'media', label: 'Média', cor: { bg: '#5C7CFA', fg: '#fff' } },
  { id: 'baixa', label: 'Baixa', cor: { bg: '#B7CCF7', fg: '#1E2A4A' } },
]
const CATEGORIAS: [string, string][] = [
  ['cadastro', 'Cadastros'], ['estoque', 'Estoque'], ['financeiro', 'Financeiro'],
  ['vendas', 'Vendas'], ['vhsys', 'VHSYS'], ['outros', 'Outros'],
]
const AVATAR = ['#E2445C', '#00A35C', '#5034C4', '#F08C00', '#0086C0', '#A25DDC', '#037F4C', '#BB3354', '#225091']

const st = (id: StatusTarefa) => STATUS.find(s => s.id === id)!
const pr = (id: PrioridadeTarefa) => PRIORIDADE.find(p => p.id === id)!
const corStatus = (t: Tarefa) => (t.bloqueada && t.status !== 'concluido' ? BLOQUEADA : st(t.status).cor)
const labelStatus = (t: Tarefa) => (t.bloqueada && t.status !== 'concluido' ? 'Bloqueada' : st(t.status).label)
const curta = (u: string) => u.replace('NEW BLUETEX ', '')
const hoje = () => new Date().toLocaleDateString('sv-SE')
const diasPara = (d: string) => Math.round((new Date(d + 'T00:00:00').getTime() - new Date(hoje() + 'T00:00:00').getTime()) / 864e5)
const atrasada = (t: Tarefa) => !!t.prazo && t.status !== 'concluido' && diasPara(t.prazo) < 0
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const dataCurta = (d: string) => `${Number(d.slice(8, 10))} ${MESES[Number(d.slice(5, 7)) - 1]}`

export type FormTarefa = {
  unidade: Unidade | ''; titulo: string; descricao: string; status: StatusTarefa; prioridade: PrioridadeTarefa
  categoria: string; responsavel: string; prazo: string; checklist: ItemChecklist[]
  bloqueada: boolean; motivo_bloqueio: string; sigilosa: boolean
}
const VAZIO: FormTarefa = {
  unidade: '', titulo: '', descricao: '', status: 'pendente', prioridade: 'media', categoria: 'outros',
  responsavel: '', prazo: '', checklist: [], bloqueada: false, motivo_bloqueio: '', sigilosa: false,
}

export interface QuadroProps {
  tarefas: Tarefa[]
  carregando: boolean
  unidades: Unidade[]           // unidades que o usuário pode ver (1 para a unidade, todas para o gestor)
  isAdmin: boolean
  somenteLeitura: boolean
  usuarioNome: string | null
  onPatch: (t: Tarefa, patch: Partial<Tarefa>) => Promise<void>
  onSalvar: (form: FormTarefa, id: string | null) => Promise<string | null> // devolve mensagem de erro
  onExcluir: (id: string) => Promise<void>
  voltarHref?: string
}

/* ---------- Ícones ---------- */
const I = {
  busca: 'M21 21l-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z',
  mais: 'M12 5v14M5 12h14',
  cal: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  cadeado: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  lista: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  quadro: 'M4 4h5v16H4zM10 4h5v10h-5zM16 4h4v13h-4z',
  tabela: 'M3 5h18M3 12h18M3 19h18',
  x: 'M6 6l12 12M18 6L6 18',
  lixo: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  voltar: 'M15 18l-6-6 6-6',
  alerta: 'M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  seta: 'M6 9l6 6 6-6',
}
function Icone({ d, size = 16, className = '' }: { d: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={d} />
    </svg>
  )
}

function Avatar({ nome, size = 28, anel }: { nome: string | null; size?: number; anel?: boolean }) {
  if (!nome) return <span title="Sem responsável" className="inline-block shrink-0 rounded-full border-[1.5px] border-dashed border-[#C5CAD8]" style={{ width: size, height: size }} />
  const ini = nome.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()
  const bg = AVATAR[[...nome].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR.length]
  return (
    <span title={nome} className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${anel ? 'ring-2 ring-white' : ''}`}
      style={{ width: size, height: size, background: bg, fontSize: size * 0.38 }}>{ini}</span>
  )
}

/* Menu colorido de opções (status / prioridade), como o seletor do Monday. */
function MenuCor<T extends string>({ valor, opcoes, onEscolher, disabled, children, largura = 'w-44' }: {
  valor: T; opcoes: { id: T; label: string; cor: Cor }[]; onEscolher: (v: T) => void; disabled?: boolean
  children: React.ReactNode; largura?: string
}) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])
  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={aberto}
        onClick={() => setAberto(a => !a)} className="block w-full rounded-[inherit] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B3A63] focus-visible:ring-offset-1 disabled:cursor-default">
        {children}
      </button>
      {aberto && (
        <div role="listbox" className={`absolute left-0 top-[calc(100%+6px)] z-30 ${largura} rounded-xl border border-[#E3E6EE] bg-white p-2 shadow-[0_12px_32px_rgba(29,34,51,.16)]`}>
          {opcoes.map(o => (
            <button key={o.id} type="button" role="option" aria-selected={o.id === valor}
              onClick={() => { onEscolher(o.id); setAberto(false) }}
              className="mb-1 flex h-8 w-full items-center justify-center rounded-md text-[13px] font-semibold transition-transform last:mb-0 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B3A63]"
              style={{ background: o.cor.bg, color: o.cor.fg }}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Chip({ cor, children, className = '' }: { cor: Cor; children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md px-2.5 text-[12px] font-semibold ${className}`} style={{ background: cor.bg, color: cor.fg }}>{children}</span>
}

function Prazo({ t }: { t: Tarefa }) {
  if (!t.prazo) return null
  const d = diasPara(t.prazo)
  const fim = t.status === 'concluido'
  const tom = fim ? 'text-[#6B7186] bg-[#F1F2F6]' : d < 0 ? 'text-[#C3243D] bg-[#FDE8EB]' : d <= 2 ? 'text-[#8A5300] bg-[#FFF1D6]' : 'text-[#4A5068] bg-[#F1F2F6]'
  return (
    <span className={`inline-flex h-6 items-center gap-1 rounded-md px-2 text-[12px] font-medium ${tom}`} title={fim ? 'Prazo' : d < 0 ? `${-d} dia(s) de atraso` : d === 0 ? 'Vence hoje' : `Faltam ${d} dia(s)`}>
      <Icone d={I.cal} size={13} />{d === 0 && !fim ? 'Hoje' : dataCurta(t.prazo)}
    </span>
  )
}

/* Barra de distribuição por status — o "termômetro" do quadro. */
function Bateria({ tarefas, altura = 10 }: { tarefas: Tarefa[]; altura?: number }) {
  const total = tarefas.length || 1
  const bloq = (t: Tarefa) => t.bloqueada && t.status !== 'concluido'
  const partes = [
    ...STATUS.map(s => ({ cor: s.cor.bg, n: tarefas.filter(t => t.status === s.id && !bloq(t)).length, label: s.label })),
    { cor: BLOQUEADA.bg, n: tarefas.filter(bloq).length, label: 'Bloqueada' },
  ]
  return (
    <div className="flex w-full gap-[2px] overflow-hidden rounded-full bg-[#E6E8EF]" style={{ height: altura }} role="img"
      aria-label={partes.filter(p => p.n).map(p => `${p.n} ${p.label.toLowerCase()}`).join(', ') || 'Sem tarefas'}>
      {partes.filter(p => p.n).map(p => <span key={p.label} style={{ width: `${(p.n / total) * 100}%`, background: p.cor }} />)}
    </div>
  )
}

/* ---------- Componente principal ---------- */
export default function Quadro(props: QuadroProps) {
  const { tarefas, carregando, unidades, isAdmin, somenteLeitura, usuarioNome, onPatch, onSalvar, onExcluir, voltarHref } = props
  const variasUnidades = unidades.length > 1
  const [visao, setVisao] = useState<'quadro' | 'tabela'>('quadro')
  const [busca, setBusca] = useState('')
  const [fUnidade, setFUnidade] = useState<string>('')
  const [fPessoa, setFPessoa] = useState('')
  const [fPrioridade, setFPrioridade] = useState<'' | PrioridadeTarefa>('')
  const [fSo, setFSo] = useState<'' | 'atrasadas' | 'bloqueadas' | 'sigilosas'>('')
  const [painel, setPainel] = useState<{ id: string | null; form: FormTarefa } | null>(null)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [sobre, setSobre] = useState<StatusTarefa | null>(null)

  useEffect(() => { try { const v = localStorage.getItem('btx_quadro_visao'); if (v === 'quadro' || v === 'tabela') setVisao(v) } catch {} }, [])
  const trocarVisao = (v: 'quadro' | 'tabela') => { setVisao(v); try { localStorage.setItem('btx_quadro_visao', v) } catch {} }

  const pessoas = useMemo(() => [...new Set(tarefas.map(t => t.responsavel).filter(Boolean))].sort() as string[], [tarefas])
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return tarefas.filter(t =>
      (!q || `${t.titulo} ${t.descricao ?? ''} ${t.responsavel ?? ''}`.toLowerCase().includes(q)) &&
      (!fUnidade || t.unidade === fUnidade) && (!fPessoa || t.responsavel === fPessoa) && (!fPrioridade || t.prioridade === fPrioridade) &&
      (fSo !== 'atrasadas' || atrasada(t)) && (fSo !== 'bloqueadas' || (t.bloqueada && t.status !== 'concluido')) && (fSo !== 'sigilosas' || t.sigilosa))
  }, [tarefas, busca, fUnidade, fPessoa, fPrioridade, fSo])
  const filtrando = !!(busca || fUnidade || fPessoa || fPrioridade || fSo)
  const limpar = () => { setBusca(''); setFUnidade(''); setFPessoa(''); setFPrioridade(''); setFSo('') }

  const nAtrasadas = tarefas.filter(atrasada).length
  const nBloqueadas = tarefas.filter(t => t.bloqueada && t.status !== 'concluido').length
  const nSigilosas = tarefas.filter(t => t.sigilosa).length
  const pct = tarefas.length ? Math.round(tarefas.filter(t => t.status === 'concluido').length / tarefas.length * 100) : 0

  function mover(id: string, status: StatusTarefa, antesDe?: string) {
    const t = tarefas.find(r => r.id === id)
    if (!t || somenteLeitura) return
    if (t.status === status && antesDe === undefined) return
    const col = tarefas.filter(r => r.status === status && r.id !== id).sort((a, b) => a.ordem - b.ordem)
    const idx = antesDe ? col.findIndex(r => r.id === antesDe) : -1
    const ordem = idx < 0 ? (col.at(-1)?.ordem ?? 0) + 1 : ((col[idx - 1]?.ordem ?? col[idx].ordem - 2) + col[idx].ordem) / 2
    onPatch(t, {
      status, ordem,
      concluida_em: status === 'concluido' ? (t.concluida_em ?? new Date().toISOString()) : null,
      ...(status !== 'concluido' ? { confirmada_em: null, confirmada_por: null } : {}),
    })
  }
  const confirmar = (t: Tarefa) => onPatch(t, t.confirmada_em
    ? { confirmada_em: null, confirmada_por: null }
    : { confirmada_em: new Date().toISOString(), confirmada_por: usuarioNome })

  const unidadeNova = (): Unidade | '' => (fUnidade as Unidade) || (unidades.length === 1 ? unidades[0] : '')
  const abrirNova = (status: StatusTarefa = 'pendente') => setPainel({ id: null, form: { ...VAZIO, status, unidade: unidadeNova() } })
  const abrir = (t: Tarefa) => setPainel({
    id: t.id, form: {
      unidade: t.unidade, titulo: t.titulo, descricao: t.descricao ?? '', status: t.status, prioridade: t.prioridade, categoria: t.categoria,
      responsavel: t.responsavel ?? '', prazo: t.prazo ?? '', checklist: t.checklist ?? [], bloqueada: t.bloqueada,
      motivo_bloqueio: t.motivo_bloqueio ?? '', sigilosa: !!t.sigilosa,
    },
  })
  async function criarRapido(status: StatusTarefa, titulo: string) {
    const unidade = unidadeNova()
    if (!unidade) { setPainel({ id: null, form: { ...VAZIO, status, titulo } }); return } // gestor precisa escolher a unidade
    await onSalvar({ ...VAZIO, status, titulo, unidade }, null)
  }

  const drop = (s: StatusTarefa) => ({
    onDragOver: (e: React.DragEvent) => { if (arrastando) { e.preventDefault(); setSobre(s) } },
    onDragLeave: () => setSobre(x => (x === s ? null : x)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); if (arrastando) mover(arrastando, s); setArrastando(null); setSobre(null) },
  })
  const drag = (t: Tarefa) => ({
    draggable: !somenteLeitura,
    onDragStart: (e: React.DragEvent) => { setArrastando(t.id); e.dataTransfer.effectAllowed = 'move' },
    onDragEnd: () => { setArrastando(null); setSobre(null) },
  })

  return (
    <div className="min-h-screen bg-[#F3F4F8] text-[#1D2233]">
      {/* ---------- Topo ---------- */}
      <header className="z-20 border-b md:sticky md:top-0 border-[#E3E6EE] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-4 py-3 sm:px-6">
          {voltarHref && (
            <Link href={voltarHref} className="flex h-9 w-9 items-center justify-center rounded-lg text-[#4A5068] hover:bg-[#F1F2F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B3A63]" aria-label="Voltar ao sistema" title="Voltar ao sistema">
              <Icone d={I.voltar} size={18} />
            </Link>
          )}
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-[#1B3A63]">New Bluetex</div>
            <h1 className="truncate text-[20px] font-bold leading-tight tracking-[-0.01em]">Quadro do time</h1>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {pessoas.length > 0 && (
              <div className="hidden -space-x-2 md:flex" aria-label="Filtrar por pessoa">
                {pessoas.slice(0, 7).map(p => (
                  <button key={p} type="button" onClick={() => setFPessoa(fPessoa === p ? '' : p)} aria-pressed={fPessoa === p} title={p}
                    className={`rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B3A63] ${fPessoa && fPessoa !== p ? 'opacity-40' : ''} ${fPessoa === p ? 'relative z-10 scale-110' : ''}`}>
                    <Avatar nome={p} size={32} anel />
                  </button>
                ))}
                {pessoas.length > 7 && <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E6E8EF] text-[11px] font-semibold text-[#4A5068] ring-2 ring-white">+{pessoas.length - 7}</span>}
              </div>
            )}
            {!somenteLeitura && (
              <button type="button" onClick={() => abrirNova()} className="flex h-10 items-center gap-2 rounded-lg bg-[#1B3A63] px-4 text-[14px] font-semibold text-white shadow-sm hover:bg-[#15304F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B3A63] focus-visible:ring-offset-2">
                <Icone d={I.mais} size={16} /> <span className="hidden sm:inline">Nova tarefa</span>
              </button>
            )}
          </div>
        </div>

        {/* Visões + filtros */}
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-2 px-4 pb-3 sm:px-6">
          <div className="flex rounded-lg bg-[#F1F2F6] p-1" role="tablist" aria-label="Visão">
            {([['quadro', 'Quadro', I.quadro], ['tabela', 'Tabela', I.tabela]] as const).map(([v, l, ic]) => (
              <button key={v} role="tab" aria-selected={visao === v} type="button" onClick={() => trocarVisao(v)}
                className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B3A63] ${visao === v ? 'bg-white text-[#1D2233] shadow-sm' : 'text-[#6B7186] hover:text-[#1D2233]'}`}>
                <Icone d={ic} size={15} />{l}
              </button>
            ))}
          </div>
          <label className="relative flex items-center">
            <span className="sr-only">Buscar</span>
            <Icone d={I.busca} size={15} className="pointer-events-none absolute left-3 text-[#8A90A5]" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar tarefa ou pessoa"
              className="h-9 w-56 rounded-lg border border-[#E3E6EE] bg-white pl-9 pr-3 text-[13px] placeholder:text-[#8A90A5] focus:border-[#1B3A63] focus:outline-none focus:ring-2 focus:ring-[#1B3A63]/15" />
          </label>
          {variasUnidades && (
            <select value={fUnidade} onChange={e => setFUnidade(e.target.value)} aria-label="Unidade"
              className="h-9 rounded-lg border border-[#E3E6EE] bg-white px-3 text-[13px] font-medium focus:border-[#1B3A63] focus:outline-none focus:ring-2 focus:ring-[#1B3A63]/15">
              <option value="">Todas as unidades</option>
              {unidades.map(u => <option key={u} value={u}>{curta(u)}</option>)}
            </select>
          )}
          <select value={fPrioridade} onChange={e => setFPrioridade(e.target.value as PrioridadeTarefa | '')} aria-label="Prioridade"
            className="h-9 rounded-lg border border-[#E3E6EE] bg-white px-3 text-[13px] font-medium focus:border-[#1B3A63] focus:outline-none focus:ring-2 focus:ring-[#1B3A63]/15">
            <option value="">Qualquer prioridade</option>
            {PRIORIDADE.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          {([
            ['atrasadas', 'Atrasadas', nAtrasadas, '#C3243D'],
            ['bloqueadas', 'Bloqueadas', nBloqueadas, BLOQUEADA.bg],
            ...(isAdmin ? [['sigilosas', 'Sigilosas', nSigilosas, '#2B2D42'] as const] : []),
          ] as const).map(([id, l, n, cor]) => (
            <button key={id} type="button" onClick={() => setFSo(fSo === id ? '' : id)} aria-pressed={fSo === id}
              className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B3A63] ${fSo === id ? 'border-transparent text-white' : 'border-[#E3E6EE] bg-white text-[#4A5068] hover:border-[#C5CAD8]'}`}
              style={fSo === id ? { background: cor } : undefined}>
              {l}<span className={`rounded px-1.5 text-[11px] font-bold ${fSo === id ? 'bg-white/25' : n ? 'text-white' : 'bg-[#F1F2F6] text-[#8A90A5]'}`} style={fSo !== id && n ? { background: cor } : undefined}>{n}</span>
            </button>
          ))}
          {filtrando && <button type="button" onClick={limpar} className="h-9 px-2 text-[13px] font-medium text-[#1B3A63] underline-offset-2 hover:underline">Limpar filtros</button>}
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
        {/* ---------- Andamento ---------- */}
        <section className="mb-5 rounded-xl border border-[#E3E6EE] bg-white p-4">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <p className="text-[15px]"><strong className="text-[22px] font-bold tracking-[-0.02em]">{pct}%</strong> <span className="text-[#6B7186]">concluído, {tarefas.length} {tarefas.length === 1 ? 'tarefa' : 'tarefas'} no total</span></p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[#4A5068]">
              {STATUS.map(s => (
                <li key={s.id} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.cor.bg }} />{s.label} <b className="font-semibold text-[#1D2233]">{tarefas.filter(t => t.status === s.id && !(t.bloqueada && t.status !== 'concluido')).length}</b></li>
              ))}
              {nBloqueadas > 0 && <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: BLOQUEADA.bg }} />Bloqueadas <b className="font-semibold text-[#1D2233]">{nBloqueadas}</b></li>}
            </ul>
          </div>
          <Bateria tarefas={tarefas} altura={12} />

          {variasUnidades && (
            <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2 border-t border-[#EEF0F4] pt-4">
              {unidades.map(u => {
                const ts = tarefas.filter(t => t.unidade === u)
                if (!ts.length) return null
                const feito = Math.round(ts.filter(t => t.status === 'concluido').length / ts.length * 100)
                const atr = ts.filter(atrasada).length
                return (
                  <button key={u} type="button" onClick={() => setFUnidade(fUnidade === u ? '' : u)} aria-pressed={fUnidade === u}
                    className={`rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B3A63] ${fUnidade === u ? 'border-[#1B3A63] bg-[#F4F7FC]' : 'border-[#EEF0F4] hover:border-[#C5CAD8]'}`}>
                    <div className="mb-2 flex items-baseline justify-between text-[13px]">
                      <span className="font-semibold">{curta(u)}</span><span className="font-semibold text-[#4A5068]">{feito}%</span>
                    </div>
                    <Bateria tarefas={ts} altura={6} />
                    <div className="mt-2 text-[12px] text-[#6B7186]">{ts.length} {ts.length === 1 ? 'tarefa' : 'tarefas'}{atr > 0 && <span className="font-semibold text-[#C3243D]">, {atr} atrasada{atr > 1 ? 's' : ''}</span>}</div>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {carregando ? (
          <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="h-72 animate-pulse rounded-xl bg-[#E6E8EF]" />)}</div>
        ) : visao === 'quadro' ? (
          /* ---------- Quadro ---------- */
          <div className="grid snap-x auto-cols-[minmax(290px,1fr)] grid-flow-col gap-4 overflow-x-auto pb-4">
            {STATUS.map(col => {
              const cards = filtradas.filter(t => t.status === col.id).sort((a, b) => a.ordem - b.ordem)
              return (
                <section key={col.id} {...drop(col.id)} aria-label={col.label}
                  className={`flex min-h-[320px] snap-start flex-col rounded-xl transition-colors ${sobre === col.id ? 'bg-[#E4EAF5] ring-2 ring-[#1B3A63]/30' : 'bg-[#EAECF2]'}`}>
                  <header className="flex items-center gap-2 px-3 pb-2 pt-3">
                    <span className="flex h-7 items-center rounded-md px-2.5 text-[13px] font-bold" style={{ background: col.cor.bg, color: col.cor.fg }}>{col.label}</span>
                    <span className="text-[13px] font-semibold text-[#6B7186]">{cards.length}</span>
                  </header>
                  <div className="flex flex-1 flex-col gap-2.5 px-2.5 pb-2.5">
                    {cards.map(t => (
                      <Card key={t.id} t={t} variasUnidades={variasUnidades} isAdmin={isAdmin} somenteLeitura={somenteLeitura}
                        arrastando={arrastando === t.id} onAbrir={() => abrir(t)} drag={drag(t)}
                        onDropAntes={() => { if (arrastando && arrastando !== t.id) mover(arrastando, col.id, t.id); setArrastando(null); setSobre(null) }}
                        podeSoltar={!!arrastando && arrastando !== t.id}
                        onStatus={s => mover(t.id, s)} onPrioridade={p => onPatch(t, { prioridade: p })} onConfirmar={() => confirmar(t)} />
                    ))}
                    {cards.length === 0 && filtrando && <p className="px-2 py-6 text-center text-[13px] text-[#8A90A5]">Nenhuma tarefa com esses filtros.</p>}
                    {!somenteLeitura && <AdicionarRapido onCriar={titulo => criarRapido(col.id, titulo)} />}
                  </div>
                </section>
              )
            })}
          </div>
        ) : (
          /* ---------- Tabela ---------- */
          <div className="space-y-6">
            {STATUS.map(col => {
              const itens = filtradas.filter(t => t.status === col.id).sort((a, b) => a.ordem - b.ordem)
              return <Grupo key={col.id} col={col} itens={itens} variasUnidades={variasUnidades} isAdmin={isAdmin} somenteLeitura={somenteLeitura}
                onAbrir={abrir} onStatus={(t, s) => mover(t.id, s)} onPrioridade={(t, p) => onPatch(t, { prioridade: p })} onConfirmar={confirmar}
                onCriar={titulo => criarRapido(col.id, titulo)} drop={drop(col.id)} drag={drag} sobre={sobre === col.id} />
            })}
          </div>
        )}
      </main>

      {painel && (
        <Painel key={painel.id ?? 'nova'} inicial={painel.form} id={painel.id} tarefa={tarefas.find(t => t.id === painel.id) ?? null}
          unidades={unidades} isAdmin={isAdmin} somenteLeitura={somenteLeitura} pessoas={pessoas}
          onFechar={() => setPainel(null)} onSalvar={onSalvar} onExcluir={onExcluir} onConfirmar={confirmar} />
      )}
    </div>
  )
}

/* ---------- Card do quadro ---------- */
function Card({ t, variasUnidades, isAdmin, somenteLeitura, arrastando, onAbrir, drag, onDropAntes, podeSoltar, onStatus, onPrioridade, onConfirmar }: {
  t: Tarefa; variasUnidades: boolean; isAdmin: boolean; somenteLeitura: boolean; arrastando: boolean
  onAbrir: () => void; drag: React.HTMLAttributes<HTMLElement> & { draggable: boolean }; onDropAntes: () => void; podeSoltar: boolean
  onStatus: (s: StatusTarefa) => void; onPrioridade: (p: PrioridadeTarefa) => void; onConfirmar: () => void
}) {
  const feitos = t.checklist.filter(c => c.feito).length
  const fim = t.status === 'concluido'
  return (
    <article {...drag} onDragOver={e => { if (podeSoltar) e.preventDefault() }} onDrop={e => { e.preventDefault(); e.stopPropagation(); onDropAntes() }}
      className={`group rounded-[10px] border border-[#E3E6EE] bg-white p-3 shadow-[0_1px_2px_rgba(29,34,51,.05)] transition hover:border-[#C9CEDB] hover:shadow-[0_6px_16px_rgba(29,34,51,.08)] ${arrastando ? 'opacity-40' : ''} ${somenteLeitura ? '' : 'cursor-grab active:cursor-grabbing'}`}>
      {(variasUnidades || t.sigilosa) && (
        <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold text-[#6B7186]">
          {variasUnidades && <span>{curta(t.unidade)}</span>}
          {t.sigilosa && <span className="ml-auto flex items-center gap-1 rounded bg-[#2B2D42] px-1.5 py-0.5 text-white" title="Visível só para a gestão"><Icone d={I.cadeado} size={11} />Sigilosa</span>}
        </div>
      )}
      <button type="button" onClick={onAbrir} className={`block w-full text-left text-[14px] font-semibold leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B3A63] ${fim ? 'text-[#8A90A5] line-through decoration-[#B5BACA]' : 'text-[#1D2233] hover:text-[#1B3A63]'}`}>
        {t.titulo}
      </button>
      {t.bloqueada && !fim && t.motivo_bloqueio && (
        <p className="mt-1.5 flex items-start gap-1 text-[12px] font-medium text-[#C3243D]"><Icone d={I.alerta} size={13} className="mt-px shrink-0" />{t.motivo_bloqueio}</p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <MenuCor valor={t.status} opcoes={STATUS} onEscolher={onStatus} disabled={somenteLeitura}>
          <Chip cor={corStatus(t)}>{labelStatus(t)}</Chip>
        </MenuCor>
        <MenuCor valor={t.prioridade} opcoes={PRIORIDADE} onEscolher={onPrioridade} disabled={somenteLeitura} largura="w-36">
          <Chip cor={pr(t.prioridade).cor}>{pr(t.prioridade).label}</Chip>
        </MenuCor>
      </div>

      {t.checklist.length > 0 && (
        <div className="mt-2.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#ECEEF3]">
            <div className="h-full rounded-full transition-all" style={{ width: `${(feitos / t.checklist.length) * 100}%`, background: feitos === t.checklist.length ? '#00A35C' : '#5C7CFA' }} />
          </div>
          <span className="flex items-center gap-1 text-[11px] font-semibold text-[#6B7186]"><Icone d={I.lista} size={12} />{feitos}/{t.checklist.length}</span>
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-2 border-t border-[#F0F1F5] pt-2.5">
        <Avatar nome={t.responsavel} size={24} />
        <span className={`min-w-0 flex-1 truncate text-[12px] ${t.responsavel ? 'text-[#4A5068]' : 'text-[#8A90A5]'}`}>{t.responsavel ?? 'Sem responsável'}</span>
        <Prazo t={t} />
      </div>

      {fim && (
        <div className="mt-2 flex items-center gap-2">
          {t.confirmada_em
            ? <span className="flex items-center gap-1 text-[12px] font-semibold text-[#00874C]"><Icone d={I.check} size={13} />Confirmada{t.confirmada_por ? ` por ${t.confirmada_por}` : ''}</span>
            : <span className="text-[12px] font-semibold text-[#8A5300]">Aguardando confirmação</span>}
          {isAdmin && (
            <button type="button" onClick={onConfirmar} className="ml-auto rounded-md px-2 py-1 text-[12px] font-semibold text-[#1B3A63] hover:bg-[#EEF2F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B3A63]">
              {t.confirmada_em ? 'Desfazer' : 'Confirmar'}
            </button>
          )}
        </div>
      )}
    </article>
  )
}

function AdicionarRapido({ onCriar, tabela }: { onCriar: (titulo: string) => Promise<void> | void; tabela?: boolean }) {
  const [ativo, setAtivo] = useState(false)
  const [texto, setTexto] = useState('')
  async function enviar() {
    const t = texto.trim()
    if (!t) { setAtivo(false); return }
    setTexto(''); await onCriar(t)
  }
  if (!ativo) return (
    <button type="button" onClick={() => setAtivo(true)}
      className={`flex items-center gap-1.5 text-[13px] font-medium text-[#6B7186] hover:text-[#1D2233] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B3A63] ${tabela ? 'h-10 w-full px-4' : 'h-9 rounded-lg px-2 hover:bg-white/70'}`}>
      <Icone d={I.mais} size={15} />Adicionar tarefa
    </button>
  )
  return (
    <input autoFocus value={texto} onChange={e => setTexto(e.target.value)} placeholder="Nome da tarefa, Enter para criar"
      onKeyDown={e => { if (e.key === 'Enter') enviar(); if (e.key === 'Escape') { setTexto(''); setAtivo(false) } }} onBlur={enviar}
      className={`w-full border border-[#1B3A63] bg-white px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1B3A63]/15 ${tabela ? 'h-10 rounded-none border-x-0' : 'h-10 rounded-[10px]'}`} />
  )
}

/* ---------- Grupo da tabela ---------- */
function Grupo({ col, itens, variasUnidades, isAdmin, somenteLeitura, onAbrir, onStatus, onPrioridade, onConfirmar, onCriar, drop, drag, sobre }: {
  col: (typeof STATUS)[number]; itens: Tarefa[]; variasUnidades: boolean; isAdmin: boolean; somenteLeitura: boolean
  onAbrir: (t: Tarefa) => void; onStatus: (t: Tarefa, s: StatusTarefa) => void; onPrioridade: (t: Tarefa, p: PrioridadeTarefa) => void
  onConfirmar: (t: Tarefa) => void; onCriar: (titulo: string) => void
  drop: React.HTMLAttributes<HTMLElement>; drag: (t: Tarefa) => React.HTMLAttributes<HTMLElement> & { draggable: boolean }; sobre: boolean
}) {
  const [fechado, setFechado] = useState(false)
  const cols = `minmax(260px,1fr) ${variasUnidades ? '92px ' : ''}150px 140px 120px 110px`
  const cab = 'flex items-center justify-center border-l border-[#EEF0F4] text-[12px] font-semibold text-[#6B7186]'
  return (
    <section {...drop}>
      <button type="button" onClick={() => setFechado(f => !f)} aria-expanded={!fechado}
        className="mb-2 flex items-center gap-2 text-[16px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B3A63]" style={{ color: col.id === 'andamento' ? '#B07400' : col.cor.bg }}>
        <Icone d={I.seta} size={18} className={`transition-transform ${fechado ? '-rotate-90' : ''}`} />
        {col.label}<span className="text-[13px] font-medium text-[#8A90A5]">{itens.length} {itens.length === 1 ? 'tarefa' : 'tarefas'}</span>
      </button>
      {!fechado && (
        <div className={`overflow-x-auto rounded-xl border bg-white ${sobre ? 'border-[#1B3A63]' : 'border-[#E3E6EE]'}`}>
          <div className="min-w-[760px]" style={{ boxShadow: `inset 5px 0 0 ${col.cor.bg}` }}>
            <div className="grid h-10" style={{ gridTemplateColumns: cols }}>
              <span className="flex items-center pl-5 text-[12px] font-semibold text-[#6B7186]">Tarefa</span>
              {variasUnidades && <span className={cab}>Unidade</span>}
              <span className={cab}>Responsável</span><span className={cab}>Status</span><span className={cab}>Prioridade</span><span className={cab}>Prazo</span>
            </div>
            {itens.map(t => (
              <div key={t.id} {...drag(t)} className="grid min-h-[44px] border-t border-[#EEF0F4] hover:bg-[#FAFBFD]" style={{ gridTemplateColumns: cols }}>
                <div className="flex min-w-0 items-center gap-2 py-1.5 pl-5 pr-3">
                  <button type="button" onClick={() => onAbrir(t)} className={`truncate text-left text-[14px] font-medium hover:text-[#1B3A63] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B3A63] ${t.status === 'concluido' ? 'text-[#8A90A5] line-through' : ''}`}>{t.titulo}</button>
                  {t.sigilosa && <span title="Sigilosa" className="text-[#2B2D42]"><Icone d={I.cadeado} size={13} /></span>}
                  {t.checklist.length > 0 && <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-[#8A90A5]"><Icone d={I.lista} size={12} />{t.checklist.filter(c => c.feito).length}/{t.checklist.length}</span>}
                  {t.status === 'concluido' && (t.confirmada_em
                    ? <span className="shrink-0 text-[#00874C]" title="Confirmada"><Icone d={I.check} size={14} /></span>
                    : isAdmin && <button type="button" onClick={() => onConfirmar(t)} className="ml-auto shrink-0 rounded-md px-2 py-0.5 text-[12px] font-semibold text-[#1B3A63] hover:bg-[#EEF2F9]">Confirmar</button>)}
                </div>
                {variasUnidades && <span className="flex items-center justify-center border-l border-[#EEF0F4] text-[12px] font-semibold text-[#4A5068]">{curta(t.unidade)}</span>}
                <span className="flex min-w-0 items-center gap-2 border-l border-[#EEF0F4] px-3"><Avatar nome={t.responsavel} size={26} /><span className="truncate text-[12px] text-[#4A5068]">{t.responsavel?.split(' ')[0] ?? ''}</span></span>
                <div className="border-l border-[#EEF0F4] p-1">
                  <MenuCor valor={t.status} opcoes={STATUS} onEscolher={s => onStatus(t, s)} disabled={somenteLeitura}>
                    <Chip cor={corStatus(t)} className="h-9 w-full rounded">{labelStatus(t)}</Chip>
                  </MenuCor>
                </div>
                <div className="border-l border-[#EEF0F4] p-1">
                  <MenuCor valor={t.prioridade} opcoes={PRIORIDADE} onEscolher={p => onPrioridade(t, p)} disabled={somenteLeitura} largura="w-36">
                    <Chip cor={pr(t.prioridade).cor} className="h-9 w-full rounded">{pr(t.prioridade).label}</Chip>
                  </MenuCor>
                </div>
                <span className="flex items-center justify-center border-l border-[#EEF0F4]"><Prazo t={t} /></span>
              </div>
            ))}
            {!somenteLeitura && <div className="border-t border-[#EEF0F4] pl-1"><AdicionarRapido tabela onCriar={onCriar} /></div>}
          </div>
        </div>
      )}
    </section>
  )
}

/* ---------- Painel lateral da tarefa ---------- */
function Painel({ inicial, id, tarefa, unidades, isAdmin, somenteLeitura, pessoas, onFechar, onSalvar, onExcluir, onConfirmar }: {
  inicial: FormTarefa; id: string | null; tarefa: Tarefa | null; unidades: Unidade[]; isAdmin: boolean; somenteLeitura: boolean; pessoas: string[]
  onFechar: () => void; onSalvar: QuadroProps['onSalvar']; onExcluir: QuadroProps['onExcluir']; onConfirmar: (t: Tarefa) => void
}) {
  const [f, setF] = useState(inicial)
  const [novoItem, setNovoItem] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [confirmaExcluir, setConfirmaExcluir] = useState(false)
  const set = <K extends keyof FormTarefa>(k: K, v: FormTarefa[K]) => setF(x => ({ ...x, [k]: v }))
  const ro = somenteLeitura

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onFechar])

  async function salvar() {
    if (!f.titulo.trim()) return setErro('Dê um nome para a tarefa.')
    if (!f.unidade) return setErro('Escolha a unidade responsável.')
    setSalvando(true)
    const e = await onSalvar(f, id)
    setSalvando(false)
    if (e) setErro(e); else onFechar()
  }
  function addItem() {
    const texto = novoItem.trim()
    if (!texto) return
    set('checklist', [...f.checklist, { texto, feito: false }]); setNovoItem('')
  }
  const campo = 'h-10 w-full rounded-lg border border-[#E3E6EE] bg-white px-3 text-[14px] focus:border-[#1B3A63] focus:outline-none focus:ring-2 focus:ring-[#1B3A63]/15 disabled:bg-[#F7F8FA]'
  const rotulo = 'mb-1 block text-[12px] font-semibold text-[#6B7186]'
  const bloqueadaForm = f.bloqueada && f.status !== 'concluido'

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={id ? 'Editar tarefa' : 'Nova tarefa'}>
      <button type="button" aria-label="Fechar" onClick={onFechar} className="quadro-fade absolute inset-0 bg-[#1D2233]/30" />
      <aside className="quadro-slide relative flex h-full w-full max-w-[520px] flex-col bg-white shadow-[-12px_0_40px_rgba(29,34,51,.18)]">
        <div className="flex items-center gap-2 border-b border-[#EEF0F4] px-5 py-3">
          <span className="text-[13px] font-semibold text-[#6B7186]">{id ? 'Tarefa' : 'Nova tarefa'}</span>
          {f.sigilosa && <span className="flex items-center gap-1 rounded bg-[#2B2D42] px-1.5 py-0.5 text-[11px] font-semibold text-white"><Icone d={I.cadeado} size={11} />Sigilosa</span>}
          <button type="button" onClick={onFechar} aria-label="Fechar" className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-[#4A5068] hover:bg-[#F1F2F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B3A63]"><Icone d={I.x} size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <textarea value={f.titulo} onChange={e => set('titulo', e.target.value)} disabled={ro} rows={2} autoFocus={!id} placeholder="Nome da tarefa" aria-label="Nome da tarefa"
            className="w-full resize-none rounded-lg border border-transparent bg-transparent px-2 py-1 text-[22px] font-bold leading-tight tracking-[-0.01em] placeholder:text-[#B5BACA] hover:border-[#E3E6EE] focus:border-[#1B3A63] focus:outline-none" />
          {erro && <p role="alert" className="mt-2 rounded-lg bg-[#FDE8EB] px-3 py-2 text-[13px] font-medium text-[#C3243D]">{erro}</p>}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <span className={rotulo}>Status</span>
              <MenuCor valor={f.status} opcoes={STATUS} onEscolher={v => set('status', v)} disabled={ro}>
                <Chip cor={bloqueadaForm ? BLOQUEADA : st(f.status).cor} className="h-10 w-full rounded-lg text-[13px]">{bloqueadaForm ? 'Bloqueada' : st(f.status).label}</Chip>
              </MenuCor>
            </div>
            <div>
              <span className={rotulo}>Prioridade</span>
              <MenuCor valor={f.prioridade} opcoes={PRIORIDADE} onEscolher={v => set('prioridade', v)} disabled={ro}>
                <Chip cor={pr(f.prioridade).cor} className="h-10 w-full rounded-lg text-[13px]">{pr(f.prioridade).label}</Chip>
              </MenuCor>
            </div>
            <label>
              <span className={rotulo}>Responsável</span>
              <input value={f.responsavel} onChange={e => set('responsavel', e.target.value)} disabled={ro} list="quadro-pessoas" placeholder="Nome da pessoa" className={campo} />
              <datalist id="quadro-pessoas">{pessoas.map(p => <option key={p} value={p} />)}</datalist>
            </label>
            <label>
              <span className={rotulo}>Prazo</span>
              <input type="date" value={f.prazo} onChange={e => set('prazo', e.target.value)} disabled={ro} className={campo} />
            </label>
            {unidades.length > 1 && (
              <label>
                <span className={rotulo}>Unidade</span>
                <select value={f.unidade} onChange={e => set('unidade', e.target.value as Unidade)} disabled={ro} className={campo}>
                  <option value="">Escolha...</option>
                  {unidades.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </label>
            )}
            <label className={unidades.length > 1 ? '' : 'col-span-2'}>
              <span className={rotulo}>Categoria</span>
              <select value={f.categoria} onChange={e => set('categoria', e.target.value)} disabled={ro} className={campo}>
                {CATEGORIAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>

          <label className="mt-4 block">
            <span className={rotulo}>Descrição</span>
            <textarea value={f.descricao} onChange={e => set('descricao', e.target.value)} disabled={ro} rows={4} placeholder="Detalhes, links, o que precisa ser entregue"
              className="w-full rounded-lg border border-[#E3E6EE] px-3 py-2 text-[14px] leading-relaxed focus:border-[#1B3A63] focus:outline-none focus:ring-2 focus:ring-[#1B3A63]/15" />
          </label>

          <div className="mt-4">
            <span className={rotulo}>Checklist {f.checklist.length > 0 && `(${f.checklist.filter(c => c.feito).length} de ${f.checklist.length})`}</span>
            <ul className="space-y-1">
              {f.checklist.map((c, i) => (
                <li key={i} className="group flex items-center gap-2 rounded-lg px-1 hover:bg-[#F7F8FA]">
                  <input type="checkbox" checked={c.feito} disabled={ro} aria-label={`Concluir ${c.texto}`}
                    onChange={() => set('checklist', f.checklist.map((x, k) => (k === i ? { ...x, feito: !x.feito } : x)))} className="h-4 w-4 accent-[#00A35C]" />
                  <input value={c.texto} disabled={ro} aria-label="Texto do item" onChange={e => set('checklist', f.checklist.map((x, k) => (k === i ? { ...x, texto: e.target.value } : x)))}
                    className={`h-9 flex-1 bg-transparent text-[14px] focus:outline-none ${c.feito ? 'text-[#8A90A5] line-through' : ''}`} />
                  {!ro && <button type="button" aria-label="Remover item" onClick={() => set('checklist', f.checklist.filter((_, k) => k !== i))}
                    className="flex h-7 w-7 items-center justify-center rounded text-[#8A90A5] opacity-0 hover:bg-[#ECEEF3] hover:text-[#C3243D] focus:opacity-100 group-hover:opacity-100"><Icone d={I.x} size={14} /></button>}
                </li>
              ))}
            </ul>
            {!ro && (
              <div className="mt-1 flex items-center gap-2 px-1">
                <Icone d={I.mais} size={15} className="text-[#8A90A5]" />
                <input value={novoItem} onChange={e => setNovoItem(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }} onBlur={addItem}
                  placeholder="Adicionar item" aria-label="Adicionar item ao checklist" className="h-9 flex-1 bg-transparent text-[14px] placeholder:text-[#8A90A5] focus:outline-none" />
              </div>
            )}
          </div>

          <div className="mt-5 space-y-2 border-t border-[#EEF0F4] pt-4">
            <label className="flex items-center gap-3 text-[14px]">
              <input type="checkbox" checked={f.bloqueada} disabled={ro} onChange={e => set('bloqueada', e.target.checked)} className="h-4 w-4 accent-[#E2445C]" />
              Está bloqueada, esperando algo
            </label>
            {f.bloqueada && <input value={f.motivo_bloqueio} onChange={e => set('motivo_bloqueio', e.target.value)} disabled={ro} placeholder="O que está travando?" aria-label="Motivo do bloqueio" className={campo} />}
            {isAdmin && (
              <label className="flex items-start gap-3 rounded-lg bg-[#F4F5F9] p-3 text-[14px]">
                <input type="checkbox" checked={f.sigilosa} onChange={e => set('sigilosa', e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#2B2D42]" />
                <span><b className="font-semibold">Sigilosa</b><span className="block text-[13px] text-[#6B7186]">Só a gestão vê esta tarefa. Unidades e diretoria não enxergam.</span></span>
              </label>
            )}
          </div>

          {tarefa?.status === 'concluido' && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#EAF7F0] p-3 text-[13px]">
              {tarefa.confirmada_em
                ? <span className="flex items-center gap-1 font-semibold text-[#00874C]"><Icone d={I.check} size={14} />Confirmada{tarefa.confirmada_por ? ` por ${tarefa.confirmada_por}` : ''}</span>
                : <span className="font-semibold text-[#8A5300]">Concluída, aguardando confirmação da gestão</span>}
              {isAdmin && <button type="button" onClick={() => onConfirmar(tarefa)} className="ml-auto rounded-md bg-white px-3 py-1.5 font-semibold text-[#1B3A63] shadow-sm hover:bg-[#F4F7FC]">{tarefa.confirmada_em ? 'Desfazer' : 'Confirmar'}</button>}
            </div>
          )}
          {tarefa?.criado_por && <p className="mt-4 text-[12px] text-[#8A90A5]">Criada por {tarefa.criado_por}</p>}
        </div>

        {!ro && (
          <div className="flex items-center gap-2 border-t border-[#EEF0F4] px-5 py-3">
            {id && (confirmaExcluir ? (
              <>
                <span className="text-[13px] font-medium text-[#C3243D]">Excluir de vez?</span>
                <button type="button" onClick={async () => { await onExcluir(id); onFechar() }} className="h-9 rounded-lg bg-[#C3243D] px-3 text-[13px] font-semibold text-white hover:bg-[#A51E33]">Excluir</button>
                <button type="button" onClick={() => setConfirmaExcluir(false)} className="h-9 rounded-lg px-3 text-[13px] font-semibold text-[#4A5068] hover:bg-[#F1F2F6]">Manter</button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmaExcluir(true)} className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-[#C3243D] hover:bg-[#FDE8EB]"><Icone d={I.lixo} size={15} />Excluir</button>
            ))}
            <button type="button" onClick={onFechar} className="ml-auto h-10 rounded-lg px-4 text-[14px] font-semibold text-[#4A5068] hover:bg-[#F1F2F6]">Cancelar</button>
            <button type="button" onClick={salvar} disabled={salvando} className="h-10 rounded-lg bg-[#1B3A63] px-5 text-[14px] font-semibold text-white hover:bg-[#15304F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B3A63] focus-visible:ring-offset-2 disabled:opacity-60">
              {salvando ? 'Salvando...' : id ? 'Salvar' : 'Criar tarefa'}
            </button>
          </div>
        )}
      </aside>
    </div>
  )
}
