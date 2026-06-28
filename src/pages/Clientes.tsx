import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Edit2, Trash2, Building, FileText, Search, X, ExternalLink, Loader2 } from 'lucide-react';
import { formatARS, formatUSD, getLocalDateString } from '@/lib/utils';
import { showSuccess, showError } from '@/utils/toast';
import { Link } from 'react-router-dom';

export default function Clientes() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const defaultForm = {
    nombre: '', cuit: '', monto_ars: 0, monto_usd: 0,
    estado: 'activo', fecha_inicio: '', fecha_fin: '', link_contrato: '',
    contacto_nombre: '', contacto_email: '', quien_factura: '', datos_facturacion: '', seguimiento_pagos: '', dia_facturacion: '', notas: '',
    generar_cronograma: false, cantidad_cuotas: '', cuota_monto: '', cuota_mes_inicio: getLocalDateString().slice(0, 7)
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
      const { generar_cronograma, cantidad_cuotas, cuota_monto, cuota_mes_inicio, ...payload } = clientData;
      
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

      if (generar_cronograma && Number(cantidad_cuotas) > 0) {
        const qty = Number(cantidad_cuotas);
        const monto = Number(cuota_monto);
        const rows = [];
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
      showSuccess(editingId ? 'Cliente actualizado' : 'Cliente creado');
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

  const filteredClientes = clientes?.filter(c => 
    c.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.cuit?.includes(searchTerm)
  );

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
    <div className="animate-in fade-in duration-700 pb-20">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Directorio de Clientes</h1>
          <p className="text-slate-500 mt-1 font-medium">Administración de datos maestros y contratos.</p>
        </div>
        <button onClick={() => setIsFormOpen(true)} className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-4 rounded-2xl font-bold text-sm flex items-center gap-3 transition-all shadow-lg shadow-slate-900/10 active:scale-95">
          <Plus size={18} /> Nuevo Cliente
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-10">
        <div className="lg:col-span-3 relative group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-600 transition-colors" size={18} />
          <input type="text" placeholder="Buscar por nombre o CUIT..." className="w-full bg-white border border-slate-200 rounded-xl py-3.5 pl-12 pr-6 outline-none focus:ring-2 focus:ring-slate-200 transition-all font-medium text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-50 text-slate-400"><Building size={18} /></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Activos</span>
          </div>
          <span className="text-xl font-bold text-slate-900">{filteredClientes?.filter(c => c.estado === 'activo').length || 0}</span>
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
                  <th className="px-8 py-5">Proyecto / Empresa</th>
                  <th className="px-8 py-5">CUIT</th>
                  <th className="px-8 py-5 text-right">Abono Base</th>
                  <th className="px-8 py-5 text-center">Estado</th>
                  <th className="px-8 py-5 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredClientes?.map((cliente) => (
                  <tr key={cliente.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-6">
                      <p className="text-sm font-bold text-slate-900">{cliente.nombre}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">{cliente.contacto_nombre || 'Sin contacto'}</p>
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-xs font-bold text-slate-500 font-mono">{cliente.cuit || '-'}</p>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <p className="text-lg font-bold text-slate-900 tracking-tight">{cliente.monto_ars > 0 ? formatARS(cliente.monto_ars) : '-'}</p>
                      {cliente.monto_usd > 0 && <p className="text-[9px] text-blue-500 font-bold mt-0.5 uppercase tracking-tighter">{formatUSD(cliente.monto_usd)}</p>}
                    </td>
                    <td className="px-8 py-6 text-center">
                      <span className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest ${cliente.estado === 'activo' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                        {cliente.estado}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        <Link to="/facturacion" className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><FileText size={16} /></Link>
                        <button onClick={() => openEdit(cliente)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><Edit2 size={16} /></button>
                        <button onClick={() => { if(confirm('¿Eliminar cliente?')) deleteMutation.mutate(cliente.id); }} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={16} /></button>
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
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl p-10 shadow-2xl animate-in zoom-in-95 border border-white/20 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">{editingId ? 'Editar Cliente' : 'Nuevo Cliente'}</h2>
              <button onClick={closeForm} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"><X size={24} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(formData); }} className="space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nombre / Proyecto</label>
                  <input required className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-700 text-sm" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">CUIT</label>
                  <input className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-700 text-sm" value={formData.cuit} onChange={e => setFormData({...formData, cuit: e.target.value})} placeholder="30-..." />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Abono ARS</label>
                  <input type="number" className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-900 text-sm" value={formData.monto_ars} onChange={e => setFormData({...formData, monto_ars: Number(e.target.value)})} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Abono USD</label>
                  <input type="number" className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-900 text-sm" value={formData.monto_usd} onChange={e => setFormData({...formData, monto_usd: Number(e.target.value)})} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Estado</label>
                  <select className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-700 text-sm bg-white" value={formData.estado} onChange={e => setFormData({...formData, estado: e.target.value})}>
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                  </select>
                </div>
              </div>

              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-6">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Facturación y Contacto</p>
                <div className="grid grid-cols-2 gap-4">
                  <input placeholder="Contacto Nombre" className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold" value={formData.contacto_nombre} onChange={e => setFormData({...formData, contacto_nombre: e.target.value})} />
                  <input placeholder="Email / Teléfono" className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold" value={formData.contacto_email} onChange={e => setFormData({...formData, contacto_email: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <input placeholder="Responsable Facturación" className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold" value={formData.quien_factura} onChange={e => setFormData({...formData, quien_factura: e.target.value})} />
                  <input type="number" placeholder="Día de Facturación" className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold" value={formData.dia_facturacion} onChange={e => setFormData({...formData, dia_facturacion: e.target.value})} />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-10 pt-8 border-t border-slate-100">
                <button type="button" onClick={closeForm} className="px-6 py-3.5 text-slate-400 font-bold uppercase tracking-widest text-[10px] hover:bg-slate-50 rounded-xl transition-colors">Cancelar</button>
                <button type="submit" disabled={saveMutation.isPending} className="bg-slate-900 text-white px-8 py-3.5 rounded-xl font-bold uppercase tracking-widest text-[10px] shadow-lg shadow-slate-900/10 active:scale-95 transition-all disabled:opacity-50">
                  {saveMutation.isPending ? 'Guardando...' : 'Guardar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
