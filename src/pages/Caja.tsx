import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Search, Filter, ArrowUpRight, ArrowDownRight, Wallet, Calendar, X, Loader2, Trash2, Edit2, MoreVertical, DollarSign, Landmark } from 'lucide-react';
import { formatARS, formatUSD, parseFinancial, getLocalDateString, parseNotas } from '@/lib/utils';
import { showSuccess, showError } from '@/utils/toast';

export default function Caja() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTipo, setFilterTipo] = useState('todos');

  const defaultForm = {
    fecha: getLocalDateString(),
    concepto: '',
    monto: '',
    tipo: 'egreso',
    cuenta: '',
    notas: ''
  };
  const [formData, setFormData] = useState(defaultForm);

  // Queries
  const { data: movimientos, isLoading: loadingMov } = useQuery({
    queryKey: ['movimientos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('movimientos')
        .select(`*`)
        .order('fecha', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const { data: configCuentas } = useQuery({
    queryKey: ['configuracion', 'cuentas_caja'],
    queryFn: async () => {
      const { data } = await supabase.from('configuracion').select('valor').eq('clave', 'cuentas_caja').maybeSingle();
      return data?.valor ? JSON.parse(data.valor) : ['MP Vir', 'MP Mauro', 'MP Fondo', 'USD'];
    }
  });

  // Mutaciones
  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const payload = {
        ...data,
        monto: parseFinancial(data.monto)
      };
      if (editingId) {
        const { error } = await supabase.from('movimientos').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('movimientos').insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movimientos'] });
      showSuccess(editingId ? 'Movimiento actualizado' : 'Movimiento registrado');
      closeForm();
    },
    onError: (err: any) => showError(err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('movimientos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movimientos'] });
      showSuccess('Movimiento eliminado');
    }
  });

  const filteredMov = movimientos?.filter(m => {
    const matchesSearch = m.concepto.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTipo = filterTipo === 'todos' || m.tipo === filterTipo;
    return matchesSearch && matchesTipo;
  });

  const openEdit = (m: any) => {
    setFormData({
      fecha: m.fecha,
      concepto: m.concepto,
      monto: m.monto.toString(),
      tipo: m.tipo,
      cuenta: m.cuenta,
      notas: m.notas || ''
    });
    setEditingId(m.id);
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
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Caja y Movimientos</h1>
          <p className="text-slate-500 mt-1 font-medium">Registro de ingresos, egresos y transferencias.</p>
        </div>
        <button onClick={() => setIsFormOpen(true)} className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-4 rounded-2xl font-bold text-sm flex items-center gap-3 transition-all shadow-lg shadow-slate-900/10 active:scale-95">
          <Plus size={18} /> Nuevo Movimiento
        </button>
      </header>

      {/* Filtros y Búsqueda */}
      <div className="bg-white border border-slate-200 rounded-[2rem] p-6 mb-10 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-6 items-center">
          <div className="flex-1 relative w-full group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-600 transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Buscar por concepto..." 
              className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3.5 pl-12 pr-6 outline-none focus:ring-2 focus:ring-slate-200 transition-all font-medium text-sm" 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
            />
          </div>
          <div className="flex gap-2 w-full lg:w-auto">
            {['todos', 'ingreso', 'egreso'].map(t => (
              <button 
                key={t} 
                onClick={() => setFilterTipo(t)} 
                className={`flex-1 lg:flex-none px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${filterTipo === t ? 'bg-slate-900 text-white shadow-md' : 'bg-white border border-slate-100 text-slate-400 hover:bg-slate-50'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabla de Movimientos */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
        {loadingMov ? (
          <div className="flex justify-center py-32"><Loader2 className="w-12 h-12 text-slate-200 animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-bold uppercase tracking-[0.15em] border-b border-slate-100">
                  <th className="px-8 py-5">Fecha / Cuenta</th>
                  <th className="px-8 py-5">Concepto</th>
                  <th className="px-8 py-5 text-right">Monto</th>
                  <th className="px-8 py-5 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredMov?.map((m) => {
                  const notas = parseNotas(m.notas);
                  const isUSD = notas.moneda === 'USD' || m.cuenta.toUpperCase().includes('USD');
                  return (
                    <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                      <td className="px-8 py-6">
                        <p className="text-xs font-bold text-slate-900">{new Date(m.fecha).toLocaleDateString()}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">{m.cuenta}</p>
                      </td>
                      <td className="px-8 py-6">
                        <p className="text-sm font-bold text-slate-700 group-hover:text-slate-900 transition-colors">{m.concepto}</p>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex flex-col items-end">
                          <p className={`text-lg font-bold tracking-tight ${m.tipo === 'ingreso' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {m.tipo === 'ingreso' ? '+' : '-'} {isUSD ? formatUSD(m.monto) : formatARS(m.monto)}
                          </p>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={() => openEdit(m)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><Edit2 size={16} /></button>
                          <button onClick={() => { if(confirm('¿Eliminar movimiento?')) deleteMutation.mutate(m.id); }} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredMov?.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-8 py-20 text-center">
                      <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">No se encontraron movimientos</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Formulario */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-10 shadow-2xl animate-in zoom-in-95 border border-white/20">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">{editingId ? 'Editar Movimiento' : 'Nuevo Movimiento'}</h2>
              <button onClick={closeForm} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"><X size={24} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(formData); }} className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Fecha</label>
                  <input type="date" className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-700 text-sm" value={formData.fecha} onChange={e => setFormData({...formData, fecha: e.target.value})} required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Tipo</label>
                  <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100">
                    <button type="button" onClick={() => setFormData({...formData, tipo: 'ingreso'})} className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${formData.tipo === 'ingreso' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}>Ingreso</button>
                    <button type="button" onClick={() => setFormData({...formData, tipo: 'egreso'})} className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${formData.tipo === 'egreso' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-400'}`}>Egreso</button>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Concepto</label>
                <input type="text" placeholder="Ej: Pago de abono, Compra de insumos..." className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-700 text-sm" value={formData.concepto} onChange={e => setFormData({...formData, concepto: e.target.value})} required />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Monto</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
                    <input type="number" step="0.01" className="w-full border border-slate-200 rounded-xl p-3.5 pl-8 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-900 text-lg tracking-tight" value={formData.monto} onChange={e => setFormData({...formData, monto: e.target.value})} required />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Cuenta</label>
                  <select className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-700 text-sm bg-white" value={formData.cuenta} onChange={e => setFormData({...formData, cuenta: e.target.value})} required>
                    <option value="">Seleccionar cuenta...</option>
                    {configCuentas?.map((c: string) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-10 pt-8 border-t border-slate-100">
                <button type="button" onClick={closeForm} className="px-6 py-3.5 text-slate-400 font-bold uppercase tracking-widest text-[10px] hover:bg-slate-50 rounded-xl transition-colors">Cancelar</button>
                <button type="submit" disabled={saveMutation.isPending} className="bg-slate-900 text-white px-8 py-3.5 rounded-xl font-bold uppercase tracking-widest text-[10px] shadow-lg shadow-slate-900/10 active:scale-95 transition-all disabled:opacity-50">
                  {saveMutation.isPending ? 'Guardando...' : 'Guardar Movimiento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
