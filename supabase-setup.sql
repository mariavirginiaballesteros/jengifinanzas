-- 1. TABLA CONFIGURACION
CREATE TABLE public.configuracion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave text UNIQUE NOT NULL,
  valor text NOT NULL,
  descripcion text,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.configuracion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total a usuarios autenticados configuracion" ON public.configuracion FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. TABLA CLIENTES
CREATE TABLE public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  tipo_acuerdo text,
  monto_ars numeric,
  monto_usd numeric,
  moneda text DEFAULT 'ARS',
  quien_factura text,
  fecha_vencimiento date,
  estado text DEFAULT 'activo',
  pipeline_probabilidad numeric,
  proximo_paso text,
  notas text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total a usuarios autenticados clientes" ON public.clientes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. TABLA EQUIPO
CREATE TABLE public.equipo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  rol text,
  honorario_mensual numeric NOT NULL,
  condicion_fiscal text,
  genera_credito_fiscal boolean DEFAULT false,
  activo boolean DEFAULT true,
  fecha_desde date,
  notas text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.equipo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total a usuarios autenticados equipo" ON public.equipo FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. TABLA MOVIMIENTOS
CREATE TABLE public.movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL,
  tipo text NOT NULL,
  concepto text NOT NULL,
  subconcepto text,
  monto numeric NOT NULL,
  cuenta text NOT NULL,
  cuenta_destino text,
  cliente_id uuid REFERENCES public.clientes(id),
  tiene_iva boolean DEFAULT false,
  monto_iva numeric,
  notas text,
  mes_cerrado boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  created_by uuid
);
ALTER TABLE public.movimientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total a usuarios autenticados movimientos" ON public.movimientos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. TABLA COMPRAS
CREATE TABLE public.compras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL,
  proveedor text NOT NULL,
  cuit_proveedor text,
  condicion_proveedor text,
  concepto text NOT NULL,
  monto_total numeric NOT NULL,
  iva_credito numeric,
  comprobante_nro text,
  cuenta_pago text,
  cliente_id uuid REFERENCES public.clientes(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total a usuarios autenticados compras" ON public.compras FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. TABLA RECUPEROS
CREATE TABLE public.recuperos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes(id) NOT NULL,
  concepto text NOT NULL,
  monto numeric NOT NULL,
  fecha_pago date NOT NULL,
  tiene_iva boolean DEFAULT false,
  iva_monto numeric,
  estado text DEFAULT 'pendiente',
  fecha_cobro date,
  notas text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.recuperos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total a usuarios autenticados recuperos" ON public.recuperos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7. TABLA SOLICITUDES_CONTADORA
CREATE TABLE public.solicitudes_contadora (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  cliente_id uuid REFERENCES public.clientes(id),
  monto_neto numeric,
  monto_con_iva numeric,
  periodo text,
  referencia text,
  datos_adicionales text,
  estado text DEFAULT 'pendiente',
  whatsapp_mensaje text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.solicitudes_contadora ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total a usuarios autenticados solicitudes" ON public.solicitudes_contadora FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 8. TABLA CIERRES_MES
CREATE TABLE public.cierres_mes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes integer NOT NULL,
  anio integer NOT NULL,
  saldo_proyectado_macro numeric,
  saldo_real_macro numeric,
  saldo_proyectado_iva numeric,
  saldo_real_iva numeric,
  saldo_proyectado_mp_mauro numeric,
  saldo_real_mp_mauro numeric,
  diferencia_macro numeric,
  notas text,
  cerrado boolean DEFAULT false,
  cerrado_en timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(mes, anio)
);
ALTER TABLE public.cierres_mes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total a usuarios autenticados cierres" ON public.cierres_mes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- INSERCIÓN DE DATOS INICIALES (SEMILLA)

INSERT INTO public.configuracion (clave, valor, descripcion) VALUES
('porcentaje_fondo_emergencia', '15', 'Porcentaje destinado al fondo de emergencia'),
('porcentaje_iibb_estimado', '3', 'Porcentaje estimado de Ingresos Brutos'),
('alicuota_iva', '21', 'Alícuota general de IVA'),
('tc_usd_referencia', '1150', 'Tipo de cambio USD de referencia para proyecciones'),
('cuit_virginia', '', 'CUIT para facturación principal'),
('cuit_mauro', '', 'CUIT Mauro'),
('telefono_contadora', '', 'Teléfono de WhatsApp de la contadora (549...)'),
('nombre_contadora', '', 'Nombre de la contadora');

INSERT INTO public.clientes (nombre, tipo_acuerdo, moneda, quien_factura, estado, monto_ars, monto_usd, fecha_vencimiento, pipeline_probabilidad) VALUES
('L2', 'retainer', 'ARS', 'virginia_ri', 'activo', null, null, null, null),
('Method', 'retainer', 'ARS', 'virginia_ri', 'activo', 1500000, null, null, null),
('Cofarsur', 'retainer', 'ARS', 'virginia_ri', 'activo', 1500000, null, null, null),
('Leven', 'retainer', 'USD', 'virginia_ri', 'activo', null, 5000, '2027-02-01', null),
('Macro Consultoría', 'retainer', 'ARS', 'virginia_ri', 'activo', 2500000, null, null, null),
('Avalian', 'retainer', 'ARS', 'virginia_ri', 'pipeline', null, null, null, 50),
('Macro Agencia', 'retainer', 'ARS', 'virginia_ri', 'pipeline', null, null, null, 30);

INSERT INTO public.equipo (nombre, rol, honorario_mensual, condicion_fiscal, genera_credito_fiscal) VALUES
('Nani', 'Comunicación', 710000, 'monotributo', false),
('Coti', 'Gestión de proyectos', 850000, 'ri', true),
('Merce', 'Diseño visual', 1700000, 'monotributo', false),
('Servicios ads', 'Publicidad', 1000000, 'ri', true),
('Audiovisual', 'Producción audiovisual', 600000, 'ri', true),
('Mauro', 'Administración', 550000, 'otro', false);