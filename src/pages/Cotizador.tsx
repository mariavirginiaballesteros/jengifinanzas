import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Calculator, Users, Building, TrendingUp, DollarSign, Plus, Trash2, Copy, Percent, Layers, ShieldCheck, Save, Clock, History, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { formatARS, formatUSD, parseFinancial } from '@/lib/utils';
import { TipAlert } from '@/components/TipAlert';
import { useCotizacionOficial } from '@/hooks/useCotizacion';
import { showSuccess, showError } from '@/utils/toast';

const parseNotas = (notasStr: string | null) => {
  if (!notasStr) return { asignaciones: {} as Record<string, number> };
  try {
    const parsed = JSON.parse(notasStr);
    if (parsed && typeof parsed === 'object' && parsed.asignaciones) return parsed;
  } catch (e) {}
  return { asignaciones: {} };
};

export default function Cotizador() {
  const queryClient = useQueryClient();
  const { data: cotizacionData } = useCotizacionOficial();
  const cotizacion = cotizacionData || 1000;

  const { data: equipo, isLoading: loadingEq } = useQuery({
    queryKey: ['equipo_cotizador'],
    queryFn: async () => {
      const { data, error } = await supabase.from('equipo').select('*').eq('activo', true);
      if (error) throw error;
      return data;
    }
  });

  const { data: clientes, isLoading: loadingCli } = useQuery({
    queryKey: ['clientes_cotizador'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id, estado').eq('estado', 'activo');
      if (error) throw error;
      return data;
    }
  });

  const { data: configRows, isLoading: loadingConf } = useQuery({
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
      let asignacionesSuma = 0;
      Object.entries(notas.asignaciones || {}).forEach(([cId, monto]) => {
        const c = clientes.find(cl => cl.id === cId);
        if (c && c.estado === 'activo') asignacionesSuma += Number(monto);
      });
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
      const payload = { clave: 'historial_cotizaciones', valor: JSON.stringify(nuevoHistorial), descripcion: 'Historial de cotizaciones guardadas' };
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
      `*(Equivalente a ${formatUSD(costos.precioFinal / cotizacion)} USD)*\n\n` +
      `_Esta propuesta ha sido calculada en base a la asignación de recursos dedicados, costos operativos y estructura del equipo._`;
    navigator.clipboard.writeText(text);
    showSuccess("Copiado al portapapeles");
  };

  const isLoading = loadingEq || loadingCli || loadingConf;
  if (isLoading) return <div className="flex justify-center py-32"><Loader2 className="w-12 h-12 text-jengibre-primary animate-spin" /></div>;

  return (
    <div className="animate-in fade-in duration-700 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-5xl font-black tracking-tighter text-jengibre-dark">Cotizador</h1>
          <p className="text-gray-500 mt-2 font-bold uppercase tracking-widest text-[10px]">Cálculo inteligente de presupuestos y rentabilidad.</p>
        </div>
        <button onClick={guardarCotizacion} disabled={saveHistorialMutation.isPending} className="bg-jengibre-primary hover:bg-[#a64120] text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-3 transition-all shadow-xl shadow-jengibre-primary/20 active:scale-95 disabled:opacity-50">
          <Save size={18} /> Guardar Presupuesto
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-7 space-y-10">
          <section className="bg-white border border-jengibre-border rounded-[2.5rem] p-8 shadow-sm">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400 mb-8 flex items-center gap-3"><Building size={18} className="text-blue-600" /> Información del Proyecto</h2>
            <input type="text" placeholder="Nombre del proyecto o cliente..." className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-5 px-8 outline-none focus:ring-4 focus:ring-jengibre-primary/10 transition-all text-2xl font-black tracking-tighter text-jengibre-dark placeholder:text-gray-300" value={nombre} onChange={e => setNombre(e.target.value)} />
          </section>

          <section className="bg-white border border-jengibre-border rounded-[2.5rem] p-8 shadow-sm">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400 flex items-center gap-3"><Users size={18} className="text-indigo-600" /> Costos Directos (Equipo)</h2>
              <button onClick={addMiembro} className="text-[10px] font-black uppercase tracking-widest text-jengibre-primary hover:underline">+ Agregar Persona</button>
            </div>
            <div className="space-y-4">
              {equipoAsignado.map((m) => (
                <div key={m.id} className="flex flex-col sm:flex-row gap-4 bg-gray-50/50 border border-gray-100 p-6 rounded-[1.5rem] group hover:bg-white hover:border-jengibre-primary transition-all shadow-sm">
                  <div className="flex-1">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Miembro</label>
                    <select className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm font-black text-gray-700 outline-none focus:ring-4 focus:ring-jengibre-primary/10" value={m.miembro_id} onChange={e => updateMiembro(m.id, 'miembro_id', e.target.value)}>
                      <option value="">Seleccionar...</option>
                      {equipo?.map(e => <option key={e.id} value={e.id}>{e.nombre} ({e.rol})</option>)}
                    </select>
                  </div>
                  <div className="w-full sm:w-28">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Horas / Mes</label>
                    <input type="number" className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm font-mono font-black text-blue-700 outline-none focus:ring-4 focus:ring-jengibre-primary/10" value={m.horas} onChange={e => updateMiembro(m.id, 'horas', e.target.value)} />
                  </div>
                  <div className="w-full sm:w-36">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Costo Hora</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-black text-xs">$</span>
                      <input type="number" className="w-full bg-white border border-gray-200 rounded-xl p-3 pl-6 text-sm font-mono font-black text-gray-700 outline-none focus:ring-4 focus:ring-jengibre-primary/10" value={m.costo_hora} onChange={e => updateMiembro(m.id, 'costo_hora', e.target.value)} />
                    </div>
                  </div>
                  <button onClick={() => removeMiembro(m.id)} className="self-end sm:self-center p-3 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><Trash2 size={20} /></button>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white border border-jengibre-border rounded-[2.5rem] p-8 shadow-sm">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400 mb-8 flex items-center gap-3"><Layers size={18} className="text-amber-500" /> Rentabilidad y Riesgo</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Margen (%)</label>
                <div className="relative group">
                  <input type="number" className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 pr-10 outline-none font-mono text-2xl font-black tracking-tighter focus:ring-4 focus:ring-jengibre-primary/10 text-jengibre-dark" value={margen} onChange={e => setMargen(Number(e.target.value))} />
                  <Percent size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-jengibre-primary transition-colors" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Complejidad</label>
                <select className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 outline-none font-black text-jengibre-dark focus:ring-4 focus:ring-jengibre-primary/10" value={complejidad} onChange={e => setComplejidad(Number(e.target.value))}>
                  <option value={1}>Normal (1x)</option>
                  <option value={1.2}>Alta (1.2x)</option>
                  <option value={1.5}>Muy Alta (1.5x)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">IIBB (%)</label>
                <div className="relative group">
                  <input type="number" className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 pr-10 outline-none font-mono text-2xl font-black tracking-tighter focus:ring-4 focus:ring-jengibre-primary/10 text-jengibre-dark" value={iibb} onChange={e => setIibb(Number(e.target.value))} />
                  <Percent size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-jengibre-primary transition-colors" />
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="lg:col-span-5 space-y-10">
          <div className="sticky top-10 space-y-10">
            <section className="bg-jengibre-dark text-white rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden border border-white/5">
              <div className="absolute -right-10 -top-10 p-4 opacity-10 rotate-12"><TrendingUp size={200} /></div>
              <div className="relative z-10 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-jengibre-secondary mb-4">Precio Final Sugerido</p>
                <h2 className="text-6xl font-mono font-black tracking-tighter mb-6">{formatARS(costos.precioFinal)}</h2>
                <div className="inline-flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl px-6 py-3">
                  <DollarSign size={20} className="text-blue-400" />
                  <span className="text-xl font-mono font-black tracking-tighter text-blue-400">{formatUSD(costos.precioFinal / cotizacion)}</span>
                </div>
                <button onClick={copyToClipboard} className="w-full mt-10 bg-jengibre-primary hover:bg-[#a64120] text-white py-5 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 transition-all shadow-xl shadow-jengibre-primary/20 active:scale-95">
                  <Copy size={18} /> Copiar Propuesta
                </button>
              </div>
            </section>

            <section className="bg-white border border-jengibre-border rounded-[2.5rem] p-8 shadow-sm">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-8">Desglose de Costos</h3>
              <div className="space-y-6">
                <div className="flex justify-between items-start group">
                  <div>
                    <p className="font-black text-gray-700 text-sm uppercase tracking-tight">Estructura Prorrateada</p>
                    <p className="text-[10px] text-gray-400 font-bold mt-1 uppercase tracking-tighter">{formatARS(costos.estructuraTotal)} / {costos.clientesActivos} clientes</p>
                  </div>
                  <span className="font-mono font-black text-lg tracking-tighter text-jengibre-dark">{formatARS(costos.prorrateoEstructura)}</span>
                </div>
                <div className="flex justify-between items-start group">
                  <div>
                    <p className="font-black text-gray-700 text-sm uppercase tracking-tight">Costo de Equipo</p>
                    <p className="text-[10px] text-gray-400 font-bold mt-1 uppercase tracking-tighter">Total horas × valor hora</p>
                  </div>
                  <span className="font-mono font-black text-lg tracking-tighter text-jengibre-dark">{formatARS(costos.costoEquipo)}</span>
                </div>
                {complejidad > 1 && (
                  <div className="flex justify-between items-center bg-amber-50 p-4 rounded-2xl border border-amber-100">
                    <p className="font-black text-amber-700 text-xs uppercase tracking-widest">Adicional Complejidad</p>
                    <span className="font-mono font-black text-lg tracking-tighter text-amber-700">+{formatARS(costos.subtotalComplejidad - costos.subtotalBase)}</span>
                  </div>
                )}
                <div className="pt-6 border-t border-dashed border-gray-200 flex justify-between items-center">
                  <p className="font-black text-gray-400 text-[10px] uppercase tracking-widest">Costo Base Operativo</p>
                  <span className="font-mono font-black text-xl tracking-tighter text-gray-400">{formatARS(costos.subtotalComplejidad)}</span>
                </div>
                <div className="flex justify-between items-center bg-emerald-50 p-5 rounded-2xl border border-emerald-100">
                  <p className="font-black text-emerald-700 text-sm uppercase tracking-tight">Ganancia Neta ({margen}%)</p>
                  <span className="font-mono font-black text-2xl tracking-tighter text-emerald-700">+{formatARS(costos.gananciaNeta)}</span>
                </div>
                <div className="flex justify-between items-center px-5">
                  <p className="font-black text-red-400 text-xs uppercase tracking-widest">Impuestos (IIBB {iibb}%)</p>
                  <span className="font-mono font-black text-lg tracking-tighter text-red-400">+{formatARS(costos.montoIibb)}</span>
                </div>
              </div>
            </section>

            <section className="bg-white border border-jengibre-border rounded-[2.5rem] p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-8">
                <History size={18} className="text-gray-400" />
                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Historial Reciente</h3>
              </div>
              <div className="space-y-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                {historialCotizaciones.length === 0 ? (
                  <p className="text-center py-8 text-gray-300 text-xs font-bold uppercase tracking-widest">No hay cotizaciones</p>
                ) : (
                  historialCotizaciones.map((coti: any) => (
                    <div key={coti.id} className="p-5 bg-gray-50/50 border border-gray-100 rounded-2xl flex items-center justify-between group hover:bg-white hover:border-jengibre-primary transition-all cursor-pointer shadow-sm" onClick={() => cargarCotizacion(coti)}>
                      <div className="min-w-0">
                        <p className="font-black text-gray-900 text-sm uppercase tracking-tight truncate">{coti.nombre}</p>
                        <p className="text-[9px] text-gray-400 font-bold mt-1 uppercase tracking-widest">{new Date(coti.fecha).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-mono font-black text-sm tracking-tighter text-jengibre-primary">{formatARS(coti.precioFinal)}</span>
                        <button onClick={(e) => { e.stopPropagation(); eliminarCotizacion(coti.id); }} className="p-2 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
