"use client";

import { FormEvent, useState } from "react";
import InnerHeader from "../components/InnerHeader";
import { HOME_FOR_ROLE, useAuth } from "../lib/auth";

export default function RegisterPage() {
  const { loginAs } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({});

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = "El nombre es obligatorio (mínimo 2 caracteres).";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "Ingresa un correo válido.";
    if (password.length < 6) next.password = "Mínimo 6 caracteres (igual que en el backend).";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    // POST /api/auth/register al conectar la API real; hoy crea sesión demo.
    loginAs("usuario");
    window.location.href = HOME_FOR_ROLE.usuario;
  }

  return <><InnerHeader /><main className="auth-page"><div className="auth-panel"><div className="auth-copy"><p className="eyebrow light">Portal de clientes</p><h1>Crea tu cuenta<br /><em>en un minuto.</em></h1><p>Registra tus vehículos, agenda servicios y sigue tus atenciones desde un solo lugar.</p><span className="auth-mark">GC</span></div><div className="auth-form"><a className="back-link" href="/">← Volver al inicio</a><p className="eyebrow">Registro</p><h2>Hola, ¿nos presentamos?</h2><form onSubmit={submit} noValidate><label>Nombre completo<input required placeholder="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} />{errors.name && <small className="field-error">{errors.name}</small>}</label><label>Correo electrónico<input required type="email" placeholder="nombre@empresa.cl" value={email} onChange={(e) => setEmail(e.target.value)} />{errors.email && <small className="field-error">{errors.email}</small>}</label><div className="form-row"><label>Teléfono<input type="tel" placeholder="+56 9 ..." value={phone} onChange={(e) => setPhone(e.target.value)} /></label><label>Contraseña<input required type="password" placeholder="Mínimo 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} />{errors.password && <small className="field-error">{errors.password}</small>}</label></div><button className="button" type="submit">Crear cuenta <span>↗</span></button></form><p className="auth-note">¿Ya tienes cuenta? <a href="/login">Inicia sesión</a></p></div></div></main></>;
}
