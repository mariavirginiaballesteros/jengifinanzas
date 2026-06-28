import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Search, Filter, FileText, CheckCircle2, Clock, AlertCircle, MoreVertical, Download, Edit2, Trash2, X, ExternalLink, Loader2, DollarSign, Wallet, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { formatARS, formatUSD, formatLocalDate, parseFinancial, parseDescripcion, getLocalDateString } from '@/lib/utils';
import { showSuccess, showError } from '@/utils/toast';

export default function Facturacion() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEstado, setFilterEstado] = useState('todos');

  const defaultForm = {
    cliente_id: '',
    mes: getLocalDateString().substring(0, 7),
    monto_base: '',
    monto_final: '',
    estado: 'pendiente',
    descripcion: {
      texto: '',
      periodo: '',
      link: '',
      monto_pagado: 0,
      retencion_ganancias: 0,
      retencion_iva: 0,
      monto_retenido: 0,
      es_informal: false
    }
  };
  const [formData, setFormData] = useState(defaultForm);

  const { data: clientes } = useQuery({
    queryKey: ['clientes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('*').eq('estado', 'activo');
      if (error) throw error;
      return data;
    }
  });

  const { data: facturas, isLoading } = useQuery({
    queryKey: ['facturacion'],
    queryFn: async () => {
      const { data, error } = await supabase.from('facturacion').select(`*, cliente:clientes(nombre)`).order('mes', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const payload = {
        cliente_id: data.cliente_id,
        mes: data.mes + '-01',
        monto_base: parseFinancial(data.monto_base),
        monto_final: parseFinancial(data.monto_final),
        estado: data.estado,
        descripcion: JSON.stringify(data.descripcion)
      };
      if (editingId) {
        const { error } = await supabase.from('facturacion').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('facturacion').insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facturacion'] });
      showSuccess(editingId ? 'Factura actualizada' : 'Factura creada');
      closeForm();
    },
    onError: (err: any) => showError(err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('facturacion').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facturacion'] });
      showSuccess('Factura eliminada');
    }
  });

  const stats = useMemo(() => {
    if (!facturas) return { total: 0, cobrado: 0, pendiente: 0, porcentaje: 0 };
    const total = facturas.reduce((acc, f) => acc + parseFinancial(f.monto_final || f.monto_base), 0);
    const cobrado = facturas.reduce((acc, f) => {
      const desc = parseDescripcion(f.descripcion);
      return acc + desc.monto_pagado + desc.retencion_ganancias + desc.retencion_iva + desc.monto_retenido;
    }, 0);
    return {
      total,
      cobrado,
      pendiente: total - cobrado,
      porcentaje: total > 0 ? (cobrado / total) * 100 : 0
    };
  }, [facturas]);

  const filteredFacturas = facturas?.filter(f => {
    const matchesSearch = f.cliente?.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || f.mes.includes(searchTerm);
    const matchesEstado = filterEstado === 'todos' || f.estado === filterEstado;
    return matchesSearch && matchesEstado;
  });

  const openEdit = (f: any) => {
    setFormData({
      cliente_id: f.cliente_id,
      mes: f.mes.substring(0, 7),
      monto_base: f.monto_base.toString(),
      monto_final: f.monto_final.toString(),
      estado: f.estado,
      descripcion: parseDescripcion(f.descripcion)
    });
    setEditingId(f.id);
    setIsFormOpen(true);
  };

  const closeForm = () => { setIsFormOpen(false); setEditingId(null); setFormData(defaultForm); };

  return (
    <div className="animate-in fade-in duration-700 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-5xl font-black tracking-tighter text-jengibre-dark">Facturación</h1>
          <p className="text-gray-500 mt-2 font-bold uppercase tracking-widest text-[10px]">Control de emisión y cobranza de abonos.</p>
        </div>
        <button onClick={() => setIsFormOpen(true)} className="bg-jengibre-primary hover:bg-[#a64120] text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-3 transition-all shadow-xl shadow-jengibre-primary/20 active:scale-95">
          <Plus size={18} /> Nueva Factura
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="bg-white border border-jengibre-border p-8 rounded-[2.5rem] shadow-sm group hover:border-jengibre-primary transition-all">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-2xl bg-blue-50 text-blue-600 shadow-sm"><FileText size={20} /></div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Facturado</h3>
          </div>
          <p className="text-4xl font-mono font-black text-jengibre-dark tracking-tighter group-hover:scale-105 transition-transform origin-left">{formatARS(stats.total)}</p>
        </div>
        <div className="bg-white border border-jengibre-border p-8 rounded-[2.5rem] shadow-sm group hover:border-emerald-500 transition-all">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-2xl bg-emerald-50 text-emerald-600 shadow-sm"><CheckCircle2 size={20} /></div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Cobrado</h3>
          </div>
          <p className="text-4xl font-mono font-black text-emerald-600 tracking-tighter group-hover:scale-105 transition-transform origin-left">{formatARS(stats.cobrado)}</p>
        </div>
        <div className="bg-white border border-jengibre-border p-8 rounded-[2.5rem] shadow-sm group hover:border-amber-500 transition-all">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-2xl bg-amber-50 text-amber-600 shadow-sm"><Clock size={20} /></div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Pendiente de Cobro</h3>
          </div>
          <p className="text-4xl font-mono font-black text-amber-600 tracking-tighter group-hover:scale-105 transition-transform origin-left">{formatARS(stats.pendiente)}</p>
        </div>
      </div>

      <div className="bg-white border border-jengibre-border rounded-[2.5rem] p-8 mb-10 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-6 items-center">
          <div className="flex-1 relative w-full group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-jengibre-primary transition-colors" size={20} />
            <input type="text" placeholder="Buscar por cliente o mes..." className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 pl-14 pr-6 outline-none focus:ring-4 focus:ring-jengibre-primary/10 transition-all font-medium" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex gap-3 w-full lg:w-auto">
            {['todos', 'pendiente', 'parcial', 'pagado'].map(e => (
              <button key={e} onClick={() => setFilterEstado(e)} className={`flex-1 lg:flex-none px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm ${filterEstado === e ? 'bg-jengibre-dark text-white shadow-jengibre-dark/20' : 'bg-white border border-gray-100 text-gray-400 hover:bg-gray-50'}`}>{e}</button>
            ))}
          </div>
        </div>
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 bg-jengibre-dark/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl p-10 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto border border-white/20">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-3xl font-black tracking-tighter text-jengibre-dark">{editingId ? 'Editar Factura' : 'Nueva Factura'}</h2>
              <button onClick={closeForm} className="p-3 hover:bg-gray-100 rounded-full transition-colors"><X size={28} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(formData); }} className="space-y-8">
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Cliente</label>
                  <select className="w-full border border-gray-200 rounded-2xl p-4 outline-none bg-white font-black text-jengibre-dark focus:ring-4 focus:ring-jengibre-primary/10" value={formData.cliente_id} onChange={e => setFormData({...formData, cliente_id: e.target.value})} required>
                    <option value="">Seleccionar cliente...</option>
                    {clientes?.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Mes de Facturación</label>
                  <input type="month" className="w-full border border-gray-200 rounded-2xl p-4 outline-none font-bold text-gray-700 focus:ring-4 focus:ring-jengibre-primary/10" value={formData.mes} onChange={e => setFormData({...formData, mes: e.target.value})} required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Monto Base (Neto)</label>
                  <div className="relative group">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 font-black text-xl group-focus-within:text-jengibre-primary transition-colors">$</span>
                    <input type="number" step="0.01" className="w-full border border-gray-200 rounded-2xl p-4 pl-10 outline-none font-mono text-2xl font-black tracking-tighter focus:ring-4 focus:ring-jengibre-primary/10 text-jengibre-dark" value={formData.monto_base} onChange={e => setFormData({...formData, monto_base: e.target.value})} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Monto Final (C/ Impuestos)</label>
                  <div className="relative group">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 font-black text-xl group-focus-within:text-jengibre-primary transition-colors">$</span>
                    <input type="number" step="0.01" className="w-full border border-gray-200 rounded-2xl p-4 pl-10 outline-none font-mono text-2xl font-black tracking-tighter focus:ring-4 focus:ring-jengibre-primary/10 text-jengibre-dark" value={formData.monto_final} onChange={e => setFormData({...formData, monto_final: e.target.value})} required />
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-8 rounded-[2rem] border border-gray-100 space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">Detalle de Cobranza</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Monto Pagado</label>
                    <input type="number" className="w-full border border-gray-200 rounded-xl p-3 font-mono font-bold" value={formData.descripcion.monto_pagado} onChange={e => setFormData({...formData, descripcion: {...formData.descripcion, monto_pagado: Number(e.target.value)}})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Retención Ganancias</label>
                    <input type="number" className="w-full border border-gray-200 rounded-xl p-3 font-mono font-bold" value={formData.descripcion.retencion_ganancias} onChange={e => setFormData({...formData, descripcion: {...formData.descripcion, retencion_ganancias: Number(e.target.value)}})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Retención IVA</label>
                    <input type="number" className="w-full border border-gray-200 rounded-xl p-3 font-mono font-bold" value={formData.descripcion.retencion_iva} onChange={e => setFormData({...formData, descripcion: {...formData.descripcion, retencion_iva: Number(e.target.value)}})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Otras Retenciones</label>
                    <input type="number" className="w-full border border-gray-200 rounded-xl p-3 font-mono font-bold" value={formData.descripcion.monto_retenido} onChange={e => setFormData({...formData, descripcion: {...formData.descripcion, monto_retenido: Number(e.target.value)}})} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Estado</label>
                  <select className="w-full border border-gray-200 rounded-2xl p-4 outline-none bg-white font-black text-jengibre-dark focus:ring-4 focus:ring-jengibre-primary/10" value={formData.estado} onChange={e => setFormData({...formData, estado: e.target.value})} required>
                    <option value="pendiente">Pendiente</option>
                    <option value="parcial">Cobro Parcial</option>
                    <option value="pagado">Pagado</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Link Factura (Drive/PDF)</label>
                  <input type="url" className="w-full border border-gray-200 rounded-2xl p-4 outline-none font-medium text-gray-700 focus:ring-4 focus:ring-jengibre-primary/10" value={formData.descripcion.link} onChange={e => setFormData({...formData, descripcion: {...formData.descripcion, link: e.target.value}})} placeholder="https://..." />
                </div>
              </div>

              <div className="flex justify-end gap-4 mt-12 pt-8 border-t border-gray-100">
                <button type="button" onClick={closeForm} className="px-8 py-4 text-gray-400 font-black uppercase tracking-widest text-[10px] hover:bg-gray-50 rounded-2xl transition-colors">Cancelar</button>
                <button type="submit" disabled={saveMutation.isPending} className="bg-jengibre-primary text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-jengibre-primary/20 active:scale-95 transition-all disabled:opacity-50">
                  {saveMutation.isPending ? 'Guardando...' : 'Guardar Factura'}
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
                  <th className="px-8 py-6">Mes / Cliente</th>
                  <th className="px-8 py-6">Estado</th>
                  <th className="px-8 py-6 text-right">Monto Final</th>
                  <th className="px-8 py-6 text-right">Cobrado</th>
                  <th className="px-8 py-6 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredFacturas?.map((f) => {
                  const desc = parseDescripcion(f.descripcion);
                  const cobrado = desc.monto_pagado + desc.retencion_ganancias + desc.retencion_iva + desc.monto_retenido;
                  const pendiente = parseFinancial(f.monto_final || f.monto_base) - cobrado;
                  
                  return (
                    <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50/80 transition-colors group">
                      <td className="px-8 py-6">
                        <p className="text-[10px] font-black text-jengibre-primary uppercase tracking-widest mb-1">{formatLocalDate(f.mes, { month: 'long', year: 'numeric' })}</p>
                        <p className="text-lg font-black text-gray-900 tracking-tight">{f.cliente?.nombre}</p>
                      </td>
                      <td className="px-8 py-6">
                        <span className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm ${
                          f.estado === 'pagado' ? 'bg-emerald-50 text-emerald-600' :
                          f.estado === 'parcial' ? 'bg-amber-50 text-amber-600' :
                          'bg-red-50 text-red-600'
                        }`}>
                          {f.estado}
                        </span>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <p className="text-xl font-mono font-black text-jengibre-dark tracking-tighter">{formatARS(f.monto_final || f.monto_base)}</p>
                        <p className="text-[10px] text-gray-400 font-bold mt-1 uppercase tracking-tighter">Base: {formatARS(f.monto_base)}</p>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <p className={`text-xl font-mono font-black tracking-tighter ${pendiente <= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>{formatARS(cobrado)}</p>
                        {pendiente > 0 && <p className="text-[10px] text-red-400 font-bold mt-1 uppercase tracking-tighter">Faltan: {formatARS(pendiente)}</p>}
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                          {desc.link && <a href={desc.link} target="_blank" rel="noreferrer" className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all shadow-sm hover:shadow-md"><ExternalLink size={18} /></a>}
                          <button onClick={() => openEdit(f)} className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all shadow-sm hover:shadow-md"><Edit2 size={18} /></button>
                          <button onClick={() => { if(confirm('¿Eliminar esta factura?')) deleteMutation.mutate(f.id); }} className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all shadow-sm hover:shadow-md"><Trash2 size={18} /></button>
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
