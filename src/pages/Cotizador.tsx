import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Calculator, Users, Building, TrendingUp, DollarSign, Plus, Trash2, Copy, Percent, Layers, ShieldCheck, Save, Clock, History } from 'lucide-react';
import { formatARS, formatUSD } from '@/lib/utils';
import { TipAlert } from '@/components/TipAlert';
import { useCotizacionOficial } from '@/hooks/useCotizacion';
import { showSuccess, showError } from '@/utils/toast';

// Helper para leer las asignaciones de proyectos del equipo
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

  // --- DATOS BASE ---
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

  // --- ESTADOS DEL FORMULARIO ---
  const [nombre, setNombre] = useState('');
  const [equipoAsignado, setEquipoAsignado] = useState<any[]>([{ id: crypto.randomUUID(), miembro_id: '', horas: 10, costo_hora: 0 }]);
  const [margen, setMargen] = useState<number>(30);
  const [complejidad, setComplejidad] = useState<number>(1);
  const [iibb, setIibb] = useState<number>(3);

  // --- CÁLCULO DE VALOR HORA REAL DEL EQUIPO ---
  const equipoRates = useMemo(() => {
    if (!equipo || !clientes) return {};
    const rates: Record<string, number> = {};
    
    equipo.forEach(e => {
      const notas = parseNotas(e.notas);
      let asignacionesSuma = 0;
      
      // Sumamos lo que cobra por proyectos activos
      Object.entries(notas.asignaciones || {}).forEach(([cId, monto]) => {
        const c = clientes.find(cl => cl.id === cId);
        if (c && c.estado === 'activo') asignacionesSuma += Number(monto);
      });
      
      const sueldoTotal = Number(e.honorario_mensual || 0) + asignacionesSuma;
      // Asumimos 160hs mensuales laborables (40hs semanales)
      rates[e.id] = Math.round(sueldoTotal / 160); 
    });
    return rates;
  }, [equipo, clientes]);

  // --- HISTORIAL DE COTIZACIONES ---
  const historialRecord = configRows?.find(r => r.clave === 'historial_cotizaciones');
  const historialCotizaciones = useMemo(() => {
    if (!historialRecord?.valor) return [];
    try { return JSON.parse(historialRecord.valor); } catch (e) { return []; }
  }, [historialRecord]);

  const saveHistorialMutation = useMutation({
    mutationFn: async (nuevoHistorial: any[]) => {
      const payload = { 
        clave: 'historial_cotizaciones', 
        valor: JSON.stringify(nuevoHistorial), 
        descripcion: 'Historial de cotizaciones guardadas' 
      };
      
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
      showSuccess('Cotización guardada en el historial');
    },
    onError: (err: any) => showError(err.message)
  });

  // --- MANEJO DE EQUIPO ---
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
        // Si cambiamos a la persona, traemos su costo hora real calculado
        if (field === 'miembro_id') {
          updated.costo_hora = equipoRates[value] || 0;
        }
        return updated;
      }
      return m;
    }));
  };

  // --- CÁLCULOS FINANCIEROS NUCLEARES ---
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

  // --- ACCIONES SECUNDARIAS ---
  const guardarCotizacion = () => {
    if (!nombre.trim()) return showError("Ingresá un nombre para el proyecto antes de guardar");
    
    const nuevaCoti = {
      id: crypto.randomUUID(),
      fecha: new Date().toISOString(),
      nombre,
      equipoAsignado,
      margen,
      complejidad,
      iibb,
      precioFinal: costos.precioFinal
    };

    const nuevoHistorial = [nuevaCoti, ...historialCotizaciones].slice(0, 50); // Guardamos las últimas 50
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
    if (!confirm('¿Eliminar esta cotización del historial?')) return;
    const nuevoHistorial = historialCotizaciones.filter((c: any) => c.id !== id);
    saveHistorialMutation.mutate(nuevoHistorial);
  };

  const copyToClipboard = () => {
    const text = `*Propuesta Comercial: ${nombre || 'Nuevo Proyecto'}*\n\n` +
      `*Inversión Mensual Sugerida:* ${formatARS(costos.precioFinal)} + IVA\n` +
      `*(Equivalente a ${formatUSD(costos.precioFinal / cotizacion)} USD)*\n\n` +
      `_Esta propuesta ha sido calculada en base a la asignación de recursos dedicados, costos operativos y estructura del equipo._`;
    
    navigator.clipboard.writeText(text);
    showSuccess("Resumen copiado al portapapeles");
  };

  const isLoading = loadingEq || loadingCli || loadingConf;
  if (isLoading) return <div className="p-12 text-center text-gray-500">Cargando datos para el cotizador...</div>;

  return (
    <div className="animate-in fade-in duration-500 pb-12 w-full max-w-7xl mx-auto">
      <header className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-jengibre-dark flex items-center gap-3">
              <Calculator className="text-jengibre-primary" size={32} />
              Cotizador Inteligente
            </h1>
            <p className="text-gray-600 mt-1">Calculá el precio exacto a cobrar cubriendo tus costos fijos, sueldos y asegurando tu margen de ganancia.</p>
          </div>
          <button 
            onClick={guardarCotizacion}
            disabled={saveHistorialMutation.isPending}
            className="bg-jengibre-primary hover:bg-[#a64120] text-white px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all shadow-sm disabled:opacity-50"
          >
            <Save size={20} /> Guardar Presupuesto
          </button>
        </div>
      </header>

      <TipAlert id="cotizador_valor_hora" title="💡 Cálculo Automático de Valor Hora">
        Al seleccionar a alguien del equipo, el sistema calcula su valor hora dividiendo sus <strong>Ingresos Totales (Sueldo Base + Proyectos Activos)</strong> por 160hs mensuales.
      </TipAlert>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* COLUMNA IZQUIERDA: CONFIGURACIÓN */}
        <div className="lg:col-span-7 space-y-6">
          
          <div className="bg-white p-6 rounded-2xl border border-jengibre-border shadow-sm">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Building size={18} className="text-blue-600" /> Información del Prospecto</h2>
            <input 
              type="text" placeholder="Nombre del proyecto o cliente..." 
              className="w-full border border-gray-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-jengibre-primary font-medium text-lg"
              value={nombre} onChange={e => setNombre(e.target.value)}
            />
          </div>

          <div className="bg-white p-6 rounded-2xl border border-jengibre-border shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Users size={18} className="text-indigo-600" /> Costos Directos (Equipo)</h2>
              <button onClick={addMiembro} className="text-sm font-bold text-jengibre-primary hover:text-[#a64120] flex items-center gap-1">+ Agregar persona</button>
            </div>
            
            <div className="space-y-3">
              {equipoAsignado.map((m) => (
                <div key={m.id} className="flex flex-col sm:flex-row gap-3 bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Miembro</label>
                    <select 
                      className="w-full border border-gray-300 rounded-md p-2 text-sm outline-none bg-white font-medium"
                      value={m.miembro_id} onChange={e => updateMiembro(m.id, 'miembro_id', e.target.value)}
                    >
                      <option value="">-- Seleccionar --</option>
                      {equipo?.map(e => <option key={e.id} value={e.id}>{e.nombre} ({e.rol})</option>)}
                    </select>
                  </div>
                  <div className="w-full sm:w-24 shrink-0">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Hs / Mes</label>
                    <div className="relative">
                      <input 
                        type="number" min="0" className="w-full border border-gray-300 rounded-md p-2 pl-7 text-sm outline-none font-bold text-blue-800 bg-blue-50/30 focus:border-blue-400"
                        value={m.horas} onChange={e => updateMiembro(m.id, 'horas', e.target.value)}
                      />
                      <Clock size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-blue-400" />
                    </div>
                  </div>
                  <div className="w-full sm:w-32 shrink-0">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Costo x Hora ($)</label>
                    <input 
                      type="number" min="0" className="w-full border border-gray-300 rounded-md p-2 text-sm outline-none font-mono"
                      value={m.costo_hora} onChange={e => updateMiembro(m.id, 'costo_hora', e.target.value)}
                    />
                  </div>
                  <button onClick={() => removeMiembro(m.id)} className="self-end sm:self-auto sm:mt-5 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors">
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
              {equipoAsignado.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No hay equipo asignado. Agregá al menos una persona para estimar el costo directo.</p>}
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-jengibre-border shadow-sm">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Layers size={18} className="text-amber-600" /> Modificadores de Riesgo y Rentabilidad</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1 flex items-center gap-1"><TrendingUp size={14}/> Margen (%)</label>
                <div className="relative">
                  <input 
                    type="number" min="0" max="99" 
                    className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-jengibre-primary font-bold text-jengibre-dark text-lg"
                    value={margen} onChange={e => setMargen(Number(e.target.value))}
                  />
                  <Percent size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Ganancia neta deseada.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1 flex items-center gap-1"><Layers size={14}/> Complejidad</label>
                <select 
                  className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-jengibre-primary font-medium"
                  value={complejidad} onChange={e => setComplejidad(Number(e.target.value))}
                >
                  <option value={1}>Normal (1x)</option>
                  <option value={1.2}>Alta (1.2x)</option>
                  <option value={1.5}>Muy Alta (1.5x)</option>
                </select>
                <p className="text-[10px] text-gray-400 mt-1">Multiplicador de costos.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1 flex items-center gap-1"><ShieldCheck size={14}/> IIBB (%)</label>
                <div className="relative">
                  <input 
                    type="number" min="0" step="0.1" 
                    className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-jengibre-primary"
                    value={iibb} onChange={e => setIibb(Number(e.target.value))}
                  />
                  <Percent size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Ingresos Brutos.</p>
              </div>
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA: RESULTADOS E HISTORIAL */}
        <div className="lg:col-span-5 space-y-6">
          <div className="sticky top-6 space-y-6">
            
            {/* CARTA DE RESULTADO */}
            <div className="bg-[#2B317A] text-white p-8 rounded-3xl shadow-xl relative overflow-hidden bg-cover bg-center" style={{ backgroundImage: "url('/fondo.jpg')" }}>
              <div className="absolute inset-0 bg-[#2B317A]/90 z-0"></div>
              <div className="relative z-10 text-center">
                <p className="text-jengibre-secondary font-bold uppercase tracking-widest text-xs mb-2">Precio Final Sugerido</p>
                <h2 className="text-5xl font-mono font-bold mb-2">{formatARS(costos.precioFinal)}</h2>
                <div className="inline-block bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5 text-sm font-medium">
                  USD: <span className="font-bold">{formatUSD(costos.precioFinal / cotizacion)}</span>
                </div>
                
                <button 
                  onClick={copyToClipboard}
                  className="w-full mt-6 bg-jengibre-primary hover:bg-[#a64120] text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-lg"
                >
                  <Copy size={18} /> Copiar Propuesta Comercial
                </button>
              </div>
            </div>

            {/* DESGLOSE */}
            <div className="bg-white border border-jengibre-border rounded-2xl shadow-sm overflow-hidden">
              <div className="bg-gray-50 px-5 py-3 border-b border-gray-100">
                <h3 className="font-display font-bold text-gray-800">Desglose de Costos</h3>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-gray-700 text-sm">Prorrateo de Estructura</p>
                    <p className="text-[10px] text-gray-400">{formatARS(costos.estructuraTotal)} dividido en {costos.clientesActivos} clientes</p>
                  </div>
                  <span className="font-mono text-gray-900 font-medium">{formatARS(costos.prorrateoEstructura)}</span>
                </div>

                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-gray-700 text-sm">Costo de Equipo (Horas)</p>
                    <p className="text-[10px] text-gray-400">Total horas × valor hora asignado</p>
                  </div>
                  <span className="font-mono text-gray-900 font-medium">{formatARS(costos.costoEquipo)}</span>
                </div>

                {complejidad > 1 && (
                  <div className="flex justify-between items-center text-amber-600 bg-amber-50 p-2 rounded-lg -mx-2">
                    <p className="font-bold text-sm">Adicional por Complejidad</p>
                    <span className="font-mono font-bold">+{formatARS(costos.subtotalComplejidad - costos.subtotalBase)}</span>
                  </div>
                )}

                <div className="border-t border-dashed border-gray-200 pt-3 flex justify-between items-center">
                  <p className="font-bold text-gray-400 text-xs uppercase">Costo Base Operativo</p>
                  <span className="font-mono text-gray-500">{formatARS(costos.subtotalComplejidad)}</span>
                </div>

                <div className="flex justify-between items-center bg-green-50 text-green-800 p-2 rounded-lg -mx-2">
                  <p className="font-bold text-sm">Rentabilidad / Ganancia ({margen}%)</p>
                  <span className="font-mono font-bold">+{formatARS(costos.gananciaNeta)}</span>
                </div>

                <div className="flex justify-between items-center text-red-600">
                  <p className="font-bold text-sm">Impuestos (IIBB {iibb}%)</p>
                  <span className="font-mono font-medium">+{formatARS(costos.montoIibb)}</span>
                </div>
              </div>
            </div>

            {/* HISTORIAL */}
            <div className="bg-white border border-jengibre-border rounded-2xl shadow-sm overflow-hidden">
              <div className="bg-gray-50 px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                <History size={18} className="text-gray-500" />
                <h3 className="font-display font-bold text-gray-800">Historial de Cotizaciones</h3>
              </div>
              <div className="p-0 max-h-60 overflow-y-auto custom-scrollbar">
                {historialCotizaciones.length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-400">No hay cotizaciones guardadas.</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {historialCotizaciones.map((coti: any) => (
                      <div key={coti.id} className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between group">
                        <div 
                          className="flex-1 cursor-pointer" 
                          onClick={() => cargarCotizacion(coti)}
                        >
                          <p className="font-bold text-gray-800 text-sm truncate max-w-[200px]">{coti.nombre}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-gray-400">{new Date(coti.fecha).toLocaleDateString()}</span>
                            <span className="text-[10px] font-mono font-bold text-jengibre-primary bg-jengibre-cream px-1.5 py-0.5 rounded">
                              {formatARS(coti.precioFinal)}
                            </span>
                          </div>
                        </div>
                        <button 
                          onClick={() => eliminarCotizacion(coti.id)}
                          className="p-2 text-gray-400 hover:text-red-500 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}