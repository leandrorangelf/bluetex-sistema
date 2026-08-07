import type { AuditoriaEstoque } from '@/types'

interface Props {
  registros: AuditoriaEstoque[]
  nomesUsuarios: Record<string, string>
}

const OPERACOES = { INSERT: 'Criação', UPDATE: 'Edição', DELETE: 'Exclusão' }

function dataHora(valor: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(valor))
}

function resumoDados(dados: Record<string, unknown> | null) {
  if (!dados) return '—'
  const ignorados = new Set(['id', 'created_at', 'updated_at'])
  return Object.entries(dados).filter(([chave]) => !ignorados.has(chave)).map(([chave, valor]) => `${chave}: ${String(valor ?? '—')}`).join(' · ')
}

export default function HistoricoAuditoriaEstoque({ registros, nomesUsuarios }: Props) {
  return (
    <section className="stock-panel stock-audit-panel">
      <div className="stock-panel-heading">
        <div><span className="stock-eyebrow">Somente administradores</span><h2>Histórico de alterações</h2></div>
        <span className="stock-panel-count">{registros.length} registros</span>
      </div>
      <div className="table-wrap">
        <table className="stock-audit-table">
          <thead><tr><th>Data e hora</th><th>Usuário</th><th>Ação</th><th>Origem</th><th>Antes</th><th>Depois</th></tr></thead>
          <tbody>
            {registros.length === 0 ? <tr><td colSpan={6} className="empty-state">Nenhuma alteração registrada.</td></tr> : registros.map(item => (
              <tr key={item.id}>
                <td className="mono">{dataHora(item.created_at)}</td>
                <td>{item.usuario_id ? nomesUsuarios[item.usuario_id] || item.usuario_id.slice(0, 8) : 'Sistema'}</td>
                <td><span className={`stock-audit-operation operation-${item.operacao.toLowerCase()}`}>{OPERACOES[item.operacao]}</span></td>
                <td className="mono">{item.tabela.replace('btx_', '')}</td>
                <td className="stock-audit-data">{resumoDados(item.dados_anteriores)}</td>
                <td className="stock-audit-data">{resumoDados(item.dados_novos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
