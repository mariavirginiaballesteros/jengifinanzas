import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Edit2, Trash2, RefreshCw, MessageCircle, Search, X, Loader2 } from 'lucide-react';
import { formatARS, getLocalDateString, parseFinancial, formatLocalDate, parseNotas } from '@/lib/utils';
import { showSuccess, showError } from '@/utils/toast';

export default function Recuperos() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const defaultForm = {
    cliente_id: '',
    concepto: '',
    monto: '',
    fecha_pago: getLocalDateString(),
    estado: 'pendiente',
    fecha_cobro: '',
    notas: ''
  };
  const [formData, setFormData] = useState<any>(defaultForm);

  const { data: recuperos, isLoading } = useQuery({
    queryKey: ['recuperos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recuperos')
        .select(`*, cliente:clientes(nombre, contacto_nombre)`)
        .order('fecha_pago', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const { data: clientes } = useQuery({
    queryKey: ['clientes_combo'],
    queryFn: async () => {
      const { data } = await supabase.from('clientes').select('id, nombre, contacto_nombre').eq('estado', 'activo');
      return data || [];
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      const baseMonto = parseFinancial(payload.monto);
      const notasJson = JSON.stringify({ texto: payload.notas });

      const dataToSave = {
        cliente_id: payload.cliente_id,
        concepto: payload.concepto,
        monto: baseMonto,
        fecha_pago: payload.fecha_pago,
        tiene_iva: false,
        iva_monto: 0,
        estado: payload.estado,
        fecha_cobro: payload.estado === 'cobrado' && !payload.fecha_cobro ? getLocalDateString() : (payload.fecha_cobro || null),
        notas: notasJson
      };

      if (editingId) {
        const { error } = await supabase.from('recuperos').update(dataToSave).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('recuperos').insert([dataToSave]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recuperos'] });
      showSuccess(editingId ? 'Recupero actualizado' : 'Recupero registrado');
      closeForm();
    },
    onError: (err: any) => showError(err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recuperos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recuperos'] });
      showSuccess('Recupero eliminado');
    }
  });

  const filteredRecuperos = recuperos?.filter(r => 
    r.cliente?.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
    r.concepto.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openEdit = (rec: any) => {
    const notasParsed = parseNotas(rec.notas);
    setFormData({
      cliente_id: rec.cliente_id,
      concepto: rec.concepto,
      monto: rec.monto.toString(),
      fecha_pago: rec.fecha_pago,
      estado: rec.estado || 'pendiente',
      fecha_cobro: rec.fecha_cobro || '',
      notas: notasParsed.texto || ''
    });
    setEditingId(rec.id);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormData(defaultForm);
  };

  const handleWhatsApp = (rec: any) => {
    let msg = `Hola ${rec.cliente?.contacto_nombre || 'equipo'}! Te paso el detalle de un consumo que abonamos por ustedes para que puedan enviarnos el reembolso:%0A%0A`;
    msg += `*Concepto:* ${rec.concepto}%0A`;
    msg += `*Fecha del gasto:* ${new Date(rec.fecha_pago).toLocaleDateString('es-AR')}%0A`;
    msg += `*Monto a transferir:* ${formatARS(rec.monto)}%0A%0A`;
    msg += `Por favor avisen cuando esté realizado el pago. ¡Gracias!`;
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  return (
    <div className="animate-in fade-in duration-700 pb-20">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Recuperos</h1>
          <p className="text-slate-500 mt-1 font-medium">Control de gastos pagados por cuenta de clientes.</p>
        </div>
        <button onClick={() => setIsFormOpen(true)} className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-4 rounded-2xl font-bold text-sm flex items-center gap-3 transition-all shadow-lg shadow-slate-900/10 active:scale-95">
          <Plus size={18} /> Cargar Consumo
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-10">
        <div className="lg:col-span-3 relative group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-600 transition-colors" size={18} />
          <input type="text" placeholder="Buscar por cliente o concepto..." className="w-full bg-white border border-slate-200 rounded-xl py-3.5 pl-12 pr-6 outline-none focus:ring-2 focus:ring-slate-200 transition-all font-medium text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-50 text-slate-400"><RefreshCw size={18} /></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pendientes</span>
          </div>
          <span className="text-xl font-bold text-slate-900">{filteredRecuperos?.filter(r => r.estado !== 'cobrado').length || 0}</span>
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
                  <th className="px-8 py-5">Fecha / Cliente</th>
                  <th className="px-8 py-5">Concepto</th>
                  <th className="px-8 py-5">Estado</th>
                  <th className="px-8 py-5 text-right">Monto</th>
                  <th className="px-8 py-5 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecuperos?.map((r) => {
                  const notas = parseNotas(r.notes); // Note: the column name in DB is 'notas' but parseNotas handles it
                  // Wait, let's check the column name in DB. It's 'notas'.
                  const notasData = parseNotas(r.notas);
                  return (
                    <tr key={r.id} className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors group ${r.estado === 'cobrado' ? 'opacity-60' : ''}`}>
                      <td className="px-8 py-6">
                        <p className="text-xs font-bold text-slate-900">{new Date(r.fecha_pago).toLocaleDateString()}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">{r.cliente?.nombre}</p>
                      </td>
                      <td className="px-8 py-6">
                        <p className="text-sm font-bold text-slate-700">{r.concepto}</p>
                        {notasData.texto && <p className="text-[10px] text-slate-400 font-medium mt-0.5 truncate max-w-[200px]">{notasData.texto}</p>}
                      </td>
                      <td className="px-8 py-6">
                        <span className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest ${
                          r.estado === 'cobrado' ? 'bg-emerald-50 text-emerald-600' :
                          r.estado === 'facturado' ? 'bg-blue-50 text-blue-600' :
                          'bg-amber-50 text-amber-600'
                        }`}>
                          {r.estado}
                        </span>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <p className="text-lg font-bold text-slate-900 tracking-tight">{formatARS(r.monto)}</p>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={() => handleWhatsApp(r)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"><MessageCircle size={16} /></button>
                          <button onClick={() => openEdit(r)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><Edit2 size={16} /></button>
                          <button onClick={() => { if(confirm('¿Eliminar recupero?')) deleteMutation.mutate(r.id); }} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={16} /></button>
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
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">{editingId ? 'Editar Recupero' : 'Nuevo Recupero'}</h2>
              <button onClick={closeForm} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"><X size={24} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(formData); }} className="space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Cliente</label>
                <select className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-700 text-sm bg-white" value={formData.cliente_id} onChange={e => setFormData({...formData, cliente_id: e.target.value})} required>
                  <option value="">Seleccionar cliente...</option>
                  {clientes?.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Concepto</label>
                <input type="text" placeholder="Ej: Hosting AWS, Pauta Meta..." className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-700 text-sm" value={formData.concepto} onChange={e => setFormData({...formData, concepto: e.target.value})} required />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Monto</label>
                  <input type="number" step="0.01" className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-900 text-lg tracking-tight" value={formData.monto} onChange={e => setFormData({...formData, monto: e.target.value})} required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Fecha</label>
                  <input type="date" className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-700 text-sm" value={formData.fecha_pago} onChange={e => setFormData({...formData, fecha_pago: e.target.value})} required />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-10 pt-8 border-t border-slate-100">
                <button type="button" onClick={closeForm} className="px-6 py-3.5 text-slate-400 font-bold uppercase tracking-widest text-[10px] hover:bg-slate-50 rounded-xl transition-colors">Cancelar</button>
                <button type="submit" disabled={saveMutation.isPending} className="bg-slate-900 text-white px-8 py-3.5 rounded-xl font-bold uppercase tracking-widest text-[10px] shadow-lg shadow-slate-900/10 active:scale-95 transition-all disabled:opacity-50">
                  {saveMutation.isPending ? 'Guardando...' : 'Guardar Recupero'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
