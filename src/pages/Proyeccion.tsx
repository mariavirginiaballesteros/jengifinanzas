import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, TrendingDown, DollarSign, PieChart, ArrowRight, Calendar, LineChart, AlertTriangle, Info, Edit2, Settings, X, Loader2 } from 'lucide-react';
import { formatARS, parseNotas } from '@/lib/utils';
import { showSuccess, showError } from '@/utils/toast';
import { useCotizacionOficial } from '@/hooks/useCotizacion';

export default function Proyeccion() {
  const queryClient = useQueryClient();
  const [mesSeleccionado, setMesSeleccionado] = useState(() => {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  });

  const [fijosModalOpen, setFijosModalOpen] = useState(false);
  const [fijosInput, setFijosInput] = useState('');
  
  const { data: cotizacionData } = useCotizacionOficial();
  const cotizacion = cotizacionData || 1000;

  const { data: facturas, isLoading: loadingFacturas } = useQuery({
    queryKey: ['proyeccion_facturacion', mesSeleccionado],
    queryFn: async () => {
      const [year, month] = mesSeleccionado.split('-');
      const start = `${year}-${month}-01`;
      const end = new Date(Number(year), Number(month), 0).toISOString().split('T')[0];
      const { data, error } = await supabase.from('facturacion').select(`*, cliente:clientes(nombre)`).gte('mes', start).lte('mes', end);
      if (error) throw error;
      return data;
    }
  });

  const { data: equipo, isLoading: loadingEquipo } = useQuery({
    queryKey: ['proyeccion_equipo'],
    queryFn: async () => {
      const { data, error } = await supabase.from('equipo').select('*').eq('activo', true);
      if (error) throw error;
      return data;
    }
  });

  const { data: clientes, isLoading: loadingClientes } = useQuery({
    queryKey: ['proyeccion_clientes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id, nombre, estado, monto_ars, monto_usd, fecha_inicio, fecha_fin').eq('estado', 'activo');
      if (error) throw error;
      return data;
    }
  });

  const { data: configFijos, isLoading: loadingFijos } = useQuery({
    queryKey: ['configuracion', 'gastos_fijos_estimados'],
    queryFn: async () => {
      const { data, error } = await supabase.from('configuracion').select('id, valor').eq('clave', 'gastos_fijos_estimados').maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    }
  });

  const gastosFijos = Number(configFijos?.valor || 0);

  const saveFijosMutation = useMutation({
    mutationFn: async (val: string) => {
      const payload = { clave: 'gastos_fijos_estimados', valor: val, descripcion: 'Gastos fijos extra para la proyección' };
      if (configFijos?.id) {
        const { error } = await supabase.from('configuracion').update(payload).eq('id', configFijos.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('configuracion').insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuracion', 'gastos_fijos_estimados'] });
      setFijosModalOpen(false);
      showSuccess('Costos fijos actualizados');
    },
    onError: (err: any) => showError(err.message)
  });

  const stats = useMemo(() => {
    if (!facturas || !equipo || !clientes) return { ingresosFacturados: 0, mrrEsperado: 0, egresosEquipo: 0, egresosTotales: 0, gastosFijos: 0, resultado: 0, margen: 0, listadoEquipo: [] };
    const ingresosFacturados = facturas.reduce((acc, f) => acc + Number(f.monto_final || f.monto_base || 0), 0);
    let mrrEsperado = 0;
    clientes.forEach((c: any) => {
      const finString = c.fecha_fin ? c.fecha_fin.substring(0, 7) : '9999-99';
      const inicioString = c.fecha_inicio ? c.fecha_inicio.substring(0, 7) : '0000-00';
      if (finString >= mesSeleccionado && inicioString <= mesSeleccionado) {
        mrrEsperado += Number(c.monto_ars || 0) + (Number(c.monto_usd || 0) * cotizacion);
      }
    });
    const listadoEquipo = equipo.map(miembro => {
      const notasData = parseNotas(miembro.notas);
      let costoProyectos = 0;
      let proyectosAsignados = 0;
      Object.entries(notasData.asignaciones).forEach(([cId, monto]) => {
        const c = clientes.find((cl: any) => cl.id === cId);
        if (c && c.estado === 'activo') {
          const finString = c.fecha_fin ? c.fecha_fin.substring(0, 7) : '9999-99';
          const inicioString = c.fecha_inicio ? c.fecha_inicio.substring(0, 7) : '0000-00';
          if (finString >= mesSeleccionado && inicioString <= mesSeleccionado) {
            costoProyectos += Number(monto);
            proyectosAsignados++;
          }
        }
      });
      const total = Number(miembro.honorario_mensual) + costoProyectos;
      return { ...miembro, total, proyectosAsignados, honorarioProyectos: costoProyectos };
    }).sort((a, b) => b.total - a.total);
    const egresosEquipo = listadoEquipo.reduce((acc, m) => acc + m.total, 0);
    const egresosTotales = egresosEquipo + gastosFijos;
    const resultado = ingresosFacturados - egresosTotales;
    const margen = ingresosFacturados > 0 ? (resultado / ingresosFacturados) * 100 : 0;
    return { ingresosFacturados, mrrEsperado, egresosEquipo, egresosTotales, gastosFijos, resultado, margen, listadoEquipo };
  }, [facturas, equipo, clientes, mesSeleccionado, gastosFijos, cotizacion]);

  const anualStats = useMemo(() => {
    if (!clientes || !equipo) return [];
    const next12Months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() + i);
      return d;
    });
    return next12Months.map((date) => {
      const year = date.getFullYear();
      const month = date.getMonth();
      const mesString = `${year}-${String(month + 1).padStart(2, '0')}`;
      let ingresos = 0;
      let vencimientos: string[] = [];
      const clientesActivosMes = new Set<string>();
      clientes.forEach((c: any) => {
         const finString = c.fecha_fin ? c.fecha_fin.substring(0, 7) : '9999-99';
         const inicioString = c.fecha_inicio ? c.fecha_inicio.substring(0, 7) : '0000-00';
         if (finString >= mesString && inicioString <= mesString) {
            ingresos += Number(c.monto_ars || 0) + (Number(c.monto_usd || 0) * cotizacion);
            clientesActivosMes.add(c.id);
            if (finString === mesString) vencimientos.push(c.nombre);
         }
      });
      let costos = gastosFijos; 
      equipo.forEach((e: any) => {
         costos += Number(e.honorario_mensual || 0);
         const notas = parseNotas(e.notas);
         Object.entries(notas.asignaciones || {}).forEach(([cId, monto]) => {
            if (clientesActivosMes.has(cId)) costos += Number(monto);
         });
      });
      const neto = ingresos - costos;
      const margen = ingresos > 0 ? (neto / ingresos) * 100 : 0;
      const nombreMes = date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
      return { id: mesString, label: `${nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)} ${year}`, ingresos, costos, neto, margen, vencimientos };
    });
  }, [clientes, equipo, gastosFijos, cotizacion]);

  const isLoading = loadingFacturas || loadingEquipo || loadingClientes || loadingFijos;

  return (
    <div className="animate-in fade-in duration-700 pb-20">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Proyección de Rentabilidad</h1>
          <p className="text-slate-500 mt-1 font-medium">Simulador de ingresos vs costos operativos.</p>
        </div>
        <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-sm">
          <Calendar className="text-slate-400 ml-3" size={18} />
          <input type="month" value={mesSeleccionado} onChange={(e) => setMesSeleccionado(e.target.value)} className="border-none outline-none font-bold text-slate-700 bg-transparent px-3 py-2 cursor-pointer text-sm" />
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <div className="bg-white border border-slate-200 p-6 rounded-[2rem] shadow-sm">
          <div className="flex items-center gap-2 text-slate-400 mb-4">
            <TrendingUp size={16} className="text-blue-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Facturación Real</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 tracking-tight">{isLoading ? '...' : formatARS(stats.ingresosFacturados)}</p>
          <p className="text-[10px] text-slate-400 font-medium mt-2 uppercase">MRR Teórico: {formatARS(stats.mrrEsperado)}</p>
        </div>

        <div className="bg-white border border-slate-200 p-6 rounded-[2rem] shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-slate-400">
              <TrendingDown size={16} className="text-rose-500" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Egresos Totales</span>
            </div>
            <button onClick={() => { setFijosInput(gastosFijos.toString()); setFijosModalOpen(true); }} className="p-1.5 hover:bg-slate-50 rounded-lg text-blue-600 transition-colors"><Settings size={14} /></button>
          </div>
          <p className="text-2xl font-bold text-slate-900 tracking-tight">{isLoading ? '...' : formatARS(stats.egresosTotales)}</p>
          <p className="text-[10px] text-slate-400 font-medium mt-2 uppercase">Equipo: {formatARS(stats.egresosEquipo)}</p>
        </div>

        <div className={`p-6 rounded-[2rem] shadow-sm border ${stats.resultado >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
          <div className="flex items-center gap-2 text-slate-400 mb-4">
            <DollarSign size={16} className={stats.resultado >= 0 ? 'text-emerald-600' : 'text-rose-600'} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Resultado Neto</span>
          </div>
          <p className={`text-2xl font-bold tracking-tight ${stats.resultado >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{isLoading ? '...' : formatARS(stats.resultado)}</p>
        </div>

        <div className="bg-slate-900 p-6 rounded-[2rem] shadow-sm">
          <div className="flex items-center gap-2 text-white/40 mb-4">
            <PieChart size={16} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Margen</span>
          </div>
          <p className="text-2xl font-bold text-white tracking-tight">{isLoading ? '...' : `${stats.margen.toFixed(1)}%`}</p>
          <p className="text-[10px] text-white/40 font-medium mt-2 uppercase">Saludable: {">"} 25%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
          <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-900">Desglose de Facturación</h3>
            <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 text-[10px] font-bold uppercase">{facturas?.length || 0} cuotas</span>
          </div>
          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-left">
              <tbody>
                {facturas?.map((row) => (
                  <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-4">
                      <p className="text-sm font-bold text-slate-700">{row.cliente?.nombre || 'Manual'}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Cuota {row.cuota}</p>
                    </td>
                    <td className="px-8 py-4 text-right">
                      <p className="text-sm font-bold text-slate-900">{formatARS(Number(row.monto_final || row.monto_base))}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
          <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-900">Desglose de Equipo</h3>
            <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-600 text-[10px] font-bold uppercase">{stats.listadoEquipo.length} personas</span>
          </div>
          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-left">
              <tbody>
                {stats.listadoEquipo.map((miembro) => (
                  <tr key={miembro.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-4">
                      <p className="text-sm font-bold text-slate-700">{miembro.nombre}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{miembro.proyectosAsignados} proyectos</p>
                    </td>
                    <td className="px-8 py-4 text-right">
                      <p className="text-sm font-bold text-slate-900">{formatARS(miembro.total)}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <section className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
        <div className="px-8 py-6 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">Proyección Anual (MRR Teórico)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-bold uppercase tracking-widest border-b border-slate-100">
                <th className="px-8 py-4">Mes</th>
                <th className="px-8 py-4 text-right">Ingresos (MRR)</th>
                <th className="px-8 py-4 text-right">Costo Total</th>
                <th className="px-8 py-4 text-right">Resultado</th>
                <th className="px-8 py-4 text-center">Margen</th>
              </tr>
            </thead>
            <tbody>
              {anualStats.map((stat) => (
                <tr key={stat.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-8 py-4 font-bold text-slate-700 text-sm">{stat.label}</td>
                  <td className="px-8 py-4 text-right font-bold text-slate-900 text-sm">{formatARS(stat.ingresos)}</td>
                  <td className="px-8 py-4 text-right font-bold text-slate-500 text-sm">{formatARS(stat.costos)}</td>
                  <td className="px-8 py-4 text-right font-bold text-slate-900 text-sm">{formatARS(stat.neto)}</td>
                  <td className="px-8 py-4 text-center">
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${stat.margen < 20 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                      {stat.margen.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {fijosModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md p-10 shadow-2xl animate-in zoom-in-95 border border-white/20">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Costos Fijos</h2>
              <button onClick={() => setFijosModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"><X size={24} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); saveFijosMutation.mutate(fijosInput); }} className="space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Monto Mensual Estimado (ARS)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
                  <input type="number" step="1000" min="0" required autoFocus className="w-full border border-slate-200 rounded-xl p-3.5 pl-8 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-900 text-lg tracking-tight" value={fijosInput} onChange={e => setFijosInput(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-10 pt-8 border-t border-slate-100">
                <button type="button" onClick={() => setFijosModalOpen(false)} className="px-6 py-3.5 text-slate-400 font-bold uppercase tracking-widest text-[10px] hover:bg-slate-50 rounded-xl transition-colors">Cancelar</button>
                <button type="submit" disabled={saveFijosMutation.isPending} className="bg-slate-900 text-white px-8 py-3.5 rounded-xl font-bold uppercase tracking-widest text-[10px] shadow-lg shadow-slate-900/10 active:scale-95 transition-all disabled:opacity-50">
                  {saveFijosMutation.isPending ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
