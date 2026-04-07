import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Index from "./pages/Index";
import Clientes from "./pages/Clientes";
import Facturacion from "./pages/Facturacion";
import Equipo from "./pages/Equipo";
import Caja from "./pages/Caja";
import Compras from "./pages/Compras";
import Proyeccion from "./pages/Proyeccion";
import SaludFinanciera from "./pages/SaludFinanciera";
import Configuracion from "./pages/Configuracion";
import Contadora from "./pages/Contadora";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const Placeholder = ({ title }: { title: string }) => (
  <div className="animate-in fade-in flex flex-col items-center justify-center h-64 text-center">
    <h2 className="text-3xl font-display font-bold text-jengibre-primary mb-2">{title}</h2>
    <p className="text-gray-500 font-sans">Módulo en construcción 🚀</p>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route element={<Layout />}>
              <Route path="/" element={<Index />} />
              <Route path="/clientes" element={<Clientes />} />
              <Route path="/facturacion" element={<Facturacion />} />
              <Route path="/equipo" element={<Equipo />} />
              <Route path="/caja" element={<Caja />} />
              <Route path="/recuperos" element={<Placeholder title="Recuperos Pendientes" />} />
              <Route path="/compras" element={<Compras />} />
              <Route path="/proyeccion" element={<Proyeccion />} />
              <Route path="/salud" element={<SaludFinanciera />} />
              <Route path="/contadora" element={<Contadora />} />
              <Route path="/configuracion" element={<Configuracion />} />
            </Route>
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;