'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import { formatMoeda, getMesAnoLabel, carteirasParaCaixas, mesAtual, anoAtual } from '@/lib/utils'
import type { Produto, Unidade } from '@/types'
import { UNIDADES } from '@/types'

interface EstoqueRow { produto: Produto; inicial: number; comprado: number; vendido: number; ajuste: number; final: number }

export default function RelatoriosPage() {
  const { profile, unidadeAtiva } = useAuth()
  const [mes, setMes] = useState(mesAtual())
  const [ano, setAno] = useState(anoAtual())
  const [unidade, setUnidade] = useState<Unidade | ''>(unidadeAtiva ?? '')
  const [estoqueRows, setEstoqueRows] = useState<EstoqueRow[]>([])
  const [totalCompras, setTotalCompras] = useState(0)
  const [totalVendas, setTotalVendas] = useState(0)
  const [totalDespesas, setTotalDespesas] = useState(0)
  const [loading, setLoading] = useState(false)
  const sb = createClient()
  const isAdmin = profile?.role === 'admin'

  useEffect(() => { if (unidadeAtiva) setUnidade(unidadeAtiva) }, [unidadeAtiva])
  useEffect(() => { if (unidade) load() }, [mes, ano, unidade])

  async function load() {
    if (!unidade) return
    setLoading(true)
    const mesStart = `${ano}-${String(mes).padStart(2,'0')}-01`
    const ultimoDia = new Date(ano, mes, 0).getDate()
    const mesEnd = `${ano}-${String(mes).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`

    const [{ data: prods }, { data: estInit }, { data: comprasNFs }, { data: vendasNFs }, { data: ajustes }, { data: despesas }] = await Promise.all([
      sb.from('btx_produtos').select('*').eq('ativo', true).order('nome'),
      sb.from('btx_estoque_inicial').select('*').eq('unidade', unidade).eq('mes', mes).eq('ano', ano),
      sb.from('btx_compras').select('id, valor_total, itens:btx_compras_itens(produto_id, qtd_carteiras)').eq('unidade', unidade).eq('ativo', true).gte('data_compra', mesStart).lte('data_compra', mesEnd),
      sb.from('btx_vendas').select('id, valor_total, itens:btx_vendas_itens(produto_id, qtd_carteiras)').eq('unidade', unidade).eq('ativo', true).gte('data_venda', mesStart).lte('data_venda', mesEnd),
      sb.from('btx_ajustes_estoque').select('produto_id, qtd_carteiras').eq('unidade', unidade).eq('ativo', true).eq('mes', mes).eq('ano', ano),
      sb.from('btx_despesas').select('valor_total').eq('unidade', unidade).eq('ativo', true).gte('data_despesa', mesStart).lte('data_despesa', mesEnd),
    ])

    type CompraItemRow = { produto_id: string; qtd_carteiras: number }
    type ComprasNFRow = { id: string; valor_total: number; itens: CompraItemRow[] }
    type VendaItemRow = { produto_id: string; qtd_carteiras: number }
    type VendasNFRow = { id: string; valor_total: number; itens: VendaItemRow[] }

    const comprasItens: CompraItemRow[] = (comprasNFs ?? [] as ComprasNFRow[]).flatMap((c: ComprasNFRow) => c.itens ?? [])
    const vendasItens: VendaItemRow[] = (vendasNFs ?? [] as VendasNFRow[]).flatMap((v: VendasNFRow) => v.itens ?? [])

    const rows: EstoqueRow[] = (prods ?? []).map((p: Produto) => {
      const ei = (estInit ?? []).find((e: { produto_id: string }) => e.produto_id === p.id)?.qtd_carteiras ?? 0
      const comp = comprasItens.filter(c => c.produto_id === p.id).reduce((a, c) => a + c.qtd_carteiras, 0)
      const vend = vendasItens.filter(v => v.produto_id === p.id).reduce((a, v) => a + v.qtd_carteiras, 0)
      const aj = (ajustes ?? []).filter((a: { produto_id: string }) => a.produto_id === p.id).reduce((a: number, x: { qtd_carteiras: number }) => a + x.qtd_carteiras, 0)
      return { produto: p, inicial: ei, comprado: comp, vendido: vend, ajuste: aj, final: ei + comp - vend + aj }
    })

    setEstoqueRows(rows)
    setTotalCompras((comprasNFs ?? [] as ComprasNFRow[]).reduce((a: number, c: ComprasNFRow) => a + c.valor_total, 0))
    setTotalVendas((vendasNFs ?? [] as VendasNFRow[]).reduce((a: number, v: VendasNFRow) => a + v.valor_total, 0))
    setTotalDespesas((despesas ?? []).reduce((a: number, d: { valor_total: number }) => a + d.valor_total, 0))
    setLoading(false)
  }

  function navMes(dir: number) {
    let m = mes + dir, a = ano
    if (m < 1) { m = 12; a-- }
    if (m > 12) { m = 1; a++ }
    setMes(m); setAno(a)
  }

  const resultado = totalVendas - totalCompras - totalDespesas

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Relatórios</h1><div className="page-subtitle">Resumo mensal por unidade</div></div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 28, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => navMes(-1)}>← Anterior</button>
        <span style={{ fontWeight: 600, fontSize: 15, minWidth: 160, textAlign: 'center' }}>{getMesAnoLabel(mes, ano)}</span>
        <button className="btn btn-secondary btn-sm" onClick={() => navMes(1)}>Próximo →</button>
        {isAdmin && (
          <select className="form-select" style={{ width: 220 }} value={unidade} onChange={e => setUnidade(e.target.value as Unidade)}>
            <option value="">Selecione a unidade...</option>
            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        )}
      </div>

      {!unidade ? (
        <div className="empty-state">Selecione uma unidade para gerar o relatório.</div>
      ) : loading ? (
        <div className="text-muted">Carregando...</div>
      ) : (
        <>
          <div className="grid-4" style={{ marginBottom: 24 }}>
            <div className="stat-card">
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Compras</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)' }}>{formatMoeda(totalCompras)}</div>
            </div>
            <div className="stat-card">
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Vendas</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--green)' }}>{formatMoeda(totalVendas)}</div>
            </div>
            <div className="stat-card">
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Despesas</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--red)' }}>{formatMoeda(totalDespesas)}</div>
            </div>
            <div className="stat-card">
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Resultado</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)', color: resultado >= 0 ? 'var(--green)' : 'var(--red)' }}>{formatMoeda(resultado)}</div>
            </div>
          </div>

          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Posição de Estoque — {getMesAnoLabel(mes, ano)}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Cx/cart</th>
                  <th>Inicial (cart)</th>
                  <th>Comprado (cart)</th>
                  <th>Vendido (cart)</th>
                  <th>Ajuste (cart)</th>
                  <th>Final (cart)</th>
                  <th>Final (cx)</th>
                </tr>
              </thead>
              <tbody>
                {estoqueRows.map(r => (
                  <tr key={r.produto.id}>
                    <td style={{ fontWeight: 500 }}>{r.produto.nome}</td>
                    <td className="mono">{r.produto.carteiras_por_caixa}</td>
                    <td className="mono">{r.inicial}</td>
                    <td className="mono text-green">{r.comprado}</td>
                    <td className="mono text-red">{r.vendido}</td>
                    <td className="mono">{r.ajuste > 0 ? `+${r.ajuste}` : r.ajuste}</td>
                    <td className="mono" style={{ fontWeight: 700 }}>{r.final}</td>
                    <td className="mono" style={{ fontWeight: 700 }}>{carteirasParaCaixas(r.final, r.produto.carteiras_por_caixa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
