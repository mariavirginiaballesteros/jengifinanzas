import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TipAlert } from '@/components/TipAlert';
import { Wallet, ArrowUpRight, ArrowDownRight, Landmark, TrendingUp, Calendar, Info, ChevronDown, ChevronRight, Edit3, Save, X, AlertCircle, Sparkles, Target, Plus, Trash2 } from 'lucide-react';
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
  
  // Estado para el formulario de edición
  const [editIncomes, setEditIncomes] = useState<SimItem[]>([]);
  const [editExpenses, setEditExpenses] = useState<SimItem[]>([]);

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
    queryKey: ['configuracion', 'cashflow_adjustments_v3'],
    queryFn: async () => {
      const { data } = await supabase.from('configuracion').select('id, valor').eq('clave', 'cashflow_adjustments_v3').maybeSingle();
      if (!data?.valor) return { id: data?.id, values: {} as Record<string, MonthAdjustment> };
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
    mutationFn: async ({ month, incomes, expenses }: { month: string, incomes: SimItem[], expenses: SimItem[] }) => {
      const currentValues = configAdjustments?.values || {};
      const newValues = { ...currentValues, [month]: { incomes, expenses } };
      const payload = { clave: 'cashflow_adjustments_v3', valor: JSON.stringify(newValues), descripcion: 'Simulaciones detalladas de ingresos y egresos potenciales' };
      
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

  // --- LÓGICA DE PROYECCIÓN ---
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
      // Usamos el primer día del mes en la zona horaria local
      const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
      meses.push(d);
    }

    let acumulado = saldoActual;
    const adjustments = configAdjustments?.values || {};

    return meses.map((date, index) => {
      const mesKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      // --- INGRESOS ---
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
            ingresosDetalle.push({ nombre: c.nombre, monto, tipo: 'Abono Estimado (MRR)', isSim: false });
            clientesActivosCount++;
          }
        });
      } else {
        clientesActivosCount = new Set(facturasMes.map(f => f.cliente_id)).size;
      }

      // Sumar ingresos simulados
      const simIncomes = adjustments[mesKey]?.incomes || [];
      simIncomes.forEach(item => {
        ingresosDetalle.push({ nombre: item.label, monto: parseFinancial(item.amount), tipo: 'Simulación', isSim: true });
      });

      const totalIngresos = parseFinancial(ingresosDetalle.reduce((acc, i) => acc + i.monto, 0));

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
              costoProyectos = parseFinancial(costoProyectos + Number(monto));
              proyectosMiembro.push(c.nombre);
            }
          }
        });

        const totalMiembro = parseFinancial(Number(miembro.honorario_mensual) + costoProyectos);
        if (totalMiembro > 0) {
          totalEquipo = parseFinancial(totalEquipo + totalMiembro);
          egresosDetalle.push({ nombre: miembro.nombre, monto: totalMiembro, detalle: `Base: ${formatARS(miembro.honorario_mensual)} + Proy: ${proyectosMiembro.join(', ') || '-'}`, isSim: false });
        }
      });

      if (gastosFijos > 0) egresosDetalle.push({ nombre: 'Gastos Fijos Estimados', monto: parseFinancial(gastosFijos), detalle: 'Configuración general', isSim: false });

      // Sumar egresos simulados
      const simExpenses = adjustments[mesKey]?.expenses || [];
      simExpenses.forEach(item => {
        egresosDetalle.push({ nombre: item.label, monto: parseFinancial(item.amount), detalle: 'Simulación', isSim: true });
      });

      const totalEgresos = parseFinancial(totalEquipo + gastosFijos + simExpenses.reduce((acc, e) => acc + e.amount, 0));

      const netoMes = parseFinancial(totalIngresos - totalEgresos);
      acumulado = parseFinancial(acumulado + netoMes);

      // Ticket Saludable
      const ingresoObjetivo = parseFinancial(totalEgresos / 0.75);
      const ticketSaludable = clientesActivosCount > 0 ? parseFinancial(ingresoObjetivo / clientesActivosCount) : 0;

      return {
        key: mesKey,
        label: date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
        ingresos: totalIngresos,
        ingresosDetalle,
        egresos: totalEgresos,
        egresosDetalle,
        neto: netoMes,
        saldoFinal: acumulado,
        ticketSaludable,
        clientesActivosCount,
        hasSim: simIncomes.length > 0 || simExpenses.length > 0
      };
    });
  }, [movimientos, configSaldos, facturas, clientes, equipo, gastosFijos, cotizacion, configAdjustments]);

  const saldoHoy = projection[0]?.saldoFinal - projection[0]?.neto || 0;

  // --- HANDLERS FORMULARIO ---
  const handleStartEdit = (item: any) => {
    const adj = configAdjustments?.values[item.key] || { incomes: [], expenses: [] };
    setEditIncomes(adj.incomes || []);
    setEditExpenses(adj.expenses || []);
    setEditingMonth(item.key);
  };

  const handleSaveAdjustment = () => {
    if (!editingMonth) return;
    saveAdjustmentMutation.mutate({ 
      month: editingMonth, 
      incomes: editIncomes, 
      expenses: editExpenses 
    });
  };

  const addSimItem = (type: 'income' | 'expense') => {
    const newItem = { id: crypto.randomUUID(), label: '', amount: 0 };
    if (type === 'income') setEditIncomes([...editIncomes, newItem]);
    else setEditExpenses([...editExpenses, newItem]);
  };

  const removeSimItem = (type: 'income' | 'expense', id: string) => {
    if (type === 'income') setEditIncomes(editIncomes.filter(i => i.id !== id));
    else setEditExpenses(editExpenses.filter(i => i.id !== id));
  };

  const updateSimItem = (type: 'income' | 'expense', id: string, field: 'label' | 'amount', value: any) => {
    const setter = type === 'income' ? setEditIncomes : setEditExpenses;
    const list = type === 'income' ? editIncomes : editExpenses;
    setter(list.map(item => item.id === id ? { ...item, [field]: field === 'amount' ? Number(value) : value } : item));
  };

  return (
    <div className="animate-in fade-in duration-500 pb-12 w-full">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-jengibre-dark flex items-center gap-3">
            <Wallet className="text-jengibre-primary" size={32} />
            Cashflow Proyectado
          </h1>
          <p className="text-gray-600 mt-1">Simulá escenarios de crecimiento cargando múltiples ingresos y egresos potenciales.</p>
        </div>
        <div className="bg-white border border-jengibre-border p-4 rounded-2xl shadow-sm text-center min-w-[200px]">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Saldo Real Hoy</p>
          <p className="text-2xl font-mono font-bold text-jengibre-dark">{formatARS(saldoHoy)}</p>
        </div>
      </header>

      <TipAlert id="cashflow_multi_sim" title="💡 Simulaciones Detalladas">
        Ahora podés cargar varios ingresos potenciales por mes. Por ejemplo: "Cliente Nuevo A" por $300k y "Renovación Cliente B" por $100k extra. Todo se suma a la proyección final.
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
                <th className="px-6 py-4 text-right">Ingresos (Total)</th>
                <th className="px-6 py-4 text-right">Egresos (Total)</th>
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
                        {item.hasSim && <span className="ml-2 text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full uppercase font-bold">Simulado</span>}
                      </td>
                      <td className="px-6 py-5 text-right font-mono text-green-600 font-bold">{formatARS(item.ingresos)}</td>
                      <td className="px-6 py-5 text-right font-mono text-red-500 font-bold">{formatARS(item.egresos)}</td>
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

                    {/* MODAL DE EDICIÓN EN LÍNEA (MULTILÍNEA) */}
                    {isEditing && (
                      <tr className="bg-blue-50/50 border-b border-blue-100">
                        <td colSpan={7} className="px-12 py-8">
                          <div className="space-y-8">
                            <div className="flex items-center justify-between">
                              <h4 className="text-lg font-display font-bold text-blue-900 flex items-center gap-2"><Sparkles size={20} /> Simular Escenario para {item.label}</h4>
                              <div className="flex gap-3">
                                <button onClick={() => setEditingMonth(null)} className="px-4 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-lg">Cancelar</button>
                                <button onClick={handleSaveAdjustment} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold shadow-md hover:bg-blue-700 transition-colors">Guardar Simulación</button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                              {/* INGRESOS POTENCIALES */}
                              <div className="space-y-4">
                                <div className="flex justify-between items-center border-b border-blue-200 pb-2">
                                  <h5 className="text-xs font-bold text-blue-800 uppercase tracking-widest">Ingresos Potenciales (+)</h5>
                                  <button onClick={() => addSimItem('income')} className="text-[10px] font-bold bg-blue-600 text-white px-2 py-1 rounded flex items-center gap-1 hover:bg-blue-700"><Plus size={12}/> Agregar</button>
                                </div>
                                <div className="space-y-3">
                                  {editIncomes.map(inc => (
                                    <div key={inc.id} className="flex gap-2 items-center animate-in slide-in-from-left-2">
                                      <input type="text" placeholder="Ej: Cliente Nuevo A" className="flex-1 border border-blue-200 rounded p-2 text-xs outline-none focus:ring-2 focus:ring-blue-500" value={inc.label} onChange={e => updateSimItem('income', inc.id, 'label', e.target.value)} />
                                      <div className="relative w-32">
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                                        <input type="number" className="w-full border border-blue-200 rounded p-2 pl-5 text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500" value={inc.amount} onChange={e => updateSimItem('income', inc.id, 'amount', e.target.value)} />
                                      </div>
                                      <button onClick={() => removeSimItem('income', inc.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={16}/></button>
                                    </div>
                                  ))}
                                  {editIncomes.length === 0 && <p className="text-xs text-gray-400 italic">No hay ingresos simulados.</p>}
                                </div>
                              </div>

                              {/* EGRESOS POTENCIALES */}
                              <div className="space-y-4">
                                <div className="flex justify-between items-center border-b border-blue-200 pb-2">
                                  <h5 className="text-xs font-bold text-blue-800 uppercase tracking-widest">Egresos Potenciales (-)</h5>
                                  <button onClick={() => addSimItem('expense')} className="text-[10px] font-bold bg-blue-600 text-white px-2 py-1 rounded flex items-center gap-1 hover:bg-blue-700"><Plus size={12}/> Agregar</button>
                                </div>
                                <div className="space-y-3">
                                  {editExpenses.map(exp => (
                                    <div key={exp.id} className="flex gap-2 items-center animate-in slide-in-from-left-2">
                                      <input type="text" placeholder="Ej: Inversión Software" className="flex-1 border border-blue-200 rounded p-2 text-xs outline-none focus:ring-2 focus:ring-blue-500" value={exp.label} onChange={e => updateSimItem('expense', exp.id, 'label', e.target.value)} />
                                      <div className="relative w-32">
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                                        <input type="number" className="w-full border border-blue-200 rounded p-2 pl-5 text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500" value={exp.amount} onChange={e => updateSimItem('expense', exp.id, 'amount', e.target.value)} />
                                      </div>
                                      <button onClick={() => removeSimItem('expense', exp.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={16}/></button>
                                    </div>
                                  ))}
                                  {editExpenses.length === 0 && <p className="text-xs text-gray-400 italic">No hay egresos simulados.</p>}
                                </div>
                              </div>
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
                                <ArrowUpRight size={14} /> Composición de Ingresos
                              </h4>
                              <div className="space-y-2">
                                {item.ingresosDetalle.map((ing: any, idx: number) => (
                                  <div key={idx} className={`flex justify-between items-center p-2 rounded border shadow-sm ${ing.isSim ? 'bg-blue-50 border-blue-100' : 'bg-white border-gray-100'}`}>
                                    <div>
                                      <p className="font-bold text-gray-800 text-xs">{ing.nombre}</p>
                                      <p className="text-[10px] text-gray-400">{ing.tipo}</p>
                                    </div>
                                    <span className={`font-mono font-bold text-xs ${ing.isSim ? 'text-blue-600' : 'text-green-600'}`}>{formatARS(ing.monto)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* DETALLE EGRESOS */}
                            <div>
                              <h4 className="text-xs font-bold text-red-700 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <ArrowDownRight size={14} /> Composición de Egresos
                              </h4>
                              <div className="space-y-2">
                                {item.egresosDetalle.map((egr: any, idx: number) => (
                                  <div key={idx} className={`flex justify-between items-center p-2 rounded border shadow-sm ${egr.isSim ? 'bg-orange-50 border-orange-100' : 'bg-white border-gray-100'}`}>
                                    <div className="flex-1 pr-4">
                                      <p className="font-bold text-gray-800 text-xs">{egr.nombre}</p>
                                      <p className="text-[10px] text-gray-400 leading-tight">{egr.detalle}</p>
                                    </div>
                                    <span className={`font-mono font-bold text-xs ${egr.isSim ? 'text-orange-600' : 'text-red-500'}`}>{formatARS(egr.monto)}</span>
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