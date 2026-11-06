-- ============================================================
-- Kanban de atividades por unidade (pendente / em andamento / concluído).
-- admin: tudo | unidade: só a própria | diretoria: leitura.
-- ============================================================
CREATE TABLE IF NOT EXISTS btx_tarefas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','andamento','concluido')),
  prioridade TEXT NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa','media','alta','urgente')),
  categoria TEXT NOT NULL DEFAULT 'outros',
  responsavel TEXT,
  prazo DATE,
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ "texto": "...", "feito": false }]
  bloqueada BOOLEAN NOT NULL DEFAULT FALSE,
  motivo_bloqueio TEXT,
  ordem DOUBLE PRECISION NOT NULL DEFAULT 0,
  criado_por TEXT,
  concluida_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS btx_tarefas_unidade_status_idx ON btx_tarefas (unidade, status);

ALTER TABLE btx_tarefas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS btx_admin_all_tarefas ON btx_tarefas;
DROP POLICY IF EXISTS btx_unidade_tarefas ON btx_tarefas;
DROP POLICY IF EXISTS btx_diretoria_read_tarefas ON btx_tarefas;
CREATE POLICY btx_admin_all_tarefas ON btx_tarefas FOR ALL
  USING ((select btx_get_my_role())='admin') WITH CHECK ((select btx_get_my_role())='admin');
CREATE POLICY btx_unidade_tarefas ON btx_tarefas FOR ALL
  USING ((select btx_get_my_role())='unidade' AND unidade=(select btx_get_my_unidade()))
  WITH CHECK ((select btx_get_my_role())='unidade' AND unidade=(select btx_get_my_unidade()));
CREATE POLICY btx_diretoria_read_tarefas ON btx_tarefas FOR SELECT
  USING ((select btx_get_my_role())='diretoria');
