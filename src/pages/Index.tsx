import React, { useMemo } from 'react';
import { formatARS, parseFinancial, parseDescripcion, parseNotas, formatUSD } from '@/lib/utils';
import { Plus, FileText, RefreshCw, AlertCircle, CheckCircle2, Landmark, TrendingUp, Users, Sparkles, ShieldCheck, ArrowRight, Wallet, ArrowUpRight, ArrowDownRight, DollarSign } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCotizacionOficial } from '@/hooks/useCotizacion';

const StatCard = ({ title, value, sub, icon: Icon, colorClass = "text-blue-600", bgClass = "bg-blue-50", isUSD = false }: { title: string, value: string, sub?: string, icon: any, colorClass?: string, bgClass?: string, isUSD?: boolean }) => (
  <div className="bg-white border border-jengibre-border p-6 rounded-[2rem] shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
    <div className={`absolute -right-4 -top-4 opacity-5 group-hover:scale-110 transition-transform ${colorClass}`}>
      <Icon size={120} />
    </div>
    <div className="relative z-10">
      <div className="flex items-center gap-2 mb-4">
        <div className={`p-2.5 rounded-2xl ${bgClass} ${colorClass} shadow-sm`}>
          <Icon size={20} />
        </div>
        <h3 className="text-[11px] font-black uppercase tracking-[0.15em] text-gray-400">{title}</h3>
      </div>
      <div className="flex items-baseline gap-1">
        <p className={`text-3xl font-mono font-black tracking-tighter ${isUSD ? 'text-blue-700' : 'text-jengibre-dark'}`}>
          {value}
        </p>
      </div>
      {sub && (
        <div className="flex items-center gap-1.5 mt-3">
          <div className="h-px w-4 bg-gray-200"></div>
          <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">{sub}</p>
        </div>
      )}
    </div>
  </div>
);

const SemaforoKPI = ({ title, value, status, label }: { title: string, value: string, status: 'ok' | 'alert' | 'danger', label: string }) => {
  const colors = { 
    ok: { dot: 'bg-jengibre-green', text: 'text-jengibre-green', bg: 'bg-jengibre-green/10' }, 
    alert: { dot: 'bg-jengibre-amber', text: 'text-jengibre-amber', bg: 'bg-jengibre-amber/10' }, 
    danger: { dot: 'bg-jengibre-red', text: 'text-jengibre-red', bg: 'bg-jengibre-red/10' } 
  };
  const current = colors[status];
  
  return (
    <div className={`border border-jengibre-border p-5 rounded-[1.5rem] flex items-center gap-5 bg-white transition-all hover:border-gray-300 shadow-sm group`}>
      <div className={`w-4 h-4 rounded-full shrink-0 shadow-inner ${current.dot} group-hover:scale-110 transition-transform`} />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 truncate">{title}</p>
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-mono font-black text-gray-900 tracking-tighter truncate">{value}</span>
          <span className={`text-[10px] font-black px-2 py-1 rounded-lg whitespace-nowrap uppercase tracking-tighter ${current.bg} ${current.text}`}>{label}</span>
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

  const { data: facturas } = useQuery({
    queryKey: ['facturacion'],
    queryFn: async () => {
      const { data, error } = await supabase.from('facturacion').select('*');
      if (error) throw error;
      return data || [];
    }
  });

  const { data: equipo } = useQuery({
    queryKey: ['equipo'],
    queryFn: async () => {
      const { data, error } = await supabase.from('equipo').select('*').eq('activo', true);
      if (error) throw error;
      return data || [];
    }
  });

  const stats = useMemo(() => {
    if (!movimientos || !clientes || !configRows || !facturas || !equipo) return null;

    const saldosCalc: Record<string, number> = {};
    const saldosIniciales = configSaldos || {};
    
    Object.entries(saldosIniciales).forEach(([cuenta, monto]) => {
      if (cuenta !== 'IVA') {
        saldosCalc[cuenta] = Number(monto);
      }
    });

    let ingresosMes = 0;
    let costosMes = 0;
    let ingresosYTD = 0;
    let costosYTD = 0;

    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentYearPrefix = now.getFullYear().toString();
    const hoyStr = now.toISOString().split('T')[0];

    movimientos.forEach(m => {
      if (m.cuenta === 'IVA') return;
      
      let isUSD = false;
      try { const p = JSON.parse(m.notas || '{}'); if (p.moneda === 'USD') isUSD = true; } catch(e){}
      
      const valorEnPesos = isUSD ? Number(m.monto) * cotizacion : Number(m.monto);
      const factor = m.tipo === 'ingreso' ? 1 : -1;

      if (!saldosCalc[m.cuenta]) saldosCalc[m.cuenta] = 0;

      if (m.tipo === 'transferencia' && m.cuenta_destino) {
        if (m.cuenta_destino === 'IVA') {
          saldosCalc[m.cuenta] -= valorEnPesos;
        } else {
          if (!saldosCalc[m.cuenta_destino]) saldosCalc[m.cuenta_destino] = 0;
          saldosCalc[m.cuenta] -= valorEnPesos;
          saldosCalc[m.cuenta_destino] += valorEnPesos;
        }
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
    
    const ingresosPendientes = facturas
      .filter(f => f.estado !== 'pagado' && f.mes <= hoyStr)
      .reduce((acc, f) => {
        const desc = parseDescripcion(f.descripcion);
        const final = Number(f.monto_final || f.monto_base || 0);
        const cobrado = desc.monto_pagado + desc.retencion_ganancias + desc.retencion_iva + desc.monto_retenido;
        return acc + (final - cobrado);
      }, 0);

    const totalEquipoMes = equipo.reduce((acc, e) => {
      const notas = parseNotas(e.notas);
      let totalMiembro = parseFinancial(e.honorario_mensual || 0);
      Object.entries(notas.asignaciones).forEach(([cId, monto]) => {
        if (clientes.find(c => c.id === cId)) totalMiembro = parseFinancial(totalMiembro + Number(monto));
      });
      return acc + totalMiembro;
    }, 0);

    const pagadoEquipoMes = movimientos
      .filter(m =>
        m.tipo === 'egreso' &&
        m.concepto === 'Honorarios Equipo' &&
        m.fecha?.startsWith(currentMonthPrefix)
      )
      .reduce((acc, m) => acc + Number(m.monto), 0);

    const egresosEquipoPendientes = Math.max(0, parseFinancial(totalEquipoMes - pagadoEquipoMes));
    const montoRealHoy = parseFinancial(totalCajaARS + ingresosPendientes - egresosEquipoPendientes);

    const gananciaYTD = ingresosYTD - costosYTD;
    const resultadoMes = ingresosMes - costosMes;

    const costoDireccion = Number(configRows.find(r => r.clave === 'costo_direccion_mensual')?.valor || 0);
    const gastosFijos = Number(configRows.find(r => r.clave === 'gastos_fijos_estimados')?.valor || 0);
    const extraReserva = Number(configRows.find(r => r.clave === 'extra_reserva_mensual')?.valor || 0);
    
    const costoMensualReserva = gastosFijos + costoDireccion + extraReserva;
    const metaFondo = costoMensualReserva * 6;
    
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
      fondo: { actual: montoRealHoy, meta: metaFondo },
      mesActual: { ingresos: ingresosMes, costos: costosMes, resultado: resultadoMes },
      kpis: { ratioEquipo: 0, margenNeto: ingresosMes > 0 ? (resultadoMes/ingresosMes)*100 : 0, concentracion, minDias, fondoRatio: metaFondo > 0 ? (montoRealHoy/metaFondo)*100 : 0 }
    };
  }, [movimientos, configSaldos, clientes, cotizacion, configRows, facturas, equipo]);

  if (!stats) return <div className="p-12 text-center">Cargando dashboard...</div>;

  const alertas = [];
  if (stats.kpis.minDias <= 30) alertas.push({ type: 'amber', title: 'Contrato por vencer', desc: `Un contrato activo vence en ${stats.kpis.minDias} días.` });
  if (stats.kpis.fondoRatio < 50) alertas.push({ type: 'red', title: 'Fondo de Emergencia Bajo', desc: `Tu reserva cubre menos de la mitad de los 6 meses de seguridad.` });
  if (recuperos && recuperos.length > 0) alertas.push({ type: 'amber', title: 'Recuperos pendientes', desc: `Tenés ${recuperos.length} recuperos esperando cobranza.` });

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-12">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-5xl font-black tracking-tighter text-jengibre-dark">Hola, Equipo 👋</h1>
          <p className="text-gray-500 mt-2 font-bold uppercase tracking-widest text-xs">Resumen ejecutivo de la salud financiera de Jengibre.</p>
        </div>
        <div className="flex gap-3">
          <Link to="/caja" className="bg-jengibre-primary hover:bg-[#a64120] text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-3 transition-all shadow-xl shadow-jengibre-primary/20 active:scale-95">
            <Plus size={18} /> Cargar movimiento
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Proyección Anual (ARR)" value={formatARS(stats.arr)} sub="Facturación bruta proyectada" icon={TrendingUp} colorClass="text-blue-600" bgClass="bg-blue-50" />
        <StatCard title="Ticket Promedio" value={formatARS(stats.ticketPromedio)} sub="Ingreso base por cliente" icon={Users} colorClass="text-amber-600" bgClass="bg-amber-50" />
        <StatCard title="Ganancia Real Acum." value={formatARS(stats.ytd.ganancia)} sub="Ingresos - Egresos (Año actual)" icon={Sparkles} colorClass="text-emerald-600" bgClass="bg-emerald-50" />
        <StatCard title="Fondo de Emergencia" value={formatARS(stats.fondo.actual)} sub={`Meta (6 meses): ${formatARS(stats.fondo.meta)}`} icon={ShieldCheck} colorClass="text-indigo-600" bgClass="bg-indigo-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 space-y-10">
          
          <section className="bg-white border border-jengibre-border rounded-[2.5rem] p-8 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400 flex items-center gap-3">
                <Landmark size={18} className="text-jengibre-primary" /> Cuentas con mayor liquidez
              </h2>
              <Link to="/configuracion" className="text-[10px] font-black uppercase tracking-widest text-jengibre-primary hover:underline">Gestionar Cuentas</Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {Object.entries(stats.saldos).sort((a,b) => b[1] - a[1]).slice(0, 4).map(([nombre, monto]) => (
                <div key={nombre} className="bg-gray-50/50 border border-gray-100 p-6 rounded-[1.5rem] flex justify-between items-center group hover:border-jengibre-primary hover:bg-white transition-all shadow-sm">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 truncate">{nombre}</p>
                    <p className={`text-2xl font-mono font-black tracking-tighter truncate ${nombre.includes('USD') ? 'text-blue-700' : 'text-jengibre-dark'}`}>
                      {nombre.includes('USD') ? formatUSD(monto / cotizacion) : formatARS(monto)}
                    </p>
                  </div>
                  <div className="p-3 rounded-2xl bg-white text-gray-300 group-hover:bg-jengibre-cream group-hover:text-jengibre-primary transition-colors shadow-sm">
                    <Wallet size={24} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white border border-jengibre-border rounded-[2.5rem] p-8 shadow-sm">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400 mb-8 flex items-center gap-3">
              <Sparkles size={18} className="text-amber-500" /> Métricas de Control
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <SemaforoKPI title="Concentración de Riesgo" value={`${stats.kpis.concentracion.toFixed(1)}%`} label={"Máx 30%"} status={stats.kpis.concentracion > 40 ? 'danger' : stats.kpis.concentracion > 30 ? 'alert' : 'ok'} />
              <SemaforoKPI title="Reserva de Seguridad" value={`${stats.kpis.fondoRatio.toFixed(0)}%`} label={"Meta 100%"} status={stats.kpis.fondoRatio < 30 ? 'danger' : stats.kpis.fondoRatio < 80 ? 'alert' : 'ok'} />
              <SemaforoKPI title="Margen Neto (Mes)" value={`${stats.kpis.margenNeto.toFixed(1)}%`} label={"Mín 25%"} status={stats.kpis.margenNeto < 10 ? 'danger' : stats.kpis.margenNeto < 25 ? 'alert' : 'ok'} />
              <SemaforoKPI title="Próximo Vencimiento" value={stats.kpis.minDias === Infinity ? '-' : `${stats.kpis.minDias}d`} label={"Mín 60d"} status={stats.kpis.minDias <= 30 ? 'danger' : stats.kpis.minDias <= 60 ? 'alert' : 'ok'} />
            </div>
          </section>
        </div>

        <div className="space-y-8">
          <section className="bg-jengibre-dark text-white rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden border border-white/5">
            <div className="absolute -right-10 -top-10 p-4 opacity-10 rotate-12"><TrendingUp size={200} /></div>
            <h2 className="text-xs font-black uppercase tracking-[0.3em] text-jengibre-secondary mb-10 relative z-10">Cierre del Mes</h2>
            <div className="space-y-8 relative z-10">
              <div className="flex justify-between items-end group">
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Ingresos Cobrados</p>
                  <p className="text-3xl font-mono font-black tracking-tighter text-jengibre-secondary group-hover:scale-105 transition-transform origin-left">{formatARS(stats.mesActual.ingresos)}</p>
                </div>
                <div className="p-2 rounded-xl bg-jengibre-secondary/10 text-jengibre-secondary mb-1">
                  <ArrowDownRight size={20} />
                </div>
              </div>
              <div className="flex justify-between items-end group">
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Costos Pagados</p>
                  <p className="text-3xl font-mono font-black tracking-tighter text-red-400 group-hover:scale-105 transition-transform origin-left">{formatARS(stats.mesActual.costos)}</p>
                </div>
                <div className="p-2 rounded-xl bg-red-400/10 text-red-400 mb-1">
                  <ArrowUpRight size={20} />
                </div>
              </div>
              <div className="pt-8 border-t border-white/10">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Resultado Neto</p>
                <p className={`text-5xl font-mono font-black tracking-tighter ${stats.mesActual.resultado < 0 ? 'text-red-400' : 'text-white'}`}>
                  {formatARS(stats.mesActual.resultado)}
                </p>
              </div>
            </div>
          </section>

          <section className="bg-white border border-jengibre-border rounded-[2.5rem] p-8 shadow-sm">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400 mb-6 flex items-center gap-3">
              <AlertCircle size={18} className="text-jengibre-amber" /> Centro de Atención
            </h2>
            <div className="space-y-4">
              {alertas.length === 0 ? (
                <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl flex items-start gap-5">
                  <div className="bg-emerald-500 text-white p-2 rounded-xl shadow-lg shadow-emerald-500/20 shrink-0"><CheckCircle2 size={20} /></div>
                  <div>
                    <p className="font-black text-emerald-900 text-sm uppercase tracking-tight">¡Todo en orden!</p>
                    <p className="text-emerald-700 text-xs mt-1 font-medium">No hay alertas críticas para hoy.</p>
                  </div>
                </div>
              ) : (
                alertas.map((alerta, i) => (
                  <div key={i} className={`bg-white border p-6 rounded-2xl flex items-start gap-5 shadow-sm transition-all hover:shadow-md ${
                    alerta.type === 'red' ? 'border-red-100' : 'border-amber-100'
                  }`}>
                    <div className={`p-2 rounded-xl shadow-lg shrink-0 ${alerta.type === 'red' ? 'bg-red-500 text-white shadow-red-500/20' : 'bg-amber-500 text-white shadow-amber-500/20'}`}>
                      <AlertCircle size={20} />
                    </div>
                    <div>
                      <p className="font-black text-gray-800 text-sm uppercase tracking-tight">{alerta.title}</p>
                      <p className="text-gray-500 text-xs mt-1.5 leading-relaxed font-medium">{alerta.desc}</p>
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
