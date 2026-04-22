'} para el carácter conflictivo">
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TipAlert } from '@/components/TipAlert';
import { TrendingUp, TrendingDown, DollarSign, PieChart, ArrowRight, Calendar, LineChart, AlertTriangle } from 'lucide-react';
import { formatARS } from '@/lib/utils';

// Helper de notas del equipo
const parseNotas = (notasStr: string | null) => {
  if (!notasStr) return { asignaciones: {} as Record<string, number> };
  try {
    const parsed = JSON.parse(notasStr);
    if (parsed && typeof parsed === 'object' && parsed.asignaciones) return parsed;
  } catch (e) {}
  return { asignaciones: {} };
};

export default function Proyeccion() {
  const [mesSeleccionado, setMesSeleccionado] = useState(() => {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  });

  // Queries
  const { data: facturas, isLoading: loadingFacturas } = useQuery({
    queryKey: ['proyeccion_facturacion', mesSeleccionado],
    queryFn: async () => {
      const [year, month] = mesSeleccionado.split('-');
      const start = `${year}-${month}-01`;
      const end = new Date(Number(year), Number(month), 0).toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('facturacion')
        .select(`*, cliente:clientes(nombre)`)
        .gte('mes', start)
        .lte('mes', end);
      
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
      // Nos traemos fecha_fin y monto_ars para la simulación anual
      const { data, error } = await supabase.from('clientes').select('id, nombre, estado, monto_ars, fecha_fin').eq('estado', 'activo');
      if (error) throw error;
      return data;
    }
  });

  // 1. Cálculos de ESTE MES SELECCIONADO
  const stats = useMemo(() => {
    if (!facturas || !equipo || !clientes) return { ingresos: 0, egresosEquipo: 0, resultado: 0, margen: 0, listadoEquipo: [] };

    // Total Ingresos Esperados (Sacado de las facturas programadas)
    const ingresos = facturas.reduce((acc, f) => acc + Number(f.monto_final || f.monto_base || 0), 0);

    // Total Egresos Equipo (Base + Proyectos Activos EN ESTE MES)
    const listadoEquipo = equipo.map(miembro => {
      const notasData = parseNotas(miembro.notas);
      let costoProyectos = 0;
      let proyectosAsignados = 0;

      Object.entries(notasData.asignaciones).forEach(([cId, monto]) => {
        const c = clientes.find((cl: any) => cl.id === cId);
        if (c && c.estado === 'activo') {
          // El contrato debe estar vigente en el mes seleccionado para pagarle al equipo
          const finString = c.fecha_fin ? c.fecha_fin.substring(0, 7) : '9999-99';
          if (finString >= mesSeleccionado) {
            costoProyectos += Number(monto);
            proyectosAsignados++;
          }
        }
      });

      const total = Number(miembro.honorario_mensual) + costoProyectos;
      return { ...miembro, total, proyectosAsignados, honorarioProyectos: costoProyectos };
    }).sort((a, b) => b.total - a.total);

    const egresosEquipo = listadoEquipo.reduce((acc, m) => acc + m.total, 0);

    // Resultado Económico
    const resultado = ingresos - egresosEquipo;
    const margen = ingresos > 0 ? (resultado / ingresos) * 100 : 0;

    return { ingresos, egresosEquipo, resultado, margen, listadoEquipo };
  }, [facturas, equipo, clientes, mesSeleccionado]);


  // 2. Cálculos para PROYECCIÓN ANUAL (12 Meses Vista MRR)
  const anualStats = useMemo(() => {
    if (!clientes || !equipo) return [];
    
    // Generamos los próximos 12 meses
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

      // A) Calculamos qué clientes están activos este mes simulado
      clientes.forEach((c: any) => {
         const finString = c.fecha_fin ? c.fecha_fin.substring(0, 7) : '9999-99';
         
         // Si el vencimiento es mayor o igual al mes simulado, el cliente paga
         if (finString >= mesString) {
            ingresos += Number(c.monto_ars || 0);
            clientesActivosMes.add(c.id);
            
            // Si vence JUSTO este mes, lo guardamos para la alerta
            if (finString === mesString) {
               vencimientos.push(c.nombre);
            }
         }
      });

      // B) Calculamos los costos, cruzando con el Set de clientes que sobrevivieron este mes
      let costos = 0;
      equipo.forEach((e: any) => {
         costos += Number(e.honorario_mensual || 0);
         const notas = parseNotas(e.notas);
         Object.entries(notas.asignaciones || {}).forEach(([cId, monto]) => {
            // SOLO se paga el proyecto si el cliente sigue activo este mes
            if (clientesActivosMes.has(cId)) {
               costos += Number(monto);
            }
         });
      });

      const neto = ingresos - costos;
      const margen = ingresos > 0 ? (neto / ingresos) * 100 : 0;
      const nombreMes = date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

      return {
        id: mesString,
        label: `${nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)} ${year}`,
        ingresos,
        costos,
        neto,
        margen,
        vencimientos
      };
    });
  }, [clientes, equipo]);

  const isLoading = loadingFacturas || loadingEquipo || loadingClientes;

  return (
    <div className="animate-in fade-in duration-500 pb-12 w-full">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-jengibre-dark">Proyección Mensual y Anual</h1>
          <p className="text-gray-600 mt-1">Conocé la salud económica esperada y visualizá futuros baches de caja.</p>
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

      <TipAlert id="proyeccion_intro" title="💡 Costos Inteligentes">
        El sistema detecta los vencimientos de contratos. Si un cliente no renueva en un mes futuro, el ingreso decae, <strong>pero el costo proporcional que se le paga a tu equipo por ese proyecto también desaparece automáticamente</strong>, manteniendo real tu cálculo de gastos.
      </TipAlert>

      {/* TARJETAS DE RESUMEN DEL MES SELECCIONADO */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-jengibre-border p-5 rounded-2xl shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <TrendingUp size={18} className="text-green-600" />
            <h3 className="text-sm font-bold uppercase tracking-wider">Ingresos Esperados</h3>
          </div>
          <p className="text-3xl font-mono font-bold text-gray-900">{isLoading ? '...' : formatARS(stats.ingresos)}</p>
          <p className="text-xs text-gray-400 mt-2">Suma de facturas del mes seleccionado</p>
        </div>

        <div className="bg-white border border-jengibre-border p-5 rounded-2xl shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <TrendingDown size={18} className="text-red-500" />
            <h3 className="text-sm font-bold uppercase tracking-wider">Honorarios Equipo</h3>
          </div>
          <p className="text-3xl font-mono font-bold text-gray-900">{isLoading ? '...' : formatARS(stats.egresosEquipo)}</p>
          <p className="text-xs text-gray-400 mt-2">Sueldos base + proyectos activos</p>
        </div>

        <div className={`border p-5 rounded-2xl shadow-sm ${stats.resultado >= 0 ? 'bg-jengibre-green/10 border-jengibre-green/30' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center gap-2 text-gray-600 mb-2">
            <DollarSign size={18} className={stats.resultado >= 0 ? 'text-jengibre-green' : 'text-red-600'} />
            <h3 className="text-sm font-bold uppercase tracking-wider">Resultado Proyectado</h3>
          </div>
          <p className={`text-3xl font-mono font-bold ${stats.resultado >= 0 ? 'text-green-800' : 'text-red-700'}`}>
            {isLoading ? '...' : formatARS(stats.resultado)}
          </p>
          <p className="text-xs opacity-70 mt-2 font-medium">Plata limpia (antes de impuestos)</p>
        </div>

        <div className="bg-jengibre-dark text-white p-5 rounded-2xl shadow-sm">
          <div className="flex items-center gap-2 text-gray-300 mb-2">
            <PieChart size={18} />
            <h3 className="text-sm font-bold uppercase tracking-wider">Margen de Rentabilidad</h3>
          </div>
          <p className="text-3xl font-mono font-bold">{isLoading ? '...' : `${stats.margen.toFixed(1)}%`}</p>
          <p className="text-xs text-gray-400 mt-2">Objetivo saludable: {">"} 25%</p>
        </div>
      </div>

      {/* DETALLES DEL MES SELECCIONADO */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* COLUMNA INGRESOS */}
        <div className="bg-white border border-jengibre-border rounded-2xl overflow-hidden shadow-sm flex flex-col">
          <div className="bg-gray-50 px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-display font-bold text-lg text-gray-800">Facturación a Cobrar</h3>
            <span className="bg-green-100 text-green-800 text-xs font-bold px-2.5 py-1 rounded-full">{facturas?.length || 0} cuotas</span>
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
                          <p className="text-xs text-gray-500">Cuota {row.cuota}</p>
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

        {/* COLUMNA EGRESOS */}
        <div className="bg-white border border-jengibre-border rounded-2xl overflow-hidden shadow-sm flex flex-col">
          <div className="bg-gray-50 px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-display font-bold text-lg text-gray-800">Pagos al Equipo</h3>
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
                          <span className="bg-gray-100 px-1 rounded">{miembro.proyectosAsignados} proyectos</span>
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
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* NUEVO BLOQUE: PROYECCIÓN ANUAL MRR */}
      <section className="mt-12 animate-in fade-in slide-in-from-bottom-4">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-display font-bold text-jengibre-dark flex items-center gap-2">
              <LineChart className="text-jengibre-primary" /> Proyección Anual (MRR)
            </h2>
            <p className="text-gray-600 mt-1">
              Simulación de 12 meses basándose en el Abono Base de tus clientes y sus fechas de vencimiento.
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
                  <th className="px-5 py-4 font-bold text-right">Costo Equipo</th>
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
                    // Verificamos si los ingresos decaen respecto al mes anterior
                    const prevIngresos = i > 0 ? anualStats[i-1].ingresos : stat.ingresos;
                    const decae = stat.ingresos < prevIngresos;

                    return (
                      <tr key={stat.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${decae ? 'bg-red-50/20' : ''}`}>
                        <td className="px-5 py-4 font-bold text-gray-900">{stat.label}</td>
                        <td className="px-5 py-4 text-right">
                          <span className={`font-mono font-bold ${decae ? 'text-red-600' : 'text-green-700'}`}>
                            {formatARS(stat.ingresos)}
                          </span>
                          {decae && <TrendingDown size={14} className="inline ml-1 text-red-500" />}
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