'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import Quadro, { type FormTarefa } from '@/components/quadro/Quadro'
import { UNIDADES, type Tarefa } from '@/types'

export default function QuadroPage() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const sb = createClient()
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [carregando, setCarregando] = useState(true)
  const isAdmin = profile?.role === 'admin'
  const somenteLeitura = profile?.role === 'diretoria'
  // Gestor e diretoria veem todas as unidades; a unidade vê só a dela.
  const unidades = profile?.role === 'unidade' ? (profile.unidade ? [profile.unidade] : []) : UNIDADES

  useEffect(() => { if (!loading && !user) router.push('/login') }, [loading, user, router])
  useEffect(() => { if (profile) carregar() }, [profile]) // eslint-disable-line react-hooks/exhaustive-deps

  async function carregar() {
    let q = sb.from('btx_tarefas').select('*').order('ordem')
    if (profile?.role === 'unidade') q = q.eq('unidade', profile.unidade!)
    const { data } = await q
    // A RLS já esconde as sigilosas de quem não é gestor; o filtro é só redundância.
    setTarefas(((data ?? []) as Tarefa[]).filter(t => isAdmin || !t.sigilosa))
    setCarregando(false)
  }

  async function onPatch(t: Tarefa, patch: Partial<Tarefa>) {
    if (somenteLeitura) return
    const antes = tarefas
    setTarefas(ts => ts.map(x => (x.id === t.id ? { ...x, ...patch } : x))) // otimista
    const { error } = await sb.from('btx_tarefas').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', t.id)
    if (error) { setTarefas(antes); alert('Não foi possível salvar: ' + error.message) }
  }

  async function onSalvar(f: FormTarefa, id: string | null) {
    const atual = tarefas.find(t => t.id === id)
    const mudouStatus = !atual || atual.status !== f.status
    const payload = {
      titulo: f.titulo.trim(), descricao: f.descricao.trim() || null, status: f.status, prioridade: f.prioridade, categoria: f.categoria,
      responsavel: f.responsavel.trim() || null, prazo: f.prazo || null, checklist: f.checklist,
      bloqueada: f.bloqueada, motivo_bloqueio: f.bloqueada ? f.motivo_bloqueio.trim() || null : null,
      concluida_em: f.status === 'concluido' ? (atual?.concluida_em ?? new Date().toISOString()) : null,
      ...(f.status !== 'concluido' ? { confirmada_em: null, confirmada_por: null } : {}),
      ...(isAdmin ? { sigilosa: f.sigilosa } : {}), // só o gestor decide o sigilo
      ...(mudouStatus ? { ordem: Math.max(0, ...tarefas.filter(t => t.status === f.status).map(t => t.ordem)) + 1 } : {}),
      updated_at: new Date().toISOString(),
    }
    const { error } = id
      ? await sb.from('btx_tarefas').update({ ...payload, unidade: f.unidade }).eq('id', id)
      : await sb.from('btx_tarefas').insert({ ...payload, unidade: f.unidade, criado_por: profile?.nome ?? null })
    if (error) return 'Não foi possível salvar: ' + error.message
    await carregar()
    return null
  }

  async function onExcluir(id: string) {
    const { error } = await sb.from('btx_tarefas').delete().eq('id', id)
    if (error) alert('Não foi possível excluir: ' + error.message)
    await carregar()
  }

  if (loading || !profile) return <div className="flex min-h-screen items-center justify-center bg-[#F3F4F8] text-[14px] text-[#6B7186]">Carregando quadro...</div>

  return (
    <Quadro tarefas={tarefas} carregando={carregando} unidades={unidades} isAdmin={isAdmin} somenteLeitura={somenteLeitura}
      usuarioNome={profile.nome} onPatch={onPatch} onSalvar={onSalvar} onExcluir={onExcluir} voltarHref="/dashboard" />
  )
}
