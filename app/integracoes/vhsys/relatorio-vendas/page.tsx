'use client'

import { useAuth } from '@/lib/auth-context'
import { VHSYS_UNIDADES } from '@/lib/vhsys/unidades'
import { useState } from 'react'

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

interface RespostaRelatorio {
  ano_selecionado: string | null
  total_pedidos_considerados: number
  total_pedidos_ignorados: number
  pedidos_fora_do_ano: number
  motivos_exclusao: { lixeira: number; cancelado: number; status_invalido: number; sem_data: number }
  data_mais_antiga: string | null
  data_mais_recente: string | null
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
  const conteudo = [cabecalho, ...linhasCsv]
    .map((linha) => linha.map(campoCsv).join(';'))
    .join('\r\n')
  const blob = new Blob([`﻿${conteudo}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `vendas-vhsys-por-cliente-mes-${unidade}-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
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
  const conteudo = [cabecalho, ...linhasCsv]
    .map((linha) => linha.map(campoCsv).join(';'))
    .join('\r\n')
  const blob = new Blob([`﻿${conteudo}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `vendas-vhsys-por-cliente-produto-mes-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function formatarData(data: string | null): string {
  if (!data) return '—'
  const [ano, mes, dia] = data.split('-')
  return `${dia}/${mes}/${ano}`
}

export default function RelatorioVendasVhsysPage() {
  const { profile } = useAuth()
  const [unidade, setUnidade] = useState(VHSYS_UNIDADES[0].codigo)
  const [ano, setAno] = useState(String(ANO_ATUAL))
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [dados, setDados] = useState<RespostaRelatorio | null>(null)
  const [erro, setErro] = useState('')

  function buscar() {
    setState('loading')
    setDados(null)
    const anoQuery = ano === 'todos' ? '' : `&ano=${encodeURIComponent(ano)}`
    fetch(`/api/vhsys/relatorio-vendas?unidade=${encodeURIComponent(unidade)}${anoQuery}`)
      .then(async (response) => {
        const body = await response.json() as RespostaRelatorio & { error?: string }
        if (!response.ok) throw new Error(body.error ?? 'Falha ao buscar relatório.')
        setDados(body)
        setState('done')
      })
      .catch((caught) => {
        setErro(caught instanceof Error ? caught.message : 'Falha inesperada.')
        setState('error')
      })
  }

  if (profile?.role !== 'admin') {
    return (
      <div className="alert alert-red">
        A integração VHSYS é restrita a administradores.
      </div>
    )
  }

  const totalGeral = dados?.linhas.reduce((soma, linha) => soma + linha.valor, 0) ?? 0

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Relatório de vendas por cliente/produto/mês (VHSYS)</h1>
          <div className="page-subtitle">
            Todo o histórico do VHSYS, direto da API — não usa o filtro de marco zero e não grava nada no sistema.
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 700 }}>Unidade</label>
          <select
            className="input"
            value={unidade}
            onChange={(e) => setUnidade(e.target.value)}
            style={{ maxWidth: 280 }}
          >
            {VHSYS_UNIDADES.map((u) => (
              <option key={u.codigo} value={u.codigo}>{u.unidade}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 700 }}>Ano</label>
          <select
            className="input"
            value={ano}
            onChange={(e) => setAno(e.target.value)}
            style={{ maxWidth: 200 }}
          >
            {ANOS_DISPONIVEIS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
            <option value="todos">Todos os anos (mais lento)</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={buscar} disabled={state === 'loading'}>
          {state === 'loading' ? 'Buscando…' : 'Buscar'}
        </button>
      </div>

      {state === 'loading' && <div className="card">Carregando pedidos do VHSYS (pode levar um tempo, busca item a item)…</div>}
      {state === 'error' && <div className="alert alert-red">{erro}</div>}

      {state === 'done' && dados && (
        <div className="card">
          <p style={{ marginBottom: 4, fontSize: 13, color: 'var(--muted, #666)' }}>
            Pedidos do VHSYS entre <strong>{formatarData(dados.data_mais_antiga)}</strong> e{' '}
            <strong>{formatarData(dados.data_mais_recente)}</strong>
            {dados.ano_selecionado && dados.pedidos_fora_do_ano > 0 && (
              <> · {dados.pedidos_fora_do_ano} pedidos válidos de outros anos ficaram de fora (filtro de ano ativo)</>
            )}
            {(dados.motivos_exclusao.cancelado + dados.motivos_exclusao.lixeira
              + dados.motivos_exclusao.status_invalido + dados.motivos_exclusao.sem_data) > 0 && (
              <> · ignorados: {dados.motivos_exclusao.cancelado} cancelados, {dados.motivos_exclusao.lixeira} na lixeira,{' '}
                {dados.motivos_exclusao.status_invalido} com status não reconhecido,{' '}
                {dados.motivos_exclusao.sem_data} sem data</>
            )}
          </p>
          <p style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span>
              {dados.total_pedidos_considerados} pedidos considerados
              {' · '}Total geral: <strong>{formatoMoeda.format(totalGeral)}</strong>
            </span>
            <button className="btn btn-primary" onClick={() => exportarCsv(dados.linhas)}>
              Exportar para Excel
            </button>
          </p>
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
