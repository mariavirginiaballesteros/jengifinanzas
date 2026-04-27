import React, { useState } from 'react';
import { Outlet, NavLink, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Home, Briefcase, Users, DollarSign, RefreshCw, 
  ShoppingCart, TrendingUp, Heart, MessageSquare, 
  Settings, LogOut, Menu, X, FileText, Calculator
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
    { to: "/cotizador", icon: <Calculator size={20} />, label: "Cotizador" },
    { to: "/salud", icon: <Heart size={20} />, label: "Salud Financiera" },
    { to: "/contadora", icon: <MessageSquare size={20} />, label: "Contadora" },
    { to: "/configuracion", icon: <Settings size={20} />, label: "Configuración" },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-[#F4F5F7] relative">
      {/* SIDEBAR DESKTOP */}
      <nav 
        className="w-72 text-white hidden md:flex flex-col flex-shrink-0 relative z-20 border-r border-white/10 shadow-2xl bg-cover bg-left"
        style={{ backgroundColor: '#2B317A', backgroundImage: "url('/fondo.jpg')" }}
      >
        <div className="absolute inset-0 bg-[#2B317A]/90 z-0"></div>
        
        <div className="p-8 flex flex-col items-center text-center gap-4 border-b border-white/10 relative z-10">
          <div className="w-32 h-32 rounded-2xl shadow-xl overflow-hidden bg-[#2B317A] shrink-0 border border-white/20">
            <img 
              src="/logo.jpg" 
              alt="Jengibre Logo" 
              className="w-full h-full object-cover" 
            />
          </div>
          <div className="mt-2 space-y-1">
            <p className="text-[10px] text-gray-300 uppercase tracking-widest leading-tight font-medium">
              Software de Gestión
            </p>
            <p className="text-xs font-bold text-jengibre-secondary uppercase tracking-widest">
              Calidad Jengibre
            </p>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto py-6 flex flex-col gap-1 px-4 relative z-10 custom-scrollbar">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                isActive 
                  ? "bg-jengibre-primary text-white font-bold shadow-md" 
                  : "text-gray-300 hover:bg-white/10 hover:text-white"
              )}
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </div>
        <div className="p-4 border-t border-white/10 relative z-10">
          <button 
            onClick={signOut} 
            className="flex items-center gap-3 w-full px-4 py-3 text-gray-300 hover:bg-red-500/20 hover:text-white rounded-xl transition-colors font-medium"
          >
            <LogOut size={20} /> Salir
          </button>
        </div>
      </nav>

      {/* MOBILE FULL MENU OVERLAY */}
      {mobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 z-50 text-white flex flex-col animate-in slide-in-from-left-full duration-300 bg-cover bg-center"
          style={{ backgroundColor: '#2B317A', backgroundImage: "url('/fondo.jpg')" }}
        >
          <div className="absolute inset-0 bg-[#2B317A]/95 z-0"></div>
          
          <div className="p-6 flex flex-col items-center justify-center border-b border-white/10 relative z-10">
            <button onClick={() => setMobileMenuOpen(false)} className="absolute top-4 right-4 p-2 text-gray-300 hover:text-white bg-white/10 rounded-full"><X size={24} /></button>
            <div className="w-24 h-24 rounded-2xl shadow-xl overflow-hidden bg-[#2B317A] shrink-0 border border-white/20 mb-4">
              <img 
                src="/logo.jpg" 
                alt="Jengibre Logo" 
                className="w-full h-full object-cover" 
              />
            </div>
            <div className="text-center">
              <p className="text-[10px] text-gray-300 uppercase tracking-widest leading-tight font-medium">Software de Gestión</p>
              <p className="text-xs font-bold text-jengibre-secondary uppercase tracking-widest mt-1">Calidad Jengibre</p>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 relative z-10">
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
              className="flex items-center gap-4 px-4 py-4 text-gray-300 hover:text-white mt-auto border-t border-white/10"
            >
              <LogOut size={20} /> Salir de la cuenta
            </button>
          </div>
        </div>
      )}

      {/* MOBILE BOTTOM NAV */}
      <nav className="md:hidden fixed bottom-0 w-full bg-[#2B317A] text-white flex justify-around items-center h-16 z-40 px-2 pb-safe border-t border-white/10 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
        <NavLink to="/" className={({isActive}) => cn("p-3 rounded-full transition-colors", isActive ? "text-jengibre-secondary bg-white/10" : "text-gray-300")}>
          <Home size={24} />
        </NavLink>
        <NavLink to="/facturacion" className={({isActive}) => cn("p-3 rounded-full transition-colors", isActive ? "text-jengibre-secondary bg-white/10" : "text-gray-300")}>
          <FileText size={24} />
        </NavLink>
        <NavLink to="/clientes" className={({isActive}) => cn("p-3 rounded-full transition-colors", isActive ? "text-jengibre-secondary bg-white/10" : "text-gray-300")}>
          <Briefcase size={24} />
        </NavLink>
        <button onClick={() => setMobileMenuOpen(true)} className="p-3 text-gray-300 rounded-full hover:bg-white/10 transition-colors">
          <Menu size={24} />
        </button>
      </nav>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-y-auto flex flex-col pb-16 md:pb-0 z-10 bg-[#F4F5F7]">
        <div className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}