'use client'

import { useAuth } from '@/lib/auth-context'
import { useEffect, useState } from 'react'

interface LinhaRelatorio {
  cliente: string
  produto: string
  mes: string
  qtd_caixas: number
  valor: number
  caixas_total_mes: number
}

interface RespostaRelatorio {
  total_pedidos_considerados: number
  total_pedidos_ignorados: number
  linhas: LinhaRelatorio[]
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

function campoCsv(valor: string | number): string {
  const texto = String(valor)
  return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

function exportarCsv(linhas: LinhaRelatorio[]) {
  const cabecalho = ['Cliente', 'Produto', 'Qtd. caixas (SKU)', 'Total caixas no mês', 'Mês', 'Valor']
  const linhasCsv = linhas.map((linha) => [
    linha.cliente,
    linha.produto,
    linha.qtd_caixas,
    linha.caixas_total_mes,
    formatarMes(linha.mes),
    linha.valor.toFixed(2).replace('.', ','),
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

export default function RelatorioVendasVhsysPage() {
  const { profile } = useAuth()
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [dados, setDados] = useState<RespostaRelatorio | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (profile?.role !== 'admin') return
    setState('loading')
    fetch('/api/vhsys/relatorio-vendas')
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
  }, [profile?.role])

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

      {state === 'loading' && <div className="card">Carregando pedidos do VHSYS (pode levar um tempo, busca item a item)…</div>}
      {state === 'error' && <div className="alert alert-red">{erro}</div>}

      {state === 'done' && dados && (
        <div className="card">
          <p style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span>
              {dados.total_pedidos_considerados} pedidos considerados
              {dados.total_pedidos_ignorados > 0
                ? ` (${dados.total_pedidos_ignorados} ignorados: cancelados, na lixeira ou sem status válido)`
                : ''}
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
                <th>Qtd. caixas (SKU)</th>
                <th>Total caixas no mês</th>
                <th>Mês</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {dados.linhas.map((linha) => (
                <tr key={`${linha.cliente}::${linha.produto}::${linha.mes}`}>
                  <td>{linha.cliente}</td>
                  <td>{linha.produto}</td>
                  <td>{linha.qtd_caixas}</td>
                  <td>{linha.caixas_total_mes}</td>
                  <td>{formatarMes(linha.mes)}</td>
                  <td>{formatoMoeda.format(linha.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
