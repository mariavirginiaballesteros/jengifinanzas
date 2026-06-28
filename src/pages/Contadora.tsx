import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Edit2, Trash2, MessageCircle, FileText, CheckCircle2, Clock, Search, X, Loader2 } from 'lucide-react';
import { formatARS, getLocalDateString } from '@/lib/utils';
import { showSuccess, showError } from '@/utils/toast';

export default function Contadora() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const defaultForm = {
    tipo: 'Emisión de Factura',
    cliente_id: '',
    periodo: getLocalDateString().slice(0, 7),
    monto_neto: '',
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

  const filteredSolicitudes = solicitudes?.filter(s => 
    s.tipo.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.cliente?.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.referencia?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openEdit = (sol: any) => {
    setFormData({
      tipo: sol.tipo || 'Emisión de Factura',
      cliente_id: sol.cliente_id || '',
      periodo: sol.periodo || '',
      monto_neto: sol.monto_neto || '',
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

  const sendWhatsApp = (sol: any) => {
    let msg = `Hola! Te paso un pedido de *${sol.tipo}*:%0A%0A`;
    if (sol.cliente) {
      msg += `*Cliente:* ${sol.cliente.nombre}%0A`;
      if (sol.cliente.cuit) msg += `*CUIT:* ${sol.cliente.cuit}%0A`;
    }
    if (sol.periodo) msg += `*Período:* ${sol.periodo}%0A`;
    if (sol.monto_neto) msg += `*Monto:* ${formatARS(sol.monto_neto)}%0A`;
    if (sol.referencia) msg += `*Referencia:* ${sol.referencia}%0A`;
    msg += `%0AQuedo atento/a, gracias!`;
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  return (
    <div className="animate-in fade-in duration-700 pb-20">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Módulo Contadora</h1>
          <p className="text-slate-500 mt-1 font-medium">Gestión de solicitudes de facturación e impuestos.</p>
        </div>
        <button onClick={() => setIsFormOpen(true)} className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-4 rounded-2xl font-bold text-sm flex items-center gap-3 transition-all shadow-lg shadow-slate-900/10 active:scale-95">
          <Plus size={18} /> Nueva Solicitud
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-10">
        <div className="lg:col-span-3 relative group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-600 transition-colors" size={18} />
          <input type="text" placeholder="Buscar por tipo, cliente o referencia..." className="w-full bg-white border border-slate-200 rounded-xl py-3.5 pl-12 pr-6 outline-none focus:ring-2 focus:ring-slate-200 transition-all font-medium text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-50 text-slate-400"><Clock size={18} /></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pendientes</span>
          </div>
          <span className="text-xl font-bold text-slate-900">{filteredSolicitudes?.filter(s => s.estado === 'pendiente').length || 0}</span>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex justify-center py-32"><Loader2 className="w-12 h-12 text-slate-200 animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-bold uppercase tracking-[0.15em] border-b border-slate-100">
                  <th className="px-8 py-5">Fecha / Período</th>
                  <th className="px-8 py-5">Tipo de Solicitud</th>
                  <th className="px-8 py-5">Cliente</th>
                  <th className="px-8 py-5 text-right">Monto</th>
                  <th className="px-8 py-5 text-center">Estado</th>
                  <th className="px-8 py-5 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredSolicitudes?.map((sol) => {
                  const isPendiente = sol.estado === 'pendiente';
                  return (
                    <tr key={sol.id} className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors group ${!isPendiente ? 'opacity-60' : ''}`}>
                      <td className="px-8 py-6">
                        <p className="text-xs font-bold text-slate-900">{sol.periodo || 'N/A'}</p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1">Creado: {new Date(sol.created_at).toLocaleDateString()}</p>
                      </td>
                      <td className="px-8 py-6">
                        <p className="text-sm font-bold text-slate-700">{sol.tipo}</p>
                        <p className="text-[10px] text-slate-400 font-medium mt-0.5 truncate max-w-[200px]">{sol.referencia || '-'}</p>
                      </td>
                      <td className="px-8 py-6">
                        {sol.cliente ? (
                          <>
                            <p className="text-sm font-bold text-slate-900">{sol.cliente.nombre}</p>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter mt-0.5">CUIT: {sol.cliente.cuit || 'N/A'}</p>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Trámite Interno</span>
                        )}
                      </td>
                      <td className="px-8 py-6 text-right">
                        <p className="text-lg font-bold text-slate-900 tracking-tight">{sol.monto_neto ? formatARS(sol.monto_neto) : '-'}</p>
                      </td>
                      <td className="px-8 py-6 text-center">
                        <button 
                          onClick={() => updateEstadoMutation.mutate({ id: sol.id, estado: isPendiente ? 'completado' : 'pendiente' })}
                          className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${
                            isPendiente ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                          }`}
                        >
                          {isPendiente ? 'Pendiente' : 'Listo'}
                        </button>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={() => sendWhatsApp(sol)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"><MessageCircle size={16} /></button>
                          <button onClick={() => openEdit(sol)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><Edit2 size={16} /></button>
                          <button onClick={() => { if(confirm('¿Eliminar solicitud?')) deleteMutation.mutate(sol.id); }} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={16} /></button>
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

      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-10 shadow-2xl animate-in zoom-in-95 border border-white/20">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">{editingId ? 'Editar Solicitud' : 'Nueva Solicitud'}</h2>
              <button onClick={closeForm} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"><X size={24} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(formData); }} className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Tipo de Trámite</label>
                  <select className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-700 text-sm bg-white" value={formData.tipo} onChange={e => setFormData({...formData, tipo: e.target.value})} required>
                    <option value="Emisión de Factura">Emisión de Factura</option>
                    <option value="Generación de VEP (AFIP)">Generación de VEP (AFIP)</option>
                    <option value="Liquidación de Sueldos">Liquidación de Sueldos</option>
                    <option value="Alta/Baja de Empleado">Alta/Baja de Empleado</option>
                    <option value="Consulta General">Consulta General</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Período</label>
                  <input type="month" className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-700 text-sm" value={formData.periodo} onChange={e => setFormData({...formData, periodo: e.target.value})} />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Cliente Asociado</label>
                <select className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-700 text-sm bg-white" value={formData.cliente_id} onChange={e => setFormData({...formData, cliente_id: e.target.value})}>
                  <option value="">-- Trámite Interno --</option>
                  {clientes?.map((c:any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Referencia</label>
                <input type="text" placeholder="Ej: Honorarios mes de Julio" className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-700 text-sm" value={formData.referencia} onChange={e => setFormData({...formData, referencia: e.target.value})} />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Monto Neto</label>
                <input type="number" step="0.01" className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-900 text-lg tracking-tight" value={formData.monto_neto} onChange={e => setFormData({...formData, monto_neto: e.target.value})} />
              </div>

              <div className="flex justify-end gap-3 mt-10 pt-8 border-t border-slate-100">
                <button type="button" onClick={closeForm} className="px-6 py-3.5 text-slate-400 font-bold uppercase tracking-widest text-[10px] hover:bg-slate-50 rounded-xl transition-colors">Cancelar</button>
                <button type="submit" disabled={saveMutation.isPending} className="bg-slate-900 text-white px-8 py-3.5 rounded-xl font-bold uppercase tracking-widest text-[10px] shadow-lg shadow-slate-900/10 active:scale-95 transition-all disabled:opacity-50">
                  {saveMutation.isPending ? 'Guardando...' : 'Guardar Solicitud'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
