-- ============================================================
-- Permite que usuários com role "unidade" registrem, editem e
-- excluam pagamentos (btx_pagamentos_parcela) das próprias
-- parcelas da sua unidade — antes só admin tinha acesso a essa
-- tabela (e diretoria, só leitura), então usuário de unidade não
-- conseguia dar baixa em conta a pagar/receber.
-- ============================================================

CREATE POLICY "btx_unidade_pagamentos_parcela" ON btx_pagamentos_parcela FOR ALL
USING (
  btx_get_my_role() = 'unidade'
  AND EXISTS (SELECT 1 FROM btx_parcelas p WHERE p.id = btx_pagamentos_parcela.parcela_id AND p.unidade = btx_get_my_unidade())
)
WITH CHECK (
  btx_get_my_role() = 'unidade'
  AND EXISTS (SELECT 1 FROM btx_parcelas p WHERE p.id = btx_pagamentos_parcela.parcela_id AND p.unidade = btx_get_my_unidade())
);
