import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TipAlert } from '@/components/TipAlert';
import { Plus, Edit2, Trash2, Users } from 'lucide-react';
import { formatARS } from '@/lib/utils';
import { showSuccess, showError } from '@/utils/toast';

export default function Equipo() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const defaultForm = {
    nombre: '',
    rol: '',
    honorario_mensual: 0,
    condicion_fiscal: 'Monotributo',
    genera_credito_fiscal: false,
    activo: true
  };
  const [formData, setFormData] = useState(defaultForm);

  const { data: equipo, isLoading } = useQuery({
    queryKey: ['equipo'],
    queryFn: async () => {
      const { data, error } = await supabase.from('equipo').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (miembroData: typeof formData) => {
      if (editingId) {
        const { error } = await supabase.from('equipo').update(miembroData).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('equipo').insert([miembroData]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipo'] });
      showSuccess(editingId ? 'Miembro actualizado' : 'Miembro agregado exitosamente');
      closeForm();
    },
    onError: (err: any) => showError(err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('equipo').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipo'] });
      showSuccess('Miembro eliminado');
    },
    onError: (err: any) => showError(err.message)
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const openEdit = (miembro: any) => {
    setFormData({
      nombre: miembro.nombre || '',
      rol: miembro.rol || '',
      honorario_mensual: miembro.honorario_mensual || 0,
      condicion_fiscal: miembro.condicion_fiscal || 'Monotributo',
      genera_credito_fiscal: miembro.genera_credito_fiscal || false,
      activo: miembro.activo ?? true
    });
    setEditingId(miembro.id);
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
          <h1 className="text-3xl font-display font-bold text-jengibre-dark">Equipo de Trabajo</h1>
          <p className="text-gray-600 mt-1">Administrá los colaboradores y sus honorarios mensuales.</p>
        </div>
        <button 
          onClick={() => setIsFormOpen(true)}
          className="bg-jengibre-primary hover:bg-[#a64120] text-white px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all shadow-sm"
        >
          <Plus size={20} /> Nuevo Miembro
        </button>
      </header>

      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl animate-in zoom-in-95">
            <h2 className="text-2xl font-display font-bold mb-6">
              {editingId ? 'Editar Miembro' : 'Nuevo Miembro'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
                  <input 
                    required autoFocus
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none" 
                    value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rol / Puesto</label>
                  <input 
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none" 
                    value={formData.rol} onChange={e => setFormData({...formData, rol: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Honorario Mensual (ARS)</label>
                  <input 
                    type="number" required
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none" 
                    value={formData.honorario_mensual || ''} onChange={e => setFormData({...formData, honorario_mensual: Number(e.target.value)})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Condición Fiscal</label>
                  <select 
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white"
                    value={formData.condicion_fiscal} onChange={e => setFormData({...formData, condicion_fiscal: e.target.value})}
                  >
                    <option value="Monotributo">Monotributo (Factura C)</option>
                    <option value="Responsable Inscripto">Responsable Inscripto (Factura A)</option>
                    <option value="Informal">Informal (Sin factura)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                  <select 
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white"
                    value={formData.activo ? 'true' : 'false'} onChange={e => setFormData({...formData, activo: e.target.value === 'true'})}
                  >
                    <option value="true">Activo</option>
                    <option value="false">Inactivo</option>
                  </select>
                </div>
              </div>

              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 flex items-center gap-3">
                <input 
                  type="checkbox" id="iva" 
                  className="w-5 h-5 rounded border-gray-300 text-jengibre-primary focus:ring-jengibre-primary"
                  checked={formData.genera_credito_fiscal} 
                  onChange={e => setFormData({...formData, genera_credito_fiscal: e.target.checked})}
                />
                <label htmlFor="iva" className="text-sm text-gray-700 font-medium cursor-pointer select-none">
                  Genera Crédito Fiscal de IVA (Factura A)
                </label>
              </div>

              <div className="flex justify-end gap-3 mt-8">
                <button type="button" onClick={closeForm} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors">Cancelar</button>
                <button type="submit" disabled={saveMutation.isPending} className="bg-jengibre-primary hover:bg-[#a64120] text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50">
                  {saveMutation.isPending ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TABLA DE EQUIPO */}
      <div className="bg-white border border-jengibre-border rounded-2xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-jengibre-primary border-t-transparent rounded-full animate-spin"></div></div>
        ) : equipo?.length === 0 ? (
          <div className="p-12 text-center">
            <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400"><Users size={32} /></div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Tu equipo está vacío</h3>
            <button onClick={() => setIsFormOpen(true)} className="text-jengibre-primary font-bold hover:underline">+ Agregar miembro</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-jengibre-cream/50 text-jengibre-dark text-sm border-b border-jengibre-border">
                  <th className="px-4 py-3 font-bold">Nombre</th>
                  <th className="px-4 py-3 font-bold">Rol</th>
                  <th className="px-4 py-3 font-bold text-right">Honorario Base</th>
                  <th className="px-4 py-3 font-bold">Condición Fiscal</th>
                  <th className="px-4 py-3 font-bold text-center">Crédito Fiscal</th>
                  <th className="px-4 py-3 font-bold text-center">Estado</th>
                  <th className="px-4 py-3 font-bold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {equipo?.map((miembro) => (
                  <tr key={miembro.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-4 font-bold text-gray-900">{miembro.nombre}</td>
                    <td className="px-4 py-4 text-sm text-gray-600">{miembro.rol}</td>
                    <td className="px-4 py-4 text-right font-mono font-bold text-gray-900">{formatARS(miembro.honorario_mensual)}</td>
                    <td className="px-4 py-4 text-sm text-gray-600">
                      <span className="bg-gray-100 px-2 py-1 rounded">{miembro.condicion_fiscal}</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {miembro.genera_credito_fiscal ? (
                        <span className="text-[10px] px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-bold uppercase">+ IVA</span>
                      ) : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase ${miembro.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {miembro.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(miembro)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={16} /></button>
                        <button onClick={() => { if(confirm('¿Eliminar miembro?')) deleteMutation.mutate(miembro.id); }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}