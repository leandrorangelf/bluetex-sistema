-- ============================================================
-- Atividades sigilosas: só o admin (gestor) vê.
-- Unidade e diretoria não enxergam linhas com sigilosa = true,
-- e a unidade não consegue marcar nada como sigiloso.
-- ============================================================
ALTER TABLE btx_tarefas ADD COLUMN IF NOT EXISTS sigilosa BOOLEAN NOT NULL DEFAULT FALSE;

DROP POLICY IF EXISTS btx_unidade_tarefas ON btx_tarefas;
CREATE POLICY btx_unidade_tarefas ON btx_tarefas FOR ALL
  USING ((select btx_get_my_role())='unidade' AND unidade=(select btx_get_my_unidade()) AND NOT sigilosa)
  WITH CHECK ((select btx_get_my_role())='unidade' AND unidade=(select btx_get_my_unidade()) AND NOT sigilosa);

DROP POLICY IF EXISTS btx_diretoria_read_tarefas ON btx_tarefas;
CREATE POLICY btx_diretoria_read_tarefas ON btx_tarefas FOR SELECT
  USING ((select btx_get_my_role())='diretoria' AND NOT sigilosa);
