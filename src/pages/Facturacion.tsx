import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TipAlert } from '@/components/TipAlert';
import { Plus, Edit2, Trash2, MessageCircle, Save, ChevronDown, ChevronRight, Building, Send, Link as LinkIcon, DollarSign } from 'lucide-react';
import { formatARS } from '@/lib/utils';
import { showSuccess, showError } from '@/utils/toast';

// Helper para guardar todo en JSON en la descripción sin tocar la base de datos
const parseDescripcion = (descStr: string | null) => {
  if (!descStr) return { texto: '', periodo: '', link: '', monto_pagado: 0, es_informal: false };
  try {
    const parsed = JSON.parse(descStr);
    if (parsed && typeof parsed === 'object') {
      return {
        texto: parsed.texto || '',
        periodo: parsed.periodo || '',
        link: parsed.link || '',
        monto_pagado: Number(parsed.monto_pagado) || 0,
        es_informal: Boolean(parsed.es_informal) || false
      };
    }
  } catch (e) {
    // Si no es JSON, es texto plano viejo
  }
  return { texto: descStr || '', periodo: '', link: '', monto_pagado: 0, es_informal: false };
};

export default function Facturacion() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  
  // Modal de agregar fila manual
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [manualForm, setManualForm] = useState<any>({
    cliente_id: '', cuota: '', mes: new Date().toISOString().split('T')[0], 
    monto_base: '', porcentaje_inflacion: 0, responsable_afip: '', cuit_responsable: '', texto: '', periodo: '', link: '', es_informal: false
  });

  // Modal para WhatsApp
  const [wpModalOpen, setWpModalOpen] = useState(false);
  const [wpData, setWpData] = useState<any>({ row: null, periodo: '', notasExtras: '' });

  // Modal para Registrar Pago Parcial / Informal
  const [payModal, setPayModal] = useState<{isOpen: boolean, row: any}>({isOpen: false, row: null});
  const [payData, setPayData] = useState({ estado_destino: '', monto_pagado: '', es_informal: false });

  const { data: facturas, isLoading } = useQuery({
    queryKey: ['facturacion'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facturacion')
        .select(`*, cliente:clientes(id, nombre, cuit, dia_facturacion)`)
        .order('mes', { ascending: true });
      if (error) throw error;
      return data;
    }
  });

  const { data: clientes } = useQuery({
    queryKey: ['clientes_combo'],
    queryFn: async () => {
      const { data } = await supabase.from('clientes').select('id, nombre').eq('estado', 'activo');
      return data || [];
    }
  });

  const saveRowMutation = useMutation({
    mutationFn: async (payload: any) => {
      let dataToSave = { ...payload };

      // Solo recalculamos el monto_final si nos envían el monto_base (para no borrarlo al actualizar solo estados)
      if ('monto_base' in payload) {
        const inflacion = Number(payload.porcentaje_inflacion) || 0;
        const base = Number(payload.monto_base) || 0;
        dataToSave.monto_final = base * (1 + (inflacion / 100));
      }

      if (editingId || payload.id) {
        const idToUpdate = editingId || payload.id;
        const { error } = await supabase.from('facturacion').update(dataToSave).eq('id', idToUpdate);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('facturacion').insert([dataToSave]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facturacion'] });
      setEditingId(null);
      setIsFormOpen(false);
    },
    onError: (err: any) => showError(err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('facturacion').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facturacion'] });
      showSuccess('Fila eliminada');
    }
  });

  // Procesamiento de datos para agrupar
  const groupedFacturas = useMemo(() => {
    if (!facturas) return [];
    
    const groups: Record<string, any> = {};
    
    facturas.forEach(row => {
      const clientId = row.cliente?.id || 'manual';
      const clientName = row.cliente?.nombre || 'Operaciones Manuales';
      
      if (!groups[clientId]) {
        groups[clientId] = { id: clientId, nombre: clientName, cuit: row.cliente?.cuit || '', items: [], totalMonto: 0, totalPagado: 0 };
      }
      
      groups[clientId].items.push(row);
      const montoFinal = Number(row.monto_final || row.monto_base || 0);
      const desc = parseDescripcion(row.descripcion);
      
      groups[clientId].totalMonto += montoFinal;
      
      if (row.estado === 'pagado') {
        groups[clientId].totalPagado += montoFinal;
      } else if (row.estado === 'pago_parcial') {
        groups[clientId].totalPagado += desc.monto_pagado;
      }
    });
    
    return Object.values(groups).sort((a, b) => {
      if (a.id === 'manual') return 1;
      if (b.id === 'manual') return -1;
      return a.nombre.localeCompare(b.nombre);
    });
  }, [facturas]);

  const toggleGroup = (id: string) => setExpandedGroups(prev => prev.includes(id) ? prev.filter(gId => gId !== id) : [...prev, id]);

  const handleEstadoChange = (row: any, newEstado: string) => {
    if (newEstado === 'pagado' || newEstado === 'pago_parcial') {
      const desc = parseDescripcion(row.descripcion);
      const final = Number(row.monto_final || row.monto_base);
      
      setPayData({
        estado_destino: newEstado,
        monto_pagado: newEstado === 'pagado' ? String(final) : (desc.monto_pagado > 0 ? String(desc.monto_pagado) : ''),
        es_informal: desc.es_informal
      });
      setPayModal({ isOpen: true, row });
    } else {
      // Si vuelve a por_enviar o enviada, reseteamos el monto pagado a 0
      const desc = parseDescripcion(row.descripcion);
      const newDesc = JSON.stringify({ ...desc, monto_pagado: 0 });
      saveRowMutation.mutate({ id: row.id, estado: newEstado, descripcion: newDesc });
    }
  };

  const confirmPayment = () => {
    const { row } = payModal;
    const desc = parseDescripcion(row.descripcion);
    const acumulado = Number(payData.monto_pagado);
    const final = Number(row.monto_final || row.monto_base);
    
    const newDesc = JSON.stringify({
      ...desc,
      monto_pagado: acumulado,
      es_informal: payData.es_informal
    });

    let finalEstado = payData.estado_destino;
    if (acumulado >= final) finalEstado = 'pagado';
    else if (acumulado > 0 && acumulado < final) finalEstado = 'pago_parcial';
    else if (acumulado === 0) finalEstado = 'por_enviar';

    saveRowMutation.mutate({
      id: row.id,
      estado: finalEstado,
      descripcion: newDesc
    });

    setPayModal({ isOpen: false, row: null });
    showSuccess('Pago registrado correctamente');
  };

  const openWpModal = (row: any) => {
    const [year, month] = (row.mes || '').split('-');
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    const diaVto = row.cliente?.dia_facturacion || 10;
    
    const descData = parseDescripcion(row.descripcion);
    const savedPeriodoLocal = row.cliente?.id ? localStorage.getItem(`periodo_facturacion_${row.cliente.id}`) : null;
    const defaultPeriodo = descData.periodo || savedPeriodoLocal || `01 al ${lastDay} de cada mes - fecha de vto para el pago ${diaVto} de cada mes.`;

    setWpData({ row, periodo: defaultPeriodo, notasExtras: '' });
    setWpModalOpen(true);
  };

  const confirmWpSend = () => {
    const { row, periodo, notasExtras } = wpData;
    if (row.cliente?.id) localStorage.setItem(`periodo_facturacion_${row.cliente.id}`, periodo);

    const descData = parseDescripcion(row.descripcion);
    const newDesc = JSON.stringify({ ...descData, periodo });
    saveRowMutation.mutate({ id: row.id, descripcion: newDesc });

    const [year, month] = (row.mes || '').split('-');
    const mesDate = new Date(Number(year), Number(month) - 1, 15);
    const mesNombre = mesDate.toLocaleDateString('es-AR', { month: 'long' });

    const texto = `Hola! Solicito la emisión de factura:
    
*Proyecto:* ${row.cliente?.nombre || 'Particular'}
*CUIT Empresa:* ${row.cuit_responsable || row.cliente?.cuit || 'No especificado'}
*Cuota:* ${row.cuota}
*Mes:* ${mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1)}
*Período facturado:* ${periodo}
*Monto final a facturar:* ${formatARS(row.monto_final || row.monto_base)}
*Responsable AFIP:* ${row.responsable_afip || 'No especificado'}
*Descripción:* ${descData.texto || '-'}${notasExtras ? `\n\n*Notas:* ${notasExtras}` : ''}
`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
    setWpModalOpen(false);
  };

  const startEditing = (row: any) => {
    setEditingId(row.id);
    const desc = parseDescripcion(row.descripcion);
    setEditData({
      cuota: row.cuota || '',
      mes: row.mes || '',
      monto_base: row.monto_base,
      porcentaje_inflacion: row.porcentaje_inflacion || 0,
      responsable_afip: row.responsable_afip || '',
      cuit_responsable: row.cuit_responsable || '',
      texto: desc.texto || '',
      periodo: desc.periodo || '',
      link: desc.link || '',
      es_informal: desc.es_informal || false
    });
  };

  const saveEditing = () => {
    const desc = parseDescripcion(facturas?.find((f:any) => f.id === editingId)?.descripcion);
    const newDesc = JSON.stringify({
      ...desc,
      texto: editData.texto,
      periodo: editData.periodo,
      link: editData.link,
      es_informal: editData.es_informal
    });
    
    saveRowMutation.mutate({ 
      id: editingId, 
      cuota: editData.cuota,
      mes: editData.mes,
      monto_base: editData.monto_base,
      porcentaje_inflacion: editData.porcentaje_inflacion,
      responsable_afip: editData.responsable_afip,
      cuit_responsable: editData.cuit_responsable,
      descripcion: newDesc
    });
  };

  const saveManualForm = () => {
    const newDesc = JSON.stringify({
      texto: manualForm.texto,
      periodo: manualForm.periodo,
      link: manualForm.link,
      es_informal: manualForm.es_informal
    });
    saveRowMutation.mutate({ ...manualForm, descripcion: newDesc });
  };

  return (
    <div className="animate-in fade-in duration-500 pb-12 w-full">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-jengibre-dark">Cronograma de Facturación</h1>
          <p className="text-gray-600 mt-1">Control mensual de emisión de facturas y cobranzas por cliente.</p>
        </div>
        <button 
          onClick={() => { setManualForm({...manualForm, mes: new Date().toISOString().split('T')[0]}); setIsFormOpen(true); }}
          className="bg-jengibre-primary hover:bg-[#a64120] text-white px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 shadow-sm"
        >
          <Plus size={20} /> Fila Manual
        </button>
      </header>

      {/* Modal Envío WhatsApp */}
      {wpModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl animate-in zoom-in-95">
            <h2 className="text-xl font-display font-bold mb-2 flex items-center gap-2 text-jengibre-dark">
              <MessageCircle className="text-[#25D366]" /> Solicitar Factura
            </h2>
            <div className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Período Facturado</label>
                <textarea rows={2} className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-jengibre-primary text-sm" value={wpData.periodo} onChange={e => setWpData({...wpData, periodo: e.target.value})} placeholder="Ej: 01 al 30 de cada mes..." />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Notas extras para contadora</label>
                <input type="text" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-jengibre-primary text-sm" value={wpData.notasExtras} onChange={e => setWpData({...wpData, notasExtras: e.target.value})} placeholder="Opcional..." />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setWpModalOpen(false)} className="px-4 py-2 text-gray-600 font-medium">Cancelar</button>
              <button onClick={confirmWpSend} className="bg-[#25D366] hover:bg-[#1ebd5c] text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm transition-colors">
                <Send size={16} /> Enviar a WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pago Parcial / Informal */}
      {payModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl animate-in zoom-in-95">
            <h2 className="text-xl font-display font-bold mb-4 text-jengibre-dark flex items-center gap-2">
              <DollarSign className="text-green-600" /> Registrar Cobro
            </h2>
            
            <div className="bg-gray-50 p-3 rounded-lg mb-4 text-sm text-center border border-gray-100">
              Monto Total de Cuota:<br/>
              <span className="text-2xl font-mono font-bold text-gray-900">
                {formatARS(payModal.row?.monto_final || payModal.row?.monto_base)}
              </span>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Monto Acumulado (Ya cobrado)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                  <input 
                    type="number" step="0.01" min="0" autoFocus
                    className="w-full border border-gray-300 rounded-lg p-2.5 pl-8 outline-none focus:ring-2 focus:ring-jengibre-primary font-mono text-lg" 
                    value={payData.monto_pagado} 
                    onChange={e => setPayData({...payData, monto_pagado: e.target.value})}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">Escribí la plata total que ya entró por esta cuota.</p>
              </div>

              <div className="flex items-center gap-3 bg-amber-50 p-3 rounded-lg border border-amber-100">
                <input 
                  type="checkbox" id="informal_cobro" 
                  className="w-5 h-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  checked={payData.es_informal} 
                  onChange={e => setPayData({...payData, es_informal: e.target.checked})}
                />
                <label htmlFor="informal_cobro" className="text-sm font-bold text-amber-800 cursor-pointer select-none">
                  Cobro Informal (Sin Factura)
                </label>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setPayModal({isOpen: false, row: null}); queryClient.invalidateQueries({queryKey:['facturacion']}); }} className="px-4 py-2 text-gray-600 font-medium">Cancelar</button>
              <button onClick={confirmPayment} className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-bold shadow-sm transition-colors">
                Guardar Pago
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Fila Manual */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-xl animate-in zoom-in-95">
            <h2 className="text-xl font-display font-bold mb-4">Agregar Fila Manual</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <div><label className="text-xs font-bold text-gray-600">Cliente</label><select className="w-full border rounded p-2 text-sm" value={manualForm.cliente_id} onChange={e => setManualForm({...manualForm, cliente_id: e.target.value})}><option value="">Manual...</option>{clientes?.map((c:any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-bold text-gray-600">Cuota</label><input className="w-full border rounded p-2 text-sm" value={manualForm.cuota} onChange={e => setManualForm({...manualForm, cuota: e.target.value})}/></div>
                  <div><label className="text-xs font-bold text-gray-600">Mes</label><input type="date" className="w-full border rounded p-2 text-sm" value={manualForm.mes} onChange={e => setManualForm({...manualForm, mes: e.target.value})}/></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-bold text-gray-600">Monto Base</label><input type="number" className="w-full border rounded p-2 text-sm" value={manualForm.monto_base} onChange={e => setManualForm({...manualForm, monto_base: e.target.value})}/></div>
                  <div><label className="text-xs font-bold text-gray-600">Inflación (%)</label><input type="number" className="w-full border rounded p-2 text-sm" value={manualForm.porcentaje_inflacion} onChange={e => setManualForm({...manualForm, porcentaje_inflacion: e.target.value})}/></div>
                </div>
                <div className="pt-2">
                  <div className="flex items-center gap-2 bg-amber-50 p-2 rounded border border-amber-100">
                    <input type="checkbox" id="inf" checked={manualForm.es_informal} onChange={e => setManualForm({...manualForm, es_informal: e.target.checked})} />
                    <label htmlFor="inf" className="text-xs font-bold text-amber-800">Cobro Informal (Sin factura)</label>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                {!manualForm.es_informal && (
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs font-bold text-gray-600">Resp. AFIP</label><input className="w-full border rounded p-2 text-sm" value={manualForm.responsable_afip} onChange={e => setManualForm({...manualForm, responsable_afip: e.target.value})}/></div>
                    <div><label className="text-xs font-bold text-gray-600">CUIT Resp.</label><input className="w-full border rounded p-2 text-sm font-mono" value={manualForm.cuit_responsable} onChange={e => setManualForm({...manualForm, cuit_responsable: e.target.value})}/></div>
                  </div>
                )}
                <div><label className="text-xs font-bold text-gray-600">Período Facturado</label><input className="w-full border rounded p-2 text-sm" value={manualForm.periodo} onChange={e => setManualForm({...manualForm, periodo: e.target.value})}/></div>
                <div><label className="text-xs font-bold text-gray-600">Concepto</label><input className="w-full border rounded p-2 text-sm" value={manualForm.texto} onChange={e => setManualForm({...manualForm, texto: e.target.value})}/></div>
                <div><label className="text-xs font-bold text-gray-600">Link Factura</label><input className="w-full border rounded p-2 text-sm" placeholder="https://" value={manualForm.link} onChange={e => setManualForm({...manualForm, link: e.target.value})}/></div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 border-t pt-4">
              <button onClick={() => setIsFormOpen(false)} className="px-4 py-2 text-gray-600">Cancelar</button>
              <button onClick={saveManualForm} className="bg-jengibre-primary text-white px-6 py-2 rounded-lg font-medium">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* LISTADO DE GRUPOS */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="p-12 flex justify-center"><div className="w-8 h-8 border-4 border-jengibre-primary border-t-transparent rounded-full animate-spin"></div></div>
        ) : groupedFacturas.length === 0 ? (
          <div className="p-12 text-center text-gray-500 bg-white border border-jengibre-border rounded-xl shadow-sm">
            <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400"><Building size={32} /></div>
            No hay facturación generada. Ve a un cliente para generar su cronograma.
          </div>
        ) : (
          groupedFacturas.map((group) => {
            const isExpanded = expandedGroups.includes(group.id);
            
            return (
              <div key={group.id} className="bg-white border border-jengibre-border rounded-xl shadow-sm overflow-hidden transition-all duration-300">
                <div onClick={() => toggleGroup(group.id)} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-gray-50/80 transition-colors select-none">
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${isExpanded ? 'bg-jengibre-primary text-white' : 'bg-jengibre-cream text-jengibre-primary'}`}>
                      {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </div>
                    <div>
                      <h3 className="font-display font-bold text-xl text-gray-900">{group.nombre}</h3>
                      {group.cuit && <p className="text-sm text-gray-500 font-mono mt-0.5">CUIT: {group.cuit}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-6 sm:ml-auto border-t sm:border-t-0 pt-3 sm:pt-0">
                    <div className="text-left sm:text-right flex-1">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Avance de cobros</p>
                      <p className="font-mono text-sm">
                        <span className="font-bold text-green-600">{formatARS(group.totalPagado)}</span> 
                        <span className="text-gray-300 mx-1.5">/</span> 
                        <span className="font-bold text-gray-900">{formatARS(group.totalMonto)}</span>
                      </p>
                    </div>
                    <div className="text-xs font-bold bg-gray-100 px-3 py-1.5 rounded-md text-gray-600 shrink-0">{group.items.length} cuotas</div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-jengibre-border bg-[#fdfcfa] overflow-x-auto p-3 sm:p-4 animate-in slide-in-from-top-2">
                    <table className="w-full text-left border-collapse text-xs bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                      <thead>
                        <tr className="bg-gray-50 text-gray-700 border-b border-gray-200 font-bold uppercase tracking-wider text-[10px]">
                          <th className="px-2 py-2 border-r border-gray-200 text-center w-16">Cuota</th>
                          <th className="px-2 py-2 border-r border-gray-200 text-center w-24">Mes</th>
                          <th className="px-2 py-2 border-r border-gray-200 text-left w-32">Período</th>
                          <th className="px-2 py-2 border-r border-gray-200 text-right w-28">Montos</th>
                          <th className="px-2 py-2 border-r border-gray-200 w-36">Facturar a</th>
                          <th className="px-2 py-2 border-r border-gray-200 min-w-[120px]">Concepto / Link</th>
                          <th className="px-2 py-2 border-r border-gray-200 text-center min-w-[130px]">Estado</th>
                          <th className="px-2 py-2 text-center w-24 bg-gray-50">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((row: any) => {
                          const isEditing = editingId === row.id;
                          const mesDate = new Date(row.mes + 'T12:00:00Z');
                          const mesNombre = mesDate.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' });
                          const descData = parseDescripcion(row.descripcion);
                          const finalMonto = Number(row.monto_final || row.monto_base);
                          
                          return (
                            <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                              
                              {/* EDICIÓN EN LÍNEA */}
                              {isEditing ? (
                                <>
                                  <td className="px-2 py-1 border-r border-gray-100">
                                    <input className="w-full text-[11px] p-1 border border-blue-300 rounded outline-none text-center font-bold" value={editData.cuota} onChange={e => setEditData({...editData, cuota: e.target.value})} />
                                  </td>
                                  <td className="px-2 py-1 border-r border-gray-100">
                                    <input type="date" className="w-full text-[11px] p-1 border border-blue-300 rounded outline-none text-center" value={editData.mes} onChange={e => setEditData({...editData, mes: e.target.value})} />
                                  </td>
                                  <td className="px-2 py-1 border-r border-gray-100">
                                    <input className="w-full text-[11px] p-1 border border-blue-300 rounded outline-none" placeholder="Período" value={editData.periodo} onChange={e => setEditData({...editData, periodo: e.target.value})} />
                                  </td>
                                  <td className="px-2 py-1 border-r border-gray-100">
                                    <input type="number" className="w-full border border-blue-300 p-1 mb-1 text-right text-[11px] rounded outline-none" placeholder="Base" value={editData.monto_base} onChange={e => setEditData({...editData, monto_base: e.target.value})} />
                                    <input type="number" className="w-full border border-blue-300 p-1 text-center text-[11px] rounded outline-none" placeholder="% Inf." value={editData.porcentaje_inflacion} onChange={e => setEditData({...editData, porcentaje_inflacion: e.target.value})} />
                                  </td>
                                  <td className="px-2 py-1 border-r border-gray-100 bg-amber-50/30">
                                    <div className="flex items-center gap-1 mb-1 bg-amber-100 p-1 rounded">
                                      <input type="checkbox" id={`inf-${row.id}`} checked={editData.es_informal} onChange={e => setEditData({...editData, es_informal: e.target.checked})} />
                                      <label htmlFor={`inf-${row.id}`} className="text-[10px] font-bold text-amber-800 cursor-pointer">Sin Factura</label>
                                    </div>
                                    {!editData.es_informal && (
                                      <>
                                        <input className="w-full border border-blue-300 p-1 mb-1 text-[11px] rounded outline-none" placeholder="Nombre AFIP" value={editData.responsable_afip} onChange={e => setEditData({...editData, responsable_afip: e.target.value})} />
                                        <input className="w-full border border-blue-300 p-1 text-[11px] rounded outline-none font-mono" placeholder="CUIT" value={editData.cuit_responsable} onChange={e => setEditData({...editData, cuit_responsable: e.target.value})} />
                                      </>
                                    )}
                                  </td>
                                  <td className="px-2 py-1 border-r border-gray-100">
                                    <input className="w-full border border-blue-300 p-1 mb-1 text-[11px] rounded outline-none" placeholder="Concepto" value={editData.texto} onChange={e => setEditData({...editData, texto: e.target.value})} />
                                    <input className="w-full border border-blue-300 p-1 text-[11px] rounded outline-none" placeholder="Link de factura" value={editData.link} onChange={e => setEditData({...editData, link: e.target.value})} />
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="px-2 py-2 font-bold text-center border-r border-gray-100">{row.cuota}</td>
                                  <td className="px-2 py-2 text-center capitalize border-r border-gray-100 font-medium whitespace-nowrap">{mesNombre}</td>
                                  <td className="px-2 py-2 border-r border-gray-100 text-gray-600 text-[11px] leading-tight max-w-[120px] truncate" title={descData.periodo}>{descData.periodo || '-'}</td>
                                  
                                  <td className="px-2 py-2 text-right border-r border-gray-100 whitespace-nowrap">
                                    <div className="font-mono font-bold text-jengibre-dark text-[13px]">{formatARS(finalMonto)}</div>
                                    {row.estado === 'pago_parcial' && descData.monto_pagado > 0 ? (
                                      <div className="text-[10px] text-amber-600 font-bold mt-0.5">Resta: {formatARS(finalMonto - descData.monto_pagado)}</div>
                                    ) : (
                                      <div className="text-[10px] text-gray-400 font-mono mt-0.5">Base: {formatARS(row.monto_base)} {row.porcentaje_inflacion > 0 && `(+${row.porcentaje_inflacion}%)`}</div>
                                    )}
                                  </td>
                                  
                                  <td className="px-2 py-2 border-r border-gray-100 max-w-[140px] truncate">
                                    {descData.es_informal ? (
                                      <div className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200 inline-block">💵 SIN FACTURA</div>
                                    ) : (
                                      <>
                                        <div className="font-medium text-gray-800 truncate" title={row.responsable_afip}>{row.responsable_afip || '-'}</div>
                                        <div className="text-[10px] text-gray-500 font-mono mt-0.5 truncate" title={row.cuit_responsable}>{row.cuit_responsable}</div>
                                      </>
                                    )}
                                  </td>
                                  
                                  <td className="px-2 py-2 border-r border-gray-100 text-gray-600 text-[11px] leading-tight max-w-[140px] truncate">
                                    <div title={descData.texto} className="truncate mb-1">{descData.texto || '-'}</div>
                                    {descData.link && (
                                      <a href={descData.link} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline font-bold text-[10px] bg-blue-50 px-1.5 py-0.5 rounded inline-flex items-center gap-1 truncate w-fit max-w-[100px]" title={descData.link}><LinkIcon size={10} /> Factura</a>
                                    )}
                                  </td>
                                </>
                              )}

                              {/* SELECTOR DE ESTADO */}
                              <td className="px-2 py-2 border-r border-gray-100 text-center">
                                <select 
                                  className={`text-[11px] font-bold rounded px-1 py-1.5 outline-none cursor-pointer border w-full text-center appearance-none ${
                                    row.estado === 'pagado' ? 'bg-green-100 text-green-800 border-green-200' :
                                    row.estado === 'pago_parcial' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                                    row.estado === 'enviada' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                                    'bg-gray-100 text-gray-600 border-gray-200'
                                  }`}
                                  value={row.estado}
                                  onChange={(e) => handleEstadoChange(row, e.target.value)}
                                >
                                  <option value="por_enviar">⌛ Por Facturar</option>
                                  <option value="enviada">📄 Factura Enviada</option>
                                  <option value="pago_parcial">⏳ Pago Parcial</option>
                                  <option value="pagado">✅ Pagado</option>
                                </select>
                              </td>

                              {/* ACCIONES */}
                              <td className="px-2 py-2">
                                <div className="flex items-center justify-center gap-1">
                                  {isEditing ? (
                                    <button onClick={saveEditing} className="p-1.5 bg-green-100 text-green-700 rounded shadow-sm hover:bg-green-200" title="Guardar"><Save size={14} /></button>
                                  ) : (
                                    <>
                                      {!descData.es_informal && (
                                        <button onClick={() => openWpModal(row)} className="p-1.5 text-green-600 bg-green-50 hover:bg-green-100 rounded border border-green-100" title="Solicitar a contadora por WhatsApp">
                                          <MessageCircle size={14} />
                                        </button>
                                      )}
                                      <button onClick={() => startEditing(row)} className="p-1.5 text-gray-400 hover:text-blue-600" title="Editar cuota"><Edit2 size={14} /></button>
                                      <button onClick={() => { if(confirm('¿Eliminar esta cuota?')) deleteMutation.mutate(row.id); }} className="p-1.5 text-gray-400 hover:text-red-600" title="Eliminar"><Trash2 size={14} /></button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}