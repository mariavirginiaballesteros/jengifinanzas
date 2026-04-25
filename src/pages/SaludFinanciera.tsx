import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatARS, formatUSD } from '@/lib/utils';
import { TipAlert } from '@/components/TipAlert';
import { Wallet, ChevronLeft, ChevronRight, Bot, Sparkles, ShieldCheck, Unlock, Lightbulb, TrendingUp, Settings, Send, Loader2 } from 'lucide-react';
import { useCotizacionOficial } from '@/hooks/useCotizacion';
import { showSuccess, showError } from '@/utils/toast';

export default function SaludFinanciera() {
  const queryClient = useQueryClient();
  const [yearSelected, setYearSelected] = useState(new Date().getFullYear());
  const { data: cotizacionData } = useCotizacionOficial();
  const cotizacion = cotizacionData || 1000;

  // Estado para Modal de Ajuste de Dirección
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [direccionInput, setDireccionInput] = useState('');

  // Estado para el Chat IA
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const { data: movimientos, isLoading: isLoadingMov } = useQuery({
    queryKey: ['movimientos_salud'],
    queryFn: async () => {
      const { data, error } = await supabase.from('movimientos').select(`*, cliente:clientes(nombre)`).order('fecha', { ascending: true });
      if (error) throw error;
      return data;
    }
  });

  const { data: configDireccion, isLoading: isLoadingConf } = useQuery({
    queryKey: ['configuracion', 'costo_direccion_mensual'],
    queryFn: async () => {
      const { data, error } = await supabase.from('configuracion').select('id, valor').eq('clave', 'costo_direccion_mensual').maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    }
  });

  const costoDireccion = Number(configDireccion?.valor || 0);

  const saveDireccionMutation = useMutation({
    mutationFn: async (val: string) => {
      const payload = { clave: 'costo_direccion_mensual', valor: val, descripcion: 'Sueldo de dirección / Honorarios fijos extra para cálculo de Salud Financiera' };
      if (configDireccion?.id) {
        const { error } = await supabase.from('configuracion').update(payload).eq('id', configDireccion.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('configuracion').insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuracion', 'costo_direccion_mensual'] });
      setSettingsOpen(false);
      showSuccess('Costo de dirección actualizado');
    },
    onError: (err: any) => showError(err.message)
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

      if (!saldosCalc[m.cuenta]) saldosCalc[m.cuenta] = { ars: 0, usd: 0 };
      if (isUSD) {
        saldosCalc[m.cuenta].usd += montoOriginal * factor;
        usdPuros += montoOriginal * factor;
      } else {
        saldosCalc[m.cuenta].ars += montoOriginal * factor;
        arsPuros += montoOriginal * factor;
      }
      
      cajaTotalARS += valorEnPesos * factor;

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
    const promedioCostosHistóricos = mesesConMovimientos.length > 0
      ? mesesConMovimientos.reduce((acc, t) => acc + t.egresos, 0) / mesesConMovimientos.length
      : 0;

    totalesMes.forEach(t => {
      t.neto = t.ingresos - t.egresos;
      t.margen = t.ingresos > 0 ? (t.neto / t.ingresos) * 100 : 0;
    });

    // CÁLCULO DE OBJETIVOS (HISTÓRICO + COSTO DIRECCIÓN)
    const totalCostoMensual = promedioCostosHistóricos + costoDireccion;
    const objFondo = totalCostoMensual > 0 ? totalCostoMensual * 6 : 1000000; 
    const exc = Math.max(0, cajaTotalARS - objFondo);
    const pct = Math.max(0, Math.min(100, (cajaTotalARS / objFondo) * 100));

    // Insights Iniciales
    const insights = [];
    if (arsPuros > totalCostoMensual * 1.5) {
      insights.push({
        type: 'invest',
        title: 'Exceso de liquidez en pesos',
        text: `Tenés ${formatARS(arsPuros)} inmovilizados, superando tus gastos mensuales. Sugerimos colocar excedentes en FCI Money Market para evitar devaluación diaria.`
      });
    }
    const porcentajeUSD = cajaTotalARS > 0 ? ((usdPuros * cotizacion) / cajaTotalARS) * 100 : 0;
    if (porcentajeUSD < 30 && exc > 0) {
      insights.push({
        type: 'currency',
        title: 'Oportunidad de Cobertura',
        text: `Solo el ${porcentajeUSD.toFixed(1)}% está dolarizado. Se recomienda derivar fondos libres a USD MEP/Cripto para diversificar el riesgo de la reserva.`
      });
    }
    if (exc > 0) {
      insights.push({
        type: 'profit',
        title: 'Excedente listo para distribuir',
        text: `Caja muy sana (6 meses cubiertos incluyendo Dirección). Podés retirar o invertir ${formatARS(exc)} libres.`
      });
    } else {
      insights.push({
        type: 'warning',
        title: 'Construcción de Capital',
        text: `Cubre ${(cajaTotalARS / (totalCostoMensual || 1)).toFixed(1)} meses. El objetivo son 6 meses. No se recomienda hacer retiros extra de ganancias todavía.`
      });
    }

    return {
      saldos: saldosCalc,
      mesesNames,
      totalCajaARS: cajaTotalARS,
      totalARS_puro: arsPuros,
      totalUSD_puro: usdPuros,
      avgCostos: promedioCostosHistóricos,
      fondoReservaObjetivo: objFondo,
      excedente: exc,
      porcentajeFondo: pct,
      grilla: { ingresos: ingresosPorCliente, egresos: egresosPorConcepto, totales: totalesMes },
      aiInsights: insights
    };
  }, [movimientos, yearSelected, cotizacion, costoDireccion]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const newMessages: {role: 'user'|'assistant', content: string}[] = [...chatMessages, { role: 'user', content: chatInput }];
    setChatMessages(newMessages);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const contextoAI = { totalCajaARS, avgCostos, costoDireccion, excedente, fondoReservaObjetivo, totalUSD_puro, totalARS_puro };
      const { data, error } = await supabase.functions.invoke('asesor-financiero', {
        body: { messages: newMessages, contexto: contextoAI }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setChatMessages([...newMessages, { role: 'assistant', content: data.reply }]);
    } catch (err: any) {
      setChatMessages([...newMessages, { role: 'assistant', content: `⚠️ Error: ${err.message || 'No se pudo conectar'}. Asegurate de haber configurado la OPENAI_API_KEY en Supabase.` }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const clientesOrdenados = Object.values(grilla.ingresos).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const egresosOrdenados = Object.entries(grilla.egresos).sort((a, b) => {
    const totalA = a[1].data.reduce((x, y) => x + y, 0);
    const totalB = b[1].data.reduce((x, y) => x + y, 0);
    return totalB - totalA;
  });

  const isLoading = isLoadingMov || isLoadingConf;
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

      {settingsOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl animate-in zoom-in-95">
            <h2 className="text-2xl font-display font-bold mb-2 flex items-center gap-2">
              <Settings className="text-jengibre-primary" /> Costos de Dirección
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              Ingresá el sueldo u honorarios mensuales de dirección. Este monto se sumará a los gastos operativos para asegurarnos de que el cálculo del <strong>Fondo de 6 Meses</strong> incluya su retribución de seguridad.
            </p>

            <form onSubmit={(e) => { e.preventDefault(); saveDireccionMutation.mutate(direccionInput); }}>
              <label className="block text-sm font-bold text-gray-700 mb-1">Monto Mensual de Dirección (ARS)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                <input 
                  type="number" step="1000" min="0" required autoFocus
                  className="w-full border border-gray-300 rounded-lg p-3 pl-8 outline-none focus:ring-2 focus:ring-jengibre-primary font-mono text-lg"
                  value={direccionInput} onChange={e => setDireccionInput(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-100">
                <button type="button" onClick={() => setSettingsOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors">Cancelar</button>
                <button type="submit" disabled={saveDireccionMutation.isPending} className="bg-jengibre-primary hover:bg-[#a64120] text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50">
                  {saveDireccionMutation.isPending ? 'Guardando...' : 'Guardar Parámetros'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BLOQUE DE SALDOS */}
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
        <section className="lg:col-span-6 bg-white border border-jengibre-border rounded-2xl p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-display font-bold text-jengibre-dark flex items-center gap-2">
              <ShieldCheck className="text-jengibre-green" /> Excedentes y Retiros
            </h2>
            <button onClick={() => { setDireccionInput(costoDireccion.toString()); setSettingsOpen(true); }} className="text-xs flex items-center gap-1 font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition-colors">
              <Settings size={14} /> Ajustar Cálculo
            </button>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            El sistema aparta 6 meses de dinero "intocable". El resto se considera ganancia libre.
          </p>

          <div className="flex flex-col gap-6">
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
              <div className="flex justify-between items-end mb-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Costo Base + Dirección</p>
                  <p className="text-xl font-mono font-bold text-gray-900">
                    {formatARS(avgCostos + costoDireccion)} <span className="text-sm font-sans font-normal text-gray-500">/ mes</span>
                  </p>
                  <p className="text-[10px] text-gray-500 font-medium mt-1">Histórico: {formatARS(avgCostos)} + Dir: {formatARS(costoDireccion)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold uppercase tracking-wider text-jengibre-primary">Meta (Fondo 6 Meses)</p>
                  <p className="text-xl font-mono font-bold text-jengibre-primary">{formatARS(fondoReservaObjetivo)}</p>
                </div>
              </div>
              
              <div className="h-4 w-full bg-gray-200 rounded-full mt-4 overflow-hidden flex relative">
                <div className="h-full bg-jengibre-green transition-all duration-1000" style={{ width: `${porcentajeFondo}%` }}></div>
                {porcentajeFondo >= 100 && (
                  <div className="absolute top-0 right-0 bottom-0 left-0 bg-jengibre-primary/20 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,.2)_50%,transparent_75%,transparent_100%)] bg-[length:20px_20px] animate-[slide_1s_linear_infinite]"></div>
                )}
              </div>
              <p className="text-xs text-gray-500 text-center mt-2 font-medium">
                Tu caja actual cubre el {porcentajeFondo.toFixed(1)}% de la meta de reserva.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 border border-jengibre-green/30 bg-jengibre-green/5 p-4 rounded-xl">
                <div className="flex items-center gap-2 text-jengibre-green mb-1">
                  <ShieldCheck size={18} />
                  <p className="text-sm font-bold uppercase tracking-wider">Capital Inmovilizado</p>
                </div>
                <p className="text-2xl font-mono font-bold text-jengibre-dark">{formatARS(Math.min(Math.max(0, totalCajaARS), fondoReservaObjetivo))}</p>
                <p className="text-[10px] text-gray-500 mt-1 leading-tight">Dinero de emergencia. No debería retirarse.</p>
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
                  {excedente > 0 ? 'Libre para retirar como ganancia o inversión.' : 'Aún no hay ganancias libres.'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ASESOR INTELIGENTE Y CHAT */}
        <section className="lg:col-span-6 bg-[#1e293b] text-white border border-gray-700 rounded-2xl p-6 shadow-lg relative overflow-hidden flex flex-col h-[500px]">
          <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/20 blur-3xl rounded-full"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-pink-500/20 blur-3xl rounded-full"></div>
          
          <h2 className="text-xl font-display font-bold flex items-center gap-2 mb-1 relative z-10">
            <Bot className="text-indigo-400" /> Asesor Financiero IA
          </h2>
          <p className="text-sm text-gray-400 mb-4 relative z-10">
            Consultá o pedí simulaciones. Conoce tus números reales.
          </p>

          <div className="flex-1 overflow-y-auto space-y-4 pr-2 relative z-10 custom-scrollbar mb-4">
            {/* Insights Automáticos Iniciales */}
            {chatMessages.length === 0 && aiInsights.map((insight, idx) => (
              <div key={idx} className="bg-gray-800/60 border border-gray-700 p-4 rounded-xl backdrop-blur-sm">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg shrink-0 ${
                    insight.type === 'invest' ? 'bg-blue-500/20 text-blue-400' : 
                    insight.type === 'profit' ? 'bg-emerald-500/20 text-emerald-400' : 
                    insight.type === 'currency' ? 'bg-purple-500/20 text-purple-400' : 
                    'bg-amber-500/20 text-amber-400'
                  }`}>
                    {insight.type === 'invest' ? <TrendingUp size={16} /> : 
                     insight.type === 'profit' ? <Sparkles size={16} /> : 
                     insight.type === 'currency' ? <Wallet size={16} /> : 
                     <Lightbulb size={16} />}
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-100 text-sm">{insight.title}</h4>
                    <p className="text-xs text-gray-300 mt-1 leading-relaxed">{insight.text}</p>
                  </div>
                </div>
              </div>
            ))}

            {/* Mensajes del Chat */}
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`p-3 rounded-xl max-w-[85%] text-sm leading-relaxed ${
                  msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-800/80 border border-gray-700 text-gray-200'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}

            {isChatLoading && (
              <div className="flex justify-start">
                <div className="p-3 rounded-xl bg-gray-800/80 border border-gray-700 flex items-center gap-2 text-gray-400 text-sm">
                  <Loader2 className="animate-spin" size={16} /> Analizando finanzas...
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSendMessage} className="relative z-10 flex gap-2">
            <input 
              type="text" 
              placeholder="¿Debería comprar dólares hoy?" 
              className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400" 
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              disabled={isChatLoading}
            />
            <button type="submit" disabled={isChatLoading || !chatInput.trim()} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg transition-colors flex items-center justify-center">
              <Send size={18} />
            </button>
          </form>
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
                if (totalRow === 0) return null; 
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