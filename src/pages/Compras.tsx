import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Edit2, Trash2, ShoppingCart, Receipt, Search, X, Loader2 } from 'lucide-react';
import { formatARS, getLocalDateString } from '@/lib/utils';
import { showSuccess, showError } from '@/utils/toast';

export default function Compras() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const defaultForm = {
    fecha: getLocalDateString(),
    proveedor: '',
    concepto: '',
    monto_total: '',
    iva_credito: '',
    comprobante_nro: ''
  };
  const [formData, setFormData] = useState<any>(defaultForm);

  const { data: compras, isLoading } = useQuery({
    queryKey: ['compras'],
    queryFn: async () => {
      const { data, error } = await supabase.from('compras').select('*').order('fecha', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (compraData: any) => {
      const payload = { 
        ...compraData, 
        monto_total: Number(compraData.monto_total),
        iva_credito: compraData.iva_credito ? Number(compraData.iva_credito) : 0
      };
      
      if (editingId) {
        const { error } = await supabase.from('compras').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('compras').insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compras'] });
      showSuccess(editingId ? 'Compra actualizada' : 'Compra registrada');
      closeForm();
    },
    onError: (err: any) => showError(err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('compras').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compras'] });
      showSuccess('Compra eliminada');
    }
  });

  const filteredCompras = compras?.filter(c => 
    c.proveedor.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.concepto.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openEdit = (compra: any) => {
    setFormData({
      fecha: compra.fecha,
      proveedor: compra.proveedor,
      concepto: compra.concepto,
      monto_total: compra.monto_total,
      iva_credito: compra.iva_credito || '',
      comprobante_nro: compra.comprobante_nro || ''
    });
    setEditingId(compra.id);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormData(defaultForm);
  };

  const calcularIva = () => {
    if (formData.monto_total) {
      const base = Number(formData.monto_total) / 1.21;
      const iva = base * 0.21;
      setFormData({...formData, iva_credito: iva.toFixed(2)});
    }
  };

  return (
    <div className="animate-in fade-in duration-700 pb-20">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Compras</h1>
          <p className="text-slate-500 mt-1 font-medium">Registro de facturas de proveedores y crédito fiscal.</p>
        </div>
        <button onClick={() => setIsFormOpen(true)} className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-4 rounded-2xl font-bold text-sm flex items-center gap-3 transition-all shadow-lg shadow-slate-900/10 active:scale-95">
          <Plus size={18} /> Cargar Factura
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-10">
        <div className="lg:col-span-3 relative group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-600 transition-colors" size={18} />
          <input type="text" placeholder="Buscar por proveedor o concepto..." className="w-full bg-white border border-slate-200 rounded-xl py-3.5 pl-12 pr-6 outline-none focus:ring-2 focus:ring-slate-200 transition-all font-medium text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-50 text-slate-400"><ShoppingCart size={18} /></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Mes</span>
          </div>
          <span className="text-xl font-bold text-slate-900">{compras?.length || 0}</span>
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
                  <th className="px-8 py-5">Fecha / Proveedor</th>
                  <th className="px-8 py-5">Concepto</th>
                  <th className="px-8 py-5 text-right">Monto Total</th>
                  <th className="px-8 py-5 text-right text-blue-600">IVA Crédito</th>
                  <th className="px-8 py-5 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompras?.map((compra) => (
                  <tr key={compra.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-6">
                      <p className="text-xs font-bold text-slate-900">{new Date(compra.fecha).toLocaleDateString()}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">{compra.proveedor}</p>
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-sm font-bold text-slate-700">{compra.concepto}</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">{compra.comprobante_nro || '-'}</p>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <p className="text-lg font-bold text-slate-900 tracking-tight">{formatARS(compra.monto_total)}</p>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <p className="text-lg font-bold text-blue-600 tracking-tight">{compra.iva_credito > 0 ? formatARS(compra.iva_credito) : '-'}</p>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => openEdit(compra)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><Edit2 size={16} /></button>
                        <button onClick={() => { if(confirm('¿Eliminar factura?')) deleteMutation.mutate(compra.id); }} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-10 shadow-2xl animate-in zoom-in-95 border border-white/20">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">{editingId ? 'Editar Factura' : 'Nueva Factura'}</h2>
              <button onClick={closeForm} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"><X size={24} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(formData); }} className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Fecha</label>
                  <input type="date" className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-700 text-sm" value={formData.fecha} onChange={e => setFormData({...formData, fecha: e.target.value})} required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nº Comprobante</label>
                  <input className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-700 text-sm" value={formData.comprobante_nro} onChange={e => setFormData({...formData, comprobante_nro: e.target.value})} />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Proveedor</label>
                <input required className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-700 text-sm" value={formData.proveedor} onChange={e => setFormData({...formData, proveedor: e.target.value})} />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Concepto</label>
                <input required className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-700 text-sm" value={formData.concepto} onChange={e => setFormData({...formData, concepto: e.target.value})} />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Monto Total</label>
                  <input type="number" step="0.01" className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-900 text-lg tracking-tight" value={formData.monto_total} onChange={e => setFormData({...formData, monto_total: e.target.value})} required />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">IVA Crédito</label>
                    <button type="button" onClick={calcularIva} className="text-[9px] font-bold text-blue-600 hover:underline uppercase">Calcular 21%</button>
                  </div>
                  <input type="number" step="0.01" className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-blue-600 text-lg tracking-tight bg-blue-50/30" value={formData.iva_credito} onChange={e => setFormData({...formData, iva_credito: e.target.value})} />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-10 pt-8 border-t border-slate-100">
                <button type="button" onClick={closeForm} className="px-6 py-3.5 text-slate-400 font-bold uppercase tracking-widest text-[10px] hover:bg-slate-50 rounded-xl transition-colors">Cancelar</button>
                <button type="submit" disabled={saveMutation.isPending} className="bg-slate-900 text-white px-8 py-3.5 rounded-xl font-bold uppercase tracking-widest text-[10px] shadow-lg shadow-slate-900/10 active:scale-95 transition-all disabled:opacity-50">
                  {saveMutation.isPending ? 'Guardando...' : 'Guardar Factura'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
