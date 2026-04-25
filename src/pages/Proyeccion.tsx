import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TipAlert } from '@/components/TipAlert';
import { TrendingUp, TrendingDown, DollarSign, PieChart, ArrowRight, Calendar, LineChart, AlertTriangle, Info, Edit2, Settings } from 'lucide-react';
import { formatARS } from '@/lib/utils';
import { showSuccess, showError } from '@/utils/toast';
import { useCotizacionOficial } from '@/hooks/useCotizacion';

const parseNotas = (notasStr: string | null) => {
  if (!notasStr) return { asignaciones: {} as Record<string, number> };
  try {
    const parsed = JSON.parse(notasStr);
    if (parsed && typeof parsed === 'object' && parsed.asignaciones) return parsed;
  } catch (e) {}
  return { asignaciones: {} };
};

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
        // Acá contemplamos tanto el monto ARS como el monto USD convertido al Oficial
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

      return {
        id: mesString, label: `${nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)} ${year}`,
        ingresos, costos, neto, margen, vencimientos
      };
    });
  }, [clientes, equipo, gastosFijos, cotizacion]);

  const isLoading = loadingFacturas || loadingEquipo || loadingClientes || loadingFijos;

  const handleOpenFijos = () => {
    setFijosInput(gastosFijos.toString());
    setFijosModalOpen(true);
  };

  return (
    <div className="animate-in fade-in duration-500 pb-12 w-full">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-jengibre-dark">Proyección Mensual y Anual</h1>
          <p className="text-gray-600 mt-1">Simulador de rentabilidad cruzando tus ingresos facturados contra tus costos operativos.</p>
        </div>
        <div className="flex items-center gap-3 bg-white border border-gray-200 p-2 rounded-xl shadow-sm">
          <Calendar className="text-gray-400 ml-2" size={20} />
          <input 
            type="month" 
            value={mesSeleccionado}
            onChange={(e) => setMesSeleccionado(e.target.value)}
            className="border-none outline-none font-bold text-jengibre-primary bg-transparent cursor-pointer"
          />
        </div>
      </header>

      <TipAlert id="proyeccion_origen_datos" title="💡 ¿De dónde salen estos números?">
        <ul className="list-disc pl-5 space-y-1 mt-2 text-sm text-gray-700">
          <li><strong>Facturación Real:</strong> Suma las cuotas que ya generaste en la pestaña <em>Facturación</em> para este mes.</li>
          <li><strong>MRR Teórico:</strong> Suma los abonos base de los clientes. <em>(Los montos en USD se convierten dinámicamente al tipo de cambio oficial BNA para la proyección).</em></li>
          <li><strong>Egresos Totales:</strong> Suma lo que le pagás al equipo + los <em>Gastos Fijos Estimados</em>.</li>
        </ul>
      </TipAlert>

      {fijosModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl animate-in zoom-in-95">
            <h2 className="text-2xl font-display font-bold mb-2 flex items-center gap-2">
              <Settings className="text-jengibre-primary" /> Costos Fijos Mensuales
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              Ingresá un monto promedio estimado para cubrir los gastos operativos que no son sueldos (ej: Monotributo, Autónomos, Estudio Contable, Software, Mantenimiento, etc.). Este valor se restará automáticamente en las proyecciones.
            </p>

            <form onSubmit={(e) => { e.preventDefault(); saveFijosMutation.mutate(fijosInput); }}>
              <label className="block text-sm font-bold text-gray-700 mb-1">Monto Mensual Estimado (ARS)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                <input 
                  type="number" step="1000" min="0" required autoFocus
                  className="w-full border border-gray-300 rounded-lg p-3 pl-8 outline-none focus:ring-2 focus:ring-jengibre-primary font-mono text-lg"
                  value={fijosInput} onChange={e => setFijosInput(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-100">
                <button type="button" onClick={() => setFijosModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors">Cancelar</button>
                <button type="submit" disabled={saveFijosMutation.isPending} className="bg-jengibre-primary hover:bg-[#a64120] text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50">
                  {saveFijosMutation.isPending ? 'Guardando...' : 'Guardar Fijos'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TARJETAS DE RESUMEN DEL MES SELECCIONADO */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        
        <div className="bg-white border border-jengibre-border p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-10"><TrendingUp size={48} /></div>
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <TrendingUp size={18} className="text-blue-600" />
            <h3 className="text-sm font-bold uppercase tracking-wider">Facturación Real</h3>
          </div>
          <p className="text-3xl font-mono font-bold text-blue-900">{isLoading ? '...' : formatARS(stats.ingresosFacturados)}</p>
          <p className="text-[11px] text-gray-500 mt-1">Suma de la pestaña Facturación</p>
          
          <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1" title="Suma todos los abonos en ARS y USD convertidos a pesos">
              <Info size={12} /> MRR Teórico (Abonos)
            </span>
            <span className="font-mono font-bold text-gray-700 text-sm">{isLoading ? '...' : formatARS(stats.mrrEsperado)}</span>
          </div>
        </div>

        <div className="bg-white border border-jengibre-border p-5 rounded-2xl shadow-sm relative group">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-gray-500">
              <TrendingDown size={18} className="text-red-500" />
              <h3 className="text-sm font-bold uppercase tracking-wider">Egresos Totales</h3>
            </div>
            <button 
              onClick={handleOpenFijos} 
              className="text-[10px] flex items-center gap-1 text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded font-bold transition-colors"
            >
              <Edit2 size={10} /> Editar Fijos
            </button>
          </div>
          <p className="text-3xl font-mono font-bold text-gray-900">{isLoading ? '...' : formatARS(stats.egresosTotales)}</p>
          <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center text-[11px]">
            <span className="text-gray-500">Equipo: <strong className="text-gray-800 font-mono text-xs">{formatARS(stats.egresosEquipo)}</strong></span>
            <span className="text-gray-500">Fijos: <strong className="text-gray-800 font-mono text-xs">{formatARS(stats.gastosFijos)}</strong></span>
          </div>
        </div>

        <div className={`border p-5 rounded-2xl shadow-sm flex flex-col justify-between ${stats.resultado >= 0 ? 'bg-jengibre-green/10 border-jengibre-green/30' : 'bg-red-50 border-red-200'}`}>
          <div>
            <div className="flex items-center gap-2 text-gray-600 mb-2">
              <DollarSign size={18} className={stats.resultado >= 0 ? 'text-jengibre-green' : 'text-red-600'} />
              <h3 className="text-sm font-bold uppercase tracking-wider">Resultado Proyectado</h3>
            </div>
            <p className={`text-3xl font-mono font-bold ${stats.resultado >= 0 ? 'text-green-800' : 'text-red-700'}`}>
              {isLoading ? '...' : formatARS(stats.resultado)}
            </p>
          </div>
          <p className="text-[11px] opacity-70 mt-3 font-medium border-t border-black/5 pt-2">Facturado - Egresos Totales</p>
        </div>

        <div className="bg-jengibre-dark text-white p-5 rounded-2xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-gray-300 mb-2">
              <PieChart size={18} />
              <h3 className="text-sm font-bold uppercase tracking-wider">Margen de Rentabilidad</h3>
            </div>
            <p className="text-3xl font-mono font-bold">{isLoading ? '...' : `${stats.margen.toFixed(1)}%`}</p>
          </div>
          <p className="text-[11px] text-gray-400 mt-3 border-t border-white/10 pt-2">Objetivo saludable: {">"} 25%</p>
        </div>
      </div>

      {/* DETALLES DEL MES SELECCIONADO */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white border border-jengibre-border rounded-2xl overflow-hidden shadow-sm flex flex-col">
          <div className="bg-gray-50 px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-display font-bold text-lg text-gray-800">Desglose de Facturación</h3>
              <p className="text-xs text-gray-500">Lo que programaste en la pestaña Facturación</p>
            </div>
            <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-1 rounded-full">{facturas?.length || 0} cuotas</span>
          </div>
          <div className="p-0 overflow-y-auto max-h-[400px]">
            {isLoading ? (
              <div className="p-8 text-center text-gray-400">Cargando...</div>
            ) : facturas?.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No hay facturas programadas para este mes.</div>
            ) : (
              <table className="w-full text-left text-sm whitespace-nowrap">
                <tbody>
                  {facturas?.sort((a,b) => (Number(b.monto_final||b.monto_base) - Number(a.monto_final||a.monto_base))).map((row) => {
                    const monto = Number(row.monto_final || row.monto_base || 0);
                    const cobrado = row.estado === 'pagado';
                    
                    return (
                      <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3">
                          <p className="font-bold text-gray-900">{row.cliente?.nombre || 'Manual / Sin cliente'}</p>
                          <p className="text-[11px] text-gray-500">Cuota {row.cuota}</p>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <p className="font-mono font-bold text-gray-900">{formatARS(monto)}</p>
                          <p className={`text-[10px] font-bold uppercase mt-0.5 ${cobrado ? 'text-green-600' : 'text-amber-500'}`}>
                            {cobrado ? 'Pagado' : 'Pendiente'}
                          </p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="bg-white border border-jengibre-border rounded-2xl overflow-hidden shadow-sm flex flex-col">
          <div className="bg-gray-50 px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-display font-bold text-lg text-gray-800">Desglose de Equipo</h3>
              <p className="text-xs text-gray-500">Según contratos de clientes vigentes este mes</p>
            </div>
            <span className="bg-red-100 text-red-800 text-xs font-bold px-2.5 py-1 rounded-full">{stats.listadoEquipo.length} personas</span>
          </div>
          <div className="p-0 overflow-y-auto max-h-[400px]">
            {isLoading ? (
              <div className="p-8 text-center text-gray-400">Cargando...</div>
            ) : stats.listadoEquipo.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No hay miembros activos en el equipo.</div>
            ) : (
              <table className="w-full text-left text-sm whitespace-nowrap">
                <tbody>
                  {stats.listadoEquipo.map((miembro) => (
                    <tr key={miembro.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-bold text-gray-900">{miembro.nombre}</p>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <span className="bg-gray-100 px-1 rounded">{miembro.proyectosAsignados} proyectos activos</span>
                        </p>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <p className="font-mono font-bold text-gray-900">{formatARS(miembro.total)}</p>
                        <p className="text-[10px] text-gray-400 uppercase mt-0.5" title="Base + Proyectos Activos">
                          B: {formatARS(Number(miembro.honorario_mensual))} <ArrowRight size={10} className="inline text-gray-300" /> P: {formatARS(miembro.honorarioProyectos)}
                        </p>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-100 bg-gray-50">
                    <td className="px-5 py-4">
                      <p className="font-bold text-gray-700">Costos Fijos / Mantenimiento</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">Monto estimado cargado manualmente</p>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <p className="font-mono font-bold text-gray-700">{formatARS(stats.gastosFijos)}</p>
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <section className="mt-12 animate-in fade-in slide-in-from-bottom-4">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-display font-bold text-jengibre-dark flex items-center gap-2">
              <LineChart className="text-jengibre-primary" /> Proyección Anual a Futuro (MRR Teórico)
            </h2>
            <p className="text-gray-600 mt-1">
              Como no tenemos las facturas creadas para todo el año que viene, esta tabla <strong>utiliza los Abonos Base de Clientes (MRR)</strong> y ya contempla la resta automática del Equipo y los Costos Fijos Estimados.
            </p>
          </div>
        </div>

        <div className="bg-white border border-jengibre-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 uppercase tracking-wider text-xs">
                  <th className="px-5 py-4 font-bold">Mes</th>
                  <th className="px-5 py-4 font-bold text-right">Ingresos (MRR)</th>
                  <th className="px-5 py-4 font-bold text-right" title="Equipo + Fijos Estimados">Costo Total</th>
                  <th className="px-5 py-4 font-bold text-right">Resultado</th>
                  <th className="px-5 py-4 font-bold text-right">Margen</th>
                  <th className="px-5 py-4 font-bold">Alertas y Vencimientos</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} className="p-8 text-center text-gray-400">Cargando proyección...</td></tr>
                ) : (
                  anualStats.map((stat, i) => {
                    const prevIngresos = i > 0 ? anualStats[i-1].ingresos : stat.ingresos;
                    const decae = stat.ingresos < prevIngresos;

                    return (
                      <tr key={stat.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${decae ? 'bg-red-50/20' : ''}`}>
                        <td className="px-5 py-4 font-bold text-gray-900">{stat.label}</td>
                        <td className="px-5 py-4 text-right">
                          <span className={`font-mono font-bold ${decae ? 'text-red-600' : 'text-gray-700'}`}>
                            {formatARS(stat.ingresos)}
                          </span>
                          {decae && <TrendingDown size={14} className="inline ml-1 text-red-500" title="Caída de ingresos" />}
                        </td>
                        <td className="px-5 py-4 text-right font-mono text-gray-600">
                          {formatARS(stat.costos)}
                        </td>
                        <td className="px-5 py-4 text-right font-mono font-bold text-gray-900">
                          {formatARS(stat.neto)}
                        </td>
                        <td className="px-5 py-4 text-right font-mono">
                          <span className={`px-2 py-1 rounded-md text-xs font-bold ${stat.margen < 20 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            {stat.margen.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          {stat.vencimientos.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {stat.vencimientos.map((v, idx) => (
                                <span key={idx} className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-1 rounded border border-amber-200">
                                  Vence: {v}
                                </span>
                              ))}
                            </div>
                          ) : decae ? (
                            <span className="text-xs text-red-500 font-medium flex items-center gap-1">
                              <AlertTriangle size={14} /> Caída de ingresos sin renovación
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

    </div>
  );
}