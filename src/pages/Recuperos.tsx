import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TipAlert } from '@/components/TipAlert';
import { Plus, Edit2, Trash2, RefreshCw, MessageCircle } from 'lucide-react';
import { formatARS } from '@/lib/utils';
import { showSuccess, showError } from '@/utils/toast';

// Helper para guardar datos extra como IIBB en el campo notas
const parseNotas = (notasStr: string | null) => {
  if (!notasStr) return { texto: '', iibb_porcentaje: 3, iibb_monto: 0 };
  try {
    const parsed = JSON.parse(notasStr);
    if (parsed && typeof parsed === 'object' && 'iibb_porcentaje' in parsed) {
      return parsed;
    }
  } catch (e) {
    // Es una nota vieja en texto plano
  }
  return { texto: notasStr || '', iibb_porcentaje: 3, iibb_monto: 0 };
};

export default function Recuperos() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const defaultForm = {
    cliente_id: '',
    concepto: '',
    monto: '',
    fecha_pago: new Date().toISOString().split('T')[0],
    tiene_iva: false,
    iibb_porcentaje: 3,
    estado: 'pendiente', 
    fecha_cobro: '',
    notas: ''
  };
  const [formData, setFormData] = useState<any>(defaultForm);

  // Queries
  const { data: recuperos, isLoading } = useQuery({
    queryKey: ['recuperos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recuperos')
        .select(`*, cliente:clientes(nombre, contacto_nombre)`)
        .order('fecha_pago', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const { data: clientes } = useQuery({
    queryKey: ['clientes_combo'],
    queryFn: async () => {
      const { data } = await supabase.from('clientes').select('id, nombre, contacto_nombre').eq('estado', 'activo');
      return data || [];
    }
  });

  // Mutaciones
  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      const baseMonto = Number(payload.monto);
      const tieneIva = payload.tiene_iva;
      const ivaMonto = tieneIva ? baseMonto * 0.21 : 0;
      const iibbMonto = tieneIva ? baseMonto * (Number(payload.iibb_porcentaje) / 100) : 0;

      const notasJson = JSON.stringify({
        texto: payload.notas,
        iibb_porcentaje: Number(payload.iibb_porcentaje),
        iibb_monto: iibbMonto
      });

      const dataToSave = {
        cliente_id: payload.cliente_id,
        concepto: payload.concepto,
        monto: baseMonto,
        fecha_pago: payload.fecha_pago,
        tiene_iva: tieneIva,
        iva_monto: ivaMonto,
        estado: payload.estado,
        fecha_cobro: payload.estado === 'cobrado' && !payload.fecha_cobro ? new Date().toISOString().split('T')[0] : (payload.fecha_cobro || null),
        notas: notasJson
      };

      if (editingId) {
        const { error } = await supabase.from('recuperos').update(dataToSave).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('recuperos').insert([dataToSave]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recuperos'] });
      showSuccess(editingId ? 'Recupero actualizado' : 'Recupero registrado');
      closeForm();
    },
    onError: (err: any) => showError(err.message)
  });

  const updateEstadoMutation = useMutation({
    mutationFn: async ({ id, estado, currentFechaCobro }: { id: string, estado: string, currentFechaCobro: string | null }) => {
      const payload: any = { estado };
      if (estado === 'cobrado' && !currentFechaCobro) {
        payload.fecha_cobro = new Date().toISOString().split('T')[0];
      } else if (estado !== 'cobrado') {
        payload.fecha_cobro = null;
      }
      
      const { error } = await supabase.from('recuperos').update(payload).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recuperos'] });
      showSuccess('Estado actualizado');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recuperos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recuperos'] });
      showSuccess('Recupero eliminado');
    }
  });

  // Handlers
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.cliente_id) return showError('Debes seleccionar un cliente');
    if (!formData.monto || Number(formData.monto) <= 0) return showError('El monto debe ser mayor a 0');
    saveMutation.mutate(formData);
  };

  const openEdit = (rec: any) => {
    const notasParsed = parseNotas(rec.notas);
    setFormData({
      cliente_id: rec.cliente_id,
      concepto: rec.concepto,
      monto: rec.monto,
      fecha_pago: rec.fecha_pago,
      tiene_iva: rec.tiene_iva,
      iibb_porcentaje: notasParsed.iibb_porcentaje || 3,
      estado: rec.estado || 'pendiente',
      fecha_cobro: rec.fecha_cobro || '',
      notas: notasParsed.texto || ''
    });
    setEditingId(rec.id);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormData(defaultForm);
  };

  // WhatsApp
  const handleWhatsApp = (rec: any) => {
    const notasParsed = parseNotas(rec.notas);
    const totalImpuestos = (rec.iva_monto || 0) + (notasParsed.iibb_monto || 0);
    const totalARecuperar = Number(rec.monto) + totalImpuestos;
    
    let msg = `Hola ${rec.cliente?.contacto_nombre || 'equipo'}! Te paso el detalle de un consumo que abonamos por ustedes para que puedan enviarnos el reembolso:%0A%0A`;
    
    msg += `*Concepto:* ${rec.concepto}%0A`;
    msg += `*Fecha del gasto:* ${new Date(rec.fecha_pago).toLocaleDateString('es-AR')}%0A`;
    msg += `*Monto original:* ${formatARS(rec.monto)}%0A`;
    
    if (rec.tiene_iva) {
      msg += `*Impuestos (IVA + IIBB):* ${formatARS(totalImpuestos)}%0A`;
    }
    
    msg += `%0A*TOTAL A TRANSFERIR:* ${formatARS(totalARecuperar)}%0A%0A`;
    
    if (rec.estado === 'facturado') {
      msg += `Ya les enviamos la factura correspondiente por este monto. `;
    } else if (rec.estado === 'enviado_sin_factura') {
      msg += `Avanzamos con el cobro sin emisión de factura como lo conversamos. `;
    } else if (rec.tiene_iva) {
      msg += `En breve les estaremos enviando la factura correspondiente. `;
    }
    
    msg += `Por favor avisen cuando esté realizado el pago. ¡Gracias!`;
    
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  // Cálculos en vivo para el formulario
  const baseMonto = Number(formData.monto) || 0;
  const ivaPreview = formData.tiene_iva ? baseMonto * 0.21 : 0;
  const iibbPreview = formData.tiene_iva ? baseMonto * (Number(formData.iibb_porcentaje) / 100) : 0;
  const totalPreview = baseMonto + ivaPreview + iibbPreview;

  return (
    <div className="animate-in fade-in duration-500 pb-12 w-full">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-jengibre-dark">Recuperos de Gastos</h1>
          <p className="text-gray-600 mt-1">Controlá la plata que pusiste de tu bolsillo o de la agencia por clientes.</p>
        </div>
        <button 
          onClick={() => setIsFormOpen(true)}
          className="bg-jengibre-primary hover:bg-[#a64120] text-white px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 shadow-sm"
        >
          <Plus size={20} /> Cargar Consumo
        </button>
      </header>

      <TipAlert id="recuperos_intro" title="💡 Recupero con o sin factura">
        Si el consumo que pagaste requiere que <strong>vos le emitas una factura al cliente</strong> para recuperarlo, marcá la casilla de "Requiere Facturar". El sistema le sumará IVA e Ingresos Brutos automáticamente para que no pierdas plata en impuestos.
      </TipAlert>

      {/* FORMULARIO MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-display font-bold mb-6 flex items-center gap-2">
              <RefreshCw className="text-jengibre-primary" />
              {editingId ? 'Editar Recupero' : 'Nuevo Gasto a Recuperar'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                <select 
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-white"
                  value={formData.cliente_id} onChange={e => setFormData({...formData, cliente_id: e.target.value})}
                  required
                >
                  <option value="">Seleccioná un cliente...</option>
                  {clientes?.map((c:any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Concepto / Detalle del Gasto</label>
                <input 
                  type="text" placeholder="Ej: Hosting AWS, Pauta en Meta, Merchandising..." required
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none"
                  value={formData.concepto} onChange={e => setFormData({...formData, concepto: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monto Pagado al Proveedor</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                    <input 
                      type="number" step="0.01" required min="1"
                      className="w-full border border-gray-300 rounded-lg p-2.5 pl-8 focus:ring-2 focus:ring-jengibre-primary outline-none font-mono font-bold text-lg"
                      value={formData.monto} onChange={e => setFormData({...formData, monto: e.target.value})}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha del Pago</label>
                  <input 
                    type="date" required
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none"
                    value={formData.fecha_pago} onChange={e => setFormData({...formData, fecha_pago: e.target.value})}
                  />
                </div>
              </div>

              {/* MÓDULO DE IMPUESTOS */}
              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 space-y-3 mt-2">
                <div className="flex items-center gap-3">
                  <input 
                    type="checkbox" id="tiene_iva" 
                    className="w-5 h-5 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                    checked={formData.tiene_iva} onChange={e => setFormData({...formData, tiene_iva: e.target.checked})}
                  />
                  <label htmlFor="tiene_iva" className="font-bold text-blue-900 cursor-pointer select-none">
                    Se va a facturar al cliente (Sumar impuestos)
                  </label>
                </div>

                {formData.tiene_iva && (
                  <div className="grid grid-cols-3 gap-3 animate-in slide-in-from-top-2 pt-2 border-t border-blue-100">
                    <div>
                      <label className="block text-xs font-bold text-blue-800 mb-1">IVA</label>
                      <div className="bg-white border border-blue-200 rounded p-2 text-sm font-mono text-gray-600">
                        +21% ({formatARS(ivaPreview)})
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-blue-800 mb-1">% IIBB</label>
                      <div className="relative">
                        <input 
                          type="number" step="0.1" min="0" required
                          className="w-full border border-blue-200 rounded p-2 pr-6 outline-none focus:border-blue-500 font-mono text-sm"
                          value={formData.iibb_porcentaje} onChange={e => setFormData({...formData, iibb_porcentaje: e.target.value})}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-blue-800 mb-1">Monto IIBB</label>
                      <div className="bg-white border border-blue-200 rounded p-2 text-sm font-mono text-gray-600">
                        +{formatARS(iibbPreview)}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-blue-200 mt-2 shadow-sm">
                  <span className="font-bold text-gray-700 text-sm">TOTAL A RECUPERAR:</span>
                  <span className="font-mono font-bold text-xl text-blue-800">{formatARS(totalPreview)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado del Recupero</label>
                  <select 
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none font-bold"
                    value={formData.estado} onChange={e => setFormData({...formData, estado: e.target.value})}
                  >
                    <option value="enviado_sin_factura">Enviado para cobrar sin factura</option>
                    <option value="pendiente">Pendiente de facturar</option>
                    <option value="facturado">Facturado esperando cobrar</option>
                    <option value="cobrado">Pago completado</option>
                  </select>
                </div>
                {formData.estado === 'cobrado' && (
                  <div className="animate-in fade-in">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Cobro</label>
                    <input 
                      type="date" required
                      className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none bg-green-50"
                      value={formData.fecha_cobro} onChange={e => setFormData({...formData, fecha_cobro: e.target.value})}
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas Internas</label>
                <textarea 
                  rows={2} placeholder="Opcional..."
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jengibre-primary outline-none"
                  value={formData.notas} onChange={e => setFormData({...formData, notas: e.target.value})}
                />
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button type="button" onClick={closeForm} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors">Cancelar</button>
                <button type="submit" disabled={saveMutation.isPending} className="bg-jengibre-primary hover:bg-[#a64120] text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50">
                  {saveMutation.isPending ? 'Guardando...' : 'Guardar Recupero'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LISTADO DE RECUPEROS */}
      <div className="bg-white border border-jengibre-border rounded-2xl overflow-hidden shadow-sm">
        {isLoading ? (
           <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-jengibre-primary border-t-transparent rounded-full animate-spin"></div></div>
        ) : recuperos?.length === 0 ? (
          <div className="p-12 text-center">
            <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400"><RefreshCw size={32} /></div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">No hay recuperos</h3>
            <p className="text-gray-500 mb-4">No tenés gastos pendientes de recuperar cargados en el sistema.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-jengibre-cream/50 text-jengibre-dark text-sm border-b border-jengibre-border">
                  <th className="px-4 py-3 font-bold">Fecha Gasto</th>
                  <th className="px-4 py-3 font-bold">Cliente</th>
                  <th className="px-4 py-3 font-bold">Concepto</th>
                  <th className="px-4 py-3 font-bold text-right">Monto Original</th>
                  <th className="px-4 py-3 font-bold text-right">Impuestos</th>
                  <th className="px-4 py-3 font-bold text-right bg-blue-50/50">Total a Cobrar</th>
                  <th className="px-4 py-3 font-bold text-center">Estado</th>
                  <th className="px-4 py-3 font-bold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {recuperos?.map((rec) => {
                  const notasParsed = parseNotas(rec.notas);
                  const totalImpuestos = (rec.iva_monto || 0) + (notasParsed.iibb_monto || 0);
                  const total = Number(rec.monto) + totalImpuestos;
                  
                  const getStatusStyle = (status: string) => {
                    switch(status) {
                      case 'cobrado': return 'bg-green-100 text-green-800 border border-green-200';
                      case 'facturado': return 'bg-blue-100 text-blue-800 border border-blue-200';
                      case 'enviado_sin_factura': return 'bg-purple-100 text-purple-800 border border-purple-200';
                      default: return 'bg-amber-100 text-amber-800 border border-amber-200';
                    }
                  };

                  return (
                    <tr key={rec.id} className={`border-b border-gray-100 hover:bg-gray-50 transition-colors group ${rec.estado === 'cobrado' ? 'opacity-60 bg-gray-50/50' : ''}`}>
                      <td className="px-4 py-4 text-sm text-gray-600">
                        {new Date(rec.fecha_pago).toLocaleDateString('es-AR', {day: '2-digit', month: 'short', year: 'numeric'})}
                      </td>
                      <td className="px-4 py-4 font-bold text-gray-900">{rec.cliente?.nombre || 'Cliente Eliminado'}</td>
                      <td className="px-4 py-4">
                        <p className="text-sm font-medium text-gray-800">{rec.concepto}</p>
                        {notasParsed.texto && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{notasParsed.texto}</p>}
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-gray-600">{formatARS(rec.monto)}</td>
                      <td className="px-4 py-4 text-right font-mono text-gray-500 text-xs">
                        {rec.tiene_iva ? `+${formatARS(totalImpuestos)}` : '-'}
                      </td>
                      <td className="px-4 py-4 text-right font-mono font-bold text-lg text-jengibre-dark bg-blue-50/20">
                        {formatARS(total)}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <select 
                          className={`text-xs font-bold rounded-full px-3 py-1 outline-none cursor-pointer text-center appearance-none transition-colors ${getStatusStyle(rec.estado)}`}
                          value={rec.estado}
                          onChange={(e) => updateEstadoMutation.mutate({ id: rec.id, estado: e.target.value, currentFechaCobro: rec.fecha_cobro })}
                        >
                          <option value="enviado_sin_factura">Enviado (Sin Factura)</option>
                          <option value="pendiente">Pendiente de facturar</option>
                          <option value="facturado">Facturado (Esperando)</option>
                          <option value="cobrado">Pago completado ✓</option>
                        </select>
                        {rec.estado === 'cobrado' && rec.fecha_cobro && (
                          <p className="text-[10px] text-green-600 font-bold mt-1">el {new Date(rec.fecha_cobro).toLocaleDateString('es-AR')}</p>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => handleWhatsApp(rec)} className="p-1.5 text-[#25D366] hover:bg-[#25D366]/10 rounded-lg transition-colors" title="Avisar y cobrar por WhatsApp">
                            <MessageCircle size={18} />
                          </button>
                          <div className="w-px h-4 bg-gray-200 mx-1"></div>
                          <button onClick={() => openEdit(rec)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"><Edit2 size={16} /></button>
                          <button onClick={() => { if(confirm('¿Eliminar este recupero?')) deleteMutation.mutate(rec.id); }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={16} /></button>
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