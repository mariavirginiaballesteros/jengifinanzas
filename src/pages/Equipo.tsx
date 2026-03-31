import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TipAlert } from '@/components/TipAlert';
import { Plus, Edit2, Trash2, Users, Award, Building, MessageCircle } from 'lucide-react';
import { formatARS } from '@/lib/utils';
import { showSuccess, showError } from '@/utils/toast';

// Helper para parsear las notas guardadas como JSON de forma segura
const parseNotas = (notasStr: string | null) => {
  if (!notasStr) return { texto: '', telefono: '', asignaciones: {} as Record<string, number> };
  try {
    const parsed = JSON.parse(notasStr);
    if (parsed && typeof parsed === 'object' && parsed.asignaciones) {
      return { 
        texto: parsed.texto || '', 
        telefono: parsed.telefono || '',
        asignaciones: parsed.asignaciones 
      };
    }
  } catch (e) {
    // Si no es JSON, es una nota de texto antigua
  }
  return { texto: notasStr, telefono: '', asignaciones: {} };
};

export default function Equipo() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Estado para el modal de Bono de Renovación
  const [bonusModalOpen, setBonusModalOpen] = useState<{miembro: any, isOpen: boolean}>({ miembro: null, isOpen: false });
  const [selectedBonusProject, setSelectedBonusProject] = useState<string>('');
  const [incluirBono, setIncluirBono] = useState(true);
  
  const defaultForm = {
    nombre: '', rol: '', honorario_mensual: 0,
    condicion_fiscal: 'Monotributo', genera_credito_fiscal: false, activo: true,
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
      // Empaquetamos las asignaciones y el teléfono en el campo notas como JSON
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
        genera_credito_fiscal: miembroData.genera_credito_fiscal,
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
      genera_credito_fiscal: miembro.genera_credito_fiscal || false,
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

  // Función unificada para enviar liquidación por WhatsApp
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
    
    if (Number(miembro.honorario_mensual) > 0) {
      msg += `*Sueldo Base:* ${formatARS(miembro.honorario_mensual)}%0A`;
    }
    if (proyectosActivosCount > 0) {
      msg += `*Asignación por prestación de servicio (${proyectosActivosCount} proyectos activos):* ${formatARS(honorarioProyectos)}%0A`;
    }
    if (bonoExtra > 0) {
      msg += `*Bono Incentivo (15% por renovación en ${nombreProyectoBono}):* ${formatARS(bonoExtra)}%0A`;
    }
    
    msg += `%0A*TOTAL A FACTURAR:* ${formatARS(total)}%0A%0A`;
    msg += `Por favor, cuando puedas generá la factura correspondiente por este monto para que podamos avanzar con el pago. ¡Gracias!`;
    
    const url = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(url, '_blank');
  };

  const isLoading = loadingEquipo || loadingClientes;

  return (
    <div className="animate-in fade-in duration-500 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-jengibre-dark">Equipo de Trabajo</h1>
          <p className="text-gray-600 mt-1">Administrá las retribuciones por proyecto y bonos de renovación.</p>
        </div>
        <button 
          onClick={() => setIsFormOpen(true)}
          className="bg-jengibre-primary hover:bg-[#a64120] text-white px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all shadow-sm"
        >
          <Plus size={20} /> Nuevo Miembro
        </button>
      </header>

      <TipAlert id="equipo_proyectos" title="💡 Remuneración y Liquidaciones">
        Calculá automáticamente el total a pagar según los proyectos activos y enviá el detalle de facturación al equipo por WhatsApp con un solo clic.
      </TipAlert>

      {/* MODAL CREAR / EDITAR */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-display font-bold mb-6">
              {editingId ? 'Editar Miembro del Equipo' : 'Nuevo Miembro del Equipo'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* DATOS BÁSICOS */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-4">
                <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider">Datos Principales</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
                    <input required autoFocus className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Rol / Puesto</label>
                    <input className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white" value={formData.rol} onChange={e => setFormData({...formData, rol: e.target.value})} placeholder="Ej: Visual, PM..." />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp / Teléfono</label>
                    <input className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white" value={formData.telefono} onChange={e => setFormData({...formData, telefono: e.target.value})} placeholder="+54 9..." />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Sueldo Base Fijo (ARS)</label>
                    <input type="number" className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white font-mono" value={formData.honorario_mensual || ''} onChange={e => setFormData({...formData, honorario_mensual: Number(e.target.value)})} placeholder="0" />
                    <p className="text-xs text-gray-500 mt-1">Sueldo asegurado sin depender de proyectos.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Estado en la agencia</label>
                    <select className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white" value={formData.activo ? 'true' : 'false'} onChange={e => setFormData({...formData, activo: e.target.value === 'true'})}>
                      <option value="true">Activo</option>
                      <option value="false">Inactivo</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* MATRIZ DE PROYECTOS */}
              <div className="bg-jengibre-cream/30 p-4 rounded-xl border border-jengibre-border space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-jengibre-dark text-sm uppercase tracking-wider flex items-center gap-2">
                    <Building size={16} /> Retribución por Proyecto
                  </h3>
                </div>
                <p className="text-xs text-gray-600 mb-2">Ingresá el monto que esta persona cobra específicamente por cada cliente. <strong>Solo se sumarán los contratos activos.</strong></p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto p-1">
                  {clientes?.map(c => (
                    <div key={c.id} className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-gray-200">
                      <div className="flex flex-col truncate pr-2">
                        <span className="font-medium text-sm text-gray-800 truncate" title={c.nombre}>{c.nombre}</span>
                        {c.estado !== 'activo' && <span className="text-[10px] text-red-500 font-bold uppercase">Pausado/Inactivo</span>}
                      </div>
                      <div className="relative w-32 shrink-0">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <input 
                          type="number" min="0" step="1000"
                          className="w-full border border-gray-200 rounded p-1.5 pl-7 text-right text-sm font-mono focus:border-jengibre-primary outline-none"
                          value={formData.asignaciones[c.id] || ''} 
                          onChange={e => setAsignacion(c.id, e.target.value)}
                          placeholder="0"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* FISCALIDAD */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Condición Fiscal</label>
                  <select className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white" value={formData.condicion_fiscal} onChange={e => setFormData({...formData, condicion_fiscal: e.target.value})}>
                    <option value="Monotributo">Monotributo (Factura C)</option>
                    <option value="Responsable Inscripto">Responsable Inscripto (Factura A)</option>
                    <option value="Informal">Informal (Sin factura)</option>
                  </select>
                </div>
                <div className="flex items-center pt-6">
                  <input type="checkbox" id="iva" className="w-5 h-5 rounded border-gray-300 text-jengibre-primary focus:ring-jengibre-primary mr-2" checked={formData.genera_credito_fiscal} onChange={e => setFormData({...formData, genera_credito_fiscal: e.target.checked})} />
                  <label htmlFor="iva" className="text-sm text-gray-700 font-medium cursor-pointer select-none">Genera Crédito Fiscal de IVA</label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas internas (Opcional)</label>
                <textarea className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white" rows={2} value={formData.notasTexto} onChange={e => setFormData({...formData, notasTexto: e.target.value})} />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button type="button" onClick={closeForm} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors">Cancelar</button>
                <button type="submit" disabled={saveMutation.isPending} className="bg-jengibre-primary hover:bg-[#a64120] text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50">
                  {saveMutation.isPending ? 'Guardando...' : 'Guardar Configuración'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL BONO RENOVACIÓN */}
      {bonusModalOpen.isOpen && bonusModalOpen.miembro && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl animate-in zoom-in-95">
            <div className="flex items-center gap-3 mb-4 text-jengibre-amber">
              <Award size={28} />
              <h2 className="text-xl font-display font-bold text-gray-900">Calculadora de Bono</h2>
            </div>
            
            <p className="text-sm text-gray-600 mb-4">
              Calculá el <strong>15% de incentivo</strong> para <strong>{bonusModalOpen.miembro.nombre}</strong> por la renovación de un contrato.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Seleccionar Proyecto Renovado</label>
                <select 
                  className="w-full border border-gray-300 rounded-lg p-2.5 outline-none bg-white"
                  value={selectedBonusProject}
                  onChange={e => setSelectedBonusProject(e.target.value)}
                >
                  <option value="">-- Elegí un proyecto asignado --</option>
                  {Object.entries(parseNotas(bonusModalOpen.miembro.notas).asignaciones).map(([cId, monto]) => {
                    const c = clientes?.find((cl: any) => cl.id === cId);
                    if (!c) return null;
                    return <option key={cId} value={cId}>{c.nombre} (Cobra {formatARS(Number(monto))})</option>;
                  })}
                </select>
              </div>

              {selectedBonusProject && (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-center">
                  <p className="text-xs text-amber-700 font-bold uppercase tracking-wider mb-1">Monto del Bono (15%)</p>
                  <p className="text-3xl font-mono font-bold text-amber-600">
                    {formatARS(Number(parseNotas(bonusModalOpen.miembro.notas).asignaciones[selectedBonusProject]) * 0.15)}
                  </p>
                  
                  <div className="mt-4 pt-4 border-t border-amber-200/50 flex items-center justify-center gap-2">
                    <input 
                      type="checkbox" id="addBonus" 
                      className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500" 
                      checked={incluirBono} onChange={e => setIncluirBono(e.target.checked)}
                    />
                    <label htmlFor="addBonus" className="text-sm text-amber-800 font-medium cursor-pointer">
                      Sumar al pago de este mes
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 mt-6">
              <button 
                onClick={() => {
                  const bonoExtra = incluirBono && selectedBonusProject ? Number(parseNotas(bonusModalOpen.miembro.notas).asignaciones[selectedBonusProject]) * 0.15 : 0;
                  const c = clientes?.find((cl: any) => cl.id === selectedBonusProject);
                  handleWhatsApp(bonusModalOpen.miembro, bonoExtra, c?.nombre || '');
                  setBonusModalOpen({miembro: null, isOpen: false});
                  setSelectedBonusProject('');
                }} 
                disabled={!selectedBonusProject}
                className="w-full bg-[#25D366] hover:bg-[#1ebd5c] text-white py-2.5 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <MessageCircle size={18} /> Enviar Liquidación con Bono
              </button>
              <button 
                onClick={() => {setBonusModalOpen({miembro: null, isOpen: false}); setSelectedBonusProject('');}} 
                className="px-4 py-2 w-full text-gray-500 hover:bg-gray-100 rounded-lg font-medium transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TABLA DE EQUIPO */}
      <div className="bg-white border border-jengibre-border rounded-2xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-jengibre-primary border-t-transparent rounded-full animate-spin"></div></div>
        ) : equipo?.length === 0 ? (
          <div className="p-12 text-center">
            <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400"><Users size={32} /></div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Tu equipo está vacío</h3>
            <button onClick={() => setIsFormOpen(true)} className="text-jengibre-primary font-bold hover:underline">+ Agregar miembro</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-jengibre-cream/50 text-jengibre-dark text-sm border-b border-jengibre-border">
                  <th className="px-4 py-3 font-bold">Nombre</th>
                  <th className="px-4 py-3 font-bold">Rol</th>
                  <th className="px-4 py-3 font-bold text-center">Proyectos Activos</th>
                  <th className="px-4 py-3 font-bold text-right text-jengibre-primary">Honorario Total a Pagar</th>
                  <th className="px-4 py-3 font-bold">Condición Fiscal</th>
                  <th className="px-4 py-3 font-bold text-center">Estado</th>
                  <th className="px-4 py-3 font-bold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {equipo?.map((miembro) => {
                  const notasData = parseNotas(miembro.notas);
                  
                  // Calcular montos cruzando con clientes activos
                  let proyectosActivosCount = 0;
                  const honorarioProyectos = Object.entries(notasData.asignaciones).reduce((acc, [cId, monto]) => {
                    const c = clientes?.find((cl: any) => cl.id === cId);
                    if (c && c.estado === 'activo') {
                      proyectosActivosCount++;
                      return acc + Number(monto);
                    }
                    return acc;
                  }, 0);
                  
                  const honorarioTotal = Number(miembro.honorario_mensual) + honorarioProyectos;
                  const hasProjects = Object.keys(notasData.asignaciones).length > 0;

                  return (
                    <tr key={miembro.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors group">
                      <td className="px-4 py-4 font-bold text-gray-900">
                        {miembro.nombre}
                        {notasData.telefono && <p className="text-xs text-gray-400 font-normal">{notasData.telefono}</p>}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">{miembro.rol || '-'}</td>
                      
                      <td className="px-4 py-4 text-center">
                        {proyectosActivosCount > 0 ? (
                          <span className="bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-md text-xs font-bold">
                            {proyectosActivosCount} asignados
                          </span>
                        ) : <span className="text-gray-400 text-sm">-</span>}
                      </td>
                      
                      <td className="px-4 py-4 text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-mono font-bold text-lg text-gray-900">{formatARS(honorarioTotal)}</span>
                          <span className="text-[10px] text-gray-400 uppercase tracking-wider">
                            Base: {formatARS(miembro.honorario_mensual)} + Proy: {formatARS(honorarioProyectos)}
                          </span>
                        </div>
                      </td>
                      
                      <td className="px-4 py-4 text-sm text-gray-600">
                        <span className="bg-gray-100 px-2 py-1 rounded">{miembro.condicion_fiscal}</span>
                        {miembro.genera_credito_fiscal && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold uppercase">+ IVA</span>}
                      </td>
                      
                      <td className="px-4 py-4 text-center">
                        <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase ${miembro.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {miembro.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          
                          <button 
                            onClick={() => handleWhatsApp(miembro, 0, '')} 
                            className="p-1.5 text-[#25D366] hover:bg-[#25D366]/10 rounded-lg"
                            title="Enviar liquidación mensual por WhatsApp"
                          >
                            <MessageCircle size={18} />
                          </button>

                          {hasProjects && (
                            <button 
                              onClick={() => { setBonusModalOpen({miembro, isOpen: true}); setSelectedBonusProject(''); setIncluirBono(true); }} 
                              className="p-1.5 text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-100 flex items-center gap-1 px-2"
                              title="Calcular bono 15% por renovación"
                            >
                              <Award size={14} /> <span className="text-xs font-bold">Bono</span>
                            </button>
                          )}
                          <div className="w-px h-4 bg-gray-200 mx-1"></div>
                          <button onClick={() => openEdit(miembro)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Editar configuraciones"><Edit2 size={16} /></button>
                          <button onClick={() => { if(confirm('¿Eliminar miembro?')) deleteMutation.mutate(miembro.id); }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Eliminar"><Trash2 size={16} /></button>
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