import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Wallet, TrendingUp, ArrowUpRight, ArrowDownRight, Target, Info, Settings, ChevronLeft, ChevronRight, Sparkles, Send, Loader2, Landmark } from 'lucide-react';
import { formatARS, formatUSD, parseFinancial, getLocalDateString, parseNotas } from '@/lib/utils';
import { useCotizacionOficial } from '@/hooks/useCotizacion';
import { showSuccess, showError } from '@/utils/toast';

export default function SaludFinanciera() {
  const queryClient = useQueryClient();
  const { data: cotizacionData } = useCotizacionOficial();
  const cotizacion = cotizacionData || 1000;
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Queries
  const { data: movimientos } = useQuery({
    queryKey: ['movimientos_salud'],
    queryFn: async () => {
      const { data, error } = await supabase.from('movimientos').select('*');
      if (error) throw error;
      return data;
    }
  });

  const { data: configCuentas } = useQuery({
    queryKey: ['configuracion', 'cuentas_caja'],
    queryFn: async () => {
      const { data } = await supabase.from('configuracion').select('valor').eq('clave', 'cuentas_caja').maybeSingle();
      return data?.valor ? JSON.parse(data.valor) : ['MP Vir', 'MP Mauro', 'MP Fondo', 'USD'];
    }
  });

  const { data: configSaldos } = useQuery({
    queryKey: ['configuracion', 'saldos_iniciales'],
    queryFn: async () => {
      const { data } = await supabase.from('configuracion').select('valor').eq('clave', 'saldos_iniciales').maybeSingle();
      return data?.valor ? JSON.parse(data.valor) : {};
    }
  });

  const { data: facturas } = useQuery({
    queryKey: ['facturacion_salud'],
    queryFn: async () => {
      const { data, error } = await supabase.from('facturacion').select('*');
      if (error) throw error;
      return data;
    }
  });

  const { data: equipo } = useQuery({
    queryKey: ['equipo_salud'],
    queryFn: async () => {
      const { data, error } = await supabase.from('equipo').select('*').eq('activo', true);
      if (error) throw error;
      return data;
    }
  });

  const { data: configRows } = useQuery({
    queryKey: ['configuracion_salud'],
    queryFn: async () => {
      const { data, error } = await supabase.from('configuracion').select('*');
      if (error) throw error;
      return data;
    }
  });

  // Cálculos de Saldos Reales
  const saldos = useMemo(() => {
    if (!configCuentas || !movimientos) return { totalARS: 0, porCuenta: [] };
    
    const porCuenta = configCuentas.map((nombre: string) => {
      const esUSD = nombre.toUpperCase().includes('USD') || nombre.toUpperCase().includes('DÓLAR');
      const saldoInicial = Number(configSaldos?.[nombre] || 0);
      
      const movsCuenta = movimientos.filter(m => m.cuenta === nombre);
      const totalMovs = movsCuenta.reduce((acc, m) => {
        if (m.tipo === 'ingreso') return acc + Number(m.monto);
        if (m.tipo === 'egreso') return acc - Number(m.monto);
        return acc;
      }, 0);

      const saldoActual = saldoInicial + totalMovs;
      const saldoARS = esUSD ? saldoActual * cotizacion : saldoActual;
      
      return { nombre, esUSD, saldo: saldoActual, saldoARS };
    }).filter((c: any) => c.nombre.toUpperCase() !== 'IVA');

    const totalARS = porCuenta.reduce((acc: number, c: any) => acc + c.saldoARS, 0);
    return { totalARS, porCuenta };
  }, [configCuentas, configSaldos, movimientos, cotizacion]);

  // Cálculos de Monto Real Proyectado
  const proyeccion = useMemo(() => {
    if (!facturas || !equipo || !configRows) return { facturasPendientes: 0, honorariosPendientes: 0, costoEstructural: 0, montoReal: 0 };
    
    const hoyStr = getLocalDateString().substring(0, 7);

    const facturasPendientes = facturas
      .filter(f => f.estado !== 'pagado' && f.mes <= hoyStr)
      .reduce((acc, f) => acc + parseFinancial(f.monto_final || f.monto_base), 0);

    const honorariosPendientes = equipo.reduce((acc, m) => {
      const notas = parseNotas(m.notas);
      const asignaciones = (Object.values(notas.asignaciones || {}) as number[]).reduce((a: number, b: number) => a + Number(b || 0), 0);
      return acc + Number(m.honorario_mensual || 0) + asignaciones;
    }, 0);

    const gastosFijos = Number(configRows.find(c => c.clave === 'gastos_fijos_estimados')?.valor || 0);
    const costoDir = Number(configRows.find(c => c.clave === 'costo_direccion_mensual')?.valor || 0);
    const costoEstructural = gastosFijos + costoDir;

    const montoReal = saldos.totalARS + facturasPendientes - honorariosPendientes;

    return { facturasPendientes, honorariosPendientes, costoEstructural, montoReal };
  }, [facturas, equipo, configRows, saldos]);

  const metaReserva = Number(configRows?.find(c => c.clave === 'meta_reserva_anual')?.valor || 33000000);

  return (
    <div className="animate-in fade-in duration-700 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Salud Financiera</h1>
          <p className="text-slate-500 mt-1 font-medium">Análisis de liquidez real y proyecciones de excedentes.</p>
        </div>
        <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-sm">
          <button onClick={() => setSelectedYear(y => y - 1)} className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400"><ChevronLeft size={20} /></button>
          <span className="px-6 font-bold text-slate-700">{selectedYear}</span>
          <button onClick={() => setSelectedYear(y => y + 1)} className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400"><ChevronRight size={20} /></button>
        </div>
      </header>

      {/* Saldos Reales Grid */}
      <section className="mb-16">
        <div className="flex items-center gap-2 mb-6 text-slate-400">
          <Landmark size={16} />
          <h2 className="text-[11px] font-bold uppercase tracking-[0.15em]">Saldos Reales por Cuenta</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {saldos.porCuenta.map((c: any) => (
            <div key={c.nombre} className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm hover:shadow-md transition-all group">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 rounded-xl bg-slate-50 text-slate-400 group-hover:text-slate-600 transition-colors">
                  <Wallet size={18} />
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{c.nombre}</span>
              </div>
              <div className="space-y-1">
                <p className={`text-2xl font-semibold tracking-tight ${c.esUSD ? 'text-blue-600' : 'text-slate-900'}`}>
                  {c.esUSD ? formatUSD(c.saldo) : formatARS(c.saldo)}
                </p>
                {c.esUSD && (
                  <p className="text-[10px] font-medium text-slate-400">EQ: {formatARS(c.saldoARS)}</p>
                )}
              </div>
            </div>
          ))}
          <div className="bg-jengibre-primary p-6 rounded-3xl shadow-lg shadow-jengibre-primary/20 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute -right-4 -top-4 opacity-10 rotate-12"><TrendingUp size={120} /></div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-4 text-white/70">
                <Landmark size={16} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Consolidado Total</span>
              </div>
              <p className="text-2xl font-bold text-white tracking-tight">{formatARS(saldos.totalARS)}</p>
              <p className="text-[10px] font-medium text-white/60 mt-1">LIQUIDEZ INMEDIATA</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Excedentes y Retiros */}
        <div className="lg:col-span-7">
          <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm h-full">
            <div className="flex items-center justify-between mb-10">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-emerald-50 text-emerald-600"><Target size={20} /></div>
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">Excedentes y Retiros</h2>
              </div>
              <button className="p-2 text-slate-400 hover:bg-slate-50 rounded-xl transition-colors"><Settings size={20} /></button>
            </div>

            <div className="space-y-10">
              <div className="relative">
                <div className="flex justify-between items-end mb-4">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Monto Real Proyectado (Hoy)</p>
                    <h3 className="text-4xl font-bold text-slate-900 tracking-tight">{formatARS(proyeccion.montoReal)}</h3>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest mb-1">Meta Reserva</p>
                    <p className="text-lg font-bold text-rose-500 tracking-tight">{formatARS(metaReserva)}</p>
                  </div>
                </div>
                
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden mb-8">
                  <div 
                    className="h-full bg-emerald-500 rounded-full transition-all duration-1000" 
                    style={{ width: `${Math.min((proyeccion.montoReal / metaReserva) * 100, 100)}%` }}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Composición del Saldo</p>
                    <div className="space-y-3">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Saldo en Cuentas</span>
                        <span className="font-semibold text-slate-700">{formatARS(saldos.totalARS)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-emerald-600 font-medium">(+) Facturas Pendientes</span>
                        <span className="font-semibold text-emerald-600">{formatARS(proyeccion.facturasPendientes)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-rose-500 font-medium">(-) Honorarios Pendientes</span>
                        <span className="font-semibold text-rose-500">{formatARS(proyeccion.honorariosPendientes)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Costo Estructural</p>
                    <div className="space-y-1">
                      <p className="text-xl font-bold text-slate-700 tracking-tight">{formatARS(proyeccion.costoEstructural)}</p>
                      <p className="text-[10px] text-slate-400 font-medium">MANTENIMIENTO + SUELDO DIR</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-8 border-t border-slate-100">
                <div className="flex items-start gap-4 p-5 rounded-2xl bg-blue-50/50 border border-blue-100">
                  <Info className="text-blue-500 shrink-0 mt-0.5" size={18} />
                  <p className="text-xs text-blue-700 leading-relaxed">
                    El <strong>Monto Real Proyectado</strong> considera el dinero disponible hoy, sumando lo facturado este mes (o vencido) y restando los compromisos de honorarios del equipo.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Asesor IA */}
        <div className="lg:col-span-5">
          <div className="bg-slate-900 rounded-[2.5rem] p-8 shadow-xl h-full flex flex-col relative overflow-hidden border border-white/5">
            <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none"><Sparkles size={200} /></div>
            
            <div className="flex items-center gap-3 mb-8 relative z-10">
              <div className="p-2.5 rounded-2xl bg-white/10 text-white"><Sparkles size={20} /></div>
              <h2 className="text-lg font-bold text-white tracking-tight">Asesor Financiero IA</h2>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 relative z-10">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-6">
                <Sparkles className="text-white/20" size={32} />
              </div>
              <p className="text-white/40 text-sm font-medium leading-relaxed">
                Consultame sobre inversiones, retiros de dividendos o proyecciones de flujo de caja...
              </p>
            </div>

            <div className="mt-8 relative z-10">
              <div className="relative group">
                <input 
                  type="text" 
                  placeholder="¿Puedo retirar 1 millón hoy?" 
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-6 pr-14 outline-none focus:ring-2 focus:ring-white/20 transition-all text-white placeholder:text-white/20 text-sm"
                />
                <button className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-white text-slate-900 rounded-xl hover:scale-105 transition-transform active:scale-95">
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
