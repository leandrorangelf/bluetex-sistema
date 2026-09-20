'use client'
export const dynamic = 'force-dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { formatMoeda, formatData, getMesAnoLabel, mesAtual, anoAtual, ordenarProdutos, labelFormaPagamento } from '@/lib/utils'
import { chaveCompetencia, type ParcelaFinanceira, type PagamentoParcela } from '@/lib/financeiro'
import { calcularResumoUnidade, consolidarResumos, type ResumoUnidade, type ContaPagar, type ContaReceber, type VendaInfo } from '@/lib/painel-resumo'
import { calcularEstoque, calcularPrecoMedioVenda, calcularPrecoMedioVendaHistorico, mesclarPrecoMedioVenda, normalizarAberturasEstoque, normalizarMovimentosEstoque, normalizarProdutosEstoque, nomeRelacaoEstoque, type AberturaEstoqueDb, type CompraEstoqueDb, type LinhaHistoricoVendaVhsys, type VendaEstoqueDb, type RelacaoNomeEstoque } from '@/lib/estoque'
import { VHSYS_UNIDADES } from '@/lib/vhsys/unidades'
import { UNIDADES, type Unidade, type GrupoCategoria, type Produto, type AjusteEstoque } from '@/types'
import Modal from '@/components/Modal'

interface LinhaEstoque {
  id: string; nome: string; fator: number; unidadeBase: string; unidadeMaior: string
  saldos: Record<string, number>
  precoMedioVenda: number
}

async function carregarEstoque(sb: ReturnType<typeof createClient>, ano: number, mes: number, alvos: string[]): Promise<LinhaEstoque[]> {
  const codigosVhsys = VHSYS_UNIDADES.filter(u => alvos.includes(u.unidade)).map(u => u.codigo)
  const [produtosRes, aberturasRes, comprasRes, vendasRes, ajustesRes, historicoRes] = await Promise.all([
    sb.from('btx_produtos').select('*, unidade_base:btx_unidades_medida!unidade_base_id(nome), unidade_maior:btx_unidades_medida!unidade_maior_id(nome)').eq('ativo', true),
    sb.from('btx_estoque_inicial').select('id,unidade,produto_id,mes,ano,qtd_carteiras').in('unidade', alvos),
    sb.from('btx_compras').select('id,unidade,data_compra,numero_nf,itens:btx_compras_itens(id,produto_id,qtd_carteiras)').eq('ativo', true).in('unidade', alvos),
    sb.from('btx_vendas').select('id,unidade,data_venda,numero_nf,itens:btx_vendas_itens(id,produto_id,qtd_carteiras,valor)').eq('ativo', true).in('unidade', alvos),
    sb.from('btx_ajustes_estoque').select('*').eq('ativo', true).in('unidade', alvos),
    codigosVhsys.length ? sb.from('btx_vhsys_vendas_historico').select('produto,qtd_caixas,valor').in('unidade_codigo', codigosVhsys) : Promise.resolve({ data: [] as LinhaHistoricoVendaVhsys[] }),
  ])
  const produtosNorm = normalizarProdutosEstoque(ordenarProdutos((produtosRes.data ?? []) as Produto[]))
  const aberturas = (aberturasRes.data ?? []) as (AberturaEstoqueDb & { unidade: string })[]
  const compras = (comprasRes.data ?? []) as unknown as (CompraEstoqueDb & { unidade: string })[]
  const vendas = (vendasRes.data ?? []) as unknown as (VendaEstoqueDb & { unidade: string })[]
  const ajustes = (ajustesRes.data ?? []) as AjusteEstoque[]
  const historicoVendas = (historicoRes.data ?? []) as LinhaHistoricoVendaVhsys[]
  const precoMedioVendaHistorico = calcularPrecoMedioVendaHistorico(historicoVendas, produtosNorm.map(p => ({ id: p.id, nome: p.nome, fatorConversao: p.fatorConversao })))
  const precoMedioVenda = mesclarPrecoMedioVenda(calcularPrecoMedioVenda(vendas), precoMedioVendaHistorico)

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
    precoMedioVenda: precoMedioVenda.get(p.id) ?? 0,
  }))
}

// saldo em caixas (unidade maior), 1 casa quando fracionário
function caixas(base: number, fator: number): string {
  const q = base / (fator || 1)
  return (Number.isInteger(q) ? q : Number(q.toFixed(1))).toLocaleString('pt-BR')
}

function CardEstoque({ titulo, linhas, unidade }: { titulo: string; linhas: LinhaEstoque[]; unidade: string }) {
  const valorEstoque = linhas.reduce((total, l) => total + Math.max(l.saldos[unidade] ?? 0, 0) * l.precoMedioVenda, 0)
  return (
    <Link href="/estoque-atual" className="card card-accent card-hover" style={{ textDecoration: 'none', color: 'inherit', display: 'block', '--accent-cor': 'var(--brand)' } as React.CSSProperties}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{titulo} <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 11 }}>· estoque em caixas</span></div>
      {linhas.map(l => {
        const v = l.saldos[unidade] ?? 0
        const valorLinha = Math.max(v, 0) * l.precoMedioVenda
        return (
          <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
            <span>{l.nome}</span>
            <span style={{ textAlign: 'right' }}>
              <span className={`mono${v < 0 ? ' text-red' : ''}`}>{caixas(v, l.fator)}</span>
              <span className="mono" style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)' }}>
                {valorLinha > 0 ? formatMoeda(valorLinha) : '—'}
              </span>
            </span>
          </div>
        )
      })}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Valor de estoque <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 10 }}>(preço médio de venda)</span></span>
        <span className="mono text-green" style={{ fontSize: 13, fontWeight: 700 }}>{formatMoeda(valorEstoque)}</span>
      </div>
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
    sb.from('btx_parcelas').select('id,tipo,origem,origem_id,numero_parcela,numero_boleto,vencimento,valor,status,data_pagamento,ativo,observacoes,origem_sistema,categoria_vhsys,forma_pagamento').eq('unidade', unidade).eq('ativo', true).neq('status', 'cancelado'),
    sb.from('btx_despesas').select('id, descricao, categoria:btx_categorias_despesas(grupo)').eq('unidade', unidade).eq('ativo', true),
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
  const pagarInfoPorId = new Map<string, string>()
  for (const d of (despesasRes.data ?? []) as unknown as { id: string; descricao: string | null; categoria: { grupo: GrupoCategoria } | null }[]) {
    grupoPorDespesa.set(d.id, d.categoria?.grupo ?? 'outros')
    if (d.descricao?.trim()) pagarInfoPorId.set(`despesa:${d.id}`, d.descricao.trim())
  }

  const vendaIds = [...new Set(parcelas.filter(p => p.tipo === 'receber' && p.origem === 'venda' && p.origem_id).map(p => p.origem_id as string))]
  const vendaInfoPorId = new Map<string, VendaInfo>()
  if (vendaIds.length) {
    const { data: vendas } = await sb.from('btx_vendas').select('id,numero_nf,cliente:btx_clientes(nome)').in('id', vendaIds)
    for (const v of (vendas ?? []) as unknown as { id: string; numero_nf: string | null; cliente: RelacaoNomeEstoque }[]) {
      vendaInfoPorId.set(v.id, { cliente: nomeRelacaoEstoque(v.cliente) ?? null, numeroNf: v.numero_nf })
    }
  }

  const compraIds = [...new Set(parcelas.filter(p => p.origem === 'compra' && p.origem_id).map(p => p.origem_id as string))]
  if (compraIds.length) {
    const { data: compras } = await sb.from('btx_compras').select('id,fornecedor:btx_fornecedores(nome)').in('id', compraIds)
    for (const c of (compras ?? []) as unknown as { id: string; fornecedor: RelacaoNomeEstoque }[]) {
      const nome = nomeRelacaoEstoque(c.fornecedor)
      if (nome) pagarInfoPorId.set(`compra:${c.id}`, nome)
    }
  }

  return calcularResumoUnidade({
    unidade, ano, mes, hoje: hojeStr,
    saldoBase: Number(baseVigente?.saldo_inicial ?? 0),
    competenciaBase, parcelas, pagamentos, grupoPorDespesa, vendaInfoPorId, pagarInfoPorId,
    saldoBancario,
  })
}

// Saldo início do mês + recebido − pago = saldo novo, os quatro números
// que fecham a conta do mês (só realizado, não entra "a receber" projetado).
// O saldo início é editável quando dá pra identificar uma unidade única —
// os outros três decorrem dos lançamentos, então a conta sempre fecha.
function Waterfall({ resumo, onEditarSaldo }: { resumo: ResumoUnidade; onEditarSaldo?: () => void }) {
  const tile = (label: string, valor: number, cor: string, bg: string, onEdit?: () => void) => (
    <div style={{ background: bg, padding: '16px 18px', position: 'relative', borderRadius: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: cor, opacity: 0.75 }}>{label}</div>
        {onEdit && (
          <button
            onClick={onEdit}
            title="Editar saldo do mês"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: cor, opacity: 0.6, fontSize: 12, padding: 0, lineHeight: 1 }}
          >✎</button>
        )}
      </div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: cor }}>{formatMoeda(valor)}</div>
    </div>
  )
  const divergeDoBanco = resumo.saldoBancarioReferencia != null && Math.abs(resumo.saldoBancarioReferencia - resumo.saldoHoje) >= 0.01
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {tile('Saldo início do mês', resumo.saldoInicioMes, 'var(--brand)', 'var(--brand-light)', onEditarSaldo)}
        {tile('+ Recebido no mês', resumo.totalEntrou, 'var(--green)', 'var(--green-light)')}
        {tile('− Pago no mês', resumo.totalPagou, 'var(--red)', 'var(--red-light)')}
        {tile('Saldo novo', resumo.saldoHoje, '#fff', 'var(--navy)')}
      </div>
      {divergeDoBanco && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
          Extrato do banco (referência): {formatMoeda(resumo.saldoBancarioReferencia!)} — diferente do saldo calculado acima. Confira os lançamentos ou ajuste o saldo do mês.
        </div>
      )}
    </div>
  )
}

// Todos os recebíveis em aberto (vencidos + a vencer), independente do mês —
// "quanto tenho na rua". Lista colapsável, agrupada em vencidos/a vencer.
function CardRecebiveis({ resumo, onClickConta }: { resumo: ResumoUnidade; onClickConta: (c: ContaPagar | ContaReceber) => void }) {
  const { recebiveisEmAberto: r } = resumo
  const [abertoVencido, setAbertoVencido] = useState(true)
  const [abertoAVencer, setAbertoAVencer] = useState(false)
  const vencidas = r.contas.filter(c => c.vencida)
  const aVencer = r.contas.filter(c => !c.vencida)

  const grupo = (titulo: string, cor: string, total: number, contas: ContaReceber[], aberto: boolean, toggle: () => void) => (
    <div>
      <button
        onClick={toggle}
        style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
      >
        <span style={{ fontSize: 12, fontWeight: 600 }}>{aberto ? '▾' : '▸'} {titulo} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({contas.length})</span></span>
        <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: cor }}>{formatMoeda(total)}</span>
      </button>
      {aberto && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 6 }}>
          <thead>
            <tr style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' }}>
              <th style={{ textAlign: 'left', fontWeight: 600, padding: '4px 6px 4px 14px' }}>Data</th>
              <th style={{ textAlign: 'left', fontWeight: 600, padding: '4px 6px' }}>Descrição</th>
              <th style={{ textAlign: 'left', fontWeight: 600, padding: '4px 6px' }}>NF</th>
              <th style={{ textAlign: 'center', fontWeight: 600, padding: '4px 6px' }}>Parcela</th>
              <th style={{ textAlign: 'left', fontWeight: 600, padding: '4px 6px' }}>Tipo de pagto</th>
              <th style={{ textAlign: 'right', fontWeight: 600, padding: '4px 14px 4px 6px' }}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {contas.map(c => (
              <tr
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => onClickConta(c)}
                onKeyDown={e => { if (e.key === 'Enter') onClickConta(c) }}
                style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 12 }}
              >
                <td className="mono" style={{ padding: '5px 6px 5px 14px', color: cor, whiteSpace: 'nowrap' }}>{formatData(c.vencimento)}</td>
                <td style={{ padding: '5px 6px', color: cor }}>
                  {c.vencida ? '⚠ ' : c.proxima ? '⏰ ' : ''}{c.descricao}
                  {c.gerenciadoPorVhsys && <span className="badge badge-purple" style={{ marginLeft: 6 }}>VHSYS</span>}
                </td>
                <td className="mono" style={{ padding: '5px 6px', whiteSpace: 'nowrap' }}>{c.numeroNf ?? '—'}</td>
                <td className="mono" style={{ padding: '5px 6px', textAlign: 'center' }}>{c.numeroParcela}</td>
                <td style={{ padding: '5px 6px' }}>
                  {c.formaPagamento && <span className="badge badge-gray" style={{ fontSize: 9, padding: '2px 5px' }}>{labelFormaPagamento(c.formaPagamento)}</span>}
                </td>
                <td className="mono" style={{ padding: '5px 14px 5px 6px', textAlign: 'right', color: cor }}>{formatMoeda(c.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )

  return (
    <div className="card card-accent" style={{ marginBottom: 20, '--accent-cor': 'var(--green)' } as React.CSSProperties}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>A receber — na rua</div>
        <span className="mono" style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>{formatMoeda(r.total)}</span>
      </div>
      {r.contas.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Sem recebíveis em aberto</div>
      ) : (
        <>
          {vencidas.length > 0 && grupo('Vencidos', 'var(--red)', r.vencido, vencidas, abertoVencido, () => setAbertoVencido(v => !v))}
          {aVencer.length > 0 && grupo('A vencer', 'var(--navy)', r.aVencer, aVencer, abertoAVencer, () => setAbertoAVencer(v => !v))}
        </>
      )}
    </div>
  )
}

interface ItemLancamento { id: string; descricao: string; data: string; valor: number; categoria: string; formaPagamento: 'boleto' | 'especie' | 'pix' | 'debito' | 'tarifa_bancaria' | null }

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
      itens: lista.sort((a, b) => a.data.localeCompare(b.data)),
    }))
    .sort((a, b) => b.total - a.total)
}

// Duas colunas (recebido/pago), cada categoria é um <details> — abre/fecha
// sem JS de estado, só a maior categoria de cada lado vem aberta por
// padrão. Botões no topo forçam expandir/recolher tudo de uma vez.
function CategoriasColapsaveis({ resumo, onClickItem }: { resumo: ResumoUnidade; onClickItem: (c: ContaPagar | ContaReceber) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const recebido = agruparPorCategoria(
    resumo.contasReceber.filter(c => c.paga).map(c => ({ id: c.id, descricao: c.descricao, data: c.dataPagamento ?? c.vencimento, valor: c.valor, categoria: c.categoria, formaPagamento: c.formaPagamento })),
  )
  const pago = agruparPorCategoria(
    resumo.contasPagar.filter(c => c.paga).map(c => ({ id: c.id, descricao: c.descricao, data: c.dataPagamento ?? c.vencimento, valor: c.valor, categoria: c.categoria, formaPagamento: c.formaPagamento })),
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
        {grupos.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '62px 64px 1fr auto', gap: 8, padding: '0 12px', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' }}>
            <span>Data</span><span>Tipo</span><span>Descrição</span><span style={{ textAlign: 'right' }}>Valor</span>
          </div>
        )}
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
                style={{ display: 'grid', gridTemplateColumns: '62px 64px 1fr auto', alignItems: 'center', gap: 8, padding: '7px 12px', fontSize: 12, borderTop: '1px solid var(--border)', cursor: 'pointer' }}
              >
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{formatData(item.data)}</span>
                <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{item.formaPagamento ? labelFormaPagamento(item.formaPagamento) : '—'}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.descricao}</span>
                <span className="mono" style={{ color: cor }}>{formatMoeda(item.valor)}</span>
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
    <div className="card card-accent" style={{ padding: 14, fontSize: 12, '--accent-cor': 'var(--red)' } as React.CSSProperties}>
      <div
        onClick={onClickHeader}
        title={nome}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, cursor: onClickHeader ? 'pointer' : 'default' }}
      >
        <div style={{ fontSize: 12, fontWeight: 700 }}>{short}</div>
        <div>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', marginRight: 6 }}>Resultado</span>
          <span className={`mono ${resumo.resultado >= 0 ? 'text-green' : 'text-red'}`} style={{ fontWeight: 700, fontSize: 12 }}>{formatMoeda(resumo.resultado)}</span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0 8px' }}>
        <span style={{ color: 'var(--text-muted)' }}>Saldo hoje</span>
        <span className="mono">{formatMoeda(resumo.saldoHoje)}</span>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>Ainda a pagar</div>
      {resumo.gruposPagar.filter(g => g.subtotal > 0).length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '54px 46px 1fr auto', gap: 8, padding: '0 0 2px 14px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' }}>
          <span>Venc.</span><span>Tipo</span><span>Descrição</span><span style={{ textAlign: 'right' }}>Valor</span>
        </div>
      )}
      {/* só grupos com algo ainda em aberto — o que já foi pago aparece em "Pago no mês" lá em cima, sem repetir aqui */}
      {resumo.gruposPagar.filter(g => g.subtotal > 0).length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Sem contas em aberto</div>
      ) : resumo.gruposPagar.filter(g => g.subtotal > 0).map(g => (
        <div key={g.grupo}>
          <button
            onClick={() => toggle(g.grupo)}
            style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
          >
            <span style={{ fontSize: 12, fontWeight: 600 }}>{abertos.has(g.grupo) ? '▾' : '▸'} {g.label}</span>
            <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>{formatMoeda(g.subtotal)}</span>
          </button>
          {abertos.has(g.grupo) && g.contas.filter(c => !c.paga).map(c => (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => onClickConta(c)}
              onKeyDown={e => { if (e.key === 'Enter') onClickConta(c) }}
              style={{ display: 'grid', gridTemplateColumns: '54px 46px 1fr auto', alignItems: 'center', gap: 8, padding: '5px 0 5px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
            >
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{formatData(c.vencimento)}</span>
              <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{c.formaPagamento ? labelFormaPagamento(c.formaPagamento) : '—'}</span>
              <span style={{ fontSize: 11, color: 'var(--red)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.vencida ? '⚠ ' : c.proxima ? '⏰ ' : ''}{c.descricao}
                {c.gerenciadoPorVhsys && <span className="badge badge-purple" style={{ marginLeft: 6 }}>VHSYS</span>}
                {mostrarTagUnidade && <span style={{ fontSize: 10, marginLeft: 6, color: 'var(--text-muted)' }}>{short}</span>}
              </span>
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

function ModalConta({ conta, onClose, onGravou, readOnly, podeExcluir }: {
  conta: ContaPagar | ContaReceber | null; onClose: () => void; onGravou: () => void; readOnly: boolean; podeExcluir: boolean
}) {
  const sb = useMemo(() => createClient(), [])
  const [venc, setVenc] = useState('')
  const [val, setVal] = useState(0)
  const [obs, setObs] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (conta) { setVenc(conta.vencimento); setVal(conta.valor); setObs(conta.observacoes) }
  }, [conta])

  if (!conta) return null
  const travado = readOnly || conta.gerenciadoPorVhsys
  const tipo: 'pagar' | 'receber' = 'grupo' in conta ? 'pagar' : 'receber'
  const hrefBaixa = `/${tipo === 'pagar' ? 'parcelas-pagar' : 'parcelas-receber'}?abrir=${conta.id}`

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
      size="md"
      footer={travado ? (
        <>
          <button className="btn btn-secondary" onClick={onClose}>Fechar</button>
          <Link href={hrefBaixa} className="btn btn-primary" onClick={onClose}>Abrir em {tipo === 'pagar' ? 'Contas a Pagar' : 'Contas a Receber'} →</Link>
        </>
      ) : (
        <>
          {podeExcluir && <button className="btn btn-danger" disabled={saving} onClick={() => run({ status: 'cancelado' })}>Cancelar conta</button>}
          <button className="btn btn-secondary" disabled={saving} onClick={() => run({ vencimento: venc, valor: val, observacoes: obs.trim() || null })}>Salvar alteração</button>
          <Link href={hrefBaixa} className="btn btn-primary" onClick={onClose}>Dar baixa / pagamento →</Link>
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
      <div className="form-group">
        <label className="form-label">Descrição / observação</label>
        <textarea
          className="form-input"
          rows={3}
          placeholder="Ex.: nome do cliente, fornecedor, motivo do pagamento..."
          value={obs}
          disabled={travado}
          onChange={e => setObs(e.target.value)}
        />
      </div>
    </Modal>
  )
}

// Edita o saldo início do mês (btx_caixa_mensal.saldo_inicial) da unidade/mês
// selecionados. Recebido e pago já são calculados pelos lançamentos, então
// só esse número precisa de ajuste manual pra a conta fechar certo.
function ModalSaldo({ aberto, unidade, ano, mes, saldoAtual, onClose, onGravou }: {
  aberto: boolean; unidade: string; ano: number; mes: number; saldoAtual: number
  onClose: () => void; onGravou: () => void
}) {
  const sb = useMemo(() => createClient(), [])
  const [valor, setValor] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (aberto) setValor(saldoAtual) }, [aberto, saldoAtual])

  async function salvar() {
    setSaving(true)
    await sb.from('btx_caixa_mensal').upsert(
      { unidade, ano, mes, saldo_inicial: valor, updated_at: new Date().toISOString() },
      { onConflict: 'unidade,mes,ano' },
    )
    setSaving(false)
    onGravou()
  }

  return (
    <Modal
      open={aberto}
      onClose={onClose}
      title={`Saldo início do mês — ${getMesAnoLabel(mes, ano)}`}
      size="sm"
      footer={<>
        <button className="btn btn-secondary" disabled={saving} onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={saving} onClick={salvar}>Salvar</button>
      </>}
    >
      <div className="form-group">
        <label className="form-label">Saldo em caixa no dia 1º do mês (R$)</label>
        <input className="form-input" type="number" step="0.01" value={valor} onChange={e => setValor(Number(e.target.value))} />
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        Recebido e pago no mês somam a partir daqui — ajuste esse número pra o saldo novo fechar certo.
      </p>
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
  const [editandoSaldo, setEditandoSaldo] = useState(false)
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
        readOnly={profile?.role !== 'admin'}
        podeExcluir={profile?.role === 'admin'}
        onClose={() => setContaAberta(null)}
        onGravou={() => { setContaAberta(null); carregar() }}
      />

      {abaUnica && nomeUnica && (
        <ModalSaldo
          aberto={editandoSaldo}
          unidade={nomeUnica}
          ano={ano}
          mes={mes}
          saldoAtual={abaUnica.saldoInicioMes}
          onClose={() => setEditandoSaldo(false)}
          onGravou={() => { setEditandoSaldo(false); carregar() }}
        />
      )}

      {loading ? <div className="empty-state">Carregando...</div>
      : veTudo && aba === 'consolidado' ? (
        !consolidado || unidadesComDados.length === 0 ? <div className="empty-state">Sem dados.</div> : (
          <>
            {consolidado.parcelasVencidas > 0 && (
              <div className="alert alert-red" style={{ marginBottom: 16 }}>⚠ {consolidado.parcelasVencidas} conta(s) a pagar vencida(s) sem baixa</div>
            )}
            <Waterfall resumo={consolidado} />
            <CardRecebiveis resumo={consolidado} onClickConta={setContaAberta} />
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
          <Waterfall resumo={abaUnica} onEditarSaldo={profile?.role === 'admin' ? () => setEditandoSaldo(true) : undefined} />
          <CardRecebiveis resumo={abaUnica} onClickConta={setContaAberta} />
          <CategoriasColapsaveis resumo={abaUnica} onClickItem={setContaAberta} />
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 0.75fr) minmax(0, 1.25fr)', gap: 16, alignItems: 'start' }}>
            <ColunaUnidade
              resumo={abaUnica}
              nome={nomeUnica}
              short={SHORT[nomeUnica] ?? nomeUnica}
              expandidoInicial={true}
              mostrarTagUnidade={false}
              onClickConta={setContaAberta}
            />
            {estoque.filter(l => Object.keys(l.saldos).length > 0).length > 0 && (
              <CardEstoque titulo={SHORT[nomeUnica] ?? nomeUnica} linhas={estoque.filter(l => Object.keys(l.saldos).length > 0)} unidade={nomeUnica} />
            )}
          </div>
        </>
      )}

      {!loading && veTudo && aba === 'consolidado' && (
        <SecaoEstoque
          linhas={estoque}
          unidades={unidadesComDados}
          unidadeUnica={null}
        />
      )}
    </div>
  )
}
