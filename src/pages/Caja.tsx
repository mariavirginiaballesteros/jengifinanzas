import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TipAlert } from '@/components/TipAlert';
import { Plus, Edit2, Trash2, ArrowUpRight, ArrowDownRight, Wallet, RefreshCw, Tag, Calendar, Search, X, Loader2, ArrowRight } from 'lucide-react';
import { formatARS, formatUSD, formatLocalDate, parseFinancial, parseNotas } from '@/lib/utils';
import { showSuccess, showError } from '@/utils/toast';

const CATEGORIAS_INGRESO = ['Abonos Mensuales', 'Recuperos de Gastos', 'Proyectos Especiales', 'Inversión de Socios', 'Otros Ingresos'];
const CATEGORIAS_EGRESO = ['Honorarios Equipo', 'Impuestos (AFIP/IIBB/Ganancias)', 'Software y Herramientas', 'Gastos de Oficina', 'Marketing y Ventas', 'Retiros de Dividendos', 'Otros Gastos'];

export default function Caja() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
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
      return data?.valor ? JSON.parse(data.valor) : ['MP Vir', 'IVA', 'MP Mauro', 'MP Fondo', 'USD'];
    }
  });

  const cuentasList: string[] = cuentasConfig || ['MP Vir', 'IVA', 'MP Mauro', 'MP Fondo', 'USD'];

  const { data: movimientos, isLoading } = useQuery({
    queryKey: ['movimientos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('movimientos').select(`*, cliente:clientes(nombre)`).order('fecha', { ascending: false }).order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (movData: typeof formData) => {
      const montoParsed = parseFinancial(movData.monto);
      if (!movData.monto || montoParsed <= 0) throw new Error("El monto debe ser mayor a 0");
      if (!movData.cuenta) throw new Error("Debes seleccionar una cuenta");
      
      const finalConcepto = movData.tipo === 'transferencia' ? 'Transferencia Interna' : movData.concepto;
      if (!finalConcepto) throw new Error("Debes seleccionar una categoría");
      
      if (movData.tipo === 'transferencia' && !movData.cuenta_destino) throw new Error("Debes seleccionar una cuenta de destino");
      if (movData.tipo === 'transferencia' && movData.cuenta === movData.cuenta_destino) throw new Error("La cuenta de origen y destino no pueden ser la misma");

      const jsonNotas = JSON.stringify({ texto: movData.notasTexto, moneda: movData.moneda });
      const payload = {
        fecha: movData.fecha,
        tipo: movData.tipo,
        concepto: finalConcepto,
        monto: montoParsed,
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
      showSuccess(editingId ? 'Movimiento actualizado' : 'Movimiento registrado con éxito');
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

  const filteredMovimientos = movimientos?.filter(m => 
    m.concepto?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.cuenta?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    parseNotas(m.notas).texto?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openEdit = (mov: any) => {
    const notasParsed = parseNotas(mov.notas);
    setFormData({
      fecha: mov.fecha,
      tipo: mov.tipo,
      concepto: mov.concepto === 'Transferencia Interna' ? '' : mov.concepto,
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
    <div className="animate-in fade-in duration-700 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-4xl font-display font-bold text-jengibre-dark">Libro de Caja</h1>
          <p className="text-gray-500 mt-1 font-medium">Registro histórico de todos los flujos de dinero.</p>
        </div>
        <button onClick={() => setIsFormOpen(true)} className="bg-jengibre-primary hover:bg-[#a64120] text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-jengibre-primary/20 active:scale-95">
          <Plus size={20} /> Nuevo Movimiento
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
        <div className="lg:col-span-3 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input 
            type="text" 
            placeholder="Buscar por categoría, cuenta o detalle..." 
            className="w-full bg-white border border-jengibre-border rounded-2xl py-4 pl-12 pr-4 outline-none focus:ring-2 focus:ring-jengibre-primary/20 transition-all shadow-sm"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="bg-white border border-jengibre-border rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-jengibre-cream text-jengibre-primary"><Calendar size={20} /></div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Registros</span>
          </div>
          <span className="text-xl font-mono font-bold text-jengibre-dark">{filteredMovimientos?.length || 0}</span>
        </div>
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 bg-jengibre-dark/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg p-8 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-display font-bold text-jengibre-dark">{editingId ? 'Editar Movimiento' : 'Nuevo Movimiento'}</h2>
              <button onClick={closeForm} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={24} /></button>
            </div>
            
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(formData); }} className="space-y-6">
              <div className="flex bg-gray-100 p-1.5 rounded-2xl">
                {['ingreso', 'egreso', 'transferencia'].map(t => (
                  <button key={t} type="button" onClick={() => setFormData({...formData, tipo: t, concepto: ''})} className={`flex-1 py-2.5 rounded-xl text-xs font-bold capitalize transition-all ${formData.tipo === t ? 'bg-white shadow-md text-jengibre-dark' : 'text-gray-500 hover:text-gray-700'}`}>{t}</button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Fecha</label>
                  <input type="date" required className="w-full border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-jengibre-primary/20" value={formData.fecha} onChange={e => setFormData({...formData, fecha: e.target.value})} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">{formData.tipo === 'transferencia' ? 'Desde Cuenta' : 'Cuenta'}</label>
                  <select className="w-full border border-gray-200 rounded-xl p-3 outline-none bg-white focus:ring-2 focus:ring-jengibre-primary/20" value={formData.cuenta} onChange={e => setFormData({...formData, cuenta: e.target.value})} required>
                    <option value="">Seleccioná...</option>
                    {cuentasList.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {formData.tipo !== 'transferencia' ? (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Categoría</label>
                  <select className="w-full border border-gray-200 rounded-xl p-3 outline-none bg-white font-bold text-jengibre-dark focus:ring-2 focus:ring-jengibre-primary/20" value={formData.concepto} onChange={e => setFormData({...formData, concepto: e.target.value})} required>
                    <option value="">-- Seleccionar Categoría --</option>
                    {(formData.tipo === 'ingreso' ? CATEGORIAS_INGRESO : CATEGORIAS_EGRESO).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Hacia Cuenta (Destino)</label>
                  <select className="w-full border border-gray-200 rounded-xl p-3 outline-none bg-white focus:ring-2 focus:ring-jengibre-primary/20" value={formData.cuenta_destino} onChange={e => setFormData({...formData, cuenta_destino: e.target.value})} required>
                    <option value="">Seleccioná destino...</option>
                    {cuentasList.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Moneda</label>
                  <select className="w-full border border-gray-200 rounded-xl p-3 outline-none font-bold focus:ring-2 focus:ring-jengibre-primary/20" value={formData.moneda} onChange={e => setFormData({...formData, moneda: e.target.value})}>
                    <option value="ARS">ARS</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Monto</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                    <input type="number" required step="0.01" className="w-full border border-gray-200 rounded-xl p-3 pl-8 outline-none font-mono text-xl font-bold focus:ring-2 focus:ring-jengibre-primary/20" value={formData.monto} onChange={e => setFormData({...formData, monto: e.target.value})} />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Detalle / Notas</label>
                <input placeholder="Ej: Pago honorarios Julio - Juan Perez" className="w-full border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-jengibre-primary/20" value={formData.notasTexto} onChange={e => setFormData({...formData, notasTexto: e.target.value})} />
              </div>

              <div className="flex justify-end gap-3 mt-10 pt-6 border-t border-gray-100">
                <button type="button" onClick={closeForm} className="px-6 py-3 text-gray-500 font-bold hover:bg-gray-50 rounded-xl transition-colors">Cancelar</button>
                <button type="submit" disabled={saveMutation.isPending} className="bg-jengibre-primary text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-jengibre-primary/20 active:scale-95 transition-all disabled:opacity-50">
                  {saveMutation.isPending ? 'Guardando...' : 'Guardar Movimiento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white border border-jengibre-border rounded-3xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 text-jengibre-primary animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 text-gray-400 text-[10px] font-bold uppercase tracking-widest border-b border-jengibre-border">
                  <th className="px-6 py-5">Fecha</th>
                  <th className="px-6 py-5">Categoría / Detalle</th>
                  <th className="px-6 py-5">Cuenta</th>
                  <th className="px-6 py-5 text-right">Monto</th>
                  <th className="px-6 py-5 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredMovimientos?.map((mov) => {
                  const isIngreso = mov.tipo === 'ingreso';
                  const isTransfer = mov.tipo === 'transferencia';
                  const notas = parseNotas(mov.notas);
                  return (
                    <tr key={mov.id} className="border-b border-gray-50 hover:bg-gray-50/80 transition-colors group">
                      <td className="px-6 py-5">
                        <p className="text-sm font-bold text-gray-900">{formatLocalDate(mov.fecha, { day: '2-digit', month: 'short' })}</p>
                        <p className="text-[10px] text-gray-400 font-medium">{mov.fecha ? mov.fecha.substring(0, 4) : '-'}</p>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-4">
                          <div className={`p-2.5 rounded-2xl ${isIngreso ? 'bg-emerald-50 text-emerald-600' : isTransfer ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>
                            {isIngreso ? <ArrowDownRight size={20} /> : isTransfer ? <RefreshCw size={20} /> : <ArrowUpRight size={20} />}
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 text-sm">{isTransfer ? 'Transferencia Interna' : mov.concepto}</p>
                            {notas.texto && <p className="text-xs text-gray-400 font-medium mt-0.5">{notas.texto}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          <span className="bg-gray-100 text-gray-600 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider">{mov.cuenta}</span>
                          {isTransfer && (
                            <>
                              <ArrowRight size={12} className="text-gray-300" />
                              <span className="bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider">{mov.cuenta_destino}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className={`px-6 py-5 text-right font-mono font-bold text-base ${isIngreso ? 'text-emerald-600' : isTransfer ? 'text-blue-600' : 'text-gray-900'}`}>
                        {isIngreso ? '+' : isTransfer ? '⇄' : '-'}
                        {notas.moneda === 'USD' ? formatUSD(mov.monto) : formatARS(mov.monto)}
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(mov)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"><Edit2 size={18} /></button>
                          <button onClick={() => { if(confirm('¿Eliminar este movimiento?')) deleteMutation.mutate(mov.id); }} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"><Trash2 size={18} /></button>
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