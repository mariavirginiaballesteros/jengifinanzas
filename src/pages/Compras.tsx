import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Edit2, Trash2, ShoppingCart, Receipt } from 'lucide-react';
import { formatARS } from '@/lib/utils';
import { showSuccess, showError } from '@/utils/toast';

export default function Compras() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const defaultForm = {
    fecha: new Date().toISOString().split('T')[0],
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
      showSuccess(editingId ? 'Compra actualizada' : 'Factura de compra registrada');
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
    },
    onError: (err: any) => showError(err.message)
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.monto_total || formData.monto_total <= 0) return showError('El monto total debe ser mayor a 0');
    saveMutation.mutate(formData);
  };

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
    <div className="animate-in fade-in duration-500 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-jengibre-dark">Compras y Crédito Fiscal</h1>
          <p className="text-gray-600 mt-1">Registrá las facturas "A" o "C" de tus proveedores para llevar control del IVA.</p>
        </div>
        <button 
          onClick={() => setIsFormOpen(true)}
          className="bg-jengibre-primary hover:bg-[#a64120] text-white px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all shadow-sm"
        >
          <Plus size={20} /> Cargar Factura
        </button>
      </header>

      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-display font-bold mb-6 flex items-center gap-2">
              <Receipt className="text-jengibre-primary" />
              {editingId ? 'Editar Factura' : 'Cargar Factura de Compra'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Factura</label>
                  <input 
                    type="date" required
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none" 
                    value={formData.fecha} onChange={e => setFormData({...formData, fecha: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nº Comprobante</label>
                  <input 
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none" 
                    value={formData.comprobante_nro} onChange={e => setFormData({...formData, comprobante_nro: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor / Empresa</label>
                <input 
                  required autoFocus
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none" 
                  value={formData.proveedor} onChange={e => setFormData({...formData, proveedor: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Concepto / Detalle</label>
                <input 
                  required
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none" 
                  value={formData.concepto} onChange={e => setFormData({...formData, concepto: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monto Total Factura</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                    <input 
                      type="number" required min="0" step="0.01"
                      className="w-full border border-gray-300 rounded-lg p-2.5 pl-8 focus:ring-2 focus:ring-jengibre-primary outline-none font-mono font-bold" 
                      value={formData.monto_total} onChange={e => setFormData({...formData, monto_total: e.target.value})}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-end mb-1">
                    <label className="block text-sm font-medium text-gray-700">IVA (Crédito Fiscal)</label>
                    <button type="button" onClick={calcularIva} className="text-xs text-blue-600 hover:underline font-medium">Calcular 21%</button>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                    <input 
                      type="number" min="0" step="0.01"
                      className="w-full border border-gray-300 rounded-lg p-2.5 pl-8 focus:ring-2 focus:ring-blue-500 outline-none font-mono bg-blue-50" 
                      value={formData.iva_credito} onChange={e => setFormData({...formData, iva_credito: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-100">
                <button type="button" onClick={closeForm} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors">Cancelar</button>
                <button type="submit" disabled={saveMutation.isPending} className="bg-jengibre-primary hover:bg-[#a64120] text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50">
                  {saveMutation.isPending ? 'Guardando...' : 'Guardar Factura'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TABLA DE COMPRAS */}
      <div className="bg-white border border-jengibre-border rounded-2xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-jengibre-primary border-t-transparent rounded-full animate-spin"></div></div>
        ) : compras?.length === 0 ? (
          <div className="p-12 text-center">
            <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400"><ShoppingCart size={32} /></div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">No hay facturas cargadas</h3>
            <button onClick={() => setIsFormOpen(true)} className="text-jengibre-primary font-bold hover:underline">+ Cargar factura</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-jengibre-cream/50 text-jengibre-dark text-sm border-b border-jengibre-border">
                  <th className="px-4 py-3 font-bold">Fecha</th>
                  <th className="px-4 py-3 font-bold">Nº Comprobante</th>
                  <th className="px-4 py-3 font-bold">Proveedor</th>
                  <th className="px-4 py-3 font-bold">Concepto</th>
                  <th className="px-4 py-3 font-bold text-right">Monto Total</th>
                  <th className="px-4 py-3 font-bold text-right text-blue-800">IVA (Crédito)</th>
                  <th className="px-4 py-3 font-bold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {compras?.map((compra) => {
                  const dateFormatted = new Date(compra.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
                  
                  return (
                    <tr key={compra.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors group">
                      <td className="px-4 py-3 text-sm text-gray-600">{dateFormatted}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 font-mono">{compra.comprobante_nro || '-'}</td>
                      <td className="px-4 py-3 font-bold text-gray-900">{compra.proveedor}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{compra.concepto}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-gray-900">{formatARS(compra.monto_total)}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-blue-800 bg-blue-50/30">
                        {compra.iva_credito > 0 ? formatARS(compra.iva_credito) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(compra)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={16} /></button>
                          <button onClick={() => { if(confirm('¿Eliminar factura?')) deleteMutation.mutate(compra.id); }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
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