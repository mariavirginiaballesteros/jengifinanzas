import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';

export default function Login() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen bg-jengibre-dark flex items-center justify-center">Cargando...</div>;
  }

  if (session) {
    return <Navigate to="/" replace />;
  }

  return (
    <div 
      className="min-h-screen flex flex-col items-center justify-center p-4 relative bg-cover bg-center"
      style={{ backgroundImage: "url('/fondo.jpg')", backgroundColor: '#2B317A' }}
    >
      <div className="absolute inset-0 bg-[#2B317A]/40 z-0"></div>
      
      <div className="z-10 mb-8 text-center flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-sm">
        <div className="w-40 h-40 rounded-3xl shadow-2xl mb-6 overflow-hidden border border-white/20 bg-[#2B317A] shrink-0">
          <img 
            src="/logo.jpg" 
            alt="Logo Jengibre" 
            className="w-full h-full object-cover"
          />
        </div>
        <div className="bg-[#2B317A]/90 backdrop-blur-md px-6 py-3 rounded-full shadow-lg border border-white/10">
          <p className="text-sm text-gray-200 font-sans font-medium uppercase tracking-widest">
            Software de Gestión <span className="text-jengibre-secondary font-bold">calidad Jengibre</span>
          </p>
        </div>
      </div>
      
      <div className="z-10 bg-white p-8 rounded-3xl shadow-2xl border border-gray-100 w-full max-w-md animate-in fade-in zoom-in-95 duration-500 delay-150">
        <h2 className="text-2xl font-display font-bold text-center text-jengibre-dark mb-6">Iniciar Sesión</h2>
        <Auth
          supabaseClient={supabase}
          providers={[]}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: '#2B317A',
                  brandAccent: '#E52E6A',
                  inputText: '#2C2C2C',
                  inputBackground: '#FFFFFF',
                  inputBorder: '#E2E8F0',
                  inputBorderFocus: '#E52E6A',
                },
                fonts: {
                  bodyFontFamily: '"DM Sans", sans-serif',
                  buttonFontFamily: '"DM Sans", sans-serif',
                  inputFontFamily: '"DM Sans", sans-serif',
                  labelFontFamily: '"DM Sans", sans-serif',
                }
              }
            },
            className: {
              container: 'font-sans',
              button: 'font-bold rounded-xl shadow-sm py-3',
              input: 'rounded-xl',
              label: 'font-bold text-gray-700'
            }
          }}
          localization={{
            variables: {
              sign_in: {
                email_label: 'Correo electrónico',
                password_label: 'Contraseña',
                button_label: 'Ingresar al sistema',
                loading_button_label: 'Ingresando...',
                email_input_placeholder: 'tu@email.com',
                password_input_placeholder: 'Tu contraseña',
              },
              sign_up: {
                email_label: 'Correo electrónico',
                password_label: 'Contraseña',
                button_label: 'Registrarse',
                loading_button_label: 'Registrando...',
                email_input_placeholder: 'tu@email.com',
                password_input_placeholder: 'Tu contraseña',
              }
            }
          }}
        />
      </div>
    </div>
  );
}