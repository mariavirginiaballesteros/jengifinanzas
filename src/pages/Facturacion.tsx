import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Search, FileText, CheckCircle2, Clock, X, ExternalLink, Loader2, Edit2, Trash2 } from 'lucide-react';
import { formatARS, formatLocalDate, parseFinancial, parseDescripcion, getLocalDateString } from '@/lib/utils';
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
    if (!facturas) return { total: 0, cobrado: 0, pendiente: 0 };
    const total = facturas.reduce((acc, f) => acc + parseFinancial(f.monto_final || f.monto_base), 0);
    const cobrado = facturas.reduce((acc, f) => {
      const desc = parseDescripcion(f.descripcion);
      return acc + desc.monto_pagado + desc.retencion_ganancias + desc.retencion_iva + desc.monto_retenido;
    }, 0);
    return { total, cobrado, pendiente: total - cobrado };
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
    <div className="animate-in fade-in duration-700 pb-20">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Facturación</h1>
          <p className="text-slate-500 mt-1 font-medium">Control de emisión y cobranza de abonos.</p>
        </div>
        <button onClick={() => setIsFormOpen(true)} className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-4 rounded-2xl font-bold text-sm flex items-center gap-3 transition-all shadow-lg shadow-slate-900/10 active:scale-95">
          <Plus size={18} /> Nueva Factura
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 rounded-2xl bg-blue-50 text-blue-600"><FileText size={20} /></div>
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Total Facturado</h3>
          </div>
          <p className="text-3xl font-bold text-slate-900 tracking-tight">{formatARS(stats.total)}</p>
        </div>
        <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle2 size={20} /></div>
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Total Cobrado</h3>
          </div>
          <p className="text-3xl font-bold text-emerald-600 tracking-tight">{formatARS(stats.cobrado)}</p>
        </div>
        <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 rounded-2xl bg-amber-50 text-amber-600"><Clock size={20} /></div>
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Pendiente</h3>
          </div>
          <p className="text-3xl font-bold text-amber-600 tracking-tight">{formatARS(stats.pendiente)}</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[2rem] p-6 mb-10 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-6 items-center">
          <div className="flex-1 relative w-full group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-600 transition-colors" size={18} />
            <input type="text" placeholder="Buscar por cliente o mes..." className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3.5 pl-12 pr-6 outline-none focus:ring-2 focus:ring-slate-200 transition-all font-medium text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex gap-2 w-full lg:w-auto">
            {['todos', 'pendiente', 'parcial', 'pagado'].map(e => (
              <button key={e} onClick={() => setFilterEstado(e)} className={`flex-1 lg:flex-none px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${filterEstado === e ? 'bg-slate-900 text-white shadow-md' : 'bg-white border border-slate-100 text-slate-400 hover:bg-slate-50'}`}>{e}</button>
            ))}
          </div>
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
                  <th className="px-8 py-5">Mes / Cliente</th>
                  <th className="px-8 py-5">Estado</th>
                  <th className="px-8 py-5 text-right">Monto Final</th>
                  <th className="px-8 py-5 text-right">Cobrado</th>
                  <th className="px-8 py-5 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredFacturas?.map((f) => {
                  const desc = parseDescripcion(f.descripcion);
                  const cobrado = desc.monto_pagado + desc.retencion_ganancias + desc.retencion_iva + desc.monto_retenido;
                  const pendiente = parseFinancial(f.monto_final || f.monto_base) - cobrado;
                  
                  return (
                    <tr key={f.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                      <td className="px-8 py-6">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{formatLocalDate(f.mes, { month: 'long', year: 'numeric' })}</p>
                        <p className="text-sm font-bold text-slate-900">{f.cliente?.nombre}</p>
                      </td>
                      <td className="px-8 py-6">
                        <span className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest ${
                          f.estado === 'pagado' ? 'bg-emerald-50 text-emerald-600' :
                          f.estado === 'parcial' ? 'bg-amber-50 text-amber-600' :
                          'bg-rose-50 text-rose-600'
                        }`}>
                          {f.estado}
                        </span>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <p className="text-lg font-bold text-slate-900 tracking-tight">{formatARS(f.monto_final || f.monto_base)}</p>
                        <p className="text-[9px] text-slate-400 font-bold mt-0.5 uppercase tracking-tighter">Base: {formatARS(f.monto_base)}</p>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <p className={`text-lg font-bold tracking-tight ${pendiente <= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>{formatARS(cobrado)}</p>
                        {pendiente > 0 && <p className="text-[9px] text-rose-400 font-bold mt-0.5 uppercase tracking-tighter">Faltan: {formatARS(pendiente)}</p>}
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                          {desc.link && <a href={desc.link} target="_blank" rel="noreferrer" className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><ExternalLink size={16} /></a>}
                          <button onClick={() => openEdit(f)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><Edit2 size={16} /></button>
                          <button onClick={() => { if(confirm('¿Eliminar factura?')) deleteMutation.mutate(f.id); }} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={16} /></button>
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

      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl p-10 shadow-2xl animate-in zoom-in-95 border border-white/20">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">{editingId ? 'Editar Factura' : 'Nueva Factura'}</h2>
              <button onClick={closeForm} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"><X size={24} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(formData); }} className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Cliente</label>
                  <select className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-700 text-sm bg-white" value={formData.cliente_id} onChange={e => setFormData({...formData, cliente_id: e.target.value})} required>
                    <option value="">Seleccionar cliente...</option>
                    {clientes?.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Mes</label>
                  <input type="month" className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-700 text-sm" value={formData.mes} onChange={e => setFormData({...formData, mes: e.target.value})} required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Monto Base</label>
                  <input type="number" step="0.01" className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-900 text-lg tracking-tight" value={formData.monto_base} onChange={e => setFormData({...formData, monto_base: e.target.value})} required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Monto Final</label>
                  <input type="number" step="0.01" className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-900 text-lg tracking-tight" value={formData.monto_final} onChange={e => setFormData({...formData, monto_final: e.target.value})} required />
                </div>
              </div>

              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Detalle de Cobranza</p>
                <div className="grid grid-cols-2 gap-4">
                  <input type="number" placeholder="Pagado" className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold" value={formData.descripcion.monto_pagado} onChange={e => setFormData({...formData, descripcion: {...formData.descripcion, monto_pagado: Number(e.target.value)}})} />
                  <input type="number" placeholder="Ret. Ganancias" className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold" value={formData.descripcion.retencion_ganancias} onChange={e => setFormData({...formData, descripcion: {...formData.descripcion, retencion_ganancias: Number(e.target.value)}})} />
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
