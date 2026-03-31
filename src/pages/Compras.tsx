import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TipAlert } from '@/components/TipAlert';
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
      // Limpiar datos
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

  // Autocalcular IVA 21% aproximado (Monto Total / 1.21 * 0.21)
  const calcularIva = () => {
    if (formData.monto_total) {
      const base = Number(formData.monto_total) / 1.21;
      const iva = base * 0.21;
      setFormData({...formData, iva_credito: iva.toFixed(2)});
    }
  };

  return (
    <div className="animate-in fade-in duration-500">
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

      <TipAlert id="compras_intro" title="💡 Tip de uso: ¿Por qué cargar las compras acá?">
        Si pagás honorarios a colaboradores, suscripciones de software o comprás equipos, podés pedir Factura "A". 
        Cargarla acá te ayuda a calcular automáticamente cuánto IVA tenés a tu favor para descontarlo de lo que le tenés que pagar a AFIP.
      </TipAlert>

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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nº Comprobante (Opcional)</label>
                  <input 
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none" 
                    value={formData.comprobante_nro} onChange={e => setFormData({...formData, comprobante_nro: e.target.value})}
                    placeholder="Ej: 0001-00001234"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor / Empresa</label>
                <input 
                  required autoFocus
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none" 
                  value={formData.proveedor} onChange={e => setFormData({...formData, proveedor: e.target.value})}
                  placeholder="Ej: MercadoLibre, Adobe, Juan Perez..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Concepto / Detalle</label>
                <input 
                  required
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none" 
                  value={formData.concepto} onChange={e => setFormData({...formData, concepto: e.target.value})}
                  placeholder="Ej: Suscripción Adobe Creative Cloud"
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
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">Si la factura es "C" (Monotributo), el IVA es 0.</p>

              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-100">
                <button type="button" onClick={closeForm} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={saveMutation.isPending} className="bg-jengibre-primary hover:bg-[#a64120] text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50">
                  {saveMutation.isPending ? 'Guardando...' : 'Guardar Factura'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tarjetas de compras */}
      {isLoading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-jengibre-primary border-t-transparent rounded-full animate-spin"></div></div>
      ) : compras?.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
            <ShoppingCart size={32} />
          </div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">No hay facturas cargadas</h3>
          <p className="text-gray-500 mb-6">Empezá a cargar las facturas de tus gastos para llevar el control del IVA.</p>
          <button onClick={() => setIsFormOpen(true)} className="text-jengibre-primary font-bold hover:underline">
            + Cargar factura
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {compras?.map((compra) => {
            const dateFormatted = new Date(compra.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
            
            return (
              <div key={compra.id} className="bg-white border border-jengibre-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group flex flex-col">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2 text-sm text-gray-500 font-medium">
                    <Receipt size={16} /> {dateFormatted}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(compra)} className="p-1 text-gray-400 hover:text-blue-600 rounded-lg">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => { if(confirm('¿Eliminar factura?')) deleteMutation.mutate(compra.id); }} className="p-1 text-gray-400 hover:text-red-600 rounded-lg">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-bold text-gray-900 text-lg leading-tight">{compra.proveedor}</h3>
                  <p className="text-gray-600 text-sm mt-1">{compra.concepto}</p>
                </div>
                
                <div className="mt-auto pt-4 space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Monto Total</span>
                    <span className="font-mono font-bold text-gray-900">{formatARS(compra.monto_total)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm bg-blue-50 p-2 rounded-lg">
                    <span className="text-blue-800 font-medium">IVA Crédito</span>
                    <span className="font-mono font-bold text-blue-800">{formatARS(compra.iva_credito || 0)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}