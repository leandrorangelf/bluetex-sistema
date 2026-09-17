-- Tipo de pagamento/recebimento (boleto, espécie ou PIX) em cada parcela.
-- Preenchido manualmente no lançamento e automaticamente na sincronização
-- do VHSYS (campo forma_pagamento do título, ou presença de link de boleto).
ALTER TABLE btx_parcelas ADD COLUMN IF NOT EXISTS forma_pagamento TEXT CHECK (forma_pagamento IN ('boleto','especie','pix'));
COMMENT ON COLUMN btx_parcelas.forma_pagamento IS 'Como o dinheiro entra/sai: boleto, espécie (dinheiro) ou PIX.';
