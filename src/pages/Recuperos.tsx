import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TipAlert } from '@/components/TipAlert';
import { Plus, Edit2, Trash2, RefreshCw, MessageCircle, Search, Calendar, Wallet, X, Loader2 } from 'lucide-react';
import { formatARS, getLocalDateString, parseFinancial, formatLocalDate } from '@/lib/utils';
import { showSuccess, showError } from '@/utils/toast';

// Helper para guardar datos extra como IIBB en el campo notas
const parseNotas = (notasStr: string | null) => {
  if (!notasStr) return { texto: '', iibb_porcentaje: 3, iibb_monto: 0 };
  try {
    const parsed = JSON.parse(notasStr);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (e) {}
  return { texto: notasStr || '', iibb_porcentaje: 3, iibb_monto: 0 };
};

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

  // Queries
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

  // Mutaciones
  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      const baseMonto = parseFinancial(payload.monto);

      const notasJson = JSON.stringify({
        texto: payload.notas
      });

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

  const updateEstadoMutation = useMutation({
    mutationFn: async ({ id, estado, currentFechaCobro }: { id: string, estado: string, currentFechaCobro: string | null }) => {
      const payload: any = { estado };
      if (estado === 'cobrado' && !currentFechaCobro) {
        payload.fecha_cobro = getLocalDateString();
      } else if (estado !== 'cobrado') {
        payload.fecha_cobro = null;
      }
      
      const { error } = await supabase.from('recuperos').update(payload).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recuperos'] });
      showSuccess('Estado actualizado');
    }
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
    if (rec.estado === 'facturado') {
      msg += `Ya les enviamos la factura correspondiente por este monto. `;
    } else if (rec.estado === 'enviado_sin_factura') {
      msg += `Avanzamos con el cobro sin emisión de factura como lo conversamos. `;
    }
    msg += `Por favor avisen cuando esté realizado el pago. ¡Gracias!`;
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  return (
    <div className="animate-in fade-in duration-700 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-5xl font-black tracking-tighter text-jengibre-dark">Recuperos</h1>
          <p className="text-gray-500 mt-2 font-bold uppercase tracking-widest text-[10px]">Control de gastos pagados por cuenta de clientes.</p>
        </div>
        <button onClick={() => setIsFormOpen(true)} className="bg-jengibre-primary hover:bg-[#a64120] text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-3 transition-all shadow-xl shadow-jengibre-primary/20 active:scale-95">
          <Plus size={18} /> Cargar Consumo
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-10">
        <div className="lg:col-span-3 relative group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-jengibre-primary transition-colors" size={20} />
          <input type="text" placeholder="Buscar por cliente o concepto..." className="w-full bg-white border border-jengibre-border rounded-[1.5rem] py-5 pl-14 pr-6 outline-none focus:ring-4 focus:ring-jengibre-primary/10 transition-all shadow-sm text-lg font-medium" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <div className="bg-white border border-jengibre-border rounded-[1.5rem] p-5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-jengibre-cream text-jengibre-primary shadow-inner"><RefreshCw size={24} /></div>
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Pendientes</span>
          </div>
          <span className="text-3xl font-mono font-black text-jengibre-dark tracking-tighter">{filteredRecuperos?.filter(r => r.estado !== 'cobrado').length || 0}</span>
        </div>
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 bg-jengibre-dark/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-10 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto border border-white/20">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-3xl font-black tracking-tighter text-jengibre-dark">{editingId ? 'Editar Recupero' : 'Nuevo Recupero'}</h2>
              <button onClick={closeForm} className="p-3 hover:bg-gray-100 rounded-full transition-colors"><X size={28} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(formData); }} className="space-y-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Cliente</label>
                <select className="w-full border border-gray-200 rounded-2xl p-4 outline-none bg-white font-black text-jengibre-dark focus:ring-4 focus:ring-jengibre-primary/10" value={formData.cliente_id} onChange={e => setFormData({...formData, cliente_id: e.target.value})} required>
                  <option value="">Seleccionar cliente...</option>
                  {clientes?.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Concepto / Detalle</label>
                <input type="text" placeholder="Ej: Hosting AWS, Pauta Meta..." className="w-full border border-gray-200 rounded-2xl p-4 outline-none focus:ring-4 focus:ring-jengibre-primary/10 font-bold text-gray-700" value={formData.concepto} onChange={e => setFormData({...formData, concepto: e.target.value})} required />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Monto a Recuperar</label>
                  <div className="relative group">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 font-black text-xl group-focus-within:text-jengibre-primary transition-colors">$</span>
                    <input type="number" step="0.01" className="w-full border border-gray-200 rounded-2xl p-4 pl-10 outline-none font-mono text-2xl font-black tracking-tighter focus:ring-4 focus:ring-jengibre-primary/10 text-jengibre-dark" value={formData.monto} onChange={e => setFormData({...formData, monto: e.target.value})} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Fecha del Gasto</label>
                  <input type="date" className="w-full border border-gray-200 rounded-2xl p-4 outline-none font-bold text-gray-700 focus:ring-4 focus:ring-jengibre-primary/10" value={formData.fecha_pago} onChange={e => setFormData({...formData, fecha_pago: e.target.value})} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Estado</label>
                  <select className="w-full border border-gray-200 rounded-2xl p-4 outline-none bg-white font-black text-jengibre-dark focus:ring-4 focus:ring-jengibre-primary/10" value={formData.estado} onChange={e => setFormData({...formData, estado: e.target.value})} required>
                    <option value="pendiente">Pendiente</option>
                    <option value="facturado">Facturado</option>
                    <option value="enviado_sin_factura">Enviado (Sin Factura)</option>
                    <option value="cobrado">Cobrado</option>
                  </select>
                </div>
                {formData.estado === 'cobrado' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Fecha de Cobro</label>
                    <input type="date" className="w-full border border-gray-200 rounded-2xl p-4 outline-none font-bold text-gray-700 focus:ring-4 focus:ring-jengibre-primary/10" value={formData.fecha_cobro} onChange={e => setFormData({...formData, fecha_cobro: e.target.value})} required />
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Notas Internas</label>
                <textarea rows={2} className="w-full border border-gray-200 rounded-2xl p-4 outline-none focus:ring-4 focus:ring-jengibre-primary/10 font-medium text-gray-700" value={formData.notas} onChange={e => setFormData({...formData, notas: e.target.value})} />
              </div>
              <div className="flex justify-end gap-4 mt-12 pt-8 border-t border-gray-100">
                <button type="button" onClick={closeForm} className="px-8 py-4 text-gray-400 font-black uppercase tracking-widest text-[10px] hover:bg-gray-50 rounded-2xl transition-colors">Cancelar</button>
                <button type="submit" disabled={saveMutation.isPending} className="bg-jengibre-primary text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-jengibre-primary/20 active:scale-95 transition-all disabled:opacity-50">
                  {saveMutation.isPending ? 'Guardando...' : 'Guardar Recupero'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white border border-jengibre-border rounded-[2.5rem] overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex justify-center py-32"><Loader2 className="w-12 h-12 text-jengibre-primary animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] border-b border-jengibre-border">
                  <th className="px-8 py-6">Fecha / Cliente</th>
                  <th className="px-8 py-6">Concepto</th>
                  <th className="px-8 py-6">Estado</th>
                  <th className="px-8 py-6 text-right">Monto</th>
                  <th className="px-8 py-6 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecuperos?.map((r) => {
                  const notas = parseNotas(r.notas);
                  return (
                    <tr key={r.id} className={`border-b border-gray-50 hover:bg-gray-50/80 transition-colors group ${r.estado === 'cobrado' ? 'opacity-60' : ''}`}>
                      <td className="px-8 py-6">
                        <p className="text-[10px] font-black text-jengibre-primary uppercase tracking-widest mb-1">{formatLocalDate(r.fecha_pago, { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                        <p className="text-lg font-black text-gray-900 tracking-tight">{r.cliente?.nombre}</p>
                      </td>
                      <td className="px-8 py-6">
                        <p className="font-bold text-gray-700 text-sm uppercase tracking-tight">{r.concepto}</p>
                        {notas.texto && <p className="text-xs text-gray-400 font-bold mt-1 truncate max-w-[200px]">{notas.texto}</p>}
                      </td>
                      <td className="px-8 py-6">
                        <span className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm ${
                          r.estado === 'cobrado' ? 'bg-emerald-50 text-emerald-600' :
                          r.estado === 'facturado' ? 'bg-blue-50 text-blue-600' :
                          'bg-amber-50 text-amber-600'
                        }`}>
                          {r.estado}
                        </span>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <p className="text-2xl font-mono font-black text-jengibre-dark tracking-tighter">{formatARS(r.monto)}</p>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                          <button onClick={() => handleWhatsApp(r)} className="p-2.5 text-[#25D366] hover:bg-[#25D366]/10 rounded-xl transition-all shadow-sm hover:shadow-md"><MessageCircle size={18} /></button>
                          <button onClick={() => openEdit(r)} className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all shadow-sm hover:shadow-md"><Edit2 size={18} /></button>
                          <button onClick={() => { if(confirm('¿Eliminar este recupero?')) deleteMutation.mutate(r.id); }} className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all shadow-sm hover:shadow-md"><Trash2 size={18} /></button>
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
