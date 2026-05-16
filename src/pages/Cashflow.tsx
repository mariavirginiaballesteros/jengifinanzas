import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TipAlert } from '@/components/TipAlert';
import { Wallet, ArrowUpRight, ArrowDownRight, Landmark, TrendingUp, Calendar, Info } from 'lucide-react';
import { formatARS } from '@/lib/utils';
import { useCotizacionOficial } from '@/hooks/useCotizacion';

const parseNotas = (notasStr: string | null) => {
  if (!notasStr) return { asignaciones: {} as Record<string, number> };
  try {
    const parsed = JSON.parse(notasStr);
    if (parsed && typeof parsed === 'object' && parsed.asignaciones) return parsed;
  } catch (e) {}
  return { asignaciones: {} };
};

export default function Cashflow() {
  const { data: cotizacionData } = useCotizacionOficial();
  const cotizacion = cotizacionData || 1000;

  // --- DATA FETCHING ---
  const { data: movimientos, isLoading: loadingMov } = useQuery({
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

    return meses.map((date, index) => {
      const mesKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const esMesActual = index === 0;

      // Ingresos: Facturación pendiente
      const ingresosFacturados = facturas
        .filter(f => f.mes?.startsWith(mesKey) && f.estado !== 'pagado')
        .reduce((acc, f) => acc + Number(f.monto_final || f.monto_base || 0), 0);

      // Si es mes futuro y no hay facturas, usamos MRR
      let ingresosProyectados = ingresosFacturados;
      if (!esMesActual && ingresosFacturados === 0) {
        clientes.forEach((c: any) => {
          const finString = c.fecha_fin ? c.fecha_fin.substring(0, 7) : '9999-99';
          const inicioString = c.fecha_inicio ? c.fecha_inicio.substring(0, 7) : '0000-00';
          if (finString >= mesKey && inicioString <= mesKey) {
            ingresosProyectados += Number(c.monto_ars || 0) + (Number(c.monto_usd || 0) * cotizacion);
          }
        });
      }

      // Egresos: Equipo + Fijos
      let egresosEquipo = 0;
      equipo.forEach(miembro => {
        const notasData = parseNotas(miembro.notas);
        let costoProyectos = 0;
        Object.entries(notasData.asignaciones).forEach(([cId, monto]) => {
          const c = clientes.find((cl: any) => cl.id === cId);
          if (c && c.estado === 'activo') {
            const finString = c.fecha_fin ? c.fecha_fin.substring(0, 7) : '9999-99';
            const inicioString = c.fecha_inicio ? c.fecha_inicio.substring(0, 7) : '0000-00';
            if (finString >= mesKey && inicioString <= mesKey) costoProyectos += Number(monto);
          }
        });
        egresosEquipo += Number(miembro.honorario_mensual) + costoProyectos;
      });

      const egresosTotales = egresosEquipo + gastosFijos;
      const netoMes = ingresosProyectados - egresosTotales;
      acumulado += netoMes;

      return {
        label: date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
        ingresos: ingresosProyectados,
        egresos: egresosTotales,
        neto: netoMes,
        saldoFinal: acumulado
      };
    });
  }, [movimientos, configSaldos, facturas, clientes, equipo, gastosFijos, cotizacion]);

  const saldoHoy = projection[0]?.saldoFinal - projection[0]?.neto || 0;

  return (
    <div className="animate-in fade-in duration-500 pb-12 w-full">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-jengibre-dark flex items-center gap-3">
            <Wallet className="text-jengibre-primary" size={32} />
            Cashflow Proyectado
          </h1>
          <p className="text-gray-600 mt-1">Evolución de tu liquidez real basada en saldos actuales y compromisos futuros.</p>
        </div>
        <div className="bg-white border border-jengibre-border p-4 rounded-2xl shadow-sm text-center min-w-[200px]">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Saldo Real Hoy</p>
          <p className="text-2xl font-mono font-bold text-jengibre-dark">{formatARS(saldoHoy)}</p>
        </div>
      </header>

      <TipAlert id="cashflow_info" title="💡 ¿Cómo leer esta pestaña?">
        Esta tabla parte de tu **dinero real en banco hoy**. Mes a mes, suma lo que esperás cobrar (pendientes de facturación o abonos base) y resta tus costos operativos (equipo y fijos). El **Saldo Final** te indica cuánta plata tendrías en mano al terminar cada mes.
      </TipAlert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-jengibre-border rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-display font-bold text-lg text-gray-800 flex items-center gap-2">
                <Calendar size={20} className="text-jengibre-primary" /> Cronograma de Liquidez
              </h2>
              <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded-full uppercase">Proyección a Diciembre</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-50/50 text-gray-500 uppercase tracking-wider text-[10px] font-bold border-b border-gray-100">
                    <th className="px-6 py-4">Mes</th>
                    <th className="px-6 py-4 text-right">Ingresos Est.</th>
                    <th className="px-6 py-4 text-right">Egresos Est.</th>
                    <th className="px-6 py-4 text-right">Neto Mes</th>
                    <th className="px-6 py-4 text-right bg-jengibre-cream/20">Saldo en Caja</th>
                  </tr>
                </thead>
                <tbody>
                  {projection.map((item, i) => (
                    <tr key={i} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${i === 0 ? 'bg-blue-50/30' : ''}`}>
                      <td className="px-6 py-5 font-bold text-gray-900 capitalize">
                        {item.label}
                        {i === 0 && <span className="ml-2 text-[9px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full uppercase">Actual</span>}
                      </td>
                      <td className="px-6 py-5 text-right font-mono text-green-600 font-medium">{formatARS(item.ingresos)}</td>
                      <td className="px-6 py-5 text-right font-mono text-red-500 font-medium">{formatARS(item.egresos)}</td>
                      <td className={`px-6 py-5 text-right font-mono font-bold ${item.neto >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {item.neto >= 0 ? '+' : ''}{formatARS(item.neto)}
                      </td>
                      <td className="px-6 py-5 text-right font-mono font-bold text-lg text-jengibre-dark bg-jengibre-cream/10">
                        {formatARS(item.saldoFinal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-jengibre-dark text-white p-6 rounded-2xl shadow-xl relative overflow-hidden">
            <div className="absolute -right-4 -top-4 opacity-10"><TrendingUp size={120} /></div>
            <div className="relative z-10">
              <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                <Info size={16} /> Resumen de Cierre
              </h3>
              <div className="space-y-6">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Saldo Proyectado a Diciembre</p>
                  <p className="text-3xl font-mono font-bold text-jengibre-secondary">
                    {formatARS(projection[projection.length - 1]?.saldoFinal || 0)}
                  </p>
                </div>
                <div className="pt-4 border-t border-white/10">
                  <p className="text-xs text-gray-400 mb-1">Crecimiento de Caja Est.</p>
                  <p className="text-xl font-mono font-bold text-green-400">
                    +{formatARS((projection[projection.length - 1]?.saldoFinal || 0) - saldoHoy)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-jengibre-border p-6 rounded-2xl shadow-sm">
            <h3 className="font-display font-bold text-gray-800 mb-4">Alertas de Liquidez</h3>
            <div className="space-y-3">
              {projection.some(m => m.saldoFinal < 0) ? (
                <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded-r-lg flex items-start gap-3">
                  <ArrowDownRight className="text-red-600 shrink-0" size={18} />
                  <p className="text-xs text-red-800 font-medium">Se detectó un posible saldo negativo en los próximos meses. Revisá tus egresos.</p>
                </div>
              ) : (
                <div className="bg-green-50 border-l-4 border-green-500 p-3 rounded-r-lg flex items-start gap-3">
                  <ArrowUpRight className="text-green-600 shrink-0" size={18} />
                  <p className="text-xs text-green-800 font-medium">Tu flujo de caja se mantiene positivo durante todo el año.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}