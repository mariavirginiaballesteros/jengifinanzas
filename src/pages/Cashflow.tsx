import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TipAlert } from '@/components/TipAlert';
import { Wallet, ArrowUpRight, ArrowDownRight, Landmark, TrendingUp, Calendar, Info, ChevronDown, ChevronRight, Edit3, Save, X, AlertCircle } from 'lucide-react';
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
  const [adjustmentValue, setAdjustmentValue] = useState('');

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
    queryKey: ['configuracion', 'cashflow_adjustments'],
    queryFn: async () => {
      const { data } = await supabase.from('configuracion').select('id, valor').eq('clave', 'cashflow_adjustments').maybeSingle();
      if (!data?.valor) return { id: data?.id, values: {} };
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
    mutationFn: async ({ month, value }: { month: string, value: number }) => {
      const currentValues = configAdjustments?.values || {};
      const newValues = { ...currentValues, [month]: value };
      const payload = { clave: 'cashflow_adjustments', valor: JSON.stringify(newValues), descripcion: 'Ajustes manuales por mes para el Cashflow' };
      
      if (configAdjustments?.id) {
        const { error } = await supabase.from('configuracion').update(payload).eq('id', configAdjustments.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('configuracion').insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuracion', 'cashflow_adjustments'] });
      setEditingMonth(null);
      showSuccess('Ajuste guardado');
    },
    onError: (err: any) => showError(err.message)
  });

  // --- LÓGICA DE PROYECCIÓN ---
  const projection = useMemo(() => {
    if (!movimientos || !configSaldos || !facturas || !clientes || !equipo) return [];

    // 1. Saldo Real Hoy
    let saldoActual = 0;
    Object.values(configSaldos).forEach(v => saldoActual += Number(v));
    movimientos.forEach(m => {
      let isUSD = false;
      try { const p = JSON.parse(m.notas || '{}'); if (p.moneda === 'USD') isUSD = true; } catch(e){}
      const valor = isUSD ? Number(m.monto) * cotizacion : Number(m.monto);
      if (m.tipo === 'ingreso') saldoActual += valor;
      else if (m.tipo === 'egreso') saldoActual -= valor;
    });

    // 2. Meses hasta Diciembre
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
      
      // Facturación pendiente cargada
      const facturasMes = facturas.filter(f => f.mes?.startsWith(mesKey) && f.estado !== 'pagado');
      facturasMes.forEach(f => {
        const monto = Number(f.monto_final || f.monto_base || 0);
        const cli = clientes.find(c => c.id === f.cliente_id);
        ingresosDetalle.push({ nombre: cli?.nombre || 'Manual', monto, tipo: 'Factura Pendiente' });
      });

      // Si no hay facturas, estimamos por MRR (solo si el contrato está vigente)
      let ingresosEstimados = 0;
      if (facturasMes.length === 0) {
        clientes.forEach((c: any) => {
          const finString = c.fecha_fin ? c.fecha_fin.substring(0, 7) : '9999-99';
          const inicioString = c.fecha_inicio ? c.fecha_inicio.substring(0, 7) : '0000-00';
          if (finString >= mesKey && inicioString <= mesKey) {
            const monto = Number(c.monto_ars || 0) + (Number(c.monto_usd || 0) * cotizacion);
            ingresosEstimados += monto;
            ingresosDetalle.push({ nombre: c.nombre, monto, tipo: 'Abono Estimado (MRR)' });
          }
        });
      }

      const totalIngresos = ingresosDetalle.reduce((acc, i) => acc + i.monto, 0);

      // --- EGRESOS ---
      const egresosDetalle: any[] = [];
      
      // Equipo (Sueldos base + Asignaciones si el proyecto está vigente)
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
          egresosDetalle.push({ 
            nombre: miembro.nombre, 
            monto: totalMiembro, 
            detalle: `Base: ${formatARS(miembro.honorario_mensual)} + Proy: ${proyectosMiembro.join(', ') || '-'}` 
          });
        }
      });

      // Gastos Fijos
      if (gastosFijos > 0) {
        egresosDetalle.push({ nombre: 'Gastos Fijos Estimados', monto: gastosFijos, detalle: 'Configuración general' });
      }

      const totalEgresos = totalEquipo + gastosFijos;

      // --- AJUSTE MANUAL ---
      const ajusteManual = Number(adjustments[mesKey] || 0);
      
      const netoMes = totalIngresos - totalEgresos + ajusteManual;
      acumulado += netoMes;

      return {
        key: mesKey,
        label: date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
        ingresos: totalIngresos,
        ingresosDetalle,
        egresos: totalEgresos,
        egresosDetalle,
        ajusteManual,
        neto: netoMes,
        saldoFinal: acumulado
      };
    });
  }, [movimientos, configSaldos, facturas, clientes, equipo, gastosFijos, cotizacion, configAdjustments]);

  const saldoHoy = projection[0]?.saldoFinal - projection[0]?.neto || 0;

  const handleStartEdit = (item: any) => {
    setEditingMonth(item.key);
    setAdjustmentValue(item.ajusteManual.toString());
  };

  const handleSaveAdjustment = () => {
    if (!editingMonth) return;
    saveAdjustmentMutation.mutate({ month: editingMonth, value: Number(adjustmentValue) });
  };

  return (
    <div className="animate-in fade-in duration-500 pb-12 w-full">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-jengibre-dark flex items-center gap-3">
            <Wallet className="text-jengibre-primary" size={32} />
            Cashflow Proyectado
          </h1>
          <p className="text-gray-600 mt-1">Evolución de tu liquidez real. Los costos de equipo se ajustan automáticamente si caen proyectos.</p>
        </div>
        <div className="bg-white border border-jengibre-border p-4 rounded-2xl shadow-sm text-center min-w-[200px]">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Saldo Real Hoy</p>
          <p className="text-2xl font-mono font-bold text-jengibre-dark">{formatARS(saldoHoy)}</p>
        </div>
      </header>

      <TipAlert id="cashflow_dynamic" title="💡 Proyección Inteligente">
        Este Cashflow es dinámico: si un cliente tiene fecha de fin en Octubre, el sistema dejará de contar ese ingreso en Noviembre y **también restará automáticamente** lo que le pagás al equipo por ese proyecto específico.
      </TipAlert>

      <div className="bg-white border border-jengibre-border rounded-2xl overflow-hidden shadow-sm mb-8">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-display font-bold text-lg text-gray-800 flex items-center gap-2">
            <Calendar size={20} className="text-jengibre-primary" /> Cronograma de Liquidez
          </h2>
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-bold text-gray-400 uppercase">Hacé clic en un mes para ver el desglose</span>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50/50 text-gray-500 uppercase tracking-wider text-[10px] font-bold border-b border-gray-100">
                <th className="px-6 py-4 w-10"></th>
                <th className="px-6 py-4">Mes</th>
                <th className="px-6 py-4 text-right">Ingresos</th>
                <th className="px-6 py-4 text-right">Egresos</th>
                <th className="px-6 py-4 text-right">Ajuste Manual</th>
                <th className="px-6 py-4 text-right">Neto Mes</th>
                <th className="px-6 py-4 text-right bg-jengibre-cream/20">Saldo Final</th>
              </tr>
            </thead>
            <tbody>
              {projection.map((item, i) => {
                const isExpanded = expandedMonth === item.key;
                const isEditing = editingMonth === item.key;

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
                      <td className="px-6 py-5 text-right font-mono text-green-600 font-medium">{formatARS(item.ingresos)}</td>
                      <td className="px-6 py-5 text-right font-mono text-red-500 font-medium">{formatARS(item.egresos)}</td>
                      <td className="px-6 py-5 text-right" onClick={(e) => e.stopPropagation()}>
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-2">
                            <input 
                              type="number" 
                              className="w-24 border border-blue-300 rounded p-1 text-right text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500"
                              value={adjustmentValue}
                              onChange={e => setAdjustmentValue(e.target.value)}
                              autoFocus
                            />
                            <button onClick={handleSaveAdjustment} className="p-1 text-green-600 hover:bg-green-50 rounded"><Save size={14} /></button>
                            <button onClick={() => setEditingMonth(null)} className="p-1 text-gray-400 hover:bg-gray-50 rounded"><X size={14} /></button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2 group">
                            <span className={`font-mono text-xs ${item.ajusteManual !== 0 ? 'text-blue-600 font-bold' : 'text-gray-300'}`}>
                              {item.ajusteManual > 0 ? '+' : ''}{formatARS(item.ajusteManual)}
                            </span>
                            <button onClick={() => handleStartEdit(item)} className="p-1 text-gray-300 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Edit3 size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className={`px-6 py-5 text-right font-mono font-bold ${item.neto >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {item.neto >= 0 ? '+' : ''}{formatARS(item.neto)}
                      </td>
                      <td className="px-6 py-5 text-right font-mono font-bold text-lg text-jengibre-dark bg-jengibre-cream/10">
                        {formatARS(item.saldoFinal)}
                      </td>
                    </tr>

                    {/* DESGLOSE EXPANDIDO */}
                    {isExpanded && (
                      <tr className="bg-gray-50/50 animate-in slide-in-from-top-2">
                        <td colSpan={7} className="px-12 py-6 border-b border-gray-100">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            
                            {/* DETALLE INGRESOS */}
                            <div>
                              <h4 className="text-xs font-bold text-green-700 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <ArrowUpRight size={14} /> Composición de Ingresos
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
                                {item.ingresosDetalle.length === 0 && <p className="text-xs text-gray-400 italic">Sin ingresos proyectados.</p>}
                              </div>
                            </div>

                            {/* DETALLE EGRESOS */}
                            <div>
                              <h4 className="text-xs font-bold text-red-700 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <ArrowDownRight size={14} /> Composición de Egresos
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

                          </div>

                          {item.ajusteManual !== 0 && (
                            <div className="mt-6 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-center gap-3">
                              <AlertCircle size={16} className="text-blue-600" />
                              <p className="text-xs text-blue-800">
                                Este mes incluye un <strong>ajuste manual de {formatARS(item.ajusteManual)}</strong> aplicado por el usuario.
                              </p>
                            </div>
                          )}
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