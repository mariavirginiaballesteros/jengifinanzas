import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TipAlert } from '@/components/TipAlert';
import { Plus, Edit2, Trash2, Building } from 'lucide-react';
import { formatARS, formatUSD } from '@/lib/utils';
import { showSuccess, showError } from '@/utils/toast';

export default function Clientes() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const defaultForm = {
    nombre: '',
    tipo_acuerdo: '',
    monto_ars: 0,
    monto_usd: 0,
    moneda: 'ARS',
    estado: 'activo'
  };
  const [formData, setFormData] = useState(defaultForm);

  // Traer clientes
  const { data: clientes, isLoading } = useQuery({
    queryKey: ['clientes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  // Guardar cliente (Crear o Editar)
  const saveMutation = useMutation({
    mutationFn: async (clientData: typeof formData) => {
      if (editingId) {
        const { error } = await supabase.from('clientes').update(clientData).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('clientes').insert([clientData]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      showSuccess(editingId ? 'Cliente actualizado' : 'Cliente creado exitosamente');
      closeForm();
    },
    onError: (err: any) => showError(err.message)
  });

  // Eliminar cliente
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clientes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      showSuccess('Cliente eliminado');
    },
    onError: (err: any) => showError(err.message)
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const openEdit = (cliente: any) => {
    setFormData({
      nombre: cliente.nombre || '',
      tipo_acuerdo: cliente.tipo_acuerdo || '',
      monto_ars: cliente.monto_ars || 0,
      monto_usd: cliente.monto_usd || 0,
      moneda: cliente.moneda || 'ARS',
      estado: cliente.estado || 'activo'
    });
    setEditingId(cliente.id);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormData(defaultForm);
  };

  return (
    <div className="animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-jengibre-dark">Gestión de Clientes</h1>
          <p className="text-gray-600 mt-1">Administrá los acuerdos y facturación de tus clientes.</p>
        </div>
        <button 
          onClick={() => setIsFormOpen(true)}
          className="bg-jengibre-primary hover:bg-[#a64120] text-white px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all shadow-sm hover:shadow-md"
        >
          <Plus size={20} /> Nuevo Cliente
        </button>
      </header>

      <TipAlert id="clientes_intro" title="💡 Tip de uso: Carga de montos">
        Al crear un cliente, podés especificar su abono en Pesos (ARS) o en Dólares (USD). 
        Si un cliente paga en ambas monedas, podés completar los dos campos. El sistema usará esto para proyectar tus ingresos futuros.
      </TipAlert>

      {/* Formulario (Modal simple) */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl animate-in zoom-in-95">
            <h2 className="text-2xl font-display font-bold mb-6">
              {editingId ? 'Editar Cliente' : 'Nuevo Cliente'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre / Empresa</label>
                <input 
                  required autoFocus
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none" 
                  value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Moneda Principal</label>
                  <select 
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white"
                    value={formData.moneda} onChange={e => setFormData({...formData, moneda: e.target.value})}
                  >
                    <option value="ARS">Pesos (ARS)</option>
                    <option value="USD">Dólares (USD)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                  <select 
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white"
                    value={formData.estado} onChange={e => setFormData({...formData, estado: e.target.value})}
                  >
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Abono ARS</label>
                  <input 
                    type="number" className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none" 
                    value={formData.monto_ars || ''} onChange={e => setFormData({...formData, monto_ars: Number(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Abono USD</label>
                  <input 
                    type="number" className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none" 
                    value={formData.monto_usd || ''} onChange={e => setFormData({...formData, monto_usd: Number(e.target.value)})}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de acuerdo / Notas</label>
                <input 
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none" 
                  value={formData.tipo_acuerdo} onChange={e => setFormData({...formData, tipo_acuerdo: e.target.value})}
                  placeholder="Ej: Fee mensual por RRSS"
                />
              </div>

              <div className="flex justify-end gap-3 mt-8">
                <button type="button" onClick={closeForm} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={saveMutation.isPending} className="bg-jengibre-primary hover:bg-[#a64120] text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50">
                  {saveMutation.isPending ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista de clientes */}
      {isLoading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-jengibre-primary border-t-transparent rounded-full animate-spin"></div></div>
      ) : clientes?.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
            <Building size={32} />
          </div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">No hay clientes cargados</h3>
          <p className="text-gray-500 mb-6">Empezá agregando tu primer cliente para armar las proyecciones.</p>
          <button onClick={() => setIsFormOpen(true)} className="text-jengibre-primary font-bold hover:underline">
            + Agregar cliente
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clientes?.map((cliente) => (
            <div key={cliente.id} className="bg-white border border-jengibre-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-jengibre-cream text-jengibre-primary w-10 h-10 rounded-full flex items-center justify-center font-bold font-display text-lg">
                    {cliente.nombre.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 leading-tight">{cliente.nombre}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block font-medium ${cliente.estado === 'activo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {cliente.estado === 'activo' ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(cliente)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => { if(confirm('¿Eliminar este cliente?')) deleteMutation.mutate(cliente.id); }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              
              <div className="space-y-2 mt-4 pt-4 border-t border-gray-100">
                {cliente.monto_ars > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Abono ARS</span>
                    <span className="font-mono font-bold text-gray-900">{formatARS(cliente.monto_ars)}</span>
                  </div>
                )}
                {cliente.monto_usd > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Abono USD</span>
                    <span className="font-mono font-bold text-gray-900">{formatUSD(cliente.monto_usd)}</span>
                  </div>
                )}
                {cliente.tipo_acuerdo && (
                  <p className="text-xs text-gray-400 mt-2 truncate">{cliente.tipo_acuerdo}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}