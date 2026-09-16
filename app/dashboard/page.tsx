'use client'
export const dynamic = 'force-dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { formatMoeda, formatData, getMesAnoLabel, mesAtual, anoAtual, hoje, ordenarProdutos } from '@/lib/utils'
import { chaveCompetencia, type ParcelaFinanceira, type PagamentoParcela } from '@/lib/financeiro'
import { calcularResumoUnidade, consolidarResumos, type ResumoUnidade, type ContaPagar, type ContaReceber } from '@/lib/painel-resumo'
import { calcularEstoque, normalizarAberturasEstoque, normalizarMovimentosEstoque, normalizarProdutosEstoque, type AberturaEstoqueDb, type CompraEstoqueDb, type VendaEstoqueDb } from '@/lib/estoque'
import { UNIDADES, type Unidade, type GrupoCategoria, type Produto, type AjusteEstoque } from '@/types'
import Modal from '@/components/Modal'

interface LinhaEstoque {
  id: string; nome: string; fator: number; unidadeBase: string; unidadeMaior: string
  saldos: Record<string, number>
}

async function carregarEstoque(sb: ReturnType<typeof createClient>, ano: number, mes: number, alvos: string[]): Promise<LinhaEstoque[]> {
  const [produtosRes, aberturasRes, comprasRes, vendasRes, ajustesRes] = await Promise.all([
    sb.from('btx_produtos').select('*, unidade_base:btx_unidades_medida!unidade_base_id(nome), unidade_maior:btx_unidades_medida!unidade_maior_id(nome)').eq('ativo', true),
    sb.from('btx_estoque_inicial').select('id,unidade,produto_id,mes,ano,qtd_carteiras').in('unidade', alvos),
    sb.from('btx_compras').select('id,unidade,data_compra,numero_nf,itens:btx_compras_itens(id,produto_id,qtd_carteiras)').eq('ativo', true).in('unidade', alvos),
    sb.from('btx_vendas').select('id,unidade,data_venda,numero_nf,itens:btx_vendas_itens(id,produto_id,qtd_carteiras)').eq('ativo', true).in('unidade', alvos),
    sb.from('btx_ajustes_estoque').select('*').eq('ativo', true).in('unidade', alvos),
  ])
  const produtosNorm = normalizarProdutosEstoque(ordenarProdutos((produtosRes.data ?? []) as Produto[]))
  const aberturas = (aberturasRes.data ?? []) as (AberturaEstoqueDb & { unidade: string })[]
  const compras = (comprasRes.data ?? []) as unknown as (CompraEstoqueDb & { unidade: string })[]
  const vendas = (vendasRes.data ?? []) as unknown as (VendaEstoqueDb & { unidade: string })[]
  const ajustes = (ajustesRes.data ?? []) as AjusteEstoque[]

  const saldosPorProduto = new Map<string, Record<string, number>>()
  for (const u of alvos) {
    const painel = calcularEstoque({
      ano, mes, produtos: produtosNorm,
      aberturas: normalizarAberturasEstoque(aberturas.filter(a => a.unidade === u)),
      movimentos: normalizarMovimentosEstoque(compras.filter(c => c.unidade === u), vendas.filter(v => v.unidade === u), ajustes.filter(a => a.unidade === u)),
    })
    for (const s of painel.saldos) {
      const r = saldosPorProduto.get(s.produtoId) ?? {}
      r[u] = s.saldoAtual
      saldosPorProduto.set(s.produtoId, r)
    }
  }
  return produtosNorm.map(p => ({
    id: p.id, nome: p.nome, fator: p.fatorConversao,
    unidadeBase: p.unidadeBase ?? '', unidadeMaior: p.unidadeMaior ?? '',
    saldos: saldosPorProduto.get(p.id) ?? {},
  }))
}

// saldo em caixas (unidade maior), 1 casa quando fracionário
function caixas(base: number, fator: number): string {
  const q = base / (fator || 1)
  return (Number.isInteger(q) ? q : Number(q.toFixed(1))).toLocaleString('pt-BR')
}

function CardEstoque({ titulo, linhas, unidade }: { titulo: string; linhas: LinhaEstoque[]; unidade: string }) {
  return (
    <Link href="/estoque-atual" className="card" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{titulo} <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 11 }}>· estoque em caixas</span></div>
      {linhas.map(l => {
        const v = l.saldos[unidade] ?? 0
        return (
          <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
            <span>{l.nome}</span>
            <span className={`mono${v < 0 ? ' text-red' : ''}`}>{caixas(v, l.fator)}</span>
          </div>
        )
      })}
    </Link>
  )
}

function SecaoEstoque({ linhas, unidades, unidadeUnica }: { linhas: LinhaEstoque[]; unidades: string[]; unidadeUnica: string | null }) {
  const comSaldo = linhas.filter(l => Object.keys(l.saldos).length > 0)
  if (comSaldo.length === 0) return null
  if (unidadeUnica) {
    return (
      <div style={{ marginTop: 24, maxWidth: 560 }}>
        <CardEstoque titulo={SHORT[unidadeUnica] ?? unidadeUnica} linhas={comSaldo} unidade={unidadeUnica} />
      </div>
    )
  }
  return (
    <div className="grid-3" style={{ marginTop: 24 }}>
      {unidades.map(u => <CardEstoque key={u} titulo={SHORT[u] ?? u} linhas={comSaldo} unidade={u} />)}
    </div>
  )
}

const SHORT: Record<string, string> = {
  'NEW BLUETEX MG': 'MG', 'NEW BLUETEX SC': 'SC', 'NEW BLUETEX AM': 'AM',
  'GB SP': 'GB SP', 'GB CE': 'GB CE', 'GB MA': 'GB MA',
}

async function carregarUnidade(sb: ReturnType<typeof createClient>, unidade: string, ano: number, mes: number, hojeStr: string): Promise<ResumoUnidade> {
  const competenciaSel = chaveCompetencia(ano, mes)
  const [basesRes, parcelasRes, despesasRes, saldoRes] = await Promise.all([
    sb.from('btx_caixa_mensal').select('*').eq('unidade', unidade).order('ano', { ascending: false }).order('mes', { ascending: false }),
    sb.from('btx_parcelas').select('id,tipo,origem,origem_id,numero_parcela,numero_boleto,vencimento,valor,status,data_pagamento,ativo,observacoes,origem_sistema,categoria_vhsys').eq('unidade', unidade).eq('ativo', true).neq('status', 'cancelado'),
    sb.from('btx_despesas').select('id, categoria:btx_categorias_despesas(grupo)').eq('unidade', unidade).eq('ativo', true),
    sb.from('btx_vhsys_saldos_bancarios').select('saldo_atual,consultado_em').eq('unidade', unidade).order('consultado_em', { ascending: false }).limit(1),
  ])
  const saldoBancario = (saldoRes.data?.[0]?.saldo_atual as number | undefined) ?? null

  const bases = (basesRes.data ?? []) as { ano: number; mes: number; saldo_inicial: number }[]
  const baseVigente = bases.find(b => chaveCompetencia(b.ano, b.mes) <= competenciaSel)
  const competenciaBase = baseVigente ? chaveCompetencia(baseVigente.ano, baseVigente.mes) : competenciaSel

  const parcelas = (parcelasRes.data ?? []) as ParcelaFinanceira[]
  const ids = parcelas.map(p => p.id)
  const pagRes = ids.length
    ? await sb.from('btx_pagamentos_parcela').select('id,parcela_id,valor,data_pagamento').in('parcela_id', ids)
    : { data: [] as PagamentoParcela[] }
  const pagamentos = ((pagRes.data ?? []) as { id: string; parcela_id: string; valor: number; data_pagamento: string }[])
    .map(p => ({ id: p.id, parcela_id: p.parcela_id, valor: Number(p.valor), data_pagamento: p.data_pagamento }))

  const grupoPorDespesa = new Map<string, GrupoCategoria>()
  for (const d of (despesasRes.data ?? []) as unknown as { id: string; categoria: { grupo: GrupoCategoria } | null }[]) {
    grupoPorDespesa.set(d.id, d.categoria?.grupo ?? 'outros')
  }

  return calcularResumoUnidade({
    unidade, ano, mes, hoje: hojeStr,
    saldoBase: Number(baseVigente?.saldo_inicial ?? 0),
    competenciaBase, parcelas, pagamentos, grupoPorDespesa,
    saldoBancario,
  })
}

// Saldo início do mês + recebido − pago = saldo novo, os quatro números
// que fecham a conta do mês (só realizado, não entra "a receber" projetado).
function Waterfall({ resumo }: { resumo: ResumoUnidade }) {
  const tile = (label: string, valor: number, cor: string) => (
    <div style={{ background: 'var(--surface, #fff)', padding: '14px 18px' }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
      <div className="mono" style={{ fontSize: 19, fontWeight: 600, color: cor }}>{formatMoeda(valor)}</div>
    </div>
  )
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1,
      background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 10,
      overflow: 'hidden', marginBottom: 20,
    }}>
      {tile('Saldo início do mês', resumo.saldoInicioMes, 'var(--navy)')}
      {tile('+ Recebido no mês', resumo.totalEntrou, 'var(--green)')}
      {tile('− Pago no mês', resumo.totalPagou, 'var(--red)')}
      {tile('Saldo novo', resumo.saldoHoje, 'var(--navy)')}
    </div>
  )
}

interface ItemLancamento { id: string; descricao: string; vencimento: string; valor: number; categoria: string }

function agruparPorCategoria(itens: ItemLancamento[]): { categoria: string; total: number; itens: ItemLancamento[] }[] {
  const mapa = new Map<string, ItemLancamento[]>()
  for (const item of itens) {
    const lista = mapa.get(item.categoria) ?? []
    lista.push(item)
    mapa.set(item.categoria, lista)
  }
  return [...mapa.entries()]
    .map(([categoria, lista]) => ({
      categoria,
      total: lista.reduce((s, i) => s + i.valor, 0),
      itens: lista.sort((a, b) => a.vencimento.localeCompare(b.vencimento)),
    }))
    .sort((a, b) => b.total - a.total)
}

// Duas colunas (recebido/pago), cada categoria é um <details> — abre/fecha
// sem JS de estado, só a maior categoria de cada lado vem aberta por
// padrão. Botões no topo forçam expandir/recolher tudo de uma vez.
function CategoriasColapsaveis({ resumo, onClickItem }: { resumo: ResumoUnidade; onClickItem: (c: ContaPagar | ContaReceber) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const recebido = agruparPorCategoria(
    resumo.contasReceber.filter(c => c.paga).map(c => ({ id: c.id, descricao: c.descricao, vencimento: c.vencimento, valor: c.valor, categoria: c.categoria })),
  )
  const pago = agruparPorCategoria(
    resumo.contasPagar.filter(c => c.paga).map(c => ({ id: c.id, descricao: c.descricao, vencimento: c.vencimento, valor: c.valor, categoria: c.categoria })),
  )
  const porId = new Map([...resumo.contasReceber, ...resumo.contasPagar].map(c => [c.id, c]))

  const painel = (titulo: string, grupos: ReturnType<typeof agruparPorCategoria>, total: number, cor: string, corBg: string) => (
    <div className="card" style={{ flex: 1, minWidth: 320, padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '14px 18px', background: corBg, borderBottom: '1px solid var(--border)' }}>
        <strong style={{ fontSize: 13.5 }}>{titulo}</strong>
        <span className="mono" style={{ fontSize: 15, fontWeight: 700, color: cor }}>{formatMoeda(total)}</span>
      </div>
      <div style={{ padding: 10, display: 'grid', gap: 8 }}>
        {grupos.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: 12, padding: '4px 4px' }}>Nada no mês.</span>}
        {grupos.map((g, i) => (
          <details key={g.categoria} open={i === 0} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <summary style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
              padding: '9px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: 'var(--bg, #f6f5f2)',
              listStyle: 'none',
            }}>
              <span>{g.categoria} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>{g.itens.length} lançamento{g.itens.length === 1 ? '' : 's'}</span></span>
              <span className="mono">{formatMoeda(g.total)}</span>
            </summary>
            {g.itens.map(item => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => { const c = porId.get(item.id); if (c) onClickItem(c) }}
                onKeyDown={e => { if (e.key === 'Enter') { const c = porId.get(item.id); if (c) onClickItem(c) } }}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 12px 7px 26px', fontSize: 12, borderTop: '1px solid var(--border)', cursor: 'pointer' }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.descricao}
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>{formatData(item.vencimento)}</span>
                </span>
                <span className="mono" style={{ flexShrink: 0, color: cor }}>{formatMoeda(item.valor)}</span>
              </div>
            ))}
          </details>
        ))}
      </div>
    </div>
  )

  return (
    <div ref={containerRef}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => containerRef.current?.querySelectorAll('details').forEach(d => { d.open = true })}>▾ Expandir tudo</button>
        <button className="btn btn-secondary btn-sm" onClick={() => containerRef.current?.querySelectorAll('details').forEach(d => { d.open = false })}>▸ Recolher tudo</button>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        {painel('Recebido no mês', recebido, resumo.totalEntrou, 'var(--green)', 'var(--green-bg, #e9f5ef)')}
        {painel('Pago no mês', pago, resumo.totalPagou, 'var(--red)', 'var(--red-bg, #fbeae9)')}
      </div>
    </div>
  )
}

function ColunaUnidade({ resumo, nome, short, expandidoInicial, mostrarTagUnidade, onClickHeader, onClickConta }: {
  resumo: ResumoUnidade; nome: string; short: string
  expandidoInicial: boolean; mostrarTagUnidade: boolean
  onClickHeader?: () => void; onClickConta: (c: ContaPagar | ContaReceber) => void
}) {
  const [abertos, setAbertos] = useState<Set<string>>(
    () => new Set(expandidoInicial ? resumo.gruposPagar.map(g => g.grupo) : [])
  )
  const toggle = (g: string) => setAbertos(prev => {
    const n = new Set(prev)
    n.has(g) ? n.delete(g) : n.add(g)
    return n
  })

  return (
    <div className="card">
      <div
        onClick={onClickHeader}
        title={nome}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, cursor: onClickHeader ? 'pointer' : 'default' }}
      >
        <div style={{ fontSize: 13, fontWeight: 700 }}>{short}</div>
        <div>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginRight: 6 }}>Resultado de caixa</span>
          <span className={`mono ${resumo.resultado >= 0 ? 'text-green' : 'text-red'}`} style={{ fontWeight: 700, fontSize: 13 }}>{formatMoeda(resumo.resultado)}</span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
        <span style={{ color: 'var(--text-muted)' }}>Saldo hoje</span>
        <span className="mono">{formatMoeda(resumo.saldoHoje)}</span>
      </div>
      {resumo.gruposPagar.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Sem contas a pagar</div>
      ) : resumo.gruposPagar.map(g => (
        <div key={g.grupo}>
          <button
            onClick={() => toggle(g.grupo)}
            style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
          >
            <span style={{ fontSize: 12, fontWeight: 600 }}>{abertos.has(g.grupo) ? '▾' : '▸'} {g.label}</span>
            <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>
              {formatMoeda(g.subtotal)}
              {g.pago > 0 && <span style={{ fontWeight: 400, color: 'var(--red)', fontSize: 11 }}> · {formatMoeda(g.pago)} pago</span>}
            </span>
          </button>
          {abertos.has(g.grupo) && g.contas.map(c => (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => onClickConta(c)}
              onKeyDown={e => { if (e.key === 'Enter') onClickConta(c) }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0 5px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
            >
              <div style={{ fontSize: 11, color: 'var(--red)' }}>
                {c.paga ? '✓ ' : c.vencida ? '⚠ ' : c.proxima ? '⏰ ' : ''}{c.descricao}
                {c.gerenciadoPorVhsys && <span className="badge badge-purple" style={{ marginLeft: 6 }}>VHSYS</span>}
                {mostrarTagUnidade && <span style={{ fontSize: 10, marginLeft: 6, color: 'var(--text-muted)' }}>{short}</span>}
                <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>{formatData(c.vencimento)}</span>
              </div>
              <span className="mono" style={{ fontSize: 12, color: 'var(--red)' }}>{formatMoeda(c.valor)}</span>
            </div>
          ))}
        </div>
      ))}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Total despesas</span>
        <span className="mono text-red" style={{ fontSize: 13, fontWeight: 700 }}>{formatMoeda(resumo.totalDespesas)}</span>
      </div>
    </div>
  )
}

function ModalConta({ conta, onClose, onGravou, readOnly }: {
  conta: ContaPagar | ContaReceber | null; onClose: () => void; onGravou: () => void; readOnly: boolean
}) {
  const sb = useMemo(() => createClient(), [])
  const [venc, setVenc] = useState('')
  const [val, setVal] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (conta) { setVenc(conta.vencimento); setVal(conta.valor) }
  }, [conta])

  if (!conta) return null
  const travado = readOnly || conta.gerenciadoPorVhsys

  async function run(patch: Record<string, unknown>) {
    setSaving(true)
    await sb.from('btx_parcelas').update(patch).eq('id', conta!.id)
    setSaving(false)
    onGravou()
  }

  return (
    <Modal
      open={!!conta}
      onClose={onClose}
      title={conta.descricao}
      size="sm"
      footer={travado ? (
        <button className="btn btn-secondary" onClick={onClose}>Fechar</button>
      ) : (
        <>
          <button className="btn btn-danger" disabled={saving} onClick={() => run({ status: 'cancelado' })}>Cancelar conta</button>
          <button className="btn btn-secondary" disabled={saving} onClick={() => run({ vencimento: venc, valor: val })}>Salvar alteração</button>
          <button className="btn btn-primary" disabled={saving} onClick={() => run({ status: 'pago', data_pagamento: hoje() })}>Marcar pago</button>
        </>
      )}
    >
      {conta.gerenciadoPorVhsys && (
        <div className="alert alert-amber" style={{ marginBottom: 12 }}>Gerenciado pelo VHSYS — edite lá; a próxima sincronização atualiza aqui.</div>
      )}
      <div className="form-group">
        <label className="form-label">Vencimento</label>
        <input className="form-input" type="date" value={venc} disabled={travado} onChange={e => setVenc(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Valor (R$)</label>
        <input className="form-input" type="number" step="0.01" value={val} disabled={travado} onChange={e => setVal(Number(e.target.value))} />
      </div>
    </Modal>
  )
}

export default function DashboardPage() {
  const { profile, unidadeAtiva } = useAuth()
  const sb = useMemo(() => createClient(), [])
  const veTudo = profile?.role === 'admin' || profile?.role === 'diretoria'
  const [mes, setMes] = useState(mesAtual())
  const [ano, setAno] = useState(anoAtual())
  const [aba, setAba] = useState<'consolidado' | Unidade>('consolidado')
  const [porUnidade, setPorUnidade] = useState<Partial<Record<string, ResumoUnidade>>>({})
  const [estoque, setEstoque] = useState<LinhaEstoque[]>([])
  const [loading, setLoading] = useState(true)
  const [contaAberta, setContaAberta] = useState<ContaPagar | ContaReceber | null>(null)
  const hojeStr = new Date().toISOString().slice(0, 10)

  const carregar = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    const alvos = veTudo ? UNIDADES : (unidadeAtiva ? [unidadeAtiva] : [])
    const res: Partial<Record<string, ResumoUnidade>> = {}
    try {
      const [settled, linhasEstoque] = await Promise.all([
        Promise.allSettled(alvos.map(u => carregarUnidade(sb, u, ano, mes, hojeStr))),
        alvos.length ? carregarEstoque(sb, ano, mes, alvos).catch(() => [] as LinhaEstoque[]) : Promise.resolve([] as LinhaEstoque[]),
      ])
      settled.forEach((s, i) => { if (s.status === 'fulfilled') res[alvos[i]] = s.value })
      setPorUnidade(res)
      setEstoque(linhasEstoque)
    } finally {
      setLoading(false)
    }
  }, [profile, veTudo, unidadeAtiva, sb, ano, mes, hojeStr])

  useEffect(() => { carregar() }, [carregar])

  function navMes(dir: number) {
    let m = mes + dir, a = ano
    if (m < 1) { m = 12; a-- }
    if (m > 12) { m = 1; a++ }
    setMes(m); setAno(a)
  }

  const unidadesComDados = UNIDADES.filter(u => porUnidade[u])
  const consolidado = veTudo ? consolidarResumos(unidadesComDados.map(u => porUnidade[u]!) ) : null
  const abaUnica: ResumoUnidade | null = !veTudo
    ? (unidadeAtiva ? porUnidade[unidadeAtiva] ?? null : null)
    : aba === 'consolidado' ? null : porUnidade[aba] ?? null
  const nomeUnica = !veTudo ? (unidadeAtiva ?? '') : (aba !== 'consolidado' ? aba : '')

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Painel Executivo</h1>
          <div className="page-subtitle">{getMesAnoLabel(mes, ano)}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navMes(-1)}>←</button>
          <span style={{ fontWeight: 600, fontSize: 13, minWidth: 130, textAlign: 'center' }}>{getMesAnoLabel(mes, ano)}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => navMes(1)}>→</button>
        </div>
      </div>

      {veTudo && (
        <div className="tabs">
          <button className={`tab${aba === 'consolidado' ? ' active' : ''}`} onClick={() => setAba('consolidado')}>◈ Consolidado</button>
          {UNIDADES.map(u => <button key={u} className={`tab${aba === u ? ' active' : ''}`} onClick={() => setAba(u)}>{SHORT[u]}</button>)}
        </div>
      )}

      <ModalConta
        conta={contaAberta}
        readOnly={profile?.role === 'diretoria'}
        onClose={() => setContaAberta(null)}
        onGravou={() => { setContaAberta(null); carregar() }}
      />

      {loading ? <div className="empty-state">Carregando...</div>
      : veTudo && aba === 'consolidado' ? (
        !consolidado || unidadesComDados.length === 0 ? <div className="empty-state">Sem dados.</div> : (
          <>
            {consolidado.parcelasVencidas > 0 && (
              <div className="alert alert-red" style={{ marginBottom: 16 }}>⚠ {consolidado.parcelasVencidas} conta(s) a pagar vencida(s) sem baixa</div>
            )}
            <Waterfall resumo={consolidado} />
            <CategoriasColapsaveis resumo={consolidado} onClickItem={setContaAberta} />
            <div className="grid-3">
              {unidadesComDados.map(u => (
                <ColunaUnidade
                  key={u}
                  resumo={porUnidade[u]!}
                  nome={u}
                  short={SHORT[u]}
                  expandidoInicial={false}
                  mostrarTagUnidade={false}
                  onClickHeader={() => setAba(u)}
                  onClickConta={setContaAberta}
                />
              ))}
            </div>
          </>
        )
      ) : !abaUnica ? <div className="empty-state">Selecione uma unidade.</div> : (
        <>
          {abaUnica.parcelasVencidas > 0 && (
            <div className="alert alert-red" style={{ marginBottom: 16 }}>⚠ {abaUnica.parcelasVencidas} conta(s) a pagar vencida(s) sem baixa</div>
          )}
          <Waterfall resumo={abaUnica} />
          <CategoriasColapsaveis resumo={abaUnica} onClickItem={setContaAberta} />
          <div>
            <ColunaUnidade
              resumo={abaUnica}
              nome={nomeUnica}
              short={SHORT[nomeUnica] ?? nomeUnica}
              expandidoInicial={true}
              mostrarTagUnidade={false}
              onClickConta={setContaAberta}
            />
          </div>
        </>
      )}

      {!loading && (
        <SecaoEstoque
          linhas={estoque}
          unidades={unidadesComDados}
          unidadeUnica={veTudo ? (aba === 'consolidado' ? null : aba) : (unidadeAtiva ?? null)}
        />
      )}
    </div>
  )
}
