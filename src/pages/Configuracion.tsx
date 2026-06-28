import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Trash2, Wallet, Settings, Lock, KeyRound, Landmark, Edit2, Check, X, Loader2 } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import { formatARS } from '@/lib/utils';

const DEFAULT_CUENTAS = ['MP Vir', 'MP Mauro', 'MP Fondo', 'USD'];

export default function Configuracion() {
  const queryClient = useQueryClient();
  
  const [newCuenta, setNewCuenta] = useState('');
  const [cuentas, setCuentas] = useState<string[]>([]);
  const [saldosIniciales, setSaldosIniciales] = useState<Record<string, number>>({});
  
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const { data: configCuentas, isLoading: loadingCuentas } = useQuery({
    queryKey: ['configuracion', 'cuentas_caja'],
    queryFn: async () => {
      const { data, error } = await supabase.from('configuracion').select('*').eq('clave', 'cuentas_caja').maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    }
  });

  const { data: configSaldos, isLoading: loadingSaldos } = useQuery({
    queryKey: ['configuracion', 'saldos_iniciales'],
    queryFn: async () => {
      const { data } = await supabase.from('configuracion').select('*').eq('clave', 'saldos_iniciales').maybeSingle();
      return data;
    }
  });

  useEffect(() => {
    if (configCuentas?.valor) {
      try {
        let list = JSON.parse(configCuentas.valor);
        setCuentas(list);
      } catch { setCuentas(DEFAULT_CUENTAS); }
    } else if (!loadingCuentas) {
      setCuentas(DEFAULT_CUENTAS);
    }
  }, [configCuentas, loadingCuentas]);

  useEffect(() => {
    if (configSaldos?.valor) {
      try {
        let saldos = JSON.parse(configSaldos.valor);
        setSaldosIniciales(saldos);
      } catch { setSaldosIniciales({}); }
    }
  }, [configSaldos]);

  const saveConfigMutation = useMutation({
    mutationFn: async ({ clave, valor, desc }: { clave: string, valor: any, desc: string }) => {
      const payload = { clave, valor: JSON.stringify(valor), descripcion: desc };
      const { data: existing } = await supabase.from('configuracion').select('id').eq('clave', clave).maybeSingle();
      
      if (existing?.id) {
        const { error } = await supabase.from('configuracion').update(payload).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('configuracion').insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['configuracion', variables.clave] });
    },
    onError: (err: any) => showError(err.message)
  });

  const handleAddCuenta = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCuenta.trim() || cuentas.includes(newCuenta.trim())) return;
    const updated = [...cuentas, newCuenta.trim()];
    setCuentas(updated);
    saveConfigMutation.mutate({ clave: 'cuentas_caja', valor: updated, desc: 'Lista de cuentas' });
    setNewCuenta('');
    showSuccess('Cuenta añadida');
  };

  const handleRenameCuenta = (index: number) => {
    const oldName = cuentas[index];
    const newName = editingValue.trim();
    if (!newName || oldName === newName) { setEditingIndex(null); return; }
    if (cuentas.includes(newName)) { showError('Ya existe una cuenta con ese nombre'); return; }

    const updatedCuentas = [...cuentas];
    updatedCuentas[index] = newName;
    setCuentas(updatedCuentas);
    saveConfigMutation.mutate({ clave: 'cuentas_caja', valor: updatedCuentas, desc: 'Lista de cuentas' });

    const updatedSaldos = { ...saldosIniciales };
    if (updatedSaldos[oldName] !== undefined) {
      updatedSaldos[newName] = updatedSaldos[oldName];
      delete updatedSaldos[oldName];
      setSaldosIniciales(updatedSaldos);
      saveConfigMutation.mutate({ clave: 'saldos_iniciales', valor: updatedSaldos, desc: 'Saldos de apertura' });
    }
    setEditingIndex(null);
    showSuccess('Cuenta renombrada');
  };

  const handleUpdateSaldo = (cuenta: string, valor: string) => {
    const newSaldos = { ...saldosIniciales, [cuenta]: Number(valor) };
    setSaldosIniciales(newSaldos);
  };

  const saveSaldos = () => {
    saveConfigMutation.mutate({ clave: 'saldos_iniciales', valor: saldosIniciales, desc: 'Saldos de apertura' });
    showSuccess('Saldos iniciales guardados');
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) return showError('Mínimo 6 caracteres');
    setIsUpdatingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setIsUpdatingPassword(false);
    if (error) showError(error.message);
    else { showSuccess('Contraseña actualizada'); setNewPassword(''); }
  };

  return (
    <div className="animate-in fade-in duration-700 pb-20 max-w-4xl mx-auto">
      <header className="mb-12">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">Configuración</h1>
        <p className="text-slate-500 mt-1 font-medium">Ajustes del sistema y seguridad.</p>
      </header>

      <div className="space-y-10">
        <section className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2.5 rounded-2xl bg-slate-50 text-slate-400"><Landmark size={20} /></div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">Saldos de Apertura</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
            {cuentas.map(cuenta => (
              <div key={cuenta} className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">{cuenta}</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
                  <input type="number" className="w-full border border-slate-200 rounded-xl p-3.5 pl-8 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-900 text-lg tracking-tight" value={saldosIniciales[cuenta] || 0} onChange={(e) => handleUpdateSaldo(cuenta, e.target.value)} />
                </div>
              </div>
            ))}
          </div>
          <button onClick={saveSaldos} className="bg-slate-900 text-white px-8 py-4 rounded-xl font-bold uppercase tracking-widest text-[10px] shadow-lg shadow-slate-900/10 active:scale-95 transition-all">
            Guardar Saldos Iniciales
          </button>
        </section>

        <section className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2.5 rounded-2xl bg-slate-50 text-slate-400"><Wallet size={20} /></div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">Cuentas y Billeteras</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {cuentas.map((cuenta, index) => (
              <div key={cuenta} className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-100 group">
                {editingIndex === index ? (
                  <div className="flex items-center gap-2 w-full">
                    <input autoFocus className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold outline-none" value={editingValue} onChange={(e) => setEditingValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRenameCuenta(index)} />
                    <button onClick={() => handleRenameCuenta(index)} className="text-emerald-600 p-1.5 hover:bg-emerald-50 rounded-lg"><Check size={16}/></button>
                    <button onClick={() => setEditingIndex(null)} className="text-rose-600 p-1.5 hover:bg-rose-50 rounded-lg"><X size={16}/></button>
                  </div>
                ) : (
                  <>
                    <span className="text-sm font-bold text-slate-700">{cuenta}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={() => { setEditingIndex(index); setEditingValue(cuenta); }} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={14} /></button>
                      <button onClick={() => { const updated = cuentas.filter(c => c !== cuenta); setCuentas(updated); saveConfigMutation.mutate({ clave: 'cuentas_caja', valor: updated, desc: 'Lista de cuentas' }); }} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size={14} /></button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          <form onSubmit={handleAddCuenta} className="flex gap-3 pt-8 border-t border-slate-100">
            <input type="text" placeholder="Nueva cuenta..." className="flex-1 border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-700 text-sm" value={newCuenta} onChange={e => setNewCuenta(e.target.value)} />
            <button type="submit" className="bg-slate-900 text-white px-6 py-3.5 rounded-xl font-bold"><Plus size={20} /></button>
          </form>
        </section>

        <section className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2.5 rounded-2xl bg-slate-50 text-slate-400"><Lock size={20} /></div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">Seguridad</h2>
          </div>
          <form onSubmit={handleUpdatePassword} className="flex flex-col sm:flex-row gap-4 max-w-md">
            <div className="relative flex-1">
              <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input type="password" placeholder="Nueva contraseña" className="w-full border border-slate-200 rounded-xl p-3.5 pl-12 outline-none focus:ring-2 focus:ring-slate-100 font-bold text-slate-700 text-sm" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            </div>
            <button type="submit" disabled={isUpdatingPassword} className="bg-slate-900 text-white px-8 py-3.5 rounded-xl font-bold uppercase tracking-widest text-[10px] shadow-lg shadow-slate-900/10 active:scale-95 transition-all disabled:opacity-50">
              {isUpdatingPassword ? 'Actualizando...' : 'Actualizar'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
