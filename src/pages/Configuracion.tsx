import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Trash2, Wallet, Settings } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';

const DEFAULT_CUENTAS = ['Macro', 'IVA', 'MP Mauro', 'MP Fondo', 'Efectivo'];

export default function Configuracion() {
  const queryClient = useQueryClient();
  const [newCuenta, setNewCuenta] = useState('');
  const [cuentas, setCuentas] = useState<string[]>([]);

  // Traer las cuentas desde la tabla configuracion
  const { data: configCuentas, isLoading } = useQuery({
    queryKey: ['configuracion', 'cuentas_caja'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('configuracion')
        .select('*')
        .eq('clave', 'cuentas_caja')
        .maybeSingle();
      if (error) throw error;
      return data;
    }
  });

  // Inicializar estado local cuando llega la data
  useEffect(() => {
    if (configCuentas && configCuentas.valor) {
      try {
        setCuentas(JSON.parse(configCuentas.valor));
      } catch {
        setCuentas(DEFAULT_CUENTAS);
      }
    } else if (!isLoading) {
      setCuentas(DEFAULT_CUENTAS);
    }
  }, [configCuentas, isLoading]);

  const saveMutation = useMutation({
    mutationFn: async (updatedCuentas: string[]) => {
      const payload = { 
        clave: 'cuentas_caja', 
        valor: JSON.stringify(updatedCuentas), 
        descripcion: 'Lista de cuentas/billeteras para la caja' 
      };
      
      if (configCuentas?.id) {
        const { error } = await supabase.from('configuracion').update(payload).eq('id', configCuentas.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('configuracion').insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuracion', 'cuentas_caja'] });
      queryClient.invalidateQueries({ queryKey: ['cuentas_activas'] }); // Para actualizar Caja
      showSuccess('Cuentas actualizadas correctamente');
    },
    onError: (err: any) => showError(err.message)
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCuenta.trim()) return;
    if (cuentas.includes(newCuenta.trim())) return showError('Esa cuenta ya existe');
    
    const updated = [...cuentas, newCuenta.trim()];
    setCuentas(updated);
    saveMutation.mutate(updated);
    setNewCuenta('');
  };

  const handleRemove = (cuenta: string) => {
    if (cuentas.length === 1) return showError('Debe quedar al menos una cuenta en el sistema');
    const updated = cuentas.filter(c => c !== cuenta);
    setCuentas(updated);
    saveMutation.mutate(updated);
  };

  return (
    <div className="animate-in fade-in duration-500 pb-12 max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-display font-bold text-jengibre-dark flex items-center gap-3">
          <Settings className="text-jengibre-primary" size={32} />
          Configuración
        </h1>
        <p className="text-gray-600 mt-1">Administrá las opciones generales del sistema Jengibre.</p>
      </header>

      <section className="bg-white border border-jengibre-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
          <div className="bg-jengibre-cream p-3 rounded-xl text-jengibre-primary">
            <Wallet size={24} />
          </div>
          <div>
            <h2 className="text-xl font-display font-bold text-gray-800">Cuentas y Billeteras</h2>
            <p className="text-sm text-gray-500">Definí las cuentas disponibles para registrar ingresos y egresos en la pestaña Caja.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-gray-400">Cargando configuración...</div>
        ) : (
          <div className="space-y-6">
            <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {cuentas.map(cuenta => (
                <li key={cuenta} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg p-3 group hover:border-jengibre-primary/30 transition-colors">
                  <span className="font-medium text-gray-800">{cuenta}</span>
                  <button 
                    onClick={() => handleRemove(cuenta)} 
                    className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-md transition-colors opacity-0 group-hover:opacity-100" 
                    title="Eliminar cuenta"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>

            <form onSubmit={handleAdd} className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-gray-100">
              <input
                type="text"
                placeholder="Nueva cuenta (ej: Banco Galicia, USD, etc.)"
                className="flex-1 w-full border border-gray-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-jengibre-primary"
                value={newCuenta}
                onChange={e => setNewCuenta(e.target.value)}
              />
              <button 
                type="submit" 
                disabled={saveMutation.isPending || !newCuenta.trim()} 
                className="w-full sm:w-auto bg-jengibre-primary hover:bg-[#a64120] text-white px-6 py-3 rounded-lg font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Plus size={20} /> Agregar Cuenta
              </button>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}