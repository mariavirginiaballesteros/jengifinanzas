import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ESTA FUNCIÓN DEBE SER EJECUTADA TODOS LOS DÍAS MEDIANTE PG_CRON EN SUPABASE
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // 1. Inicializar cliente de Supabase (Se requieren las variables de entorno en el panel)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 2. Obtener fecha de hoy
    const hoy = new Date();
    const diaHoy = hoy.getDate();
    
    // Calcular fecha a 30 días
    const fecha30Dias = new Date();
    fecha30Dias.setDate(fecha30Dias.getDate() + 30);
    const str30Dias = fecha30Dias.toISOString().split('T')[0];

    console.log(`[alertas-email] Ejecutando revisión para el día ${diaHoy}. Buscando contratos que vencen el ${str30Dias}`);

    // 3. Buscar contratos que vencen exactamente en 30 días
    const { data: vencimientos, error: errVencimientos } = await supabase
      .from('clientes')
      .select('nombre, fecha_fin, contacto_nombre')
      .eq('estado', 'activo')
      .eq('fecha_fin', str30Dias);

    if (errVencimientos) throw errVencimientos;

    // 4. Buscar clientes a los que hay que facturar hoy
    const { data: facturacion, error: errFacturacion } = await supabase
      .from('clientes')
      .select('nombre, contacto_nombre, contacto_email')
      .eq('estado', 'activo')
      .eq('dia_facturacion', diaHoy);

    if (errFacturacion) throw errFacturacion;

    // 5. Preparar envíos (Requiere cuenta en Resend.com y llave RESEND_API_KEY en Supabase)
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    
    if (!resendApiKey) {
      console.warn("[alertas-email] API Key de Resend no configurada. Solo se imprimirán los logs.");
      console.log("[alertas-email] A Vencer:", vencimientos);
      console.log("[alertas-email] A Facturar:", facturacion);
      return new Response(JSON.stringify({ success: true, warning: 'No Resend API Key', vencimientos, facturacion }), { headers: corsHeaders });
    }

    // Aquí iría el código HTTP POST a la API de Resend enviando los correos...
    // Ejemplo ficticio de la lógica:
    for (const cliente of facturacion) {
      console.log(`[alertas-email] Enviando mail de recordatorio de factura para ${cliente.nombre}`);
      // await fetch('https://api.resend.com/emails', { ... })
    }

    return new Response(JSON.stringify({ 
      success: true, 
      mensaje: "Revisión completada",
      procesados_vencimientos: vencimientos.length,
      procesados_facturas: facturacion.length
    }), { headers: {...corsHeaders, 'Content-Type': 'application/json'} });

  } catch (error: any) {
    console.error("[alertas-email] Error ejecutando alertas:", { error: error.message });
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: {...corsHeaders, 'Content-Type': 'application/json'} 
    });
  }
})