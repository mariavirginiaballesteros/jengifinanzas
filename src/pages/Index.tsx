import React, { useMemo } from 'react';
import { formatARS } from '@/lib/utils';
import { Plus, FileText, RefreshCw, AlertCircle, CheckCircle2, Landmark, TrendingUp, Users, Sparkles, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCotizacionOficial } from '@/hooks/useCotizacion';

const StatCard = ({ title, value, sub, trend = 'neutral' }: { title: string, value: string, sub?: string, trend?: 'positive' | 'negative' | 'neutral' }) => (
  <div className="bg-jengibre-white border border-jengibre-border p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
    <h3 className="text-sm font-sans text-gray-500 mb-1">{title}</h3>
    <p className="text-3xl font-mono font-bold text-jengibre-dark">{value}</p>
    {sub && (
      <p className={`text-sm mt-2 font-medium ${
        trend === 'positive' ? 'text-jengibre-green' : trend === 'negative' ? 'text-jengibre-red' : 'text-gray-400'
      }`}>
        {sub}
      </p>
    )}
  </div>
);

const SemaforoKPI = ({ title, value, status, label }: { title: string, value: string, status: 'ok' | 'alert' | 'danger', label: string }) => {
  const colors = { ok: 'bg-jengibre-green', alert: 'bg-jengibre-amber', danger: 'bg-jengibre-red' };
  return (
    <div className="bg-jengibre-white border border-jengibre-border p-4 rounded-xl flex items-center gap-4">
      <div className={`w-3 h-3 rounded-full shrink-0 ${colors[status]}`} />
      <div className="flex-1">
        <p className="text-sm text-gray-500 leading-tight mb-1">{title}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-mono font-bold">{value}</span>
          <span className="text-xs text-gray-400 font-medium">{label}</span>
        </div>
      </div>
    </div>
  );
};

export default function Dashboard() {
  const { data: cotizacionData } = useCotizacionOficial();
  const cotizacion = cotizacionData || 1000;

  const { data: movimientos, isLoading: isLoadingMov } = useQuery({
    queryKey: ['movimientos_dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.from('movimientos').select('*');
      if (error) throw error;
      return data;
    }
  });

  const { data: clientes, isLoading: isLoadingCli } = useQuery({
    queryKey: ['clientes_dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('*').eq('estado', 'activo');
      if (error) throw error;
      return data;
    }
  });

  const { data: equipo, isLoading: isLoadingEq } = useQuery({
    queryKey: ['equipo_dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.from('equipo').select('*').eq('activo', true);
      if (error) throw error;
      return data;
    }
  });

  const { data: recuperos, isLoading: isLoadingRec } = useQuery({
    queryKey: ['recuperos_dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.from('recuperos').select('*').eq('estado', 'pendiente');
      if (error) throw error;
      return data;
    }
  });

  const { data: compras, isLoading: isLoadingComp } = useQuery({
    queryKey: ['compras_dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.from('compras').select('*');
      if (error) throw error;
      return data;
    }
  });

  const { data: facturas, isLoading: isLoadingFact } = useQuery({
    queryKey: ['facturas_dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.from('facturacion').select('mes, descripcion, estado');
      if (error) throw error;
      return data;
    }
  });

  const { data: configDireccion } = useQuery({
    queryKey: ['configuracion', 'costo_direccion_mensual'],
    queryFn: async () => {
      const { data, error } = await supabase.from('configuracion').select('valor').eq('clave', 'costo_direccion_mensual').maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    }
  });
  const costoDireccion = Number(configDireccion?.valor || 0);

  // Procesamiento matemático
  const stats = useMemo(() => {
    if (!movimientos || !clientes || !equipo) return null;

    const saldosCalc: Record<string, number> = {};
    let ingresosMes = 0;
    let costosMes = 0;
    
    let ingresosYTD = 0;
    let costosYTD = 0;
    let totalCajaARS = 0;
    const egresosPorMes: Record<string, number> = {};

    let ivaVentas = 0;
    let ivaCompras = 0;
    let ivaRetenciones = 0;

    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentYearPrefix = now.getFullYear().toString();

    movimientos.forEach(m => {
      let isUSD = false;
      try { const p = JSON.parse(m.notas || '{}'); if (p.moneda === 'USD') isUSD = true; } catch(e){}
      
      const valorEnPesos = isUSD ? Number(m.monto) * cotizacion : Number(m.monto);
      const factor = m.tipo === 'ingreso' ? 1 : -1;

      totalCajaARS += valorEnPesos * factor;

      if (!saldosCalc[m.cuenta]) saldosCalc[m.cuenta] = 0;
      saldosCalc[m.cuenta] += valorEnPesos * factor;

      if (m.fecha.startsWith(currentMonthPrefix)) {
        if (m.tipo === 'ingreso') ingresosMes += valorEnPesos;
        else costosMes += valorEnPesos;
      }

      if (m.fecha.startsWith(currentYearPrefix)) {
        if (m.tipo === 'ingreso') ingresosYTD += valorEnPesos;
        else costosYTD += valorEnPesos;
      }

      if (m.tipo === 'egreso') {
        const mes = m.fecha.substring(0, 7);
        if (!egresosPorMes[mes]) egresosPorMes[mes] = 0;
        egresosPorMes[mes] += valorEnPesos;
      }
    });

    const gananciaYTD = ingresosYTD - costosYTD;
    const resultadoMes = ingresosMes - costosMes;

    // Cálculo de Meta de Fondo de Emergencia (Alineado con Salud Financiera)
    const mesesCount = Object.keys(egresosPorMes).length;
    const totalEgresosHist = Object.values(egresosPorMes).reduce((a,b)=>a+b, 0);
    const avgCostos = mesesCount > 0 ? totalEgresosHist / mesesCount : 0;
    const metaFondo = (avgCostos + costoDireccion) * 6;
    const fondoInmovilizado = Math.max(0, Math.min(totalCajaARS, metaFondo));

    // IVA
    if (compras) {
      compras.forEach(c => { ivaCompras += Number(c.iva_credito || 0); });
    }
    if (facturas) {
      facturas.forEach(f => {
        try {
          const desc = JSON.parse(f.descripcion || '{}');
          const retIva = Number(desc.retencion_iva) || 0;
          const ivaGuardado = Number(desc.iva_a_guardar) || 0;
          ivaRetenciones += retIva;
          ivaVentas += (retIva + ivaGuardado);
        } catch (e) {}
      });
    }
    const ivaEstimadoAPagar = ivaVentas - ivaCompras - ivaRetenciones;

    // Métricas de Equipo y Clientes
    let costoEquipo = 0;
    equipo.forEach(e => {
      let costo = Number(e.honorario_mensual || 0);
      try {
        const notas = JSON.parse(e.notas || '{}');
        if (notas.asignaciones) {
          Object.entries(notas.asignaciones).forEach(([cId, val]) => {
            if (clientes.find(cl => cl.id === cId)) costo += Number(val);
          });
        }
      } catch (err) {}
      costoEquipo += costo;
    });

    const ratioEquipo = ingresosMes > 0 ? (costoEquipo / ingresosMes) * 100 : 0;
    const margenNeto = ingresosMes > 0 ? (resultadoMes / ingresosMes) * 100 : 0;

    let mrrTotal = 0;
    let maxAbono = 0;
    clientes.forEach(c => {
      const abono = Number(c.monto_ars || 0) + (Number(c.monto_usd || 0) * cotizacion);
      mrrTotal += abono;
      if (abono > maxAbono) maxAbono = abono;
    });
    
    const arr = mrrTotal * 12;
    const ticketPromedio = clientes.length > 0 ? mrrTotal / clientes.length : 0;
    const concentracion = mrrTotal > 0 ? (maxAbono / mrrTotal) * 100 : 0;

    let minDias = Infinity;
    clientes.forEach(c => {
      if (c.fecha_fin) {
        const diff = Math.ceil((new Date(c.fecha_fin).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
        if (diff >= 0 && diff < minDias) minDias = diff;
      }
    });

    return {
      saldos: saldosCalc,
      arr,
      ticketPromedio,
      ytd: { ingresos: ingresosYTD, costos: costosYTD, ganancia: gananciaYTD },
      fondo: { actual: fondoInmovilizado, meta: metaFondo },
      mesActual: { ingresos: ingresosMes, costos: costosMes, resultado: resultadoMes },
      iva: { ventas: ivaVentas, compras: ivaCompras, retenciones: ivaRetenciones, aPagar: ivaEstimadoAPagar },
      kpis: { ratioEquipo, margenNeto, concentracion, minDias, fondoRatio: metaFondo > 0 ? (fondoInmovilizado/metaFondo)*100 : 0 }
    };
  }, [movimientos, clientes, equipo, compras, facturas, cotizacion, costoDireccion]);

  const isLoading = isLoadingMov || isLoadingCli || isLoadingEq || isLoadingRec || isLoadingComp || isLoadingFact;

  if (isLoading || !stats) {
    return (
      <div className="flex flex-col items-center justify-center h-64 animate-in fade-in">
        <div className="w-10 h-10 border-4 border-jengibre-primary border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-500 font-medium">Calculando estado financiero en tiempo real...</p>
      </div>
    );
  }

  const sortedAccounts = Object.entries(stats.saldos).sort((a, b) => b[1] - a[1]);
  const topAccounts = sortedAccounts.slice(0, 4);

  const alertas = [];
  if (stats.kpis.minDias <= 30) alertas.push({ type: 'amber', title: 'Contrato por vencer', desc: `Un contrato activo vence en ${stats.kpis.minDias} días.` });
  if (stats.kpis.fondoRatio < 50) alertas.push({ type: 'red', title: 'Fondo de Emergencia Bajo', desc: `Tu reserva cubre menos de la mitad de los 6 meses de seguridad operativos y directivos.` });
  if (recuperos && recuperos.length > 0) alertas.push({ type: 'amber', title: 'Recuperos pendientes', desc: `Tenés ${recuperos.length} recuperos de gastos esperando cobranza.` });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-jengibre-dark">Hola, Equipo 👋</h1>
          <p className="text-gray-600 mt-1">Acá está el resumen ejecutivo en base a tus movimientos reales.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/caja" className="bg-jengibre-primary hover:bg-[#a64120] text-white px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-sm">
            <Plus size={20} /> Cargar movimiento
          </Link>
        </div>
      </header>

      {/* MÉTRICAS ESTRATÉGICAS - VISIÓN EJECUTIVA */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-jengibre-border p-5 rounded-2xl shadow-sm relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 text-blue-50 opacity-50 group-hover:scale-110 transition-transform"><TrendingUp size={100} /></div>
          <div className="relative">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-2"><TrendingUp size={16} className="text-blue-600"/> Proyección Anual (ARR)</p>
            <p className="text-3xl font-mono font-bold text-jengibre-dark">{formatARS(stats.arr)}</p>
            <p className="text-[11px] text-gray-400 mt-2 font-medium">Facturación bruta proyectada (MRR × 12)</p>
          </div>
        </div>
        
        <div className="bg-white border border-jengibre-border p-5 rounded-2xl shadow-sm relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 text-amber-50 opacity-50 group-hover:scale-110 transition-transform"><Users size={100} /></div>
          <div className="relative">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-2"><Users size={16} className="text-amber-600"/> Ticket Promedio</p>
            <p className="text-3xl font-mono font-bold text-jengibre-dark">{formatARS(stats.ticketPromedio)}</p>
            <p className="text-[11px] text-gray-400 mt-2 font-medium">Ingreso base por cliente activo</p>
          </div>
        </div>

        <div className="bg-white border border-jengibre-border p-5 rounded-2xl shadow-sm relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 text-emerald-50 opacity-50 group-hover:scale-110 transition-transform"><Sparkles size={100} /></div>
          <div className="relative">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-2"><Sparkles size={16} className="text-emerald-600"/> Ganancia Real Acum.</p>
            <p className={`text-3xl font-mono font-bold ${stats.ytd.ganancia >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatARS(stats.ytd.ganancia)}</p>
            <p className="text-[11px] text-gray-400 mt-2 font-medium">Ingresos - Egresos (Año en curso)</p>
          </div>
        </div>

        <div className="bg-white border border-jengibre-border p-5 rounded-2xl shadow-sm relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 text-indigo-50 opacity-50 group-hover:scale-110 transition-transform"><ShieldCheck size={100} /></div>
          <div className="relative">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-2"><ShieldCheck size={16} className="text-indigo-600"/> Fondo de Emergencia</p>
            <p className="text-3xl font-mono font-bold text-indigo-700">{formatARS(stats.fondo.actual)}</p>
            <p className="text-[11px] text-gray-400 mt-2 font-medium">Meta (6 meses de seguridad): {formatARS(stats.fondo.meta)}</p>
          </div>
        </div>
      </div>

      {/* POSICIÓN DE IVA GLOBAL/ACUMULADA */}
      <section className="bg-white border border-jengibre-border p-6 rounded-2xl shadow-sm">
        <h2 className="text-lg font-display font-bold mb-4 text-gray-700 flex items-center gap-2">
          <Landmark size={20} className="text-blue-600" /> Posición de IVA Acumulada
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
             <p className="text-sm text-gray-500 font-medium">IVA Facturado (+)</p>
             <p className="text-xl font-mono font-bold text-gray-900 mt-1">{formatARS(stats.iva.ventas)}</p>
             <p className="text-[10px] text-gray-400 mt-1 leading-tight">IVA Guardado + Retenciones declaradas</p>
          </div>
          <div>
             <p className="text-sm text-gray-500 font-medium">Crédito Compras (-)</p>
             <p className="text-xl font-mono font-bold text-green-600 mt-1">{formatARS(stats.iva.compras)}</p>
             <p className="text-[10px] text-gray-400 mt-1 leading-tight">Acumulado en pestaña Compras</p>
          </div>
          <div>
             <p className="text-sm text-gray-500 font-medium">Retención de IVA (-)</p>
             <p className="text-xl font-mono font-bold text-amber-600 mt-1">{formatARS(stats.iva.retenciones)}</p>
             <p className="text-[10px] text-gray-400 mt-1 leading-tight">Registrado en cobros de Facturación</p>
          </div>
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex flex-col justify-center">
             <p className="text-sm text-blue-800 font-bold uppercase tracking-wider">{stats.iva.aPagar <= 0 ? 'Saldo a favor AFIP' : 'A pagar a AFIP'}</p>
             <p className="text-2xl font-mono font-bold text-blue-900 mt-1">{formatARS(Math.abs(stats.iva.aPagar))}</p>
          </div>
        </div>
      </section>

      {/* SALDOS POR CUENTA */}
      <section>
        <h2 className="text-lg font-display font-bold mb-4 text-gray-700">Principales Cuentas Activas</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {topAccounts.map(([nombre, monto]) => (
            <StatCard key={nombre} title={`🏦 ${nombre}`} value={formatARS(monto)} trend={monto < 0 ? 'negative' : 'neutral'} />
          ))}
          {topAccounts.length === 0 && (
            <div className="col-span-4 p-8 text-center bg-white border rounded-xl text-gray-500">
              No hay cuentas registradas. Cargá ingresos o egresos en Caja.
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* RESUMEN DEL MES */}
        <div className="col-span-1 lg:col-span-2 space-y-8">
          <section>
            <h2 className="text-lg font-display font-bold mb-4 text-gray-700">Resumen del mes actual</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-jengibre-card border border-jengibre-border p-5 rounded-2xl">
                <p className="text-sm text-gray-600">Ingresos cobrados</p>
                <p className="text-2xl font-mono font-bold text-jengibre-green mt-1">{formatARS(stats.mesActual.ingresos)}</p>
              </div>
              <div className="bg-jengibre-card border border-jengibre-border p-5 rounded-2xl">
                <p className="text-sm text-gray-600">Costos pagados</p>
                <p className="text-2xl font-mono font-bold text-jengibre-red mt-1">{formatARS(stats.mesActual.costos)}</p>
              </div>
              <div className="bg-jengibre-dark text-jengibre-white p-5 rounded-2xl shadow-md">
                <p className="text-sm text-gray-300">Resultado Neto (Mes)</p>
                <p className={`text-2xl font-mono font-bold mt-1 ${stats.mesActual.resultado < 0 ? 'text-red-400' : 'text-white'}`}>
                  {formatARS(stats.mesActual.resultado)}
                </p>
              </div>
            </div>
          </section>

          {/* KPIS DE SALUD REALES */}
          <section>
            <h2 className="text-lg font-display font-bold mb-4 text-gray-700">Métricas Operativas</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SemaforoKPI title="Ratio Equipo / Ingresos" value={`${stats.kpis.ratioEquipo.toFixed(1)}%`} label={"OK <40%"} status={stats.kpis.ratioEquipo > 50 ? 'danger' : stats.kpis.ratioEquipo > 40 ? 'alert' : 'ok'} />
              <SemaforoKPI title="Concentración (Cliente + grande)" value={`${stats.kpis.concentracion.toFixed(1)}%`} label={"OK <30%"} status={stats.kpis.concentracion > 40 ? 'danger' : stats.kpis.concentracion > 30 ? 'alert' : 'ok'} />
              <SemaforoKPI title="Meta de Reserva Cubierta" value={`${stats.kpis.fondoRatio.toFixed(0)}%`} label={stats.kpis.fondoRatio >= 100 ? 'Completado' : 'Ahorrando'} status={stats.kpis.fondoRatio < 30 ? 'danger' : stats.kpis.fondoRatio < 80 ? 'alert' : 'ok'} />
              <SemaforoKPI title="Margen Neto del Mes" value={`${stats.kpis.margenNeto.toFixed(1)}%`} label={"OK >25%"} status={stats.kpis.margenNeto < 10 ? 'danger' : stats.kpis.margenNeto < 25 ? 'alert' : 'ok'} />
              <SemaforoKPI title="Días p/ próximo vencimiento" value={stats.kpis.minDias === Infinity ? '-' : `${stats.kpis.minDias}d`} label={"OK >60d"} status={stats.kpis.minDias <= 30 ? 'danger' : stats.kpis.minDias <= 60 ? 'alert' : 'ok'} />
            </div>
          </section>
        </div>

        {/* COLUMNA LATERAL (ALERTAS Y ACCESOS) */}
        <div className="col-span-1 space-y-6">
          <section className="bg-jengibre-white border border-jengibre-border rounded-2xl p-5">
            <h2 className="text-lg font-display font-bold mb-4 text-gray-700">Accesos Rápidos</h2>
            <div className="space-y-3">
              <Link to="/contadora" className="w-full flex items-center gap-3 p-3 rounded-xl border border-jengibre-border hover:bg-jengibre-cream transition-colors text-left block group">
                <div className="bg-jengibre-cream group-hover:bg-jengibre-primary group-hover:text-white p-2 rounded-lg text-jengibre-primary transition-colors"><FileText size={20} /></div>
                <div className="font-medium text-jengibre-dark">Solicitar factura</div>
              </Link>
              <Link to="/recuperos" className="w-full flex items-center gap-3 p-3 rounded-xl border border-jengibre-border hover:bg-jengibre-cream transition-colors text-left block group">
                <div className="bg-jengibre-cream group-hover:bg-jengibre-primary group-hover:text-white p-2 rounded-lg text-jengibre-primary transition-colors"><RefreshCw size={20} /></div>
                <div className="font-medium text-jengibre-dark">Ver recuperos</div>
              </Link>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold mb-4 text-gray-700 flex items-center gap-2">
              <AlertCircle size={20} className={alertas.length > 0 && alertas[0].type !== 'green' ? "text-jengibre-amber" : "text-jengibre-green"} /> 
              Centro de Atención
            </h2>
            <div className="space-y-3">
              {alertas.length === 0 ? (
                <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-xl shadow-sm text-sm flex items-start gap-3">
                  <CheckCircle2 className="text-green-600 mt-0.5" size={18} />
                  <div>
                    <p className="font-bold text-green-900">¡Todo en orden!</p>
                    <p className="text-green-700 mt-1">No tenés alertas críticas hoy.</p>
                  </div>
                </div>
              ) : (
                alertas.map((alerta, i) => (
                  <div key={i} className={`bg-white border-l-4 p-4 rounded-r-xl shadow-sm text-sm ${
                    alerta.type === 'red' ? 'border-jengibre-red' : 
                    alerta.type === 'amber' ? 'border-jengibre-amber' : 
                    'border-jengibre-green'
                  }`}>
                    <p className="font-bold text-gray-800">{alerta.title}</p>
                    <p className="text-gray-600 mt-1">{alerta.desc}</p>
                  </div>
                ))
              )}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}