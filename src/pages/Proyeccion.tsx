)">
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TipAlert } from '@/components/TipAlert';
import { TrendingUp, TrendingDown, DollarSign, PieChart, ArrowRight, Calendar } from 'lucide-react';
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
      const { data, error } = await supabase.from('clientes').select('id, nombre, estado');
      if (error) throw error;
      return data;
    }
  });

  // Cálculos
  const stats = useMemo(() => {
    if (!facturas || !equipo || !clientes) return { ingresos: 0, egresosEquipo: 0, resultado: 0, margen: 0, listadoEquipo: [] };

    // 1. Total Ingresos Esperados
    const ingresos = facturas.reduce((acc, f) => acc + Number(f.monto_final || f.monto_base || 0), 0);

    // 2. Total Egresos Equipo (Base + Proyectos Activos)
    const listadoEquipo = equipo.map(miembro => {
      const notasData = parseNotas(miembro.notas);
      let costoProyectos = 0;
      let proyectosAsignados = 0;

      Object.entries(notasData.asignaciones).forEach(([cId, monto]) => {
        const c = clientes.find((cl: any) => cl.id === cId);
        if (c && c.estado === 'activo') {
          costoProyectos += Number(monto);
          proyectosAsignados++;
        }
      });

      const total = Number(miembro.honorario_mensual) + costoProyectos;
      return { ...miembro, total, proyectosAsignados, honorarioProyectos: costoProyectos };
    }).sort((a, b) => b.total - a.total);

    const egresosEquipo = listadoEquipo.reduce((acc, m) => acc + m.total, 0);

    // 3. Resultado Económico
    const resultado = ingresos - egresosEquipo;
    const margen = ingresos > 0 ? (resultado / ingresos) * 100 : 0;

    return { ingresos, egresosEquipo, resultado, margen, listadoEquipo };
  }, [facturas, equipo, clientes]);

  const isLoading = loadingFacturas || loadingEquipo || loadingClientes;

  return (
    <div className="animate-in fade-in duration-500 pb-12 w-full">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-jengibre-dark">Proyección Mensual</h1>
          <p className="text-gray-600 mt-1">Conocé qué va a pasar este mes con los ingresos y costos fijos.</p>
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

      <TipAlert id="proyeccion_intro" title="💡 ¿Cómo funciona esta pantalla?">
        Esta proyección es un <strong>simulador económico</strong>. Toma las cuotas que programaste en "Facturación" para este mes y le resta los honorarios que configuraste en "Equipo" (cruzado con los clientes activos de hoy). Así sabrás cuánta plata debería quedarte limpia.
      </TipAlert>

      {/* TARJETAS DE RESUMEN */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-jengibre-border p-5 rounded-2xl shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <TrendingUp size={18} className="text-green-600" />
            <h3 className="text-sm font-bold uppercase tracking-wider">Ingresos Esperados</h3>
          </div>
          <p className="text-3xl font-mono font-bold text-gray-900">{isLoading ? '...' : formatARS(stats.ingresos)}</p>
          <p className="text-xs text-gray-400 mt-2">Suma de facturación del mes</p>
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
          <p className="text-xs text-gray-400 mt-2">Objetivo saludable: > 25%</p>
        </div>
      </div>

      {/* DETALLES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* COLUMNA INGRESOS */}
        <div className="bg-white border border-jengibre-border rounded-2xl overflow-hidden shadow-sm flex flex-col">
          <div className="bg-gray-50 px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-display font-bold text-lg text-gray-800">Facturación a Cobrar</h3>
            <span className="bg-green-100 text-green-800 text-xs font-bold px-2.5 py-1 rounded-full">{facturas?.length || 0} cuotas</span>
          </div>
          <div className="p-0 overflow-y-auto max-h-[500px]">
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
          <div className="p-0 overflow-y-auto max-h-[500px]">
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
                        <p className="text-[10px] text-gray-400 uppercase mt-0.5" title="Base + Proyectos">
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
    </div>
  );
}