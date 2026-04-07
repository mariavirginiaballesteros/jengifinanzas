import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TipAlert } from '@/components/TipAlert';
import { Plus, Edit2, Trash2, MessageCircle, FileText, CheckCircle2, Clock } from 'lucide-react';
import { formatARS } from '@/lib/utils';
import { showSuccess, showError } from '@/utils/toast';

export default function Contadora() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const defaultForm = {
    tipo: 'Emisión de Factura',
    cliente_id: '',
    periodo: new Date().toISOString().slice(0, 7), // YYYY-MM
    monto_neto: '',
    monto_con_iva: '',
    referencia: '',
    datos_adicionales: '',
    estado: 'pendiente'
  };
  const [formData, setFormData] = useState<any>(defaultForm);

  const { data: solicitudes, isLoading } = useQuery({
    queryKey: ['solicitudes_contadora'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('solicitudes_contadora')
        .select(`*, cliente:clientes(nombre, cuit)`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const { data: clientes } = useQuery({
    queryKey: ['clientes_combo_contadora'],
    queryFn: async () => {
      const { data } = await supabase.from('clientes').select('id, nombre, cuit').eq('estado', 'activo');
      return data || [];
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      const dataToSave = {
        ...payload,
        cliente_id: payload.cliente_id || null,
        monto_neto: payload.monto_neto ? Number(payload.monto_neto) : null,
        monto_con_iva: payload.monto_con_iva ? Number(payload.monto_con_iva) : null,
      };

      if (editingId) {
        const { error } = await supabase.from('solicitudes_contadora').update(dataToSave).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('solicitudes_contadora').insert([dataToSave]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes_contadora'] });
      showSuccess(editingId ? 'Solicitud actualizada' : 'Solicitud creada');
      closeForm();
    },
    onError: (err: any) => showError(err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('solicitudes_contadora').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes_contadora'] });
      showSuccess('Solicitud eliminada');
    }
  });

  const updateEstadoMutation = useMutation({
    mutationFn: async ({ id, estado }: { id: string, estado: string }) => {
      const { error } = await supabase.from('solicitudes_contadora').update({ estado }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes_contadora'] });
      showSuccess('Estado actualizado');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.tipo) return showError('El tipo de solicitud es requerido');
    saveMutation.mutate(formData);
  };

  const openEdit = (sol: any) => {
    setFormData({
      tipo: sol.tipo || 'Emisión de Factura',
      cliente_id: sol.cliente_id || '',
      periodo: sol.periodo || '',
      monto_neto: sol.monto_neto || '',
      monto_con_iva: sol.monto_con_iva || '',
      referencia: sol.referencia || '',
      datos_adicionales: sol.datos_adicionales || '',
      estado: sol.estado || 'pendiente'
    });
    setEditingId(sol.id);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormData(defaultForm);
  };

  const calcularIva = () => {
    if (formData.monto_neto) {
      const neto = Number(formData.monto_neto);
      setFormData({ ...formData, monto_con_iva: (neto * 1.21).toFixed(2) });
    }
  };

  const sendWhatsApp = (sol: any) => {
    let msg = `Hola! Te paso un pedido de *${sol.tipo}*:%0A%0A`;
    
    if (sol.cliente) {
      msg += `*Cliente:* ${sol.cliente.nombre}%0A`;
      if (sol.cliente.cuit) msg += `*CUIT:* ${sol.cliente.cuit}%0A`;
    }
    
    if (sol.periodo) msg += `*Período:* ${sol.periodo}%0A`;
    if (sol.monto_neto) msg += `*Monto Neto:* ${formatARS(sol.monto_neto)}%0A`;
    if (sol.monto_con_iva) msg += `*Monto Final (con IVA):* ${formatARS(sol.monto_con_iva)}%0A`;
    if (sol.referencia) msg += `*Referencia/Concepto:* ${sol.referencia}%0A`;
    if (sol.datos_adicionales) msg += `*Notas:* ${sol.datos_adicionales}%0A`;
    
    msg += `%0AQuedo atento/a, gracias!`;
    
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  return (
    <div className="animate-in fade-in duration-500 pb-12 w-full">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-jengibre-dark">Módulo Contadora</h1>
          <p className="text-gray-600 mt-1">Gestión de solicitudes de facturación, impuestos y trámites.</p>
        </div>
        <button 
          onClick={() => setIsFormOpen(true)}
          className="bg-jengibre-primary hover:bg-[#a64120] text-white px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 shadow-sm"
        >
          <Plus size={20} /> Nueva Solicitud
        </button>
      </header>

      <TipAlert id="contadora_intro" title="💡 Centralizá los pedidos a tu Estudio Contable">
        Creá el requerimiento, hacé clic en el ícono de WhatsApp para enviarle la info ordenada a tu contadora y luego marcá la tarea como "Completada" cuando te envíe el comprobante.
      </TipAlert>

      {/* FORMULARIO MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-display font-bold mb-6 flex items-center gap-2">
              <FileText className="text-jengibre-primary" />
              {editingId ? 'Editar Solicitud' : 'Nueva Solicitud'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Trámite</label>
                  <select 
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white"
                    value={formData.tipo} onChange={e => setFormData({...formData, tipo: e.target.value})}
                    required
                  >
                    <option value="Emisión de Factura">Emisión de Factura</option>
                    <option value="Generación de VEP (AFIP)">Generación de VEP (AFIP)</option>
                    <option value="Liquidación de Sueldos">Liquidación de Sueldos</option>
                    <option value="Alta/Baja de Empleado">Alta/Baja de Empleado</option>
                    <option value="Consulta General">Consulta General</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Período (Mes/Año)</label>
                  <input 
                    type="month"
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white"
                    value={formData.periodo} onChange={e => setFormData({...formData, periodo: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente Asociado (Opcional)</label>
                <select 
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white"
                  value={formData.cliente_id} onChange={e => setFormData({...formData, cliente_id: e.target.value})}
                >
                  <option value="">-- Trámite Interno / Sin Cliente --</option>
                  {clientes?.map((c:any) => <option key={c.id} value={c.id}>{c.nombre} (CUIT: {c.cuit || 'N/A'})</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Concepto / Referencia</label>
                <input 
                  type="text" placeholder="Ej: Honorarios mes de Julio"
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white"
                  value={formData.referencia} onChange={e => setFormData({...formData, referencia: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-xl border border-gray-100">
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Monto Neto</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                    <input 
                      type="number" step="0.01"
                      className="w-full border border-gray-300 rounded-lg p-2.5 pl-8 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white"
                      value={formData.monto_neto} onChange={e => setFormData({...formData, monto_neto: e.target.value})}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider">Monto C/ IVA</label>
                    <button type="button" onClick={calcularIva} className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold hover:bg-blue-200">+21%</button>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                    <input 
                      type="number" step="0.01"
                      className="w-full border border-gray-300 rounded-lg p-2.5 pl-8 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white"
                      value={formData.monto_con_iva} onChange={e => setFormData({...formData, monto_con_iva: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas Adicionales</label>
                <textarea 
                  rows={2} placeholder="Datos extra, observaciones, etc."
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white"
                  value={formData.datos_adicionales} onChange={e => setFormData({...formData, datos_adicionales: e.target.value})}
                />
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button type="button" onClick={closeForm} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors">Cancelar</button>
                <button type="submit" disabled={saveMutation.isPending} className="bg-jengibre-primary hover:bg-[#a64120] text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50">
                  {saveMutation.isPending ? 'Guardando...' : 'Guardar Solicitud'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LISTADO DE SOLICITUDES */}
      <div className="bg-white border border-jengibre-border rounded-2xl overflow-hidden shadow-sm">
        {isLoading ? (
           <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-jengibre-primary border-t-transparent rounded-full animate-spin"></div></div>
        ) : solicitudes?.length === 0 ? (
          <div className="p-12 text-center">
            <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400"><FileText size={32} /></div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Sin solicitudes</h3>
            <p className="text-gray-500 mb-4">No hay pedidos pendientes para el estudio contable.</p>
            <button onClick={() => setIsFormOpen(true)} className="text-jengibre-primary font-bold hover:underline">+ Crear el primero</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-jengibre-cream/50 text-jengibre-dark text-sm border-b border-jengibre-border">
                  <th className="px-4 py-3 font-bold">Fecha / Período</th>
                  <th className="px-4 py-3 font-bold">Tipo de Solicitud</th>
                  <th className="px-4 py-3 font-bold">Cliente</th>
                  <th className="px-4 py-3 font-bold">Concepto / Montos</th>
                  <th className="px-4 py-3 font-bold text-center">Estado</th>
                  <th className="px-4 py-3 font-bold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {solicitudes?.map((sol) => {
                  const isPendiente = sol.estado === 'pendiente';
                  return (
                    <tr key={sol.id} className={`border-b border-gray-100 hover:bg-gray-50 transition-colors group ${!isPendiente ? 'opacity-60 bg-gray-50/50' : ''}`}>
                      <td className="px-4 py-4">
                        <p className="text-sm font-bold text-gray-800">{sol.periodo || 'N/A'}</p>
                        <p className="text-[10px] text-gray-400 uppercase mt-0.5">Creado: {new Date(sol.created_at).toLocaleDateString()}</p>
                      </td>
                      <td className="px-4 py-4 font-medium text-gray-900">{sol.tipo}</td>
                      <td className="px-4 py-4">
                        {sol.cliente ? (
                          <>
                            <p className="font-bold text-jengibre-dark">{sol.cliente.nombre}</p>
                            {sol.cliente.cuit && <p className="text-xs text-gray-500 font-mono mt-0.5">CUIT: {sol.cliente.cuit}</p>}
                          </>
                        ) : (
                          <span className="text-sm text-gray-400 italic">Trámite Interno</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm text-gray-700 truncate max-w-[200px]" title={sol.referencia}>{sol.referencia || '-'}</p>
                        {sol.monto_neto && (
                          <div className="flex gap-2 mt-1">
                            <span className="text-xs font-mono font-bold text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">Neto: {formatARS(sol.monto_neto)}</span>
                            {sol.monto_con_iva && <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">+IVA: {formatARS(sol.monto_con_iva)}</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <button 
                          onClick={() => updateEstadoMutation.mutate({ id: sol.id, estado: isPendiente ? 'completado' : 'pendiente' })}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mx-auto transition-colors ${
                            isPendiente 
                              ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' 
                              : 'bg-green-100 text-green-700 hover:bg-green-200'
                          }`}
                        >
                          {isPendiente ? <Clock size={14} /> : <CheckCircle2 size={14} />}
                          {isPendiente ? 'Pendiente' : 'Listo'}
                        </button>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => sendWhatsApp(sol)} className="p-1.5 text-[#25D366] hover:bg-[#25D366]/10 rounded-lg transition-colors" title="Enviar por WhatsApp"><MessageCircle size={18} /></button>
                          <div className="w-px h-4 bg-gray-200 mx-1"></div>
                          <button onClick={() => openEdit(sol)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"><Edit2 size={16} /></button>
                          <button onClick={() => { if(confirm('¿Eliminar solicitud?')) deleteMutation.mutate(sol.id); }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={16} /></button>
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
    </div>
  );
}