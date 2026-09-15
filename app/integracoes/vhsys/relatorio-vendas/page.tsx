'use client'

import { useAuth } from '@/lib/auth-context'
import { VHSYS_UNIDADES } from '@/lib/vhsys/unidades'
import { useEffect, useState } from 'react'

interface LinhaRelatorio {
  cliente: string
  produto: string
  mes: string
  qtd_caixas: number
  qtd_bruta_vhsys: number
  valor: number
  caixas_total_mes: number
  sem_conversao: boolean
}

interface RespostaHistorico {
  ultima_sincronizacao: string | null
  total_linhas: number
  valor_total: number
  linhas: LinhaRelatorio[]
}

const ANO_ATUAL = new Date().getFullYear()
const ANOS_DISPONIVEIS = Array.from({ length: 6 }, (_, i) => String(ANO_ATUAL - i))

// Estado é fixo pela unidade (a conta VHSYS de cada unidade só tem cliente
// daquele estado) e o coordenador sai do estado, pela regra da operação.
const ESTADO_E_COORD_POR_UNIDADE: Record<string, { estado: string; representante: string }> = {
  MG: { estado: 'MG', representante: 'Igor' },
  GB_SP: { estado: 'SP', representante: 'Igor' },
  SC: { estado: 'SC', representante: 'Rosana' },
  AM: { estado: 'AM', representante: 'Vitor' },
  GB_CE: { estado: 'CE', representante: 'Junior' },
  GB_MA: { estado: 'MA', representante: 'Junior' },
}

const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function formatarMes(mes: string): string {
  const [ano, mesNum] = mes.split('-')
  const nomes = [
    'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
    'jul', 'ago', 'set', 'out', 'nov', 'dez',
  ]
  return `${nomes[Number(mesNum) - 1]}/${ano}`
}

function formatarDataHora(iso: string | null): string {
  if (!iso) return 'nunca'
  const data = new Date(iso)
  return data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

// Linhas vêm ordenadas por cliente/mês/produto — a última linha de cada
// grupo cliente+mês é onde mostramos o total, pra não repetir (e não deixar
// alguém somar a coluna no Excel e inflar o resultado).
function ultimaDoGrupo(linhas: LinhaRelatorio[], indice: number): boolean {
  const atual = linhas[indice]
  const proxima = linhas[indice + 1]
  return !proxima || proxima.cliente !== atual.cliente || proxima.mes !== atual.mes
}

function campoCsv(valor: string | number): string {
  const texto = String(valor)
  return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

function baixarCsv(cabecalho: string[], linhas: (string | number)[][], nomeArquivo: string) {
  const conteudo = [cabecalho, ...linhas]
    .map((linha) => linha.map(campoCsv).join(';'))
    .join('\r\n')
  const blob = new Blob([`﻿${conteudo}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nomeArquivo
  link.click()
  URL.revokeObjectURL(url)
}

function exportarCsv(linhas: LinhaRelatorio[]) {
  const cabecalho = ['Cliente', 'Produto', 'Qtd. bruta (VHSYS)', 'Qtd. caixas (SKU)', 'Total caixas no mês', 'Mês', 'Valor', 'Obs.']
  const linhasCsv = linhas.map((linha, indice) => [
    linha.cliente,
    linha.produto,
    linha.qtd_bruta_vhsys,
    linha.qtd_caixas,
    ultimaDoGrupo(linhas, indice) ? linha.caixas_total_mes : '',
    formatarMes(linha.mes),
    linha.valor.toFixed(2).replace('.', ','),
    linha.sem_conversao ? 'sem produto correspondente no catálogo — quantidade em carteiras, não em caixas' : '',
  ])
  baixarCsv(cabecalho, linhasCsv, `vendas-vhsys-por-cliente-produto-mes-${new Date().toISOString().slice(0, 10)}.csv`)
}

interface LinhaMatriz {
  cliente: string
  totalPorMes: Map<string, number>
}

// Pivô cliente × mês: uma linha por cliente, uma coluna por mês, valor =
// total de caixas daquele cliente no mês (soma de todos os produtos —
// já vem pronto em caixas_total_mes, só precisa desduplicar por cliente/mês).
function montarMatriz(linhas: LinhaRelatorio[]): { clientes: LinhaMatriz[]; meses: string[] } {
  const porCliente = new Map<string, Map<string, number>>()
  const mesesSet = new Set<string>()
  for (const linha of linhas) {
    mesesSet.add(linha.mes)
    if (!porCliente.has(linha.cliente)) porCliente.set(linha.cliente, new Map())
    porCliente.get(linha.cliente)!.set(linha.mes, linha.caixas_total_mes)
  }
  const meses = [...mesesSet].sort()
  const clientes = [...porCliente.entries()]
    .map(([cliente, totalPorMes]) => ({ cliente, totalPorMes }))
    .sort((a, b) => a.cliente.localeCompare(b.cliente, 'pt-BR'))
  return { clientes, meses }
}

function exportarMatrizCsv(linhas: LinhaRelatorio[], unidade: string) {
  const { clientes, meses } = montarMatriz(linhas)
  const infoUnidade = ESTADO_E_COORD_POR_UNIDADE[unidade]
  const cabecalho = ['CLIENTE', 'ESTADO', 'REPRESENTANTES', ...meses.map(formatarMes)]
  const linhasCsv = clientes.map(({ cliente, totalPorMes }) => [
    cliente,
    infoUnidade?.estado ?? '',
    infoUnidade?.representante ?? '',
    ...meses.map((mes) => totalPorMes.get(mes) ?? 0),
  ])
  baixarCsv(cabecalho, linhasCsv, `vendas-vhsys-por-cliente-mes-${unidade}-${new Date().toISOString().slice(0, 10)}.csv`)
}

export default function RelatorioVendasVhsysPage() {
  const { profile } = useAuth()
  const [unidade, setUnidade] = useState(VHSYS_UNIDADES[0].codigo)
  const [ano, setAno] = useState(String(ANO_ATUAL))
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroProduto, setFiltroProduto] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [dados, setDados] = useState<RespostaHistorico | null>(null)
  const [erro, setErro] = useState('')
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'error'>('idle')
  const [syncErro, setSyncErro] = useState('')

  // A busca só lê do nosso banco (rápido, não chama o VHSYS) — carrega
  // sozinha sempre que unidade/ano/filtro mudam. Os campos de texto têm uma
  // pequena pausa (debounce) depois da última letra digitada, pra não
  // disparar uma requisição a cada tecla.
  useEffect(() => {
    if (profile?.role !== 'admin') return
    const atraso = setTimeout(buscar, 300)
    return () => clearTimeout(atraso)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.role, unidade, ano, filtroCliente, filtroProduto])

  function paramsBase() {
    const params = new URLSearchParams({ unidade })
    if (ano !== 'todos') params.set('ano', ano)
    return params
  }

  function buscar() {
    setState('loading')
    setErro('')
    const params = paramsBase()
    if (filtroCliente.trim()) params.set('cliente', filtroCliente.trim())
    if (filtroProduto.trim()) params.set('produto', filtroProduto.trim())
    fetch(`/api/vhsys/relatorio-vendas/historico?${params.toString()}`)
      .then(async (response) => {
        const body = await response.json() as RespostaHistorico & { error?: string }
        if (!response.ok) throw new Error(body.error ?? 'Falha ao buscar histórico.')
        setDados(body)
        setState('done')
      })
      .catch((caught) => {
        setErro(caught instanceof Error ? caught.message : 'Falha inesperada.')
        setState('error')
      })
  }

  function sincronizar() {
    setSyncState('syncing')
    setSyncErro('')
    fetch(`/api/vhsys/relatorio-vendas/sincronizar?${paramsBase().toString()}`, { method: 'POST' })
      .then(async (response) => {
        const body = await response.json() as { error?: string }
        if (!response.ok) throw new Error(body.error ?? 'Falha ao sincronizar.')
        setSyncState('idle')
        buscar()
      })
      .catch((caught) => {
        setSyncErro(caught instanceof Error ? caught.message : 'Falha inesperada.')
        setSyncState('error')
      })
  }

  if (profile?.role !== 'admin') {
    return (
      <div className="alert alert-red">
        A integração VHSYS é restrita a administradores.
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Relatório de vendas por cliente/produto/mês (VHSYS)</h1>
          <div className="page-subtitle">
            Lê do histórico salvo no sistema — filtra na hora. Clique em Sincronizar pra atualizar com o VHSYS.
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 700 }}>Unidade</label>
          <select className="input" value={unidade} onChange={(e) => setUnidade(e.target.value)} style={{ maxWidth: 280 }}>
            {VHSYS_UNIDADES.map((u) => (
              <option key={u.codigo} value={u.codigo}>{u.unidade}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 700 }}>Ano</label>
          <select className="input" value={ano} onChange={(e) => setAno(e.target.value)} style={{ maxWidth: 200 }}>
            {ANOS_DISPONIVEIS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
            <option value="todos">Todos os anos</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 700 }}>Cliente contém</label>
          <input
            className="input"
            value={filtroCliente}
            onChange={(e) => setFiltroCliente(e.target.value)}
            placeholder="ex.: due valle"
            style={{ maxWidth: 220 }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 700 }}>Produto contém</label>
          <input
            className="input"
            value={filtroProduto}
            onChange={(e) => setFiltroProduto(e.target.value)}
            placeholder="ex.: gudang red"
            style={{ maxWidth: 220 }}
          />
        </div>
        <button className="btn" onClick={sincronizar} disabled={syncState === 'syncing'}>
          {syncState === 'syncing' ? 'Sincronizando com o VHSYS…' : 'Sincronizar com o VHSYS'}
        </button>
      </div>

      {syncState === 'error' && <div className="alert alert-red" style={{ marginBottom: 16 }}>Falha ao sincronizar: {syncErro}</div>}

      {state === 'loading' && <div className="card">Carregando…</div>}
      {state === 'error' && <div className="alert alert-red">{erro}</div>}

      {state === 'done' && dados && (
        <div className="card">
          <p style={{ marginBottom: 4, fontSize: 13, color: 'var(--muted, #666)' }}>
            Última sincronização com o VHSYS: <strong>{formatarDataHora(dados.ultima_sincronizacao)}</strong>
          </p>
          <p style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span>
              {dados.total_linhas} linhas · Total geral: <strong>{formatoMoeda.format(dados.valor_total)}</strong>
            </span>
            <button className="btn btn-primary" onClick={() => exportarCsv(dados.linhas)}>
              Exportar para Excel
            </button>
          </p>
          {dados.linhas.length === 0 ? (
            <p style={{ color: 'var(--muted, #666)' }}>
              Nada salvo ainda pra esses filtros. Clique em &quot;Sincronizar com o VHSYS&quot; pra trazer os dados.
            </p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Produto</th>
                  <th>Qtd. bruta (VHSYS)</th>
                  <th>Qtd. caixas (SKU)</th>
                  <th>Total caixas no mês</th>
                  <th>Mês</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {dados.linhas.map((linha, indice) => (
                  <tr key={`${linha.cliente}::${linha.produto}::${linha.mes}`}>
                    <td>{linha.cliente}</td>
                    <td>
                      {linha.produto}
                      {linha.sem_conversao && (
                        <span
                          title="Sem produto correspondente no catálogo local — quantidade em carteiras, não em caixas"
                          style={{ color: 'var(--red)', marginLeft: 4 }}
                        >
                          *
                        </span>
                      )}
                    </td>
                    <td>{linha.qtd_bruta_vhsys}</td>
                    <td>{linha.qtd_caixas}</td>
                    <td>{ultimaDoGrupo(dados.linhas, indice) ? linha.caixas_total_mes : ''}</td>
                    <td>{formatarMes(linha.mes)}</td>
                    <td>{formatoMoeda.format(linha.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {dados.linhas.some((linha) => linha.sem_conversao) && (
            <p style={{ marginTop: 12, color: 'var(--red)', fontSize: 13 }}>
              * produto sem correspondência no catálogo local — quantidade ficou em carteiras, não convertida para caixas.
            </p>
          )}
        </div>
      )}

      {state === 'done' && dados && dados.linhas.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <p style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span>
              <strong>Total por cliente/mês</strong> (todos os produtos somados — mesmo formato da sua planilha)
            </span>
            <button className="btn btn-primary" onClick={() => exportarMatrizCsv(dados.linhas, unidade)}>
              Exportar para Excel
            </button>
          </p>
          {(() => {
            const { clientes, meses } = montarMatriz(dados.linhas)
            const infoUnidade = ESTADO_E_COORD_POR_UNIDADE[unidade]
            return (
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Estado</th>
                      <th>Representante</th>
                      {meses.map((mes) => <th key={mes}>{formatarMes(mes)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {clientes.map(({ cliente, totalPorMes }) => (
                      <tr key={cliente}>
                        <td>{cliente}</td>
                        <td>{infoUnidade?.estado ?? '—'}</td>
                        <td>{infoUnidade?.representante ?? '—'}</td>
                        {meses.map((mes) => <td key={mes}>{totalPorMes.get(mes) ?? 0}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
