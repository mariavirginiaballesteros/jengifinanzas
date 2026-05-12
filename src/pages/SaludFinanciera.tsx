import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatARS, formatUSD } from '@/lib/utils';
import { TipAlert } from '@/components/TipAlert';
import { Wallet, ChevronLeft, ChevronRight, Bot, Sparkles, ShieldCheck, Unlock, Lightbulb, TrendingUp, Settings, Send, Loader2, Landmark } from 'lucide-react';
import { useCotizacionOficial } from '@/hooks/useCotizacion';
import { showSuccess, showError } from '@/utils/toast';

export default function SaludFinanciera() {
  const queryClient = useQueryClient();
  const [yearSelected, setYearSelected] = useState(new Date().getFullYear());
  const { data: cotizacionData } = useCotizacionOficial();
  const cotizacion = cotizacionData || 1000;

  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const { data: movimientos, isLoading: isLoadingMov } = useQuery({
    queryKey: ['movimientos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('movimientos').select(`*, cliente:clientes(nombre)`).order('fecha', { ascending: true });
      if (error) throw error;
      return data;
    }
  });

  const { data: configSaldos } = useQuery({
    queryKey: ['configuracion', 'saldos_iniciales'],
    queryFn: async () => {
      const { data } = await supabase.from('configuracion').select('valor').eq('clave', 'saldos_iniciales').maybeSingle();
      return data?.valor ? JSON.parse(data.valor) : {};
    }
  });

  const { data: configDireccion } = useQuery({
    queryKey: ['configuracion', 'costo_direccion_mensual'],
    queryFn: async () => {
      const { data } = await supabase.from('configuracion').select('valor').eq('clave', 'costo_direccion_mensual').maybeSingle();
      return data;
    }
  });

  const costoDireccion = Number(configDireccion?.valor || 0);

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
          contexto: { totalCajaARS, totalARS_puro, totalUSD_puro, avgCostos, costoDireccion, fondoReservaObjetivo, excedente }
        }
      });
      if (error) throw error;
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err: any) {
      showError("No se pudo conectar con el asesor IA.");
    } finally {
      setIsChatLoading(false);
    }
  };

  const { 
    saldos, grilla, mesesNames, totalCajaARS, totalARS_puro, totalUSD_puro, 
    avgCostos, fondoReservaObjetivo, excedente, porcentajeFondo 
  } = useMemo(() => {
    if (!movimientos) return { saldos: {}, grilla: { ingresos: {}, egresos: {}, totales: [] }, mesesNames: [], totalCajaARS: 0, totalARS_puro: 0, totalUSD_puro: 0, avgCostos: 0, fondoReservaObjetivo: 0, excedente: 0, porcentajeFondo: 0 };

    const saldosCalc: Record<string, { ars: number, usd: number }> = {};
    const saldosIniciales = configSaldos || {};
    
    // 1. Cargar saldos iniciales
    Object.entries(saldosIniciales).forEach(([cuenta, monto]) => {
      saldosCalc[cuenta] = { ars: Number(monto), usd: 0 };
    });

    const mesesKeys = Array.from({ length: 12 }, (_, i) => `${yearSelected}-${String(i + 1).padStart(2, '0')}`);
    const mesesNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const ingresosPorCliente: Record<string, { nombre: string, data: number[] }> = {};
    const egresosPorConcepto: Record<string, { data: number[] }> = {};
    const totalesMes = mesesKeys.map(() => ({ ingresos: 0, egresos: 0, neto: 0, margen: 0 }));

    // 2. Procesar movimientos
    movimientos.forEach(m => {
      if (!m.fecha) return;
      
      let isUSD = false;
      try { 
        const p = JSON.parse(m.notas || '{}'); 
        if (p.moneda === 'USD') isUSD = true; 
      } catch(e){}
      
      const montoOriginal = Number(m.monto);
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

      // P&L (Excluye transferencias)
      if (m.fecha.startsWith(yearSelected.toString()) && (m.tipo === 'ingreso' || m.tipo === 'egreso')) {
        const mesIndex = mesesKeys.indexOf(m.fecha.substring(0, 7));
        if (mesIndex !== -1) {
          if (m.tipo === 'ingreso') {
            const clientId = m.cliente_id || 'sin-cliente';
            if (!ingresosPorCliente[clientId]) ingresosPorCliente[clientId] = { nombre: m.cliente?.nombre || 'Otros', data: Array(12).fill(0) };
            ingresosPorCliente[clientId].data[mesIndex] += valorEnPesos;
            totalesMes[mesIndex].ingresos += valorEnPesos;
          } else {
            const concepto = (m.concepto || 'Varios').toUpperCase().trim();
            if (!egresosPorConcepto[concepto]) egresosPorConcepto[concepto] = { data: Array(12).fill(0) };
            egresosPorConcepto[concepto].data[mesIndex] += valorEnPesos;
            totalesMes[mesIndex].egresos += valorEnPesos;
          }
        }
      }
    });

    // 3. Totales
    let cajaTotalARS = 0;
    let arsPuros = 0;
    let usdPuros = 0;
    Object.values(saldosCalc).forEach(s => {
      arsPuros += s.ars;
      usdPuros += s.usd;
      cajaTotalARS += s.ars + (s.usd * cotizacion);
    });

    const mesesConMov = totalesMes.filter(t => t.ingresos > 0 || t.egresos > 0);
    const avgCostos = mesesConMov.length > 0 ? mesesConMov.reduce((acc, t) => acc + t.egresos, 0) / mesesConMov.length : 0;
    totalesMes.forEach(t => { t.neto = t.ingresos - t.egresos; t.margen = t.ingresos > 0 ? (t.neto / t.ingresos) * 100 : 0; });

    const totalCostoMensual = avgCostos + costoDireccion;
    const objFondo = totalCostoMensual > 0 ? totalCostoMensual * 6 : 1000000; 
    const exc = Math.max(0, cajaTotalARS - objFondo);
    const pct = Math.max(0, Math.min(100, (cajaTotalARS / objFondo) * 100));

    return { saldos: saldosCalc, mesesNames, totalCajaARS, totalARS_puro: arsPuros, totalUSD_puro: usdPuros, avgCostos, fondoReservaObjetivo: objFondo, excedente: exc, porcentajeFondo: pct, grilla: { ingresos: ingresosPorCliente, egresos: egresosPorConcepto, totales: totalesMes } };
  }, [movimientos, configSaldos, yearSelected, cotizacion, costoDireccion]);

  if (isLoadingMov) return <div className="p-12 text-center">Cargando...</div>;

  return (
    <div className="animate-in fade-in duration-500 pb-12 max-w-[100vw] overflow-hidden">
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
          {Object.entries(saldos).map(([cuenta, montos]) => (
            <div key={cuenta} className="p-4 rounded-xl border bg-white border-jengibre-border shadow-sm">
              <span className="text-[10px] font-bold uppercase text-gray-400 block mb-1">{cuenta}</span>
              <p className="text-lg font-mono font-bold text-gray-900">{formatARS(montos.ars)}</p>
              {montos.usd !== 0 && <p className="text-sm font-mono font-bold text-emerald-600">{formatUSD(montos.usd)}</p>}
            </div>
          ))}
          <div className="p-4 rounded-xl border border-jengibre-primary bg-jengibre-primary text-white shadow-sm">
            <span className="text-[10px] font-bold uppercase opacity-80 block mb-1">Total Agencia (Eq. ARS)</span>
            <p className="text-lg font-mono font-bold">{formatARS(totalCajaARS)}</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
        <section className="lg:col-span-6 bg-white border border-jengibre-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-display font-bold text-jengibre-dark flex items-center gap-2"><ShieldCheck className="text-jengibre-green" /> Excedentes y Retiros</h2>
          </div>
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6">
            <div className="flex justify-between items-end mb-2">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase">Costo Mensual Total</p>
                <p className="text-xl font-mono font-bold">{formatARS(avgCostos + costoDireccion)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-jengibre-primary uppercase">Meta Reserva (6 meses)</p>
                <p className="text-xl font-mono font-bold text-jengibre-primary">{formatARS(fondoReservaObjetivo)}</p>
              </div>
            </div>
            <div className="h-3 w-full bg-gray-200 rounded-full mt-4 overflow-hidden">
              <div className="h-full bg-jengibre-green transition-all duration-1000" style={{ width: `${porcentajeFondo}%` }}></div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/30">
              <p className="text-xs font-bold text-indigo-600 uppercase mb-1">Excedente Libre</p>
              <p className="text-2xl font-mono font-bold text-indigo-900">{formatARS(excedente)}</p>
            </div>
            <div className="p-4 rounded-xl border border-gray-100 bg-gray-50">
              <p className="text-xs font-bold text-gray-500 uppercase mb-1">Meses Cubiertos</p>
              <p className="text-2xl font-mono font-bold text-gray-700">{(totalCajaARS / (avgCostos + costoDireccion || 1)).toFixed(1)}</p>
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
                <th className="p-2 border-r border-gray-300 sticky left-0 bg-gray-100 z-10">CONCEPTO</th>
                {mesesNames.map(m => <th key={m} className="p-2 border-r border-gray-300 text-center">{m}</th>)}
                <th className="p-2 text-center bg-gray-200">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-jengibre-green text-white font-bold"><td className="p-2 sticky left-0 bg-jengibre-green z-10">INGRESOS</td><td colSpan={13}></td></tr>
              {Object.values(grilla.ingresos).map(c => (
                <tr key={c.nombre} className="border-b border-gray-100">
                  <td className="p-2 border-r border-gray-200 sticky left-0 bg-white z-10">{c.nombre}</td>
                  {c.data.map((v, i) => <td key={i} className="p-2 border-r border-gray-200 text-right font-mono text-blue-800">{v > 0 ? formatARS(v) : '-'}</td>)}
                  <td className="p-2 text-right font-mono font-bold bg-gray-50">{formatARS(c.data.reduce((a,b)=>a+b,0))}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-bold border-y border-gray-200">
                <td className="p-2 sticky left-0 bg-gray-50 z-10">TOTAL INGRESOS</td>
                {grilla.totales.map((t, i) => <td key={i} className="p-2 text-right font-mono">{formatARS(t.ingresos)}</td>)}
                <td className="p-2 text-right font-mono bg-gray-100">{formatARS(grilla.totales.reduce((a,t)=>a+t.ingresos,0))}</td>
              </tr>
              <tr className="bg-red-600 text-white font-bold"><td className="p-2 sticky left-0 bg-red-600 z-10">EGRESOS</td><td colSpan={13}></td></tr>
              {Object.entries(grilla.egresos).map(([concepto, info]) => (
                <tr key={concepto} className="border-b border-gray-100">
                  <td className="p-2 border-r border-gray-200 sticky left-0 bg-white z-10 capitalize">{concepto.toLowerCase()}</td>
                  {info.data.map((v, i) => <td key={i} className="p-2 border-r border-gray-200 text-right font-mono text-red-700">{v > 0 ? formatARS(v) : '-'}</td>)}
                  <td className="p-2 text-right font-mono font-bold bg-gray-50">{formatARS(info.data.reduce((a,b)=>a+b,0))}</td>
                </tr>
              ))}
              <tr className="bg-red-50 font-bold border-y border-red-200">
                <td className="p-2 sticky left-0 bg-red-50 z-10">TOTAL EGRESOS</td>
                {grilla.totales.map((t, i) => <td key={i} className="p-2 text-right font-mono">{formatARS(t.egresos)}</td>)}
                <td className="p-2 text-right font-mono bg-red-100">{formatARS(grilla.totales.reduce((a,t)=>a+t.egresos,0))}</td>
              </tr>
              <tr className="bg-blue-50 font-bold border-t-2 border-blue-200">
                <td className="p-2 sticky left-0 bg-blue-50 z-10">RESULTADO NETO</td>
                {grilla.totales.map((t, i) => <td key={i} className={`p-2 text-right font-mono ${t.neto < 0 ? 'text-red-600' : 'text-blue-900'}`}>{formatARS(t.neto)}</td>)}
                <td className="p-2 text-right font-mono bg-blue-100">{formatARS(grilla.totales.reduce((a,t)=>a+t.neto,0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}