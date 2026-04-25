import { useQuery } from '@tanstack/react-query';

export function useCotizacionOficial() {
  return useQuery({
    queryKey: ['cotizacion_oficial'],
    queryFn: async () => {
      try {
        const res = await fetch('https://dolarapi.com/v1/dolares/oficial');
        const data = await res.json();
        return data.venta || 1000; // Valor de fallback en caso de error
      } catch (error) {
        console.error('Error obteniendo cotización:', error);
        return 1000; 
      }
    },
    staleTime: 1000 * 60 * 30, // Se refresca cada 30 minutos
  });
}