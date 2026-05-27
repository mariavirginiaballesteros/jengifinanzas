import React, { useMemo } from 'react';
import { formatARS } from '@/lib/utils';
import { Plus, FileText, RefreshCw, AlertCircle, CheckCircle2, Landmark, TrendingUp, Users, Sparkles, ShieldCheck, ArrowRight, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCotizacionOficial } from '@/hooks/useCotizacion';

const StatCard = ({ title, value, sub, icon: Icon, colorClass = "text-blue-600", bgClass = "bg-blue-50" }: { title: string, value: string, sub?: string, icon: any, colorClass?: string, bgClass?: string }) => (
  <div className="bg-white border border-jengibre-border p-6 rounded-3xl shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
    <div className={`absolute -right-4 -top-4 opacity-10 group-hover:scale-110 transition-transform ${colorClass}`}>
      <Icon size={100} />
    </div>
    <div className="relative z-10">
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-2 rounded-xl ${bgClass} ${colorClass}`}>
          <Icon size={18} />
        </div>
        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">{title}</h3>
      </div>
      <p className="text-3xl font-mono font-bold text-jengibre-dark">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-2 font-medium">{sub}</p>}
    </div>
  </div>
);

const SemaforoKPI = ({ title, value, status, label }: { title: string, value: string, status: 'ok' | 'alert' | 'danger', label: string }) => {
  const colors = { 
    ok: { dot: 'bg-jengibre-green', text: 'text-jengibre-green', bg: 'bg-jengibre-green/5' }, 
    alert: { dot: 'bg-jengibre-amber', text: 'text-jengibre-amber', bg: 'bg-jengibre-amber/5' }, 
    danger: { dot: 'bg-jengibre-red', text: 'text-jengibre-red', bg: 'bg-jengibre-red/5' } 
  };
  const current = colors[status];
  
  return (
    <div className={`border border-jengibre-border p-4 rounded-2xl flex items-center gap-4 bg-white transition-all hover:border-gray-300`}>
      <div className={`w-3 h-3 rounded-full shrink-0 animate-pulse ${current.dot}`} />
      <div className="flex-1">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{title}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-mono font-bold text-gray-900">{value}</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${current.bg} ${current.text}`}>{label}</span>
        </div>
      </div>
    </div>
  );
};

export default function Dashboard() {
  const { data: cotizacionData } = useCotizacionOficial();
  const cotizacion = cotizacionData || 1000;

  const { data: movimientos } = useQuery({
    queryKey: ['movimientos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('movimientos').select('*');
      if (error) throw error;
      return data;
    }
  });

  const { data: configSaldos } = useQuery({
    queryKey: ['configuracion', 'saldos_iniciales'],
    queryFn: async () => {
      const { data } = await supabase.from('configuracion').select('valor').eq('clave', 'saldos_iniciales').maybeSingle();
      return data?.valor ? JSON.parse(data.valor) : {};
    }
  });

  const { data: clientes } = useQuery({
    queryKey: ['clientes_dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('*').eq('estado', 'activo');
      if (error) throw error;
      return data;
    }
  });

  const { data: recuperos } = useQuery({
    queryKey: ['recuperos_dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.from('recuperos').select('*').eq('estado', 'pendiente');
      if (error) throw error;
      return data;
    }
  });

  // Traemos todas las configuraciones de costos para la meta del fondo
  const { data: configRows } = useQuery({
    queryKey: ['configuracion_dashboard_reserva'],
    queryFn: async () => {
      const { data } = await supabase.from('configuracion').select('*').in('clave', [
        'costo_direccion_mensual', 
        'gastos_fijos_estimados',
        'extra_reserva_mensual'
      ]);
      return data || [];
    }
  });

  const stats = useMemo(() => {
    if (!movimientos || !clientes || !configRows) return null;

    const saldosCalc: Record<string, number> = {};
    const saldosIniciales = configSaldos || {};
    
    Object.entries(saldosIniciales).forEach(([cuenta, monto]) => {
      saldosCalc[cuenta] = Number(monto);
    });

    let ingresosMes = 0;
    let costosMes = 0;
    let ingresosYTD = 0;
    let costosYTD = 0;

    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentYearPrefix = now.getFullYear().toString();

    movimientos.forEach(m => {
      let isUSD = false;
      try { const p = JSON.parse(m.notas || '{}'); if (p.moneda === 'USD') isUSD = true; } catch(e){}
      
      const valorEnPesos = isUSD ? Number(m.monto) * cotizacion : Number(m.monto);
      const factor = m.tipo === 'ingreso' ? 1 : -1;

      if (!saldosCalc[m.cuenta]) saldosCalc[m.cuenta] = 0;

      if (m.tipo === 'transferencia' && m.cuenta_destino) {
        if (!saldosCalc[m.cuenta_destino]) saldosCalc[m.cuenta_destino] = 0;
        saldosCalc[m.cuenta] -= valorEnPesos;
        saldosCalc[m.cuenta_destino] += valorEnPesos;
      } else {
        saldosCalc[m.cuenta] += valorEnPesos * factor;
        
        if (m.fecha.startsWith(currentMonthPrefix)) {
          if (m.tipo === 'ingreso') ingresosMes += valorEnPesos;
          else costosMes += valorEnPesos;
        }
        if (m.fecha.startsWith(currentYearPrefix)) {
          if (m.tipo === 'ingreso') ingresosYTD += valorEnPesos;
          else costosYTD += valorEnPesos;
        }
      }
    });

    const totalCajaARS = Object.values(saldosCalc).reduce((a, b) => a + b, 0);
    const gananciaYTD = ingresosYTD - costosYTD;
    const resultadoMes = ingresosMes - costosMes;

    // Lógica de Fondo de Emergencia sincronizada con Salud Financiera
    const costoDireccion = Number(configRows.find(r => r.clave === 'costo_direccion_mensual')?.valor || 0);
    const gastosFijos = Number(configRows.find(r => r.clave === 'gastos_fijos_estimados')?.valor || 0);
    const extraReserva = Number(configRows.find(r => r.clave === 'extra_reserva_mensual')?.valor || 0);
    
    const costoMensualReserva = gastosFijos + costoDireccion + extraReserva;
    const metaFondo = costoMensualReserva * 6;
    const fondoActual = Math.max(0, Math.min(totalCajaARS, metaFondo));

    let mrrTotal = 0;
    let maxAbono = 0;
    clientes.forEach(c => {
      const abono = Number(c.monto_ars || 0) + (Number(c.monto_usd || 0) * cotizacion);
      mrrTotal += abono;
      if (abono > maxAbono) maxAbono = abono;
    });
    
    const arr = mrrTotal * 12;
    const ticketPromedio = clientes.length > 0 ? mrrTotal / clientes.length : 0;
    const concentracion = mrrTotal > 0 ? (maxAbono / mrrTotal) * 100 : 0;

    let minDias = Infinity;
    clientes.forEach(c => {
      if (c.fecha_fin) {
        const diff = Math.ceil((new Date(c.fecha_fin).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
        if (diff >= 0 && diff < minDias) minDias = diff;
      }
    });

    return {
      saldos: saldosCalc,
      arr,
      ticketPromedio,
      ytd: { ingresos: ingresosYTD, costos: costosYTD, ganancia: gananciaYTD },
      fondo: { actual: totalCajaARS, meta: metaFondo }, // Mostramos el total real contra la meta
      mesActual: { ingresos: ingresosMes, costos: costosMes, resultado: resultadoMes },
      kpis: { ratioEquipo: 0, margenNeto: ingresosMes > 0 ? (resultadoMes/ingresosMes)*100 : 0, concentracion, minDias, fondoRatio: metaFondo > 0 ? (totalCajaARS/metaFondo)*100 : 0 }
    };
  }, [movimientos, configSaldos, clientes, cotizacion, configRows]);

  if (!stats) return <div className="p-12 text-center">Cargando dashboard...</div>;

  const alertas = [];
  if (stats.kpis.minDias <= 30) alertas.push({ type: 'amber', title: 'Contrato por vencer', desc: `Un contrato activo vence en ${stats.kpis.minDias} días.` });
  if (stats.kpis.fondoRatio < 50) alertas.push({ type: 'red', title: 'Fondo de Emergencia Bajo', desc: `Tu reserva cubre menos de la mitad de los 6 meses de seguridad.` });
  if (recuperos && recuperos.length > 0) alertas.push({ type: 'amber', title: 'Recuperos pendientes', desc: `Tenés ${recuperos.length} recuperos esperando cobranza.` });

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-12">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-display font-bold text-jengibre-dark">Hola, Equipo 👋</h1>
          <p className="text-gray-500 mt-1 font-medium">Resumen ejecutivo de la salud financiera de Jengibre.</p>
        </div>
        <div className="flex gap-3">
          <Link to="/caja" className="bg-jengibre-primary hover:bg-[#a64120] text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-jengibre-primary/20 active:scale-95">
            <Plus size={20} /> Cargar movimiento
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Proyección Anual (ARR)" value={formatARS(stats.arr)} sub="Facturación bruta proyectada" icon={TrendingUp} colorClass="text-blue-600" bgClass="bg-blue-50" />
        <StatCard title="Ticket Promedio" value={formatARS(stats.ticketPromedio)} sub="Ingreso base por cliente" icon={Users} colorClass="text-amber-600" bgClass="bg-amber-50" />
        <StatCard title="Ganancia Real Acum." value={formatARS(stats.ytd.ganancia)} sub="Ingresos - Egresos (Año actual)" icon={Sparkles} colorClass="text-emerald-600" bgClass="bg-emerald-50" />
        <StatCard title="Fondo de Emergencia" value={formatARS(stats.fondo.actual)} sub={`Meta (6 meses): ${formatARS(stats.fondo.meta)}`} icon={ShieldCheck} colorClass="text-indigo-600" bgClass="bg-indigo-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="col-span-1 lg:col-span-2 space-y-10">
          
          <section>
            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-5 flex items-center gap-2">
              <Landmark size={16} /> Cuentas con mayor liquidez
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Object.entries(stats.saldos).sort((a,b) => b[1] - a[1]).slice(0, 4).map(([nombre, monto]) => (
                <div key={nombre} className="bg-white border border-jengibre-border p-5 rounded-2xl flex justify-between items-center group hover:border-jengibre-primary transition-colors">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{nombre}</p>
                    <p className="text-xl font-mono font-bold text-jengibre-dark">{formatARS(monto)}</p>
                  </div>
                  <div className="p-2 rounded-xl bg-gray-50 text-gray-300 group-hover:bg-jengibre-cream group-hover:text-jengibre-primary transition-colors">
                    <Wallet size={20} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-5 flex items-center gap-2">
              <Sparkles size={16} /> Métricas de Control
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SemaforoKPI title="Concentración de Riesgo" value={`${stats.kpis.concentracion.toFixed(1)}%`} label={"Máx 30%"} status={stats.kpis.concentracion > 40 ? 'danger' : stats.kpis.concentracion > 30 ? 'alert' : 'ok'} />
              <SemaforoKPI title="Reserva de Seguridad" value={`${stats.kpis.fondoRatio.toFixed(0)}%`} label={"Meta 100%"} status={stats.kpis.fondoRatio < 30 ? 'danger' : stats.kpis.fondoRatio < 80 ? 'alert' : 'ok'} />
              <SemaforoKPI title="Margen Neto (Mes)" value={`${stats.kpis.margenNeto.toFixed(1)}%`} label={"Mín 25%"} status={stats.kpis.margenNeto < 10 ? 'danger' : stats.kpis.margenNeto < 25 ? 'alert' : 'ok'} />
              <SemaforoKPI title="Próximo Vencimiento" value={stats.kpis.minDias === Infinity ? '-' : `${stats.kpis.minDias}d`} label={"Mín 60d"} status={stats.kpis.minDias <= 30 ? 'danger' : stats.kpis.minDias <= 60 ? 'alert' : 'ok'} />
            </div>
          </section>
        </div>

        <div className="col-span-1 space-y-8">
          <section className="bg-jengibre-dark text-white rounded-3xl p-8 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><TrendingUp size={80} /></div>
            <h2 className="text-xl font-display font-bold mb-6 relative z-10">Cierre del Mes</h2>
            <div className="space-y-6 relative z-10">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Ingresos Cobrados</p>
                <p className="text-2xl font-mono font-bold text-jengibre-secondary">{formatARS(stats.mesActual.ingresos)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Costos Pagados</p>
                <p className="text-2xl font-mono font-bold text-red-400">{formatARS(stats.mesActual.costos)}</p>
              </div>
              <div className="pt-4 border-t border-white/10">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Resultado Neto</p>
                <p className={`text-3xl font-mono font-bold ${stats.mesActual.resultado < 0 ? 'text-red-400' : 'text-white'}`}>
                  {formatARS(stats.mesActual.resultado)}
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
              <AlertCircle size={16} /> Centro de Atención
            </h2>
            <div className="space-y-3">
              {alertas.length === 0 ? (
                <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-2xl flex items-start gap-4">
                  <div className="bg-emerald-500 text-white p-1.5 rounded-full"><CheckCircle2 size={16} /></div>
                  <div>
                    <p className="font-bold text-emerald-900 text-sm">¡Todo en orden!</p>
                    <p className="text-emerald-700 text-xs mt-1">No hay alertas críticas para hoy.</p>
                  </div>
                </div>
              ) : (
                alertas.map((alerta, i) => (
                  <div key={i} className={`bg-white border p-5 rounded-2xl flex items-start gap-4 shadow-sm ${
                    alerta.type === 'red' ? 'border-red-100' : 'border-amber-100'
                  }`}>
                    <div className={`p-1.5 rounded-full ${alerta.type === 'red' ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'}`}>
                      <AlertCircle size={16} />
                    </div>
                    <div>
                      <p className="font-bold text-gray-800 text-sm">{alerta.title}</p>
                      <p className="text-gray-500 text-xs mt-1 leading-relaxed">{alerta.desc}</p>
                    </div>
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