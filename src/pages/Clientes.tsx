import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TipAlert } from '@/components/TipAlert';
import { Plus, Edit2, Trash2, Building, AlertTriangle, MessageCircle, FileText, User, Calendar } from 'lucide-react';
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
    contacto_email: '',
    datos_facturacion: '',
    seguimiento_pagos: '',
    estado_cobro: 'por_enviar'
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

  const updateEstadoCobroMutation = useMutation({
    mutationFn: async ({ id, estado_cobro }: { id: string, estado_cobro: string }) => {
      const { error } = await supabase.from('clientes').update({ estado_cobro }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      showSuccess('Estado de facturación actualizado');
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
      contacto_email: cliente.contacto_email || '',
      datos_facturacion: cliente.datos_facturacion || '',
      seguimiento_pagos: cliente.seguimiento_pagos || '',
      estado_cobro: cliente.estado_cobro || 'por_enviar'
    });
    setEditingId(cliente.id);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormData(defaultForm);
  };

  const isVenciendo = (fechaFin: string) => {
    if (!fechaFin) return false;
    const fin = new Date(fechaFin);
    const hoy = new Date();
    const diffTime = fin.getTime() - hoy.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 30;
  };

  const handleSolicitarFactura = (cliente: any) => {
    const monto = cliente.monto_ars > 0 ? formatARS(cliente.monto_ars) : formatUSD(cliente.monto_usd);
    const texto = `Hola! Solicito la emisión de factura para el cliente *${cliente.nombre}*.
    
*Monto:* ${monto}
*Concepto/Cuota:* ${cliente.seguimiento_pagos || 'Abono Mensual'}
*Día de facturación ideal:* ${cliente.dia_facturacion || 'No especificado'}

*Datos de facturación:* 
${cliente.datos_facturacion || 'No especificados en el sistema'}
`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
  };

  return (
    <div className="animate-in fade-in duration-500 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-jengibre-dark">Gestión de Clientes</h1>
          <p className="text-gray-600 mt-1">Administrá contratos, contactos y estado de facturación mensual.</p>
        </div>
        <button 
          onClick={() => setIsFormOpen(true)}
          className="bg-jengibre-primary hover:bg-[#a64120] text-white px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all shadow-sm hover:shadow-md shrink-0"
        >
          <Plus size={20} /> Nuevo Cliente
        </button>
      </header>

      <TipAlert id="clientes_facturacion" title="💡 Ciclo de Facturación Mensual">
        Usa la columna <strong>Estado Mensual</strong> para marcar si la factura ya se envió o ya se pagó. 
        Al empezar un nuevo mes, deberás pasar manualmente los estados nuevamente a "Por Enviar". 
        Usa el botón de WhatsApp para pedirle rápidamente la factura a la contadora.
      </TipAlert>

      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-display font-bold mb-6">
              {editingId ? 'Editar Cliente' : 'Nuevo Cliente'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* DATOS COMERCIALES */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-4">
                <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider">Datos Comerciales</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre / Empresa</label>
                    <input 
                      required autoFocus
                      className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none" 
                      value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Estado de la cuenta</label>
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
              </div>

              {/* FACTURACIÓN Y SEGUIMIENTO */}
              <div className="bg-jengibre-amber/10 p-4 rounded-xl border border-jengibre-amber/20 space-y-4">
                <h3 className="font-bold text-jengibre-dark text-sm uppercase tracking-wider">Facturación y Cobranza</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Seguimiento de Pagos</label>
                    <input 
                      className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white" 
                      value={formData.seguimiento_pagos} onChange={e => setFormData({...formData, seguimiento_pagos: e.target.value})}
                      placeholder="Ej: Mensual, 1/3, 2/3..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Día del mes para facturar</label>
                    <input 
                      type="number" min="1" max="31"
                      className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white" 
                      value={formData.dia_facturacion} onChange={e => setFormData({...formData, dia_facturacion: e.target.value})}
                      placeholder="Ej: 5"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Datos de Facturación (CUIT, Razón Social)</label>
                  <textarea 
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white min-h-[80px]" 
                    value={formData.datos_facturacion} onChange={e => setFormData({...formData, datos_facturacion: e.target.value})}
                    placeholder="Razón Social:&#10;CUIT:&#10;Condición IVA:..."
                  />
                </div>
              </div>

              {/* CONTRATO */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-4">
                <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider">Contrato y Fechas</h3>
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Link al Documento / Contrato</label>
                  <input 
                    type="url"
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white" 
                    value={formData.link_contrato} onChange={e => setFormData({...formData, link_contrato: e.target.value})}
                    placeholder="https://drive.google.com/..."
                  />
                </div>
              </div>

              {/* CONTACTO */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-4">
                <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider">Persona de Contacto</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre y Apellido</label>
                    <input 
                      className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white" 
                      value={formData.contacto_nombre} onChange={e => setFormData({...formData, contacto_nombre: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input 
                      type="email"
                      className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white" 
                      value={formData.contacto_email} onChange={e => setFormData({...formData, contacto_email: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button type="button" onClick={closeForm} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors">Cancelar</button>
                <button type="submit" disabled={saveMutation.isPending} className="bg-jengibre-primary hover:bg-[#a64120] text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50">
                  {saveMutation.isPending ? 'Guardando...' : 'Guardar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TABLA DE CLIENTES */}
      <div className="bg-white border border-jengibre-border rounded-2xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-jengibre-primary border-t-transparent rounded-full animate-spin"></div></div>
        ) : clientes?.length === 0 ? (
          <div className="p-12 text-center">
            <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400"><Building size={32} /></div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">No hay clientes cargados</h3>
            <button onClick={() => setIsFormOpen(true)} className="text-jengibre-primary font-bold hover:underline">+ Agregar cliente</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-jengibre-cream/50 text-jengibre-dark text-sm border-b border-jengibre-border">
                  <th className="px-4 py-3 font-bold">Empresa / Cliente</th>
                  <th className="px-4 py-3 font-bold text-right">Abonos</th>
                  <th className="px-4 py-3 font-bold text-center">Día Fact.</th>
                  <th className="px-4 py-3 font-bold">Datos Fact. y Cuota</th>
                  <th className="px-4 py-3 font-bold">Vencimiento Contrato</th>
                  <th className="px-4 py-3 font-bold text-center">Estado Mensual</th>
                  <th className="px-4 py-3 font-bold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clientes?.map((cliente) => {
                  const venciendo = isVenciendo(cliente.fecha_fin);
                  
                  return (
                    <tr key={cliente.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors group">
                      <td className="px-4 py-4">
                        <div className="font-bold text-gray-900">{cliente.nombre}</div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase mt-1 inline-block ${cliente.estado === 'activo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {cliente.estado === 'activo' ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        {cliente.monto_ars > 0 && <div className="font-mono font-bold text-gray-900">{formatARS(cliente.monto_ars)}</div>}
                        {cliente.monto_usd > 0 && <div className="font-mono font-medium text-gray-600">{formatUSD(cliente.monto_usd)}</div>}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {cliente.dia_facturacion ? <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded font-bold text-xs">{cliente.dia_facturacion}</span> : <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1 max-w-[200px]">
                          {cliente.seguimiento_pagos ? (
                            <span className="text-xs bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded-md inline-block w-fit">
                              Etapa: {cliente.seguimiento_pagos}
                            </span>
                          ) : <span className="text-xs text-gray-400">Sin seguimiento</span>}
                          
                          {cliente.datos_facturacion ? (
                            <span className="text-xs text-gray-500 truncate" title={cliente.datos_facturacion}>
                              {cliente.datos_facturacion}
                            </span>
                          ) : <span className="text-xs text-gray-400 italic">Sin datos de facturación</span>}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <div className="flex flex-col gap-1">
                          {cliente.fecha_fin ? (
                            <span className={`font-medium flex items-center gap-1 ${venciendo ? 'text-jengibre-red' : 'text-gray-700'}`}>
                              {new Date(cliente.fecha_fin).toLocaleDateString('es-AR')}
                              {venciendo && <AlertTriangle size={14} />}
                            </span>
                          ) : <span className="text-gray-400">-</span>}
                          
                          {cliente.link_contrato && (
                            <a href={cliente.link_contrato} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:underline flex items-center gap-1">
                              <FileText size={12}/> Ver Contrato
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <select 
                          className={`text-xs font-bold rounded-lg px-2 py-1.5 border outline-none cursor-pointer transition-colors ${
                            cliente.estado_cobro === 'pagado' ? 'bg-green-50 border-green-200 text-green-700' :
                            cliente.estado_cobro === 'enviada' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                            'bg-gray-50 border-gray-200 text-gray-600'
                          }`}
                          value={cliente.estado_cobro || 'por_enviar'}
                          onChange={(e) => updateEstadoCobroMutation.mutate({ id: cliente.id, estado_cobro: e.target.value })}
                          disabled={updateEstadoCobroMutation.isPending}
                        >
                          <option value="por_enviar">⏳ Por Enviar</option>
                          <option value="enviada">📨 Factura Enviada</option>
                          <option value="pagado">✅ Pagado</option>
                        </select>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => handleSolicitarFactura(cliente)} 
                            className="flex items-center gap-1 px-2 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg text-xs font-bold transition-colors border border-green-200"
                            title="Solicitar factura por WhatsApp"
                          >
                            <MessageCircle size={14} /> Solicitar
                          </button>
                          <div className="flex items-center gap-1 border-l border-gray-200 pl-2">
                            <button onClick={() => openEdit(cliente)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={16} /></button>
                            <button onClick={() => { if(confirm('¿Eliminar este cliente?')) deleteMutation.mutate(cliente.id); }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                          </div>
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