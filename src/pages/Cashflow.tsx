import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TipAlert } from '@/components/TipAlert';
import { Wallet, ArrowUpRight, ArrowDownRight, Landmark, TrendingUp, Calendar, Info, ChevronDown, ChevronRight, Edit3, Save, X, AlertCircle, Sparkles, Target } from 'lucide-react';
import { formatARS } from '@/lib/utils';
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

export default function Cashflow() {
  const queryClient = useQueryClient();
  const { data: cotizacionData } = useCotizacionOficial();
  const cotizacion = cotizacionData || 1000;

  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [editingMonth, setEditingMonth] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ income: '0', expense: '0' });

  // --- DATA FETCHING ---
  const { data: movimientos } = useQuery({
    queryKey: ['movimientos_cashflow'],
    queryFn: async () => {
      const { data, error } = await supabase.from('movimientos').select('*');
      if (error) throw error;
      return data || [];
    }
  });

  const { data: configSaldos } = useQuery({
    queryKey: ['configuracion', 'saldos_iniciales'],
    queryFn: async () => {
      const { data } = await supabase.from('configuracion').select('valor').eq('clave', 'saldos_iniciales').maybeSingle();
      return data?.valor ? JSON.parse(data.valor) : {};
    }
  });

  const { data: configAdjustments } = useQuery({
    queryKey: ['configuracion', 'cashflow_adjustments_v2'],
    queryFn: async () => {
      const { data } = await supabase.from('configuracion').select('id, valor').eq('clave', 'cashflow_adjustments_v2').maybeSingle();
      if (!data?.valor) return { id: data?.id, values: {} as Record<string, { income: number, expense: number }> };
      try { return { id: data.id, values: JSON.parse(data.valor) }; } catch { return { id: data.id, values: {} }; }
    }
  });

  const { data: facturas } = useQuery({
    queryKey: ['facturacion_cashflow'],
    queryFn: async () => {
      const { data, error } = await supabase.from('facturacion').select('*');
      if (error) throw error;
      return data || [];
    }
  });

  const { data: equipo } = useQuery({
    queryKey: ['equipo_cashflow'],
    queryFn: async () => {
      const { data, error } = await supabase.from('equipo').select('*').eq('activo', true);
      if (error) throw error;
      return data || [];
    }
  });

  const { data: clientes } = useQuery({
    queryKey: ['clientes_cashflow'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('*').eq('estado', 'activo');
      if (error) throw error;
      return data || [];
    }
  });

  const { data: configFijos } = useQuery({
    queryKey: ['configuracion', 'gastos_fijos_estimados'],
    queryFn: async () => {
      const { data } = await supabase.from('configuracion').select('valor').eq('clave', 'gastos_fijos_estimados').maybeSingle();
      return data;
    }
  });

  const gastosFijos = Number(configFijos?.valor || 0);

  // --- MUTATIONS ---
  const saveAdjustmentMutation = useMutation({
    mutationFn: async ({ month, income, expense }: { month: string, income: number, expense: number }) => {
      const currentValues = configAdjustments?.values || {};
      const newValues = { ...currentValues, [month]: { income, expense } };
      const payload = { clave: 'cashflow_adjustments_v2', valor: JSON.stringify(newValues), descripcion: 'Simulaciones de ingresos y egresos potenciales por mes' };
      
      if (configAdjustments?.id) {
        const { error } = await supabase.from('configuracion').update(payload).eq('id', configAdjustments.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('configuracion').insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuracion', 'cashflow_adjustments_v2'] });
      setEditingMonth(null);
      showSuccess('Simulación guardada');
    },
    onError: (err: any) => showError(err.message)
  });

  // --- LÓGICA DE PROYECCIÓN ---
  const projection = useMemo(() => {
    if (!movimientos || !configSaldos || !facturas || !clientes || !equipo) return [];

    let saldoActual = 0;
    Object.values(configSaldos).forEach(v => saldoActual += Number(v));
    movimientos.forEach(m => {
      let isUSD = false;
      try { const p = JSON.parse(m.notas || '{}'); if (p.moneda === 'USD') isUSD = true; } catch(e){}
      const valor = isUSD ? Number(m.monto) * cotizacion : Number(m.monto);
      if (m.tipo === 'ingreso') saldoActual += valor;
      else if (m.tipo === 'egreso') saldoActual -= valor;
    });

    const hoy = new Date();
    const meses = [];
    for (let i = 0; i <= (11 - hoy.getMonth()); i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
      meses.push(d);
    }

    let acumulado = saldoActual;
    const adjustments = configAdjustments?.values || {};

    return meses.map((date, index) => {
      const mesKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const esMesActual = index === 0;

      // --- INGRESOS ---
      const ingresosDetalle: any[] = [];
      const facturasMes = facturas.filter(f => f.mes?.startsWith(mesKey) && f.estado !== 'pagado');
      facturasMes.forEach(f => {
        const monto = Number(f.monto_final || f.monto_base || 0);
        const cli = clientes.find(c => c.id === f.cliente_id);
        ingresosDetalle.push({ nombre: cli?.nombre || 'Manual', monto, tipo: 'Factura Pendiente' });
      });

      let clientesActivosCount = 0;
      if (facturasMes.length === 0) {
        clientes.forEach((c: any) => {
          const finString = c.fecha_fin ? c.fecha_fin.substring(0, 7) : '9999-99';
          const inicioString = c.fecha_inicio ? c.fecha_inicio.substring(0, 7) : '0000-00';
          if (finString >= mesKey && inicioString <= mesKey) {
            const monto = Number(c.monto_ars || 0) + (Number(c.monto_usd || 0) * cotizacion);
            ingresosDetalle.push({ nombre: c.nombre, monto, tipo: 'Abono Estimado (MRR)' });
            clientesActivosCount++;
          }
        });
      } else {
        clientesActivosCount = new Set(facturasMes.map(f => f.cliente_id)).size;
      }

      const simIncome = adjustments[mesKey]?.income || 0;
      const totalIngresosBase = ingresosDetalle.reduce((acc, i) => acc + i.monto, 0);
      const totalIngresosFinal = totalIngresosBase + simIncome;

      // --- EGRESOS ---
      const egresosDetalle: any[] = [];
      let totalEquipo = 0;
      equipo.forEach(miembro => {
        const notasData = parseNotas(miembro.notas);
        let costoProyectos = 0;
        const proyectosMiembro: string[] = [];

        Object.entries(notasData.asignaciones).forEach(([cId, monto]) => {
          const c = clientes.find((cl: any) => cl.id === cId);
          if (c && c.estado === 'activo') {
            const finString = c.fecha_fin ? c.fecha_fin.substring(0, 7) : '9999-99';
            const inicioString = c.fecha_inicio ? c.fecha_inicio.substring(0, 7) : '0000-00';
            if (finString >= mesKey && inicioString <= mesKey) {
              costoProyectos += Number(monto);
              proyectosMiembro.push(c.nombre);
            }
          }
        });

        const totalMiembro = Number(miembro.honorario_mensual) + costoProyectos;
        if (totalMiembro > 0) {
          totalEquipo += totalMiembro;
          egresosDetalle.push({ nombre: miembro.nombre, monto: totalMiembro, detalle: `Base: ${formatARS(miembro.honorario_mensual)} + Proy: ${proyectosMiembro.join(', ') || '-'}` });
        }
      });

      if (gastosFijos > 0) egresosDetalle.push({ nombre: 'Gastos Fijos Estimados', monto: gastosFijos, detalle: 'Configuración general' });

      const simExpense = adjustments[mesKey]?.expense || 0;
      const totalEgresosBase = totalEquipo + gastosFijos;
      const totalEgresosFinal = totalEgresosBase + simExpense;

      const netoMes = totalIngresosFinal - totalEgresosFinal;
      acumulado += netoMes;

      // --- TICKET SALUDABLE ---
      // Para un margen del 25%, el ingreso debe ser Egresos / 0.75
      const ingresoObjetivo = totalEgresosFinal / 0.75;
      const ticketSaludable = clientesActivosCount > 0 ? ingresoObjetivo / clientesActivosCount : 0;

      return {
        key: mesKey,
        label: date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
        ingresos: totalIngresosFinal,
        ingresosBase: totalIngresosBase,
        ingresosSim: simIncome,
        ingresosDetalle,
        egresos: totalEgresosFinal,
        egresosBase: totalEgresosBase,
        egresosSim: simExpense,
        egresosDetalle,
        neto: netoMes,
        saldoFinal: acumulado,
        ticketSaludable,
        clientesActivosCount
      };
    });
  }, [movimientos, configSaldos, facturas, clientes, equipo, gastosFijos, cotizacion, configAdjustments]);

  const saldoHoy = projection[0]?.saldoFinal - projection[0]?.neto || 0;

  const handleStartEdit = (item: any) => {
    setEditingMonth(item.key);
    setEditForm({ 
      income: item.ingresosSim.toString(), 
      expense: item.egresosSim.toString() 
    });
  };

  const handleSaveAdjustment = () => {
    if (!editingMonth) return;
    saveAdjustmentMutation.mutate({ 
      month: editingMonth, 
      income: Number(editForm.income), 
      expense: Number(editForm.expense) 
    });
  };

  return (
    <div className="animate-in fade-in duration-500 pb-12 w-full">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-jengibre-dark flex items-center gap-3">
            <Wallet className="text-jengibre-primary" size={32} />
            Cashflow Proyectado
          </h1>
          <p className="text-gray-600 mt-1">Simulá escenarios de crecimiento y visualizá tu ticket promedio saludable.</p>
        </div>
        <div className="bg-white border border-jengibre-border p-4 rounded-2xl shadow-sm text-center min-w-[200px]">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Saldo Real Hoy</p>
          <p className="text-2xl font-mono font-bold text-jengibre-dark">{formatARS(saldoHoy)}</p>
        </div>
      </header>

      <TipAlert id="cashflow_simulation" title="💡 Simulador de Escenarios">
        Hacé clic en el ícono de edición de cualquier mes para agregar **Ingresos Potenciales** (ej. un nuevo cliente) o **Egresos Potenciales** (ej. una inversión) y ver cómo impacta en tu caja a largo plazo.
      </TipAlert>

      <div className="bg-white border border-jengibre-border rounded-2xl overflow-hidden shadow-sm mb-8">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-display font-bold text-lg text-gray-800 flex items-center gap-2">
            <Calendar size={20} className="text-jengibre-primary" /> Cronograma de Liquidez
          </h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50/50 text-gray-500 uppercase tracking-wider text-[10px] font-bold border-b border-gray-100">
                <th className="px-6 py-4 w-10"></th>
                <th className="px-6 py-4">Mes</th>
                <th className="px-6 py-4 text-right">Ingresos (Real + Sim)</th>
                <th className="px-6 py-4 text-right">Egresos (Real + Sim)</th>
                <th className="px-6 py-4 text-right">Neto Mes</th>
                <th className="px-6 py-4 text-right bg-jengibre-cream/20">Saldo Final</th>
                <th className="px-6 py-4 text-center w-20">Simular</th>
              </tr>
            </thead>
            <tbody>
              {projection.map((item, i) => {
                const isExpanded = expandedMonth === item.key;
                const isEditing = editingMonth === item.key;
                const isRed = item.neto < 0;

                return (
                  <React.Fragment key={item.key}>
                    <tr 
                      className={`border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer ${i === 0 ? 'bg-blue-50/30' : ''}`}
                      onClick={() => setExpandedMonth(isExpanded ? null : item.key)}
                    >
                      <td className="px-6 py-5 text-gray-400">
                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </td>
                      <td className="px-6 py-5 font-bold text-gray-900 capitalize">
                        {item.label}
                        {i === 0 && <span className="ml-2 text-[9px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full uppercase">Actual</span>}
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="font-mono text-green-600 font-bold">{formatARS(item.ingresos)}</div>
                        {item.ingresosSim !== 0 && <div className="text-[10px] text-blue-500 font-bold">Sim: +{formatARS(item.ingresosSim)}</div>}
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="font-mono text-red-500 font-bold">{formatARS(item.egresos)}</div>
                        {item.egresosSim !== 0 && <div className="text-[10px] text-orange-500 font-bold">Sim: +{formatARS(item.egresosSim)}</div>}
                      </td>
                      <td className={`px-6 py-5 text-right font-mono font-bold ${isRed ? 'text-red-700' : 'text-green-700'}`}>
                        {item.neto >= 0 ? '+' : ''}{formatARS(item.neto)}
                      </td>
                      <td className="px-6 py-5 text-right font-mono font-bold text-lg text-jengibre-dark bg-jengibre-cream/10">
                        {formatARS(item.saldoFinal)}
                      </td>
                      <td className="px-6 py-5 text-center" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => handleStartEdit(item)} className="p-2 text-gray-400 hover:text-jengibre-primary hover:bg-jengibre-cream rounded-lg transition-colors">
                          <Edit3 size={18} />
                        </button>
                      </td>
                    </tr>

                    {/* MODAL DE EDICIÓN EN LÍNEA */}
                    {isEditing && (
                      <tr className="bg-blue-50/50 border-b border-blue-100">
                        <td colSpan={7} className="px-12 py-6">
                          <div className="flex flex-col sm:flex-row items-end gap-6">
                            <div className="flex-1 space-y-4">
                              <h4 className="text-sm font-bold text-blue-900 flex items-center gap-2"><Sparkles size={16} /> Simular Escenario para {item.label}</h4>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Ingresos Potenciales (+)</label>
                                  <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                                    <input type="number" className="w-full border border-blue-200 rounded-lg p-2 pl-8 outline-none focus:ring-2 focus:ring-blue-500 font-mono" value={editForm.income} onChange={e => setEditForm({...editForm, income: e.target.value})} />
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Egresos Potenciales (-)</label>
                                  <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                                    <input type="number" className="w-full border border-blue-200 rounded-lg p-2 pl-8 outline-none focus:ring-2 focus:ring-blue-500 font-mono" value={editForm.expense} onChange={e => setEditForm({...editForm, expense: e.target.value})} />
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => setEditingMonth(null)} className="px-4 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-lg">Cancelar</button>
                              <button onClick={handleSaveAdjustment} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold shadow-md hover:bg-blue-700 transition-colors">Guardar Simulación</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* DESGLOSE EXPANDIDO */}
                    {isExpanded && !isEditing && (
                      <tr className="bg-gray-50/50 animate-in slide-in-from-top-2">
                        <td colSpan={7} className="px-12 py-6 border-b border-gray-100">
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            
                            {/* DETALLE INGRESOS */}
                            <div>
                              <h4 className="text-xs font-bold text-green-700 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <ArrowUpRight size={14} /> Ingresos Reales
                              </h4>
                              <div className="space-y-2">
                                {item.ingresosDetalle.map((ing: any, idx: number) => (
                                  <div key={idx} className="flex justify-between items-center bg-white p-2 rounded border border-gray-100 shadow-sm">
                                    <div>
                                      <p className="font-bold text-gray-800 text-xs">{ing.nombre}</p>
                                      <p className="text-[10px] text-gray-400">{ing.tipo}</p>
                                    </div>
                                    <span className="font-mono font-bold text-green-600 text-xs">{formatARS(ing.monto)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* DETALLE EGRESOS */}
                            <div>
                              <h4 className="text-xs font-bold text-red-700 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <ArrowDownRight size={14} /> Egresos Reales
                              </h4>
                              <div className="space-y-2">
                                {item.egresosDetalle.map((egr: any, idx: number) => (
                                  <div key={idx} className="flex justify-between items-center bg-white p-2 rounded border border-gray-100 shadow-sm">
                                    <div className="flex-1 pr-4">
                                      <p className="font-bold text-gray-800 text-xs">{egr.nombre}</p>
                                      <p className="text-[10px] text-gray-400 leading-tight">{egr.detalle}</p>
                                    </div>
                                    <span className="font-mono font-bold text-red-500 text-xs">{formatARS(egr.monto)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* TICKET SALUDABLE */}
                            <div className={`p-5 rounded-2xl border flex flex-col justify-center items-center text-center ${isRed ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                              <Target className={isRed ? 'text-red-600 mb-2' : 'text-green-600 mb-2'} size={32} />
                              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Ticket Promedio Saludable</h4>
                              <p className={`text-2xl font-mono font-bold ${isRed ? 'text-red-700' : 'text-green-700'}`}>{formatARS(item.ticketSaludable)}</p>
                              <p className="text-[10px] text-gray-500 mt-2 leading-tight">
                                {isRed 
                                  ? `Para cubrir costos y tener un 25% de margen, cada uno de tus ${item.clientesActivosCount} clientes debería pagar este monto.` 
                                  : `¡Felicidades! Tu ticket actual supera el mínimo saludable para este nivel de costos.`}
                              </p>
                            </div>

                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}