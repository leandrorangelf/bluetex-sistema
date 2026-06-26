-- ============================================================
-- NEW BLUETEX · Schema Supabase (prefixo btx_)
-- Compatível com projeto RDV existente no mesmo Supabase
-- Execute no SQL Editor do Supabase
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- Funções auxiliares (nomes únicos btx_)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION btx_get_my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(raw_user_meta_data->>'btx_role','unidade')
  FROM auth.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION btx_get_my_unidade()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT raw_user_meta_data->>'btx_unidade'
  FROM auth.users WHERE id = auth.uid();
$$;

-- ------------------------------------------------------------
-- btx_profiles
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS btx_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'unidade' CHECK (role IN ('admin','unidade')),
  unidade TEXT CHECK (unidade IN ('NEW BLUETEX MG','NEW BLUETEX SC','NEW BLUETEX AM')),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE btx_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "btx_self_select" ON btx_profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "btx_admin_all" ON btx_profiles FOR ALL USING (btx_get_my_role()='admin');

-- Trigger: cria btx_profile ao criar usuário com app=bluetex
CREATE OR REPLACE FUNCTION btx_handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.raw_user_meta_data->>'app' = 'bluetex' THEN
    INSERT INTO btx_profiles(id, nome, role, unidade) VALUES(
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email),
      COALESCE(NEW.raw_user_meta_data->>'btx_role', 'unidade'),
      NEW.raw_user_meta_data->>'btx_unidade'
    ) ON CONFLICT(id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS btx_on_auth_user_created ON auth.users;
CREATE TRIGGER btx_on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION btx_handle_new_user();

-- ------------------------------------------------------------
-- btx_produtos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS btx_produtos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  carteiras_por_caixa INTEGER NOT NULL DEFAULT 480,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE btx_produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "btx_all_read_produtos" ON btx_produtos FOR SELECT USING (ativo=TRUE);
CREATE POLICY "btx_admin_all_produtos" ON btx_produtos FOR ALL USING (btx_get_my_role()='admin');

INSERT INTO btx_produtos(nome, carteiras_por_caixa) VALUES
  ('GUDANG RED',480),('GUDANG GREEN',480),
  ('GUDANG TWIN TEN',500),('CRETEC MENTA',500),('CRETEC CEREJA',500)
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- btx_fornecedores
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS btx_fornecedores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unidade TEXT NOT NULL CHECK (unidade IN ('NEW BLUETEX MG','NEW BLUETEX SC','NEW BLUETEX AM')),
  nome TEXT NOT NULL, cnpj TEXT, telefone TEXT, email TEXT, observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE btx_fornecedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "btx_admin_all_forn" ON btx_fornecedores FOR ALL USING (btx_get_my_role()='admin');
CREATE POLICY "btx_unidade_forn" ON btx_fornecedores FOR ALL USING (btx_get_my_role()='unidade' AND unidade=btx_get_my_unidade());

-- ------------------------------------------------------------
-- btx_clientes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS btx_clientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unidade TEXT NOT NULL CHECK (unidade IN ('NEW BLUETEX MG','NEW BLUETEX SC','NEW BLUETEX AM')),
  nome TEXT NOT NULL, cnpj TEXT, telefone TEXT, email TEXT, observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE btx_clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "btx_admin_all_cli" ON btx_clientes FOR ALL USING (btx_get_my_role()='admin');
CREATE POLICY "btx_unidade_cli" ON btx_clientes FOR ALL USING (btx_get_my_role()='unidade' AND unidade=btx_get_my_unidade());

-- ------------------------------------------------------------
-- btx_categorias_despesas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS btx_categorias_despesas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unidade TEXT NOT NULL CHECK (unidade IN ('NEW BLUETEX MG','NEW BLUETEX SC','NEW BLUETEX AM')),
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE btx_categorias_despesas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "btx_admin_all_cat" ON btx_categorias_despesas FOR ALL USING (btx_get_my_role()='admin');
CREATE POLICY "btx_unidade_cat" ON btx_categorias_despesas FOR ALL USING (btx_get_my_role()='unidade' AND unidade=btx_get_my_unidade());

-- ------------------------------------------------------------
-- btx_estoque_inicial
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS btx_estoque_inicial (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unidade TEXT NOT NULL CHECK (unidade IN ('NEW BLUETEX MG','NEW BLUETEX SC','NEW BLUETEX AM')),
  produto_id UUID NOT NULL REFERENCES btx_produtos(id),
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano INTEGER NOT NULL,
  qtd_carteiras INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(unidade, produto_id, mes, ano)
);
ALTER TABLE btx_estoque_inicial ENABLE ROW LEVEL SECURITY;
CREATE POLICY "btx_admin_all_est" ON btx_estoque_inicial FOR ALL USING (btx_get_my_role()='admin');
CREATE POLICY "btx_unidade_est" ON btx_estoque_inicial FOR ALL USING (btx_get_my_role()='unidade' AND unidade=btx_get_my_unidade());

-- ------------------------------------------------------------
-- btx_compras
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS btx_compras (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unidade TEXT NOT NULL CHECK (unidade IN ('NEW BLUETEX MG','NEW BLUETEX SC','NEW BLUETEX AM')),
  fornecedor_id UUID REFERENCES btx_fornecedores(id),
  data_compra DATE NOT NULL,
  numero_nf TEXT,
  valor_st NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE btx_compras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "btx_admin_all_comp" ON btx_compras FOR ALL USING (btx_get_my_role()='admin');
CREATE POLICY "btx_unidade_comp" ON btx_compras FOR ALL USING (btx_get_my_role()='unidade' AND unidade=btx_get_my_unidade());

-- ------------------------------------------------------------
-- btx_compras_itens
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS btx_compras_itens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  compra_id UUID NOT NULL REFERENCES btx_compras(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES btx_produtos(id),
  qtd_carteiras INTEGER NOT NULL DEFAULT 0,
  valor NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE btx_compras_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "btx_admin_all_comp_itens" ON btx_compras_itens FOR ALL USING (btx_get_my_role()='admin');
CREATE POLICY "btx_unidade_comp_itens" ON btx_compras_itens FOR ALL USING (
  btx_get_my_role()='unidade' AND
  EXISTS (SELECT 1 FROM btx_compras c WHERE c.id = compra_id AND c.unidade = btx_get_my_unidade())
);

-- ------------------------------------------------------------
-- btx_vendas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS btx_vendas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unidade TEXT NOT NULL CHECK (unidade IN ('NEW BLUETEX MG','NEW BLUETEX SC','NEW BLUETEX AM')),
  cliente_id UUID REFERENCES btx_clientes(id),
  data_venda DATE NOT NULL,
  numero_nf TEXT,
  valor_st NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE btx_vendas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "btx_admin_all_vend" ON btx_vendas FOR ALL USING (btx_get_my_role()='admin');
CREATE POLICY "btx_unidade_vend" ON btx_vendas FOR ALL USING (btx_get_my_role()='unidade' AND unidade=btx_get_my_unidade());

-- ------------------------------------------------------------
-- btx_vendas_itens
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS btx_vendas_itens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venda_id UUID NOT NULL REFERENCES btx_vendas(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES btx_produtos(id),
  qtd_carteiras INTEGER NOT NULL DEFAULT 0,
  valor NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE btx_vendas_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "btx_admin_all_vend_itens" ON btx_vendas_itens FOR ALL USING (btx_get_my_role()='admin');
CREATE POLICY "btx_unidade_vend_itens" ON btx_vendas_itens FOR ALL USING (
  btx_get_my_role()='unidade' AND
  EXISTS (SELECT 1 FROM btx_vendas v WHERE v.id = venda_id AND v.unidade = btx_get_my_unidade())
);

-- ------------------------------------------------------------
-- btx_despesas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS btx_despesas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unidade TEXT NOT NULL CHECK (unidade IN ('NEW BLUETEX MG','NEW BLUETEX SC','NEW BLUETEX AM')),
  categoria_id UUID REFERENCES btx_categorias_despesas(id),
  fornecedor_id UUID REFERENCES btx_fornecedores(id),
  data_despesa DATE NOT NULL,
  numero_nf TEXT,
  descricao TEXT NOT NULL,
  valor_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE btx_despesas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "btx_admin_all_desp" ON btx_despesas FOR ALL USING (btx_get_my_role()='admin');
CREATE POLICY "btx_unidade_desp" ON btx_despesas FOR ALL USING (btx_get_my_role()='unidade' AND unidade=btx_get_my_unidade());

-- ------------------------------------------------------------
-- btx_parcelas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS btx_parcelas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unidade TEXT NOT NULL CHECK (unidade IN ('NEW BLUETEX MG','NEW BLUETEX SC','NEW BLUETEX AM')),
  tipo TEXT NOT NULL CHECK (tipo IN ('pagar','receber')),
  origem TEXT NOT NULL CHECK (origem IN ('compra','venda','despesa','manual')),
  origem_id UUID,
  numero_parcela INTEGER NOT NULL DEFAULT 1,
  vencimento DATE NOT NULL,
  valor NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago','cancelado')),
  numero_boleto TEXT,
  data_pagamento DATE,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE btx_parcelas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "btx_admin_all_parc" ON btx_parcelas FOR ALL USING (btx_get_my_role()='admin');
CREATE POLICY "btx_unidade_parc" ON btx_parcelas FOR ALL USING (btx_get_my_role()='unidade' AND unidade=btx_get_my_unidade());

-- ------------------------------------------------------------
-- btx_caixa_mensal
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS btx_caixa_mensal (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unidade TEXT NOT NULL CHECK (unidade IN ('NEW BLUETEX MG','NEW BLUETEX SC','NEW BLUETEX AM')),
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano INTEGER NOT NULL,
  saldo_inicial NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(unidade, mes, ano)
);
ALTER TABLE btx_caixa_mensal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "btx_admin_all_caixa" ON btx_caixa_mensal FOR ALL USING (btx_get_my_role()='admin');
CREATE POLICY "btx_unidade_caixa" ON btx_caixa_mensal FOR ALL USING (btx_get_my_role()='unidade' AND unidade=btx_get_my_unidade());

-- ------------------------------------------------------------
-- btx_ajustes_estoque
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS btx_ajustes_estoque (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unidade TEXT NOT NULL CHECK (unidade IN ('NEW BLUETEX MG','NEW BLUETEX SC','NEW BLUETEX AM')),
  produto_id UUID NOT NULL REFERENCES btx_produtos(id),
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano INTEGER NOT NULL,
  qtd_carteiras INTEGER NOT NULL DEFAULT 0,
  motivo TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE btx_ajustes_estoque ENABLE ROW LEVEL SECURITY;
CREATE POLICY "btx_admin_all_aj" ON btx_ajustes_estoque FOR ALL USING (btx_get_my_role()='admin');
CREATE POLICY "btx_unidade_aj" ON btx_ajustes_estoque FOR ALL USING (btx_get_my_role()='unidade' AND unidade=btx_get_my_unidade());

-- ============================================================
-- FIM DO SCHEMA
-- ============================================================
