import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TipAlert } from '@/components/TipAlert';
import { Plus, Edit2, Trash2, MessageCircle, Save } from 'lucide-react';
import { formatARS } from '@/lib/utils';
import { showSuccess, showError } from '@/utils/toast';

export default function Facturacion() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  
  // Modal de agregar fila manual
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [manualForm, setManualForm] = useState<any>({
    cliente_id: '', cuota: '', mes: new Date().toISOString().split('T')[0], 
    monto_base: '', porcentaje_inflacion: 0, responsable_afip: '', cuit_responsable: '', descripcion: ''
  });

  const { data: facturas, isLoading } = useQuery({
    queryKey: ['facturacion'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facturacion')
        .select(`*, cliente:clientes(nombre, cuit)`)
        .order('mes', { ascending: true });
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

  const updateEstadoMutation = useMutation({
    mutationFn: async ({ id, estado }: { id: string, estado: string }) => {
      const { error } = await supabase.from('facturacion').update({ estado }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['facturacion'] }),
    onError: (err: any) => showError(err.message)
  });

  const saveRowMutation = useMutation({
    mutationFn: async (payload: any) => {
      // Calculamos el monto final en base a la inflación si estamos editando
      const inflacion = Number(payload.porcentaje_inflacion) || 0;
      const base = Number(payload.monto_base) || 0;
      const final = base * (1 + (inflacion / 100));
      
      const dataToSave = { ...payload, monto_final: final };

      if (editingId) {
        const { error } = await supabase.from('facturacion').update(dataToSave).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('facturacion').insert([dataToSave]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facturacion'] });
      showSuccess('Guardado correctamente');
      setEditingId(null);
      setIsFormOpen(false);
    },
    onError: (err: any) => showError(err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('facturacion').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facturacion'] });
      showSuccess('Fila eliminada');
    }
  });

  const handleSolicitarFactura = (row: any) => {
    const mesNombre = new Date(row.mes).toLocaleDateString('es-AR', { month: 'long', timeZone: 'UTC' });
    const texto = `Hola! Solicito la emisión de factura:
    
*Proyecto:* ${row.cliente?.nombre || 'Particular'}
*CUIT Empresa:* ${row.cuit_responsable || row.cliente?.cuit || 'No especificado'}
*Cuota:* ${row.cuota}
*Mes:* ${mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1)}
*Monto final a facturar:* ${formatARS(row.monto_final || row.monto_base)}
*Responsable AFIP:* ${row.responsable_afip || 'No especificado'}
*Descripción:* ${row.descripcion || '-'}
`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
  };

  const startEditing = (row: any) => {
    setEditingId(row.id);
    setEditData({
      monto_base: row.monto_base,
      porcentaje_inflacion: row.porcentaje_inflacion || 0,
      responsable_afip: row.responsable_afip || '',
      cuit_responsable: row.cuit_responsable || '',
      descripcion: row.descripcion || ''
    });
  };

  const saveEditing = () => {
    saveRowMutation.mutate({ id: editingId, ...editData });
  };

  return (
    <div className="animate-in fade-in duration-500 pb-12 w-full">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-jengibre-dark">Cronograma de Facturación</h1>
          <p className="text-gray-600 mt-1">Control mensual de emisión de facturas y cobranzas.</p>
        </div>
        <button 
          onClick={() => { setManualForm({...manualForm, mes: new Date().toISOString().split('T')[0]}); setIsFormOpen(true); }}
          className="bg-jengibre-primary hover:bg-[#a64120] text-white px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 shadow-sm"
        >
          <Plus size={20} /> Fila Manual
        </button>
      </header>

      <TipAlert id="facturacion_excel" title="💡 Como en Excel">
        Esta vista replica tu documento de facturación. Usa el botón "Editar" en una fila para ajustarle la inflación (el monto final se recalcula solo). Usa el botón de WhatsApp para enviarle la info formateada a la contadora.
      </TipAlert>

      {/* Modal Fila Manual */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl animate-in zoom-in-95">
            <h2 className="text-xl font-display font-bold mb-4">Agregar Fila de Facturación</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-600">Proyecto (Cliente)</label>
                <select className="w-full border rounded p-2" value={manualForm.cliente_id} onChange={e => setManualForm({...manualForm, cliente_id: e.target.value})}>
                  <option value="">Seleccionar...</option>
                  {clientes?.map((c:any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-bold text-gray-600">Cuota (Ej: 1/12)</label><input className="w-full border rounded p-2" value={manualForm.cuota} onChange={e => setManualForm({...manualForm, cuota: e.target.value})}/></div>
                <div><label className="text-xs font-bold text-gray-600">Mes a facturar</label><input type="date" className="w-full border rounded p-2" value={manualForm.mes} onChange={e => setManualForm({...manualForm, mes: e.target.value})}/></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-bold text-gray-600">Monto Base</label><input type="number" className="w-full border rounded p-2" value={manualForm.monto_base} onChange={e => setManualForm({...manualForm, monto_base: e.target.value})}/></div>
                <div><label className="text-xs font-bold text-gray-600">Inflación (%)</label><input type="number" className="w-full border rounded p-2" value={manualForm.porcentaje_inflacion} onChange={e => setManualForm({...manualForm, porcentaje_inflacion: e.target.value})}/></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-bold text-gray-600">Responsable AFIP</label><input className="w-full border rounded p-2" value={manualForm.responsable_afip} onChange={e => setManualForm({...manualForm, responsable_afip: e.target.value})}/></div>
                <div><label className="text-xs font-bold text-gray-600">CUIT Resp.</label><input className="w-full border rounded p-2" value={manualForm.cuit_responsable} onChange={e => setManualForm({...manualForm, cuit_responsable: e.target.value})}/></div>
              </div>
              <div><label className="text-xs font-bold text-gray-600">Descripción</label><input className="w-full border rounded p-2" value={manualForm.descripcion} onChange={e => setManualForm({...manualForm, descripcion: e.target.value})}/></div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setIsFormOpen(false)} className="px-4 py-2 text-gray-600">Cancelar</button>
              <button onClick={() => saveRowMutation.mutate(manualForm)} className="bg-jengibre-primary text-white px-6 py-2 rounded-lg font-medium">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* TABLA ESTILO EXCEL */}
      <div className="bg-white border border-jengibre-border rounded-xl shadow-sm overflow-hidden w-full">
        {isLoading ? (
          <div className="p-12 flex justify-center"><div className="w-8 h-8 border-4 border-jengibre-primary border-t-transparent rounded-full animate-spin"></div></div>
        ) : facturas?.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No hay facturación generada. Ve a un cliente para generar su cronograma o agrega una fila manual.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap text-sm">
              <thead>
                <tr className="bg-[#f8f5f0] text-gray-900 border-b-2 border-jengibre-border font-bold uppercase text-[11px] tracking-wider">
                  <th className="px-3 py-3 border-r border-gray-200">Proyecto</th>
                  <th className="px-3 py-3 border-r border-gray-200">Cuit Empresa</th>
                  <th className="px-3 py-3 border-r border-gray-200 text-center">Cuota</th>
                  <th className="px-3 py-3 border-r border-gray-200 text-center">Mes</th>
                  <th className="px-3 py-3 border-r border-gray-200 text-right">Monto</th>
                  <th className="px-3 py-3 border-r border-gray-200 text-center">Inflación</th>
                  <th className="px-3 py-3 border-r border-gray-200 text-right bg-jengibre-cream">Monto Final</th>
                  <th className="px-3 py-3 border-r border-gray-200">Responsable Afip</th>
                  <th className="px-3 py-3 border-r border-gray-200">CUIT Resp.</th>
                  <th className="px-3 py-3 border-r border-gray-200 min-w-[200px]">Descripción</th>
                  <th className="px-3 py-3 border-r border-gray-200 text-center">Estado</th>
                  <th className="px-3 py-3 text-center bg-gray-50">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {facturas?.map((row) => {
                  const isEditing = editingId === row.id;
                  const mesNombre = new Date(row.mes).toLocaleDateString('es-AR', { month: 'long', timeZone: 'UTC' });
                  
                  return (
                    <tr key={row.id} className="border-b border-gray-200 hover:bg-gray-50/50">
                      <td className="px-3 py-2.5 font-bold text-gray-900 border-r border-gray-200 bg-[#fbf9f6]">{row.cliente?.nombre || 'Manual'}</td>
                      <td className="px-3 py-2.5 font-mono text-gray-600 border-r border-gray-200 bg-[#fbf9f6]">{row.cliente?.cuit || '-'}</td>
                      <td className="px-3 py-2.5 font-bold text-center border-r border-gray-200">{row.cuota}</td>
                      <td className="px-3 py-2.5 text-center capitalize border-r border-gray-200">{mesNombre}</td>
                      
                      {/* EDICIÓN EN LÍNEA */}
                      {isEditing ? (
                        <>
                          <td className="px-2 py-1 border-r border-gray-200"><input type="number" className="w-24 border border-blue-300 p-1 text-right text-xs rounded outline-none" value={editData.monto_base} onChange={e => setEditData({...editData, monto_base: e.target.value})} /></td>
                          <td className="px-2 py-1 border-r border-gray-200"><input type="number" className="w-16 border border-blue-300 p-1 text-center text-xs rounded outline-none" value={editData.porcentaje_inflacion} onChange={e => setEditData({...editData, porcentaje_inflacion: e.target.value})} /></td>
                          <td className="px-3 py-2.5 text-right font-bold text-gray-400 border-r border-gray-200 bg-gray-100 italic">Auto...</td>
                          <td className="px-2 py-1 border-r border-gray-200"><input className="w-32 border border-blue-300 p-1 text-xs rounded outline-none" value={editData.responsable_afip} onChange={e => setEditData({...editData, responsable_afip: e.target.value})} /></td>
                          <td className="px-2 py-1 border-r border-gray-200"><input className="w-24 border border-blue-300 p-1 text-xs rounded outline-none" value={editData.cuit_responsable} onChange={e => setEditData({...editData, cuit_responsable: e.target.value})} /></td>
                          <td className="px-2 py-1 border-r border-gray-200"><input className="w-full border border-blue-300 p-1 text-xs rounded outline-none" value={editData.descripcion} onChange={e => setEditData({...editData, descripcion: e.target.value})} /></td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2.5 text-right font-mono text-gray-700 border-r border-gray-200">{formatARS(row.monto_base)}</td>
                          <td className="px-3 py-2.5 text-center font-bold border-r border-gray-200">{row.porcentaje_inflacion > 0 ? `${row.porcentaje_inflacion}%` : '-'}</td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold border-r border-gray-200 bg-jengibre-cream/50">{formatARS(row.monto_final || row.monto_base)}</td>
                          <td className="px-3 py-2.5 text-gray-700 border-r border-gray-200">{row.responsable_afip || '-'}</td>
                          <td className="px-3 py-2.5 font-mono text-gray-600 border-r border-gray-200">{row.cuit_responsable || '-'}</td>
                          <td className="px-3 py-2.5 text-gray-600 border-r border-gray-200 truncate max-w-[250px]" title={row.descripcion}>{row.descripcion || '-'}</td>
                        </>
                      )}

                      <td className="px-3 py-2.5 border-r border-gray-200 text-center">
                        <select 
                          className={`text-xs font-bold rounded px-1.5 py-1 outline-none cursor-pointer border ${
                            row.estado === 'pagado' ? 'bg-green-100 text-green-800 border-green-200' :
                            row.estado === 'enviada' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                            'bg-gray-100 text-gray-600 border-gray-200'
                          }`}
                          value={row.estado}
                          onChange={(e) => updateEstadoMutation.mutate({ id: row.id, estado: e.target.value })}
                        >
                          <option value="por_enviar">Por Facturar</option>
                          <option value="enviada">Enviada</option>
                          <option value="pagado">Pagado</option>
                        </select>
                      </td>

                      <td className="px-3 py-2.5 bg-gray-50">
                        <div className="flex items-center justify-center gap-2">
                          {isEditing ? (
                            <button onClick={saveEditing} className="p-1 bg-green-100 text-green-700 rounded shadow-sm hover:bg-green-200"><Save size={16} /></button>
                          ) : (
                            <>
                              <button onClick={() => handleSolicitarFactura(row)} className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 hover:bg-green-200 rounded text-[11px] font-bold border border-green-200">
                                <MessageCircle size={12} /> Solicitar
                              </button>
                              <button onClick={() => startEditing(row)} className="p-1 text-gray-400 hover:text-blue-600"><Edit2 size={16} /></button>
                              <button onClick={() => { if(confirm('¿Eliminar?')) deleteMutation.mutate(row.id); }} className="p-1 text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
                            </>
                          )}
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