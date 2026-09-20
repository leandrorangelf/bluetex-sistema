'use client'
export const dynamic = 'force-dynamic'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import { formatMoeda, formatData } from '@/lib/utils'
import { UNIDADES, type Unidade } from '@/types'
import { VHSYS_UNIDADES } from '@/lib/vhsys/unidades'

interface RegistroVenda {
  id: string
  pedido_vhsys_id: string
  numero_nf: string | null
  cliente: string
  data_venda: string
  produto_texto: string
  qtd_caixas: number
  valor: number
  sem_conversao: boolean
}

interface Pedido {
  pedidoId: string
  numeroNf: string | null
  cliente: string
  dataVenda: string
  itens: RegistroVenda[]
  valorTotal: number
}

function agruparPorPedido(rows: RegistroVenda[]): Pedido[] {
  const porPedido = new Map<string, Pedido>()
  for (const r of rows) {
    const atual = porPedido.get(r.pedido_vhsys_id)
    if (atual) {
      atual.itens.push(r)
      atual.valorTotal += r.valor
    } else {
      porPedido.set(r.pedido_vhsys_id, {
        pedidoId: r.pedido_vhsys_id, numeroNf: r.numero_nf, cliente: r.cliente,
        dataVenda: r.data_venda, itens: [r], valorTotal: r.valor,
      })
    }
  }
  return [...porPedido.values()].sort((a, b) => b.dataVenda.localeCompare(a.dataVenda) || b.pedidoId.localeCompare(a.pedidoId))
}

const ANO_ATUAL = new Date().getFullYear()
const ANOS_DISPONIVEIS = Array.from({ length: 6 }, (_, i) => String(ANO_ATUAL - i))
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export default function VendasPage() {
  const { profile, unidadeAtiva } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [unidade, setUnidade] = useState<Unidade | ''>((unidadeAtiva as Unidade) ?? '')

  useEffect(() => { if (!isAdmin && unidadeAtiva) setUnidade(unidadeAtiva as Unidade) }, [isAdmin, unidadeAtiva])

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Vendas</h1><div className="page-subtitle">Extrato de vendas do VHSYS, agrupado por pedido</div></div>
      </div>

      {isAdmin && (
        <div className="form-group" style={{ maxWidth: 320 }}>
          <label className="form-label">Unidade</label>
          <select className="form-select" value={unidade} onChange={e => setUnidade(e.target.value as Unidade)}>
            <option value="">Selecione…</option>
            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      )}

      <ListaVendas unidade={isAdmin ? (unidade || undefined) : undefined} isAdmin={isAdmin} />
    </div>
  )
}

function ListaVendas({ unidade, isAdmin }: { unidade?: string; isAdmin: boolean }) {
  const { unidadeAtiva } = useAuth()
  const [rows, setRows] = useState<RegistroVenda[]>([])
  const [loading, setLoading] = useState(true)
  const [sincronizando, setSincronizando] = useState(false)
  const [erroSync, setErroSync] = useState('')
  const [ano, setAno] = useState(String(ANO_ATUAL))
  const [mes, setMes] = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroProduto, setFiltroProduto] = useState('')
  const [abertos, setAbertos] = useState<Set<string>>(new Set())
  const sb = useMemo(() => createClient(), [])
  const filtro = unidade ?? unidadeAtiva ?? ''

  async function carregar() {
    setLoading(true)
    const { data: registros } = await sb.from('btx_vhsys_registro_vendas')
      .select('id,pedido_vhsys_id,numero_nf,cliente,data_venda,produto_texto,qtd_caixas,valor,sem_conversao')
      .eq('unidade', filtro)
      .order('data_venda', { ascending: false })
    setRows((registros ?? []) as RegistroVenda[])
    setLoading(false)
  }

  useEffect(() => {
    if (!filtro) { setRows([]); setLoading(false); return }
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro])

  function sincronizar() {
    const codigo = VHSYS_UNIDADES.find(u => u.unidade === filtro)?.codigo
    if (!codigo) return
    setSincronizando(true)
    setErroSync('')
    fetch(`/api/vhsys/registro-vendas/sincronizar?unidade=${codigo}&ano=todos`, { method: 'POST' })
      .then(async response => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error ?? 'Falha ao sincronizar.')
        setSincronizando(false)
        carregar()
      })
      .catch(caught => {
        setErroSync(caught instanceof Error ? caught.message : 'Falha inesperada.')
        setSincronizando(false)
      })
  }

  function toggle(pedidoId: string) {
    setAbertos(prev => {
      const novo = new Set(prev)
      if (novo.has(pedidoId)) novo.delete(pedidoId)
      else novo.add(pedidoId)
      return novo
    })
  }

  const rowsFiltradas = rows.filter(r =>
    r.data_venda.startsWith(mes ? `${ano}-${mes}` : ano)
    && (!filtroCliente.trim() || r.cliente.toLocaleLowerCase('pt-BR').includes(filtroCliente.trim().toLocaleLowerCase('pt-BR')))
    && (!filtroProduto.trim() || r.produto_texto.toLocaleLowerCase('pt-BR').includes(filtroProduto.trim().toLocaleLowerCase('pt-BR'))),
  )
  const pedidos = agruparPorPedido(rowsFiltradas)
  const valorTotal = pedidos.reduce((total, p) => total + p.valorTotal, 0)

  if (!filtro) return null

  return (
    <div>
      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ marginBottom: 0, maxWidth: 140 }}>
          <label className="form-label">Ano</label>
          <select className="form-select" value={ano} onChange={e => setAno(e.target.value)}>
            {ANOS_DISPONIVEIS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0, maxWidth: 160 }}>
          <label className="form-label">Mês</label>
          <select className="form-select" value={mes} onChange={e => setMes(e.target.value)}>
            <option value="">Todos</option>
            {MESES.map((nome, i) => <option key={nome} value={String(i + 1).padStart(2, '0')}>{nome}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0, maxWidth: 220 }}>
          <label className="form-label">Cliente contém</label>
          <input className="form-input" value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} placeholder="ex.: due valle" />
        </div>
        <div className="form-group" style={{ marginBottom: 0, maxWidth: 220 }}>
          <label className="form-label">Produto contém</label>
          <input className="form-input" value={filtroProduto} onChange={e => setFiltroProduto(e.target.value)} placeholder="ex.: gudang red" />
        </div>
        {isAdmin && (
          <button className="btn btn-secondary" onClick={sincronizar} disabled={sincronizando}>
            {sincronizando ? 'Sincronizando com o VHSYS…' : 'Sincronizar com o VHSYS'}
          </button>
        )}
      </div>

      {erroSync && <div className="alert alert-red" style={{ marginBottom: 16 }}>Falha ao sincronizar: {erroSync}</div>}

      <div className="table-wrap">
        <table className="table-vendas">
          <colgroup>
            <col style={{ width: 30 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 100 }} />
            <col />
            <col style={{ width: 90 }} />
            <col style={{ width: 130 }} />
          </colgroup>
          <thead><tr><th /><th>Data</th><th>Pedido</th><th>Cliente</th><th className="num">Itens</th><th className="num">Valor</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="empty-state">Carregando...</td></tr>
            : pedidos.length === 0 ? (
              <tr><td colSpan={6} className="empty-state">
                {rows.length === 0
                  ? (isAdmin ? 'Nenhuma venda sincronizada ainda. Clique em "Sincronizar com o VHSYS".' : 'Nenhuma venda sincronizada ainda.')
                  : 'Nenhuma venda encontrada para esse período/filtro.'}
              </td></tr>
            )
            : pedidos.map(p => {
              const aberto = abertos.has(p.pedidoId)
              return (
                <Fragment key={p.pedidoId}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => toggle(p.pedidoId)}>
                    <td className="mono">{aberto ? '▾' : '▸'}</td>
                    <td className="mono">{formatData(p.dataVenda)}</td>
                    <td className="mono" style={{ fontWeight: 700 }}>{p.numeroNf ?? '—'}</td>
                    <td>{p.cliente}</td>
                    <td className="mono num">{p.itens.length}</td>
                    <td className="mono num">{formatMoeda(p.valorTotal)}</td>
                  </tr>
                  {aberto && p.itens.map(item => (
                    <tr key={item.id} className="audit-subrow">
                      <td />
                      <td />
                      <td />
                      <td className="cell-wrap" style={{ fontSize: 12 }}>
                        {item.produto_texto}
                        {item.sem_conversao && <span title="Sem produto correspondente no catálogo local — quantidade em carteiras, não em caixas" style={{ color: 'var(--red)', marginLeft: 4 }}>*</span>}
                      </td>
                      <td className="mono num">{item.qtd_caixas.toLocaleString('pt-BR')} cx</td>
                      <td className="mono num">{formatMoeda(item.valor)}</td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </tbody>
          {pedidos.length > 0 && (
            <tfoot><tr><td colSpan={4} /><td style={{ textAlign: 'right', fontWeight: 700 }}>Total</td><td className="mono num" style={{ fontWeight: 700 }}>{formatMoeda(valorTotal)}</td></tr></tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
