import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TipAlert } from '@/components/TipAlert';
import { Plus, Edit2, Trash2, ArrowUpRight, ArrowDownRight, Wallet } from 'lucide-react';
import { formatARS } from '@/lib/utils';
import { showSuccess, showError } from '@/utils/toast';

export default function Caja() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const defaultForm = {
    fecha: new Date().toISOString().split('T')[0],
    tipo: 'ingreso',
    concepto: '',
    monto: '',
    cuenta: '',
    cliente_id: '',
    tiene_iva: false,
    notas: ''
  };
  const [formData, setFormData] = useState<any>(defaultForm);

  // 1. Traer Billeteras dinámicas de configuración
  const { data: cuentasConfig } = useQuery({
    queryKey: ['cuentas_activas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('configuracion')
        .select('valor')
        .eq('clave', 'cuentas_caja')
        .maybeSingle();
      
      if (error) throw error;
      if (data?.valor) {
        try { return JSON.parse(data.valor); } catch { return ['Macro', 'IVA', 'MP Mauro', 'MP Fondo', 'Efectivo']; }
      }
      return ['Macro', 'IVA', 'MP Mauro', 'MP Fondo', 'Efectivo'];
    }
  });

  const cuentasList: string[] = cuentasConfig || ['Macro', 'IVA', 'MP Mauro', 'MP Fondo', 'Efectivo'];

  // 2. Traer Movimientos
  const { data: movimientos, isLoading } = useQuery({
    queryKey: ['movimientos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('movimientos')
        .select(`*, cliente:clientes(nombre)`)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  // 3. Traer Clientes
  const { data: clientes } = useQuery({
    queryKey: ['clientes_combo'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id, nombre').eq('estado', 'activo');
      if (error) throw error;
      return data;
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (movData: any) => {
      const payload = { ...movData, cliente_id: movData.cliente_id || null };
      
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
    },
    onError: (err: any) => showError(err.message)
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.monto || formData.monto <= 0) return showError('El monto debe ser mayor a 0');
    if (!formData.cuenta) return showError('Debes seleccionar una cuenta bancaria');
    saveMutation.mutate(formData);
  };

  const openNewForm = () => {
    setFormData({
      ...defaultForm,
      cuenta: cuentasList[0] || 'Macro'
    });
    setEditingId(null);
    setIsFormOpen(true);
  };

  const openEdit = (mov: any) => {
    setFormData({
      fecha: mov.fecha,
      tipo: mov.tipo,
      concepto: mov.concepto,
      monto: mov.monto,
      cuenta: mov.cuenta,
      cliente_id: mov.cliente_id || '',
      tiene_iva: mov.tiene_iva || false,
      notas: mov.notas || ''
    });
    setEditingId(mov.id);
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
          <h1 className="text-3xl font-display font-bold text-jengibre-dark">Libro de Caja</h1>
          <p className="text-gray-600 mt-1">Registrá los ingresos cobrados y gastos pagados en el día a día.</p>
        </div>
        <button 
          onClick={openNewForm}
          className="bg-jengibre-primary hover:bg-[#a64120] text-white px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all shadow-sm"
        >
          <Plus size={20} /> Nuevo Movimiento
        </button>
      </header>

      <TipAlert id="caja_intro" title="💡 Tip de uso: Cuentas y Transferencias">
        Registrá acá la plata que <strong>realmente entró o salió</strong> de las cuentas bancarias o billeteras virtuales. 
        Podés administrar la lista de billeteras disponibles desde el menú "Configuración".
      </TipAlert>

      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-display font-bold mb-6">
              {editingId ? 'Editar Movimiento' : 'Nuevo Movimiento'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              
              <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
                <button
                  type="button"
                  onClick={() => setFormData({...formData, tipo: 'ingreso'})}
                  className={`flex-1 py-2 rounded-md text-sm font-bold transition-colors ${formData.tipo === 'ingreso' ? 'bg-white shadow-sm text-jengibre-green' : 'text-gray-500'}`}
                >
                  Ingreso
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({...formData, tipo: 'egreso'})}
                  className={`flex-1 py-2 rounded-md text-sm font-bold transition-colors ${formData.tipo === 'egreso' ? 'bg-white shadow-sm text-jengibre-red' : 'text-gray-500'}`}
                >
                  Egreso
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                  <input 
                    type="date" required
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none" 
                    value={formData.fecha} onChange={e => setFormData({...formData, fecha: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cuenta</label>
                  <select 
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white"
                    value={formData.cuenta} onChange={e => setFormData({...formData, cuenta: e.target.value})}
                    required
                  >
                    <option value="" disabled>Seleccioná...</option>
                    {cuentasList.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monto (ARS)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                  <input 
                    type="number" required min="0" step="0.01"
                    className="w-full border border-gray-300 rounded-lg p-2.5 pl-8 focus:ring-2 focus:ring-jengibre-primary outline-none font-mono text-lg" 
                    value={formData.monto} onChange={e => setFormData({...formData, monto: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Concepto</label>
                <input 
                  required
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none" 
                  value={formData.concepto} onChange={e => setFormData({...formData, concepto: e.target.value})}
                  placeholder={formData.tipo === 'ingreso' ? 'Ej: Honorarios mensuales' : 'Ej: Pago sueldos, Software, etc.'}
                />
              </div>

              {formData.tipo === 'ingreso' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cliente (Opcional)</label>
                  <select 
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white"
                    value={formData.cliente_id} onChange={e => setFormData({...formData, cliente_id: e.target.value})}
                  >
                    <option value="">-- Ninguno / Otro ingreso --</option>
                    {clientes?.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
              )}

              {formData.tipo === 'ingreso' && (
                <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 flex items-center gap-3">
                  <input 
                    type="checkbox" id="tiene_iva" 
                    className="w-5 h-5 rounded border-gray-300 text-jengibre-primary focus:ring-jengibre-primary"
                    checked={formData.tiene_iva} 
                    onChange={e => setFormData({...formData, tiene_iva: e.target.checked})}
                  />
                  <label htmlFor="tiene_iva" className="text-sm text-gray-700 font-medium cursor-pointer select-none">
                    Este ingreso incluye IVA (21%) facturado
                  </label>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas adicionales (Opcional)</label>
                <textarea 
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none" 
                  value={formData.notas} onChange={e => setFormData({...formData, notas: e.target.value})}
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-100">
                <button type="button" onClick={closeForm} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={saveMutation.isPending} className="bg-jengibre-primary hover:bg-[#a64120] text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50">
                  {saveMutation.isPending ? 'Guardando...' : 'Guardar Movimiento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tabla de Movimientos */}
      <div className="bg-white border border-jengibre-border rounded-2xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-jengibre-primary border-t-transparent rounded-full animate-spin"></div></div>
        ) : movimientos?.length === 0 ? (
          <div className="p-12 text-center">
            <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
              <Wallet size={32} />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Libro de caja vacío</h3>
            <p className="text-gray-500">Todavía no registraste ningún movimiento en tus cuentas.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-jengibre-cream/50 text-jengibre-dark text-sm border-b border-jengibre-border">
                  <th className="px-4 py-3 font-bold">Fecha</th>
                  <th className="px-4 py-3 font-bold">Concepto</th>
                  <th className="px-4 py-3 font-bold">Cuenta</th>
                  <th className="px-4 py-3 font-bold text-right">Monto</th>
                  <th className="px-4 py-3 font-bold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {movimientos?.map((mov) => {
                  const isIngreso = mov.tipo === 'ingreso';
                  const dateFormatted = new Date(mov.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
                  
                  return (
                    <tr key={mov.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors group">
                      <td className="px-4 py-4 text-sm text-gray-500 whitespace-nowrap">{dateFormatted}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-full shrink-0 ${isIngreso ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {isIngreso ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}
                          </div>
                          <div>
                            <p className="font-bold text-gray-900">{mov.concepto}</p>
                            {mov.cliente && <p className="text-xs text-gray-500 mt-0.5">Cliente: {mov.cliente.nombre}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-md font-medium">{mov.cuenta}</span>
                        {mov.tiene_iva && <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold uppercase">IVA</span>}
                      </td>
                      <td className={`px-4 py-4 text-right font-mono font-bold whitespace-nowrap ${isIngreso ? 'text-green-700' : 'text-gray-900'}`}>
                        {isIngreso ? '+' : '-'}{formatARS(mov.monto)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(mov)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => { if(confirm('¿Eliminar movimiento?')) deleteMutation.mutate(mov.id); }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                            <Trash2 size={16} />
                          </button>
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