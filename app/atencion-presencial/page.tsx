"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import InnerFooter from "../components/InnerFooter";
import AreaNav from "../components/AreaNav";
import LogoutButton from "../components/LogoutButton";
import Icon from "../components/Icon";
import { ApiError } from "../lib/api";
import type { ApiService } from "../lib/api-types";
import { listServices, type CreatedAppointment } from "../lib/appointments-api";
import { useAuth } from "../lib/auth";
import { CATEGORY_INFO, groupServices, serviceHint, slotStatusLabel, type BookingCategory } from "../lib/booking";
import { todayInSantiago } from "../lib/dates";
import { formatPlate, isValidChileanPlate, normalizePlate } from "../lib/plate";
import type { PortalVehicle } from "../lib/portal-types";
import { rolesOf } from "../lib/route-guard";
import { formatRut, isValidRut, normalizeRut, whatsappUrl } from "../lib/rut";
import { useAvailability } from "../lib/use-availability";
import {
  createWalkInAppointment,
  createWalkInClient,
  lookupClientByRut,
  type WalkInClient,
} from "../lib/walk-in-api";

export default function WalkInPage() {
  const { user } = useAuth();
  const canCreateClient = Boolean(user && rolesOf(user).some((r) => r === "vendedor"));

  // Búsqueda por RUT
  const [rutQuery, setRutQuery] = useState("");
  const [rutError, setRutError] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchedRut, setSearchedRut] = useState<string | null>(null);
  const [client, setClient] = useState<WalkInClient | null>(null);
  const [vehicles, setVehicles] = useState<PortalVehicle[]>([]);

  // Datos de registro presencial (cuando el cliente no existe)
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [clientErrors, setClientErrors] = useState<{ name?: string; phone?: string; email?: string; form?: string }>({});
  const [registeringOnly, setRegisteringOnly] = useState(false);
  const [registeredNotice, setRegisteredNotice] = useState("");

  // Vehículo para la cita
  const [vehicleMode, setVehicleMode] = useState<"existing" | "new" | "none">("none");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [plate, setPlate] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [vehicleErrors, setVehicleErrors] = useState<{ plate?: string; brand?: string; model?: string; year?: string }>({});

  // Servicios y disponibilidad
  const [services, setServices] = useState<ApiService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState("");
  const [category, setCategory] = useState<BookingCategory>("serviteca");
  const [serviceId, setServiceId] = useState("");
  const [today, setToday] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [timeError, setTimeError] = useState(false);
  const [location, setLocation] = useState("Taller Villarrica");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [createdAppointment, setCreatedAppointment] = useState<{
    appointment: CreatedAppointment;
    clientName: string;
    clientRut: string;
    clientPhone: string | null;
    clientEmail: string | null;
    vehicleSummary?: string;
  } | null>(null);

  const { slots, loading: slotsLoading, error: slotsError, refresh: refreshSlots } = useAvailability(date);
  const grouped = useMemo(() => groupServices(services), [services]);
  const availableServices = grouped[category];
  const selectedService = services.find((item) => item.id === serviceId);

  useEffect(() => {
    const current = todayInSantiago();
    setToday(current);
    setDate(current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setServicesLoading(true);
    listServices()
      .then((list) => {
        if (cancelled) return;
        setServices(list);
        const initial = groupServices(list).serviteca[0] ?? list[0];
        if (initial) {
          setCategory(initial.category === "grua" ? "gruas" : "serviteca");
          setServiceId(initial.id);
        }
      })
      .catch((err) => {
        if (!cancelled) setServicesError(err instanceof Error ? err.message : "No se pudieron cargar los servicios.");
      })
      .finally(() => {
        if (!cancelled) setServicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function changeCategory(next: BookingCategory) {
    setCategory(next);
    setServiceId(grouped[next][0]?.id ?? "");
    setTime("");
    setTimeError(false);
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRutError("");
    setRegisteredNotice("");
    setFormError("");
    setCreatedAppointment(null);

    if (!isValidRut(rutQuery)) {
      setRutError("Ingresa un RUT chileno válido (ej. 12.345.678-5).");
      return;
    }

    const formatted = formatRut(rutQuery);
    setRutQuery(formatted);
    setSearching(true);
    try {
      const result = await lookupClientByRut(formatted);
      setSearchedRut(normalizeRut(formatted));
      if (result) {
        setClient(result.client);
        setVehicles(result.vehicles);
        if (result.vehicles.length > 0) {
          setVehicleMode("existing");
          setSelectedVehicleId(result.vehicles[0].id);
        } else {
          setVehicleMode("new");
          setSelectedVehicleId("");
        }
      } else {
        setClient(null);
        setVehicles([]);
        setVehicleMode("new");
        setSelectedVehicleId("");
        setNewName("");
        setNewPhone("");
        setNewEmail("");
        setClientErrors({});
      }
    } catch (err) {
      setRutError(err instanceof Error ? err.message : "No se pudo consultar el RUT.");
    } finally {
      setSearching(false);
    }
  }

  function validateNewClientFields(): boolean {
    const next: typeof clientErrors = {};
    if (newName.trim().length < 2) next.name = "El nombre completo es obligatorio (mínimo 2 caracteres).";
    if (newPhone.trim().length < 6) next.phone = "El teléfono es obligatorio para contactar al cliente.";
    if (newEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
      next.email = "Ingresa un correo electrónico válido o déjalo en blanco.";
    }
    setClientErrors(next);
    return Object.keys(next).length === 0;
  }

  function validateNewVehicleFields(): boolean {
    if (vehicleMode !== "new") {
      setVehicleErrors({});
      return true;
    }
    const next: typeof vehicleErrors = {};
    if (!isValidChileanPlate(plate)) next.plate = "Patente inválida (ej. ABCD12 o AB1234).";
    if (brand.trim().length < 2) next.brand = "Ingresa la marca.";
    if (model.trim().length < 1) next.model = "Ingresa el modelo.";
    if (year.trim()) {
      const num = Number(year);
      if (!Number.isInteger(num) || num < 1950 || num > new Date().getFullYear() + 1) {
        next.year = "Año inválido.";
      }
    }
    setVehicleErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleRegisterOnly() {
    if (!searchedRut || registeringOnly || submitting) return;
    setRegisteredNotice("");
    setFormError("");
    if (!validateNewClientFields()) return;

    setRegisteringOnly(true);
    try {
      const created = await createWalkInClient({
        name: newName.trim(),
        rut: searchedRut,
        phone: newPhone.trim(),
        email: newEmail.trim() || undefined,
      });
      setClient(created);
      setVehicles([]);
      setVehicleMode("new");
      setRegisteredNotice("Ficha presencial registrada con éxito. Ahora puedes agendarle una atención si lo deseas.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo registrar el cliente.";
      setClientErrors({ form: message });
    } finally {
      setRegisteringOnly(false);
    }
  }

  async function handleCreateAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!searchedRut || submitting || registeringOnly) return;
    setFormError("");
    setRegisteredNotice("");

    if (!client && !validateNewClientFields()) return;
    if (!validateNewVehicleFields()) return;

    if (!selectedService) {
      setFormError("Selecciona un servicio.");
      return;
    }
    if (!time) {
      setTimeError(true);
      return;
    }

    setSubmitting(true);
    try {
      const newVehiclePayload =
        vehicleMode === "new"
          ? {
              plate: normalizePlate(plate),
              brand: brand.trim(),
              model: model.trim(),
              ...(year.trim() ? { year: Number(year) } : {}),
            }
          : undefined;

      const appointment = await createWalkInAppointment({
        serviceId: selectedService.id,
        scheduledDate: date,
        timeSlot: time,
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
        ...(client
          ? { userId: client.id, rut: client.rut }
          : {
              client: {
                name: newName.trim(),
                rut: searchedRut,
                phone: newPhone.trim(),
                ...(newEmail.trim() ? { email: newEmail.trim() } : {}),
              },
            }),
        ...(vehicleMode === "existing" && selectedVehicleId ? { vehicleId: selectedVehicleId } : {}),
        ...(newVehiclePayload ? { newVehicle: newVehiclePayload } : {}),
      });

      const chosenExisting = vehicles.find((v) => v.id === selectedVehicleId);
      const vehicleSummary =
        vehicleMode === "new"
          ? `${brand.trim()} ${model.trim()} (${formatPlate(plate)})`
          : chosenExisting
          ? `${chosenExisting.brand} ${chosenExisting.model} (${formatPlate(chosenExisting.plate)})`
          : undefined;

      setCreatedAppointment({
        appointment,
        clientName: client ? client.name : newName.trim(),
        clientRut: client ? client.rut : searchedRut,
        clientPhone: client ? client.phone : newPhone.trim(),
        clientEmail: client ? client.email : newEmail.trim() || null,
        vehicleSummary,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo agendar la atención.";
      setFormError(message);
      if (err instanceof ApiError && err.status === 409) {
        setTime("");
        refreshSlots();
      }
    } finally {
      setSubmitting(false);
    }
  }

  function resetSearch() {
    setSearchedRut(null);
    setClient(null);
    setVehicles([]);
    setCreatedAppointment(null);
    setRegisteredNotice("");
    setFormError("");
    setRutQuery("");
    setPlate("");
    setBrand("");
    setModel("");
    setYear("");
    setTime("");
  }

  const clientWa = client ? whatsappUrl(client.phone) : null;
  const createdWa = createdAppointment
    ? whatsappUrl(
        createdAppointment.clientPhone,
        `Hola ${createdAppointment.clientName}, te escribimos de Grúas Cares por tu atención de ${createdAppointment.appointment.serviceName} agendada para el ${createdAppointment.appointment.scheduledDate} a las ${createdAppointment.appointment.timeSlot} hrs.`
      )
    : null;

  return (
    <>
      <main className="inner-page portal-page">
        <section className="page-intro wrap portal-intro">
          <div>
            <p className="eyebrow">Atención en mesón y taller</p>
            <h1>Atención presencial <em>por RUT.</em></h1>
          </div>
          <div>
            <p className="portal-subtext">
              Busca al cliente por su RUT para agendarle un servicio o registrar su ficha presencial si aún no tiene cuenta web.
            </p>
            <LogoutButton />
          </div>
        </section>

        <div className="portal-stack wrap">
          <AreaNav />

          <section aria-label="Buscar cliente por RUT" className="portal-card">
            <div className="portal-row-head">
              <h2>Paso 1: Buscar cliente por RUT</h2>
            </div>
            <form onSubmit={handleSearch} noValidate className="filter-bar">
              <input
                className="filter-search"
                placeholder="Ej: 12.345.678-5"
                aria-label="RUT del cliente"
                value={rutQuery}
                onChange={(e) => setRutQuery(e.target.value)}
                onBlur={() => {
                  if (isValidRut(rutQuery)) setRutQuery(formatRut(rutQuery));
                }}
              />
              <button type="submit" className="button button-sm" disabled={searching}>
                {searching ? "Buscando…" : <>Buscar por RUT <span>↗</span></>}
              </button>
              {searchedRut && (
                <button type="button" className="toggle-btn" onClick={resetSearch}>
                  Limpiar búsqueda
                </button>
              )}
            </form>
            {rutError && <p className="field-error" role="alert">{rutError}</p>}
          </section>

          {createdAppointment && (
            <section className="success booking-success" role="status">
              <span><Icon name="check" bare /></span>
              <h2>¡Atención presencial registrada!</h2>
              <p>
                Quedó agendada la solicitud de <strong>{createdAppointment.appointment.serviceName}</strong> para{" "}
                <b>{createdAppointment.clientName}</b> ({formatRut(createdAppointment.clientRut)}) el día{" "}
                <b>{createdAppointment.appointment.scheduledDate}</b> a las <b>{createdAppointment.appointment.timeSlot} hrs</b>
                {createdAppointment.vehicleSummary ? <> · Vehículo: <b>{createdAppointment.vehicleSummary}</b></> : null}.
              </p>
              {!createdAppointment.clientEmail ? (
                <div className="success-instruction">
                  <p>
                    <b>Sin correo electrónico registrado:</b> este cliente no recibe avisos automáticos por correo. Coordina o confírmale directamente por teléfono o WhatsApp:
                  </p>
                  {createdAppointment.clientPhone && (
                    <div className="vehicle-actions" style={{ marginTop: "8px" }}>
                      <a className="button button-sm" href={`tel:${createdAppointment.clientPhone}`}>
                        <Icon name="phone" />Llamar ({createdAppointment.clientPhone})
                      </a>
                      {createdWa && (
                        <a className="toggle-btn" href={createdWa} target="_blank" rel="noopener noreferrer">
                          WhatsApp ↗
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="success-instruction">
                  <p>Contacto del cliente: <b>{createdAppointment.clientEmail}</b>{createdAppointment.clientPhone ? ` · ${createdAppointment.clientPhone}` : ""}.</p>
                </div>
              )}
              <div className="success-actions">
                <button type="button" className="button" onClick={resetSearch}>
                  Atender a otro cliente
                </button>
              </div>
            </section>
          )}

          {searchedRut && !createdAppointment && (
            <>
              {client ? (
                <section aria-label="Datos del cliente encontrado" className="portal-card">
                  <div className="portal-card-top">
                    <span className="role-badge role-usuario">
                      {client.hasAccount ? "Cuenta web activa" : "Perfil presencial"}
                    </span>
                    <span className="portal-slot">{formatRut(client.rut)}</span>
                  </div>
                  <h3><Icon name="user" />{client.name}</h3>
                  <div className="mechanic-card-details">
                    <p>
                      <b>Correo:</b>{" "}
                      {client.email ? (
                        client.email
                      ) : (
                        <span className="role-badge role-vendedor">Perfil presencial (sin correo · sin avisos automáticos)</span>
                      )}
                    </p>
                    <p>
                      <Icon name="phone" /><b>Teléfono:</b>{" "}
                      {client.phone ? (
                        <>
                          <a href={`tel:${client.phone}`}>{client.phone}</a>{" "}
                          <a className="toggle-btn" href={`tel:${client.phone}`}>Llamar</a>{" "}
                          {clientWa && (
                            <a className="toggle-btn" href={clientWa} target="_blank" rel="noopener noreferrer">
                              WhatsApp ↗
                            </a>
                          )}
                        </>
                      ) : (
                        "Sin teléfono registrado"
                      )}
                    </p>
                  </div>
                  {registeredNotice && (
                    <p className="portal-note-box" role="status">
                      <Icon name="checkCircle" />{registeredNotice}
                    </p>
                  )}
                </section>
              ) : !canCreateClient ? (
                <section aria-label="Cliente no encontrado" className="portal-empty-card" role="alert">
                  <h3><Icon name="alert" />No existe un cliente con el RUT {formatRut(searchedRut)}</h3>
                  <p>
                    No existe un cliente con el RUT ingresado. Solo Ventas o Administración pueden registrar clientes nuevos; pídele a secretaría/ventas que lo registre o ingresa el RUT de un cliente ya registrado.
                  </p>
                </section>
              ) : (
                <section aria-label="Registro presencial de cliente nuevo" className="portal-card">
                  <div className="portal-card-top">
                    <span className="role-badge role-vendedor">Cliente nuevo</span>
                    <span className="portal-slot">RUT {formatRut(searchedRut)}</span>
                  </div>
                  <h3>Registrar ficha presencial</h3>
                  <p className="portal-subtext">
                    Crea la ficha del cliente con su RUT y teléfono. Si más adelante se registra en la web con su RUT y confirma su correo, verá automáticamente sus vehículos e historial.
                  </p>
                  <div className="wide-form" style={{ marginTop: "12px" }}>
                    <div className="form-row">
                      <label>
                        Nombre completo *
                        <input
                          required
                          placeholder="Nombre y apellido"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                        />
                        {clientErrors.name && <small className="field-error">{clientErrors.name}</small>}
                      </label>
                      <label>
                        RUT *
                        <input value={formatRut(searchedRut)} disabled readOnly />
                      </label>
                    </div>
                    <div className="form-row">
                      <label>
                        Teléfono *
                        <input
                          required
                          type="tel"
                          placeholder="+56 9 ..."
                          value={newPhone}
                          onChange={(e) => setNewPhone(e.target.value)}
                        />
                        {clientErrors.phone && <small className="field-error">{clientErrors.phone}</small>}
                      </label>
                      <label>
                        Correo electrónico (opcional)
                        <input
                          type="email"
                          placeholder="Sin correo = contacto por teléfono o WhatsApp"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                        />
                        {clientErrors.email && <small className="field-error">{clientErrors.email}</small>}
                        <small className="service-hint">
                          Si no tiene correo, no recibirá avisos automáticos; la ficha mostrará botones para llamarlo o escribirle por WhatsApp.
                        </small>
                      </label>
                    </div>
                    {clientErrors.form && <p className="field-error" role="alert">{clientErrors.form}</p>}
                    <div className="vehicle-actions">
                      <button
                        type="button"
                        className="toggle-btn"
                        disabled={registeringOnly || submitting}
                        onClick={() => void handleRegisterOnly()}
                      >
                        {registeringOnly ? "Guardando ficha…" : "Solo registrar ficha del cliente"}
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {(client || canCreateClient) && (
                <form onSubmit={handleCreateAppointment} noValidate className="wide-form">
                  <div className="form-heading">
                    <div>
                      <span>Paso 2: Vehículo para la atención</span>
                      <small>Elige un vehículo registrado del cliente o inscribe uno nuevo en el momento</small>
                    </div>
                  </div>

                  <div className="filter-pills" role="radiogroup" aria-label="Selección de vehículo">
                    {vehicles.length > 0 && (
                      <button
                        type="button"
                        className={vehicleMode === "existing" ? "filter-pill selected" : "filter-pill"}
                        onClick={() => setVehicleMode("existing")}
                      >
                        Vehículo registrado ({vehicles.length})
                      </button>
                    )}
                    <button
                      type="button"
                      className={vehicleMode === "new" ? "filter-pill selected" : "filter-pill"}
                      onClick={() => setVehicleMode("new")}
                    >
                      + Registrar vehículo nuevo en el momento
                    </button>
                    <button
                      type="button"
                      className={vehicleMode === "none" ? "filter-pill selected" : "filter-pill"}
                      onClick={() => setVehicleMode("none")}
                    >
                      Sin especificar vehículo
                    </button>
                  </div>

                  {vehicleMode === "existing" && vehicles.length > 0 && (
                    <label>
                      <span><Icon name="car" />Vehículo del cliente</span>
                      <select value={selectedVehicleId} onChange={(e) => setSelectedVehicleId(e.target.value)}>
                        {vehicles.map((v) => (
                          <option key={v.id} value={v.id}>
                            {formatPlate(v.plate)} · {v.brand} {v.model}{v.year ? ` (${v.year})` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {vehicleMode === "new" && (
                    <div className="form-row">
                      <label>
                        Patente *
                        <input
                          placeholder="ABCD12"
                          value={plate}
                          onChange={(e) => setPlate(e.target.value.toUpperCase())}
                        />
                        {vehicleErrors.plate && <small className="field-error">{vehicleErrors.plate}</small>}
                      </label>
                      <label>
                        Marca *
                        <input
                          placeholder="Ej: Toyota"
                          value={brand}
                          onChange={(e) => setBrand(e.target.value)}
                        />
                        {vehicleErrors.brand && <small className="field-error">{vehicleErrors.brand}</small>}
                      </label>
                      <label>
                        Modelo *
                        <input
                          placeholder="Ej: Hilux"
                          value={model}
                          onChange={(e) => setModel(e.target.value)}
                        />
                        {vehicleErrors.model && <small className="field-error">{vehicleErrors.model}</small>}
                      </label>
                      <label>
                        Año (opcional)
                        <input
                          type="number"
                          placeholder="Ej: 2021"
                          value={year}
                          onChange={(e) => setYear(e.target.value)}
                        />
                        {vehicleErrors.year && <small className="field-error">{vehicleErrors.year}</small>}
                      </label>
                    </div>
                  )}

                  <div className="form-heading" style={{ marginTop: "12px" }}>
                    <div>
                      <span>Paso 3: Servicio, fecha y horario</span>
                      <small>Selecciona el servicio y bloque horario de la atención</small>
                    </div>
                  </div>

                  <div className="service-category">
                    <div className="service-category-tabs" role="tablist" aria-label="Tipo de servicio">
                      {(Object.keys(CATEGORY_INFO) as BookingCategory[]).map((option) => (
                        <button
                          type="button"
                          role="tab"
                          aria-selected={category === option}
                          className={category === option ? "service-category-tab selected" : "service-category-tab"}
                          onClick={() => changeCategory(option)}
                          key={option}
                        >
                          <strong><Icon name={CATEGORY_INFO[option].icon} />{CATEGORY_INFO[option].label}</strong>
                          <small>{CATEGORY_INFO[option].description}</small>
                        </button>
                      ))}
                    </div>
                  </div>

                  {servicesError && <p className="field-error" role="alert">{servicesError}</p>}

                  <div className="form-row">
                    <label>
                      Servicio específico *
                      <select
                        value={serviceId}
                        disabled={servicesLoading || availableServices.length === 0}
                        onChange={(e) => setServiceId(e.target.value)}
                      >
                        {servicesLoading && <option value="">Cargando servicios…</option>}
                        {availableServices.map((option) => (
                          <option key={option.id} value={option.id}>{option.name}</option>
                        ))}
                      </select>
                      {selectedService && <small className="service-hint"><Icon name="timer" />{serviceHint(selectedService)}</small>}
                    </label>
                    <label>
                      Fecha de atención *
                      <input
                        required
                        type="date"
                        min={today || undefined}
                        value={date}
                        onChange={(e) => {
                          setDate(e.target.value);
                          setTime("");
                          setTimeError(false);
                        }}
                      />
                    </label>
                  </div>

                  <fieldset className="schedule-fieldset">
                    <legend>Horario *</legend>
                    <div className="time-slots" aria-busy={slotsLoading}>
                      {slotsLoading && <small>Consultando disponibilidad…</small>}
                      {!slotsLoading &&
                        slots.map((slot) => (
                          <button
                            type="button"
                            disabled={!slot.available}
                            title={slot.reason}
                            className={time === slot.time ? "time-slot selected" : "time-slot"}
                            aria-pressed={time === slot.time}
                            onClick={() => {
                              setTime(slot.time);
                              setTimeError(false);
                            }}
                            key={slot.time}
                          >
                            <span className="slot-hour">{slot.time}</span>
                            <small>{slotStatusLabel(slot)}</small>
                          </button>
                        ))}
                    </div>
                    {slotsError && (
                      <p className="field-error" role="alert">
                        {slotsError}{" "}
                        <button type="button" className="toggle-btn" onClick={refreshSlots}>Reintentar</button>
                      </p>
                    )}
                    {timeError && (
                      <p className="field-error" role="alert">
                        <Icon name="alert" />Por favor selecciona un bloque de horario.
                      </p>
                    )}
                  </fieldset>

                  <div className="form-row">
                    <label>
                      Lugar o dirección de atención
                      <input
                        placeholder="Ej: Taller Villarrica o dirección en ruta"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                      />
                    </label>
                    <label>
                      Notas u observaciones previas (opcional)
                      <input
                        placeholder="Síntomas, solicitud especial, etc."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </label>
                  </div>

                  {formError && <p className="field-error" role="alert"><Icon name="alert" />{formError}</p>}

                  <button className="button button-submit" type="submit" disabled={submitting || registeringOnly || servicesLoading || !selectedService}>
                    {submitting
                      ? "Guardando atención…"
                      : client
                      ? <>Agendar atención para {client.name} <span>↗</span></>
                      : <>Registrar cliente y agendar atención <span>↗</span></>}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </main>
      <InnerFooter />
    </>
  );
}
