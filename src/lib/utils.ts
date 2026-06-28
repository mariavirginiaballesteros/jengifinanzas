import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formatea un monto en Pesos Argentinos con siempre 2 decimales.
 */
export function formatARS(amount: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Formatea un monto en Dólares con siempre 2 decimales.
 */
export function formatUSD(amount: number) {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
  return `U$ ${formatted}`;
}

/**
 * Formatea una fecha string (YYYY-MM-DD) a formato local sin desfase de zona horaria.
 */
export function formatLocalDate(dateString: string | null | undefined, options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!dateString) return '-';
  // Si la fecha viene con T (ISO), tomamos solo la parte de la fecha
  const pureDate = dateString.includes('T') ? dateString.split('T')[0] : dateString;
  const [year, month, day] = pureDate.split('-').map(Number);
  
  if (isNaN(year) || isNaN(month) || isNaN(day)) return dateString;

  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('es-AR', options);
}

/**
 * Retorna la fecha actual en formato YYYY-MM-DD local.
 */
export function getLocalDateString(date: Date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Asegura que un valor sea un número financiero válido con 2 decimales de precisión.
 * Evita errores de punto flotante.
 */
export function parseFinancial(value: any): number {
  const num = Number(value);
  if (isNaN(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Centraliza el parseo de la columna 'notas' que suele ser un JSON.
 */
export function parseNotas(notasStr: string | null) {
  const defaultNotas = { texto: '', moneda: 'ARS', telefono: '', asignaciones: {} as Record<string, number> };
  if (!notasStr) return defaultNotas;
  
  try {
    const parsed = JSON.parse(notasStr);
    if (parsed && typeof parsed === 'object') {
      return {
        texto: parsed.texto || '',
        moneda: parsed.moneda || 'ARS',
        telefono: parsed.telefono || '',
        asignaciones: parsed.asignaciones || {}
      };
    }
  } catch (e) {
    // Si no es JSON, es texto plano
  }
  
  return { ...defaultNotas, texto: notasStr };
}

/**
 * Centraliza el parseo de la columna 'descripcion' en Facturación.
 */
export function parseDescripcion(descStr: string | null) {
  const defaultDesc = {
    texto: '',
    periodo: '',
    link: '',
    monto_pagado: 0,
    retencion_ganancias: 0,
    retencion_iva: 0,
    monto_retenido: 0,
    es_informal: false
  };

  if (!descStr) return defaultDesc;

  try {
    const parsed = JSON.parse(descStr);
    if (parsed && typeof parsed === 'object') {
      return {
        texto: parsed.texto || '',
        periodo: parsed.periodo || '',
        link: parsed.link || '',
        monto_pagado: parseFinancial(parsed.monto_pagado),
        retencion_ganancias: parseFinancial(parsed.retencion_ganancias),
        retencion_iva: parseFinancial(parsed.retencion_iva),
        monto_retenido: parseFinancial(parsed.monto_retenido),
        es_informal: Boolean(parsed.es_informal)
      };
    }
  } catch (e) {
    // Texto plano
  }

  return { ...defaultDesc, texto: descStr };
}
