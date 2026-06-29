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

  const { data: clientes } = useQuery({
    queryKey: ['clientes_salud'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id, estado');
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

  // Cálculos de Saldos Reales y Grilla
  const saldos = useMemo(() => {
    const defaultState = {
      totalARS: 0,
      porCuenta: [],
      grilla: { ingresos: {}, egresos: {}, totales: Array(12).fill(0).map(() => ({ ingresos: 0, egresos: 0, neto: 0, margen: 0, saldoCaja: 0 })) },
      mesesNames: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    };

    if (!configCuentas || !movimientos) return defaultState;
    
    // 1. Cálculos de cuentas (arriba)
    const porCuenta = configCuentas.map((nombre: string) => {
      const esUSD = nombre.toUpperCase().includes('USD') || nombre.toUpperCase().includes('DÓLAR');
      const saldoInicial = Number(configSaldos?.[nombre] || 0);
      
      const movsCuenta = movimientos.filter(m => m.cuenta === nombre);
      const totalMovs = movsCuenta.reduce((acc, m) => {
        if (m.tipo === 'ingreso') return acc + Number(m.monto);
        if (m.tipo === 'egreso') return acc - Number(m.monto);
        if (m.tipo === 'transferencia') {
          if (m.cuenta === nombre) return acc - Number(m.monto);
          if (m.cuenta_destino === nombre) return acc + Number(m.monto);
        }
        return acc;
      }, 0);

      const saldoActual = saldoInicial + totalMovs;
      const saldoARS = esUSD ? saldoActual * cotizacion : saldoActual;
      
      return { nombre, esUSD, saldo: saldoActual, saldoARS };
    }).filter((c: any) => c.nombre.toUpperCase() !== 'IVA');

    const totalARS = porCuenta.reduce((acc: number, c: any) => acc + c.saldoARS, 0);

    // 2. Cálculos de grilla mensual
    const mesesKeys = Array.from({ length: 12 }, (_, i) => `${selectedYear}-${String(i + 1).padStart(2, '0')}`);
    const ingresosPorCategoria: Record<string, { nombre: string, data: number[], details: any[][] }> = {};
    const egresosPorCategoria: Record<string, { nombre: string, data: number[], details: any[][] }> = {};
    const totalesMes = mesesKeys.map(() => ({ ingresos: 0, egresos: 0, neto: 0, margen:0, saldoCaja: 0 }));

    let saldoInicialAnio = 0;
    Object.entries(configSaldos).forEach(([c, m]) => {
      if (c.toUpperCase() !== 'IVA') {
        const esUSD = c.toUpperCase().includes('USD') || c.toUpperCase().includes('DÓLAR');
        const mnt = Number(m);
        saldoInicialAnio += esUSD ? mnt * cotizacion : mnt;
      }
    });

    movimientos.forEach(m => {
      if (!m.fecha || m.cuenta === 'IVA') return;
      const notasParsed = typeof m.notas === 'string' ? parseNotas(m.notas) : (m.notas || {});
      const isUSD = m.cuenta.toUpperCase().includes('USD') || m.cuenta.toUpperCase().includes('DÓLAR');
      
      const montoOriginal = parseFinancial(m.monto) || 0;
      const valorEnPesos = parseFinancial(isUSD ? montoOriginal * cotizacion : montoOriginal);

      const anioMov = parseInt(m.fecha.substring(0, 4));
      if (anioMov < selectedYear) {
        if (m.tipo === 'ingreso') saldoInicialAnio = parseFinancial(saldoInicialAnio + valorEnPesos);
        else if (m.tipo === 'egreso') saldoInicialAnio = parseFinancial(saldoInicialAnio - valorEnPesos);
      } else if (anioMov === selectedYear) {
        const mesIndex = mesesKeys.indexOf(m.fecha.substring(0, 7));
        if (mesIndex !== -1 && (m.tipo === 'ingreso' || m.tipo === 'egreso')) {
          const movConDetalle = { ...m, valorEnPesos, notasTexto: notasParsed.texto, isUSD };
          if (m.tipo === 'ingreso') {
            const cat = m.concepto || 'Otros Ingresos';
            if (!ingresosPorCategoria[cat]) ingresosPorCategoria[cat] = { nombre: cat, data: Array(12).fill(0), details: Array(12).fill(0).map(() => []) };
            ingresosPorCategoria[cat].data[mesIndex] = parseFinancial(ingresosPorCategoria[cat].data[mesIndex] + valorEnPesos);
            ingresosPorCategoria[cat].details[mesIndex].push(movConDetalle);
            totalesMes[mesIndex].ingresos = parseFinancial(totalesMes[mesIndex].ingresos + valorEnPesos);
          } else {
            const cat = m.concepto || 'Otros Gastos';
            if (!egresosPorCategoria[cat]) egresosPorCategoria[cat] = { nombre: cat, data: Array(12).fill(0), details: Array(12).fill(0).map(() => []) };
            egresosPorCategoria[cat].data[mesIndex] = parseFinancial(egresosPorCategoria[cat].data[mesIndex] + valorEnPesos);
            egresosPorCategoria[cat].details[mesIndex].push(movConDetalle);
            totalesMes[mesIndex].egresos = parseFinancial(totalesMes[mesIndex].egresos + valorEnPesos);
          }
        }
      }
    });

    let acumulado = saldoInicialAnio;
    totalesMes.forEach(t => {
      t.neto = parseFinancial(t.ingresos - t.egresos);
      t.margen = t.ingresos > 0 ? (t.neto / t.ingresos) * 100 : 0;
      acumulado = parseFinancial(acumulado + t.neto);
      t.saldoCaja = acumulado;
    });

    return {
      totalARS,
      porCuenta,
      grilla: { ingresos: ingresosPorCategoria, egresos: egresosPorCategoria, totales: totalesMes },
      mesesNames: defaultState.mesesNames
    };
  }, [configCuentas, configSaldos, movimientos, cotizacion, selectedYear]);

  // Cálculos de Monto Real Proyectado
  const proyeccion = useMemo(() => {
    if (!facturas || !equipo || !configRows || !clientes) return { facturasPendientes: 0, honorariosPendientes: 0, costoEstructural: 0, montoReal: 0 };
    
    const hoyStr = getLocalDateString().substring(0, 7);

    const facturasPendientes = facturas
      .filter(f => f.estado !== 'pagado' && f.mes <= hoyStr)
      .reduce((acc, f) => acc + parseFinancial(f.monto_final || f.monto_base), 0);

    const honorariosPendientes = equipo.reduce((acc, m) => {
      const notas = typeof m.notas === 'string' ? parseNotas(m.notas) : (m.notas || {});
      const asignaciones = notas.asignaciones || {};
      const totalAsignaciones = Object.entries(asignaciones).reduce((a: number, [cId, monto]: [string, any]) => {
        const c = clientes.find(cl => cl.id === cId);
        if (c && c.estado === 'activo') return a + Number(monto || 0);
        return a;
      }, 0);
      return acc + Number(m.honorario_mensual || 0) + totalAsignaciones;
    }, 0);

    const gastosFijos = Number(configRows.find(c => c.clave === 'gastos_fijos_estimados')?.valor || 0);
    const costoDir = Number(configRows.find(c => c.clave === 'costo_direccion_mensual')?.valor || 0);
    const costoEstructural = gastosFijos + costoDir;

    const montoReal = saldos.totalARS + facturasPendientes - honorariosPendientes;

    return { facturasPendientes, honorariosPendientes, costoEstructural, montoReal };
  }, [facturas, equipo, configRows, saldos, clientes]);

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
          <div className="bg-slate-900 p-6 rounded-3xl shadow-lg shadow-slate-900/10 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute -right-4 -top-4 opacity-5 rotate-12"><TrendingUp size={120} /></div>
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
        
      {/* Registro Mensual Real (Cashflow) */}
      <section className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden mt-12">
        <div className="bg-slate-900 text-white py-4 px-8 text-center font-bold tracking-[0.2em] text-[10px] uppercase border-b border-white/5">Registro Mensual Real ({selectedYear})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px] whitespace-nowrap border-collapse">
            <thead>
              <tr className="bg-slate-50 font-bold border-b border-slate-200">
                <th className="p-4 border-r border-slate-200 sticky left-0 bg-slate-50 z-10 uppercase tracking-widest text-slate-400">Categoría</th>
                {saldos.mesesNames?.map((m: string) => <th key={m} className="p-4 border-r border-slate-200 text-center uppercase tracking-widest text-slate-400">{m}</th>)}
                <th className="p-4 text-center bg-slate-100 uppercase tracking-widest text-slate-500">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-emerald-50/50 text-emerald-600 font-bold"><td className="p-3 px-4 sticky left-0 bg-emerald-50/50 z-10 uppercase tracking-[0.2em] text-[9px]">Ingresos</td><td colSpan={13}></td></tr>
              {saldos.grilla?.ingresos && Object.values(saldos.grilla.ingresos).map((c: any) => (
                <tr key={c.nombre} className="border-b border-slate-100 group hover:bg-slate-50/50 transition-colors">
                  <td className="p-3 px-4 border-r border-slate-100 sticky left-0 bg-white z-10 font-bold text-slate-700 group-hover:bg-slate-50 transition-colors">{c.nombre}</td>
                  {c.data.map((v: number, i: number) => (
                    <td key={i} className={`p-3 border-r border-slate-100 text-right font-bold text-slate-600 ${v > 0 ? 'text-slate-900' : 'text-slate-300'}`}>{v > 0 ? formatARS(v) : '-'}</td>
                  ))}
                  <td className="p-3 text-right font-bold bg-slate-50/80 text-slate-900">{formatARS(c.data.reduce((a: number, b: number) => a + b, 0))}</td>
                </tr>
              ))}
              <tr className="bg-slate-50/80 font-bold border-y border-slate-200">
                <td className="p-4 sticky left-0 bg-slate-50 z-10 uppercase tracking-widest text-[9px] text-slate-500">Total Ingresos</td>
                {saldos.grilla?.totales?.map((t: any, i: number) => <td key={i} className="p-4 text-right text-slate-900">{formatARS(t.ingresos)}</td>)}
                <td className="p-4 text-right bg-slate-100 text-slate-900">{formatARS(saldos.grilla?.totales?.reduce((a: any, t: any) => a + t.ingresos, 0) || 0)}</td>
              </tr>
              <tr className="bg-rose-50/50 text-rose-600 font-bold"><td className="p-3 px-4 sticky left-0 bg-rose-50/50 z-10 uppercase tracking-[0.2em] text-[9px]">Egresos</td><td colSpan={13}></td></tr>
              {saldos.grilla?.egresos && Object.values(saldos.grilla.egresos).map((c: any) => (
                <tr key={c.nombre} className="border-b border-slate-100 group hover:bg-slate-50/50 transition-colors">
                  <td className="p-3 px-4 border-r border-slate-100 sticky left-0 bg-white z-10 font-bold text-slate-700 group-hover:bg-slate-50 transition-colors">{c.nombre}</td>
                  {c.data.map((v: number, i: number) => (
                    <td key={i} className={`p-3 border-r border-slate-100 text-right font-bold text-rose-600 ${v > 0 ? 'text-rose-600' : 'text-slate-300'}`}>{v > 0 ? formatARS(v) : '-'}</td>
                  ))}
                  <td className="p-3 text-right font-bold bg-slate-50/80 text-slate-900">{formatARS(c.data.reduce((a: number, b: number) => a + b, 0))}</td>
                </tr>
              ))}
              <tr className="bg-rose-50/30 font-bold border-y border-rose-100">
                <td className="p-4 sticky left-0 bg-rose-50/30 z-10 uppercase tracking-widest text-[9px] text-rose-500">Total Egresos</td>
                {saldos.grilla?.totales?.map((t: any, i: number) => <td key={i} className="p-4 text-right text-rose-600">{formatARS(t.egresos)}</td>)}
                <td className="p-4 text-right bg-rose-50 text-rose-700">{formatARS(saldos.grilla?.totales?.reduce((a: any, t: any) => a + t.egresos, 0) || 0)}</td>
              </tr>
              <tr className="bg-blue-50/30 font-bold border-t-2 border-blue-100">
                <td className="p-5 sticky left-0 bg-blue-50/30 z-10 uppercase tracking-widest text-[10px] text-blue-600">Resultado Neto</td>
                {saldos.grilla?.totales?.map((t: any, i: number) => <td key={i} className={`p-5 text-right text-lg tracking-tight ${t.neto < 0 ? 'text-rose-600' : 'text-blue-900'}`}>{formatARS(t.neto)}</td>)}
                <td className="p-5 text-right bg-blue-50 text-blue-900 text-lg tracking-tight">{formatARS(saldos.grilla?.totales?.reduce((a: any, t: any) => a + t.neto, 0) || 0)}</td>
              </tr>
              <tr className="bg-slate-900 text-white font-bold border-t-2 border-white/10">
                <td className="p-5 sticky left-0 bg-slate-900 z-10 uppercase tracking-[0.2em] text-[10px] text-slate-400">Saldo Acumulado</td>
                {saldos.grilla?.totales?.map((t: any, i: number) => <td key={i} className="p-5 text-right text-lg tracking-tight text-white">{formatARS(t.saldoCaja)}</td>)}
                <td className="p-5 text-right bg-slate-800 text-slate-300 text-lg tracking-tight">{formatARS(saldos.grilla?.totales?.[11]?.saldoCaja || 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
