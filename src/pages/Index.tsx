import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, TrendingDown, Wallet, Users, FileText, ArrowUpRight, ArrowDownRight, Landmark, Calendar, Clock, CheckCircle2, Loader2 } from 'lucide-react';
import { formatARS, formatUSD, parseFinancial, getLocalDateString, parseNotas } from '@/lib/utils';
import { useCotizacionOficial } from '@/hooks/useCotizacion';

export default function Dashboard() {
  const { data: cotizacionData } = useCotizacionOficial();
  const cotizacion = cotizacionData || 1000;

  // Queries
  const { data: cuentas, isLoading: loadingCuentas } = useQuery({
    queryKey: ['cuentas_dash'],
    queryFn: async () => {
      const { data, error } = await supabase.from('cuentas').select('*').order('nombre');
      if (error) throw error;
      return data;
    }
  });

  const { data: facturas, isLoading: loadingFacturas } = useQuery({
    queryKey: ['facturacion_dash'],
    queryFn: async () => {
      const { data, error } = await supabase.from('facturacion').select('*');
      if (error) throw error;
      return data;
    }
  });

  const { data: equipo, isLoading: loadingEquipo } = useQuery({
    queryKey: ['equipo_dash'],
    queryFn: async () => {
      const { data, error } = await supabase.from('equipo').select('*').eq('activo', true);
      if (error) throw error;
      return data;
    }
  });

  const { data: transacciones, isLoading: loadingTrans } = useQuery({
    queryKey: ['transacciones_dash'],
    queryFn: async () => {
      const { data, error } = await supabase.from('transacciones').select('*').order('fecha', { ascending: false }).limit(5);
      if (error) throw error;
      return data;
    }
  });

  // Cálculos
  const stats = useMemo(() => {
    if (!cuentas || !facturas || !equipo) return null;

    const porCuenta = cuentas.map(c => {
      const esUSD = c.nombre.toUpperCase().includes('USD') || c.nombre.toUpperCase().includes('DÓLAR');
      const saldoARS = esUSD ? c.saldo * cotizacion : c.saldo;
      return { ...c, esUSD, saldoARS };
    }).filter(c => c.nombre.toUpperCase() !== 'IVA');

    const liquidezTotal = porCuenta.reduce((acc, c) => acc + c.saldoARS, 0);

    const hoyStr = getLocalDateString().substring(0, 7);
    const facturasPendientes = facturas
      .filter(f => f.estado !== 'pagado' && f.mes <= hoyStr)
      .reduce((acc, f) => acc + parseFinancial(f.monto_final || f.monto_base), 0);

    const honorariosPendientes = equipo.reduce((acc, m) => {
      const notas = parseNotas(m.notas);
      const asignaciones = (Object.values(notas.asignaciones || {}) as number[]).reduce((a: number, b: number) => a + Number(b || 0), 0);
      return acc + Number(m.honorario_mensual || 0) + asignaciones;
    }, 0);

    const montoReal = liquidezTotal + facturasPendientes - honorariosPendientes;

    return { liquidezTotal, facturasPendientes, honorariosPendientes, montoReal, porCuenta };
  }, [cuentas, facturas, equipo, cotizacion]);

  if (loadingCuentas || loadingFacturas || loadingEquipo || loadingTrans) {
    return <div className="flex justify-center py-32"><Loader2 className="w-12 h-12 text-slate-300 animate-spin" /></div>;
  }

  return (
    <div className="animate-in fade-in duration-700 pb-20">
      <header className="mb-12">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1 font-medium">Resumen operativo y financiero de la agencia.</p>
      </header>

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm group hover:border-emerald-500/30 transition-all">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 rounded-2xl bg-emerald-50 text-emerald-600"><TrendingUp size={20} /></div>
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Monto Real Proyectado</h3>
          </div>
          <p className="text-3xl font-bold text-slate-900 tracking-tight">{formatARS(stats?.montoReal || 0)}</p>
          <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
            <ArrowUpRight size={14} />
            <span>Liquidez + Pendientes</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm group hover:border-blue-500/30 transition-all">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 rounded-2xl bg-blue-50 text-blue-600"><Landmark size={20} /></div>
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Liquidez en Cuentas</h3>
          </div>
          <p className="text-3xl font-bold text-slate-900 tracking-tight">{formatARS(stats?.liquidezTotal || 0)}</p>
          <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-blue-600 uppercase tracking-wider">
            <Clock size={14} />
            <span>Saldo Consolidado</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm group hover:border-rose-500/30 transition-all">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 rounded-2xl bg-rose-50 text-rose-600"><Users size={20} /></div>
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Compromisos Equipo</h3>
          </div>
          <p className="text-3xl font-bold text-slate-900 tracking-tight">{formatARS(stats?.honorariosPendientes || 0)}</p>
          <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-rose-600 uppercase tracking-wider">
            <ArrowDownRight size={14} />
            <span>Honorarios del Mes</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Cuentas Detalle */}
        <div className="lg:col-span-8">
          <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Estado de Cuentas</h2>
              <button className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors">Ver Todas</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {stats?.porCuenta.map(c => (
                <div key={c.id} className="flex items-center justify-between p-5 rounded-2xl bg-slate-50 border border-slate-100 group hover:bg-white hover:border-slate-200 transition-all">
                  <div className="flex items-center gap-4">
                    <div className={`p-2.5 rounded-xl ${c.esUSD ? 'bg-blue-100 text-blue-600' : 'bg-white text-slate-400'} shadow-sm`}>
                      <Wallet size={18} />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{c.nombre}</p>
                      <p className={`text-lg font-bold tracking-tight ${c.esUSD ? 'text-blue-600' : 'text-slate-900'}`}>
                        {c.esUSD ? formatUSD(c.saldo) : formatARS(c.saldo)}
                      </p>
                    </div>
                  </div>
                  {c.esUSD && (
                    <div className="text-right">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">ARS EQ.</p>
                      <p className="text-xs font-bold text-slate-500">{formatARS(c.saldoARS)}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Últimos Movimientos */}
        <div className="lg:col-span-4">
          <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm h-full">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight mb-8">Actividad Reciente</h2>
            <div className="space-y-6">
              {transacciones?.map(t => (
                <div key={t.id} className="flex items-start gap-4 group">
                  <div className={`p-2 rounded-xl shrink-0 ${t.tipo === 'ingreso' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                    {t.tipo === 'ingreso' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-700 truncate group-hover:text-slate-900 transition-colors">{t.descripcion}</p>
                    <p className="text-[10px] text-slate-400 font-medium uppercase mt-0.5">{new Date(t.fecha).toLocaleDateString()}</p>
                  </div>
                  <p className={`text-sm font-bold tracking-tight ${t.tipo === 'ingreso' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {t.moneda === 'USD' ? formatUSD(t.monto) : formatARS(t.monto)}
                  </p>
                </div>
              ))}
              {transacciones?.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">Sin movimientos</p>
                </div>
              )}
            </div>
            <button className="w-full mt-10 py-4 rounded-2xl border border-slate-100 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all">Ver Historial Completo</button>
          </div>
        </div>
      </div>
    </div>
  );
}
