import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TipAlert } from '@/components/TipAlert';
import { Plus, Edit2, Trash2, Building, Calendar, Mail, FileText, User } from 'lucide-react';
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
    estado: 'activo',
    fecha_inicio: '',
    fecha_fin: '',
    link_contrato: '',
    dia_facturacion: '',
    contacto_nombre: '',
    contacto_email: ''
  };
  const [formData, setFormData] = useState<any>(defaultForm);

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

  const saveMutation = useMutation({
    mutationFn: async (clientData: any) => {
      // Limpiamos los datos para evitar enviar strings vacíos a campos numéricos/fechas
      const payload = {
        ...clientData,
        dia_facturacion: clientData.dia_facturacion ? Number(clientData.dia_facturacion) : null,
        fecha_inicio: clientData.fecha_inicio || null,
        fecha_fin: clientData.fecha_fin || null,
      };

      if (editingId) {
        const { error } = await supabase.from('clientes').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('clientes').insert([payload]);
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
      estado: cliente.estado || 'activo',
      fecha_inicio: cliente.fecha_inicio || '',
      fecha_fin: cliente.fecha_fin || '',
      link_contrato: cliente.link_contrato || '',
      dia_facturacion: cliente.dia_facturacion || '',
      contacto_nombre: cliente.contacto_nombre || '',
      contacto_email: cliente.contacto_email || ''
    });
    setEditingId(cliente.id);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormData(defaultForm);
  };

  // Función auxiliar para calcular si el contrato vence pronto (menos de 30 días)
  const isVenciendo = (fechaFin: string) => {
    if (!fechaFin) return false;
    const fin = new Date(fechaFin);
    const hoy = new Date();
    const diffTime = fin.getTime() - hoy.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 30;
  };

  return (
    <div className="animate-in fade-in duration-500 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-jengibre-dark">Gestión de Clientes</h1>
          <p className="text-gray-600 mt-1">Administrá contratos, contactos y fechas de facturación.</p>
        </div>
        <button 
          onClick={() => setIsFormOpen(true)}
          className="bg-jengibre-primary hover:bg-[#a64120] text-white px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all shadow-sm hover:shadow-md shrink-0"
        >
          <Plus size={20} /> Nuevo Cliente
        </button>
      </header>

      <TipAlert id="clientes_contratos" title="💡 Tip de uso: Alertas de Facturación y Contratos">
        Al completar la fecha de fin de contrato y el día de facturación, el sistema revisará todos los días esta información. 
        En el futuro, esto enviará correos automáticos para avisarte a quién facturarle hoy y qué contratos hay que renovar este mes.
      </TipAlert>

      {/* Formulario (Modal Scrollable) */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-display font-bold mb-6">
              {editingId ? 'Editar Cliente' : 'Nuevo Cliente'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* SECCIÓN: DATOS GENERALES */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-4">
                <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider">Datos Comerciales</h3>
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
              </div>

              {/* SECCIÓN: CONTRATO Y FACTURACIÓN */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-4">
                <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider">Contrato y Facturación</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Inicio</label>
                    <input 
                      type="date" className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white" 
                      value={formData.fecha_inicio} onChange={e => setFormData({...formData, fecha_inicio: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Fin (Vencimiento)</label>
                    <input 
                      type="date" className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white" 
                      value={formData.fecha_fin} onChange={e => setFormData({...formData, fecha_fin: e.target.value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Día del mes para facturar</label>
                    <input 
                      type="number" min="1" max="31"
                      className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white" 
                      value={formData.dia_facturacion} onChange={e => setFormData({...formData, dia_facturacion: e.target.value})}
                      placeholder="Ej: 5"
                    />
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Link al Documento / Contrato (Drive, Notion, etc)</label>
                  <input 
                    type="url"
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white" 
                    value={formData.link_contrato} onChange={e => setFormData({...formData, link_contrato: e.target.value})}
                    placeholder="https://..."
                  />
                </div>
              </div>

              {/* SECCIÓN: CONTACTO */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-4">
                <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider">Persona de Contacto</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre y Apellido</label>
                    <input 
                      className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white" 
                      value={formData.contacto_nombre} onChange={e => setFormData({...formData, contacto_nombre: e.target.value})}
                      placeholder="Ej: María Gomez"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email (Para envío de facturas)</label>
                    <input 
                      type="email"
                      className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white" 
                      value={formData.contacto_email} onChange={e => setFormData({...formData, contacto_email: e.target.value})}
                      placeholder="maria@empresa.com"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button type="button" onClick={closeForm} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={saveMutation.isPending} className="bg-jengibre-primary hover:bg-[#a64120] text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50">
                  {saveMutation.isPending ? 'Guardando...' : 'Guardar Cliente'}
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
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {clientes?.map((cliente) => {
            const venciendo = isVenciendo(cliente.fecha_fin);
            
            return (
              <div key={cliente.id} className="bg-white border border-jengibre-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group flex flex-col relative overflow-hidden">
                {/* Indicador de vencimiento */}
                {venciendo && (
                  <div className="absolute top-0 left-0 w-full bg-jengibre-amber text-amber-900 text-xs font-bold py-1 text-center">
                    ⚠️ CONTRATO VENCE PRONTO
                  </div>
                )}
                
                <div className={`flex justify-between items-start mb-4 ${venciendo ? 'mt-4' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className="bg-jengibre-cream text-jengibre-primary w-12 h-12 rounded-full flex items-center justify-center font-bold font-display text-xl">
                      {cliente.nombre.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-lg leading-tight">{cliente.nombre}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full mt-1 inline-block font-bold uppercase ${cliente.estado === 'activo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
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
                
                <div className="grid grid-cols-2 gap-4 my-4 bg-gray-50 p-3 rounded-xl border border-gray-100">
                  {cliente.monto_ars > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 font-medium">Abono ARS</p>
                      <p className="font-mono font-bold text-gray-900">{formatARS(cliente.monto_ars)}</p>
                    </div>
                  )}
                  {cliente.monto_usd > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 font-medium">Abono USD</p>
                      <p className="font-mono font-bold text-gray-900">{formatUSD(cliente.monto_usd)}</p>
                    </div>
                  )}
                </div>

                <div className="mt-auto space-y-2 text-sm">
                  {/* Contacto */}
                  {(cliente.contacto_nombre || cliente.contacto_email) && (
                    <div className="flex items-start gap-2 text-gray-600">
                      <User size={16} className="shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-gray-900">{cliente.contacto_nombre || 'Sin nombre'}</p>
                        {cliente.contacto_email && <p className="text-xs">{cliente.contacto_email}</p>}
                      </div>
                    </div>
                  )}
                  
                  {/* Facturación */}
                  {cliente.dia_facturacion && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Calendar size={16} className="shrink-0" />
                      <p>Facturar el día <strong>{cliente.dia_facturacion}</strong></p>
                    </div>
                  )}

                  {/* Contrato */}
                  {(cliente.fecha_fin || cliente.link_contrato) && (
                    <div className="flex items-center justify-between gap-2 text-gray-600 pt-2 border-t border-gray-100 mt-2">
                      <div className="flex items-center gap-2">
                        <FileText size={16} className="shrink-0" />
                        <p className={venciendo ? 'text-jengibre-amber font-bold' : ''}>
                          Vence: {cliente.fecha_fin ? new Date(cliente.fecha_fin).toLocaleDateString('es-AR') : 'Sin fecha'}
                        </p>
                      </div>
                      {cliente.link_contrato && (
                        <a href={cliente.link_contrato} target="_blank" rel="noopener noreferrer" className="text-jengibre-primary hover:underline text-xs font-bold">
                          Ver Doc
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}