import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';

export default function Login() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen bg-[#F2E8D9] flex items-center justify-center">Cargando...</div>;
  }

  if (session) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#F2E8D9]">
      
      <div className="mb-8 text-center flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-sm">
        <div className="w-32 h-32 rounded-full shadow-xl mb-5 overflow-hidden border-4 border-white bg-white shrink-0">
          <img 
            src="/Logo IG.jpg" 
            alt="Logo Jengibre" 
            className="w-full h-full object-cover"
            onError={(e) => { e.currentTarget.src = 'https://ui-avatars.com/api/?name=Jengibre&background=C8522A&color=fff'; }}
          />
        </div>
        <div className="bg-white px-6 py-2.5 rounded-full shadow-sm border border-gray-200">
          <p className="text-sm text-jengibre-dark font-sans font-medium uppercase tracking-widest">
            Software de Gestión <span className="text-jengibre-primary font-bold">calidad Jengibre</span>
          </p>
        </div>
      </div>
      
      <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 w-full max-w-md animate-in fade-in zoom-in-95 duration-500 delay-150">
        <Auth
          supabaseClient={supabase}
          providers={[]}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: '#1A2E26',
                  brandAccent: '#C8522A',
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