'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import { formatMoeda, formatData } from '@/lib/utils'
import { UNIDADES, type Unidade } from '@/types'
import { VHSYS_UNIDADES } from '@/lib/vhsys/unidades'
import { calcularSituacaoPorNf, type SituacaoVenda } from '@/lib/vendas-situacao'

interface RegistroVenda {
  id: string
  numero_nf: string | null
  cliente: string
  data_venda: string
  produto_texto: string
  qtd_caixas: number
  valor: number
  sem_conversao: boolean
}

function badgeSituacao(situacao: SituacaoVenda) {
  const classe = situacao === 'pago' ? 'badge-green' : situacao === 'parcial' ? 'badge-amber' : situacao === 'pendente' ? 'badge-red' : 'badge-gray'
  const label = situacao === 'pago' ? 'Pago' : situacao === 'parcial' ? 'Parcial' : situacao === 'pendente' ? 'Pendente' : 'Não conciliado'
  return <span className={`badge ${classe}`}>{label}</span>
}

export default function VendasPage() {
  const { profile, unidadeAtiva } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [unidade, setUnidade] = useState<Unidade | ''>((unidadeAtiva as Unidade) ?? '')

  useEffect(() => { if (!isAdmin && unidadeAtiva) setUnidade(unidadeAtiva as Unidade) }, [isAdmin, unidadeAtiva])

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Vendas</h1><div className="page-subtitle">Extrato de vendas do VHSYS — data, cliente, produto, caixas e valor</div></div>
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
  const [situacoes, setSituacoes] = useState<Map<string, SituacaoVenda>>(new Map())
  const [loading, setLoading] = useState(true)
  const [sincronizando, setSincronizando] = useState(false)
  const [erroSync, setErroSync] = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroProduto, setFiltroProduto] = useState('')
  const sb = useMemo(() => createClient(), [])
  const filtro = unidade ?? unidadeAtiva ?? ''

  async function carregar() {
    setLoading(true)
    const [{ data: registros }, { data: vendas }, { data: parcelas }] = await Promise.all([
      sb.from('btx_vhsys_registro_vendas')
        .select('id,numero_nf,cliente,data_venda,produto_texto,qtd_caixas,valor,sem_conversao')
        .eq('unidade', filtro)
        .order('data_venda', { ascending: false }),
      sb.from('btx_vendas').select('id,numero_nf').eq('unidade', filtro),
      sb.from('btx_parcelas').select('origem_id,status').eq('unidade', filtro).eq('tipo', 'receber').eq('origem', 'venda'),
    ])
    setRows((registros ?? []) as RegistroVenda[])
    setSituacoes(calcularSituacaoPorNf((vendas ?? []) as { id: string; numero_nf: string | null }[], (parcelas ?? []) as { origem_id: string; status: string }[]))
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

  const rowsFiltradas = rows.filter(r =>
    (!filtroCliente.trim() || r.cliente.toLocaleLowerCase('pt-BR').includes(filtroCliente.trim().toLocaleLowerCase('pt-BR')))
    && (!filtroProduto.trim() || r.produto_texto.toLocaleLowerCase('pt-BR').includes(filtroProduto.trim().toLocaleLowerCase('pt-BR'))),
  )
  const valorTotal = rowsFiltradas.reduce((total, r) => total + r.valor, 0)

  if (!filtro) return null

  return (
    <div>
      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
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
            <col style={{ width: 100 }} />
            <col style={{ width: 120 }} />
            <col />
            <col />
            <col style={{ width: 90 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 120 }} />
          </colgroup>
          <thead><tr><th>Data</th><th>NF</th><th>Cliente</th><th>Produto</th><th className="num">Caixas</th><th className="num">Valor</th><th>Situação</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="empty-state">Carregando...</td></tr>
            : rowsFiltradas.length === 0 ? (
              <tr><td colSpan={7} className="empty-state">
                {rows.length === 0
                  ? (isAdmin ? 'Nenhuma venda sincronizada ainda. Clique em "Sincronizar com o VHSYS".' : 'Nenhuma venda sincronizada ainda.')
                  : 'Nenhuma venda encontrada para esse filtro.'}
              </td></tr>
            )
            : rowsFiltradas.map(r => (
              <tr key={r.id}>
                <td className="mono">{formatData(r.data_venda)}</td>
                <td className="mono" style={{ fontWeight: 700 }}>{r.numero_nf ?? '—'}</td>
                <td>{r.cliente}</td>
                <td className="cell-wrap" style={{ fontSize: 12 }}>
                  {r.produto_texto}
                  {r.sem_conversao && <span title="Sem produto correspondente no catálogo local — quantidade em carteiras, não em caixas" style={{ color: 'var(--red)', marginLeft: 4 }}>*</span>}
                </td>
                <td className="mono num">{r.qtd_caixas.toLocaleString('pt-BR')}</td>
                <td className="mono num">{formatMoeda(r.valor)}</td>
                <td>{badgeSituacao(r.numero_nf ? (situacoes.get(r.numero_nf) ?? 'não conciliado') : 'não conciliado')}</td>
              </tr>
            ))}
          </tbody>
          {rowsFiltradas.length > 0 && (
            <tfoot><tr><td colSpan={5} style={{ textAlign: 'right', fontWeight: 700 }}>Total</td><td className="mono num" style={{ fontWeight: 700 }}>{formatMoeda(valorTotal)}</td><td /></tr></tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
