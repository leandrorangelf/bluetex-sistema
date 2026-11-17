'use client'
export const dynamic = 'force-dynamic'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { formatMoeda, formatData, getMesAnoLabel, mesAtual, anoAtual, ordenarProdutos, labelFormaPagamento, hoje } from '@/lib/utils'
import { chaveCompetencia, type ParcelaFinanceira, type PagamentoParcela } from '@/lib/financeiro'
import { calcularResumoUnidade, consolidarResumos, type ResumoUnidade, type ContaPagar, type ContaReceber, type VendaInfo } from '@/lib/painel-resumo'
import { calcularEstoque, calcularPrecoMedioVenda, calcularPrecoMedioVendaHistorico, mesclarPrecoMedioVenda, normalizarAberturasEstoque, normalizarMovimentosEstoque, normalizarProdutosEstoque, nomeRelacaoEstoque, type AberturaEstoqueDb, type CompraEstoqueDb, type LinhaHistoricoVendaVhsys, type VendaEstoqueDb, type RelacaoNomeEstoque } from '@/lib/estoque'
import { VHSYS_UNIDADES } from '@/lib/vhsys/unidades'
import { UNIDADES, type Unidade, type GrupoCategoria, type Produto, type AjusteEstoque } from '@/types'
import Modal from '@/components/Modal'

interface LinhaEstoque {
  id: string; nome: string; fator: number; unidadeBase: string; unidadeMaior: string
  saldos: Record<string, number>
  // preço médio de venda por unidade (mesma conta da tela Estoque) — o valor de estoque tem que bater nas duas telas
  precoPorUnidade: Record<string, number>
}

async function carregarEstoque(sb: ReturnType<typeof createClient>, ano: number, mes: number, alvos: string[]): Promise<LinhaEstoque[]> {
  const codigosVhsys = VHSYS_UNIDADES.filter(u => alvos.includes(u.unidade)).map(u => u.codigo)
  const [produtosRes, aberturasRes, comprasRes, vendasRes, ajustesRes, historicoRes] = await Promise.all([
    sb.from('btx_produtos').select('*, unidade_base:btx_unidades_medida!unidade_base_id(nome), unidade_maior:btx_unidades_medida!unidade_maior_id(nome)').eq('ativo', true),
    sb.from('btx_estoque_inicial').select('id,unidade,produto_id,mes,ano,qtd_carteiras').in('unidade', alvos),
    sb.from('btx_compras').select('id,unidade,data_compra,numero_nf,itens:btx_compras_itens(id,produto_id,qtd_carteiras)').eq('ativo', true).in('unidade', alvos),
    sb.from('btx_vendas').select('id,unidade,data_venda,numero_nf,itens:btx_vendas_itens(id,produto_id,qtd_carteiras,valor)').eq('ativo', true).in('unidade', alvos),
    sb.from('btx_ajustes_estoque').select('*').eq('ativo', true).in('unidade', alvos),
    codigosVhsys.length ? sb.from('btx_vhsys_vendas_historico').select('produto,qtd_caixas,valor,unidade_codigo').in('unidade_codigo', codigosVhsys) : Promise.resolve({ data: [] as LinhaHistoricoVendaVhsys[] }),
  ])
  const produtosNorm = normalizarProdutosEstoque(ordenarProdutos((produtosRes.data ?? []) as Produto[]))
  const aberturas = (aberturasRes.data ?? []) as (AberturaEstoqueDb & { unidade: string })[]
  const compras = (comprasRes.data ?? []) as unknown as (CompraEstoqueDb & { unidade: string })[]
  const vendas = (vendasRes.data ?? []) as unknown as (VendaEstoqueDb & { unidade: string })[]
  const ajustes = (ajustesRes.data ?? []) as AjusteEstoque[]
  const historicoVendas = (historicoRes.data ?? []) as (LinhaHistoricoVendaVhsys & { unidade_codigo?: string })[]
  const produtosLocais = produtosNorm.map(p => ({ id: p.id, nome: p.nome, fatorConversao: p.fatorConversao }))

  const saldosPorProduto = new Map<string, Record<string, number>>()
  const precoPorProduto = new Map<string, Record<string, number>>()
  for (const u of alvos) {
    const codigoU = VHSYS_UNIDADES.find(x => x.unidade === u)?.codigo
    const precoU = mesclarPrecoMedioVenda(
      calcularPrecoMedioVenda(vendas.filter(v => v.unidade === u)),
      calcularPrecoMedioVendaHistorico(codigoU ? historicoVendas.filter(h => h.unidade_codigo === codigoU) : [], produtosLocais),
    )
    for (const [produtoId, preco] of precoU) {
      const r = precoPorProduto.get(produtoId) ?? {}
      r[u] = preco
      precoPorProduto.set(produtoId, r)
    }
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
    precoPorUnidade: precoPorProduto.get(p.id) ?? {},
  }))
}

// saldo em caixas (unidade maior), 1 casa quando fracionário
function caixas(base: number, fator: number): string {
  const q = base / (fator || 1)
  return (Number.isInteger(q) ? q : Number(q.toFixed(1))).toLocaleString('pt-BR')
}

// Estoque de uma unidade: só produtos com saldo; zerados viram uma nota.
function CardEstoque({ linhas, unidade }: { titulo?: string; linhas: LinhaEstoque[]; unidade: string }) {
  const valor = (l: LinhaEstoque) => Math.max(l.saldos[unidade] ?? 0, 0) * (l.precoPorUnidade[unidade] ?? 0)
  const visiveis = linhas.filter(l => (l.saldos[unidade] ?? 0) !== 0)
  const zerados = linhas.length - visiveis.length
  const total = linhas.reduce((s, l) => s + valor(l), 0)
  return (
    <div className="est-table est-compact" style={{ '--est-cols': 'minmax(0, 1fr) 64px 110px' } as React.CSSProperties}>
      <div className="est-title">
        <strong>Estoque</strong>
        <Link href="/estoque-atual">Ver estoque completo →</Link>
      </div>
      {visiveis.length === 0 ? (
        <div className="est-note">Sem estoque nesta unidade.</div>
      ) : (
        <>
          <div className="est-row est-head"><span>Produto</span><span className="est-c">Caixas</span><span className="est-c">Valor</span></div>
          {visiveis.map(l => {
            const v = l.saldos[unidade] ?? 0
            const val = valor(l)
            return (
              <div key={l.id} className="est-row">
                <strong>{l.nome}</strong>
                <span className="est-c"><b className={`mono${v < 0 ? ' text-red' : ''}`}>{caixas(v, l.fator)}</b></span>
                <span className={`est-c mono${val > 0 ? '' : ' est-zero'}`}>{val > 0 ? formatMoeda(val) : '—'}</span>
              </div>
            )
          })}
          <div className="est-row est-total">
            <span>Valor de estoque</span><span />
            <span className="est-c"><b className="mono">{formatMoeda(total)}</b></span>
          </div>
        </>
      )}
      {zerados > 0 && visiveis.length > 0 && <div className="est-note">Produtos zerados: {zerados}.</div>}
    </div>
  )
}

// Contas a pagar ainda em aberto de uma unidade, por grupo. Vermelho só no que já venceu.
function CardPagarEmAberto({ resumo, onClickConta }: { resumo: ResumoUnidade; onClickConta: (c: ContaPagar | ContaReceber) => void }) {
  const grupos = resumo.gruposPagar.filter(g => g.subtotal > 0)
  const total = grupos.reduce((s, g) => s + g.subtotal, 0)
  return (
    <div className="card pg-card">
      <div className="cat-head">
        <strong>A pagar em aberto</strong>
        <span className="mono" style={{ fontSize: 15, fontWeight: 700 }}>{formatMoeda(total)}</span>
      </div>
      {grupos.length === 0 && <div className="cat-vazio">Sem contas em aberto.</div>}
      {grupos.map(g => (
        <details key={g.grupo} open className="cat-det">
          <summary className="cat-sum">
            <div className="cat-top"><span>{g.label}</span><span className="mono">{formatMoeda(g.subtotal)}</span></div>
          </summary>
          <div className="pg-items">
            {g.contas.filter(c => !c.paga).map(c => (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                className="pg-item"
                onClick={() => onClickConta(c)}
                onKeyDown={e => { if (e.key === 'Enter') onClickConta(c) }}
              >
                <span className="mono cat-muted" style={c.vencida ? { color: 'var(--red)' } : undefined}>{formatData(c.vencimento)}</span>
                <span className="cat-desc" title={`${c.descricao}${c.formaPagamento ? ` · ${labelFormaPagamento(c.formaPagamento)}` : ''}`}>
                  {c.descricao}
                  {c.vencida ? <span className="pg-chip pg-chip-red">vencida</span> : c.proxima ? <span className="pg-chip">em breve</span> : null}
                  {c.gerenciadoPorVhsys && <span className="badge badge-purple" style={{ marginLeft: 6 }}>VHSYS</span>}
                </span>
                <span className="mono" style={c.vencida ? { color: 'var(--red)' } : undefined}>{formatMoeda(c.valor)}</span>
              </div>
            ))}
          </div>
        </details>
      ))}
      <div className="pg-foot">Resultado <b className="mono" style={{ color: resumo.resultado >= 0 ? 'var(--green)' : 'var(--red)' }}>{formatMoeda(resumo.resultado)}</b></div>
    </div>
  )
}

// Visão consolidada do estoque: produto × unidade (caixas + valor), com total por
// produto e valor de estoque por unidade. Unidades/produtos zerados viram uma nota.
function TabelaEstoque({ linhas, unidades }: { linhas: LinhaEstoque[]; unidades: string[] }) {
  const comEstoque = unidades.filter(u => linhas.some(l => (l.saldos[u] ?? 0) !== 0))
  const semEstoque = unidades.filter(u => !comEstoque.includes(u))
  const visiveis = linhas.filter(l => comEstoque.some(u => (l.saldos[u] ?? 0) !== 0))
  const zerados = linhas.length - visiveis.length
  const valor = (l: LinhaEstoque, u: string) => Math.max(l.saldos[u] ?? 0, 0) * (l.precoPorUnidade[u] ?? 0)
  const valorUnidade = (u: string) => linhas.reduce((s, l) => s + valor(l, u), 0)
  const cols = `minmax(150px, 1.5fr) repeat(${comEstoque.length}, minmax(100px, 1fr)) minmax(110px, 1.1fr)`

  return (
    <div className="est-wrap">
      <div className="est-table" style={{ '--est-cols': cols } as React.CSSProperties}>
        <div className="est-title">
          <strong>Estoque por unidade</strong>
          <Link href="/estoque-atual">Ver estoque completo →</Link>
        </div>
        {comEstoque.length === 0 ? (
          <div className="est-note">Sem estoque em nenhuma unidade.</div>
        ) : (
          <>
            <div className="est-row est-head">
              <span>Produto</span>
              {comEstoque.map(u => <span key={u} className="est-c">{SHORT[u] ?? u}</span>)}
              <span className="est-c">Total</span>
            </div>
            {visiveis.map(l => {
              const totalBase = comEstoque.reduce((s, u) => s + (l.saldos[u] ?? 0), 0)
              const totalValor = comEstoque.reduce((s, u) => s + valor(l, u), 0)
              return (
                <div key={l.id} className="est-row">
                  <strong>{l.nome}</strong>
                  {comEstoque.map(u => {
                    const v = l.saldos[u] ?? 0
                    const val = valor(l, u)
                    return v === 0
                      ? <span key={u} className="est-c est-zero mono">0</span>
                      : <span key={u} className="est-c"><b className={`mono${v < 0 ? ' text-red' : ''}`}>{caixas(v, l.fator)}</b>{val > 0 && <small className="mono">{formatMoeda(val)}</small>}</span>
                  })}
                  <span className="est-c"><b className="mono">{caixas(totalBase, l.fator)}</b>{totalValor > 0 && <small className="mono">{formatMoeda(totalValor)}</small>}</span>
                </div>
              )
            })}
            <div className="est-row est-total">
              <span>Valor de estoque <small>(preço médio de venda)</small></span>
              {comEstoque.map(u => <span key={u} className="est-c"><b className="mono">{formatMoeda(valorUnidade(u))}</b></span>)}
              <span className="est-c"><b className="mono">{formatMoeda(comEstoque.reduce((s, u) => s + valorUnidade(u), 0))}</b></span>
            </div>
          </>
        )}
        {(semEstoque.length > 0 || zerados > 0) && (
          <div className="est-note">
            {semEstoque.length > 0 && <>Sem estoque: {semEstoque.map(u => SHORT[u] ?? u).join(', ')}. </>}
            {zerados > 0 && <>Produtos zerados em todas as unidades: {zerados}.</>}
          </div>
        )}
      </div>
    </div>
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
  return <TabelaEstoque linhas={comSaldo} unidades={unidades} />
}

const SHORT: Record<string, string> = Object.fromEntries(UNIDADES.map(u => [u, u.replace('NEW BLUETEX ', '')]))

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
  const variacao = resumo.saldoHoje - resumo.saldoInicioMes
  const celula = (label: string, valor: number, cor: string, op?: string, onEdit?: () => void, sub?: string) => (
    <div className={`kpi${op === '=' ? ' kpi-total' : ''}`}>
      {op && <span className="kpi-op" aria-hidden="true">{op}</span>}
      <div className="kpi-label">
        {label}
        {onEdit && <button className="kpi-edit" onClick={onEdit} title="Editar saldo do mês" aria-label="Editar saldo do mês">✎</button>}
      </div>
      <div className="kpi-value mono" style={{ color: cor }}>{formatMoeda(valor)}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
  const divergeDoBanco = resumo.saldoBancarioReferencia != null && Math.abs(resumo.saldoBancarioReferencia - resumo.saldoHoje) >= 0.01
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="kpi-strip">
        {celula('Saldo início do mês', resumo.saldoInicioMes, 'var(--text)', undefined, onEditarSaldo)}
        {celula('Recebido no mês', resumo.totalEntrou, 'var(--green)', '+')}
        {celula('Pago no mês', resumo.totalPagou, 'var(--red)', '−')}
        {celula('Saldo novo', resumo.saldoHoje, 'var(--brand)', '=', undefined,
          `${variacao >= 0 ? '+' : '−'} ${formatMoeda(Math.abs(variacao))} no mês`)}
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
        <div style={{ overflowX: 'auto', marginBottom: 6 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                <td style={{ padding: '5px 6px' }}>
                  <span title={c.descricao} style={{ display: 'inline-block', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>
                    {c.proxima ? '⏰ ' : ''}{c.descricao}
                  </span>
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
        </div>
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
  // "VENDAS" e "Vendas" são a mesma categoria: agrupa ignorando caixa e espaços
  // (só na exibição; o banco não é alterado). Prefere o nome que não está todo em maiúsculas.
  const mapa = new Map<string, { nome: string; lista: ItemLancamento[] }>()
  for (const item of itens) {
    const chave = item.categoria.trim().toLocaleLowerCase('pt-BR')
    const g = mapa.get(chave) ?? { nome: item.categoria.trim(), lista: [] }
    if (g.nome === g.nome.toLocaleUpperCase('pt-BR') && item.categoria !== item.categoria.toLocaleUpperCase('pt-BR')) g.nome = item.categoria.trim()
    g.lista.push(item)
    mapa.set(chave, g)
  }
  return [...mapa.values()]
    .map(({ nome, lista }) => ({
      categoria: nome,
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

  const painel = (titulo: string, grupos: ReturnType<typeof agruparPorCategoria>, total: number, cor: string) => {
    const base = grupos.reduce((s, g) => s + g.total, 0)
    return (
      <div className="card cat-card">
        <div className="cat-head">
          <strong>{titulo}</strong>
          <span className="mono" style={{ fontSize: 15, fontWeight: 700, color: cor }}>{formatMoeda(total)}</span>
        </div>
        {grupos.length === 0 && <div className="cat-vazio">Nada no mês.</div>}
        {grupos.map((g, i) => {
          const pct = base > 0 ? Math.round((g.total / base) * 100) : 0
          return (
            <details key={g.categoria} open={i === 0} className="cat-det">
              <summary className="cat-sum">
                <div className="cat-top">
                  <span>{g.categoria} <small>{g.itens.length} lançamento{g.itens.length === 1 ? '' : 's'} · {pct}%</small></span>
                  <span className="mono">{formatMoeda(g.total)}</span>
                </div>
                <div className="cat-bar"><i style={{ width: `${pct}%`, background: cor }} /></div>
              </summary>
              <div className="cat-items">
                {g.itens.map(item => (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    className="cat-item"
                    onClick={() => { const c = porId.get(item.id); if (c) onClickItem(c) }}
                    onKeyDown={e => { if (e.key === 'Enter') { const c = porId.get(item.id); if (c) onClickItem(c) } }}
                  >
                    <span className="mono cat-muted">{formatData(item.data)}</span>
                    <span className="cat-muted">{item.formaPagamento ? labelFormaPagamento(item.formaPagamento) : '—'}</span>
                    <span className="cat-desc" title={item.descricao}>{item.descricao}</span>
                    <span className="mono">{formatMoeda(item.valor)}</span>
                  </div>
                ))}
              </div>
            </details>
          )
        })}
      </div>
    )
  }

  return (
    <div ref={containerRef}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => containerRef.current?.querySelectorAll('details').forEach(d => { d.open = true })}>▾ Expandir tudo</button>
        <button className="btn btn-secondary btn-sm" onClick={() => containerRef.current?.querySelectorAll('details').forEach(d => { d.open = false })}>▸ Recolher tudo</button>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        {painel('Recebido no mês', recebido, resumo.totalEntrou, 'var(--green)')}
        {painel('Pago no mês', pago, resumo.totalPagou, 'var(--red)')}
      </div>
    </div>
  )
}

function ColunaUnidade({ resumo, nome, short, expandidoInicial, mostrarTagUnidade, onClickHeader, onClickConta, semCard }: {
  resumo: ResumoUnidade; nome: string; short: string
  expandidoInicial: boolean; mostrarTagUnidade: boolean
  onClickHeader?: () => void; onClickConta: (c: ContaPagar | ContaReceber) => void
  semCard?: boolean // só a lista "Ainda a pagar", sem moldura/cabeçalho/total (usada dentro da tabela de unidades)
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
    <div className={semCard ? undefined : 'card card-accent'} style={(semCard ? { fontSize: 12 } : { padding: 14, fontSize: 12, '--accent-cor': 'var(--red)' }) as React.CSSProperties}>
      {!semCard && <>
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
      </>}
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

      {!semCard && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Total despesas</span>
          <span className="mono text-red" style={{ fontSize: 13, fontWeight: 700 }}>{formatMoeda(resumo.totalDespesas)}</span>
        </div>
      )}
    </div>
  )
}

// Visão consolidada: uma linha por unidade (saldo, resultado, a pagar). Clicar na
// linha abre ali mesmo os grupos ainda a pagar; unidades zeradas ficam apagadas.
function TabelaUnidades({ unidades, porUnidade, onClickConta, onAbrir }: {
  unidades: string[]; porUnidade: Partial<Record<string, ResumoUnidade>>
  onClickConta: (c: ContaPagar | ContaReceber) => void; onAbrir: (u: string) => void
}) {
  const [abertas, setAbertas] = useState<Set<string>>(new Set())
  const alternar = (u: string) => setAbertas(prev => {
    const n = new Set(prev)
    n.has(u) ? n.delete(u) : n.add(u)
    return n
  })

  return (
    <div className="un-table">
      <div className="un-row un-head">
        <span /><span>Unidade</span><span>Saldo hoje</span><span>Resultado</span><span>A pagar</span><span />
      </div>
      {unidades.map(u => {
        const r = porUnidade[u]
        if (!r) return null
        const aPagar = r.gruposPagar.reduce((s, g) => s + g.subtotal, 0)
        const zerada = r.saldoHoje === 0 && r.resultado === 0 && aPagar === 0
        const aberta = abertas.has(u)
        return (
          <div key={u} className={zerada ? 'un-zero' : undefined}>
            <button className="un-row un-line" onClick={() => alternar(u)} aria-expanded={aberta} title={u}>
              <span className="un-caret">{aberta ? '▾' : '▸'}</span>
              <strong>{SHORT[u] ?? u}</strong>
              <span className="mono un-num">{formatMoeda(r.saldoHoje)}</span>
              <span className="mono un-num" style={zerada ? undefined : { color: r.resultado >= 0 ? 'var(--green)' : 'var(--red)' }}>{formatMoeda(r.resultado)}</span>
              <span className="mono un-num">{formatMoeda(aPagar)}</span>
              <span>{r.parcelasVencidas > 0 && <span className="un-chip">{r.parcelasVencidas} vencida{r.parcelasVencidas === 1 ? '' : 's'}</span>}</span>
            </button>
            {aberta && (
              <div className="un-sub">
                <ColunaUnidade
                  resumo={r}
                  nome={u}
                  short={SHORT[u] ?? u}
                  expandidoInicial={false}
                  mostrarTagUnidade={false}
                  onClickConta={onClickConta}
                  semCard
                />
                <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={() => onAbrir(u)}>Ver painel completo de {SHORT[u] ?? u} →</button>
              </div>
            )}
          </div>
        )
      })}
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
  const hojeStr = hoje()

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

  // GB são empresas distintas: o consolidado soma só as unidades NEW BLUETEX.
  const unidadesComDados = UNIDADES.filter(u => u.startsWith('NEW BLUETEX') && porUnidade[u])
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
        <div className="unit-tabs" role="tablist" aria-label="Unidade">
          <button role="tab" aria-selected={aba === 'consolidado'} className={`unit-tab unit-tab-main${aba === 'consolidado' ? ' active' : ''}`} onClick={() => setAba('consolidado')}>Consolidado NEW BLUETEX</button>
          {[...UNIDADES.filter(u => !u.startsWith('GB')), ...UNIDADES.filter(u => u.startsWith('GB'))].map((u, i, ordem) => (
            <Fragment key={u}>
              {u.startsWith('GB') && !ordem[i - 1]?.startsWith('GB') && <span className="unit-tabs-sep" aria-hidden="true" />}
              <button role="tab" aria-selected={aba === u} className={`unit-tab${aba === u ? ' active' : ''}`} onClick={() => setAba(u)}>{SHORT[u]}</button>
            </Fragment>
          ))}
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
            <TabelaUnidades unidades={unidadesComDados} porUnidade={porUnidade} onClickConta={setContaAberta} onAbrir={u => setAba(u as Unidade)} />
          </>
        )
      ) : !abaUnica ? <div className="empty-state">Selecione uma unidade.</div> : (
        <>
          {abaUnica.parcelasVencidas > 0 && (
            <div className="alert alert-red" style={{ marginBottom: 16 }}>⚠ {abaUnica.parcelasVencidas} conta(s) a pagar vencida(s) sem baixa</div>
          )}
          <Waterfall resumo={abaUnica} onEditarSaldo={profile?.role === 'admin' ? () => setEditandoSaldo(true) : undefined} />
          <CardRecebiveis resumo={abaUnica} onClickConta={setContaAberta} />
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(0, 1.15fr)', gap: 16, alignItems: 'start', marginBottom: 20 }}>
            <CardPagarEmAberto resumo={abaUnica} onClickConta={setContaAberta} />
            {estoque.filter(l => Object.keys(l.saldos).length > 0).length > 0 && (
              <CardEstoque linhas={estoque.filter(l => Object.keys(l.saldos).length > 0)} unidade={nomeUnica} />
            )}
          </div>
          <CategoriasColapsaveis resumo={abaUnica} onClickItem={setContaAberta} />
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
