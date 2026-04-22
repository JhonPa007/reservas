import React, { useState, useEffect } from 'react';
import { ChevronRight, Calendar, Clock, MapPin, User, Scissors, CheckCircle } from 'lucide-react';

const API_BASE = 'http://localhost:5001/api';

export default function BookingView() {
    const [step, setStep] = useState(1);
    const [sucursales, setSucursales] = useState([]);
    const [servicios, setServicios] = useState([]);
    const [empleados, setEmpleados] = useState([]);
    const [slots, setSlots] = useState([]);

    const [selection, setSelection] = useState({
        sucursal: null,
        servicio: null,
        empleado: null,
        fecha: '',
        hora: ''
    });

    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetch(`${API_BASE}/sucursales`)
            .then(res => res.json())
            .then(data => setSucursales(data));
    }, []);

    useEffect(() => {
        if (selection.sucursal) {
            fetch(`${API_BASE}/servicios`)
                .then(res => res.json())
                .then(data => setServicios(data));

            fetch(`${API_BASE}/empleados/${selection.sucursal.id}`)
                .then(res => res.json())
                .then(data => setEmpleados(data));
        }
    }, [selection.sucursal]);

    useEffect(() => {
        if (selection.sucursal && selection.servicio && selection.fecha) {
            const empId = selection.empleado?.id || 0;
            fetch(`${API_BASE}/disponibilidad?sucursalId=${selection.sucursal.id}&empleadoId=${empId}&fecha=${selection.fecha}`)
                .then(res => res.json())
                .then(data => setSlots(data));
        }
    }, [selection.empleado, selection.servicio, selection.fecha]);

    const handleBooking = async () => {
        setLoading(true);
        try {
            const finalEmpleadoId = selection.empleado?.id === 0 ? (empleados[0]?.id || 1) : selection.empleado?.id;
            const response = await fetch(`${API_BASE}/reservas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sucursal_id: selection.sucursal.id,
                    empleado_id: finalEmpleadoId,
                    servicio_id: selection.servicio.id,
                    fecha_hora_inicio: `${selection.fecha}T${selection.hora}:00`,
                    fecha_hora_fin: `${selection.fecha}T${selection.hora}:30`,
                    notas_cliente: 'Reserva desde App Inspirada en Fresha'
                })
            });
            if (response.ok) setStep(6);
        } catch (error) {
            alert('Error al realizar la reserva');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="client-view">
            <header>
                <div className="logo">JV RESERVAS</div>
                <div className="step-indicator">
                    {[1, 2, 3, 4, 5].map(s => (
                        <div key={s} className={`step ${step >= s ? 'active' : ''}`} />
                    ))}
                </div>
            </header>
            <main className="container">
                {step === 1 && (
                    <section>
                        <h2>Selecciona una sucursal</h2>
                        <div className="grid">
                            {sucursales.map(s => (
                                <div key={s.id} className="card" onClick={() => { setSelection({ ...selection, sucursal: s }); setStep(2); }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <MapPin size={24} color="#6B7280" />
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{s.nombre}</div>
                                            <div style={{ fontSize: '0.875rem', color: '#6B7280' }}>{s.direccion}, {s.ciudad}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
                {step === 2 && (
                    <section>
                        <h2>Elige un servicio</h2>
                        <button className="btn-secondary" style={{ marginBottom: '1rem', width: 'auto' }} onClick={() => setStep(1)}>Volver</button>
                        <div className="grid">
                            {servicios.map(s => (
                                <div key={s.id} className="card" onClick={() => { setSelection({ ...selection, servicio: s }); setStep(3); }}>
                                    <div className="service-info">
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{s.nombre}</div>
                                            <div className="duration">{s.duracion_minutos} min</div>
                                        </div>
                                        <div className="price">S/ {s.precio}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
                {step === 3 && (
                    <section>
                        <h2>¿Con quién deseas atenderte?</h2>
                        <button className="btn-secondary" style={{ marginBottom: '1rem', width: 'auto' }} onClick={() => setStep(2)}>Volver</button>
                        <div className="grid">
                            <div className="card" onClick={() => { setSelection({ ...selection, empleado: { id: 0, nombre_display: 'Cualquier profesional' } }); setStep(4); }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <User size={24} />
                                    <div style={{ fontWeight: 600 }}>Cualquier profesional</div>
                                </div>
                            </div>
                            {empleados.map(e => (
                                <div key={e.id} className="card" onClick={() => { setSelection({ ...selection, empleado: e }); setStep(4); }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div className="professional-avatar">{(e.nombre_display || e.nombres)[0]}</div>
                                        <div style={{ fontWeight: 600 }}>{e.nombre_display || `${e.nombres} ${e.apellidos}`}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
                {step === 4 && (
                    <section>
                        <h2>Selecciona fecha y hora</h2>
                        <button className="btn-secondary" style={{ marginBottom: '1rem', width: 'auto' }} onClick={() => setStep(3)}>Volver</button>
                        <div className="card">
                            <input type="date" value={selection.fecha} style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem' }} onChange={(e) => setSelection({ ...selection, fecha: e.target.value })} />
                            <div className="time-slots">
                                {slots.map(t => (
                                    <div key={t} className={`time-slot ${selection.hora === t ? 'selected' : ''}`} onClick={() => setSelection({ ...selection, hora: t })}>
                                        {t}
                                    </div>
                                ))}
                            </div>
                        </div>
                        {selection.hora && <button className="btn" onClick={() => setStep(5)}>Continuar</button>}
                    </section>
                )}
                {step === 5 && (
                    <section>
                        <h2>Confirma tu cita</h2>
                        <div className="card">
                            <p><strong>Servicio:</strong> {selection.servicio?.nombre}</p>
                            <p><strong>Fecha:</strong> {selection.fecha} {selection.hora}</p>
                            <p><strong>Profesional:</strong> {selection.empleado?.nombre_display || 'Cualquiera'}</p>
                        </div>
                        <button className="btn" disabled={loading} onClick={handleBooking}>{loading ? 'Cargando...' : 'Reservar'}</button>
                    </section>
                )}
                {step === 6 && (
                    <section style={{ textAlign: 'center' }}>
                        <CheckCircle size={64} color="#10B981" />
                        <h2>¡Listo!</h2>
                        <button className="btn" onClick={() => setStep(1)}>Nueva reserva</button>
                    </section>
                )}
            </main>
        </div>
    );
}
