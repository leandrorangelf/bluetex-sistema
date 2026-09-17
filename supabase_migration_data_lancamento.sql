-- Data em que a despesa/venda/compra foi lançada — distinta do vencimento
-- (quando vence) e da data_pagamento (quando foi de fato paga/recebida).
-- Backfill: linhas existentes usam a data em que o registro foi criado.
ALTER TABLE btx_parcelas ADD COLUMN IF NOT EXISTS data_lancamento DATE;
UPDATE btx_parcelas SET data_lancamento = created_at::DATE WHERE data_lancamento IS NULL;
ALTER TABLE btx_parcelas ALTER COLUMN data_lancamento SET DEFAULT CURRENT_DATE;
ALTER TABLE btx_parcelas ALTER COLUMN data_lancamento SET NOT NULL;
