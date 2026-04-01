import React, { useState } from 'react';
import { Outlet, NavLink, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Home, Briefcase, Users, DollarSign, RefreshCw, 
  ShoppingCart, TrendingUp, Heart, MessageSquare, 
  Settings, LogOut, Menu, X, FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Layout() {
  const { session, isLoading, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (isLoading) return <div className="min-h-screen bg-jengibre-cream" />;
  if (!session) return <Navigate to="/login" replace />;

  const navItems = [
    { to: "/", icon: <Home size={20} />, label: "Dashboard" },
    { to: "/clientes", icon: <Briefcase size={20} />, label: "Clientes" },
    { to: "/facturacion", icon: <FileText size={20} />, label: "Facturación" },
    { to: "/equipo", icon: <Users size={20} />, label: "Equipo" },
    { to: "/caja", icon: <DollarSign size={20} />, label: "Caja" },
    { to: "/recuperos", icon: <RefreshCw size={20} />, label: "Recuperos" },
    { to: "/compras", icon: <ShoppingCart size={20} />, label: "Compras (IVA)" },
    { to: "/proyeccion", icon: <TrendingUp size={20} />, label: "Proyección" },
    { to: "/salud", icon: <Heart size={20} />, label: "Salud Financiera" },
    { to: "/contadora", icon: <MessageSquare size={20} />, label: "Contadora" },
    { to: "/configuracion", icon: <Settings size={20} />, label: "Configuración" },
  ];

  return (
    <div 
      className="flex h-screen overflow-hidden relative bg-cover bg-center"
      style={{ backgroundImage: "url('/Fondo.jpg')", backgroundColor: '#F2E8D9' }}
    >
      {/* Overlay para suavizar el fondo y asegurar legibilidad del contenido */}
      <div className="absolute inset-0 bg-[#F2E8D9]/80 backdrop-blur-[2px] z-0"></div>

      {/* SIDEBAR DESKTOP */}
      <nav className="w-64 bg-[#141c18]/95 backdrop-blur-xl text-jengibre-white hidden md:flex flex-col flex-shrink-0 relative z-10 border-r border-gray-800 shadow-2xl">
        <div className="p-8 flex flex-col items-center text-center gap-3 border-b border-gray-800/50">
          <img 
            src="/Logo%20IG.jpg" 
            alt="Jengibre Logo" 
            className="w-24 h-24 rounded-full shadow-lg object-cover border-2 border-gray-700" 
          />
          <div className="mt-2 space-y-1">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest leading-tight font-medium">
              Software de Gestión
            </p>
            <p className="text-xs font-bold text-jengibre-primary uppercase tracking-widest">
              Calidad Jengibre
            </p>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto py-6 flex flex-col gap-1 px-3 custom-scrollbar">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200",
                isActive 
                  ? "bg-jengibre-primary text-white font-medium shadow-md" 
                  : "text-gray-400 hover:bg-white/10 hover:text-white"
              )}
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </div>
        <div className="p-4 border-t border-gray-800/50">
          <button 
            onClick={signOut} 
            className="flex items-center gap-3 w-full px-3 py-2 text-gray-400 hover:bg-red-500/10 hover:text-red-400 rounded-xl transition-colors"
          >
            <LogOut size={20} /> Salir
          </button>
        </div>
      </nav>

      {/* MOBILE FULL MENU OVERLAY */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-[#141c18] text-jengibre-white flex flex-col animate-in slide-in-from-left-full duration-300">
          <div className="p-6 flex flex-col items-center justify-center border-b border-gray-800 relative">
            <button onClick={() => setMobileMenuOpen(false)} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white bg-white/5 rounded-full"><X size={24} /></button>
            <img 
              src="/Logo%20IG.jpg" 
              alt="Jengibre Logo" 
              className="w-20 h-20 rounded-full shadow-lg object-cover border-2 border-gray-700 mb-4" 
            />
            <div className="text-center">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest leading-tight font-medium">Software de Gestión</p>
              <p className="text-xs font-bold text-jengibre-primary uppercase tracking-widest mt-1">Calidad Jengibre</p>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) => cn(
                  "flex items-center gap-4 px-4 py-3.5 rounded-xl text-lg transition-colors",
                  isActive ? "bg-jengibre-primary text-white font-bold" : "text-gray-300 active:bg-white/10"
                )}
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
            <button 
              onClick={() => { setMobileMenuOpen(false); signOut(); }} 
              className="flex items-center gap-4 px-4 py-4 text-red-400 mt-auto border-t border-gray-800"
            >
              <LogOut size={20} /> Salir de la cuenta
            </button>
          </div>
        </div>
      )}

      {/* MOBILE BOTTOM NAV */}
      <nav className="md:hidden fixed bottom-0 w-full bg-[#141c18]/95 backdrop-blur-md text-jengibre-white flex justify-around items-center h-16 z-40 px-2 pb-safe border-t border-gray-800 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
        <NavLink to="/" className={({isActive}) => cn("p-3 rounded-full transition-colors", isActive ? "text-jengibre-primary bg-white/10" : "text-gray-400")}>
          <Home size={24} />
        </NavLink>
        <NavLink to="/facturacion" className={({isActive}) => cn("p-3 rounded-full transition-colors", isActive ? "text-jengibre-primary bg-white/10" : "text-gray-400")}>
          <FileText size={24} />
        </NavLink>
        <NavLink to="/clientes" className={({isActive}) => cn("p-3 rounded-full transition-colors", isActive ? "text-jengibre-primary bg-white/10" : "text-gray-400")}>
          <Briefcase size={24} />
        </NavLink>
        <button onClick={() => setMobileMenuOpen(true)} className="p-3 text-gray-400 rounded-full hover:bg-white/5 transition-colors">
          <Menu size={24} />
        </button>
      </nav>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-y-auto flex flex-col pb-16 md:pb-0 relative z-10">
        <div className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
          <Outlet />
        </div>
      </main>

    </div>
  );
}