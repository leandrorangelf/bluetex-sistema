'use client'

import { useAuth } from '@/lib/auth-context'
import { useEffect, useState } from 'react'

interface LinhaRelatorio {
  cliente: string
  mes: string
  qtd_vendas: number
  total_vendido: number
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

  const totalGeral = dados?.linhas.reduce((soma, linha) => soma + linha.total_vendido, 0) ?? 0

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Relatório de vendas por cliente/mês (VHSYS)</h1>
          <div className="page-subtitle">
            Todo o histórico do VHSYS, direto da API — não usa o filtro de marco zero e não grava nada no sistema.
          </div>
        </div>
      </div>

      {state === 'loading' && <div className="card">Carregando pedidos do VHSYS…</div>}
      {state === 'error' && <div className="alert alert-red">{erro}</div>}

      {state === 'done' && dados && (
        <div className="card">
          <p style={{ marginBottom: 12 }}>
            {dados.total_pedidos_considerados} pedidos considerados
            {dados.total_pedidos_ignorados > 0
              ? ` (${dados.total_pedidos_ignorados} ignorados: cancelados, na lixeira ou sem status válido)`
              : ''}
            {' · '}Total geral: <strong>{formatoMoeda.format(totalGeral)}</strong>
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Mês</th>
                <th>Qtd. vendas</th>
                <th>Total vendido</th>
              </tr>
            </thead>
            <tbody>
              {dados.linhas.map((linha) => (
                <tr key={`${linha.cliente}::${linha.mes}`}>
                  <td>{linha.cliente}</td>
                  <td>{formatarMes(linha.mes)}</td>
                  <td>{linha.qtd_vendas}</td>
                  <td>{formatoMoeda.format(linha.total_vendido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
