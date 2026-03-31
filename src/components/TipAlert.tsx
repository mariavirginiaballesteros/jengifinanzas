import React, { useState, useEffect } from 'react';
import { Lightbulb, X } from 'lucide-react';

interface TipAlertProps {
  id: string;
  title: string;
  children: React.ReactNode;
}

export function TipAlert({ id, title, children }: TipAlertProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Revisamos si el usuario ya ocultó este tip previamente
    const hidden = localStorage.getItem(`hide_tip_${id}`);
    if (!hidden) {
      setIsVisible(true);
    }
  }, [id]);

  const dismiss = () => {
    localStorage.setItem(`hide_tip_${id}`, 'true');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="bg-[#FFFDF5] border border-jengibre-border p-4 rounded-2xl mb-6 relative shadow-sm flex gap-4 items-start animate-in fade-in slide-in-from-top-4">
      <div className="bg-jengibre-amber/20 p-2 rounded-full shrink-0">
        <Lightbulb className="text-jengibre-amber" size={24} />
      </div>
      <div className="flex-1 pt-1">
        <h4 className="font-display font-bold text-jengibre-dark mb-1 text-lg">{title}</h4>
        <div className="text-gray-600 font-sans text-sm leading-relaxed">{children}</div>
        <button 
          onClick={dismiss}
          className="mt-3 text-sm font-bold text-jengibre-primary hover:text-[#a64120] transition-colors"
        >
          Entendido, no volver a mostrar
        </button>
      </div>
      <button 
        onClick={dismiss} 
        className="text-gray-400 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors absolute top-2 right-2"
        aria-label="Cerrar"
      >
        <X size={18} />
      </button>
    </div>
  );
}