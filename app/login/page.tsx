"use client";

import { FormEvent, useState } from "react";
import InnerHeader from "../components/InnerHeader";

export default function LoginPage() {
  const [sent, setSent] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSent(true); }
  return <><InnerHeader /><main className="auth-page"><div className="auth-panel"><div className="auth-copy"><p className="eyebrow light">Portal de clientes</p><h1>Todo tu servicio,<br /><em>en un solo lugar.</em></h1><p>Ingresa para revisar tus solicitudes, datos de contacto y próximos servicios.</p><span className="auth-mark">GC</span></div><div className="auth-form"><a className="back-link" href="/">← Volver al inicio</a>{sent ? <div className="success auth-success"><span>✓</span><h2>Acceso solicitado</h2><p>Este es un mockup. La conexión con el portal se habilitará en la siguiente etapa.</p><a className="button" href="/">Volver a la web <span>↗</span></a></div> : <><p className="eyebrow">Iniciar sesión</p><h2>Bienvenido de vuelta.</h2><form onSubmit={submit}><label>Correo electrónico<input required type="email" placeholder="nombre@empresa.cl" /></label><label>Contraseña<input required type="password" placeholder="••••••••" /></label><div className="form-options"><label className="check"><input type="checkbox" /> Recordarme</label><a href="#recuperar">¿Olvidaste tu contraseña?</a></div><button className="button" type="submit">Ingresar <span>↗</span></button></form><p className="auth-note">¿Aún no tienes cuenta? <a href="/agendar">Solicita tu primer servicio</a></p></>}</div></div></main></>;
}
