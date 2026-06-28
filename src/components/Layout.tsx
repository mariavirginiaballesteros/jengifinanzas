import React from 'react';
import { NavLink, useLocation, Outlet } from 'react-router-dom';
import { LayoutDashboard, Wallet, HeartPulse, Users, FileText, Receipt, ShoppingCart, LogOut, Calculator } from 'lucide-react';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: Wallet, label: 'Caja', path: '/caja' },
  { icon: HeartPulse, label: 'Salud Financiera', path: '/salud' },
  { icon: Users, label: 'Clientes', path: '/clientes' },
  { icon: FileText, label: 'Facturación', path: '/facturacion' },
  { icon: Calculator, label: 'Cotizador', path: '/cotizador' },
  { icon: Users, label: 'Equipo', path: '/equipo' },
  { icon: Receipt, label: 'Recuperos', path: '/recuperos' },
  { icon: ShoppingCart, label: 'Compras', path: '/compras' },
];

export default function Layout() {
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Sidebar */}
      <aside className="w-72 bg-slate-900 text-white flex flex-col sticky top-0 h-screen shadow-2xl z-40">
        <div className="p-10">
          <div className="bg-white/5 rounded-3xl p-6 border border-white/10 flex flex-col items-center text-center group hover:bg-white/10 transition-all">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-4 shadow-lg group-hover:scale-105 transition-transform">
              <img
                src="https://szflrpyvxfowfmskamge.supabase.co/storage/v1/object/public/assets/logo-jengibre.png"
                alt="Jengibre"
                className="w-10 h-10 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://ui-avatars.com/api/?name=J&background=0f172a&color=fff';
                }}
              />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-1">Software de Gestión</p>
            <h2 className="text-xs font-bold text-jengibre-secondary uppercase tracking-widest">Calidad Jengibre</h2>
          </div>
        </div>

        <nav className="flex-1 px-6 space-y-1 overflow-y-auto custom-scrollbar pb-10">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `
                flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 group
                ${isActive
                  ? 'bg-jengibre-primary text-white shadow-lg shadow-jengibre-primary/20'
                  : 'text-white/50 hover:text-white hover:bg-white/5'}
              `}
            >
              <item.icon size={20} className="shrink-0" />
              <span className="text-sm font-bold tracking-tight">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-6 border-t border-white/5">
          <button className="flex items-center gap-4 px-5 py-4 w-full rounded-2xl text-white/40 hover:text-rose-400 hover:bg-rose-400/10 transition-all group">
            <LogOut size={20} />
            <span className="text-sm font-bold tracking-tight">Salir</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-12 max-w-7xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  );
}
