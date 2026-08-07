-- Estoque atual: ajustes datados e auditoria imutavel
ALTER TABLE btx_ajustes_estoque
  ADD COLUMN IF NOT EXISTS data_ajuste DATE,
  ADD COLUMN IF NOT EXISTS tipo TEXT;

UPDATE btx_ajustes_estoque SET
  data_ajuste = COALESCE(data_ajuste, make_date(ano, mes, 1)),
  tipo = CASE WHEN qtd_carteiras < 0 THEN 'saida' ELSE COALESCE(tipo, 'entrada') END,
  qtd_carteiras = ABS(qtd_carteiras)
WHERE data_ajuste IS NULL OR tipo IS NULL OR qtd_carteiras < 0;

ALTER TABLE btx_ajustes_estoque
  ALTER COLUMN data_ajuste SET DEFAULT CURRENT_DATE,
  ALTER COLUMN data_ajuste SET NOT NULL,
  ALTER COLUMN tipo SET DEFAULT 'entrada',
  ALTER COLUMN tipo SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'btx_ajustes_estoque_tipo_check') THEN
    ALTER TABLE btx_ajustes_estoque ADD CONSTRAINT btx_ajustes_estoque_tipo_check CHECK (tipo IN ('entrada','saida'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'btx_ajustes_estoque_qtd_check') THEN
    ALTER TABLE btx_ajustes_estoque ADD CONSTRAINT btx_ajustes_estoque_qtd_check CHECK (qtd_carteiras > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS btx_ajustes_estoque_unidade_data_idx ON btx_ajustes_estoque(unidade, data_ajuste) WHERE ativo = TRUE;

CREATE TABLE IF NOT EXISTS btx_auditoria_estoque (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tabela TEXT NOT NULL,
  operacao TEXT NOT NULL CHECK (operacao IN ('INSERT','UPDATE','DELETE')),
  registro_id UUID,
  unidade TEXT,
  usuario_id UUID REFERENCES auth.users(id),
  dados_anteriores JSONB,
  dados_novos JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS btx_auditoria_estoque_unidade_data_idx ON btx_auditoria_estoque(unidade, created_at DESC);
ALTER TABLE btx_auditoria_estoque ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "btx_admin_read_auditoria_estoque" ON btx_auditoria_estoque;
CREATE POLICY "btx_admin_read_auditoria_estoque" ON btx_auditoria_estoque FOR SELECT USING (btx_get_my_role()='admin');
REVOKE INSERT, UPDATE, DELETE ON btx_auditoria_estoque FROM authenticated;

CREATE OR REPLACE FUNCTION btx_auditar_estoque()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  registro JSONB;
  unidade_registro TEXT;
  id_registro UUID;
  parent_id UUID;
BEGIN
  registro := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  id_registro := NULLIF(registro->>'id', '')::UUID;
  unidade_registro := registro->>'unidade';
  IF unidade_registro IS NULL AND TG_TABLE_NAME = 'btx_compras_itens' THEN
    parent_id := NULLIF(registro->>'compra_id', '')::UUID;
    SELECT unidade INTO unidade_registro FROM btx_compras WHERE id = parent_id;
  ELSIF unidade_registro IS NULL AND TG_TABLE_NAME = 'btx_vendas_itens' THEN
    parent_id := NULLIF(registro->>'venda_id', '')::UUID;
    SELECT unidade INTO unidade_registro FROM btx_vendas WHERE id = parent_id;
  END IF;
  INSERT INTO btx_auditoria_estoque(tabela, operacao, registro_id, unidade, usuario_id, dados_anteriores, dados_novos)
  VALUES (
    TG_TABLE_NAME, TG_OP, id_registro, unidade_registro, auth.uid(),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END
  );
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS btx_auditoria_estoque_inicial ON btx_estoque_inicial;
CREATE TRIGGER btx_auditoria_estoque_inicial AFTER INSERT OR UPDATE OR DELETE ON btx_estoque_inicial FOR EACH ROW EXECUTE FUNCTION btx_auditar_estoque();
DROP TRIGGER IF EXISTS btx_auditoria_compras ON btx_compras;
CREATE TRIGGER btx_auditoria_compras AFTER INSERT OR UPDATE OR DELETE ON btx_compras FOR EACH ROW EXECUTE FUNCTION btx_auditar_estoque();
DROP TRIGGER IF EXISTS btx_auditoria_compras_itens ON btx_compras_itens;
CREATE TRIGGER btx_auditoria_compras_itens AFTER INSERT OR UPDATE OR DELETE ON btx_compras_itens FOR EACH ROW EXECUTE FUNCTION btx_auditar_estoque();
DROP TRIGGER IF EXISTS btx_auditoria_vendas ON btx_vendas;
CREATE TRIGGER btx_auditoria_vendas AFTER INSERT OR UPDATE OR DELETE ON btx_vendas FOR EACH ROW EXECUTE FUNCTION btx_auditar_estoque();
DROP TRIGGER IF EXISTS btx_auditoria_vendas_itens ON btx_vendas_itens;
CREATE TRIGGER btx_auditoria_vendas_itens AFTER INSERT OR UPDATE OR DELETE ON btx_vendas_itens FOR EACH ROW EXECUTE FUNCTION btx_auditar_estoque();
DROP TRIGGER IF EXISTS btx_auditoria_ajustes_estoque ON btx_ajustes_estoque;
CREATE TRIGGER btx_auditoria_ajustes_estoque AFTER INSERT OR UPDATE OR DELETE ON btx_ajustes_estoque FOR EACH ROW EXECUTE FUNCTION btx_auditar_estoque();
