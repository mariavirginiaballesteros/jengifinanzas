import { serve } from "https://deno.land/std@0.190.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejar CORS para el navegador
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { messages, contexto } = await req.json();
    const apiKey = Deno.env.get('OPENAI_API_KEY');

    if (!apiKey) {
      return new Response(JSON.stringify({ 
        error: 'Falta configurar OPENAI_API_KEY en los Secrets de Supabase.' 
      }), { 
        status: 200, // Retornamos 200 pero con error en el body para manejarlo bonito en el front
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const systemMessage = {
      role: 'system',
      content: `Eres el Asesor Financiero experto (CFO) de la agencia Jengibre Co. 
      Tu objetivo es ayudar a los dueños a tomar decisiones estratégicas de inversión, retiros de dividendos y protección contra la inflación.
      
      Estos son los datos FINANCIEROS REALES en este exacto momento:
      - Total en Caja (Equivalente en ARS): $${contexto.totalCajaARS}
      - Composición: ARS $${contexto.totalARS_puro} | USD $${contexto.totalUSD_puro} (Dólares)
      - Costo Operativo de la agencia promedio: $${contexto.avgCostos} / mes
      - Honorarios/Sueldos de Dirección fijados: $${contexto.costoDireccion} / mes
      - Costo Mensual Total a cubrir: $${contexto.avgCostos + contexto.costoDireccion} / mes
      - Fondo de Reserva Objetivo (6 meses): $${contexto.fondoReservaObjetivo}
      - Excedente libre de riesgo actual: $${contexto.excedente}
      
      Reglas:
      - Responde de forma amable, directa y al grano. Formatea el texto de forma fácil de leer.
      - Usa los números proporcionados para justificar tus respuestas.`
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [systemMessage, ...messages],
      }),
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    return new Response(JSON.stringify({ reply: data.choices[0].message.content }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error("[asesor-financiero] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})