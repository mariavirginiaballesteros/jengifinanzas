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
    <div className="flex h-screen overflow-hidden bg-[#FAF6F0]">
      {/* SIDEBAR DESKTOP */}
      <nav className="w-64 bg-[#1A2E26] text-white hidden md:flex flex-col flex-shrink-0 border-r border-[#13221c] shadow-xl z-20">
        <div className="p-8 flex flex-col items-center text-center gap-3 border-b border-[#254236]">
          <div className="w-24 h-24 rounded-full shadow-lg border-2 border-[#2A4A3D] overflow-hidden bg-white shrink-0">
            <img 
              src="/Logo IG.jpg" 
              alt="Jengibre Logo" 
              className="w-full h-full object-cover" 
              onError={(e) => { e.currentTarget.src = 'https://ui-avatars.com/api/?name=J&background=C8522A&color=fff'; }}
            />
          </div>
          <div className="mt-2 space-y-1">
            <p className="text-[10px] text-[#A3B8B0] uppercase tracking-widest leading-tight font-medium">
              Software de Gestión
            </p>
            <p className="text-xs font-bold text-[#D4A843] uppercase tracking-widest">
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
                  ? "bg-jengibre-primary text-white font-bold shadow-md" 
                  : "text-[#A3B8B0] hover:bg-[#254236] hover:text-white"
              )}
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </div>
        <div className="p-4 border-t border-[#254236]">
          <button 
            onClick={signOut} 
            className="flex items-center gap-3 w-full px-3 py-2 text-[#A3B8B0] hover:bg-red-500/10 hover:text-red-400 rounded-xl transition-colors"
          >
            <LogOut size={20} /> Salir
          </button>
        </div>
      </nav>

      {/* MOBILE FULL MENU OVERLAY */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-[#1A2E26] text-white flex flex-col animate-in slide-in-from-left-full duration-300">
          <div className="p-6 flex flex-col items-center justify-center border-b border-[#254236] relative">
            <button onClick={() => setMobileMenuOpen(false)} className="absolute top-4 right-4 p-2 text-[#A3B8B0] hover:text-white bg-white/5 rounded-full"><X size={24} /></button>
            <div className="w-20 h-20 rounded-full shadow-lg border-2 border-[#2A4A3D] overflow-hidden bg-white mb-4 shrink-0">
              <img 
                src="/Logo IG.jpg" 
                alt="Jengibre Logo" 
                className="w-full h-full object-cover" 
                onError={(e) => { e.currentTarget.src = 'https://ui-avatars.com/api/?name=J&background=C8522A&color=fff'; }}
              />
            </div>
            <div className="text-center">
              <p className="text-[10px] text-[#A3B8B0] uppercase tracking-widest leading-tight font-medium">Software de Gestión</p>
              <p className="text-xs font-bold text-[#D4A843] uppercase tracking-widest mt-1">Calidad Jengibre</p>
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
                  isActive ? "bg-jengibre-primary text-white font-bold" : "text-[#A3B8B0] active:bg-[#254236]"
                )}
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
            <button 
              onClick={() => { setMobileMenuOpen(false); signOut(); }} 
              className="flex items-center gap-4 px-4 py-4 text-red-400 mt-auto border-t border-[#254236]"
            >
              <LogOut size={20} /> Salir de la cuenta
            </button>
          </div>
        </div>
      )}

      {/* MOBILE BOTTOM NAV */}
      <nav className="md:hidden fixed bottom-0 w-full bg-[#1A2E26] text-white flex justify-around items-center h-16 z-40 px-2 pb-safe border-t border-[#13221c] shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
        <NavLink to="/" className={({isActive}) => cn("p-3 rounded-full transition-colors", isActive ? "text-[#D4A843] bg-white/10" : "text-[#A3B8B0]")}>
          <Home size={24} />
        </NavLink>
        <NavLink to="/facturacion" className={({isActive}) => cn("p-3 rounded-full transition-colors", isActive ? "text-[#D4A843] bg-white/10" : "text-[#A3B8B0]")}>
          <FileText size={24} />
        </NavLink>
        <NavLink to="/clientes" className={({isActive}) => cn("p-3 rounded-full transition-colors", isActive ? "text-[#D4A843] bg-white/10" : "text-[#A3B8B0]")}>
          <Briefcase size={24} />
        </NavLink>
        <button onClick={() => setMobileMenuOpen(true)} className="p-3 text-[#A3B8B0] rounded-full hover:bg-white/5 transition-colors">
          <Menu size={24} />
        </button>
      </nav>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-y-auto flex flex-col pb-16 md:pb-0 z-10">
        <div className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}