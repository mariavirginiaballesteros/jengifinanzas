import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Edit2, Trash2, Users, Building, MessageCircle, Search, X, Loader2 } from 'lucide-react';
import { formatARS, parseNotas } from '@/lib/utils';
import { showSuccess, showError } from '@/utils/toast';

export default function Equipo() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const defaultForm = {
    nombre: '', rol: '', honorario_mensual: 0,
    condicion_fiscal: 'Monotributo', activo: true,
    notasTexto: '', telefono: '', asignaciones: {} as Record<string, number>
  };
  const [formData, setFormData] = useState(defaultForm);

  const { data: equipo, isLoading: loadingEquipo } = useQuery({
    queryKey: ['equipo'],
    queryFn: async () => {
      const { data, error } = await supabase.from('equipo').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const { data: clientes } = useQuery({
    queryKey: ['clientes_activos_equipo'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id, nombre, estado').order('nombre');
      if (error) throw error;
      return data;
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (miembroData: typeof formData) => {
      const jsonNotas = JSON.stringify({
        texto: miembroData.notasTexto,
        telefono: miembroData.telefono,
        asignaciones: miembroData.asignaciones
      });

      const payload = {
        nombre: miembroData.nombre,
        rol: miembroData.rol,
        honorario_mensual: miembroData.honorario_mensual,
        condicion_fiscal: miembroData.condicion_fiscal,
        activo: miembroData.activo,
        notas: jsonNotas
      };

      if (editingId) {
        const { error } = await supabase.from('equipo').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('equipo').insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipo'] });
      showSuccess(editingId ? 'Miembro actualizado' : 'Miembro agregado');
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
    }
  });

  const filteredEquipo = equipo?.filter(m => 
    m.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.rol.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAsignaciones: Record<string, number> = {};
    Object.entries(formData.asignaciones).forEach(([k, v]) => {
      if (Number(v) > 0) cleanAsignaciones[k] = Number(v);
    });
    saveMutation.mutate({ ...formData, asignaciones: cleanAsignaciones });
  };

  const openEdit = (miembro: any) => {
    const notasData = typeof miembro.notas === 'string' ? parseNotas(miembro.notas) : (miembro.notas || {});
    setFormData({
      nombre: miembro.nombre || '',
      rol: miembro.rol || '',
      honorario_mensual: miembro.honorario_mensual || 0,
      condicion_fiscal: miembro.condicion_fiscal || 'Monotributo',
      activo: miembro.activo ?? true,
      notasTexto: notasData.texto || '',
      telefono: notasData.telefono || '',
      asignaciones: notasData.asignaciones || {}
    });
    setEditingId(miembro.id);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormData(defaultForm);
  };

  const setAsignacion = (clienteId: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      asignaciones: { ...prev.asignaciones, [clienteId]: Number(value) }
    }));
  };

  const handleWhatsApp = (miembro: any) => {
    const notasData = parseNotas(miembro.notas);
    const phone = notasData.telefono ? notasData.telefono.replace(/\D/g, '') : '';
    const msg = `Hola ${miembro.nombre}! ¿Cómo estás?`;
    const url = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(url, '_blank');
  };

  return (
    <div className="animate-in fade-in duration-700 pb-20">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Equipo</h1>
          <p className="text-slate-500 mt-1 font-medium">Gestión de retribuciones y proyectos del equipo.</p>
        </div>
        <button onClick={() => setIsFormOpen(true)} className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-4 rounded-2xl font-bold text-sm flex items-center gap-3 transition-all shadow-lg shadow-slate-900/10 active:scale-95">
          <Plus size={18} /> Nuevo Miembro
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-10">
        <div className="lg:col-span-3 relative group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-600 transition-colors" size={18} />
          <input type="text" placeholder="Buscar por nombre o rol..." className="w-full bg-white border border-slate-200 rounded-xl py-3.5 pl-12 pr-6 outline-none focus:ring-2 focus:ring-slate-200 transition-all font-medium text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-50 text-slate-400"><Users size={18} /></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Activos</span>
          </div>
          <span className="text-xl font-bold text-slate-900">{filteredEquipo?.filter(m => m.activo).length || 0}</span>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
        {loadingEquipo ? (
          <div className="flex justify-center py-32"><Loader2 className="w-12 h-12 text-slate-200 animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-bold uppercase tracking-[0.15em] border-b border-slate-100">
                  <th className="px-8 py-5">Miembro / Rol</th>
                  <th className="px-8 py-5">Proyectos</th>
                  <th className="px-8 py-5 text-right">Honorario Total</th>
                  <th className="px-8 py-5 text-center">Estado</th>
                  <th className="px-8 py-5 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredEquipo?.map((m) => {
                  const notas = typeof m.notas === 'string' ? parseNotas(m.notas) : (m.notas || {});
                  const asignaciones = notas.asignaciones || {};
                  
                  let proyectosActivosCount = 0;
                  const honorarioProyectos = Object.entries(asignaciones).reduce((acc, [cId, monto]) => {
                    const c = clientes?.find((cl: any) => cl.id === cId);
                    if (c && c.estado === 'activo') {
                      proyectosActivosCount++;
                      return acc + Number(monto || 0);
                    }
                    return acc;
                  }, 0);
                  
                  const base = Number(m.honorario_mensual || 0);
                  const total = base + honorarioProyectos;
                  
                  return (
                    <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                      <td className="px-8 py-6">
                        <p className="text-sm font-bold text-slate-900">{m.nombre}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">{m.rol}</p>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-slate-50 text-slate-400"><Building size={14} /></div>
                          <span className="text-xs font-bold text-slate-600">{proyectosActivosCount} activos</span>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <p className="text-lg font-bold text-slate-900 tracking-tight">{formatARS(total)}</p>
                        <p className="text-[9px] text-slate-400 font-bold mt-0.5 uppercase tracking-tighter">Base: {formatARS(m.honorario_mensual)}</p>
                      </td>
                      <td className="px-8 py-6 text-center">
                        <span className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest ${m.activo ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                          {m.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={() => handleWhatsApp(m)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"><MessageCircle size={16} /></button>
                          <button onClick={() => openEdit(m)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><Edit2 size={16} /></button>
                          <button onClick={() => { if(confirm('¿Eliminar miembro?')) deleteMutation.mutate(m.id); }} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={16} /></button>
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
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl p-10 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto border border-white/20">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">{editingId ? 'Editar Miembro' : 'Nuevo Miembro'}</h2>
              <button onClick={closeForm} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"><X size={24} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nombre Completo</label>
                  <input required className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-700 text-sm" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Rol / Puesto</label>
                  <input className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-700 text-sm" value={formData.rol} onChange={e => setFormData({...formData, rol: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Sueldo Base (ARS)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
                    <input type="number" className="w-full border border-slate-200 rounded-xl p-3.5 pl-8 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-900 text-lg tracking-tight" value={formData.honorario_mensual} onChange={e => setFormData({...formData, honorario_mensual: Number(e.target.value)})} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">WhatsApp</label>
                  <input className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-700 text-sm" value={formData.telefono} onChange={e => setFormData({...formData, telefono: e.target.value})} placeholder="+54 9..." />
                </div>
              </div>
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Asignación por Proyecto</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-2">
                  {clientes?.map(c => (
                    <div key={c.id} className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                      <span className="text-xs font-bold uppercase tracking-tight text-slate-600 truncate mr-3">{c.nombre}</span>
                      <div className="relative w-28 shrink-0">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</span>
                        <input type="number" className="w-full border border-slate-100 rounded-lg p-2 pl-6 text-right font-bold text-sm outline-none focus:ring-2 focus:ring-slate-100" value={formData.asignaciones[c.id] || ''} onChange={e => setAsignacion(c.id, e.target.value)} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-10 pt-8 border-t border-slate-100">
                <button type="button" onClick={closeForm} className="px-6 py-3.5 text-slate-400 font-bold uppercase tracking-widest text-[10px] hover:bg-slate-50 rounded-xl transition-colors">Cancelar</button>
                <button type="submit" disabled={saveMutation.isPending} className="bg-slate-900 text-white px-8 py-3.5 rounded-xl font-bold uppercase tracking-widest text-[10px] shadow-lg shadow-slate-900/10 active:scale-95 transition-all disabled:opacity-50">
                  {saveMutation.isPending ? 'Guardando...' : 'Guardar Miembro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
