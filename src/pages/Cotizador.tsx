import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Calculator, Users, Building, TrendingUp, DollarSign, Plus, Trash2, Copy, Percent, Layers, Save, History, Loader2 } from 'lucide-react';
import { formatARS, formatUSD, parseFinancial, parseNotas } from '@/lib/utils';
import { useCotizacionOficial } from '@/hooks/useCotizacion';
import { showSuccess, showError } from '@/utils/toast';

export default function Cotizador() {
  const queryClient = useQueryClient();
  const { data: cotizacionData } = useCotizacionOficial();
  const cotizacion = cotizacionData || 1000;

  const { data: equipo } = useQuery({
    queryKey: ['equipo_cotizador'],
    queryFn: async () => {
      const { data, error } = await supabase.from('equipo').select('*').eq('activo', true);
      if (error) throw error;
      return data;
    }
  });

  const { data: clientes } = useQuery({
    queryKey: ['clientes_cotizador'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id, estado').eq('estado', 'activo');
      if (error) throw error;
      return data;
    }
  });

  const { data: configRows } = useQuery({
    queryKey: ['configuracion_cotizador'],
    queryFn: async () => {
      const { data, error } = await supabase.from('configuracion').select('*').in('clave', ['gastos_fijos_estimados', 'costo_direccion_mensual', 'historial_cotizaciones']);
      if (error) throw error;
      return data;
    }
  });

  const [nombre, setNombre] = useState('');
  const [equipoAsignado, setEquipoAsignado] = useState<any[]>([{ id: crypto.randomUUID(), miembro_id: '', horas: 10, costo_hora: 0 }]);
  const [margen, setMargen] = useState<number>(30);
  const [complejidad, setComplejidad] = useState<number>(1);
  const [iibb, setIibb] = useState<number>(3);

  const equipoRates = useMemo(() => {
    if (!equipo || !clientes) return {};
    const rates: Record<string, number> = {};
    equipo.forEach(e => {
      const notas = parseNotas(e.notas);
      const asignacionesSuma = (Object.values(notas.asignaciones || {}) as number[]).reduce((a: number, b: number) => a + Number(b || 0), 0);
      const sueldoTotal = Number(e.honorario_mensual || 0) + asignacionesSuma;
      rates[e.id] = Math.round(sueldoTotal / 160); 
    });
    return rates;
  }, [equipo, clientes]);

  const historialRecord = configRows?.find(r => r.clave === 'historial_cotizaciones');
  const historialCotizaciones = useMemo(() => {
    if (!historialRecord?.valor) return [];
    try { return JSON.parse(historialRecord.valor); } catch (e) { return []; }
  }, [historialRecord]);

  const saveHistorialMutation = useMutation({
    mutationFn: async (nuevoHistorial: any[]) => {
      const payload = { clave: 'historial_cotizaciones', valor: JSON.stringify(nuevoHistorial), descripcion: 'Historial de cotizaciones' };
      if (historialRecord?.id) {
        const { error } = await supabase.from('configuracion').update(payload).eq('id', historialRecord.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('configuracion').insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuracion_cotizador'] });
      showSuccess('Cotización guardada');
    },
    onError: (err: any) => showError(err.message)
  });

  const addMiembro = () => {
    setEquipoAsignado([...equipoAsignado, { id: crypto.randomUUID(), miembro_id: '', horas: 10, costo_hora: 0 }]);
  };

  const removeMiembro = (id: string) => {
    setEquipoAsignado(equipoAsignado.filter(m => m.id !== id));
  };

  const updateMiembro = (id: string, field: string, value: any) => {
    setEquipoAsignado(prev => prev.map(m => {
      if (m.id === id) {
        const updated = { ...m, [field]: value };
        if (field === 'miembro_id') updated.costo_hora = equipoRates[value] || 0;
        return updated;
      }
      return m;
    }));
  };

  const costos = useMemo(() => {
    let gastosFijos = 0;
    let costoDir = 0;
    configRows?.forEach(r => {
      if (r.clave === 'gastos_fijos_estimados') gastosFijos = Number(r.valor);
      if (r.clave === 'costo_direccion_mensual') costoDir = Number(r.valor);
    });
    const estructuraTotal = gastosFijos + costoDir;
    const clientesActivos = (clientes?.length || 0) + 1; 
    const prorrateoEstructura = clientesActivos > 0 ? (estructuraTotal / clientesActivos) : estructuraTotal;
    const costoEquipo = equipoAsignado.reduce((acc, m) => acc + (Number(m.horas) * Number(m.costo_hora)), 0);
    const subtotalBase = prorrateoEstructura + costoEquipo;
    const subtotalComplejidad = subtotalBase * complejidad;
    const margenDecimal = Math.min(Math.max(margen, 0), 99) / 100;
    const precioSinImpuestos = subtotalComplejidad / (1 - margenDecimal);
    const gananciaNeta = precioSinImpuestos - subtotalComplejidad;
    const iibbDecimal = Math.min(Math.max(iibb, 0), 99) / 100;
    const precioFinal = precioSinImpuestos / (1 - iibbDecimal);
    const montoIibb = precioFinal - precioSinImpuestos;
    return { estructuraTotal, clientesActivos, prorrateoEstructura, costoEquipo, subtotalBase, subtotalComplejidad, precioSinImpuestos, gananciaNeta, precioFinal, montoIibb };
  }, [equipoAsignado, clientes, configRows, margen, complejidad, iibb]);

  const guardarCotizacion = () => {
    if (!nombre.trim()) return showError("Ingresá un nombre para el proyecto");
    const nuevaCoti = { id: crypto.randomUUID(), fecha: new Date().toISOString(), nombre, equipoAsignado, margen, complejidad, iibb, precioFinal: costos.precioFinal };
    const nuevoHistorial = [nuevaCoti, ...historialCotizaciones].slice(0, 50);
    saveHistorialMutation.mutate(nuevoHistorial);
  };

  const cargarCotizacion = (coti: any) => {
    setNombre(coti.nombre);
    setEquipoAsignado(coti.equipoAsignado || []);
    setMargen(coti.margen || 30);
    setComplejidad(coti.complejidad || 1);
    setIibb(coti.iibb || 3);
    showSuccess("Cotización cargada");
  };

  const eliminarCotizacion = (id: string) => {
    if (!confirm('¿Eliminar esta cotización?')) return;
    const nuevoHistorial = historialCotizaciones.filter((c: any) => c.id !== id);
    saveHistorialMutation.mutate(nuevoHistorial);
  };

  const copyToClipboard = () => {
    const text = `*Propuesta Comercial: ${nombre || 'Nuevo Proyecto'}*\n\n` +
      `*Inversión Mensual Sugerida:* ${formatARS(costos.precioFinal)}\n` +
      `*(Equivalente a ${formatUSD(costos.precioFinal / cotizacion)} USD)*`;
    navigator.clipboard.writeText(text);
    showSuccess("Copiado al portapapeles");
  };

  return (
    <div className="animate-in fade-in duration-700 pb-20">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Cotizador</h1>
          <p className="text-slate-500 mt-1 font-medium">Cálculo inteligente de presupuestos y rentabilidad.</p>
        </div>
        <button onClick={guardarCotizacion} disabled={saveHistorialMutation.isPending} className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-4 rounded-2xl font-bold text-sm flex items-center gap-3 transition-all shadow-lg shadow-slate-900/10 active:scale-95 disabled:opacity-50">
          <Save size={18} /> Guardar Presupuesto
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-7 space-y-10">
          <section className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-6">Información del Proyecto</h2>
            <input type="text" placeholder="Nombre del proyecto o cliente..." className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-slate-200 transition-all text-xl font-bold text-slate-900 placeholder:text-slate-300" value={nombre} onChange={e => setNombre(e.target.value)} />
          </section>

          <section className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Costos Directos (Equipo)</h2>
              <button onClick={addMiembro} className="text-[10px] font-bold uppercase tracking-widest text-blue-600 hover:underline">+ Agregar Persona</button>
            </div>
            <div className="space-y-4">
              {equipoAsignado.map((m) => (
                <div key={m.id} className="flex flex-col sm:flex-row gap-4 bg-slate-50/50 border border-slate-100 p-5 rounded-2xl group hover:bg-white hover:border-slate-200 transition-all">
                  <div className="flex-1">
                    <select className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-100" value={m.miembro_id} onChange={e => updateMiembro(m.id, 'miembro_id', e.target.value)}>
                      <option value="">Seleccionar miembro...</option>
                      {equipo?.map(e => <option key={e.id} value={e.id}>{e.nombre} ({e.rol})</option>)}
                    </select>
                  </div>
                  <div className="w-full sm:w-24">
                    <input type="number" placeholder="Horas" className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-100" value={m.horas} onChange={e => updateMiembro(m.id, 'horas', e.target.value)} />
                  </div>
                  <div className="w-full sm:w-32">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</span>
                      <input type="number" placeholder="Costo" className="w-full bg-white border border-slate-200 rounded-xl p-3 pl-6 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-100" value={m.costo_hora} onChange={e => updateMiembro(m.id, 'costo_hora', e.target.value)} />
                    </div>
                  </div>
                  <button onClick={() => removeMiembro(m.id)} className="p-3 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={18} /></button>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-6">Rentabilidad y Riesgo</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Margen (%)</label>
                <input type="number" className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3.5 outline-none font-bold text-slate-900 text-lg tracking-tight" value={margen} onChange={e => setMargen(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Complejidad</label>
                <select className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3.5 outline-none font-bold text-slate-900 text-sm bg-white" value={complejidad} onChange={e => setComplejidad(Number(e.target.value))}>
                  <option value={1}>Normal (1x)</option>
                  <option value={1.2}>Alta (1.2x)</option>
                  <option value={1.5}>Muy Alta (1.5x)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">IIBB (%)</label>
                <input type="number" className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3.5 outline-none font-bold text-slate-900 text-lg tracking-tight" value={iibb} onChange={e => setIibb(Number(e.target.value))} />
              </div>
            </div>
          </section>
        </div>

        <div className="lg:col-span-5 space-y-10">
          <div className="sticky top-10 space-y-10">
            <section className="bg-slate-900 text-white rounded-[2.5rem] p-10 shadow-xl relative overflow-hidden border border-white/5">
              <div className="relative z-10 text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-4">Precio Final Sugerido</p>
                <h2 className="text-5xl font-bold tracking-tight mb-6">{formatARS(costos.precioFinal)}</h2>
                <div className="inline-flex items-center gap-2 bg-white/10 rounded-xl px-4 py-2">
                  <span className="text-lg font-bold tracking-tight text-blue-400">{formatUSD(costos.precioFinal / cotizacion)}</span>
                  <span className="text-[10px] font-bold text-white/20 uppercase">USD EQ.</span>
                </div>
                <button onClick={copyToClipboard} className="w-full mt-10 bg-white text-slate-900 py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-95">
                  <Copy size={18} /> Copiar Propuesta
                </button>
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-6">Desglose de Costos</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Estructura</span>
                  <span className="text-sm font-bold text-slate-900">{formatARS(costos.prorrateoEstructura)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Equipo</span>
                  <span className="text-sm font-bold text-slate-900">{formatARS(costos.costoEquipo)}</span>
                </div>
                <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                  <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Ganancia ({margen}%)</span>
                  <span className="text-sm font-bold text-emerald-600">{formatARS(costos.gananciaNeta)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-rose-500 uppercase tracking-wider">Impuestos</span>
                  <span className="text-sm font-bold text-rose-500">{formatARS(costos.montoIibb)}</span>
                </div>
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-6">Historial</h3>
              <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                {historialCotizaciones.map((coti: any) => (
                  <div key={coti.id} className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between group hover:bg-white hover:border-slate-200 transition-all cursor-pointer" onClick={() => cargarCotizacion(coti)}>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 text-xs truncate">{coti.nombre}</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">{new Date(coti.fecha).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-xs text-slate-900">{formatARS(coti.precioFinal)}</span>
                      <button onClick={(e) => { e.stopPropagation(); eliminarCotizacion(coti.id); }} className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
