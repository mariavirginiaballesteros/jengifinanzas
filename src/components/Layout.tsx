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
    <div className="flex h-screen bg-jengibre-cream overflow-hidden">
      
      {/* SIDEBAR DESKTOP */}
      <nav className="w-64 bg-jengibre-dark text-jengibre-white hidden md:flex flex-col flex-shrink-0">
        <div className="p-6 text-2xl font-display font-bold text-jengibre-primary flex items-center gap-2">
          🌱 Jengibre
        </div>
        <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-1 px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                isActive ? "bg-jengibre-primary text-white font-medium" : "text-gray-300 hover:bg-gray-800 hover:text-white"
              )}
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </div>
        <div className="p-4 border-t border-gray-700">
          <button 
            onClick={signOut} 
            className="flex items-center gap-3 w-full px-3 py-2 text-gray-300 hover:bg-gray-800 hover:text-white rounded-lg transition-colors"
          >
            <LogOut size={20} /> Salir
          </button>
        </div>
      </nav>

      {/* MOBILE FULL MENU OVERLAY */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-jengibre-dark text-jengibre-white flex flex-col">
          <div className="p-4 flex justify-between items-center border-b border-gray-700">
            <div className="text-xl font-display font-bold text-jengibre-primary">🌱 Menú</div>
            <button onClick={() => setMobileMenuOpen(false)} className="p-2"><X size={24} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) => cn(
                  "flex items-center gap-4 px-4 py-3 rounded-lg text-lg",
                  isActive ? "bg-jengibre-primary text-white font-medium" : "text-gray-300 active:bg-gray-800"
                )}
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
            <button 
              onClick={() => { setMobileMenuOpen(false); signOut(); }} 
              className="flex items-center gap-4 px-4 py-3 text-red-400 mt-auto"
            >
              <LogOut size={20} /> Salir de la cuenta
            </button>
          </div>
        </div>
      )}

      {/* MOBILE BOTTOM NAV */}
      <nav className="md:hidden fixed bottom-0 w-full bg-jengibre-dark text-jengibre-white flex justify-around items-center h-16 z-40 px-2 pb-safe border-t border-gray-800 shadow-[0_-4px_10px_rgba(0,0,0,0.1)]">
        <NavLink to="/" className={({isActive}) => cn("p-3 rounded-full transition-colors", isActive ? "text-jengibre-primary bg-gray-800" : "text-gray-400")}>
          <Home size={24} />
        </NavLink>
        <NavLink to="/facturacion" className={({isActive}) => cn("p-3 rounded-full transition-colors", isActive ? "text-jengibre-primary bg-gray-800" : "text-gray-400")}>
          <FileText size={24} />
        </NavLink>
        <NavLink to="/clientes" className={({isActive}) => cn("p-3 rounded-full transition-colors", isActive ? "text-jengibre-primary bg-gray-800" : "text-gray-400")}>
          <Briefcase size={24} />
        </NavLink>
        <button onClick={() => setMobileMenuOpen(true)} className="p-3 text-gray-400 rounded-full">
          <Menu size={24} />
        </button>
      </nav>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-y-auto flex flex-col pb-16 md:pb-0 relative">
        <div className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
          <Outlet />
        </div>
      </main>

    </div>
  );
}