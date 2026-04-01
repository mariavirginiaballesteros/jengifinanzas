import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';

export default function Login() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen bg-jengibre-cream flex items-center justify-center">Cargando...</div>;
  }

  if (session) {
    return <Navigate to="/" replace />;
  }

  return (
    <div 
      className="min-h-screen flex flex-col items-center justify-center p-4 relative bg-cover bg-center"
      style={{ backgroundImage: "url('/Fondo.jpg')", backgroundColor: '#F2E8D9' }}
    >
      {/* Overlay para dar legibilidad al fondo texturado */}
      <div className="absolute inset-0 bg-[#F2E8D9]/60 backdrop-blur-[2px] z-0"></div>
      
      <div className="z-10 mb-8 text-center flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-700">
        <img 
          src="/Logo%20IG.jpg" 
          alt="Logo Jengibre" 
          className="w-32 h-32 rounded-full shadow-2xl object-cover border-4 border-white mb-5" 
        />
        <div className="bg-white/80 backdrop-blur-md px-6 py-2.5 rounded-full shadow-sm border border-white/50">
          <p className="text-sm text-jengibre-dark font-sans font-medium uppercase tracking-widest">
            Software de Gestión <span className="text-jengibre-primary font-bold">calidad Jengibre</span>
          </p>
        </div>
      </div>
      
      <div className="z-10 bg-white/95 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-white/50 w-full max-w-md animate-in fade-in zoom-in-95 duration-500 delay-150">
        <Auth
          supabaseClient={supabase}
          providers={[]}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: '#1A2E26', // Verde oscuro del logo
                  brandAccent: '#C8522A', // Naranja jengibre
                  inputText: '#2C2C2C',
                  inputBackground: '#FFFFFF',
                  inputBorder: '#E8D5C0',
                  inputBorderFocus: '#C8522A',
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
              label: 'font-medium text-gray-700'
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