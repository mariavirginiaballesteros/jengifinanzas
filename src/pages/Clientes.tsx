import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Edit2, Trash2, Building, AlertTriangle, FileText } from 'lucide-react';
import { formatARS, formatUSD } from '@/lib/utils';
import { showSuccess, showError } from '@/utils/toast';
import { Link } from 'react-router-dom';

export default function Clientes() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const defaultForm = {
    nombre: '', cuit: '', monto_ars: 0, monto_usd: 0,
    estado: 'activo', fecha_inicio: '', fecha_fin: '', link_contrato: '',
    
    // Datos de facturación y contacto
    contacto_nombre: '', contacto_email: '', quien_factura: '', datos_facturacion: '', seguimiento_pagos: '', dia_facturacion: '', notas: '',
    
    // Herramienta Generador
    generar_cronograma: false, cantidad_cuotas: '', cuota_monto: '', cuota_mes_inicio: new Date().toISOString().split('T')[0].slice(0, 7)
  };
  const [formData, setFormData] = useState<any>(defaultForm);

  const { data: clientes, isLoading } = useQuery({
    queryKey: ['clientes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (clientData: any) => {
      // Extraemos campos que NO van a la tabla clientes
      const { generar_cronograma, cantidad_cuotas, cuota_monto, cuota_mes_inicio, ...payload } = clientData;
      
      // PREVENIR ERROR DE FECHAS VACÍAS Y NÚMEROS
      if (!payload.fecha_inicio) payload.fecha_inicio = null;
      if (!payload.fecha_fin) payload.fecha_fin = null;
      if (!payload.dia_facturacion) payload.dia_facturacion = null;
      else payload.dia_facturacion = Number(payload.dia_facturacion);
      
      let clientId = editingId;

      if (editingId) {
        const { error } = await supabase.from('clientes').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('clientes').insert([payload]).select();
        if (error) throw error;
        clientId = data[0].id;
      }

      // Si tildó generar cronograma y puso cantidad > 0
      if (generar_cronograma && Number(cantidad_cuotas) > 0) {
        const qty = Number(cantidad_cuotas);
        const monto = Number(cuota_monto);
        const rows = [];
        
        // Creamos una fecha base (ponemos día 15 para evitar bugs de zona horaria)
        const baseDate = new Date(`${cuota_mes_inicio}-15T12:00:00Z`);

        for (let i = 0; i < qty; i++) {
          const d = new Date(baseDate);
          d.setMonth(baseDate.getMonth() + i);
          
          rows.push({
            cliente_id: clientId,
            cuota: `${i + 1}/${qty}`,
            mes: d.toISOString().split('T')[0],
            monto_base: monto,
            monto_final: monto,
            estado: 'por_enviar',
            // También podemos arrastrar la info del cliente acá para que el generador la tenga por defecto
            responsable_afip: payload.quien_factura || null,
            cuit_responsable: payload.cuit || null,
            descripcion: payload.datos_facturacion || null
          });
        }
        await supabase.from('facturacion').insert(rows);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      showSuccess(editingId ? 'Cliente guardado' : 'Cliente creado exitosamente');
      closeForm();
    },
    onError: (err: any) => showError(err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clientes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clientes'] })
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const openEdit = (cliente: any) => {
    setFormData({
      nombre: cliente.nombre || '', cuit: cliente.cuit || '',
      monto_ars: cliente.monto_ars || 0, monto_usd: cliente.monto_usd || 0,
      estado: cliente.estado || 'activo',
      fecha_inicio: cliente.fecha_inicio || '', fecha_fin: cliente.fecha_fin || '',
      link_contrato: cliente.link_contrato || '',
      
      contacto_nombre: cliente.contacto_nombre || '',
      contacto_email: cliente.contacto_email || '',
      quien_factura: cliente.quien_factura || '',
      datos_facturacion: cliente.datos_facturacion || '',
      seguimiento_pagos: cliente.seguimiento_pagos || '',
      dia_facturacion: cliente.dia_facturacion || '',
      notas: cliente.notas || '',
      
      // Reseteamos el generador para que no se dispare sin querer al editar
      generar_cronograma: false, cantidad_cuotas: '', cuota_monto: cliente.monto_ars || '', 
      cuota_mes_inicio: new Date().toISOString().split('T')[0].slice(0, 7)
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
    <div className="animate-in fade-in duration-500 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-jengibre-dark">Directorio de Clientes</h1>
          <p className="text-gray-600 mt-1">Acá administrás los datos maestros de cada empresa. El seguimiento mensual está en Facturación.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/facturacion" className="bg-white border border-gray-300 text-gray-700 px-5 py-2.5 rounded-xl font-medium shadow-sm hover:bg-gray-50 transition-colors flex items-center gap-2">
            <FileText size={18} /> Ir a Facturación
          </Link>
          <button onClick={() => setIsFormOpen(true)} className="bg-jengibre-primary hover:bg-[#a64120] text-white px-5 py-2.5 rounded-xl font-medium shadow-sm flex items-center gap-2">
            <Plus size={20} /> Nuevo Cliente
          </button>
        </div>
      </header>

      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-display font-bold mb-6">{editingId ? 'Editar Cliente' : 'Nuevo Cliente'}</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* DATOS PRINCIPALES */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-4">
                <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider">Datos Principales</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre / Proyecto</label>
                    <input required className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-jengibre-primary bg-white" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CUIT Empresa</label>
                    <input className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-jengibre-primary bg-white" value={formData.cuit || ''} onChange={e => setFormData({...formData, cuit: e.target.value})} placeholder="30-..." />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Abono Base ARS</label>
                    <input type="number" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-jengibre-primary bg-white" value={formData.monto_ars || ''} onChange={e => setFormData({...formData, monto_ars: Number(e.target.value)})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Abono USD</label>
                    <input type="number" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-jengibre-primary bg-white" value={formData.monto_usd || ''} onChange={e => setFormData({...formData, monto_usd: Number(e.target.value)})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                    <select className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-jengibre-primary bg-white" value={formData.estado} onChange={e => setFormData({...formData, estado: e.target.value})}>
                      <option value="activo">Activo</option>
                      <option value="inactivo">Inactivo</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* FACTURACIÓN Y CONTACTO */}
              <div className="bg-jengibre-cream/30 p-4 rounded-xl border border-jengibre-border space-y-4">
                <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider">Facturación y Contacto</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Responsable Facturación (Nosotros)</label>
                    <input className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-jengibre-primary bg-white" value={formData.quien_factura} onChange={e => setFormData({...formData, quien_factura: e.target.value})} placeholder="Ej: Jengibre S.R.L o Juan Pérez" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Concepto / Descripción a facturar</label>
                    <input className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-jengibre-primary bg-white" value={formData.datos_facturacion} onChange={e => setFormData({...formData, datos_facturacion: e.target.value})} placeholder="Ej: Honorarios por servicios de marketing" />
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contacto Nombre</label>
                    <input className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-jengibre-primary bg-white" value={formData.contacto_nombre} onChange={e => setFormData({...formData, contacto_nombre: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email / Teléfono</label>
                    <input className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-jengibre-primary bg-white" value={formData.contacto_email} onChange={e => setFormData({...formData, contacto_email: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Día de Facturación</label>
                    <input type="number" min="1" max="31" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-jengibre-primary bg-white" value={formData.dia_facturacion} onChange={e => setFormData({...formData, dia_facturacion: e.target.value})} placeholder="Ej: 5" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Información de Seguimiento / Notas Internas</label>
                  <input className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-jengibre-primary bg-white" value={formData.notas} onChange={e => setFormData({...formData, notas: e.target.value})} placeholder="Ej: Depositan en cuenta Macro. Enviar factura a RRHH." />
                </div>
              </div>

              {/* CONTRATO */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vencimiento Contrato</label>
                  <input type="date" className="w-full border border-gray-300 rounded-lg p-2.5 bg-white outline-none focus:ring-2 focus:ring-jengibre-primary" value={formData.fecha_fin} onChange={e => setFormData({...formData, fecha_fin: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Link al Contrato</label>
                  <input type="url" className="w-full border border-gray-300 rounded-lg p-2.5 bg-white outline-none focus:ring-2 focus:ring-jengibre-primary" value={formData.link_contrato} onChange={e => setFormData({...formData, link_contrato: e.target.value})} placeholder="https://..." />
                </div>
              </div>

              {/* GENERADOR DE CUOTAS */}
              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 space-y-4">
                <div className="flex items-center gap-3 border-b border-blue-100 pb-3">
                  <input type="checkbox" id="gen_cronograma" className="w-5 h-5 rounded border-blue-300 text-blue-600 focus:ring-blue-500" checked={formData.generar_cronograma} onChange={e => setFormData({...formData, generar_cronograma: e.target.checked})} />
                  <label htmlFor="gen_cronograma" className="font-bold text-blue-900 cursor-pointer">Auto-generar cronograma en pestaña Facturación</label>
                </div>
                
                {formData.generar_cronograma && (
                  <div className="grid grid-cols-3 gap-3 animate-in slide-in-from-top-2">
                    <div>
                      <label className="block text-xs font-bold text-blue-800 mb-1">Cantidad de Cuotas</label>
                      <input type="number" min="1" required={formData.generar_cronograma} className="w-full border border-blue-200 rounded p-2 outline-none focus:border-blue-500" value={formData.cantidad_cuotas} onChange={e => setFormData({...formData, cantidad_cuotas: e.target.value})} placeholder="Ej: 4" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-blue-800 mb-1">Mes de Inicio</label>
                      <input type="month" required={formData.generar_cronograma} className="w-full border border-blue-200 rounded p-2 bg-white outline-none focus:border-blue-500" value={formData.cuota_mes_inicio} onChange={e => setFormData({...formData, cuota_mes_inicio: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-blue-800 mb-1">Monto por Cuota ($)</label>
                      <input type="number" required={formData.generar_cronograma} className="w-full border border-blue-200 rounded p-2 outline-none focus:border-blue-500" value={formData.cuota_monto} onChange={e => setFormData({...formData, cuota_monto: e.target.value})} />
                    </div>
                  </div>
                )}
                {formData.generar_cronograma && <p className="text-xs text-blue-600 mt-2 italic">Esto creará automáticamente las filas en la pestaña Facturación usando la info de arriba.</p>}
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

      {/* TABLA DE CLIENTES MAESTRO */}
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
                  <th className="px-4 py-3 font-bold">Proyecto / Empresa</th>
                  <th className="px-4 py-3 font-bold">CUIT</th>
                  <th className="px-4 py-3 font-bold text-right">Abono Base</th>
                  <th className="px-4 py-3 font-bold text-center">Estado</th>
                  <th className="px-4 py-3 font-bold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clientes?.map((cliente) => (
                  <tr key={cliente.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-4 font-bold text-gray-900">{cliente.nombre}</td>
                    <td className="px-4 py-4 font-mono text-gray-600 text-sm">{cliente.cuit || '-'}</td>
                    <td className="px-4 py-4 text-right font-mono font-bold text-gray-900">{cliente.monto_ars > 0 ? formatARS(cliente.monto_ars) : '-'}</td>
                    <td className="px-4 py-4 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${cliente.estado === 'activo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{cliente.estado}</span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(cliente)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={16} /></button>
                        <button onClick={() => { if(confirm('¿Eliminar?')) deleteMutation.mutate(cliente.id); }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
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