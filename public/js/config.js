// Identidad del taller: cambiá estos valores y toda la app se adapta.
export const BRAND = {
  name: "ShuryStore",
  tagline: "Taller de sublimación",
};

// Backend (Supabase). La anon key es pública por diseño: la seguridad vive en
// las políticas RLS y en los RPC/Edge Functions del servidor, no en esta clave.
export const SUPABASE = {
  url: "https://giqlbmgaszqgvzorhdxr.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpcWxibWdhc3pxZ3Z6b3JoZHhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzNDk1ODEsImV4cCI6MjEwOTkyNTU4MX0.mbl-OV0gbl5Ncf4ljZ-aeFG2pbv_gox9YHHQdbTOfss",
};
