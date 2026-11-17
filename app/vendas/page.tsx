'use client'
export const dynamic = 'force-dynamic'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import { formatMoeda, formatData } from '@/lib/utils'
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
  caixasTotal: number
}

function agruparPorPedido(rows: RegistroVenda[]): Pedido[] {
  const porPedido = new Map<string, Pedido>()
  for (const r of rows) {
    const atual = porPedido.get(r.pedido_vhsys_id)
    if (atual) {
      atual.itens.push(r)
      atual.valorTotal += r.valor
      atual.caixasTotal += r.qtd_caixas
    } else {
      porPedido.set(r.pedido_vhsys_id, {
        pedidoId: r.pedido_vhsys_id, numeroNf: r.numero_nf, cliente: r.cliente,
        dataVenda: r.data_venda, itens: [r], valorTotal: r.valor, caixasTotal: r.qtd_caixas,
      })
    }
  }
  return [...porPedido.values()].sort((a, b) => b.dataVenda.localeCompare(a.dataVenda) || b.pedidoId.localeCompare(a.pedidoId))
}

function Seta({ aberto }: { aberto: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 12 12" fill="none"
      style={{ transform: aberto ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s ease' }}
    >
      <path d="M4 2.5L8 6L4 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const ANO_ATUAL = new Date().getFullYear()
const ANOS_DISPONIVEIS = Array.from({ length: 6 }, (_, i) => String(ANO_ATUAL - i))
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

// A unidade vem só do seletor do topo (unidadeAtiva): admin troca lá, usuário de unidade já tem a sua.
export default function VendasPage() {
  const { profile } = useAuth()
  return <ListaVendas isAdmin={profile?.role === 'admin'} />
}

function ListaVendas({ isAdmin }: { isAdmin: boolean }) {
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
  const filtro = unidadeAtiva ?? ''

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

  if (!filtro) return <div className="empty-state">Selecione uma unidade no topo da página.</div>

  const periodo = mes ? `${MESES[Number(mes) - 1]} ${ano}` : ano
  // com "Todos os meses", a lista ganha um cabeçalho por mês (pedidos já vêm do mais novo pro mais antigo)
  const porMes = new Map<string, { n: number; total: number }>()
  for (const p of pedidos) {
    const k = p.dataVenda.slice(0, 7)
    const g = porMes.get(k) ?? { n: 0, total: 0 }
    g.n += 1
    g.total += p.valorTotal
    porMes.set(k, g)
  }
  let mesAnterior = ''

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Vendas</h1>
          <div className="page-subtitle">Extrato do VHSYS por pedido · {periodo} · {pedidos.length} pedido{pedidos.length === 1 ? '' : 's'} · {formatMoeda(valorTotal)}</div>
        </div>
      </div>

      {erroSync && <div className="alert alert-red" style={{ marginBottom: 16 }}>Falha ao sincronizar: {erroSync}</div>}

      <div className="fin-card">
        <div className="fin-bar">
          <select className="form-select" aria-label="Ano" value={ano} onChange={e => setAno(e.target.value)}>
            {ANOS_DISPONIVEIS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select className="form-select" aria-label="Mês" value={mes} onChange={e => setMes(e.target.value)}>
            <option value="">Todos os meses</option>
            {MESES.map((nome, i) => <option key={nome} value={String(i + 1).padStart(2, '0')}>{nome}</option>)}
          </select>
          <input className="form-input fin-search" aria-label="Filtrar por cliente" value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} placeholder="Cliente" />
          <input className="form-input fin-search" aria-label="Filtrar por produto" value={filtroProduto} onChange={e => setFiltroProduto(e.target.value)} placeholder="Produto" />
          {isAdmin && (
            <button className="btn btn-secondary btn-sm fin-right" onClick={sincronizar} disabled={sincronizando}>
              {sincronizando ? 'Sincronizando com o VHSYS…' : 'Sincronizar com o VHSYS'}
            </button>
          )}
        </div>
        <div className="fin-scroll">
        <table className="table-vendas">
          <colgroup>
            <col style={{ width: 26 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 100 }} />
            <col />
            <col style={{ width: 90 }} />
            <col style={{ width: 130 }} />
          </colgroup>
          <thead><tr><th /><th>Data</th><th>NF</th><th>Cliente</th><th className="num">Caixas</th><th className="num">Valor</th></tr></thead>
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
              const temVariosItens = p.itens.length > 1
              const chaveMes = p.dataVenda.slice(0, 7)
              const novoMes = !mes && chaveMes !== mesAnterior
              mesAnterior = chaveMes
              const totalMes = porMes.get(chaveMes)
              return (
                <Fragment key={p.pedidoId}>
                  {novoMes && totalMes && (
                    <tr className="venda-mes">
                      <td colSpan={6}>
                        <div>
                          <span>{MESES[Number(chaveMes.slice(5)) - 1]} {chaveMes.slice(0, 4)}</span>
                          <span>{totalMes.n} pedido{totalMes.n === 1 ? '' : 's'} · {formatMoeda(totalMes.total)}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  <tr className="venda-row-pedido" onClick={() => toggle(p.pedidoId)}>
                    <td className="venda-chevron"><Seta aberto={aberto} /></td>
                    <td className="mono">{formatData(p.dataVenda)}</td>
                    <td className="mono" style={{ fontWeight: 700 }}>{p.numeroNf ?? '—'}</td>
                    <td>{p.cliente}{temVariosItens && <span className="badge badge-gray venda-badge-itens">{p.itens.length} produtos</span>}</td>
                    <td className="mono num">{p.caixasTotal.toLocaleString('pt-BR')}</td>
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
                      <td className="mono num">{item.qtd_caixas.toLocaleString('pt-BR')}</td>
                      <td className="mono num">{formatMoeda(item.valor)}</td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        </div>
        <div className="fin-foot">
          <span>Valores e quantidades vêm do VHSYS.</span>
          <span>Total <b className="mono">{formatMoeda(valorTotal)}</b></span>
        </div>
      </div>
    </div>
  )
}
