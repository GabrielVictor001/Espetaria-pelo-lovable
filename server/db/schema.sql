-- ============================================================================
--  ESPETARIA PDV - ESTRUTURA DO BANCO (PostgreSQL)
-- ============================================================================
--  As 5 tabelas abaixo são EXATAMENTE as que você definiu.
--  Tudo que começa com "-- [+] " é acréscimo feito pelo PDV para dar suporte a
--  comandas, cancelamento de item com rastreio, limpeza/auditoria, pagamentos,
--  configurações e IA. Nenhuma coluna original foi alterada ou removida.
-- ============================================================================

-- ---------------------------------------------------------------- USUÁRIOS --
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(20) DEFAULT 'waiter', -- 'admin' ou 'waiter'
    password_hash VARCHAR(255) NOT NULL,
    -- [+] login e controle de acesso
    username VARCHAR(50),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (lower(username));

-- ------------------------------------------------------------------- MESAS --
CREATE TABLE IF NOT EXISTS tables (
    id SERIAL PRIMARY KEY,
    number INT UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'free', -- 'free', 'occupied', 'closing'
    -- [+] organização visual do salão (70 mesas: salão, varanda, área externa)
    seats INT NOT NULL DEFAULT 4,
    zone VARCHAR(30) NOT NULL DEFAULT 'Salão',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------- PRODUTOS --
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    category VARCHAR(50),
    -- [+] apoio ao cardápio e à busca inteligente da IA
    description VARCHAR(255),
    keywords VARCHAR(255),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    favorite BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS products_category_idx ON products (category);

-- ----------------------------------------------------------------- PEDIDOS --
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    table_id INT REFERENCES tables(id),
    status VARCHAR(20) DEFAULT 'open', -- 'open', 'closed', 'canceled'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_amount DECIMAL(10, 2) DEFAULT 0.00,
    -- [+] abertura, fechamento, desconto e taxa de serviço
    opened_by INT REFERENCES users(id),
    closed_by INT REFERENCES users(id),
    closed_at TIMESTAMP,
    people_count INT NOT NULL DEFAULT 1,
    discount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    service_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    notes VARCHAR(255)
);
-- garante uma única conta aberta por mesa
CREATE UNIQUE INDEX IF NOT EXISTS orders_one_open_per_table ON orders (table_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status, created_at);

-- ---------------------------------------------------- ITENS DO PEDIDO ------
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INT REFERENCES orders(id) ON DELETE CASCADE,
    product_id INT REFERENCES products(id),
    command_name VARCHAR(50) DEFAULT 'Geral', -- Nome/Número da comanda individual
    quantity INT NOT NULL DEFAULT 1,
    unit_price DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- [+] cancelamento do item pelo "X" sem apagar o histórico (auditoria)
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active' | 'canceled'
    notes VARCHAR(255),
    canceled_at TIMESTAMP,
    canceled_by INT REFERENCES users(id),
    cancel_reason VARCHAR(120),
    added_by INT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id, status);

-- ============================================================================
--  ACRÉSCIMOS DO PDV
-- ============================================================================

-- Pagamentos (usado ao fechar a mesa; preparado para divisão por comanda)
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    order_id INT REFERENCES orders(id) ON DELETE CASCADE,
    method VARCHAR(20) NOT NULL, -- 'cash','pix','debit','credit','other'
    amount DECIMAL(10, 2) NOT NULL,
    command_name VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INT REFERENCES users(id)
);

-- Configurações do sistema (IA, dados da casa, preferências)
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(60) PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Histórico de conversa com a IA (o botão de limpeza pode apagar)
CREATE TABLE IF NOT EXISTS ai_chat_log (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    role VARCHAR(15) NOT NULL, -- 'user' | 'assistant'
    content TEXT NOT NULL,
    provider VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ai_chat_log_created_idx ON ai_chat_log (created_at DESC);

-- Auditoria: quem abriu, lançou, cancelou, fechou ou limpou o quê
CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    user_name VARCHAR(100),
    action VARCHAR(40) NOT NULL,
    entity VARCHAR(30),
    entity_id INT,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS activity_log_created_idx ON activity_log (created_at DESC);

-- ============================================================================
--  MESAS 1 a 70 (como no seu layout)
-- ============================================================================
INSERT INTO tables (number, zone, seats)
SELECT
    g,
    CASE
        WHEN g <= 30 THEN 'Salão'
        WHEN g <= 50 THEN 'Varanda'
        ELSE 'Área externa'
    END,
    CASE WHEN g % 5 = 0 THEN 6 WHEN g % 3 = 0 THEN 2 ELSE 4 END
FROM generate_series(1, 70) AS g
ON CONFLICT (number) DO NOTHING;
