import React, { useMemo } from 'react';
import { formatARS } from '@/lib/utils';
import { Plus, FileText, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
        <p className="text-sm text-gray-500 leading-tight mb-1">{title}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-mono font-bold">{value}</span>
          <span className="text-xs text-gray-400 font-medium">{label}</span>
        </div>
      </div>
    </div>
  );
};

export default function Dashboard() {
  const { data: movimientos, isLoading: isLoadingMov } = useQuery({
    queryKey: ['movimientos_dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.from('movimientos').select('*');
      if (error) throw error;
      return data;
    }
  });

  const { data: clientes, isLoading: isLoadingCli } = useQuery({
    queryKey: ['clientes_dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('*').eq('estado', 'activo');
      if (error) throw error;
      return data;
    }
  });

  const { data: equipo, isLoading: isLoadingEq } = useQuery({
    queryKey: ['equipo_dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.from('equipo').select('*').eq('activo', true);
      if (error) throw error;
      return data;
    }
  });

  const { data: recuperos, isLoading: isLoadingRec } = useQuery({
    queryKey: ['recuperos_dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.from('recuperos').select('*').eq('estado', 'pendiente');
      if (error) throw error;
      return data;
    }
  });

  // Procesamiento matemático de todos los datos reales
  const stats = useMemo(() => {
    if (!movimientos || !clientes || !equipo) return null;

    // 1. Saldos y Mes Actual
    const saldosCalc: Record<string, number> = {};
    let ingresosMes = 0;
    let costosMes = 0;

    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    movimientos.forEach(m => {
      const monto = Number(m.monto);
      // Saldos globales históricos
      if (!saldosCalc[m.cuenta]) saldosCalc[m.cuenta] = 0;
      saldosCalc[m.cuenta] += m.tipo === 'ingreso' ? monto : -monto;

      // Movimientos exclusivos del mes en curso
      if (m.fecha.startsWith(currentMonthPrefix)) {
        if (m.tipo === 'ingreso') ingresosMes += monto;
        else costosMes += monto;
      }
    });

    const resultadoMes = ingresosMes - costosMes;

    // 2. Costo del Equipo Activo
    let costoEquipo = 0;
    equipo.forEach(e => {
      let costo = Number(e.honorario_mensual || 0);
      try {
        const notas = JSON.parse(e.notas || '{}');
        if (notas.asignaciones) {
          Object.entries(notas.asignaciones).forEach(([cId, val]) => {
            const c = clientes.find(cl => cl.id === cId);
            if (c) costo += Number(val);
          });
        }
      } catch (err) {}
      costoEquipo += costo;
    });

    const ratioEquipo = ingresosMes > 0 ? (costoEquipo / ingresosMes) * 100 : 0;
    const margenNeto = ingresosMes > 0 ? (resultadoMes / ingresosMes) * 100 : 0;

    // 3. Concentración de Clientes
    let totalAbonos = 0;
    let maxAbono = 0;
    clientes.forEach(c => {
      const abono = Number(c.monto_ars || 0);
      totalAbonos += abono;
      if (abono > maxAbono) maxAbono = abono;
    });
    const concentracion = totalAbonos > 0 ? (maxAbono / totalAbonos) * 100 : 0;

    // 4. Próximo Vencimiento
    let minDias = Infinity;
    clientes.forEach(c => {
      if (c.fecha_fin) {
        const diff = Math.ceil((new Date(c.fecha_fin).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
        if (diff >= 0 && diff < minDias) minDias = diff;
      }
    });

    // 5. Fondo de Emergencia (buscamos alguna cuenta que se llame 'Fondo')
    const cuentaFondo = Object.keys(saldosCalc).find(k => k.toLowerCase().includes('fondo'));
    const saldoFondo = cuentaFondo ? saldosCalc[cuentaFondo] : 0;
    const targetFondo = costosMes > 0 ? costosMes * 6 : 1000000; // Objetivo: 6 meses de costos
    const fondoRatio = (saldoFondo / targetFondo) * 100;

    return {
      saldos: saldosCalc,
      mesActual: { ingresos: ingresosMes, costos: costosMes, resultado: resultadoMes },
      kpis: {
        ratioEquipo,
        margenNeto,
        concentracion,
        minDias,
        fondoRatio,
        saldoFondo
      }
    };
  }, [movimientos, clientes, equipo]);

  const isLoading = isLoadingMov || isLoadingCli || isLoadingEq || isLoadingRec;

  if (isLoading || !stats) {
    return (
      <div className="flex flex-col items-center justify-center h-64 animate-in fade-in">
        <div className="w-10 h-10 border-4 border-jengibre-primary border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-500 font-medium">Calculando estado financiero en tiempo real...</p>
      </div>
    );
  }

  // Extraer las top cuentas para mostrarlas
  const sortedAccounts = Object.entries(stats.saldos).sort((a, b) => b[1] - a[1]);
  const topAccounts = sortedAccounts.slice(0, 4);

  // Generador dinámico de alertas
  const alertas = [];
  if (stats.kpis.minDias <= 30) {
    alertas.push({ type: 'amber', title: 'Contrato por vencer', desc: `Un contrato activo vence en ${stats.kpis.minDias} días.` });
  }
  if (stats.kpis.fondoRatio < 50) {
    alertas.push({ type: 'red', title: 'Fondo de Emergencia Bajo', desc: `Tu reserva de ${formatARS(stats.kpis.saldoFondo)} cubre menos de 3 meses operativos.` });
  }
  if (recuperos && recuperos.length > 0) {
    alertas.push({ type: 'amber', title: 'Recuperos pendientes', desc: `Tenés ${recuperos.length} recuperos de gastos esperando cobranza.` });
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-jengibre-dark">Hola, Equipo 👋</h1>
          <p className="text-gray-600 mt-1">Acá está el resumen financiero en base a tus movimientos reales.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/caja" className="bg-jengibre-primary hover:bg-[#a64120] text-white px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-sm">
            <Plus size={20} /> Cargar movimiento
          </Link>
        </div>
      </header>

      {/* SALDOS POR CUENTA (DINÁMICO) */}
      <section>
        <h2 className="text-lg font-display font-bold mb-4 text-gray-700">Principales Cuentas</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {topAccounts.map(([nombre, monto]) => (
            <StatCard 
              key={nombre} 
              title={`🏦 ${nombre}`} 
              value={formatARS(monto)} 
              trend={monto < 0 ? 'negative' : 'neutral'} 
            />
          ))}
          {topAccounts.length === 0 && (
            <div className="col-span-4 p-8 text-center bg-white border rounded-xl text-gray-500">
              No hay cuentas registradas. Cargá ingresos o egresos en Caja.
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* RESUMEN DEL MES */}
        <div className="col-span-1 lg:col-span-2 space-y-8">
          <section>
            <h2 className="text-lg font-display font-bold mb-4 text-gray-700">Resumen de este mes</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-jengibre-card border border-jengibre-border p-5 rounded-2xl">
                <p className="text-sm text-gray-600">Ingresos cobrados (Neto)</p>
                <p className="text-2xl font-mono font-bold text-jengibre-green mt-1">{formatARS(stats.mesActual.ingresos)}</p>
              </div>
              <div className="bg-jengibre-card border border-jengibre-border p-5 rounded-2xl">
                <p className="text-sm text-gray-600">Costos pagados</p>
                <p className="text-2xl font-mono font-bold text-jengibre-red mt-1">{formatARS(stats.mesActual.costos)}</p>
              </div>
              <div className="bg-jengibre-dark text-jengibre-white p-5 rounded-2xl shadow-md">
                <p className="text-sm text-gray-300">Resultado Neto Económico</p>
                <p className={`text-2xl font-mono font-bold mt-1 ${stats.mesActual.resultado < 0 ? 'text-red-400' : 'text-white'}`}>
                  {formatARS(stats.mesActual.resultado)}
                </p>
              </div>
            </div>
          </section>

          {/* KPIS DE SALUD REALES */}
          <section>
            <h2 className="text-lg font-display font-bold mb-4 text-gray-700">Métricas de Salud</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SemaforoKPI 
                title="Ratio Equipo / Ingresos" 
                value={`${stats.kpis.ratioEquipo.toFixed(1)}%`} 
                label="OK <40%" 
                status={stats.kpis.ratioEquipo > 50 ? 'danger' : stats.kpis.ratioEquipo > 40 ? 'alert' : 'ok'} 
              />
              <SemaforoKPI 
                title="Concentración (Cliente + grande)" 
                value={`${stats.kpis.concentracion.toFixed(1)}%`} 
                label="OK <30%" 
                status={stats.kpis.concentracion > 40 ? 'danger' : stats.kpis.concentracion > 30 ? 'alert' : 'ok'} 
              />
              <SemaforoKPI 
                title="Fondo Emergencia (Obj 6 Meses)" 
                value={`${stats.kpis.fondoRatio.toFixed(0)}%`} 
                label={stats.kpis.fondoRatio >= 100 ? 'Completado' : 'Ahorrando'} 
                status={stats.kpis.fondoRatio < 30 ? 'danger' : stats.kpis.fondoRatio < 80 ? 'alert' : 'ok'} 
              />
              <SemaforoKPI 
                title="Margen Neto Mensual" 
                value={`${stats.kpis.margenNeto.toFixed(1)}%`} 
                label="OK >25%" 
                status={stats.kpis.margenNeto < 10 ? 'danger' : stats.kpis.margenNeto < 25 ? 'alert' : 'ok'} 
              />
              <SemaforoKPI 
                title="Días p/ próximo vencimiento" 
                value={stats.kpis.minDias === Infinity ? '-' : `${stats.kpis.minDias}d`} 
                label="OK >60d" 
                status={stats.kpis.minDias <= 30 ? 'danger' : stats.kpis.minDias <= 60 ? 'alert' : 'ok'} 
              />
            </div>
          </section>
        </div>

        {/* COLUMNA LATERAL (ALERTAS Y ACCESOS) */}
        <div className="col-span-1 space-y-6">
          
          {/* ACCESOS RÁPIDOS */}
          <section className="bg-jengibre-white border border-jengibre-border rounded-2xl p-5">
            <h2 className="text-lg font-display font-bold mb-4 text-gray-700">Accesos Rápidos</h2>
            <div className="space-y-3">
              <Link to="/contadora" className="w-full flex items-center gap-3 p-3 rounded-xl border border-jengibre-border hover:bg-jengibre-cream transition-colors text-left block group">
                <div className="bg-jengibre-cream group-hover:bg-jengibre-primary group-hover:text-white p-2 rounded-lg text-jengibre-primary transition-colors"><FileText size={20} /></div>
                <div className="font-medium text-jengibre-dark">Solicitar factura</div>
              </Link>
              <Link to="/recuperos" className="w-full flex items-center gap-3 p-3 rounded-xl border border-jengibre-border hover:bg-jengibre-cream transition-colors text-left block group">
                <div className="bg-jengibre-cream group-hover:bg-jengibre-primary group-hover:text-white p-2 rounded-lg text-jengibre-primary transition-colors"><RefreshCw size={20} /></div>
                <div className="font-medium text-jengibre-dark">Ver recuperos</div>
              </Link>
            </div>
          </section>

          {/* ALERTAS DINÁMICAS */}
          <section>
            <h2 className="text-lg font-display font-bold mb-4 text-gray-700 flex items-center gap-2">
              <AlertCircle size={20} className={alertas.length > 0 && alertas[0].type !== 'green' ? "text-jengibre-amber" : "text-jengibre-green"} /> 
              Centro de Atención
            </h2>
            <div className="space-y-3">
              {alertas.length === 0 ? (
                <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-xl shadow-sm text-sm flex items-start gap-3">
                  <CheckCircle2 className="text-green-600 mt-0.5" size={18} />
                  <div>
                    <p className="font-bold text-green-900">¡Todo en orden!</p>
                    <p className="text-green-700 mt-1">No tenés alertas críticas hoy.</p>
                  </div>
                </div>
              ) : (
                alertas.map((alerta, i) => (
                  <div key={i} className={`bg-white border-l-4 p-4 rounded-r-xl shadow-sm text-sm ${
                    alerta.type === 'red' ? 'border-jengibre-red' : 
                    alerta.type === 'amber' ? 'border-jengibre-amber' : 
                    'border-jengibre-green'
                  }`}>
                    <p className="font-bold text-gray-800">{alerta.title}</p>
                    <p className="text-gray-600 mt-1">{alerta.desc}</p>
                  </div>
                ))
              )}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}