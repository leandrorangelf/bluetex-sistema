-- Painel financeiro: pagamento parcial com log de lançamentos
ALTER TABLE btx_parcelas DROP CONSTRAINT IF EXISTS btx_parcelas_status_check;
ALTER TABLE btx_parcelas ADD CONSTRAINT btx_parcelas_status_check
  CHECK (status IN ('pendente','pago','parcial','cancelado'));

CREATE TABLE IF NOT EXISTS btx_pagamentos_parcela (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parcela_id UUID NOT NULL REFERENCES btx_parcelas(id) ON DELETE CASCADE,
  valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  data_pagamento DATE NOT NULL,
  observacoes TEXT,
  criado_por UUID REFERENCES btx_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS btx_pagamentos_parcela_parcela_idx ON btx_pagamentos_parcela(parcela_id);
ALTER TABLE btx_pagamentos_parcela ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "btx_admin_all_pagto_parc" ON btx_pagamentos_parcela;
CREATE POLICY "btx_admin_all_pagto_parc" ON btx_pagamentos_parcela FOR ALL USING ((select btx_get_my_role())='admin');
