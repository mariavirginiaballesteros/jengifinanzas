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
    <div className="min-h-screen bg-jengibre-cream flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-display font-bold text-jengibre-primary mb-2">🌱 Jengibre</h1>
        <p className="text-jengibre-dark font-sans">Administración Financiera</p>
      </div>
      
      <div className="bg-jengibre-white p-8 rounded-2xl shadow-sm border border-jengibre-border w-full max-w-md">
        <Auth
          supabaseClient={supabase}
          providers={[]}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: '#C8522A',
                  brandAccent: '#A64120',
                  inputText: '#2C2C2C',
                  inputBackground: '#FFFFFF',
                  inputBorder: '#D4B896',
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
              button: 'font-bold rounded-lg',
              input: 'rounded-lg',
            }
          }}
          localization={{
            variables: {
              sign_in: {
                email_label: 'Correo electrónico',
                password_label: 'Contraseña',
                button_label: 'Ingresar',
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