'use client'
export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import { anoAtual, getMesAnoLabel, hoje, mesAtual, ordenarProdutos, formatMoeda, formatData } from '@/lib/utils'
import type { Compra, Venda } from '@/types'
import { calcularEstoque, normalizarAberturasEstoque, normalizarMovimentosEstoque, normalizarProdutosEstoque, type AberturaEstoqueDb, type CompraEstoqueDb, type VendaEstoqueDb } from '@/lib/estoque'
import ResumoEstoque from '@/components/estoque/ResumoEstoque'
import TabelaSaldosEstoque from '@/components/estoque/TabelaSaldosEstoque'
import RelatorioMovimentosEstoque from '@/components/estoque/RelatorioMovimentosEstoque'
import HistoricoAuditoriaEstoque from '@/components/estoque/HistoricoAuditoriaEstoque'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import { UNIDADES, type AjusteEstoque, type AuditoriaEstoque, type Produto, type TipoAjusteEstoque, type Unidade } from '@/types'

interface ProfileNome { id: string; nome: string }

const AJUSTE_VAZIO = { produto_id: '', data_ajuste: hoje(), tipo: 'entrada' as TipoAjusteEstoque, quantidade: 0, motivo: '' }

export default function EstoqueAtualPage() {
  const { profile, unidadeAtiva } = useAuth()
  const [mes, setMes] = useState(mesAtual())
  const [ano, setAno] = useState(anoAtual())
  const [unidade, setUnidade] = useState<Unidade | ''>(unidadeAtiva ?? '')
  const [produtoId, setProdutoId] = useState('')
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [aberturas, setAberturas] = useState<AberturaEstoqueDb[]>([])
  const [compras, setCompras] = useState<CompraEstoqueDb[]>([])
  const [vendas, setVendas] = useState<VendaEstoqueDb[]>([])
  const [ajustes, setAjustes] = useState<AjusteEstoque[]>([])
  const [auditoria, setAuditoria] = useState<AuditoriaEstoque[]>([])
  const [nomesUsuarios, setNomesUsuarios] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<'movimentos' | 'auditoria'>('movimentos')
  const [aba, setAba] = useState<'saldo' | 'entradas' | 'saidas'>('saldo')
  const [ajusteModal, setAjusteModal] = useState(false)
  const [ajusteForm, setAjusteForm] = useState(AJUSTE_VAZIO)
  const [ajusteEditId, setAjusteEditId] = useState<string | null>(null)
  const [modoAjusteUnidade, setModoAjusteUnidade] = useState<'base' | 'maior'>('maior')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const sb = useMemo(() => createClient(), [])
  const isAdmin = profile?.role === 'admin'
  const isDiretoria = profile?.role === 'diretoria'
  const veTudo = isAdmin || isDiretoria

  useEffect(() => { if (unidadeAtiva) setUnidade(unidadeAtiva) }, [unidadeAtiva])

  const loadData = useCallback(async () => {
    if (!unidade) {
      setLoading(false)
      setError('')
      return
    }
    setLoading(true)
    setError('')
    const consultas = await Promise.all([
      sb.from('btx_produtos').select('*, unidade_base:btx_unidades_medida!unidade_base_id(nome), unidade_maior:btx_unidades_medida!unidade_maior_id(nome)').eq('ativo', true).order('nome'),
      sb.from('btx_estoque_inicial').select('id,produto_id,mes,ano,qtd_carteiras').eq('unidade', unidade),
      sb.from('btx_compras').select('id,data_compra,numero_nf,itens:btx_compras_itens(id,produto_id,qtd_carteiras)').eq('unidade', unidade).eq('ativo', true),
      sb.from('btx_vendas').select('id,data_venda,numero_nf,itens:btx_vendas_itens(id,produto_id,qtd_carteiras)').eq('unidade', unidade).eq('ativo', true),
      sb.from('btx_ajustes_estoque').select('*').eq('unidade', unidade).eq('ativo', true),
    ])
    if (consultas.some(resultado => resultado.error)) {
      setError('Não foi possível carregar o estoque. Confirme se a migração de Estoque Atual foi executada no Supabase.')
      setLoading(false)
      return
    }
    setProdutos(ordenarProdutos((consultas[0].data ?? []) as Produto[]))
    setAberturas((consultas[1].data ?? []) as AberturaEstoqueDb[])
    setCompras((consultas[2].data ?? []) as unknown as CompraEstoqueDb[])
    setVendas((consultas[3].data ?? []) as unknown as VendaEstoqueDb[])
    setAjustes((consultas[4].data ?? []) as AjusteEstoque[])

    if (veTudo) {
      const auditResult = await sb.from('btx_auditoria_estoque').select('*').eq('unidade', unidade).order('created_at', { ascending: false }).limit(300)
      if (!auditResult.error) {
        const registros = (auditResult.data ?? []) as AuditoriaEstoque[]
        setAuditoria(registros)
        const ids = [...new Set(registros.map(item => item.usuario_id).filter((id): id is string => Boolean(id)))]
        if (ids.length) {
          const profilesResult = await sb.from('btx_profiles').select('id,nome').in('id', ids)
          setNomesUsuarios(Object.fromEntries(((profilesResult.data ?? []) as ProfileNome[]).map(item => [item.id, item.nome])))
        } else setNomesUsuarios({})
      }
    } else {
      setAuditoria([])
      setNomesUsuarios({})
      setTab('movimentos')
    }
    setLoading(false)
  }, [veTudo, sb, unidade])

  useEffect(() => { loadData() }, [loadData])

  const painel = useMemo(() => calcularEstoque({
    ano,
    mes,
    produtos: normalizarProdutosEstoque(produtos),
    aberturas: normalizarAberturasEstoque(aberturas),
    movimentos: normalizarMovimentosEstoque(compras, vendas, ajustes),
    produtoId: produtoId || undefined,
  }), [ano, mes, produtoId, produtos, aberturas, compras, vendas, ajustes])

  function navMes(direcao: number) {
    let novoMes = mes + direcao
    let novoAno = ano
    if (novoMes < 1) { novoMes = 12; novoAno-- }
    if (novoMes > 12) { novoMes = 1; novoAno++ }
    setMes(novoMes)
    setAno(novoAno)
  }

  function abrirNovoAjuste() {
    setAjusteEditId(null)
    setAjusteForm({ ...AJUSTE_VAZIO, produto_id: produtoId })
    setModoAjusteUnidade('maior')
    setError('')
    setAjusteModal(true)
  }

  function editarAjuste(id: string) {
    const ajuste = ajustes.find(item => item.id === id)
    if (!ajuste) return
    setAjusteEditId(id)
    setAjusteForm({ produto_id: ajuste.produto_id, data_ajuste: ajuste.data_ajuste, tipo: ajuste.tipo, quantidade: ajuste.qtd_carteiras, motivo: ajuste.motivo ?? '' })
    setModoAjusteUnidade('maior')
    setAjusteModal(true)
  }

  async function salvarAjuste() {
    if (!unidade || !ajusteForm.produto_id || ajusteForm.quantidade <= 0 || !ajusteForm.motivo.trim()) {
      setError('Informe produto, quantidade positiva e motivo do ajuste.')
      return
    }
    setSaving(true)
    const [anoAjuste, mesAjuste] = ajusteForm.data_ajuste.split('-').map(Number)
    const ajustePayload = {
      unidade,
      produto_id: ajusteForm.produto_id,
      data_ajuste: ajusteForm.data_ajuste,
      mes: mesAjuste,
      ano: anoAjuste,
      tipo: ajusteForm.tipo,
      qtd_carteiras: Math.round(ajusteForm.quantidade),
      motivo: ajusteForm.motivo.trim(),
      ativo: true,
    }
    const resultado = ajusteEditId
      ? await sb.from('btx_ajustes_estoque').update(ajustePayload).eq('id', ajusteEditId)
      : await sb.from('btx_ajustes_estoque').insert(ajustePayload)
    setSaving(false)
    if (resultado.error) {
      setError('Não foi possível salvar o ajuste.')
      return
    }
    setAjusteModal(false)
    await loadData()
  }

  async function removerAjuste() {
    if (!confirmId) return
    setSaving(true)
    const { error: removeError } = await sb.from('btx_ajustes_estoque').update({ ativo: false }).eq('id', confirmId)
    setSaving(false)
    setConfirmId(null)
    if (removeError) setError('Não foi possível excluir o ajuste.')
    else await loadData()
  }

  return (
    <div className="stock-page">
      <div className="tabs">
        <button className={`tab ${aba === 'saldo' ? 'active' : ''}`} onClick={() => setAba('saldo')}>Saldo</button>
        <button className={`tab ${aba === 'entradas' ? 'active' : ''}`} onClick={() => setAba('entradas')}>Entradas</button>
        <button className={`tab ${aba === 'saidas' ? 'active' : ''}`} onClick={() => setAba('saidas')}>Saídas</button>
      </div>

      {aba === 'entradas' && <ListaEntradas />}
      {aba === 'saidas' && <ListaSaidas />}
      {aba === 'saldo' && <>
      <div className="page-header stock-page-header">
        <div>
          <h1 className="page-title">Estoque Atual</h1>
          <div className="page-subtitle">Saldo real, entradas, saídas e ajustes{unidade ? ` · ${unidade}` : ''}</div>
          <Link href="/estoque-inicial" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }}>Estoque inicial →</Link>
        </div>
        {!isDiretoria && <button className="btn btn-primary" onClick={abrirNovoAjuste} disabled={!unidade}>+ Novo ajuste</button>}
      </div>

      <div className="stock-toolbar">
        <div className="stock-month-nav"><button className="btn btn-secondary btn-sm" onClick={() => navMes(-1)}>←</button><strong>{getMesAnoLabel(mes, ano)}</strong><button className="btn btn-secondary btn-sm" onClick={() => navMes(1)}>→</button></div>
        <select className="form-select stock-product-filter" value={produtoId} onChange={event => setProdutoId(event.target.value)} aria-label="Filtrar produto">
          <option value="">Todos os produtos</option>
          {produtos.map(produto => <option key={produto.id} value={produto.id}>{produto.nome}</option>)}
        </select>
        {veTudo && <select className="form-select stock-unit-filter" value={unidade} onChange={event => setUnidade(event.target.value as Unidade)} aria-label="Unidade">{UNIDADES.map(item => <option key={item}>{item}</option>)}</select>}
      </div>

      {!unidade ? <div className="empty-state">Selecione uma unidade para visualizar o estoque.</div>
        : loading ? <div className="stock-loading">Carregando estoque...</div>
        : error && !ajusteModal ? <div className="alert alert-red stock-error"><span>{error}</span><button className="btn btn-secondary btn-sm" onClick={loadData}>Tentar novamente</button></div>
        : <>
          <ResumoEstoque resumo={painel.resumo} />
          <TabelaSaldosEstoque saldos={painel.saldos} produtoSelecionado={produtoId} onSelectProduto={setProdutoId} />
          <div className="stock-tabs" role="tablist">
            <button className={tab === 'movimentos' ? 'active' : ''} onClick={() => setTab('movimentos')} role="tab" aria-selected={tab === 'movimentos'}>Movimentações</button>
            {veTudo && <button className={tab === 'auditoria' ? 'active' : ''} onClick={() => setTab('auditoria')} role="tab" aria-selected={tab === 'auditoria'}>Histórico de alterações</button>}
          </div>
          {tab === 'movimentos' ? <RelatorioMovimentosEstoque movimentos={painel.movimentos} onEditAjuste={isDiretoria ? undefined : editarAjuste} onRemoveAjuste={isDiretoria ? undefined : setConfirmId} />
            : veTudo ? <HistoricoAuditoriaEstoque registros={auditoria} nomesUsuarios={nomesUsuarios} /> : null}
        </>}
      </>}

      <Modal open={ajusteModal && aba === 'saldo'} onClose={() => setAjusteModal(false)} title={ajusteEditId ? 'Editar ajuste' : 'Novo ajuste'} size="sm" footer={<><button className="btn btn-secondary" onClick={() => setAjusteModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={salvarAjuste} disabled={saving}>{saving ? 'Salvando...' : 'Salvar ajuste'}</button></>}>
        {error && <div className="alert alert-red">{error}</div>}
        <div className="form-group"><label className="form-label">Produto</label><select className="form-select" value={ajusteForm.produto_id} onChange={event => setAjusteForm(form => ({ ...form, produto_id: event.target.value }))}><option value="">Selecione...</option>{produtos.map(produto => <option key={produto.id} value={produto.id}>{produto.nome}</option>)}</select></div>
        <div className="grid-2"><div className="form-group"><label className="form-label">Data</label><input className="form-input" type="date" value={ajusteForm.data_ajuste} onChange={event => setAjusteForm(form => ({ ...form, data_ajuste: event.target.value }))} /></div><div className="form-group"><label className="form-label">Tipo</label><select className="form-select" value={ajusteForm.tipo} onChange={event => setAjusteForm(form => ({ ...form, tipo: event.target.value as TipoAjusteEstoque }))}><option value="entrada">Entrada</option><option value="saida">Saída</option></select></div></div>
        {(() => {
          const produtoSelecionado = produtos.find(item => item.id === ajusteForm.produto_id)
          const fatorConversao = produtoSelecionado?.fator_conversao || 1
          const valorInput = modoAjusteUnidade === 'maior' ? ajusteForm.quantidade / fatorConversao : ajusteForm.quantidade
          const unidadeLabel = modoAjusteUnidade === 'maior' ? (produtoSelecionado?.unidade_maior?.nome ?? 'unidade maior') : (produtoSelecionado?.unidade_base?.nome ?? 'unidade base')
          return (
            <>
              <div className="form-group">
                <label className="form-label">Lançar em</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className={`btn btn-sm ${modoAjusteUnidade === 'maior' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setModoAjusteUnidade('maior')}>Unidade maior</button>
                  <button type="button" className={`btn btn-sm ${modoAjusteUnidade === 'base' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setModoAjusteUnidade('base')}>Unidade base</button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Quantidade ({unidadeLabel})</label>
                <input className="form-input" type="number" min={0} step="0.01" value={valorInput || ''} onChange={event => {
                  const v = Number(event.target.value)
                  const base = modoAjusteUnidade === 'maior' ? v * fatorConversao : v
                  setAjusteForm(form => ({ ...form, quantidade: base }))
                }} />
              </div>
            </>
          )
        })()}
        <div className="form-group"><label className="form-label">Motivo</label><textarea className="form-textarea" rows={3} value={ajusteForm.motivo} onChange={event => setAjusteForm(form => ({ ...form, motivo: event.target.value }))} placeholder="Ex.: correção após contagem física" /></div>
      </Modal>
      <ConfirmDialog open={Boolean(confirmId)} onClose={() => setConfirmId(null)} onConfirm={removerAjuste} loading={saving} title="Excluir ajuste?" message="O ajuste deixará de compor o saldo, mas a alteração permanecerá registrada no histórico." />
    </div>
  )
}

// ponytail: abas Entradas/Saídas — lista de consulta copiada de /compras e /vendas (entrega 1)
function ListaEntradas() {
  const { profile, unidadeAtiva } = useAuth()
  const isDiretoria = profile?.role === 'diretoria'
  const [rows, setRows] = useState<Compra[]>([])
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const sb = useMemo(() => createClient(), [])

  const load = useCallback(async () => {
    setLoading(true)
    let q = sb.from('btx_compras').select('*, fornecedor:btx_fornecedores(id,nome), itens:btx_compras_itens(id,produto_id,qtd_carteiras,valor,produto:btx_produtos(id,nome,fator_conversao,unidade_base:btx_unidades_medida!unidade_base_id(nome),unidade_maior:btx_unidades_medida!unidade_maior_id(nome)))').eq('ativo', true).order('data_compra', { ascending: false })
    if (unidadeAtiva) q = q.eq('unidade', unidadeAtiva)
    const { data: d } = await q
    setRows(d ?? [])
    setLoading(false)
  }, [sb, unidadeAtiva])

  useEffect(() => { load() }, [load])

  async function remove(id: string) {
    setSaving(true)
    await sb.from('btx_compras').update({ ativo: false }).eq('id', id)
    await sb.from('btx_parcelas').update({ ativo: false }).eq('origem_id', id)
    setSaving(false); setConfirm(null); load()
  }

  return (
    <div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>NF</th><th>Fornecedor</th><th>Produtos</th><th>ST</th><th>Total NF</th><th>Ações</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="empty-state">Carregando...</td></tr>
            : rows.length === 0 ? <tr><td colSpan={7} className="empty-state">Nenhuma entrada lançada.</td></tr>
            : rows.map(r => (
              <tr key={r.id}>
                <td className="mono">{formatData(r.data_compra)}</td>
                <td className="mono">{r.numero_nf ?? '—'}</td>
                <td>{(r.fornecedor as unknown as { nome: string })?.nome ?? '—'}</td>
                <td style={{ fontSize: 11 }}>{((r.itens as unknown as { produto: { nome: string; unidade_base: { nome: string } }; qtd_carteiras: number }[]) ?? []).map((it, i) => <div key={i}>{it.produto?.nome} — {it.qtd_carteiras} {it.produto?.unidade_base?.nome ?? ''}</div>)}</td>
                <td className="mono">{formatMoeda((r as unknown as { valor_st?: number }).valor_st ?? 0)}</td>
                <td className="mono">{formatMoeda(r.valor_total)}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  {!isDiretoria && <button className="btn btn-danger btn-sm" onClick={() => setConfirm(r.id)}>Excluir</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm && remove(confirm)} loading={saving} />
    </div>
  )
}

function ListaSaidas() {
  const { profile, unidadeAtiva } = useAuth()
  const isDiretoria = profile?.role === 'diretoria'
  const [rows, setRows] = useState<Venda[]>([])
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const sb = useMemo(() => createClient(), [])

  const load = useCallback(async () => {
    setLoading(true)
    let q = sb.from('btx_vendas').select('*, cliente:btx_clientes(id,nome), itens:btx_vendas_itens(id,produto_id,qtd_carteiras,valor,produto:btx_produtos(id,nome,fator_conversao,unidade_base:btx_unidades_medida!unidade_base_id(nome),unidade_maior:btx_unidades_medida!unidade_maior_id(nome)))').eq('ativo', true).order('data_venda', { ascending: false })
    if (unidadeAtiva) q = q.eq('unidade', unidadeAtiva)
    const { data: d } = await q
    setRows(d ?? [])
    setLoading(false)
  }, [sb, unidadeAtiva])

  useEffect(() => { load() }, [load])

  async function remove(id: string) {
    setSaving(true)
    await sb.from('btx_vendas').update({ ativo: false }).eq('id', id)
    await sb.from('btx_parcelas').update({ ativo: false }).eq('origem_id', id)
    setSaving(false); setConfirm(null); load()
  }

  return (
    <div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>NF</th><th>Cliente</th><th>Produtos</th><th>Total NF</th><th>Ações</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="empty-state">Carregando...</td></tr>
            : rows.length === 0 ? <tr><td colSpan={6} className="empty-state">Nenhuma saída lançada.</td></tr>
            : rows.map(r => (
              <tr key={r.id}>
                <td className="mono">{formatData(r.data_venda)}</td>
                <td className="mono">{r.numero_nf ?? '—'}</td>
                <td>{(r.cliente as unknown as { nome: string })?.nome ?? '—'}</td>
                <td style={{ fontSize: 11 }}>{((r.itens as unknown as { produto: { nome: string; unidade_base: { nome: string } }; qtd_carteiras: number }[]) ?? []).map((it, i) => <div key={i}>{it.produto?.nome} — {it.qtd_carteiras} {it.produto?.unidade_base?.nome ?? ''}</div>)}</td>
                <td className="mono">{formatMoeda(r.valor_total)}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  {!isDiretoria && <button className="btn btn-danger btn-sm" onClick={() => setConfirm(r.id)}>Excluir</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm && remove(confirm)} loading={saving} />
    </div>
  )
}
