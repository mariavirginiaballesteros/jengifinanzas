import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TipAlert } from '@/components/TipAlert';
import { Plus, Edit2, Trash2, ArrowUpRight, ArrowDownRight, Wallet, RefreshCw } from 'lucide-react';
import { formatARS, formatUSD } from '@/lib/utils';
import { showSuccess, showError } from '@/utils/toast';
import { useCotizacionOficial } from '@/hooks/useCotizacion';

const parseNotas = (notasStr: string | null) => {
  if (!notasStr) return { texto: '', moneda: 'ARS' };
  try {
    const parsed = JSON.parse(notasStr);
    if (parsed && typeof parsed === 'object') return { texto: parsed.texto || '', moneda: parsed.moneda || 'ARS' };
  } catch(e) {}
  return { texto: notasStr || '', moneda: 'ARS' };
};

export default function Caja() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { data: cotizacionOficial } = useCotizacionOficial();
  
  const defaultForm = {
    fecha: new Date().toISOString().split('T')[0],
    tipo: 'ingreso',
    concepto: '',
    monto: '',
    cuenta: '',
    cuenta_destino: '',
    cliente_id: '',
    tiene_iva: false,
    notasTexto: '',
    moneda: 'ARS'
  };
  const [formData, setFormData] = useState(defaultForm);

  const { data: cuentasConfig } = useQuery({
    queryKey: ['configuracion', 'cuentas_caja'],
    queryFn: async () => {
      const { data } = await supabase.from('configuracion').select('valor').eq('clave', 'cuentas_caja').maybeSingle();
      return data?.valor ? JSON.parse(data.valor) : ['Macro', 'IVA', 'MP Mauro', 'MP Fondo', 'Efectivo'];
    }
  });

  const cuentasList: string[] = cuentasConfig || ['Macro', 'IVA', 'MP Mauro', 'MP Fondo', 'Efectivo'];

  const { data: movimientos, isLoading } = useQuery({
    queryKey: ['movimientos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('movimientos').select(`*, cliente:clientes(nombre)`).order('fecha', { ascending: false }).order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const { data: clientes } = useQuery({
    queryKey: ['clientes_combo'],
    queryFn: async () => {
      const { data } = await supabase.from('clientes').select('id, nombre').eq('estado', 'activo');
      return data || [];
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (movData: typeof formData) => {
      const jsonNotas = JSON.stringify({ texto: movData.notasTexto, moneda: movData.moneda });
      const payload = { 
        fecha: movData.fecha,
        tipo: movData.tipo,
        concepto: movData.concepto,
        monto: Number(movData.monto),
        cuenta: movData.cuenta,
        cuenta_destino: movData.tipo === 'transferencia' ? movData.cuenta_destino : null,
        cliente_id: movData.cliente_id || null,
        tiene_iva: movData.tiene_iva,
        notas: jsonNotas
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
      showSuccess('Movimiento guardado');
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.monto || Number(formData.monto) <= 0) return showError('Monto inválido');
    if (formData.tipo === 'transferencia' && formData.cuenta === formData.cuenta_destino) return showError('Las cuentas deben ser distintas');
    saveMutation.mutate(formData);
  };

  const openEdit = (mov: any) => {
    const notasParsed = parseNotas(mov.notas);
    setFormData({
      fecha: mov.fecha,
      tipo: mov.tipo,
      concepto: mov.concepto,
      monto: mov.monto.toString(),
      cuenta: mov.cuenta,
      cuenta_destino: mov.cuenta_destino || '',
      cliente_id: mov.cliente_id || '',
      tiene_iva: mov.tiene_iva || false,
      notasTexto: notasParsed.texto,
      moneda: notasParsed.moneda
    });
    setEditingId(mov.id);
    setIsFormOpen(true);
  };

  const closeForm = () => { setIsFormOpen(false); setEditingId(null); setFormData(defaultForm); };

  return (
    <div className="animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-jengibre-dark">Libro de Caja</h1>
          <p className="text-gray-600 mt-1">Registrá ingresos, egresos y transferencias entre tus cuentas.</p>
        </div>
        <button onClick={() => setIsFormOpen(true)} className="bg-jengibre-primary text-white px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 shadow-sm">
          <Plus size={20} /> Nuevo Movimiento
        </button>
      </header>

      <TipAlert id="caja_transfers" title="💡 Transferencias Internas">
        Usá el tipo <strong>Transferencia</strong> para mover plata entre tus cuentas (ej: de Macro a MP). Esto no afecta tu ganancia neta pero mantiene tus saldos reales al día.
      </TipAlert>

      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-display font-bold mb-6">{editingId ? 'Editar Movimiento' : 'Nuevo Movimiento'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
                {['ingreso', 'egreso', 'transferencia'].map(t => (
                  <button key={t} type="button" onClick={() => setFormData({...formData, tipo: t})} className={`flex-1 py-2 rounded-md text-xs font-bold capitalize transition-colors ${formData.tipo === t ? 'bg-white shadow-sm text-jengibre-dark' : 'text-gray-500'}`}>{t}</button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                  <input type="date" required className="w-full border border-gray-300 rounded-lg p-2.5 outline-none" value={formData.fecha} onChange={e => setFormData({...formData, fecha: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{formData.tipo === 'transferencia' ? 'Desde Cuenta' : 'Cuenta'}</label>
                  <select className="w-full border border-gray-300 rounded-lg p-2.5 outline-none bg-white" value={formData.cuenta} onChange={e => setFormData({...formData, cuenta: e.target.value})} required>
                    <option value="">Seleccioná...</option>
                    {cuentasList.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {formData.tipo === 'transferencia' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hacia Cuenta (Destino)</label>
                  <select className="w-full border border-gray-300 rounded-lg p-2.5 outline-none bg-white" value={formData.cuenta_destino} onChange={e => setFormData({...formData, cuenta_destino: e.target.value})} required>
                    <option value="">Seleccioná destino...</option>
                    {cuentasList.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Moneda</label>
                  <select className="w-full border border-gray-300 rounded-lg p-2.5 outline-none font-bold" value={formData.moneda} onChange={e => setFormData({...formData, moneda: e.target.value})}>
                    <option value="ARS">ARS</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monto</label>
                  <input type="number" required step="0.01" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none font-mono text-lg" value={formData.monto} onChange={e => setFormData({...formData, monto: e.target.value})} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Concepto</label>
                <input required className="w-full border border-gray-300 rounded-lg p-2.5 outline-none" value={formData.concepto} onChange={e => setFormData({...formData, concepto: e.target.value})} />
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-100">
                <button type="button" onClick={closeForm} className="px-4 py-2 text-gray-600">Cancelar</button>
                <button type="submit" className="bg-jengibre-primary text-white px-6 py-2 rounded-lg font-medium">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white border border-jengibre-border rounded-2xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-jengibre-primary border-t-transparent rounded-full animate-spin"></div></div>
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
                  const isTransfer = mov.tipo === 'transferencia';
                  const notas = parseNotas(mov.notas);
                  return (
                    <tr key={mov.id} className="border-b border-gray-100 hover:bg-gray-50 group">
                      <td className="px-4 py-4 text-sm text-gray-500">{new Date(mov.fecha).toLocaleDateString('es-AR')}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-full ${isIngreso ? 'bg-green-100 text-green-700' : isTransfer ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                            {isIngreso ? <ArrowDownRight size={16} /> : isTransfer ? <RefreshCw size={16} /> : <ArrowUpRight size={16} />}
                          </div>
                          <p className="font-bold text-gray-900">{mov.concepto}</p>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <span className="bg-gray-100 px-2 py-1 rounded">{mov.cuenta}</span>
                        {isTransfer && <span className="mx-2 text-gray-400">→</span>}
                        {isTransfer && <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded">{mov.cuenta_destino}</span>}
                      </td>
                      <td className={`px-4 py-4 text-right font-mono font-bold ${isIngreso ? 'text-green-700' : isTransfer ? 'text-blue-700' : 'text-gray-900'}`}>
                        {isIngreso ? '+' : isTransfer ? '⇄' : '-'}
                        {notas.moneda === 'USD' ? formatUSD(mov.monto) : formatARS(mov.monto)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                          <button onClick={() => openEdit(mov)} className="p-1.5 text-gray-400 hover:text-blue-600"><Edit2 size={16} /></button>
                          <button onClick={() => { if(confirm('¿Eliminar?')) deleteMutation.mutate(mov.id); }} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
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