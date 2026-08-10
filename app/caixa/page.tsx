'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import { anoAtual, getMesAnoLabel, hoje, mesAtual } from '@/lib/utils'
import { calcularPainelFinanceiro, calcularSaldoRealizado, calcularStatusPagamento, chaveCompetencia, type ParcelaFinanceira, type PagamentoParcela as PagamentoCalculo, type MovimentacaoFinanceira } from '@/lib/financeiro'
import ResumoFinanceiro from '@/components/financeiro/ResumoFinanceiro'
import ListaMovimentacoes from '@/components/financeiro/ListaMovimentacoes'
import CalendarioFinanceiro from '@/components/financeiro/CalendarioFinanceiro'
import Modal from '@/components/Modal'
import PagamentoModal from '@/components/financeiro/PagamentoModal'
import type { CaixaMensal, Parcela, Unidade } from '@/types'
import { UNIDADES } from '@/types'

type PainelCalculado = ReturnType<typeof calcularPainelFinanceiro>
type RelacaoNome = { nome: string } | { nome: string }[] | null
interface CompraOrigem { id: string; numero_nf: string | null; fornecedor: RelacaoNome }
interface VendaOrigem { id: string; numero_nf: string | null; cliente: RelacaoNome }
interface DespesaOrigem { id: string; descricao: string; fornecedor: RelacaoNome }

function nomeRelacao(relacao: RelacaoNome) {
  return Array.isArray(relacao) ? relacao[0]?.nome : relacao?.nome
}

function enriquecerParcelas(parcelas: Parcela[], compras: CompraOrigem[], vendas: VendaOrigem[], despesas: DespesaOrigem[]): ParcelaFinanceira[] {
  const comprasPorId = new Map(compras.map(item => [item.id, item]))
  const vendasPorId = new Map(vendas.map(item => [item.id, item]))
  const despesasPorId = new Map(despesas.map(item => [item.id, item]))

  return parcelas.map(parcela => {
    let descricao = parcela.observacoes || parcela.numero_boleto || `Parcela ${parcela.numero_parcela}`
    if (parcela.origem === 'compra' && parcela.origem_id) {
      const compra = comprasPorId.get(parcela.origem_id)
      descricao = (compra && nomeRelacao(compra.fornecedor)) || (compra?.numero_nf ? `Compra NF ${compra.numero_nf}` : 'Compra')
    }
    if (parcela.origem === 'venda' && parcela.origem_id) {
      const venda = vendasPorId.get(parcela.origem_id)
      descricao = (venda && nomeRelacao(venda.cliente)) || (venda?.numero_nf ? `Venda NF ${venda.numero_nf}` : 'Venda')
    }
    if (parcela.origem === 'despesa' && parcela.origem_id) {
      const despesa = despesasPorId.get(parcela.origem_id)
      descricao = despesa?.descricao || (despesa && nomeRelacao(despesa.fornecedor)) || 'Despesa'
    }
    return { ...parcela, valor: Number(parcela.valor), descricao }
  })
}

export default function CaixaPage() {
  const { profile, unidadeAtiva } = useAuth()
  const [mes, setMes] = useState(mesAtual())
  const [ano, setAno] = useState(anoAtual())
  const [unidade, setUnidade] = useState<Unidade | ''>(unidadeAtiva ?? '')
  const [painel, setPainel] = useState<PainelCalculado | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [baseConfigurada, setBaseConfigurada] = useState(false)
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null)
  const [mobileTab, setMobileTab] = useState<'pagar' | 'receber'>('pagar')
  const [saldoModal, setSaldoModal] = useState(false)
  const [saldoEdit, setSaldoEdit] = useState(0)
  const [saldoBanco, setSaldoBanco] = useState(0)
  const [realizadoMesAtual, setRealizadoMesAtual] = useState(0)
  const [saving, setSaving] = useState(false)
  const [pagamentoModal, setPagamentoModal] = useState<{ parcelaId: string; saldoRestante: number; edicao?: { id: string; valor: number; data: string; observacoes: string } } | null>(null)
  const [pagamentoSaving, setPagamentoSaving] = useState(false)
  const sb = createClient()
  const isAdmin = profile?.role === 'admin'

  useEffect(() => { if (unidadeAtiva) setUnidade(unidadeAtiva) }, [unidadeAtiva])
  useEffect(() => { setDiaSelecionado(null); loadData() }, [mes, ano, unidade])

  async function loadData() {
    if (!unidade) {
      setPainel(null); setError(''); setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    const competenciaSelecionada = chaveCompetencia(ano, mes)
    const [basesResult, parcelasResult] = await Promise.all([
      sb.from('btx_caixa_mensal').select('*').eq('unidade', unidade).order('ano', { ascending: false }).order('mes', { ascending: false }),
      sb.from('btx_parcelas').select('*').eq('unidade', unidade).eq('ativo', true).neq('status', 'cancelado'),
    ])
    if (basesResult.error || parcelasResult.error) {
      setPainel(null)
      setError('Não foi possível carregar os dados financeiros. Tente novamente.')
      setLoading(false)
      return
    }

    const bases = (basesResult.data ?? []) as CaixaMensal[]
    const base = bases.find(item => chaveCompetencia(item.ano, item.mes) <= competenciaSelecionada)
    const competenciaBase = base ? chaveCompetencia(base.ano, base.mes) : competenciaSelecionada
    const parcelas = (parcelasResult.data ?? []) as Parcela[]
    const parcelaIds = parcelas.map(item => item.id)
    const pagamentosResult = parcelaIds.length
      ? await sb.from('btx_pagamentos_parcela').select('*').in('parcela_id', parcelaIds)
      : { data: [] as PagamentoCalculo[] }
    const pagamentos: PagamentoCalculo[] = (pagamentosResult.data ?? []).map((item: { id: string; parcela_id: string; valor: number; data_pagamento: string }) => ({
      id: item.id, parcela_id: item.parcela_id, valor: Number(item.valor), data_pagamento: item.data_pagamento,
    }))
    const ids = (origem: Parcela['origem']) => [...new Set(parcelas.filter(p => p.origem === origem && p.origem_id).map(p => p.origem_id as string))]
    const compraIds = ids('compra')
    const vendaIds = ids('venda')
    const despesaIds = ids('despesa')
    const [comprasResult, vendasResult, despesasResult] = await Promise.all([
      compraIds.length ? sb.from('btx_compras').select('id,numero_nf,fornecedor:btx_fornecedores(nome)').in('id', compraIds) : Promise.resolve({ data: [] }),
      vendaIds.length ? sb.from('btx_vendas').select('id,numero_nf,cliente:btx_clientes(nome)').in('id', vendaIds) : Promise.resolve({ data: [] }),
      despesaIds.length ? sb.from('btx_despesas').select('id,descricao,fornecedor:btx_fornecedores(nome)').in('id', despesaIds) : Promise.resolve({ data: [] }),
    ])
    const parcelasEnriquecidas = enriquecerParcelas(
      parcelas,
      (comprasResult.data ?? []) as unknown as CompraOrigem[],
      (vendasResult.data ?? []) as unknown as VendaOrigem[],
      (despesasResult.data ?? []) as unknown as DespesaOrigem[],
    )
    const calculado = calcularPainelFinanceiro({
      ano, mes, hoje: hoje(), saldoBase: Number(base?.saldo_inicial ?? 0), competenciaBase, parcelas: parcelasEnriquecidas, pagamentos,
    })

    const competenciaHoje = chaveCompetencia(anoAtual(), mesAtual())
    const baseHoje = bases.find(item => chaveCompetencia(item.ano, item.mes) <= competenciaHoje)
    const competenciaBaseHoje = baseHoje ? chaveCompetencia(baseHoje.ano, baseHoje.mes) : competenciaHoje
    const realizadoTotal = calcularSaldoRealizado({
      hoje: hoje(), competenciaInicio: competenciaBaseHoje, parcelas: parcelasEnriquecidas, pagamentos,
    })
    const realizadoEsteMes = calcularSaldoRealizado({
      hoje: hoje(), competenciaInicio: competenciaHoje, parcelas: parcelasEnriquecidas, pagamentos,
    })
    setSaldoBanco(Number(baseHoje?.saldo_inicial ?? 0) + realizadoTotal)
    setRealizadoMesAtual(realizadoEsteMes)

    setBaseConfigurada(Boolean(base))
    setSaldoEdit(calculado.resumo.saldoInicial)
    setPainel(calculado)
    setLoading(false)
  }

  function navMes(direcao: number) {
    let novoMes = mes + direcao
    let novoAno = ano
    if (novoMes < 1) { novoMes = 12; novoAno-- }
    if (novoMes > 12) { novoMes = 1; novoAno++ }
    setMes(novoMes); setAno(novoAno)
  }

  function abrirSaldoBase() {
    setSaldoEdit(saldoBanco)
    setSaldoModal(true)
  }

  async function salvarSaldoBase() {
    if (!unidade) return
    setSaving(true)
    const novoSaldoInicial = saldoEdit - realizadoMesAtual
    const { error: saveError } = await sb.from('btx_caixa_mensal').upsert(
      { unidade, mes: mesAtual(), ano: anoAtual(), saldo_inicial: novoSaldoInicial, updated_at: new Date().toISOString() },
      { onConflict: 'unidade,mes,ano' },
    )
    setSaving(false)
    if (saveError) {
      setError('Não foi possível salvar o saldo em banco. Tente novamente.')
      return
    }
    setSaldoModal(false)
    loadData()
  }

  async function sincronizarStatusParcela(parcelaId: string, valorTotal: number) {
    const { data } = await sb.from('btx_pagamentos_parcela').select('*').eq('parcela_id', parcelaId)
    const pagamentos: PagamentoCalculo[] = (data ?? []).map((item: { id: string; parcela_id: string; valor: number; data_pagamento: string }) => ({
      id: item.id, parcela_id: item.parcela_id, valor: Number(item.valor), data_pagamento: item.data_pagamento,
    }))
    const { status, dataPagamento } = calcularStatusPagamento(valorTotal, pagamentos)
    await sb.from('btx_parcelas').update({ status, data_pagamento: dataPagamento }).eq('id', parcelaId)
  }

  function abrirRegistrarPagamento(parcelaId: string, saldoRestante: number) {
    setPagamentoModal({ parcelaId, saldoRestante })
  }

  function abrirEditarPagamento(movimento: MovimentacaoFinanceira) {
    setPagamentoModal({
      parcelaId: movimento.parcela_id,
      saldoRestante: movimento.valor_total,
      edicao: { id: movimento.id, valor: movimento.valor, data: movimento.data, observacoes: movimento.observacoes ?? '' },
    })
  }

  async function salvarPagamento(dados: { valor: number; data: string; observacoes: string }) {
    if (!pagamentoModal) return
    setPagamentoSaving(true)
    const parcela = painel?.movimentacoesMes.find(item => item.parcela_id === pagamentoModal.parcelaId)
    const valorTotal = parcela?.valor_total ?? pagamentoModal.saldoRestante
    const { error: saveError } = pagamentoModal.edicao
      ? await sb.from('btx_pagamentos_parcela').update({
          valor: dados.valor, data_pagamento: dados.data, observacoes: dados.observacoes || null,
        }).eq('id', pagamentoModal.edicao.id)
      : await sb.from('btx_pagamentos_parcela').insert({
          parcela_id: pagamentoModal.parcelaId, valor: dados.valor, data_pagamento: dados.data, observacoes: dados.observacoes || null,
        })
    if (saveError) {
      setPagamentoSaving(false)
      setError('Não foi possível registrar o pagamento.')
      return
    }
    await sincronizarStatusParcela(pagamentoModal.parcelaId, valorTotal)
    setPagamentoSaving(false)
    setPagamentoModal(null)
    loadData()
  }

  async function excluirPagamento(movimento: MovimentacaoFinanceira) {
    setSaving(true)
    await sb.from('btx_pagamentos_parcela').delete().eq('id', movimento.id)
    await sincronizarStatusParcela(movimento.parcela_id, movimento.valor_total)
    setSaving(false)
    loadData()
  }

  return (
    <div>
      <div className="page-header finance-page-header">
        <div>
          <h1 className="page-title">Painel Financeiro</h1>
          <div className="page-subtitle">Fluxo realizado e projetado{unidade ? ` · ${unidade}` : ''}</div>
        </div>
      </div>

      <div className="finance-toolbar">
        <div className="finance-month-nav" aria-label="Navegação mensal">
          <button className="btn btn-secondary btn-sm" onClick={() => navMes(-1)} aria-label="Mês anterior">←</button>
          <strong>{getMesAnoLabel(mes, ano)}</strong>
          <button className="btn btn-secondary btn-sm" onClick={() => navMes(1)} aria-label="Próximo mês">→</button>
        </div>
        {isAdmin && (
          <select className="form-select finance-unit-select" value={unidade} onChange={event => setUnidade(event.target.value as Unidade)} aria-label="Unidade">
            <option value="">Selecione a unidade...</option>
            {UNIDADES.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        )}
      </div>

      {!unidade ? (
        <div className="empty-state">Selecione uma unidade para visualizar o painel financeiro.</div>
      ) : loading ? (
        <div className="finance-loading" aria-live="polite">Carregando dados financeiros...</div>
      ) : error ? (
        <div className="alert alert-red finance-error" role="alert"><span>{error}</span><button className="btn btn-secondary btn-sm" onClick={loadData}>Tentar novamente</button></div>
      ) : painel ? (
        <>
          {!baseConfigurada && (
            <div className="alert alert-amber finance-base-alert">
              <span>Nenhum saldo-base cadastrado. O cálculo deste mês começa em zero.</span>
              {isAdmin && <button className="btn btn-secondary btn-sm" onClick={abrirSaldoBase}>Configurar saldo-base</button>}
            </div>
          )}
          <ResumoFinanceiro resumo={painel.resumo} saldoBanco={saldoBanco} isAdmin={isAdmin} onAjustarSaldo={abrirSaldoBase} />
          <div className="finance-mobile-tabs" role="tablist" aria-label="Tipo de movimentação">
            <button className={mobileTab === 'pagar' ? 'active' : ''} onClick={() => setMobileTab('pagar')} role="tab" aria-selected={mobileTab === 'pagar'}>A pagar</button>
            <button className={mobileTab === 'receber' ? 'active' : ''} onClick={() => setMobileTab('receber')} role="tab" aria-selected={mobileTab === 'receber'}>A receber</button>
          </div>
          <div className="finance-layout">
            <ListaMovimentacoes
              tipo="pagar"
              movimentacoes={painel.movimentacoesMes}
              diaSelecionado={diaSelecionado}
              mobileActive={mobileTab === 'pagar'}
              isAdmin={isAdmin}
              onRegistrarPagamento={abrirRegistrarPagamento}
              onEditarPagamento={abrirEditarPagamento}
              onExcluirPagamento={excluirPagamento}
            />
            <CalendarioFinanceiro ano={ano} mes={mes} dias={painel.dias} hoje={hoje()} diaSelecionado={diaSelecionado} onSelectDia={setDiaSelecionado} />
            <ListaMovimentacoes
              tipo="receber"
              movimentacoes={painel.movimentacoesMes}
              diaSelecionado={diaSelecionado}
              mobileActive={mobileTab === 'receber'}
              isAdmin={isAdmin}
              onRegistrarPagamento={abrirRegistrarPagamento}
              onEditarPagamento={abrirEditarPagamento}
              onExcluirPagamento={excluirPagamento}
            />
          </div>
        </>
      ) : null}

      <Modal open={saldoModal} onClose={() => setSaldoModal(false)} title="Saldo em banco de hoje" size="sm" footer={<>
        <button className="btn btn-secondary" onClick={() => setSaldoModal(false)}>Cancelar</button>
        <button className="btn btn-primary" onClick={salvarSaldoBase} disabled={saving}>{saving ? 'Salvando...' : 'Salvar saldo de hoje'}</button>
      </>}>
        <div className="alert alert-amber">Este valor passa a ser o saldo real de hoje ({getMesAnoLabel(mesAtual(), anoAtual())}). Contas ainda não pagas ou recebidas não entram nessa conta — só o que já se confirmou. Novos pagamentos continuam somando e subtraindo a partir daqui.</div>
        <div className="form-group">
          <label className="form-label">Saldo em banco agora (R$)</label>
          <input className="form-input mono" type="number" step="0.01" value={saldoEdit} onChange={event => setSaldoEdit(Number(event.target.value))} />
        </div>
      </Modal>

      <PagamentoModal
        open={!!pagamentoModal}
        onClose={() => setPagamentoModal(null)}
        onSalvar={salvarPagamento}
        saldoRestante={pagamentoModal?.saldoRestante ?? 0}
        saving={pagamentoSaving}
        valorInicial={pagamentoModal?.edicao ? { valor: pagamentoModal.edicao.valor, data: pagamentoModal.edicao.data, observacoes: pagamentoModal.edicao.observacoes } : undefined}
      />
    </div>
  )
}
