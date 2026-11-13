'use client'
// Prévia do quadro com dados de exemplo, só em desenvolvimento (em produção dá 404).
import { notFound } from 'next/navigation'
import { useState } from 'react'
import Quadro, { type FormTarefa } from '@/components/quadro/Quadro'
import { UNIDADES, type Tarefa } from '@/types'

const d = (dias: number) => { const x = new Date(); x.setDate(x.getDate() + dias); return x.toLocaleDateString('sv-SE') }
let seq = 0
const t = (p: Partial<Tarefa>): Tarefa => ({
  id: `demo-${++seq}`, unidade: 'NEW BLUETEX MG', titulo: '', descricao: null, status: 'pendente', prioridade: 'media', categoria: 'outros',
  responsavel: null, prazo: null, checklist: [], bloqueada: false, motivo_bloqueio: null, ordem: seq, sigilosa: false,
  criado_por: 'Gestor', concluida_em: null, confirmada_em: null, confirmada_por: null, created_at: '', updated_at: '', ...p,
})
const INICIAL: Tarefa[] = [
  t({ titulo: 'Cadastrar produtos da unidade', prioridade: 'alta', categoria: 'cadastro', responsavel: 'Ana Souza', prazo: d(3), checklist: [{ texto: 'Conferir nomes', feito: true }, { texto: 'Fator de conversão', feito: false }] }),
  t({ titulo: 'Lançar estoque inicial', prioridade: 'urgente', categoria: 'estoque', responsavel: 'Bruno Lima', prazo: d(-2), unidade: 'NEW BLUETEX SC' }),
  t({ titulo: 'Renegociar contrato do galpão', prioridade: 'alta', sigilosa: true, responsavel: 'Carla Mendes', prazo: d(10), unidade: 'NEW BLUETEX AM' }),
  t({ titulo: 'Validar integração VHSYS', prioridade: 'baixa', categoria: 'vhsys', bloqueada: true, motivo_bloqueio: 'Aguardando credenciais do VHSYS', unidade: 'NEW BLUETEX SC' }),
  t({ titulo: 'Conferir vendas do mês', status: 'andamento', categoria: 'vendas', responsavel: 'Ana Souza', prazo: d(0), checklist: [{ texto: 'MG', feito: true }, { texto: 'SC', feito: true }, { texto: 'AM', feito: false }] }),
  t({ titulo: 'Lançar contas a pagar em aberto', status: 'andamento', categoria: 'financeiro', responsavel: 'Diego Rocha', prazo: d(5), unidade: 'NEW BLUETEX AM' }),
  t({ titulo: 'Definir categorias de despesas', status: 'concluido', categoria: 'financeiro', responsavel: 'Bruno Lima', prazo: d(-4), confirmada_em: new Date().toISOString(), confirmada_por: 'Gestor' }),
  t({ titulo: 'Lançar saldo de caixa inicial', status: 'concluido', categoria: 'financeiro', responsavel: 'Carla Mendes', unidade: 'NEW BLUETEX SC' }),
]

export default function Demo() {
  const [tarefas, setTarefas] = useState(INICIAL)
  if (process.env.NODE_ENV === 'production') notFound()
  async function onPatch(x: Tarefa, patch: Partial<Tarefa>) { setTarefas(ts => ts.map(y => (y.id === x.id ? { ...y, ...patch } : y))) }
  async function onSalvar(f: FormTarefa, id: string | null) {
    const dados = { ...f, unidade: f.unidade || 'NEW BLUETEX MG', descricao: f.descricao || null, responsavel: f.responsavel || null, prazo: f.prazo || null, motivo_bloqueio: f.motivo_bloqueio || null } as Partial<Tarefa>
    setTarefas(ts => (id ? ts.map(y => (y.id === id ? { ...y, ...dados } : y)) : [...ts, t(dados)]))
    return null
  }
  async function onExcluir(id: string) { setTarefas(ts => ts.filter(y => y.id !== id)) }
  return <Quadro tarefas={tarefas} carregando={false} unidades={UNIDADES.slice(0, 3)} isAdmin somenteLeitura={false}
    usuarioNome="Gestor" onPatch={onPatch} onSalvar={onSalvar} onExcluir={onExcluir} voltarHref="/dashboard" />
}
