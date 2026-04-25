import React, { useState, useEffect, useRef } from 'react';
import {
    ChevronLeft, ChevronRight, Plus, Search, Calendar as CalendarIcon,
    Clock, Users, MoreHorizontal, Check, X, Filter, Download,
    Printer, Copy, Mail, Phone, MapPin, User, Settings,
    LogOut, Star, TrendingUp, Grid, List as ListIcon,
    Menu, Bell, CreditCard, ShoppingBag, Scissors,
    Trash2, Edit, Save, Share2, MessageSquare,
    ChevronDown, UserPlus, Info, ExternalLink, Calendar
} from 'lucide-react';
import {
    format, addMonths, subMonths, startOfMonth, endOfMonth,
    eachDayOfInterval, isSameMonth, isSameDay, addDays,
    subDays, startOfWeek, endOfWeek, isToday, parseISO,
    addMinutes, setHours, setMinutes, startOfDay, getHours,
    getMinutes, differenceInMinutes, isBefore, isAfter, isPast
} from 'date-fns';
import { es } from 'date-fns/locale';
import Sidebar from './Sidebar';

const API_BASE = import.meta.env.VITE_API_URL || (window.location.origin.includes('localhost') ? 'http://localhost:5001/api' : window.location.origin + '/api');

const safeDate = (date) => {
    if (!date) return new Date();
    const d = typeof date === 'string' ? parseISO(date) : new Date(date);
    return isNaN(d.getTime()) ? new Date() : d;
};

const PartnerView = () => {
    /* --- STATE --- */
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [view, setView] = useState('calendar'); // 'calendar' | 'clients' | 'services'
    const [reservas, setReservas] = useState([]);
    const [empleados, setEmpleados] = useState([]);
    const [sucursal, setSucursal] = useState(null);
    const [drawerOpen, setDrawerOpen] = useState(null); // { id, ...reserva }
    const [viewState, setViewState] = useState('appointment'); // 'appointment' | 'date_picker' | 'profile' | ...
    const [servicios, setServicios] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [clientSearchTerm, setClientSearchTerm] = useState('');
    const [serviceSearchTerm, setServiceSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [showClientActions, setShowClientActions] = useState(false);
    const [profileTab, setProfileTab] = useState('resumen');

    /* Edit/Create States */
    const [newClientData, setNewClientData] = useState({ razon_social_nombres: '', apellidos: '', telefono: '', email: '' });
    const [clientEditData, setClientEditData] = useState({ razon_social_nombres: '', apellidos: '', telefono: '', email: '' });
    const [shiftFormData, setShiftFormData] = useState({ empId: null, empNombre: '', intervals: [], copyToDays: [] });
    const [toast, setToast] = useState(null);
    const [quickActionMenu, setQuickActionMenu] = useState(null);
    const [empMenu, setEmpMenu] = useState(null);

    /* Config & Refs */
    const DISPLAY_START_HOUR = 8;
    const DISPLAY_END_HOUR = 21;
    const slotDuration = 15;
    const rowHeight = 40;
    const [now, setNow] = useState(new Date());
    const empMenuRef = useRef(null);

    /* --- EFFECTS --- */
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60000);

        // Initial load of static data
        fetch(`${API_BASE}/sucursales`).then(res => res.json()).then(data => {
            const suc = data[0] || null;
            setSucursal(suc);
        });
        fetch(`${API_BASE}/servicios`).then(res => res.json()).then(setServicios).catch(console.error);
        fetch(`${API_BASE}/clientes`).then(res => res.json()).then(setClientes).catch(console.error);

        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (sucursal) {
            refreshData();
        }
    }, [selectedDate, sucursal]);

    const refreshData = async () => {
        if (!sucursal) return;
        try {
            setLoading(true);
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            const [empRes, resRes] = await Promise.all([
                fetch(`${API_BASE}/empleados/${sucursal.id}`),
                fetch(`${API_BASE}/reservas/sucursal/${sucursal.id}/${dateStr}`)
            ]);
            const [eData, rData] = await Promise.all([
                empRes.json(), resRes.json()
            ]);
            setEmpleados(eData);
            setReservas(rData);
        } catch (err) {
            console.error('Error fetching dynamic data:', err);
        } finally {
            setLoading(false);
        }
    };

    /* --- HELPERS --- */
    const getTimeTop = (dateStr) => {
        const d = safeDate(dateStr);
        const mins = (d.getHours() - DISPLAY_START_HOUR) * 60 + d.getMinutes();
        return (mins / 30) * rowHeight;
    };

    const getDurationHeight = (mins) => {
        return (mins / 30) * rowHeight;
    };

    const handleSelectClient = (c) => {
        if (!drawerOpen) return;
        setDrawerOpen({
            ...drawerOpen,
            cliente_id: c.id,
            cliente_nombre: c.razon_social_nombres,
            cliente_apellidos: c.apellidos,
            cliente_telefono: c.telefono,
            cliente_email: c.email
        });
        setViewState('appointment');
    };

    const handleSelectService = (s) => {
        if (!drawerOpen) return;
        const start = safeDate(drawerOpen.fecha_hora_inicio);
        const end = addMinutes(start, s.duracion_minutos || 60);
        setDrawerOpen({
            ...drawerOpen,
            servicio_id: s.id,
            servicio_nombre: s.nombre,
            servicio_duracion: s.duracion_minutos || 60,
            servicio_precio: s.precio,
            fecha_hora_fin: format(end, 'yyyy-MM-dd HH:mm:ss'),
            endTime: format(end, 'HH:mm')
        });
        setViewState('appointment');
    };

    const handleSaveAppointment = async () => {
        if (!drawerOpen?.cliente_id || !drawerOpen?.servicio_id) return;
        setLoading(true);
        try {
            const isNew = drawerOpen.id === 'new';
            const url = isNew ? `${API_BASE}/reservas` : `${API_BASE}/reservas/${drawerOpen.id}`;
            const method = isNew ? 'POST' : 'PATCH';
            const payload = {
                cliente_id: drawerOpen.cliente_id,
                servicio_id: drawerOpen.servicio_id,
                empleado_id: drawerOpen.empleado_id,
                sucursal_id: sucursal.id,
                fecha_hora_inicio: drawerOpen.fecha_hora_inicio,
                fecha_hora_fin: drawerOpen.fecha_hora_fin,
                estado: drawerOpen.estado || 'RESERVADA',
                comentarios: drawerOpen.comentarios || '',
                tipo: 'CITA'
            };
            const resp = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (resp.ok) {
                setToast(isNew ? "Cita guardada" : "Cita actualizada");
                setTimeout(() => setToast(null), 3000);
                setDrawerOpen(null);
                refreshData();
            }
        } catch (err) {
            console.error('Error saving appt:', err);
        } finally {
            setLoading(false);
        }
    };

    /* --- RENDER --- */
    const hoursCount = DISPLAY_END_HOUR - DISPLAY_START_HOUR;
    const timelineTop = (differenceInMinutes(now, setMinutes(setHours(now, DISPLAY_START_HOUR), 0)) / 30) * rowHeight;

    return (
        <div style={{ display: 'flex', height: '100vh', backgroundColor: '#f9fafb', fontFamily: 'Inter, sans-serif' }}>
            <Sidebar currentPath="/partner" />

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <header style={{ backgroundColor: 'white', borderBottom: '1px solid #e5e7eb', padding: '0.75rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ display: 'flex', backgroundColor: '#f3f4f6', borderRadius: '24px', padding: '4px' }}>
                            <button onClick={() => setView('calendar')} style={{ background: view === 'calendar' ? 'white' : 'transparent', border: 'none', padding: '6px 16px', borderRadius: '20px', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', boxShadow: view === 'calendar' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>Calendario</button>
                            <button onClick={() => setView('clients')} style={{ background: view === 'clients' ? 'white' : 'transparent', border: 'none', padding: '6px 16px', borderRadius: '20px', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', boxShadow: view === 'clients' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>Clientes</button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#6b7280' }}><Search size={18} /><Bell size={18} /></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingLeft: '1.25rem', borderLeft: '1px solid #e5e7eb' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 900, fontSize: '0.8rem' }}>A</div>
                        </div>
                    </div>
                </header>

                <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                    <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <button onClick={() => setSelectedDate(subDays(selectedDate, 1))} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><ChevronLeft size={20} /></button>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 900 }}>{format(selectedDate, 'eeee, d MMMM yyyy', { locale: es })}</h2>
                            <button onClick={() => setSelectedDate(addDays(selectedDate, 1))} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><ChevronRight size={20} /></button>
                            {!isToday(selectedDate) && <button onClick={() => setSelectedDate(new Date())} style={{ marginLeft: '0.5rem', fontSize: '0.75rem', fontWeight: 800, padding: '4px 12px', border: '1px solid #e5e7eb', borderRadius: '16px', backgroundColor: 'white', cursor: 'pointer' }}>Hoy</button>}
                        </div>
                        <button onClick={() => {
                            const d = new Date(selectedDate); d.setHours(10, 0, 0, 0);
                            setDrawerOpen({ id: 'new', empleado_id: empleados?.[0]?.id, fecha_hora_inicio: format(d, 'yyyy-MM-dd HH:mm:ss'), startTime: '10:00', endTime: '11:00', tipo: 'CITA' });
                            setViewState('appointment');
                        }} style={{ backgroundColor: '#000', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '30px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}><Plus size={18} /> Añadir</button>
                    </div>

                    <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', height: 'fit-content' }}>
                        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
                            <div style={{ width: '60px', flexShrink: 0 }} />
                            {empleados.map(emp => (
                                <div key={emp.id} style={{ flex: 1, padding: '12px', textAlign: 'center', borderLeft: '1px solid #f3f4f6', position: 'relative' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#f3f4fb', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>{emp.nombre[0]}</div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 900 }}>{emp.nombre}</div>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); setEmpMenu({ emp, x: e.clientX, y: e.clientY }); }} style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}><MoreHorizontal size={14} /></button>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', position: 'relative' }}>
                            <div style={{ width: '60px', flexShrink: 0 }}>
                                {Array.from({ length: hoursCount * 2 }).map((_, i) => {
                                    const hour = Math.floor(i / 2) + DISPLAY_START_HOUR;
                                    const mins = (i % 2) * 30;
                                    return (
                                        <div key={i} style={{ height: rowHeight, textAlign: 'center', fontSize: '0.7rem', color: '#9ca3af', fontWeight: 800, paddingTop: '4px' }}>
                                            {mins === 0 ? `${hour > 12 ? hour - 12 : hour} ${hour >= 12 ? 'PM' : 'AM'}` : ''}
                                        </div>
                                    );
                                })}
                            </div>

                            <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
                                {empleados.map(emp => (
                                    <div key={emp.id} style={{ flex: 1, borderLeft: '1px solid #f3f4f6', position: 'relative' }}>
                                        {Array.from({ length: hoursCount * 2 }).map((_, i) => {
                                            const mins = i * 30;
                                            const hour = Math.floor(mins / 60) + DISPLAY_START_HOUR;
                                            const m = mins % 60;
                                            const timeStr = `${hour > 12 ? hour - 12 : hour}:${m < 10 ? '0' + m : m} ${hour >= 12 ? 'PM' : 'AM'}`;
                                            return (
                                                <div
                                                    key={i}
                                                    onContextMenu={(e) => {
                                                        e.preventDefault();
                                                        setQuickActionMenu({ empId: emp.id, mins, timeStr, x: e.clientX, y: e.clientY });
                                                    }}
                                                    onClick={() => {
                                                        const d = new Date(selectedDate); d.setHours(hour, m, 0, 0);
                                                        setDrawerOpen({ id: 'new', empleado_id: emp.id, fecha_hora_inicio: format(d, 'yyyy-MM-dd HH:mm:ss'), startTime: format(d, 'HH:mm'), endTime: format(addMinutes(d, 60), 'HH:mm'), tipo: 'CITA' });
                                                        setViewState('appointment');
                                                    }}
                                                    style={{ height: rowHeight, borderBottom: '1px solid #f8fafc', cursor: 'pointer' }}
                                                />
                                            );
                                        })}

                                        {/* Reservations */}
                                        {reservas.filter(r => String(r.empleado_id) === String(emp.id) && r.estado !== 'CANCELADA').map(res => {
                                            const start = safeDate(res.fecha_hora_inicio);
                                            const end = safeDate(res.fecha_hora_fin);
                                            const dur = Math.max(30, differenceInMinutes(end, start));
                                            const top = getTimeTop(res.fecha_hora_inicio);
                                            const height = getDurationHeight(dur);
                                            const isBlocked = res.tipo === 'BLOQUEO';

                                            const colors = isBlocked ? { bg: '#f3f4f6', border: '#9ca3af', text: '#4b5563' } : {
                                                'RESERVADA': { bg: '#eff6ff', border: '#2563eb', text: '#1e40af' },
                                                'CONFIRMADA': { bg: '#ecfdf5', border: '#059669', text: '#065f46' },
                                                'INASISTENCIA': { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' },
                                                'COMPLETADA': { bg: '#f3f4f6', border: '#d1d5db', text: '#6b7280' }
                                            }[res.estado] || { bg: '#eff6ff', border: '#2563eb', text: '#1e40af' };

                                            return (
                                                <div
                                                    key={res.id}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDrawerOpen({ ...res, startTime: format(start, 'HH:mm'), endTime: format(end, 'HH:mm') });
                                                        setViewState('appointment');
                                                    }}
                                                    style={{
                                                        position: 'absolute', top, height, left: '2px', right: '2px',
                                                        backgroundColor: colors.bg, borderLeft: `3px solid ${colors.border}`,
                                                        borderRadius: '4px', padding: '4px 8px', fontSize: '0.75rem',
                                                        zIndex: 20, cursor: 'pointer', overflow: 'hidden'
                                                    }}
                                                >
                                                    <div style={{ fontWeight: 800, color: colors.text }}>{isBlocked ? (res.subtipo_bloqueo || 'BLOQUEO') : `${res.cliente_nombre} ${res.cliente_apellidos || ''}`}</div>
                                                    <div style={{ fontSize: '0.65rem', color: colors.text, opacity: 0.8 }}>{res.servicio_nombre}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}

                                {isSameDay(now, selectedDate) && timelineTop >= 0 && (
                                    <div style={{ position: 'absolute', top: timelineTop, left: 0, right: 0, height: '1.5px', backgroundColor: '#ef4444', zIndex: 100, pointerEvents: 'none' }}>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444', position: 'absolute', left: '-4px', top: '-3px' }} />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* DRAWER COMPONENT */}
                <div style={{
                    position: 'fixed', top: 0, right: drawerOpen ? 0 : '-100%', bottom: 0,
                    width: '500px', maxWidth: '90vw', backgroundColor: 'white', zIndex: 1000,
                    boxShadow: '-10px 0 30px rgba(0,0,0,0.1)', transition: 'right 0.3s ease',
                    display: 'flex', flexDirection: 'column'
                }}>
                    {drawerOpen && (
                        <>
                            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <span
                                        onClick={() => setDrawerOpen({ ...drawerOpen, tipo: 'CITA' })}
                                        style={{ fontSize: '0.9rem', fontWeight: 900, cursor: 'pointer', color: drawerOpen.tipo === 'CITA' ? '#000' : '#9ca3af', borderBottom: drawerOpen.tipo === 'CITA' ? '2px solid #000' : 'none', paddingBottom: '4px' }}>Cita</span>
                                    <span
                                        onClick={() => setDrawerOpen({ ...drawerOpen, tipo: 'BLOQUEO', subtipo_bloqueo: 'Comida' })}
                                        style={{ fontSize: '0.9rem', fontWeight: 900, cursor: 'pointer', color: drawerOpen.tipo === 'BLOQUEO' ? '#000' : '#9ca3af', borderBottom: drawerOpen.tipo === 'BLOQUEO' ? '2px solid #000' : 'none', paddingBottom: '4px' }}>Bloqueo</span>
                                </div>
                                <button onClick={() => setDrawerOpen(null)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={20} /></button>
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                {drawerOpen.tipo === 'CITA' ? (
                                    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                        {/* Header Interactivo */}
                                        <div onClick={() => setViewState(viewState === 'date_picker' ? 'appointment' : 'date_picker')} style={{ backgroundColor: '#2563eb', color: 'white', padding: '1.5rem', borderRadius: '16px', cursor: 'pointer' }}>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                {format(safeDate(drawerOpen.fecha_hora_inicio), 'eee d MMM', { locale: es })} <ChevronDown size={18} />
                                            </div>
                                            <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>{drawerOpen.startTime} - {drawerOpen.endTime} • {drawerOpen.servicio_duracion || 0} min</div>
                                        </div>

                                        {viewState === 'date_picker' ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                <input
                                                    type="date"
                                                    value={format(safeDate(drawerOpen.fecha_hora_inicio), 'yyyy-MM-dd')}
                                                    onChange={(e) => {
                                                        const current = format(safeDate(drawerOpen.fecha_hora_inicio), 'HH:mm:ss');
                                                        const newStart = `${e.target.value} ${current}`;
                                                        setDrawerOpen({ ...drawerOpen, fecha_hora_inicio: newStart });
                                                    }}
                                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb', fontWeight: 800 }}
                                                />
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                    <input type="time" value={drawerOpen.startTime} onChange={(e) => {
                                                        const date = format(safeDate(drawerOpen.fecha_hora_inicio), 'yyyy-MM-dd');
                                                        const newStart = `${date} ${e.target.value}:00`;
                                                        setDrawerOpen({ ...drawerOpen, startTime: e.target.value, fecha_hora_inicio: newStart });
                                                    }} style={{ padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb' }} />
                                                    <input type="time" value={drawerOpen.endTime} onChange={(e) => setDrawerOpen({ ...drawerOpen, endTime: e.target.value })} style={{ padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb' }} />
                                                </div>
                                                <button onClick={() => setViewState('appointment')} style={{ padding: '0.75rem', borderRadius: '24px', backgroundColor: '#000', color: 'white', border: 'none', fontWeight: 900 }}>Listo</button>
                                            </div>
                                        ) : (
                                            <>
                                                {/* Cliente Info Section */}
                                                <div style={{ border: '1px solid #e5e7eb', borderRadius: '16px', padding: '1.5rem' }}>
                                                    {drawerOpen.cliente_id ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                                                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#f3f4fb', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1.2rem' }}>{drawerOpen.cliente_nombre?.[0]}</div>
                                                                    <div>
                                                                        <div style={{ fontWeight: 900, fontSize: '1rem' }}>{drawerOpen.cliente_nombre} {drawerOpen.cliente_apellidos}</div>
                                                                        <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>📱 {String(drawerOpen.cliente_telefono || '').replace('+51', '').trim()}</div>
                                                                    </div>
                                                                </div>
                                                                <div style={{ position: 'relative' }}>
                                                                    <button onClick={() => setShowClientActions(!showClientActions)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><MoreHorizontal size={20} /></button>
                                                                    {showClientActions && (
                                                                        <div style={{ position: 'absolute', top: '100%', right: 0, width: '200px', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb', zIndex: 10 }}>
                                                                            <button onClick={() => {
                                                                                setClientEditData({ ...clientes.find(c => c.id === drawerOpen.cliente_id) });
                                                                                setViewState('client_edit'); setShowClientActions(false);
                                                                            }} style={{ width: '100%', textAlign: 'left', padding: '12px', border: 'none', background: 'none', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>Editar datos</button>
                                                                            <button style={{ width: '100%', textAlign: 'left', padding: '12px', border: 'none', background: 'none', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', color: '#ef4444' }}>Eliminar</button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: '#6b7280' }}>
                                                                <span>🎂 {(() => {
                                                                    const c = clientes.find(x => x.id === drawerOpen.cliente_id);
                                                                    return c?.fecha_nacimiento ? format(safeDate(c.fecha_nacimiento), 'd MMM') : 'Sin fecha';
                                                                })()}</span>
                                                                <span>✨ {(() => {
                                                                    const c = clientes.find(x => x.id === drawerOpen.cliente_id);
                                                                    return c?.created_at ? `Creado ${format(safeDate(c.created_at), 'd/MM/yy')}` : '-';
                                                                })()}</span>
                                                            </div>
                                                            <button
                                                                onClick={() => setDrawerOpen({ ...drawerOpen, cliente_id: null })}
                                                                style={{ padding: '8px', borderRadius: '20px', border: '1px solid #e5e7eb', backgroundColor: 'white', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer' }}>Cambiar cliente</button>
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                            <input
                                                                placeholder="Buscar cliente..."
                                                                value={clientSearchTerm}
                                                                onChange={(e) => setClientSearchTerm(e.target.value)}
                                                                style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}
                                                            />
                                                            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                                                {clientes.filter(c => (c.razon_social_nombres + ' ' + (c.apellidos || '')).toLowerCase().includes(clientSearchTerm.toLowerCase())).map(c => (
                                                                    <div key={c.id} onClick={() => handleSelectClient(c)} style={{ padding: '8px', cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 900 }}>{c.razon_social_nombres[0]}</div>
                                                                        <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{c.razon_social_nombres} {c.apellidos}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Servicios Section */}
                                                <div style={{ border: '1px solid #e5e7eb', borderRadius: '16px', padding: '1.5rem' }}>
                                                    <div style={{ fontWeight: 900, marginBottom: '1rem' }}>Servicio</div>
                                                    {drawerOpen.servicio_id ? (
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <div>
                                                                <div style={{ fontWeight: 800 }}>{drawerOpen.servicio_nombre}</div>
                                                                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{drawerOpen.servicio_duracion} min • {drawerOpen.servicio_precio} PEN</div>
                                                            </div>
                                                            <button onClick={() => setDrawerOpen({ ...drawerOpen, servicio_id: null })} style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer' }}>Editar</button>
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                            {servicios.map(s => (
                                                                <div key={s.id} onClick={() => handleSelectService(s)} style={{ padding: '12px', border: '1px solid #f3f4f6', borderRadius: '12px', cursor: 'pointer' }}>
                                                                    <div style={{ fontWeight: 800 }}>{s.nombre}</div>
                                                                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{s.duracion_minutos} min • {s.precio} PEN</div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        )}

                                        <div style={{ marginTop: 'auto', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
                                            <button
                                                onClick={handleSaveAppointment}
                                                disabled={!drawerOpen.cliente_id || !drawerOpen.servicio_id}
                                                style={{ width: '100%', padding: '1.25rem', borderRadius: '30px', backgroundColor: (!drawerOpen.cliente_id || !drawerOpen.servicio_id) ? '#e5e7eb' : '#2563eb', color: 'white', border: 'none', fontWeight: 900, fontSize: '1rem', cursor: 'pointer' }}>
                                                {drawerOpen.id === 'new' ? 'Guardar cita' : 'Actualizar cita'}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    /* BLOQUEO VIEW */
                                    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                        <div style={{ fontWeight: 900 }}>Tipo de bloqueo</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                                            {['Comida', 'Reunión', 'Personal', 'Técnico'].map(t => (
                                                <div key={t} onClick={() => setDrawerOpen({ ...drawerOpen, subtipo_bloqueo: t })} style={{ padding: '15px', textAlign: 'center', borderRadius: '12px', border: drawerOpen.subtipo_bloqueo === t ? '2px solid #2563eb' : '1px solid #e5e7eb', backgroundColor: drawerOpen.subtipo_bloqueo === t ? '#eff6ff' : 'white', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>{t}</div>
                                            ))}
                                        </div>
                                        <button onClick={async () => {
                                            const payload = { ...drawerOpen, sucursal_id: sucursal.id };
                                            const r = await fetch(`${API_BASE}/reservas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                                            if (r.ok) { setDrawerOpen(null); refreshData(); }
                                        }} style={{ width: '100%', padding: '1.25rem', borderRadius: '30px', backgroundColor: '#000', color: 'white', border: 'none', fontWeight: 900, marginTop: '2rem' }}>Crear Bloqueo</button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Menús flotantes - Definición limpia */}
            <FloatingMenus
                quickActionMenu={quickActionMenu}
                setQuickActionMenu={setQuickActionMenu}
                empMenu={empMenu}
                setEmpMenu={setEmpMenu}
                empMenuRef={empMenuRef}
                selectedDate={selectedDate}
                setDrawerOpen={setDrawerOpen}
                setViewState={setViewState}
                format={format}
                addMinutes={addMinutes}
                DISPLAY_START_HOUR={DISPLAY_START_HOUR}
            />
        </div>
    );
};

const FloatingMenus = ({
    quickActionMenu, setQuickActionMenu,
    empMenu, setEmpMenu,
    empMenuRef, selectedDate,
    setDrawerOpen, setViewState,
    format, addMinutes, DISPLAY_START_HOUR
}) => {
    return (
        <>
            {quickActionMenu && (
                <>
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }} onClick={() => setQuickActionMenu(null)} />
                    <div style={{ position: 'fixed', left: quickActionMenu.x + 10, top: quickActionMenu.y + 10, backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', padding: '8px', zIndex: 999, width: '220px', border: '1px solid #e5e7eb' }}>
                        <div style={{ padding: '8px 12px', fontSize: '0.75rem', fontWeight: 800, color: '#6b7280', borderBottom: '1px solid #f3f4f6', marginBottom: '4px' }}>{quickActionMenu.timeStr}</div>
                        <div onClick={() => {
                            const d = new Date(selectedDate);
                            const h = Math.floor(quickActionMenu.mins / 60) + DISPLAY_START_HOUR;
                            const m = quickActionMenu.mins % 60;
                            d.setHours(h, m, 0, 0);
                            setDrawerOpen({ id: 'new', empleado_id: quickActionMenu.empId, fecha_hora_inicio: format(d, 'yyyy-MM-dd HH:mm:ss'), startTime: format(d, 'HH:mm'), endTime: format(addMinutes(d, 60), 'HH:mm'), tipo: 'CITA' });
                            setViewState('appointment'); setQuickActionMenu(null);
                        }} style={{ padding: '10px 12px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, borderRadius: '8px' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>Nueva cita</div>
                        <div onClick={() => {
                            const d = new Date(selectedDate);
                            const h = Math.floor(quickActionMenu.mins / 60) + DISPLAY_START_HOUR;
                            const m = quickActionMenu.mins % 60;
                            d.setHours(h, m, 0, 0);
                            setDrawerOpen({ id: 'new', empleado_id: quickActionMenu.empId, fecha_hora_inicio: format(d, 'yyyy-MM-dd HH:mm:ss'), startTime: format(d, 'HH:mm'), endTime: format(addMinutes(d, 60), 'HH:mm'), tipo: 'BLOQUEO', subtipo_bloqueo: 'Comida' });
                            setViewState('appointment'); setQuickActionMenu(null);
                        }} style={{ padding: '10px 12px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, borderRadius: '8px' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>Nuevo bloqueo</div>
                    </div>
                </>
            )}

            {empMenu && (
                <>
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }} onClick={() => setEmpMenu(null)} />
                    <div style={{ position: 'fixed', left: empMenu.x - 180, top: empMenu.y, backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', padding: '8px', zIndex: 999, width: '200px', border: '1px solid #e5e7eb' }}>
                        <div style={{ padding: '10px 12px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, borderRadius: '8px' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>Ver perfil</div>
                        <div style={{ padding: '10px 12px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, borderRadius: '8px' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>Editar horario</div>
                    </div>
                </>
            )}
        </>
    );
};

export default PartnerView;
