import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TipAlert } from '@/components/TipAlert';
import { Plus, Edit2, Trash2, Users, Award, Building, MessageCircle, Search, Wallet, X, Loader2, Phone } from 'lucide-react';
import { formatARS, parseFinancial, parseNotas } from '@/lib/utils';
import { showSuccess, showError } from '@/utils/toast';

export default function Equipo() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [bonusModalOpen, setBonusModalOpen] = useState<{miembro: any, isOpen: boolean}>({ miembro: null, isOpen: false });
  const [selectedBonusProject, setSelectedBonusProject] = useState<string>('');
  const [incluirBono, setIncluirBono] = useState(true);
  
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

  const { data: clientes, isLoading: loadingClientes } = useQuery({
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
    const notasData = parseNotas(miembro.notas);
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

  const handleWhatsApp = (miembro: any, bonoExtra: number = 0, nombreProyectoBono: string = '') => {
    const notasData = parseNotas(miembro.notas);
    let proyectosActivosCount = 0;
    const honorarioProyectos = Object.entries(notasData.asignaciones).reduce((acc, [cId, monto]) => {
      const c = clientes?.find((cl: any) => cl.id === cId);
      if (c && c.estado === 'activo') {
        proyectosActivosCount++;
        return acc + Number(monto);
      }
      return acc;
    }, 0);
    const total = Number(miembro.honorario_mensual) + honorarioProyectos + bonoExtra;
    const phone = notasData.telefono ? notasData.telefono.replace(/\D/g, '') : '';
    let msg = `¡Hola ${miembro.nombre}! Te paso el detalle de la liquidación de este mes.%0A%0A`;
    if (Number(miembro.honorario_mensual) > 0) msg += `*Sueldo Base:* ${formatARS(miembro.honorario_mensual)}%0A`;
    if (proyectosActivosCount > 0) msg += `*Asignación por prestación de servicio (${proyectosActivosCount} proyectos activos):* ${formatARS(honorarioProyectos)}%0A`;
    if (bonoExtra > 0) msg += `*Bono Incentivo (15% por renovación en ${nombreProyectoBono}):* ${formatARS(bonoExtra)}%0A`;
    msg += `%0A*TOTAL A FACTURAR:* ${formatARS(total)}%0A%0A`;
    msg += `Por favor, cuando puedas generá la factura correspondiente por este monto para que podamos avanzar con el pago. ¡Gracias!`;
    const url = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(url, '_blank');
  };

  const isLoading = loadingEquipo || loadingClientes;

  return (
    <div className="animate-in fade-in duration-700 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-5xl font-black tracking-tighter text-jengibre-dark">Equipo</h1>
          <p className="text-gray-500 mt-2 font-bold uppercase tracking-widest text-[10px]">Gestión de retribuciones y proyectos del equipo.</p>
        </div>
        <button onClick={() => setIsFormOpen(true)} className="bg-jengibre-primary hover:bg-[#a64120] text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-3 transition-all shadow-xl shadow-jengibre-primary/20 active:scale-95">
          <Plus size={18} /> Nuevo Miembro
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-10">
        <div className="lg:col-span-3 relative group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-jengibre-primary transition-colors" size={20} />
          <input type="text" placeholder="Buscar por nombre o rol..." className="w-full bg-white border border-jengibre-border rounded-[1.5rem] py-5 pl-14 pr-6 outline-none focus:ring-4 focus:ring-jengibre-primary/10 transition-all shadow-sm text-lg font-medium" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <div className="bg-white border border-jengibre-border rounded-[1.5rem] p-5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-jengibre-cream text-jengibre-primary shadow-inner"><Users size={24} /></div>
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Activos</span>
          </div>
          <span className="text-3xl font-mono font-black text-jengibre-dark tracking-tighter">{filteredEquipo?.filter(m => m.activo).length || 0}</span>
        </div>
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 bg-jengibre-dark/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl p-10 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto border border-white/20">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-3xl font-black tracking-tighter text-jengibre-dark">{editingId ? 'Editar Miembro' : 'Nuevo Miembro'}</h2>
              <button onClick={closeForm} className="p-3 hover:bg-gray-100 rounded-full transition-colors"><X size={28} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nombre Completo</label>
                  <input required className="w-full border border-gray-200 rounded-2xl p-4 outline-none focus:ring-4 focus:ring-jengibre-primary/10 font-bold text-gray-700" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Rol / Puesto</label>
                  <input className="w-full border border-gray-200 rounded-2xl p-4 outline-none focus:ring-4 focus:ring-jengibre-primary/10 font-bold text-gray-700" value={formData.rol} onChange={e => setFormData({...formData, rol: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Sueldo Base (ARS)</label>
                  <div className="relative group">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 font-black text-xl group-focus-within:text-jengibre-primary transition-colors">$</span>
                    <input type="number" className="w-full border border-gray-200 rounded-2xl p-4 pl-10 outline-none font-mono text-2xl font-black tracking-tighter focus:ring-4 focus:ring-jengibre-primary/10 text-jengibre-dark" value={formData.honorario_mensual} onChange={e => setFormData({...formData, honorario_mensual: Number(e.target.value)})} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">WhatsApp</label>
                  <input className="w-full border border-gray-200 rounded-2xl p-4 outline-none focus:ring-4 focus:ring-jengibre-primary/10 font-bold text-gray-700" value={formData.telefono} onChange={e => setFormData({...formData, telefono: e.target.value})} placeholder="+54 9..." />
                </div>
              </div>
              <div className="bg-gray-50 p-8 rounded-[2rem] border border-gray-100 space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">Asignación por Proyecto</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                  {clientes?.map(c => (
                    <div key={c.id} className="flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                      <span className="text-xs font-black uppercase tracking-tight text-gray-600 truncate mr-4">{c.nombre}</span>
                      <div className="relative w-32 shrink-0">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-black text-xs">$</span>
                        <input type="number" className="w-full border border-gray-100 rounded-xl p-2 pl-6 text-right font-mono font-bold text-sm" value={formData.asignaciones[c.id] || ''} onChange={e => setAsignacion(c.id, e.target.value)} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-4 mt-12 pt-8 border-t border-gray-100">
                <button type="button" onClick={closeForm} className="px-8 py-4 text-gray-400 font-black uppercase tracking-widest text-[10px] hover:bg-gray-50 rounded-2xl transition-colors">Cancelar</button>
                <button type="submit" disabled={saveMutation.isPending} className="bg-jengibre-primary text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-jengibre-primary/20 active:scale-95 transition-all disabled:opacity-50">
                  {saveMutation.isPending ? 'Guardando...' : 'Guardar Miembro'}
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
                  <th className="px-8 py-6">Miembro / Rol</th>
                  <th className="px-8 py-6">Proyectos</th>
                  <th className="px-8 py-6 text-right">Honorario Total</th>
                  <th className="px-8 py-6 text-center">Estado</th>
                  <th className="px-8 py-6 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredEquipo?.map((m) => {
                  const notas = parseNotas(m.notas);
                  let proyectosActivosCount = 0;
                  const honorarioProyectos = Object.entries(notas.asignaciones).reduce((acc, [cId, monto]) => {
                    const c = clientes?.find((cl: any) => cl.id === cId);
                    if (c && c.estado === 'activo') {
                      proyectosActivosCount++;
                      return acc + Number(monto);
                    }
                    return acc;
                  }, 0);
                  const total = Number(m.honorario_mensual) + honorarioProyectos;
                  return (
                    <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50/80 transition-colors group">
                      <td className="px-8 py-6">
                        <p className="text-lg font-black text-gray-900 tracking-tight">{m.nombre}</p>
                        <p className="text-[10px] text-jengibre-primary font-black uppercase tracking-widest mt-1">{m.rol}</p>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-xl bg-blue-50 text-blue-600 shadow-sm"><Building size={16} /></div>
                          <span className="text-sm font-black text-gray-700">{proyectosActivosCount} activos</span>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <p className="text-2xl font-mono font-black text-jengibre-dark tracking-tighter">{formatARS(total)}</p>
                        <p className="text-[10px] text-gray-400 font-bold mt-1 uppercase tracking-tighter">Base: {formatARS(m.honorario_mensual)}</p>
                      </td>
                      <td className="px-8 py-6 text-center">
                        <span className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm ${m.activo ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                          {m.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                          <button onClick={() => handleWhatsApp(m)} className="p-2.5 text-[#25D366] hover:bg-[#25D366]/10 rounded-xl transition-all shadow-sm hover:shadow-md"><MessageCircle size={18} /></button>
                          <button onClick={() => openEdit(m)} className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all shadow-sm hover:shadow-md"><Edit2 size={18} /></button>
                          <button onClick={() => { if(confirm('¿Eliminar miembro?')) deleteMutation.mutate(m.id); }} className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all shadow-sm hover:shadow-md"><Trash2 size={18} /></button>
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
