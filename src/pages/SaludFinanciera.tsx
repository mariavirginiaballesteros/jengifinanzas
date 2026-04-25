import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatARS, formatUSD } from '@/lib/utils';
import { TipAlert } from '@/components/TipAlert';
import { Wallet, ChevronLeft, ChevronRight, Bot, Sparkles, ShieldCheck, Unlock, ArrowRight, Lightbulb, TrendingUp } from 'lucide-react';
import { useCotizacionOficial } from '@/hooks/useCotizacion';

export default function SaludFinanciera() {
  const [yearSelected, setYearSelected] = useState(new Date().getFullYear());
  const { data: cotizacionData } = useCotizacionOficial();
  const cotizacion = cotizacionData || 1000;

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

  const { 
    saldos, grilla, mesesNames, totalCajaARS, totalARS_puro, totalUSD_puro, 
    avgCostos, fondoReservaObjetivo, excedente, porcentajeFondo, aiInsights 
  } = useMemo(() => {
    if (!movimientos) return { 
      saldos: {}, grilla: { ingresos: {}, egresos: {}, totales: [] }, mesesNames: [], 
      totalCajaARS: 0, totalARS_puro: 0, totalUSD_puro: 0, avgCostos: 0, fondoReservaObjetivo: 0, excedente: 0, porcentajeFondo: 0, aiInsights: [] 
    };

    const saldosCalc: Record<string, { ars: number, usd: number }> = {};
    let cajaTotalARS = 0;
    let arsPuros = 0;
    let usdPuros = 0;

    const mesesKeys = Array.from({ length: 12 }, (_, i) => `${yearSelected}-${String(i + 1).padStart(2, '0')}`);
    const mesesNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    const ingresosPorCliente: Record<string, { nombre: string, data: number[] }> = {};
    const egresosPorConcepto: Record<string, { data: number[] }> = {};
    const totalesMes = mesesKeys.map(() => ({ ingresos: 0, egresos: 0, neto: 0, margen: 0 }));

    movimientos.forEach(m => {
      let isUSD = false;
      try { const p = JSON.parse(m.notas || '{}'); if (p.moneda === 'USD') isUSD = true; } catch(e){}
      
      const montoOriginal = Number(m.monto);
      const valorEnPesos = isUSD ? montoOriginal * cotizacion : montoOriginal;
      const factor = m.tipo === 'ingreso' ? 1 : -1;

      // Calcular para cajas
      if (!saldosCalc[m.cuenta]) saldosCalc[m.cuenta] = { ars: 0, usd: 0 };
      if (isUSD) {
        saldosCalc[m.cuenta].usd += montoOriginal * factor;
        usdPuros += montoOriginal * factor;
      } else {
        saldosCalc[m.cuenta].ars += montoOriginal * factor;
        arsPuros += montoOriginal * factor;
      }
      
      cajaTotalARS += valorEnPesos * factor;

      // Calcular para la grilla
      if (m.fecha.startsWith(yearSelected.toString())) {
        const mesPrefix = m.fecha.substring(0, 7);
        const mesIndex = mesesKeys.indexOf(mesPrefix);
        if (mesIndex === -1) return;

        if (m.tipo === 'ingreso') {
          const clientId = m.cliente_id || 'sin-cliente';
          const clientName = m.cliente?.nombre || 'Ingresos sin cliente asignado';
          
          if (!ingresosPorCliente[clientId]) ingresosPorCliente[clientId] = { nombre: clientName, data: Array(12).fill(0) };
          ingresosPorCliente[clientId].data[mesIndex] += valorEnPesos;
          totalesMes[mesIndex].ingresos += valorEnPesos;
        } 
        else if (m.tipo === 'egreso') {
          const concepto = (m.concepto || 'Varios').toUpperCase().trim();
          if (!egresosPorConcepto[concepto]) egresosPorConcepto[concepto] = { data: Array(12).fill(0) };
          egresosPorConcepto[concepto].data[mesIndex] += valorEnPesos;
          totalesMes[mesIndex].egresos += valorEnPesos;
        }
      }
    });

    const mesesConMovimientos = totalesMes.filter(t => t.ingresos > 0 || t.egresos > 0);
    const promedioCostos = mesesConMovimientos.length > 0
      ? mesesConMovimientos.reduce((acc, t) => acc + t.egresos, 0) / mesesConMovimientos.length
      : 0;

    totalesMes.forEach(t => {
      t.neto = t.ingresos - t.egresos;
      t.margen = t.ingresos > 0 ? (t.neto / t.ingresos) * 100 : 0;
    });

    // Cálculos de Inteligencia / Excedentes
    const objFondo = promedioCostos > 0 ? promedioCostos * 6 : 1000000; 
    const exc = Math.max(0, cajaTotalARS - objFondo);
    // Evitamos valores negativos en la barra de progreso
    const pct = Math.max(0, Math.min(100, (cajaTotalARS / objFondo) * 100));

    // Motor de Asistente Financiero (Reglas)
    const insights = [];
    
    // 1. Análisis de Liquidez vs Inflación
    if (arsPuros > promedioCostos * 1.5) {
      insights.push({
        type: 'invest',
        title: 'Exceso de liquidez en pesos detectado',
        text: `Tenés ${formatARS(arsPuros)} inmovilizados en ARS, lo cual supera tus gastos operativos promedio mensuales (${formatARS(promedioCostos)}). Para evitar que se devalúen por inflación, sugerimos colocar al menos ${formatARS(arsPuros - promedioCostos)} en un Fondo Común de Inversión (FCI) Money Market (Ej: MercadoPago/Ualá) o cauciones a 7 días. Así generan interés diario y podés rescatarlos rápido si los necesitás.`
      });
    }

    // 2. Análisis de Dolarización
    const porcentajeUSD = cajaTotalARS > 0 ? ((usdPuros * cotizacion) / cajaTotalARS) * 100 : 0;
    if (porcentajeUSD < 30 && exc > 0) {
      insights.push({
        type: 'currency',
        title: 'Oportunidad de Cobertura Cambiaria',
        text: `Solo el ${porcentajeUSD.toFixed(1)}% de tu caja está dolarizada. Aprovechando que tenés un excedente real, te recomendamos derivar un 20% de esos fondos libres a la compra de USD (MEP o Cripto) para diversificar el riesgo país de tu fondo de reserva.`
      });
    }

    // 3. Análisis de Retiros
    if (exc > 0) {
      insights.push({
        type: 'profit',
        title: 'Excedente listo para distribuir',
        text: `Tu caja está súper sana. Ya cubriste los 6 meses de fondo de seguridad. Podés retirar los ${formatARS(exc)} libres. Sugerencia de gestión: Retirá el 50% (${formatARS(exc * 0.5)}) como distribución de ganancias para los socios, e invertí el otro 50% en pauta, software o herramientas para hacer crecer la agencia.`
      });
    } else {
      insights.push({
        type: 'warning',
        title: 'Fase de Construcción de Capital',
        text: `Tu caja actual cubre ${(cajaTotalARS / (promedioCostos || 1)).toFixed(1)} meses de operación. El objetivo son 6 meses de ahorro. No te recomendamos hacer retiros de ganancias todavía. Todo ingreso extra debería dejarse en el circuito para engrosar el fondo de emergencia.`
      });
    }

    return {
      saldos: saldosCalc,
      mesesNames,
      totalCajaARS: cajaTotalARS,
      totalARS_puro: arsPuros,
      totalUSD_puro: usdPuros,
      avgCostos: promedioCostos,
      fondoReservaObjetivo: objFondo,
      excedente: exc,
      porcentajeFondo: pct,
      grilla: { ingresos: ingresosPorCliente, egresos: egresosPorConcepto, totales: totalesMes },
      aiInsights: insights
    };
  }, [movimientos, yearSelected, cotizacion]);

  const clientesOrdenados = Object.values(grilla.ingresos).sort((a, b) => a.nombre.localeCompare(b.nombre));
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
          <p className="text-gray-600 mt-1">Control de caja, análisis de excedentes y asesoramiento automático.</p>
        </div>
        <div className="flex items-center bg-white border border-gray-200 rounded-lg shadow-sm">
          <button onClick={() => setYearSelected(y => y - 1)} className="p-2 hover:bg-gray-50 text-gray-600"><ChevronLeft size={20} /></button>
          <span className="px-4 font-bold font-mono text-jengibre-primary">{yearSelected}</span>
          <button onClick={() => setYearSelected(y => y + 1)} className="p-2 hover:bg-gray-50 text-gray-600"><ChevronRight size={20} /></button>
        </div>
      </header>

      {/* BLOQUE DE SALDOS (BILLETERAS) */}
      <section className="mb-8">
        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-2">
          <Wallet size={16} /> Saldos Reales por Cuenta
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {Object.entries(saldos).map(([cuenta, montos]) => {
            const isFondo = cuenta.toUpperCase().includes('FONDO');
            const hasArs = montos.ars !== 0;
            const hasUsd = montos.usd !== 0;
            
            return (
              <div key={cuenta} className={`p-4 rounded-xl border shadow-sm flex flex-col justify-center ${
                isFondo ? 'bg-jengibre-green/10 border-jengibre-green/30' : 'bg-white border-jengibre-border'
              }`}>
                <span className={`text-xs font-bold uppercase mb-1 ${isFondo ? 'text-jengibre-green' : 'text-gray-500'}`}>
                  {cuenta}
                </span>
                {hasArs && <span className={`text-lg font-mono font-bold ${montos.ars < 0 ? 'text-red-500' : 'text-gray-900'}`}>{formatARS(montos.ars)}</span>}
                {hasUsd && <span className={`text-lg font-mono font-bold ${montos.usd < 0 ? 'text-red-500' : 'text-emerald-700'}`}>{formatUSD(montos.usd)}</span>}
                {!hasArs && !hasUsd && <span className="text-lg font-mono font-bold text-gray-400">$ 0</span>}
              </div>
            );
          })}
          <div className="p-4 rounded-xl border border-jengibre-primary bg-jengibre-primary text-white shadow-sm flex flex-col justify-center">
            <span className="text-xs font-bold uppercase mb-1 text-jengibre-cream opacity-80">Total General (Eq. ARS)</span>
            <span className="text-lg font-mono font-bold">{formatARS(totalCajaARS)}</span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
        {/* CALCULADORA DE EXCEDENTES */}
        <section className="lg:col-span-7 bg-white border border-jengibre-border rounded-2xl p-6 shadow-sm flex flex-col">
          <h2 className="text-xl font-display font-bold text-jengibre-dark flex items-center gap-2 mb-2">
            <ShieldCheck className="text-jengibre-green" /> Distribución de Excedentes y Retiros
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            El sistema calcula tu costo de vida mensual promedio y reserva automáticamente 6 meses de dinero "intocable". El resto se considera ganancia libre.
          </p>

          <div className="flex flex-col gap-6">
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
              <div className="flex justify-between items-end mb-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Costo Operativo Promedio</p>
                  <p className="text-xl font-mono font-bold text-gray-900">{formatARS(avgCostos)} <span className="text-sm font-sans font-normal text-gray-500">/ mes</span></p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold uppercase tracking-wider text-jengibre-primary">Meta (Fondo 6 Meses)</p>
                  <p className="text-xl font-mono font-bold text-jengibre-primary">{formatARS(fondoReservaObjetivo)}</p>
                </div>
              </div>
              
              {/* BARRA DE PROGRESO */}
              <div className="h-4 w-full bg-gray-200 rounded-full mt-4 overflow-hidden flex relative">
                <div className="h-full bg-jengibre-green transition-all duration-1000" style={{ width: `${porcentajeFondo}%` }}></div>
                {porcentajeFondo >= 100 && (
                  <div className="absolute top-0 right-0 bottom-0 left-0 bg-jengibre-primary/20 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,.2)_50%,transparent_75%,transparent_100%)] bg-[length:20px_20px] animate-[slide_1s_linear_infinite]"></div>
                )}
              </div>
              <p className="text-xs text-gray-500 text-center mt-2 font-medium">
                Tu caja actual cubre el {porcentajeFondo.toFixed(1)}% del fondo de reserva objetivo.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 border border-jengibre-green/30 bg-jengibre-green/5 p-4 rounded-xl">
                <div className="flex items-center gap-2 text-jengibre-green mb-1">
                  <ShieldCheck size={18} />
                  <p className="text-sm font-bold uppercase tracking-wider">Capital Inmovilizado</p>
                </div>
                <p className="text-2xl font-mono font-bold text-jengibre-dark">{formatARS(Math.min(Math.max(0, totalCajaARS), fondoReservaObjetivo))}</p>
                <p className="text-[10px] text-gray-500 mt-1 leading-tight">Dinero de emergencia operativo. No debería retirarse.</p>
              </div>

              <div className={`flex-1 border p-4 rounded-xl ${excedente > 0 ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className={`flex items-center gap-2 mb-1 ${excedente > 0 ? 'text-indigo-600' : 'text-gray-500'}`}>
                  <Unlock size={18} />
                  <p className="text-sm font-bold uppercase tracking-wider">Excedente Libre</p>
                </div>
                <p className={`text-2xl font-mono font-bold ${excedente > 0 ? 'text-indigo-900' : 'text-gray-500'}`}>
                  {formatARS(excedente)}
                </p>
                <p className={`text-[10px] mt-1 leading-tight ${excedente > 0 ? 'text-indigo-600' : 'text-gray-400'}`}>
                  {excedente > 0 ? 'Dinero libre para retirar como ganancia o inversión pura.' : 'Aún no hay ganancias libres disponibles.'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ASESOR INTELIGENTE */}
        <section className="lg:col-span-5 bg-[#1e293b] text-white border border-gray-700 rounded-2xl p-6 shadow-lg relative overflow-hidden flex flex-col">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 blur-3xl rounded-full"></div>
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-pink-500/20 blur-3xl rounded-full"></div>
          
          <h2 className="text-xl font-display font-bold flex items-center gap-2 mb-1 relative z-10">
            <Bot className="text-indigo-400" /> Asesor Financiero IA
          </h2>
          <p className="text-sm text-gray-400 mb-6 relative z-10">
            Análisis automático de tus movimientos y recomendaciones para potenciar tu capital.
          </p>

          <div className="space-y-4 overflow-y-auto pr-2 relative z-10 flex-1">
            {aiInsights.map((insight, idx) => (
              <div key={idx} className="bg-gray-800/50 border border-gray-700 p-4 rounded-xl backdrop-blur-sm">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg shrink-0 ${
                    insight.type === 'invest' ? 'bg-blue-500/20 text-blue-400' : 
                    insight.type === 'profit' ? 'bg-emerald-500/20 text-emerald-400' : 
                    insight.type === 'currency' ? 'bg-purple-500/20 text-purple-400' : 
                    'bg-amber-500/20 text-amber-400'
                  }`}>
                    {insight.type === 'invest' ? <TrendingUp size={18} /> : 
                     insight.type === 'profit' ? <Sparkles size={18} /> : 
                     insight.type === 'currency' ? <Wallet size={18} /> : 
                     <Lightbulb size={18} />}
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-100 text-sm">{insight.title}</h4>
                    <p className="text-xs text-gray-300 mt-1 leading-relaxed">{insight.text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* MATRIZ MENSUAL ESTILO EXCEL */}
      <section className="bg-white border border-jengibre-border rounded-xl shadow-sm overflow-hidden">
        <div className="bg-[#1A2E40] text-white p-3 text-center border-b border-gray-700">
          <h2 className="font-bold tracking-widest">JENGIBRE — REGISTRO MENSUAL REAL EQUIVALENTE A PESOS ({yearSelected})</h2>
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