import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Wallet, ArrowUpRight, ArrowDownRight, Landmark, TrendingUp, Calendar, Info, ChevronDown, ChevronRight, Edit3, Save, X, AlertCircle, Sparkles, Target, Plus, Trash2, Loader2 } from 'lucide-react';
import { formatARS, parseFinancial, parseNotas } from '@/lib/utils';
import { useCotizacionOficial } from '@/hooks/useCotizacion';
import { showSuccess, showError } from '@/utils/toast';

interface SimItem {
  id: string;
  label: string;
  amount: number;
}

interface MonthAdjustment {
  incomes: SimItem[];
  expenses: SimItem[];
}

export default function Cashflow() {
  const queryClient = useQueryClient();
  const { data: cotizacionData } = useCotizacionOficial();
  const cotizacion = cotizacionData || 1000;

  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [editingMonth, setEditingMonth] = useState<string | null>(null);
  const [editIncomes, setEditIncomes] = useState<SimItem[]>([]);
  const [editExpenses, setEditExpenses] = useState<SimItem[]>([]);

  const { data: movimientos, isLoading: loadingMov } = useQuery({
    queryKey: ['movimientos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('movimientos').select('*');
      if (error) throw error;
      return data || [];
    }
  });

  const { data: configSaldos, isLoading: loadingSaldos } = useQuery({
    queryKey: ['configuracion', 'saldos_iniciales'],
    queryFn: async () => {
      const { data } = await supabase.from('configuracion').select('valor').eq('clave', 'saldos_iniciales').maybeSingle();
      return data?.valor ? JSON.parse(data.valor) : {};
    }
  });

  const { data: configAdjustments, isLoading: loadingAdj } = useQuery({
    queryKey: ['configuracion', 'cashflow_adjustments_v3'],
    queryFn: async () => {
      const { data } = await supabase.from('configuracion').select('id, valor').eq('clave', 'cashflow_adjustments_v3').maybeSingle();
      if (!data?.valor) return { id: data?.id, values: {} as Record<string, MonthAdjustment> };
      try { return { id: data.id, values: JSON.parse(data.valor) }; } catch { return { id: data.id, values: {} }; }
    }
  });

  const { data: facturas, isLoading: loadingFact } = useQuery({
    queryKey: ['facturacion'],
    queryFn: async () => {
      const { data, error } = await supabase.from('facturacion').select('*');
      if (error) throw error;
      return data || [];
    }
  });

  const { data: equipo, isLoading: loadingEq } = useQuery({
    queryKey: ['equipo'],
    queryFn: async () => {
      const { data, error } = await supabase.from('equipo').select('*').eq('activo', true);
      if (error) throw error;
      return data || [];
    }
  });

  const { data: clientes, isLoading: loadingCli } = useQuery({
    queryKey: ['clientes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('*').eq('estado', 'activo');
      if (error) throw error;
      return data || [];
    }
  });

  const { data: configFijos, isLoading: loadingFijos } = useQuery({
    queryKey: ['configuracion', 'gastos_fijos_estimados'],
    queryFn: async () => {
      const { data } = await supabase.from('configuracion').select('valor').eq('clave', 'gastos_fijos_estimados').maybeSingle();
      return data;
    }
  });

  const gastosFijos = Number(configFijos?.valor || 0);

  const saveAdjustmentMutation = useMutation({
    mutationFn: async ({ month, incomes, expenses }: { month: string, incomes: SimItem[], expenses: SimItem[] }) => {
      const currentValues = configAdjustments?.values || {};
      const newValues = { ...currentValues, [month]: { incomes, expenses } };
      const payload = { clave: 'cashflow_adjustments_v3', valor: JSON.stringify(newValues), descripcion: 'Simulaciones de cashflow' };
      if (configAdjustments?.id) {
        const { error } = await supabase.from('configuracion').update(payload).eq('id', configAdjustments.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('configuracion').insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuracion', 'cashflow_adjustments_v3'] });
      setEditingMonth(null);
      showSuccess('Simulación guardada');
    },
    onError: (err: any) => showError(err.message)
  });

  const projection = useMemo(() => {
    if (!movimientos || !configSaldos || !facturas || !clientes || !equipo) return [];
    let saldoActual = 0;
    Object.values(configSaldos).forEach(v => saldoActual = parseFinancial(saldoActual + Number(v)));
    movimientos.forEach(m => {
      const notas = parseNotas(m.notas);
      const isUSD = notas.moneda === 'USD';
      const valor = parseFinancial(isUSD ? Number(m.monto) * cotizacion : Number(m.monto));
      if (m.tipo === 'ingreso') saldoActual = parseFinancial(saldoActual + valor);
      else if (m.tipo === 'egreso') saldoActual = parseFinancial(saldoActual - valor);
    });
    const hoy = new Date();
    const meses = [];
    for (let i = 0; i <= (11 - hoy.getMonth()); i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
      meses.push(d);
    }
    let acumulado = saldoActual;
    const adjustments = configAdjustments?.values || {};
    return meses.map((date) => {
      const mesKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const ingresosDetalle: any[] = [];
      const facturasMes = facturas.filter(f => f.mes?.startsWith(mesKey) && f.estado !== 'pagado');
      facturasMes.forEach(f => {
        const monto = parseFinancial(f.monto_final || f.monto_base || 0);
        const cli = clientes.find(c => c.id === f.cliente_id);
        ingresosDetalle.push({ nombre: cli?.nombre || 'Manual', monto, tipo: 'Factura Pendiente', isSim: false });
      });
      let clientesActivosCount = 0;
      if (facturasMes.length === 0) {
        clientes.forEach((c: any) => {
          const finString = c.fecha_fin ? c.fecha_fin.substring(0, 7) : '9999-99';
          const inicioString = c.fecha_inicio ? c.fecha_inicio.substring(0, 7) : '0000-00';
          if (finString >= mesKey && inicioString <= mesKey) {
            const monto = parseFinancial(Number(c.monto_ars || 0) + (Number(c.monto_usd || 0) * cotizacion));
            ingresosDetalle.push({ nombre: c.nombre, monto, tipo: 'Abono Estimado', isSim: false });
            clientesActivosCount++;
          }
        });
      } else {
        clientesActivosCount = new Set(facturasMes.map(f => f.cliente_id)).size;
      }
      const simIncomes = adjustments[mesKey]?.incomes || [];
      simIncomes.forEach(item => { ingresosDetalle.push({ nombre: item.label, monto: parseFinancial(item.amount), tipo: 'Simulación', isSim: true }); });
      const totalIngresos = parseFinancial(ingresosDetalle.reduce((acc, i) => acc + i.monto, 0));
      const egresosDetalle: any[] = [];
      let totalEquipo = 0;
      equipo.forEach(miembro => {
        const notasData = parseNotas(miembro.notas);
        let costoProyectos = 0;
        Object.entries(notasData.asignaciones).forEach(([cId, monto]) => {
          const c = clientes.find((cl: any) => cl.id === cId);
          if (c && c.estado === 'activo') {
            const finString = c.fecha_fin ? c.fecha_fin.substring(0, 7) : '9999-99';
            const inicioString = c.fecha_inicio ? c.fecha_inicio.substring(0, 7) : '0000-00';
            if (finString >= mesKey && inicioString <= mesKey) { costoProyectos = parseFinancial(costoProyectos + Number(monto)); }
          }
        });
        const totalMiembro = parseFinancial(Number(miembro.honorario_mensual) + costoProyectos);
        if (totalMiembro > 0) {
          totalEquipo = parseFinancial(totalEquipo + totalMiembro);
          egresosDetalle.push({ nombre: miembro.nombre, monto: totalMiembro, isSim: false });
        }
      });
      if (gastosFijos > 0) egresosDetalle.push({ nombre: 'Gastos Fijos', monto: parseFinancial(gastosFijos), isSim: false });
      const simExpenses = adjustments[mesKey]?.expenses || [];
      simExpenses.forEach(item => { egresosDetalle.push({ nombre: item.label, monto: parseFinancial(item.amount), isSim: true }); });
      const totalEgresos = parseFinancial(totalEquipo + gastosFijos + simExpenses.reduce((acc, e) => acc + e.amount, 0));
      const netoMes = parseFinancial(totalIngresos - totalEgresos);
      acumulado = parseFinancial(acumulado + netoMes);
      const ingresoObjetivo = parseFinancial(totalEgresos / 0.75);
      const ticketSaludable = clientesActivosCount > 0 ? parseFinancial(ingresoObjetivo / clientesActivosCount) : 0;
      return { key: mesKey, label: date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }), ingresos: totalIngresos, ingresosDetalle, egresos: totalEgresos, egresosDetalle, neto: netoMes, saldoFinal: acumulado, ticketSaludable, clientesActivosCount, hasSim: simIncomes.length > 0 || simExpenses.length > 0 };
    });
  }, [movimientos, configSaldos, facturas, clientes, equipo, gastosFijos, cotizacion, configAdjustments]);

  const isLoading = loadingMov || loadingSaldos || loadingAdj || loadingFact || loadingEq || loadingCli || loadingFijos;

  if (isLoading) return <div className="flex justify-center py-32"><Loader2 className="w-12 h-12 text-slate-200 animate-spin" /></div>;

  return (
    <div className="animate-in fade-in duration-700 pb-20">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Cashflow Proyectado</h1>
          <p className="text-slate-500 mt-1 font-medium">Análisis de liquidez futura y simulaciones.</p>
        </div>
        <div className="bg-white border border-slate-200 p-6 rounded-[2rem] shadow-sm text-center min-w-[240px]">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Saldo Consolidado Hoy</p>
          <p className="text-2xl font-bold text-slate-900 tracking-tight">{formatARS(projection[0]?.saldoFinal - projection[0]?.neto || 0)}</p>
        </div>
      </header>

      <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-bold uppercase tracking-[0.15em] border-b border-slate-100">
                <th className="px-8 py-5">Mes</th>
                <th className="px-8 py-5 text-right">Ingresos</th>
                <th className="px-8 py-5 text-right">Egresos</th>
                <th className="px-8 py-5 text-right">Neto</th>
                <th className="px-8 py-5 text-right">Saldo Final</th>
                <th className="px-8 py-5 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {projection.map((item) => (
                <React.Fragment key={item.key}>
                  <tr className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group cursor-pointer" onClick={() => setExpandedMonth(expandedMonth === item.key ? null : item.key)}>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        {expandedMonth === item.key ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                        <p className="text-sm font-bold text-slate-900 capitalize">{item.label}</p>
                        {item.hasSim && <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[8px] font-bold uppercase">Simulado</span>}
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <p className="text-sm font-bold text-emerald-600">{formatARS(item.ingresos)}</p>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <p className="text-sm font-bold text-rose-600">{formatARS(item.egresos)}</p>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <p className={`text-sm font-bold ${item.neto >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{item.neto >= 0 ? '+' : ''}{formatARS(item.neto)}</p>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <p className="text-lg font-bold text-slate-900 tracking-tight">{formatARS(item.saldoFinal)}</p>
                    </td>
                    <td className="px-8 py-6 text-center" onClick={e => e.stopPropagation()}>
                      <button onClick={() => { const adj = configAdjustments?.values[item.key] || { incomes: [], expenses: [] }; setEditIncomes(adj.incomes || []); setEditExpenses(adj.expenses || []); setEditingMonth(item.key); }} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><Edit3 size={16} /></button>
                    </td>
                  </tr>
                  {expandedMonth === item.key && (
                    <tr className="bg-slate-50/30">
                      <td colSpan={6} className="px-12 py-8">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                          <div className="space-y-4">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Composición Ingresos</p>
                            {item.ingresosDetalle.map((ing: any, idx: number) => (
                              <div key={idx} className="flex justify-between items-center p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                                <span className="text-xs font-bold text-slate-700">{ing.nombre}</span>
                                <span className="text-xs font-bold text-emerald-600">{formatARS(ing.monto)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="space-y-4">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Composición Egresos</p>
                            {item.egresosDetalle.map((egr: any, idx: number) => (
                              <div key={idx} className="flex justify-between items-center p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                                <span className="text-xs font-bold text-slate-700">{egr.nombre}</span>
                                <span className="text-xs font-bold text-rose-600">{formatARS(egr.monto)}</span>
                              </div>
                            ))}
                          </div>
                          <div className={`p-6 rounded-2xl border flex flex-col items-center text-center justify-center ${item.neto >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                            <Target className={item.neto >= 0 ? 'text-emerald-600 mb-3' : 'text-rose-600 mb-3'} size={32} />
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Ticket Saludable</p>
                            <p className={`text-xl font-bold ${item.neto >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatARS(item.ticketSaludable)}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editingMonth && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl p-10 shadow-2xl animate-in zoom-in-95 border border-white/20 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Simular Escenario</h2>
              <button onClick={() => setEditingMonth(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"><X size={24} /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ingresos (+)</p>
                  <button onClick={() => setEditIncomes([...editIncomes, { id: crypto.randomUUID(), label: '', amount: 0 }])} className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-all"><Plus size={14} /></button>
                </div>
                {editIncomes.map(inc => (
                  <div key={inc.id} className="flex gap-2">
                    <input className="flex-1 border border-slate-200 rounded-lg p-2 text-xs font-bold" placeholder="Etiqueta" value={inc.label} onChange={e => setEditIncomes(editIncomes.map(i => i.id === inc.id ? { ...i, label: e.target.value } : i))} />
                    <input type="number" className="w-24 border border-slate-200 rounded-lg p-2 text-xs font-bold" placeholder="Monto" value={inc.amount} onChange={e => setEditIncomes(editIncomes.map(i => i.id === inc.id ? { ...i, amount: Number(e.target.value) } : i))} />
                    <button onClick={() => setEditIncomes(editIncomes.filter(i => i.id !== inc.id))} className="text-slate-300 hover:text-rose-500"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Egresos (-)</p>
                  <button onClick={() => setEditExpenses([...editExpenses, { id: crypto.randomUUID(), label: '', amount: 0 }])} className="p-1.5 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 transition-all"><Plus size={14} /></button>
                </div>
                {editExpenses.map(exp => (
                  <div key={exp.id} className="flex gap-2">
                    <input className="flex-1 border border-slate-200 rounded-lg p-2 text-xs font-bold" placeholder="Etiqueta" value={exp.label} onChange={e => setEditExpenses(editExpenses.map(i => i.id === exp.id ? { ...i, label: e.target.value } : i))} />
                    <input type="number" className="w-24 border border-slate-200 rounded-lg p-2 text-xs font-bold" placeholder="Monto" value={exp.amount} onChange={e => setEditExpenses(editExpenses.map(i => i.id === exp.id ? { ...i, amount: Number(e.target.value) } : i))} />
                    <button onClick={() => setEditExpenses(editExpenses.filter(i => i.id !== exp.id))} className="text-slate-300 hover:text-rose-500"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-12 pt-8 border-t border-slate-100">
              <button onClick={() => setEditingMonth(null)} className="px-6 py-3.5 text-slate-400 font-bold uppercase tracking-widest text-[10px] hover:bg-slate-50 rounded-xl transition-colors">Cancelar</button>
              <button onClick={() => saveAdjustmentMutation.mutate({ month: editingMonth, incomes: editIncomes, expenses: editExpenses })} className="bg-slate-900 text-white px-8 py-3.5 rounded-xl font-bold uppercase tracking-widest text-[10px] shadow-lg shadow-slate-900/10 active:scale-95 transition-all">Guardar Simulación</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
