import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Trash2, Wallet, Settings, Lock, KeyRound, Landmark } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import { formatARS } from '@/lib/utils';

const DEFAULT_CUENTAS = ['Macro', 'IVA', 'MP Mauro', 'MP Fondo', 'Efectivo'];

export default function Configuracion() {
  const queryClient = useQueryClient();
  
  const [newCuenta, setNewCuenta] = useState('');
  const [cuentas, setCuentas] = useState<string[]>([]);
  const [saldosIniciales, setSaldosIniciales] = useState<Record<string, number>>({});

  const [newPassword, setNewPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Traer configuración de cuentas
  const { data: configCuentas, isLoading: loadingCuentas } = useQuery({
    queryKey: ['configuracion', 'cuentas_caja'],
    queryFn: async () => {
      const { data, error } = await supabase.from('configuracion').select('*').eq('clave', 'cuentas_caja').maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    }
  });

  // Traer saldos iniciales
  const { data: configSaldos, isLoading: loadingSaldos } = useQuery({
    queryKey: ['configuracion', 'saldos_iniciales'],
    queryFn: async () => {
      const { data, error } = await supabase.from('configuracion').select('*').eq('clave', 'saldos_iniciales').maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    }
  });

  useEffect(() => {
    if (configCuentas?.valor) {
      try { setCuentas(JSON.parse(configCuentas.valor)); } catch { setCuentas(DEFAULT_CUENTAS); }
    } else if (!loadingCuentas) {
      setCuentas(DEFAULT_CUENTAS);
    }
  }, [configCuentas, loadingCuentas]);

  useEffect(() => {
    if (configSaldos?.valor) {
      try { setSaldosIniciales(JSON.parse(configSaldos.valor)); } catch { setSaldosIniciales({}); }
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
      queryClient.invalidateQueries({ queryKey: ['movimientos'] });
      showSuccess('Configuración guardada');
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
  };

  const handleUpdateSaldo = (cuenta: string, valor: string) => {
    const newSaldos = { ...saldosIniciales, [cuenta]: Number(valor) };
    setSaldosIniciales(newSaldos);
  };

  const saveSaldos = () => {
    saveConfigMutation.mutate({ clave: 'saldos_iniciales', valor: saldosIniciales, desc: 'Saldos de apertura de cada cuenta' });
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
    <div className="animate-in fade-in duration-500 pb-12 max-w-4xl mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-display font-bold text-jengibre-dark flex items-center gap-3">
          <Settings className="text-jengibre-primary" size={32} /> Configuración
        </h1>
      </header>

      {/* SALDOS DE APERTURA */}
      <section className="bg-white border border-jengibre-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
          <div className="bg-jengibre-green/10 p-3 rounded-xl text-jengibre-green"><Landmark size={24} /></div>
          <div>
            <h2 className="text-xl font-display font-bold text-gray-800">Saldos de Apertura</h2>
            <p className="text-sm text-gray-500">Ingresá el saldo real que tenés hoy en cada cuenta para que el sistema coincida con tu banco.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {cuentas.map(cuenta => (
            <div key={cuenta} className="flex flex-col gap-1">
              <label className="text-xs font-bold text-gray-500 uppercase">{cuenta}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                <input 
                  type="number" 
                  className="w-full border border-gray-300 rounded-lg p-2.5 pl-8 outline-none focus:ring-2 focus:ring-jengibre-green font-mono"
                  value={saldosIniciales[cuenta] || 0}
                  onChange={(e) => handleUpdateSaldo(cuenta, e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>
        <button onClick={saveSaldos} className="bg-jengibre-green hover:bg-green-700 text-white px-6 py-2.5 rounded-lg font-bold transition-colors">
          Guardar Saldos Iniciales
        </button>
      </section>

      {/* CUENTAS */}
      <section className="bg-white border border-jengibre-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
          <div className="bg-jengibre-cream p-3 rounded-xl text-jengibre-primary"><Wallet size={24} /></div>
          <h2 className="text-xl font-display font-bold text-gray-800">Cuentas y Billeteras</h2>
        </div>
        <div className="space-y-6">
          <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {cuentas.map(cuenta => (
              <li key={cuenta} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg p-3 group">
                <span className="font-medium text-gray-800">{cuenta}</span>
                <button onClick={() => {
                  const updated = cuentas.filter(c => c !== cuenta);
                  setCuentas(updated);
                  saveConfigMutation.mutate({ clave: 'cuentas_caja', valor: updated, desc: 'Lista de cuentas' });
                }} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
          <form onSubmit={handleAddCuenta} className="flex gap-3 pt-4 border-t border-gray-100">
            <input type="text" placeholder="Nueva cuenta..." className="flex-1 border border-gray-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-jengibre-primary" value={newCuenta} onChange={e => setNewCuenta(e.target.value)} />
            <button type="submit" className="bg-jengibre-primary text-white px-6 py-3 rounded-lg font-bold"><Plus size={20} /></button>
          </form>
        </div>
      </section>

      {/* SEGURIDAD */}
      <section className="bg-white border border-jengibre-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
          <div className="bg-jengibre-primary/10 p-3 rounded-xl text-jengibre-primary"><Lock size={24} /></div>
          <h2 className="text-xl font-display font-bold text-gray-800">Seguridad</h2>
        </div>
        <form onSubmit={handleUpdatePassword} className="max-w-md flex gap-3">
          <div className="relative flex-1">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input type="password" placeholder="Nueva contraseña" className="w-full border border-gray-300 rounded-lg p-2.5 pl-10 outline-none focus:ring-2 focus:ring-jengibre-primary" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
          </div>
          <button type="submit" className="bg-jengibre-dark text-white px-5 py-2.5 rounded-lg font-bold">Actualizar</button>
        </form>
      </section>
    </div>
  );
}