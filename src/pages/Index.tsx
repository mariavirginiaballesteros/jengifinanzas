import React from 'react';
import { formatARS } from '@/lib/utils';
import { Plus, FileText, RefreshCw, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

const StatCard = ({ title, value, sub, trend = 'neutral' }: { title: string, value: string, sub?: string, trend?: 'positive' | 'negative' | 'neutral' }) => (
  <div className="bg-jengibre-white border border-jengibre-border p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
    <h3 className="text-sm font-sans text-gray-500 mb-1">{title}</h3>
    <p className="text-3xl font-mono font-bold text-jengibre-dark">{value}</p>
    {sub && (
      <p className={`text-sm mt-2 font-medium ${
        trend === 'positive' ? 'text-jengibre-green' : trend === 'negative' ? 'text-jengibre-red' : 'text-gray-400'
      }`}>
        {sub}
      </p>
    )}
  </div>
);

const SemaforoKPI = ({ title, value, status, label }: { title: string, value: string, status: 'ok' | 'alert' | 'danger', label: string }) => {
  const colors = {
    ok: 'bg-jengibre-green',
    alert: 'bg-jengibre-amber',
    danger: 'bg-jengibre-red'
  };
  
  return (
    <div className="bg-jengibre-white border border-jengibre-border p-4 rounded-xl flex items-center gap-4">
      <div className={`w-3 h-3 rounded-full shrink-0 ${colors[status]}`} />
      <div className="flex-1">
        <p className="text-sm text-gray-500">{title}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-mono font-bold">{value}</span>
          <span className="text-xs text-gray-400">{label}</span>
        </div>
      </div>
    </div>
  );
};

export default function Dashboard() {
  // Datos mockeados temporalmente hasta conectar las queries de Supabase
  const saldos = { macro: 8500000, iva: 1200000, mpMauro: 450000, mpFondo: 5000000 };
  const mesActual = { ingresos: 12500000, costos: 8200000, resultado: 4300000 };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-jengibre-dark">Hola, Equipo 👋</h1>
          <p className="text-gray-600 mt-1">Acá está el resumen financiero al día de hoy.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/caja" className="bg-jengibre-primary hover:bg-[#a64120] text-white px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-sm">
            <Plus size={20} /> Cargar movimiento
          </Link>
        </div>
      </header>

      {/* SALDOS POR CUENTA */}
      <section>
        <h2 className="text-lg font-display font-bold mb-4 text-gray-700">Saldos por cuenta</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="🏦 Cuenta Macro" value={formatARS(saldos.macro)} sub="+12% vs mes anterior" trend="positive" />
          <StatCard title="⚖️ Cuenta IVA" value={formatARS(saldos.iva)} sub="Separado para AFIP" />
          <StatCard title="📱 MP Mauro" value={formatARS(saldos.mpMauro)} />
          <StatCard title="🌱 MP Fondo (Emergencia)" value={formatARS(saldos.mpFondo)} />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* RESUMEN DEL MES */}
        <div className="col-span-1 lg:col-span-2 space-y-8">
          <section>
            <h2 className="text-lg font-display font-bold mb-4 text-gray-700">Resumen del mes actual</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-jengibre-card border border-jengibre-border p-5 rounded-2xl">
                <p className="text-sm text-gray-600">Ingresos cobrados (Neto)</p>
                <p className="text-2xl font-mono font-bold text-jengibre-green mt-1">{formatARS(mesActual.ingresos)}</p>
              </div>
              <div className="bg-jengibre-card border border-jengibre-border p-5 rounded-2xl">
                <p className="text-sm text-gray-600">Costos pagados</p>
                <p className="text-2xl font-mono font-bold text-jengibre-red mt-1">{formatARS(mesActual.costos)}</p>
              </div>
              <div className="bg-jengibre-dark text-jengibre-white p-5 rounded-2xl">
                <p className="text-sm text-gray-300">Resultado Neto Económico</p>
                <p className="text-2xl font-mono font-bold mt-1">{formatARS(mesActual.resultado)}</p>
              </div>
            </div>
          </section>

          {/* KPIS DE SALUD */}
          <section>
            <h2 className="text-lg font-display font-bold mb-4 text-gray-700">Salud Financiera</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SemaforoKPI title="Ratio Equipo / Ingresos" value="38%" label="OK <40%" status="ok" />
              <SemaforoKPI title="Concentración (Cliente + grande)" value="20%" label="OK <30%" status="ok" />
              <SemaforoKPI title="Fondo Emergencia" value="45%" label="Obj: 100% (6 meses)" status="danger" />
              <SemaforoKPI title="Margen Neto" value="34%" label="OK >25%" status="ok" />
              <SemaforoKPI title="IVA Provisionado" value="100%" label="OK 100%" status="ok" />
              <SemaforoKPI title="Próximo Vencimiento Contrato" value="120d" label="OK >90d" status="ok" />
            </div>
          </section>
        </div>

        {/* COLUMNA LATERAL (ALERTAS Y ACCESOS) */}
        <div className="col-span-1 space-y-6">
          
          {/* ACCESOS RÁPIDOS */}
          <section className="bg-jengibre-white border border-jengibre-border rounded-2xl p-5">
            <h2 className="text-lg font-display font-bold mb-4 text-gray-700">Accesos Rápidos</h2>
            <div className="space-y-3">
              <Link to="/contadora" className="w-full flex items-center gap-3 p-3 rounded-xl border border-jengibre-border hover:bg-jengibre-cream transition-colors text-left block">
                <div className="bg-jengibre-card p-2 rounded-lg text-jengibre-primary"><FileText size={20} /></div>
                <div className="font-medium text-jengibre-dark">Solicitar factura</div>
              </Link>
              <Link to="/recuperos" className="w-full flex items-center gap-3 p-3 rounded-xl border border-jengibre-border hover:bg-jengibre-cream transition-colors text-left block">
                <div className="bg-jengibre-card p-2 rounded-lg text-jengibre-primary"><RefreshCw size={20} /></div>
                <div className="font-medium text-jengibre-dark">Ver recuperos pendientes</div>
              </Link>
            </div>
          </section>

          {/* ALERTAS */}
          <section>
            <h2 className="text-lg font-display font-bold mb-4 text-gray-700 flex items-center gap-2">
              <AlertCircle size={20} className="text-jengibre-amber" /> 
              Atención
            </h2>
            <div className="space-y-3">
              <div className="bg-white border-l-4 border-jengibre-red p-4 rounded-r-xl shadow-sm text-sm">
                <p className="font-bold text-gray-800">Falta pagar IVA (AFIP)</p>
                <p className="text-gray-600 mt-1">Vence en 12 días. Tenés $1.200.000 separados en la cuenta IVA.</p>
              </div>
              <div className="bg-white border-l-4 border-jengibre-amber p-4 rounded-r-xl shadow-sm text-sm">
                <p className="font-bold text-gray-800">Recuperos atrasados</p>
                <p className="text-gray-600 mt-1">Hay 2 recuperos de Cofarsur con más de 30 días sin cobrar.</p>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}