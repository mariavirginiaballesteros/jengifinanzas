import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TipAlert } from '@/components/TipAlert';
import { Plus, Edit2, Trash2, MessageCircle, Save, ChevronDown, ChevronRight, Building, Send, Link as LinkIcon } from 'lucide-react';
import { formatARS } from '@/lib/utils';
import { showSuccess, showError } from '@/utils/toast';

// Helper para guardar período y link dentro de descripcion
const parseDescripcion = (descStr: string | null) => {
  if (!descStr) return { texto: '', periodo: '', link: '' };
  try {
    const parsed = JSON.parse(descStr);
    if (parsed && typeof parsed === 'object') {
      return {
        texto: parsed.texto || '',
        periodo: parsed.periodo || '',
        link: parsed.link || ''
      };
    }
  } catch (e) {
    // Si no es JSON, es una descripción vieja en texto plano
  }
  return { texto: descStr || '', periodo: '', link: '' };
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
    monto_base: '', porcentaje_inflacion: 0, responsable_afip: '', cuit_responsable: '', texto: '', periodo: '', link: ''
  });

  // Modal para configurar el mensaje de WhatsApp
  const [wpModalOpen, setWpModalOpen] = useState(false);
  const [wpData, setWpData] = useState<any>({
    row: null,
    periodo: '',
    notasExtras: ''
  });

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

  const updateEstadoMutation = useMutation({
    mutationFn: async ({ id, estado }: { id: string, estado: string }) => {
      const { error } = await supabase.from('facturacion').update({ estado }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['facturacion'] }),
    onError: (err: any) => showError(err.message)
  });

  const saveRowMutation = useMutation({
    mutationFn: async (payload: any) => {
      const inflacion = Number(payload.porcentaje_inflacion) || 0;
      const base = Number(payload.monto_base) || 0;
      const final = base * (1 + (inflacion / 100));
      
      const dataToSave = { ...payload, monto_final: final };

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

  // Procesamiento de datos para agrupar por Cliente
  const groupedFacturas = useMemo(() => {
    if (!facturas) return [];
    
    const groups: Record<string, any> = {};
    
    facturas.forEach(row => {
      const clientId = row.cliente?.id || 'manual';
      const clientName = row.cliente?.nombre || 'Operaciones Manuales';
      
      if (!groups[clientId]) {
        groups[clientId] = {
          id: clientId,
          nombre: clientName,
          cuit: row.cliente?.cuit || '',
          items: [],
          totalMonto: 0,
          totalPagado: 0
        };
      }
      
      groups[clientId].items.push(row);
      const montoFinal = Number(row.monto_final || row.monto_base || 0);
      groups[clientId].totalMonto += montoFinal;
      
      if (row.estado === 'pagado') {
        groups[clientId].totalPagado += montoFinal;
      }
    });
    
    return Object.values(groups).sort((a, b) => {
      if (a.id === 'manual') return 1;
      if (b.id === 'manual') return -1;
      return a.nombre.localeCompare(b.nombre);
    });
  }, [facturas]);

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => 
      prev.includes(id) ? prev.filter(gId => gId !== id) : [...prev, id]
    );
  };

  const openWpModal = (row: any) => {
    const [year, month] = (row.mes || '').split('-');
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    const diaVto = row.cliente?.dia_facturacion || 10;
    
    const descData = parseDescripcion(row.descripcion);
    const savedPeriodoLocal = row.cliente?.id ? localStorage.getItem(`periodo_facturacion_${row.cliente.id}`) : null;
    
    // Prioridad: 1. Periodo guardado en la fila | 2. Cache local | 3. Default calculado
    const defaultPeriodo = descData.periodo || savedPeriodoLocal || `01 al ${lastDay} de cada mes - fecha de vto para el pago ${diaVto} de cada mes.`;

    setWpData({
      row,
      periodo: defaultPeriodo,
      notasExtras: ''
    });
    setWpModalOpen(true);
  };

  const confirmWpSend = () => {
    const { row, periodo, notasExtras } = wpData;
    
    // Guardamos localmente
    if (row.cliente?.id) {
      localStorage.setItem(`periodo_facturacion_${row.cliente.id}`, periodo);
    }

    // Auto-guardamos el período en la base de datos para esta fila específica
    const descData = parseDescripcion(row.descripcion);
    const newDesc = JSON.stringify({ ...descData, periodo });
    saveRowMutation.mutate({ 
      id: row.id, 
      monto_base: row.monto_base, 
      porcentaje_inflacion: row.porcentaje_inflacion, 
      descripcion: newDesc 
    });

    // Envío del msj
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
    const descData = parseDescripcion(row.descripcion);
    setEditData({
      monto_base: row.monto_base,
      porcentaje_inflacion: row.porcentaje_inflacion || 0,
      responsable_afip: row.responsable_afip || '',
      cuit_responsable: row.cuit_responsable || '',
      texto: descData.texto || '',
      periodo: descData.periodo || '',
      link: descData.link || ''
    });
  };

  const saveEditing = () => {
    const newDesc = JSON.stringify({
      texto: editData.texto,
      periodo: editData.periodo,
      link: editData.link
    });
    
    saveRowMutation.mutate({ 
      id: editingId, 
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
      link: manualForm.link
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

      <TipAlert id="facturacion_grupos" title="💡 Agrupado por Proyecto">
        Ahora la facturación se agrupa por cliente. Hace clic sobre cualquier recuadro para expandir y ver todas las cuotas, editar montos o cambiar los estados de pago.
      </TipAlert>

      {/* Modal Envío WhatsApp */}
      {wpModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl animate-in zoom-in-95">
            <h2 className="text-xl font-display font-bold mb-2 flex items-center gap-2 text-jengibre-dark">
              <MessageCircle className="text-[#25D366]" /> Solicitar Factura
            </h2>
            <p className="text-sm text-gray-500 mb-5">Podés personalizar el período a facturar. El sistema lo recordará automáticamente la próxima vez para este cliente.</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Período Facturado</label>
                <textarea 
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-jengibre-primary text-sm" 
                  value={wpData.periodo} 
                  onChange={e => setWpData({...wpData, periodo: e.target.value})}
                  placeholder="Ej: 01 al 30 de cada mes..."
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Notas extras para la contadora (Opcional)</label>
                <input 
                  type="text"
                  className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-jengibre-primary text-sm" 
                  value={wpData.notasExtras} 
                  onChange={e => setWpData({...wpData, notasExtras: e.target.value})}
                  placeholder="Ej: Facturar mitad a cada CUIT..."
                />
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

      {/* Modal Fila Manual */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-xl animate-in zoom-in-95">
            <h2 className="text-xl font-display font-bold mb-4">Agregar Fila de Facturación</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-gray-600">Proyecto (Cliente)</label>
                  <select className="w-full border rounded p-2 text-sm" value={manualForm.cliente_id} onChange={e => setManualForm({...manualForm, cliente_id: e.target.value})}>
                    <option value="">Ninguno / Manual...</option>
                    {clientes?.map((c:any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-bold text-gray-600">Cuota (1/12)</label><input className="w-full border rounded p-2 text-sm" value={manualForm.cuota} onChange={e => setManualForm({...manualForm, cuota: e.target.value})}/></div>
                  <div><label className="text-xs font-bold text-gray-600">Mes facturado</label><input type="date" className="w-full border rounded p-2 text-sm" value={manualForm.mes} onChange={e => setManualForm({...manualForm, mes: e.target.value})}/></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-bold text-gray-600">Monto Base</label><input type="number" className="w-full border rounded p-2 text-sm" value={manualForm.monto_base} onChange={e => setManualForm({...manualForm, monto_base: e.target.value})}/></div>
                  <div><label className="text-xs font-bold text-gray-600">Inflación (%)</label><input type="number" className="w-full border rounded p-2 text-sm" value={manualForm.porcentaje_inflacion} onChange={e => setManualForm({...manualForm, porcentaje_inflacion: e.target.value})}/></div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-bold text-gray-600">Resp. AFIP</label><input className="w-full border rounded p-2 text-sm" value={manualForm.responsable_afip} onChange={e => setManualForm({...manualForm, responsable_afip: e.target.value})}/></div>
                  <div><label className="text-xs font-bold text-gray-600">CUIT Resp.</label><input className="w-full border rounded p-2 text-sm font-mono" value={manualForm.cuit_responsable} onChange={e => setManualForm({...manualForm, cuit_responsable: e.target.value})}/></div>
                </div>
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

      {/* LISTADO DE GRUPOS (ACORDEONES) */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="p-12 flex justify-center"><div className="w-8 h-8 border-4 border-jengibre-primary border-t-transparent rounded-full animate-spin"></div></div>
        ) : groupedFacturas.length === 0 ? (
          <div className="p-12 text-center text-gray-500 bg-white border border-jengibre-border rounded-xl shadow-sm">
            <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400"><Building size={32} /></div>
            No hay facturación generada. Ve a un cliente para generar su cronograma o agrega una fila manual.
          </div>
        ) : (
          groupedFacturas.map((group) => {
            const isExpanded = expandedGroups.includes(group.id);
            
            return (
              <div key={group.id} className="bg-white border border-jengibre-border rounded-xl shadow-sm overflow-hidden transition-all duration-300">
                {/* HEADER DEL ACORDEÓN */}
                <div 
                  onClick={() => toggleGroup(group.id)}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-gray-50/80 transition-colors select-none"
                >
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
                    <div className="text-xs font-bold bg-gray-100 px-3 py-1.5 rounded-md text-gray-600 shrink-0">
                      {group.items.length} cuotas
                    </div>
                  </div>
                </div>

                {/* CONTENIDO (TABLA DENSA) */}
                {isExpanded && (
                  <div className="border-t border-jengibre-border bg-[#fdfcfa] overflow-x-auto p-3 sm:p-4 animate-in slide-in-from-top-2">
                    <table className="w-full text-left border-collapse text-xs bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                      <thead>
                        <tr className="bg-gray-50 text-gray-700 border-b border-gray-200 font-bold uppercase tracking-wider text-[10px]">
                          <th className="px-2 py-2 border-r border-gray-200 text-center w-16">Cuota</th>
                          <th className="px-2 py-2 border-r border-gray-200 text-center w-24">Mes</th>
                          <th className="px-2 py-2 border-r border-gray-200 text-left w-32">Período</th>
                          <th className="px-2 py-2 border-r border-gray-200 text-right w-28">Montos</th>
                          <th className="px-2 py-2 border-r border-gray-200 w-32">Facturar a</th>
                          <th className="px-2 py-2 border-r border-gray-200 min-w-[120px]">Concepto</th>
                          <th className="px-2 py-2 border-r border-gray-200 text-center w-20">Link</th>
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
                          
                          return (
                            <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                              <td className="px-2 py-2 font-bold text-center border-r border-gray-100">{row.cuota}</td>
                              <td className="px-2 py-2 text-center capitalize border-r border-gray-100 font-medium whitespace-nowrap">{mesNombre}</td>
                              
                              {/* EDICIÓN EN LÍNEA */}
                              {isEditing ? (
                                <>
                                  <td className="px-2 py-1 border-r border-gray-100">
                                    <input className="w-full text-[11px] p-1 border border-blue-300 rounded outline-none" placeholder="Período" value={editData.periodo} onChange={e => setEditData({...editData, periodo: e.target.value})} />
                                  </td>
                                  <td className="px-2 py-1 border-r border-gray-100">
                                    <input type="number" className="w-full border border-blue-300 p-1 mb-1 text-right text-[11px] rounded outline-none" placeholder="Base" value={editData.monto_base} onChange={e => setEditData({...editData, monto_base: e.target.value})} />
                                    <input type="number" className="w-full border border-blue-300 p-1 text-center text-[11px] rounded outline-none" placeholder="% Inf." value={editData.porcentaje_inflacion} onChange={e => setEditData({...editData, porcentaje_inflacion: e.target.value})} />
                                  </td>
                                  <td className="px-2 py-1 border-r border-gray-100">
                                    <input className="w-full border border-blue-300 p-1 mb-1 text-[11px] rounded outline-none" placeholder="Nombre" value={editData.responsable_afip} onChange={e => setEditData({...editData, responsable_afip: e.target.value})} />
                                    <input className="w-full border border-blue-300 p-1 text-[11px] rounded outline-none font-mono" placeholder="CUIT" value={editData.cuit_responsable} onChange={e => setEditData({...editData, cuit_responsable: e.target.value})} />
                                  </td>
                                  <td className="px-2 py-1 border-r border-gray-100">
                                    <input className="w-full border border-blue-300 p-1 text-[11px] rounded outline-none" placeholder="Concepto" value={editData.texto} onChange={e => setEditData({...editData, texto: e.target.value})} />
                                  </td>
                                  <td className="px-2 py-1 border-r border-gray-100">
                                    <input className="w-full border border-blue-300 p-1 text-[11px] rounded outline-none" placeholder="https://" value={editData.link} onChange={e => setEditData({...editData, link: e.target.value})} />
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="px-2 py-2 border-r border-gray-100 text-gray-600 text-[11px] leading-tight max-w-[120px] truncate" title={descData.periodo}>{descData.periodo || '-'}</td>
                                  <td className="px-2 py-2 text-right border-r border-gray-100 whitespace-nowrap">
                                    <div className="font-mono font-bold text-jengibre-dark text-[13px]">{formatARS(row.monto_final || row.monto_base)}</div>
                                    <div className="text-[10px] text-gray-400 font-mono mt-0.5" title={`Inflación: ${row.porcentaje_inflacion}%`}>Base: {formatARS(row.monto_base)} {row.porcentaje_inflacion > 0 && `(+${row.porcentaje_inflacion}%)`}</div>
                                  </td>
                                  <td className="px-2 py-2 border-r border-gray-100 max-w-[130px] truncate">
                                    <div className="font-medium text-gray-800 truncate" title={row.responsable_afip}>{row.responsable_afip || '-'}</div>
                                    <div className="text-[10px] text-gray-500 font-mono mt-0.5 truncate" title={row.cuit_responsable}>{row.cuit_responsable}</div>
                                  </td>
                                  <td className="px-2 py-2 border-r border-gray-100 text-gray-600 text-[11px] leading-tight max-w-[140px] truncate" title={descData.texto}>{descData.texto || '-'}</td>
                                  <td className="px-2 py-2 border-r border-gray-100 text-center">
                                    {descData.link ? (
                                      <a href={descData.link} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline font-bold text-[10px] bg-blue-50 px-2 py-1 rounded inline-flex items-center gap-1 truncate max-w-[80px]" title={descData.link}><LinkIcon size={10} /> Link</a>
                                    ) : (
                                      <span className="text-gray-400 text-[10px] italic">Sin link</span>
                                    )}
                                  </td>
                                </>
                              )}

                              {/* SELECTOR DE ESTADO */}
                              <td className="px-2 py-2 border-r border-gray-100 text-center">
                                <select 
                                  className={`text-[11px] font-bold rounded px-1 py-1.5 outline-none cursor-pointer border w-full text-center appearance-none ${
                                    row.estado === 'pagado' ? 'bg-green-100 text-green-800 border-green-200' :
                                    row.estado === 'enviada' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                                    'bg-gray-100 text-gray-600 border-gray-200'
                                  }`}
                                  value={row.estado}
                                  onChange={(e) => updateEstadoMutation.mutate({ id: row.id, estado: e.target.value })}
                                >
                                  <option value="por_enviar">⌛ Por Facturar</option>
                                  <option value="enviada">📄 Factura Enviada</option>
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
                                      <button onClick={() => openWpModal(row)} className="p-1.5 text-green-600 bg-green-50 hover:bg-green-100 rounded border border-green-100" title="Solicitar a contadora por WhatsApp">
                                        <MessageCircle size={14} />
                                      </button>
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