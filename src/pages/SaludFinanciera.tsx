import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatARS } from '@/lib/utils';
import { TipAlert } from '@/components/TipAlert';
import { Wallet, TrendingUp, TrendingDown, Activity, ChevronLeft, ChevronRight } from 'lucide-react';

export default function SaludFinanciera() {
  const [yearSelected, setYearSelected] = useState(new Date().getFullYear());

  // Traer todos los movimientos de caja reales
  const { data: movimientos, isLoading } = useQuery({
    queryKey: ['movimientos_salud'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('movimientos')
        .select(`*, cliente:clientes(nombre)`)
        .order('fecha', { ascending: true });
      if (error) throw error;
      return data;
    }
  });

  // Procesar datos para los saldos y la grilla
  const { saldos, grilla, mesesNames } = useMemo(() => {
    if (!movimientos) return { saldos: {}, grilla: { ingresos: {}, egresos: {}, totales: {} }, mesesNames: [] };

    // 1. Calcular Saldos Totales Históricos
    const saldosCalc: Record<string, number> = {};
    movimientos.forEach(m => {
      const monto = Number(m.monto);
      if (!saldosCalc[m.cuenta]) saldosCalc[m.cuenta] = 0;
      saldosCalc[m.cuenta] += m.tipo === 'ingreso' ? monto : -monto;
    });

    // 2. Armar estructura de la grilla mensual para el AÑO SELECCIONADO
    const mesesKeys = Array.from({ length: 12 }, (_, i) => `${yearSelected}-${String(i + 1).padStart(2, '0')}`);
    const mesesNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    const ingresosPorCliente: Record<string, { nombre: string, data: number[] }> = {};
    const egresosPorConcepto: Record<string, { data: number[] }> = {};
    const totalesMes = mesesKeys.map(() => ({ ingresos: 0, egresos: 0, neto: 0, margen: 0 }));

    // Filtrar solo los movimientos del año seleccionado para la grilla
    const movimientosAnio = movimientos.filter(m => m.fecha.startsWith(yearSelected.toString()));

    movimientosAnio.forEach(m => {
      const monto = Number(m.monto);
      const mesPrefix = m.fecha.substring(0, 7);
      const mesIndex = mesesKeys.indexOf(mesPrefix);
      
      if (mesIndex === -1) return; // Por si hay fechas raras

      if (m.tipo === 'ingreso') {
        const clientId = m.cliente_id || 'sin-cliente';
        const clientName = m.cliente?.nombre || 'Ingresos sin cliente asignado';
        
        if (!ingresosPorCliente[clientId]) {
          ingresosPorCliente[clientId] = { nombre: clientName, data: Array(12).fill(0) };
        }
        ingresosPorCliente[clientId].data[mesIndex] += monto;
        totalesMes[mesIndex].ingresos += monto;
      } 
      else if (m.tipo === 'egreso') {
        // Agrupamos por concepto. Lo pasamos a mayúsculas para estandarizar un poco
        const concepto = (m.concepto || 'Varios').toUpperCase().trim();
        
        if (!egresosPorConcepto[concepto]) {
          egresosPorConcepto[concepto] = { data: Array(12).fill(0) };
        }
        egresosPorConcepto[concepto].data[mesIndex] += monto;
        totalesMes[mesIndex].egresos += monto;
      }
    });

    // Calcular Neto y Margen
    totalesMes.forEach(t => {
      t.neto = t.ingresos - t.egresos;
      t.margen = t.ingresos > 0 ? (t.neto / t.ingresos) * 100 : 0;
    });

    return {
      saldos: saldosCalc,
      mesesNames,
      grilla: {
        ingresos: ingresosPorCliente,
        egresos: egresosPorConcepto,
        totales: totalesMes
      }
    };
  }, [movimientos, yearSelected]);

  const totalCajaGlobal = Object.values(saldos).reduce((a, b) => a + b, 0);

  // Ordenar clientes alfabéticamente
  const clientesOrdenados = Object.values(grilla.ingresos).sort((a, b) => a.nombre.localeCompare(b.nombre));
  // Ordenar egresos de mayor a menor según el total del año
  const egresosOrdenados = Object.entries(grilla.egresos).sort((a, b) => {
    const totalA = a[1].data.reduce((x, y) => x + y, 0);
    const totalB = b[1].data.reduce((x, y) => x + y, 0);
    return totalB - totalA;
  });

  if (isLoading) return <div className="p-12 text-center">Cargando datos reales...</div>;

  return (
    <div className="animate-in fade-in duration-500 pb-12 max-w-[100vw] overflow-hidden">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-jengibre-dark">Salud Financiera Real</h1>
          <p className="text-gray-600 mt-1">Control de caja y matriz de flujo de fondos (Cashflow real).</p>
        </div>
        <div className="flex items-center bg-white border border-gray-200 rounded-lg shadow-sm">
          <button onClick={() => setYearSelected(y => y - 1)} className="p-2 hover:bg-gray-50 text-gray-600"><ChevronLeft size={20} /></button>
          <span className="px-4 font-bold font-mono text-jengibre-primary">{yearSelected}</span>
          <button onClick={() => setYearSelected(y => y + 1)} className="p-2 hover:bg-gray-50 text-gray-600"><ChevronRight size={20} /></button>
        </div>
      </header>

      <TipAlert id="salud_finanzas" title="💡 Datos basados en la realidad">
        Esta pantalla <strong>NO lee lo facturado</strong>, sino lo que ingresaste en la pestaña "Caja". Si algo no cuadra acá, es porque falta cargarlo como movimiento cobrado o pagado en tu libro de caja.
      </TipAlert>

      {/* BLOQUE DE SALDOS (BILLETERAS) */}
      <section className="mb-8">
        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-2">
          <Wallet size={16} /> Saldos Reales por Cuenta
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {Object.entries(saldos).map(([cuenta, monto]) => {
            // Destacar cuentas clave
            const isFondo = cuenta.toUpperCase().includes('FONDO');
            return (
              <div key={cuenta} className={`p-4 rounded-xl border shadow-sm flex flex-col justify-center ${
                isFondo ? 'bg-jengibre-green/10 border-jengibre-green/30' : 'bg-white border-jengibre-border'
              }`}>
                <span className={`text-xs font-bold uppercase mb-1 ${isFondo ? 'text-jengibre-green' : 'text-gray-500'}`}>
                  {cuenta}
                </span>
                <span className={`text-lg font-mono font-bold ${monto < 0 ? 'text-red-500' : 'text-gray-900'}`}>
                  {formatARS(monto)}
                </span>
              </div>
            );
          })}
          <div className="p-4 rounded-xl border border-jengibre-primary bg-jengibre-primary text-white shadow-sm flex flex-col justify-center">
            <span className="text-xs font-bold uppercase mb-1 text-jengibre-cream opacity-80">Total Disponible</span>
            <span className="text-lg font-mono font-bold">{formatARS(totalCajaGlobal)}</span>
          </div>
        </div>
      </section>

      {/* MATRIZ MENSUAL ESTILO EXCEL */}
      <section className="bg-white border border-jengibre-border rounded-xl shadow-sm overflow-hidden">
        <div className="bg-[#1A2E40] text-white p-3 text-center border-b border-gray-700">
          <h2 className="font-bold tracking-widest">JENGIBRE — REGISTRO MENSUAL REAL ({yearSelected})</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-800 font-bold border-b-2 border-gray-300">
                <th className="p-2 border-r border-gray-300 w-64 min-w-[250px] sticky left-0 bg-gray-100 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">CONCEPTO</th>
                {mesesNames.map(m => <th key={m} className="p-2 border-r border-gray-300 text-center w-28">{m}</th>)}
                <th className="p-2 text-center bg-gray-200">TOTAL AÑO</th>
              </tr>
            </thead>
            
            <tbody>
              {/* --- INGRESOS --- */}
              <tr className="bg-[#1A6B5C] text-white font-bold">
                <td className="p-2 sticky left-0 bg-[#1A6B5C] z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">INGRESOS REALES COBRADOS ($)</td>
                <td colSpan={13} className="p-2"></td>
              </tr>
              {clientesOrdenados.map(c => {
                const totalRow = c.data.reduce((a, b) => a + b, 0);
                if (totalRow === 0) return null; // Ocultar filas vacías todo el año
                return (
                  <tr key={c.nombre} className="border-b border-gray-100 hover:bg-yellow-50/50">
                    <td className="p-2 border-r border-gray-200 sticky left-0 bg-white group-hover:bg-yellow-50/50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] font-medium text-gray-700 truncate max-w-[250px]">{c.nombre}</td>
                    {c.data.map((monto, i) => (
                      <td key={i} className="p-2 border-r border-gray-200 text-right font-mono text-blue-800">
                        {monto > 0 ? formatARS(monto) : '-'}
                      </td>
                    ))}
                    <td className="p-2 text-right font-mono font-bold bg-gray-50">{formatARS(totalRow)}</td>
                  </tr>
                );
              })}
              <tr className="bg-gray-100 font-bold border-y-2 border-gray-300">
                <td className="p-2 border-r border-gray-300 sticky left-0 bg-gray-100 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">TOTAL INGRESOS REALES</td>
                {grilla.totales.map((t, i) => (
                  <td key={i} className="p-2 border-r border-gray-300 text-right font-mono text-gray-900">{formatARS(t.ingresos)}</td>
                ))}
                <td className="p-2 text-right font-mono text-gray-900 bg-gray-200">
                  {formatARS(grilla.totales.reduce((a, t) => a + t.ingresos, 0))}
                </td>
              </tr>

              {/* --- EGRESOS --- */}
              <tr className="bg-[#1A6B5C] text-white font-bold">
                <td className="p-2 sticky left-0 bg-[#1A6B5C] z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] mt-4 block w-full border-t-[16px] border-white">COSTOS Y GASTOS REALES PAGADOS ($)</td>
                <td colSpan={13} className="p-2 border-t-[16px] border-white bg-[#1A6B5C]"></td>
              </tr>
              {egresosOrdenados.map(([concepto, info]) => {
                const totalRow = info.data.reduce((a, b) => a + b, 0);
                if (totalRow === 0) return null;
                return (
                  <tr key={concepto} className="border-b border-gray-100 hover:bg-yellow-50/50">
                    <td className="p-2 border-r border-gray-200 sticky left-0 bg-white group-hover:bg-yellow-50/50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-gray-700 truncate max-w-[250px] capitalize">{concepto.toLowerCase()}</td>
                    {info.data.map((monto, i) => (
                      <td key={i} className="p-2 border-r border-gray-200 text-right font-mono text-red-700">
                        {monto > 0 ? formatARS(monto) : '-'}
                      </td>
                    ))}
                    <td className="p-2 text-right font-mono font-bold bg-gray-50 text-red-800">{formatARS(totalRow)}</td>
                  </tr>
                );
              })}
              <tr className="bg-red-50 font-bold border-y-2 border-red-200 text-red-900">
                <td className="p-2 border-r border-red-200 sticky left-0 bg-red-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">TOTAL COSTOS REALES</td>
                {grilla.totales.map((t, i) => (
                  <td key={i} className="p-2 border-r border-red-200 text-right font-mono">{formatARS(t.egresos)}</td>
                ))}
                <td className="p-2 text-right font-mono bg-red-100">
                  {formatARS(grilla.totales.reduce((a, t) => a + t.egresos, 0))}
                </td>
              </tr>

              {/* --- RESULTADOS --- */}
              <tr className="bg-[#1A6B5C] text-white font-bold">
                <td className="p-2 sticky left-0 bg-[#1A6B5C] z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] mt-4 block w-full border-t-[16px] border-white">RESULTADO NETO REAL ($)</td>
                <td colSpan={13} className="p-2 border-t-[16px] border-white bg-[#1A6B5C]"></td>
              </tr>
              <tr className="bg-[#f0f9ff] font-bold border-b border-blue-100 text-blue-900">
                <td className="p-2 border-r border-blue-200 sticky left-0 bg-[#f0f9ff] z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Resultado Neto Mensual</td>
                {grilla.totales.map((t, i) => (
                  <td key={i} className={`p-2 border-r border-blue-200 text-right font-mono ${t.neto < 0 ? 'text-red-600' : ''}`}>
                    {formatARS(t.neto)}
                  </td>
                ))}
                <td className="p-2 text-right font-mono bg-blue-100">
                  {formatARS(grilla.totales.reduce((a, t) => a + t.neto, 0))}
                </td>
              </tr>
              <tr className="bg-[#fefce8] border-b border-yellow-200 text-yellow-900">
                <td className="p-2 border-r border-yellow-200 sticky left-0 bg-[#fefce8] z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Margen Neto %</td>
                {grilla.totales.map((t, i) => (
                  <td key={i} className={`p-2 border-r border-yellow-200 text-right font-mono ${t.margen < 0 ? 'text-red-500 font-bold' : ''}`}>
                    {t.ingresos > 0 ? `${t.margen.toFixed(1)}%` : '-'}
                  </td>
                ))}
                <td className="p-2 border-r border-yellow-200 bg-yellow-100"></td>
              </tr>

            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}