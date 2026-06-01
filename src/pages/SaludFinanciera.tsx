import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatARS, formatUSD } from '@/lib/utils';
import { TipAlert } from '@/components/TipAlert';
import { 
  ChevronLeft, ChevronRight, Bot, Sparkles, 
  ShieldCheck, Lightbulb, Send, Loader2, Landmark, X, FileText, Calendar, Settings, Info, Wallet
} from 'lucide-react';
import { useCotizacionOficial } from '@/hooks/useCotizacion';
import { showError, showSuccess } from '@/utils/toast';

const parseNotas = (notasStr: string | null) => {
  if (!notasStr) return { texto: '', moneda: 'ARS', asignaciones: {} as Record<string, number> };
  try {
    const parsed = JSON.parse(notasStr);
    if (parsed && typeof parsed === 'object') return { 
      texto: parsed.texto || '', 
      moneda: parsed.moneda || 'ARS',
      asignaciones: parsed.asignaciones || {}
    };
  } catch(e){}
  return { texto: notasStr || '', moneda: 'ARS', asignaciones: {} };
};

export default function SaludFinanciera() {
  const queryClient = useQueryClient();
  const [yearSelected, setYearSelected] = useState(new Date().getFullYear());
  const { data: cotizacionData } = useCotizacionOficial();
  const cotizacion = Number(cotizacionData) || 1000;

  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  const [selectedDetail, setSelectedDetail] = useState<{
    categoria: string,
    mes: string,
    movimientos: any[]
  } | null>(null);

  const { data: movimientos, isLoading: isLoadingMov } = useQuery({
    queryKey: ['movimientos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('movimientos').select(`*, cliente:clientes(nombre)`).order('fecha', { ascending: true });
      if (error) throw error;
      return data || [];
    }
  });

  const { data: facturas } = useQuery({
    queryKey: ['facturacion_salud'],
    queryFn: async () => {
      const { data, error } = await supabase.from('facturacion').select('*');
      if (error) throw error;
      return data || [];
    }
  });

  const { data: equipo } = useQuery({
    queryKey: ['equipo_salud'],
    queryFn: async () => {
      const { data, error } = await supabase.from('equipo').select('*').eq('activo', true);
      if (error) throw error;
      return data || [];
    }
  });

  const { data: clientes } = useQuery({
    queryKey: ['clientes_salud'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id, nombre, estado').eq('estado', 'activo');
      if (error) throw error;
      return data || [];
    }
  });

  const { data: configRows } = useQuery({
    queryKey: ['configuracion_salud'],
    queryFn: async () => {
      const { data } = await supabase.from('configuracion').select('*').in('clave', [
        'saldos_iniciales', 
        'costo_direccion_mensual', 
        'gastos_fijos_estimados',
        'extra_reserva_mensual'
      ]);
      return data || [];
    }
  });

  const configSaldos = JSON.parse(configRows?.find(r => r.clave === 'saldos_iniciales')?.valor || '{}');
  const costoDireccion = Number(configRows?.find(r => r.clave === 'costo_direccion_mensual')?.valor || 0);
  const gastosFijos = Number(configRows?.find(r => r.clave === 'gastos_fijos_estimados')?.valor || 0);
  const extraReserva = Number(configRows?.find(r => r.clave === 'extra_reserva_mensual')?.valor || 0);

  const saveConfigMutation = useMutation({
    mutationFn: async (updates: { clave: string, valor: string }[]) => {
      for (const update of updates) {
        const existing = configRows?.find(r => r.clave === update.clave);
        if (existing) {
          await supabase.from('configuracion').update({ valor: update.valor }).eq('id', existing.id);
        } else {
          await supabase.from('configuracion').insert([{ clave: update.clave, valor: update.valor, descripcion: 'Configuración de Salud Financiera' }]);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuracion_salud'] });
      showSuccess('Configuración actualizada');
      setIsConfigOpen(false);
    },
    onError: (err: any) => showError(err.message)
  });

  const { 
    saldos, grilla, mesesNames, totalCajaARS, totalARS_puro, totalUSD_puro, 
    fondoReservaObjetivo, excedente, porcentajeFondo, costoMensualReserva, montoRealHoy
  } = useMemo(() => {
    const defaultState = { 
      saldos: {}, 
      grilla: { ingresos: {}, egresos: {}, totales: Array(12).fill(0).map(() => ({ ingresos: 0, egresos: 0, neto: 0, margen: 0, saldoCaja: 0 })) }, 
      mesesNames: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'], 
      totalCajaARS: 0, totalARS_puro: 0, totalUSD_puro: 0, 
      fondoReservaObjetivo: 0, excedente: 0, porcentajeFondo: 0, costoMensualReserva: 0, montoRealHoy: 0
    };

    if (!movimientos || !facturas || !equipo || !clientes) return defaultState;

    const saldosCalc: Record<string, { ars: number, usd: number }> = {};
    Object.entries(configSaldos).forEach(([cuenta, monto]) => {
      const val = Number(monto);
      if (!isNaN(val)) saldosCalc[cuenta] = { ars: val, usd: 0 };
    });

    const mesesKeys = Array.from({ length: 12 }, (_, i) => `${yearSelected}-${String(i + 1).padStart(2, '0')}`);
    const ingresosPorCategoria: Record<string, { nombre: string, data: number[], details: any[][] }> = {};
    const egresosPorCategoria: Record<string, { nombre: string, data: number[], details: any[][] }> = {};
    const totalesMes = mesesKeys.map(() => ({ ingresos: 0, egresos: 0, neto: 0, margen:0, saldoCaja: 0 }));

    let saldoInicialAnio = 0;
    Object.values(saldosCalc).forEach(s => { saldoInicialAnio += s.ars; });

    movimientos.forEach(m => {
      if (!m.fecha) return;
      const notasParsed = parseNotas(m.notas);
      const isUSD = notasParsed.moneda === 'USD';
      const notasTexto = notasParsed.texto;
      
      const montoOriginal = Number(m.monto) || 0;
      const valorEnPesos = isUSD ? montoOriginal * cotizacion : montoOriginal;

      if (!saldosCalc[m.cuenta]) saldosCalc[m.cuenta] = { ars: 0, usd: 0 };

      if (m.tipo === 'ingreso') {
        if (isUSD) saldosCalc[m.cuenta].usd += montoOriginal;
        else saldosCalc[m.cuenta].ars += montoOriginal;
      } else if (m.tipo === 'egreso') {
        if (isUSD) saldosCalc[m.cuenta].usd -= montoOriginal;
        else saldosCalc[m.cuenta].ars -= montoOriginal;
      } else if (m.tipo === 'transferencia' && m.cuenta_destino) {
        if (!saldosCalc[m.cuenta_destino]) saldosCalc[m.cuenta_destino] = { ars: 0, usd: 0 };
        if (isUSD) {
          saldosCalc[m.cuenta].usd -= montoOriginal;
          saldosCalc[m.cuenta_destino].usd += montoOriginal;
        } else {
          saldosCalc[m.cuenta].ars -= montoOriginal;
          saldosCalc[m.cuenta_destino].ars += montoOriginal;
        }
      }

      const anioMov = parseInt(m.fecha.substring(0, 4));
      if (anioMov < yearSelected) {
        if (m.tipo === 'ingreso') saldoInicialAnio += valorEnPesos;
        else if (m.tipo === 'egreso') saldoInicialAnio -= valorEnPesos;
      } else if (anioMov === yearSelected) {
        const mesIndex = mesesKeys.indexOf(m.fecha.substring(0, 7));
        if (mesIndex !== -1 && (m.tipo === 'ingreso' || m.tipo === 'egreso')) {
          const movConDetalle = { ...m, valorEnPesos, notasTexto, isUSD };
          if (m.tipo === 'ingreso') {
            const cat = m.concepto || 'Otros Ingresos';
            if (!ingresosPorCategoria[cat]) ingresosPorCategoria[cat] = { nombre: cat, data: Array(12).fill(0), details: Array(12).fill(0).map(() => []) };
            ingresosPorCategoria[cat].data[mesIndex] += valorEnPesos;
            ingresosPorCategoria[cat].details[mesIndex].push(movConDetalle);
            totalesMes[mesIndex].ingresos += valorEnPesos;
          } else {
            const cat = m.concepto || 'Otros Gastos';
            if (!egresosPorCategoria[cat]) egresosPorCategoria[cat] = { nombre: cat, data: Array(12).fill(0), details: Array(12).fill(0).map(() => []) };
            egresosPorCategoria[cat].data[mesIndex] += valorEnPesos;
            egresosPorCategoria[cat].details[mesIndex].push(movConDetalle);
            totalesMes[mesIndex].egresos += valorEnPesos;
          }
        }
      }
    });

    let totalCajaARS = 0;
    let totalARS_puro = 0;
    let totalUSD_puro = 0;
    Object.values(saldosCalc).forEach(s => {
      totalARS_puro += s.ars;
      totalUSD_puro += s.usd;
      totalCajaARS += s.ars + (s.usd * cotizacion);
    });

    let acumulado = saldoInicialAnio;
    totalesMes.forEach(t => { 
      t.neto = t.ingresos - t.egresos; 
      t.margen = t.ingresos > 0 ? (t.neto / t.ingresos) * 100 : 0; 
      acumulado += t.neto;
      t.saldoCaja = acumulado;
    });

    const hoy = new Date();
    const mesActualKey = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    
    const ingresosPendientesMes = facturas
      .filter(f => f.mes?.startsWith(mesActualKey) && f.estado !== 'pagado')
      .reduce((acc, f) => acc + Number(f.monto_final || f.monto_base || 0), 0);

    const egresosEquipoMes = equipo.reduce((acc, e) => {
      const notas = parseNotas(e.notas);
      let totalMiembro = Number(e.honorario_mensual || 0);
      Object.entries(notas.asignaciones).forEach(([cId, monto]) => {
        if (clientes.find(c => c.id === cId)) totalMiembro += Number(monto);
      });
      return acc + totalMiembro;
    }, 0);

    const montoRealHoy = totalCajaARS + ingresosPendientesMes - egresosEquipoMes;

    const costoMensualReserva = gastosFijos + costoDireccion + extraReserva;
    const fondoReservaObjetivo = costoMensualReserva * 6;
    const excedente = Math.max(0, montoRealHoy - fondoReservaObjetivo);
    const porcentajeFondo = Math.max(0, Math.min(100, (montoRealHoy / (fondoReservaObjetivo || 1)) * 100));

    return { 
      saldos: saldosCalc, 
      mesesNames: defaultState.mesesNames, 
      totalCajaARS, 
      totalARS_puro, 
      totalUSD_puro, 
      fondoReservaObjetivo, 
      excedente, 
      porcentajeFondo, 
      costoMensualReserva,
      montoRealHoy,
      grilla: { ingresos: ingresosPorCategoria, egresos: egresosPorCategoria, totales: totalesMes } 
    };
  }, [movimientos, facturas, equipo, clientes, configSaldos, yearSelected, cotizacion, costoDireccion, gastosFijos, extraReserva]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;
    const userMsg = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsChatLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('asesor-financiero', {
        body: { 
          messages: [...chatMessages, { role: 'user', content: userMsg }],
          contexto: { totalCajaARS, totalARS_puro, totalUSD_puro, fondoReservaObjetivo, excedente, montoRealHoy }
        }
      });
      if (error) throw error;
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err: any) {
      showError(err.message || "No se pudo conectar con el asesor IA.");
    } finally {
      setIsChatLoading(false);
    }
  };

  if (isLoadingMov) return (
    <div className="flex flex-col items-center justify-center h-64">
      <Loader2 className="w-10 h-10 text-jengibre-primary animate-spin mb-4" />
      <p className="text-gray-500 font-medium">Analizando salud financiera...</p>
    </div>
  );

  return (
    <div className="animate-in fade-in duration-500 pb-12 max-w-[100vw] overflow-hidden relative">
      
      {/* MODAL CONFIGURACIÓN META */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsConfigOpen(false)}></div>
          <div className="relative bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95">
            <h3 className="text-xl font-display font-bold mb-4 flex items-center gap-2">
              <Settings className="text-jengibre-primary" /> Configurar Meta de Reserva
            </h3>
            <p className="text-sm text-gray-600 mb-6">Definí los costos estructurales que querés asegurar por 6 meses.</p>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              saveConfigMutation.mutate([
                { clave: 'gastos_fijos_estimados', valor: formData.get('fijos') as string },
                { clave: 'costo_direccion_mensual', valor: formData.get('direccion') as string },
                { clave: 'extra_reserva_mensual', valor: formData.get('extra') as string }
              ]);
            }} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Gastos de Mantenimiento (Fijos)</label>
                <input name="fijos" type="number" defaultValue={gastosFijos} className="w-full border border-gray-300 rounded-lg p-2.5 font-mono" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Sueldo Directora</label>
                <input name="direccion" type="number" defaultValue={costoDireccion} className="w-full border border-gray-300 rounded-lg p-2.5 font-mono" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Extra de Seguridad Mensual</label>
                <input name="extra" type="number" defaultValue={extraReserva} className="w-full border border-gray-300 rounded-lg p-2.5 font-mono" />
              </div>
              
              <div className="bg-jengibre-cream p-3 rounded-xl text-center">
                <p className="text-[10px] font-bold text-gray-500 uppercase">Nueva Meta Total (6 meses)</p>
                <p className="text-lg font-mono font-bold text-jengibre-dark">
                  {formatARS((Number(gastosFijos) + Number(costoDireccion) + Number(extraReserva)) * 6)}
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setIsConfigOpen(false)} className="px-4 py-2 text-gray-500 font-bold">Cancelar</button>
                <button type="submit" className="bg-jengibre-primary text-white px-6 py-2 rounded-lg font-bold">Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PANEL DE DETALLES (DRILL-DOWN) */}
      {selectedDetail && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedDetail(null)}></div>
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-jengibre-dark text-white">
              <div>
                <h3 className="text-xl font-display font-bold">{selectedDetail.categoria}</h3>
                <p className="text-xs opacity-80 uppercase tracking-widest font-bold">{selectedDetail.mes} {yearSelected}</p>
              </div>
              <button onClick={() => setSelectedDetail(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={24} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {selectedDetail.movimientos.length === 0 ? (
                <div className="text-center py-12 text-gray-400"><FileText size={48} className="mx-auto mb-4 opacity-20" /><p>No hay movimientos registrados.</p></div>
              ) : (
                selectedDetail.movimientos.map((m, i) => (
                  <div key={i} className="bg-gray-50 border border-gray-100 p-4 rounded-xl shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1"><Calendar size={10} /> {new Date(m.fecha).toLocaleDateString('es-AR')}</span>
                      <span className={`font-mono font-bold ${m.tipo === 'ingreso' ? 'text-green-600' : 'text-red-600'}`}>{m.tipo === 'ingreso' ? '+' : '-'}{m.isUSD ? formatUSD(m.monto) : formatARS(m.monto)}</span>
                    </div>
                    <p className="text-sm font-bold text-gray-800 mb-1">{m.notasTexto || 'Sin detalle específico'}</p>
                    {m.cliente && <p className="text-[10px] text-blue-600 font-bold uppercase">Cliente: {m.cliente.nombre}</p>}
                    <p className="text-[10px] text-gray-400 mt-2">Cuenta: {m.cuenta}</p>
                  </div>
                ))
              )}
            </div>
            <div className="p-6 border-t border-gray-100 bg-gray-50">
              <div className="flex justify-between items-center">
                <span className="font-bold text-gray-500 uppercase text-xs">Total del Mes:</span>
                <span className="text-xl font-mono font-bold text-jengibre-dark">{formatARS(selectedDetail.movimientos.reduce((acc, m) => acc + m.valorEnPesos, 0))}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-jengibre-dark">Salud Financiera Real</h1>
          <p className="text-gray-600 mt-1">Saldos sincronizados con tus bancos y análisis de excedentes.</p>
        </div>
        <div className="flex items-center bg-white border border-gray-200 rounded-lg shadow-sm">
          <button onClick={() => setYearSelected(y => y - 1)} className="p-2 hover:bg-gray-50"><ChevronLeft size={20} /></button>
          <span className="px-4 font-bold font-mono text-jengibre-primary">{yearSelected}</span>
          <button onClick={() => setYearSelected(y => y + 1)} className="p-2 hover:bg-gray-50"><ChevronRight size={20} /></button>
        </div>
      </header>

      <section className="mb-8">
        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-2"><Landmark size={16} /> Saldos Reales por Cuenta</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {Object.entries(saldos).map(([cuenta, montos]: [string, any]) => {
            const totalConsolidadoCuenta = montos.ars + (montos.usd * cotizacion);
            const hasUSD = montos.usd !== 0;

            return (
              <div key={cuenta} className="p-4 rounded-2xl border bg-white border-jengibre-border shadow-sm hover:shadow-md transition-all group">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-gray-50 text-gray-400 group-hover:text-jengibre-primary transition-colors">
                    <Wallet size={14} />
                  </div>
                  <span className="text-[10px] font-bold uppercase text-gray-500 truncate">{cuenta}</span>
                </div>
                
                {/* Mostramos primero el monto en dólares si existe */}
                {hasUSD ? (
                  <>
                    <p className="text-xl font-mono font-bold text-blue-600 leading-tight">{formatUSD(montos.usd)}</p>
                    <p className="text-[10px] text-gray-400 mt-1">Eq: {formatARS(totalConsolidadoCuenta)}</p>
                  </>
                ) : (
                  <p className="text-xl font-mono font-bold text-gray-900 leading-tight">{formatARS(totalConsolidadoCuenta)}</p>
                )}
              </div>
            );
          })}
          
          <div className="p-4 rounded-2xl border border-jengibre-primary bg-jengibre-primary text-white shadow-lg transform hover:scale-[1.02] transition-all">
            <div className="flex items-center gap-2 mb-2">
              <Landmark size={14} className="opacity-80" />
              <span className="text-[10px] font-bold uppercase opacity-80">Total Agencia (Eq. ARS)</span>
            </div>
            <p className="text-xl font-mono font-bold">{formatARS(totalCajaARS)}</p>
            <p className="text-[10px] opacity-60 mt-1">Consolidado total</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
        <section className="lg:col-span-6 bg-white border border-jengibre-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-display font-bold text-jengibre-dark flex items-center gap-2"><ShieldCheck className="text-jengibre-green" /> Excedentes y Retiros</h2>
            <button onClick={() => setIsConfigOpen(true)} className="p-2 text-gray-400 hover:text-jengibre-primary hover:bg-jengibre-cream rounded-full transition-colors"><Settings size={20} /></button>
          </div>
          
          <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 mb-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Monto Real Proyectado (Hoy)</p>
                <p className="text-2xl font-mono font-bold text-gray-900">{formatARS(montoRealHoy)}</p>
                <div className="mt-2 space-y-1">
                  <p className="text-[10px] text-gray-500 flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div> 
                    Costo Estructural: <span className="font-bold">{formatARS(costoMensualReserva)}</span>
                  </p>
                  <p className="text-[9px] text-gray-400 ml-3 italic">
                    (Mantenimiento: {formatARS(gastosFijos)} + Sueldo Dir: {formatARS(costoDireccion)} + Extra: {formatARS(extraReserva)})
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-jengibre-primary uppercase tracking-widest mb-1">Meta Reserva (6 meses)</p>
                <p className="text-2xl font-mono font-bold text-jengibre-primary">{formatARS(fondoReservaObjetivo)}</p>
              </div>
            </div>
            <div className="h-3 w-full bg-gray-200 rounded-full mt-4 overflow-hidden">
              <div className="h-full bg-jengibre-green transition-all duration-1000" style={{ width: `${porcentajeFondo}%` }}></div>
            </div>
            <div className="flex justify-between items-center mt-2">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Progreso: {porcentajeFondo.toFixed(1)}%</p>
              <p className="text-[10px] text-gray-500 font-medium">Faltan {formatARS(Math.max(0, fondoReservaObjetivo - montoRealHoy))} para la meta</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/30">
              <p className="text-xs font-bold text-indigo-600 uppercase mb-1">Excedente Libre</p>
              <p className="text-2xl font-mono font-bold text-indigo-900">{formatARS(excedente)}</p>
            </div>
            <div className="p-4 rounded-xl border border-gray-100 bg-gray-50">
              <p className="text-xs font-bold text-gray-500 uppercase mb-1">Meses Cubiertos</p>
              <p className="text-2xl font-mono font-bold text-gray-700">{(montoRealHoy / (costoMensualReserva || 1)).toFixed(1)}</p>
            </div>
          </div>
        </section>

        <section className="lg:col-span-6 bg-[#1e293b] text-white rounded-2xl p-6 shadow-lg flex flex-col h-[400px]">
          <h2 className="text-xl font-display font-bold flex items-center gap-2 mb-4"><Bot className="text-indigo-400" /> Asesor Financiero IA</h2>
          <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 custom-scrollbar">
            {chatMessages.length === 0 && <div className="text-sm text-gray-400 italic">Consultame sobre inversiones o retiros de dividendos...</div>}
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`p-3 rounded-xl max-w-[85%] text-sm ${msg.role === 'user' ? 'bg-indigo-600' : 'bg-gray-800 border border-gray-700'}`}>{msg.content}</div>
              </div>
            ))}
            {isChatLoading && <div className="flex justify-start"><div className="bg-gray-800 p-3 rounded-xl"><Loader2 className="animate-spin" size={18} /></div></div>}
          </div>
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input type="text" placeholder="¿Puedo retirar 1 millón hoy?" className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-sm outline-none focus:border-indigo-400" value={chatInput} onChange={e => setChatInput(e.target.value)} />
            <button type="submit" disabled={isChatLoading} className="bg-indigo-600 p-2 rounded-lg disabled:opacity-50"><Send size={18} /></button>
          </form>
        </section>
      </div>

      <section className="bg-white border border-jengibre-border rounded-xl shadow-sm overflow-hidden">
        <div className="bg-[#1A2E40] text-white p-3 text-center font-bold tracking-widest">REGISTRO MENSUAL REAL ({yearSelected})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
            <thead>
              <tr className="bg-gray-100 font-bold border-b-2 border-gray-300">
                <th className="p-2 border-r border-gray-300 sticky left-0 bg-gray-100 z-10">CATEGORÍA</th>
                {mesesNames.map(m => <th key={m} className="p-2 border-r border-gray-300 text-center">{m}</th>)}
                <th className="p-2 text-center bg-gray-200">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-jengibre-green text-white font-bold"><td className="p-2 sticky left-0 bg-jengibre-green z-10">INGRESOS</td><td colSpan={13}></td></tr>
              {Object.values(grilla.ingresos).map((c: any) => (
                <tr key={c.nombre} className="border-b border-gray-100">
                  <td className="p-2 border-r border-gray-300 sticky left-0 bg-white z-10 font-bold">{c.nombre}</td>
                  {c.data.map((v: number, i: number) => (
                    <td key={i} onClick={() => v > 0 && setSelectedDetail({ categoria: c.nombre, mes: mesesNames[i], movimientos: c.details[i] })} className={`p-2 border-r border-gray-300 text-right font-mono text-blue-800 ${v > 0 ? 'cursor-pointer hover:bg-blue-50 transition-colors' : ''}`}>{v > 0 ? formatARS(v) : '-'}</td>
                  ))}
                  <td className="p-2 text-right font-mono font-bold bg-gray-50">{formatARS(c.data.reduce((a: number, b: number) => a + b, 0))}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-bold border-y border-gray-200">
                <td className="p-2 sticky left-0 bg-gray-50 z-10">TOTAL INGRESOS</td>
                {grilla.totales.map((t, i) => <td key={i} className="p-2 text-right font-mono">{formatARS(t.ingresos)}</td>)}
                <td className="p-2 text-right font-mono bg-gray-100">{formatARS(grilla.totales.reduce((a, t) => a + t.ingresos, 0))}</td>
              </tr>
              <tr className="bg-red-600 text-white font-bold"><td className="p-2 sticky left-0 bg-red-600 z-10">EGRESOS</td><td colSpan={13}></td></tr>
              {Object.values(grilla.egresos).map((c: any) => (
                <tr key={c.nombre} className="border-b border-gray-100">
                  <td className="p-2 border-r border-gray-300 sticky left-0 bg-white z-10 font-bold">{c.nombre}</td>
                  {c.data.map((v: number, i: number) => (
                    <td key={i} onClick={() => v > 0 && setSelectedDetail({ categoria: c.nombre, mes: mesesNames[i], movimientos: c.details[i] })} className={`p-2 border-r border-gray-300 text-right font-mono text-red-700 ${v > 0 ? 'cursor-pointer hover:bg-red-50 transition-colors' : ''}`}>{v > 0 ? formatARS(v) : '-'}</td>
                  ))}
                  <td className="p-2 text-right font-mono font-bold bg-gray-50">{formatARS(c.data.reduce((a: number, b: number) => a + b, 0))}</td>
                </tr>
              ))}
              <tr className="bg-red-50 font-bold border-y border-red-200">
                <td className="p-2 sticky left-0 bg-red-50 z-10">TOTAL EGRESOS</td>
                {grilla.totales.map((t, i) => <td key={i} className="p-2 text-right font-mono">{formatARS(t.egresos)}</td>)}
                <td className="p-2 text-right font-mono bg-red-100">{formatARS(grilla.totales.reduce((a, t) => a + t.egresos, 0))}</td>
              </tr>
              <tr className="bg-blue-50 font-bold border-t-2 border-blue-200">
                <td className="p-2 sticky left-0 bg-blue-50 z-10">RESULTADO NETO</td>
                {grilla.totales.map((t, i) => <td key={i} className={`p-2 text-right font-mono ${t.neto < 0 ? 'text-red-600' : 'text-blue-900'}`}>{formatARS(t.neto)}</td>)}
                <td className="p-2 text-right font-mono bg-blue-100">{formatARS(grilla.totales.reduce((a, t) => a + t.neto, 0))}</td>
              </tr>
              <tr className="bg-jengibre-dark text-white font-bold border-t-2 border-white/20">
                <td className="p-2 sticky left-0 bg-jengibre-dark z-10">SALDO ACUMULADO (CAJA)</td>
                {grilla.totales.map((t, i) => <td key={i} className="p-2 text-right font-mono">{formatARS(t.saldoCaja)}</td>)}
                <td className="p-2 text-right font-mono bg-gray-800">{formatARS(grilla.totales[11].saldoCaja)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}