import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TipAlert } from '@/components/TipAlert';
import { Plus, Edit2, Trash2, ArrowUpRight, ArrowDownRight, Wallet, RefreshCw, Tag, Calendar, Search, X, Loader2, ArrowRight, DollarSign } from 'lucide-react';
import { formatARS, formatUSD, formatLocalDate, parseFinancial, parseNotas, getLocalDateString } from '@/lib/utils';
import { showSuccess, showError } from '@/utils/toast';

const CATEGORIAS_INGRESO = ['Abonos Mensuales', 'Recuperos de Gastos', 'Proyectos Especiales', 'Inversión de Socios', 'Otros Ingresos'];
const CATEGORIAS_EGRESO = ['Honorarios Equipo', 'Impuestos (AFIP/IIBB/Ganancias)', 'Software y Herramientas', 'Gastos de Oficina', 'Marketing y Ventas', 'Retiros de Dividendos', 'Otros Gastos'];

export default function Caja() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const defaultForm = {
    fecha: getLocalDateString(),
    tipo: 'ingreso',
    concepto: '',
    monto: '',
    cuenta: '',
    cuenta_destino: '',
    cliente_id: '',
    notasTexto: '',
    moneda: 'ARS'
  };
  const [formData, setFormData] = useState(defaultForm);

  const { data: cuentasConfig } = useQuery({
    queryKey: ['configuracion', 'cuentas_caja'],
    queryFn: async () => {
      const { data } = await supabase.from('configuracion').select('valor').eq('clave', 'cuentas_caja').maybeSingle();
      return data?.valor ? JSON.parse(data.valor) : ['MP Vir', 'MP Mauro', 'MP Fondo', 'USD'];
    }
  });

  const cuentasList: string[] = cuentasConfig || ['MP Vir', 'MP Mauro', 'MP Fondo', 'USD'];

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
      notasTexto: notasParsed.texto,
      moneda: notasParsed.moneda
    });
    setEditingId(mov.id);
    setIsFormOpen(true);
  };

  const closeForm = () => { setIsFormOpen(false); setEditingId(null); setFormData(defaultForm); };

  return (
    <div className="animate-in fade-in duration-700 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-5xl font-black tracking-tighter text-jengibre-dark">Libro de Caja</h1>
          <p className="text-gray-500 mt-2 font-bold uppercase tracking-widest text-[10px]">Registro histórico de todos los flujos de dinero.</p>
        </div>
        <button onClick={() => setIsFormOpen(true)} className="bg-jengibre-primary hover:bg-[#a64120] text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-3 transition-all shadow-xl shadow-jengibre-primary/20 active:scale-95">
          <Plus size={18} /> Nuevo Movimiento
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-10">
        <div className="lg:col-span-3 relative group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-jengibre-primary transition-colors" size={20} />
          <input 
            type="text" 
            placeholder="Buscar por categoría, cuenta o detalle..." 
            className="w-full bg-white border border-jengibre-border rounded-[1.5rem] py-5 pl-14 pr-6 outline-none focus:ring-4 focus:ring-jengibre-primary/10 transition-all shadow-sm text-lg font-medium"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="bg-white border border-jengibre-border rounded-[1.5rem] p-5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-jengibre-cream text-jengibre-primary shadow-inner"><Calendar size={24} /></div>
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Registros</span>
          </div>
          <span className="text-3xl font-mono font-black text-jengibre-dark tracking-tighter">{filteredMovimientos?.length || 0}</span>
        </div>
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 bg-jengibre-dark/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-10 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto border border-white/20">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-3xl font-black tracking-tighter text-jengibre-dark">{editingId ? 'Editar Movimiento' : 'Nuevo Movimiento'}</h2>
              <button onClick={closeForm} className="p-3 hover:bg-gray-100 rounded-full transition-colors"><X size={28} /></button>
            </div>
            
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(formData); }} className="space-y-8">
              <div className="flex bg-gray-100 p-2 rounded-[1.25rem] shadow-inner">
                {['ingreso', 'egreso', 'transferencia'].map(t => (
                  <button key={t} type="button" onClick={() => setFormData({...formData, tipo: t, concepto: ''})} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${formData.tipo === t ? 'bg-white shadow-md text-jengibre-dark' : 'text-gray-400 hover:text-gray-600'}`}>{t}</button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Fecha</label>
                  <input type="date" required className="w-full border border-gray-200 rounded-2xl p-4 outline-none focus:ring-4 focus:ring-jengibre-primary/10 font-bold text-gray-700" value={formData.fecha} onChange={e => setFormData({...formData, fecha: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{formData.tipo === 'transferencia' ? 'Desde Cuenta' : 'Cuenta'}</label>
                  <select
                    className="w-full border border-gray-200 rounded-2xl p-4 outline-none bg-white focus:ring-4 focus:ring-jengibre-primary/10 font-bold text-gray-700"
                    value={formData.cuenta}
                    onChange={e => {
                      const newCuenta = e.target.value;
                      const updates: any = { cuenta: newCuenta };
                      if (newCuenta === 'MP Mauro') {
                        updates.moneda = 'ARS';
                      }
                      setFormData({...formData, ...updates});
                    }}
                    required
                  >
                    <option value="">Seleccioná...</option>
                    {cuentasList.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {formData.tipo !== 'transferencia' ? (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Categoría</label>
                  <select className="w-full border border-gray-200 rounded-2xl p-4 outline-none bg-white font-black text-jengibre-dark focus:ring-4 focus:ring-jengibre-primary/10" value={formData.concepto} onChange={e => setFormData({...formData, concepto: e.target.value})} required>
                    <option value="">-- Seleccionar Categoría --</option>
                    {(formData.tipo === 'ingreso' ? CATEGORIAS_INGRESO : CATEGORIAS_EGRESO).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Hacia Cuenta (Destino)</label>
                  <select
                    className="w-full border border-gray-200 rounded-2xl p-4 outline-none bg-white focus:ring-4 focus:ring-jengibre-primary/10 font-bold text-gray-700"
                    value={formData.cuenta_destino}
                    onChange={e => {
                      const newDestino = e.target.value;
                      const updates: any = { cuenta_destino: newDestino };
                      if (newDestino === 'MP Mauro' || formData.cuenta === 'MP Mauro') {
                        updates.moneda = 'ARS';
                      }
                      setFormData({...formData, ...updates});
                    }}
                    required
                  >
                    <option value="">Seleccioná destino...</option>
                    {cuentasList.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Moneda</label>
                  <select
                    className="w-full border border-gray-200 rounded-2xl p-4 outline-none font-black focus:ring-4 focus:ring-jengibre-primary/10 disabled:bg-gray-50 disabled:text-gray-400"
                    value={formData.moneda}
                    onChange={e => setFormData({...formData, moneda: e.target.value})}
                    disabled={formData.cuenta === 'MP Mauro' || (formData.tipo === 'transferencia' && formData.cuenta_destino === 'MP Mauro')}
                  >
                    <option value="ARS">ARS</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Monto</label>
                  <div className="relative group">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 font-black text-xl group-focus-within:text-jengibre-primary transition-colors">$</span>
                    <input type="number" required step="0.01" className="w-full border border-gray-200 rounded-2xl p-4 pl-10 outline-none font-mono text-3xl font-black tracking-tighter focus:ring-4 focus:ring-jengibre-primary/10 text-jengibre-dark" value={formData.monto} onChange={e => setFormData({...formData, monto: e.target.value})} />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Detalle / Notas</label>
                <input placeholder="Ej: Pago honorarios Julio - Juan Perez" className="w-full border border-gray-200 rounded-2xl p-4 outline-none focus:ring-4 focus:ring-jengibre-primary/10 font-medium text-gray-700" value={formData.notasTexto} onChange={e => setFormData({...formData, notasTexto: e.target.value})} />
              </div>

              <div className="flex justify-end gap-4 mt-12 pt-8 border-t border-gray-100">
                <button type="button" onClick={closeForm} className="px-8 py-4 text-gray-400 font-black uppercase tracking-widest text-[10px] hover:bg-gray-50 rounded-2xl transition-colors">Cancelar</button>
                <button type="submit" disabled={saveMutation.isPending} className="bg-jengibre-primary text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-jengibre-primary/20 active:scale-95 transition-all disabled:opacity-50">
                  {saveMutation.isPending ? 'Guardando...' : 'Guardar Movimiento'}
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
                  <th className="px-8 py-6">Fecha</th>
                  <th className="px-8 py-6">Categoría / Detalle</th>
                  <th className="px-8 py-6">Cuenta</th>
                  <th className="px-8 py-6 text-right">Monto</th>
                  <th className="px-8 py-6 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredMovimientos?.map((mov) => {
                  const isIngreso = mov.tipo === 'ingreso';
                  const isTransfer = mov.tipo === 'transferencia';
                  const notas = parseNotas(mov.notas);
                  const isUSD = notas.moneda === 'USD';
                  return (
                    <tr key={mov.id} className="border-b border-gray-50 hover:bg-gray-50/80 transition-colors group">
                      <td className="px-8 py-6">
                        <p className="text-sm font-black text-gray-900 uppercase tracking-tighter">{formatLocalDate(mov.fecha, { day: '2-digit', month: 'short' })}</p>
                        <p className="text-[10px] text-gray-400 font-bold mt-1">{mov.fecha ? mov.fecha.substring(0, 4) : '-'}</p>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-5">
                          <div className={`p-3 rounded-2xl shadow-sm ${isIngreso ? 'bg-emerald-50 text-emerald-600' : isTransfer ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>
                            {isIngreso ? <ArrowDownRight size={24} /> : isTransfer ? <RefreshCw size={24} /> : <ArrowUpRight size={24} />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-black text-gray-900 text-sm uppercase tracking-tight truncate">{isTransfer ? 'Transferencia Interna' : mov.concepto}</p>
                            {notas.texto && <p className="text-xs text-gray-400 font-bold mt-1 truncate max-w-[250px]">{notas.texto}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-3">
                          <span className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm">{mov.cuenta}</span>
                          {isTransfer && (
                            <>
                              <ArrowRight size={14} className="text-gray-300" />
                              <span className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm">{mov.cuenta_destino}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className={`px-8 py-6 text-right font-mono font-black text-xl tracking-tighter ${isIngreso ? 'text-emerald-600' : isTransfer ? 'text-blue-600' : 'text-jengibre-dark'}`}>
                        <div className="flex flex-col items-end">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs opacity-40">{isIngreso ? '+' : isTransfer ? '⇄' : '-'}</span>
                            {isUSD ? formatUSD(mov.monto) : formatARS(mov.monto)}
                          </div>
                          {isUSD && (
                            <span className="text-[9px] text-gray-400 uppercase tracking-widest font-bold mt-1">Equivalente en USD</span>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                          <button onClick={() => openEdit(mov)} className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all shadow-sm hover:shadow-md"><Edit2 size={18} /></button>
                          <button onClick={() => { if(confirm('¿Eliminar este movimiento?')) deleteMutation.mutate(mov.id); }} className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all shadow-sm hover:shadow-md"><Trash2 size={18} /></button>
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
