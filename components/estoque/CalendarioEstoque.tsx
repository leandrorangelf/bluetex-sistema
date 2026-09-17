import type { MovimentoEstoqueCalculado } from '@/lib/estoque'

interface Props {
  ano: number
  mes: number
  movimentos: MovimentoEstoqueCalculado[]
  diaSelecionado: string | null
  onSelectDia: (dia: string | null) => void
}

const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

function pad(n: number) { return String(n).padStart(2, '0') }

export default function CalendarioEstoque({ ano, mes, movimentos, diaSelecionado, onSelectDia }: Props) {
  const diasNoMes = new Date(ano, mes, 0).getDate()
  const primeiroDiaSemana = new Date(ano, mes - 1, 1).getDay()

  const porDia = new Map<string, { entrou: number; saiu: number }>()
  for (const m of movimentos) {
    const acc = porDia.get(m.data) ?? { entrou: 0, saiu: 0 }
    if (m.tipo === 'entrada') acc.entrou += m.quantidade
    else acc.saiu += m.quantidade
    porDia.set(m.data, acc)
  }

  const celulas: (string | null)[] = [
    ...Array.from({ length: primeiroDiaSemana }, () => null),
    ...Array.from({ length: diasNoMes }, (_, i) => `${ano}-${pad(mes)}-${pad(i + 1)}`),
  ]

  return (
    <section className="stock-panel">
      <div className="stock-panel-heading">
        <div><span className="stock-eyebrow">Calendário</span><h2>Movimentações do mês</h2></div>
        {diaSelecionado && (
          <button className="btn btn-secondary btn-sm" onClick={() => onSelectDia(null)}>
            {new Date(diaSelecionado + 'T00:00:00').toLocaleDateString('pt-BR')} · limpar filtro
          </button>
        )}
      </div>
      <div className="stock-calendar">
        {DIAS_SEMANA.map((d, i) => <div key={i} className="stock-calendar-dow">{d}</div>)}
        {celulas.map((dia, i) => {
          if (!dia) return <div key={i} className="stock-calendar-cell stock-calendar-cell-empty" />
          const info = porDia.get(dia)
          const numeroDia = Number(dia.slice(-2))
          const ativo = diaSelecionado === dia
          const temMovimento = Boolean(info && (info.entrou > 0 || info.saiu > 0))
          return (
            <button
              key={i}
              type="button"
              className={`stock-calendar-cell${ativo ? ' stock-calendar-cell-active' : ''}${temMovimento ? ' stock-calendar-cell-hasmov' : ''}`}
              onClick={() => temMovimento && onSelectDia(ativo ? null : dia)}
              disabled={!temMovimento}
            >
              <span className="stock-calendar-daynum">{numeroDia}</span>
              {info && info.entrou > 0 && <span className="stock-calendar-pill stock-calendar-pill-in">+{info.entrou.toLocaleString('pt-BR')}</span>}
              {info && info.saiu > 0 && <span className="stock-calendar-pill stock-calendar-pill-out">−{info.saiu.toLocaleString('pt-BR')}</span>}
            </button>
          )
        })}
      </div>
    </section>
  )
}
