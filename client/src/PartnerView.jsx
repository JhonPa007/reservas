import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, X, Trash2, Settings, UserPlus, Users, Clock, Search, Check, Save, MoreVertical, ExternalLink, CreditCard, ShoppingBag, Mail, Phone, Info, Star, ChevronDown, User } from 'lucide-react';
import { format, addDays, startOfDay, addMinutes, isSameDay, parse, setHours, setMinutes } from 'date-fns';
import { es } from 'date-fns/locale';

const API_BASE = 'http://localhost:5001/api';
const DISPLAY_START_HOUR = 8;
const DISPLAY_END_HOUR = 21;

export default function PartnerView() {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [sucursal, setSucursal] = useState({ id: 1, nombre: 'JV Studio' });
    const [sucursales, setSucursales] = useState([]);
    const [empleados, setEmpleados] = useState([]);
    const [servicios, setServicios] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [reservas, setReservas] = useState([]);

    const [loading, setLoading] = useState(true);

    // Configuración del Grid
    const [slotDuration, setSlotDuration] = useState(30);
    const [cellDuration, setCellDuration] = useState(10);
    const [rowHeight, setRowHeight] = useState(24);

    // UI State
    const [drawerOpen, setDrawerOpen] = useState(null); // Reserva siendo editada
    const [viewState, setViewState] = useState('appointment'); // 'appointment' or 'profile'
    const [profileTab, setProfileTab] = useState('resumen');

    const [showConfig, setShowConfig] = useState(false);
    const [hoverRes, setHoverRes] = useState(null);
    const [resizingRes, setResizingRes] = useState(null); // {id, originalDuration, currentDuration}
    const [newResData, setNewResData] = useState(null); // {empleadoId, mins, date}

    const [showActions, setShowActions] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [showServiceSearch, setShowServiceSearch] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [clientSearchTerm, setClientSearchTerm] = useState('');
    const [serviceSearchTerm, setServiceSearchTerm] = useState('');

    const [quickActionMenu, setQuickActionMenu] = useState(null); // {x, y, empId, mins, timeStr}
    const [empMenu, setEmpMenu] = useState(null); // {empId, x, y}
    const [isResizingInProgress, setIsResizingInProgress] = useState(false);

    const [now, setNow] = useState(new Date());

    useEffect(() => {
        fetch(`${API_BASE}/sucursales`).then(res => res.json()).then(data => {
            setSucursales(data);
            if (data.length > 0) setSucursal(data[0]);
        });
        fetch(`${API_BASE}/servicios`).then(res => res.json()).then(setServicios);
        fetch(`${API_BASE}/clientes`).then(res => res.json()).then(setClientes);

        const timer = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (sucursal) refreshData();
    }, [sucursal, selectedDate]);

    const refreshData = () => {
        setLoading(true);
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        Promise.all([
            fetch(`${API_BASE}/empleados/${sucursal.id}`).then(res => res.json()),
            fetch(`${API_BASE}/reservas/sucursal/${sucursal.id}/${dateStr}`).then(res => res.json()),
            fetch(`${API_BASE}/servicios`).then(res => res.json()),
            fetch(`${API_BASE}/clientes`).then(res => res.json())
        ]).then(([empData, resData, servData, cliData]) => {
            setEmpleados(empData);
            setReservas(resData);
            setServicios(servData);
            setClientes(cliData);
            setLoading(false);
        }).catch(() => setLoading(false));
    };

    const handleDragStart = (e, res) => {
        // Si el click fue en el handle de resize o estamos redimensionando, cancelar el drag
        if (resizingRes || e.target.closest('.resize-handle')) {
            e.preventDefault();
            return;
        }
        e.dataTransfer.setData('resId', res.id);
    };

    const handleDrop = async (e, empleadoId, mins) => {
        const resId = e.dataTransfer.getData('resId');
        const hour = Math.floor(mins / 60);
        const m = mins % 60;
        const newDate = new Date(selectedDate);
        newDate.setHours(hour, m, 0, 0);

        try {
            const oldRes = reservas.find(r => String(r.id) === String(resId));
            let duration = oldRes?.duracion_minutos || 40;
            if (oldRes?.fecha_hora_inicio && oldRes?.fecha_hora_fin) {
                duration = (new Date(oldRes.fecha_hora_fin) - new Date(oldRes.fecha_hora_inicio)) / (1000 * 60);
            }

            await fetch(`${API_BASE}/reservas/${resId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    empleado_id: empleadoId,
                    fecha_hora_inicio: format(newDate, 'yyyy-MM-dd HH:mm:ss'),
                    fecha_hora_fin: format(addMinutes(newDate, duration), 'yyyy-MM-dd HH:mm:ss')
                })
            });
            refreshData();
        } catch (err) { console.error(err); }
    };

    const handleResizeStart = (e, res) => {
        e.stopPropagation();
        const startY = e.clientY;
        const start = new Date(res.fecha_hora_inicio);
        const end = res.fecha_hora_fin ? new Date(res.fecha_hora_fin) : addMinutes(start, res.duracion_minutos || 40);
        const startDuration = (end - start) / (1000 * 60);

        let moved = false;

        const onMouseMove = (moveEvent) => {
            const deltaY = moveEvent.clientY - startY;
            if (Math.abs(deltaY) > 2) moved = true;
            const deltaMins = Math.round((deltaY / rowHeight) * cellDuration / 5) * 5;
            const newDuration = Math.max(10, startDuration + deltaMins);
            setResizingRes({ id: res.id, currentDuration: newDuration });
            setIsResizingInProgress(true);
        };

        const onMouseUp = async (upEvent) => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);

            const deltaY = upEvent.clientY - startY;
            const deltaMins = Math.round((deltaY / rowHeight) * cellDuration / 5) * 5;
            const newDuration = Math.max(10, startDuration + deltaMins);
            const newEndDate = addMinutes(new Date(res.fecha_hora_inicio), newDuration);

            setResizingRes(null);
            setTimeout(() => setIsResizingInProgress(false), 100);

            if (!moved) return;

            try {
                const response = await fetch(`${API_BASE}/reservas/${res.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fecha_hora_fin: format(newEndDate, 'yyyy-MM-dd HH:mm:ss')
                    })
                });
                if (response.ok) {
                    console.log('Resize saved correctly');
                    refreshData();
                } else {
                    console.error('Failed to save resize');
                }
            } catch (err) { console.error(err); }
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    const handleCreateAppointment = async (formData) => {
        try {
            const startHour = Math.floor(newResData.mins / 60);
            const startMin = newResData.mins % 60;
            const startDate = new Date(newResData.date);
            startDate.setHours(startHour, startMin, 0, 0);

            const selectedServ = servicios.find(s => s.id === parseInt(formData.servicio_id));
            const duration = selectedServ ? selectedServ.duracion_minutos : 40;
            const endDate = addMinutes(startDate, duration);

            await fetch(`${API_BASE}/reservas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cliente_id: formData.cliente_id,
                    empleado_id: newResData.empleadoId,
                    servicio_id: formData.servicio_id,
                    sucursal_id: sucursal.id,
                    fecha_hora_inicio: format(startDate, 'yyyy-MM-dd HH:mm:ss'),
                    fecha_hora_fin: format(endDate, 'yyyy-MM-dd HH:mm:ss'),
                    estado: 'RESERVADA',
                    origen: 'PARTNER'
                })
            });
            setNewResData(null);
            setViewState('calendar');
            refreshData();
        } catch (err) { console.error(err); }
    };

    const updateStatus = async (resId, newStatus) => {
        try {
            await fetch(`${API_BASE}/reservas/${resId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado: newStatus })
            });
            setDrawerOpen(null);
            refreshData();
        } catch (err) { console.error(err); }
    };

    const handleCellClick = (e, empId, mins, timeStr) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setQuickActionMenu({
            x: rect.left,
            y: rect.top,
            empId,
            mins,
            timeStr
        });
    };
    const handleSaveAppointment = async () => {
        if (!drawerOpen) return;
        const isNew = drawerOpen.id === 'new';
        const method = isNew ? 'POST' : 'PATCH';
        const url = isNew ? `${API_BASE}/reservas` : `${API_BASE}/reservas/${drawerOpen.id}`;

        const payload = {
            cliente_id: drawerOpen.cliente_id,
            empleado_id: drawerOpen.empleado_id,
            servicio_id: drawerOpen.servicio_id,
            sucursal_id: sucursal.id,
            fecha_hora_inicio: drawerOpen.fecha_hora_inicio,
            fecha_hora_fin: drawerOpen.fecha_hora_fin || format(addMinutes(new Date(drawerOpen.fecha_hora_inicio), 40), 'yyyy-MM-dd HH:mm:ss'),
            notas_cliente: drawerOpen.notas_cliente || ''
        };

        try {
            const resp = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (resp.ok) {
                setDrawerOpen(null);
                refreshData();
            }
        } catch (err) { console.error(err); }
    };

    const handleSelectClient = (client) => {
        setDrawerOpen({
            ...drawerOpen,
            cliente_id: client.id,
            cliente_nombre: client.razon_social_nombres,
            cliente_apellidos: client.apellidos,
            cliente_telefono: client.telefono
        });
        setViewState('appointment');
    };

    const handleSelectService = (service) => {
        const start = new Date(drawerOpen.fecha_hora_inicio);
        const end = addMinutes(start, service.duracion_minutos || 40);
        setDrawerOpen({
            ...drawerOpen,
            servicio_id: service.id,
            servicio_nombre: service.nombre,
            servicio_precio: service.precio,
            servicio_duracion: service.duracion_minutos,
            fecha_hora_fin: format(end, 'yyyy-MM-dd HH:mm:ss')
        });
        setShowServiceSearch(false);
    };

    const getDurationHeight = (mins) => (mins / cellDuration) * rowHeight;

    const getTimeTop = (dateStr) => {
        if (!dateStr) return 0;
        const d = new Date(dateStr);
        const mins = d.getHours() * 60 + d.getMinutes();
        const offsetMins = mins - (DISPLAY_START_HOUR * 60);
        return (offsetMins / (cellDuration || 10)) * rowHeight;
    };

    const formatAMPM = (dateStr) => {
        if (!dateStr) return '';
        try {
            const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
            if (isNaN(d.getTime())) return '';
            return format(d, 'h:mm a');
        } catch (e) { return ''; }
    };

    // Algoritmo de solapamiento robusto
    const processOverlaps = (resArray) => {
        if (!resArray || resArray.length === 0) return {};

        const sorted = [...resArray].sort((a, b) => new Date(a.fecha_hora_inicio) - new Date(b.fecha_hora_inicio));
        const clusters = [];

        sorted.forEach(res => {
            const start = new Date(res.fecha_hora_inicio).getTime();
            let duration = res.duracion_minutos || 40;
            if (res.fecha_hora_inicio && res.fecha_hora_fin) {
                duration = (new Date(res.fecha_hora_fin) - new Date(res.fecha_hora_inicio)) / (1000 * 60);
            }
            const end = start + (duration * 60000);

            let foundCluster = clusters.find(cluster => {
                return cluster.some(c => {
                    const cStart = new Date(c.fecha_hora_inicio).getTime();
                    let cDuration = c.duracion_minutos || 40;
                    if (c.fecha_hora_inicio && c.fecha_hora_fin) {
                        cDuration = (new Date(c.fecha_hora_fin) - new Date(c.fecha_hora_inicio)) / (1000 * 60);
                    }
                    const cEnd = cStart + (cDuration * 60000);
                    return (start < cEnd && end > cStart);
                });
            });

            if (foundCluster) {
                foundCluster.push(res);
            } else {
                clusters.push([res]);
            }
        });

        const results = {};
        clusters.forEach(cluster => {
            cluster.sort((a, b) => new Date(a.fecha_hora_inicio) - new Date(b.fecha_hora_inicio));
            const columns = [];

            cluster.forEach(res => {
                const start = new Date(res.fecha_hora_inicio).getTime();
                let colIndex = columns.findIndex(colLastEnd => start >= colLastEnd);

                if (colIndex === -1) {
                    columns.push(0);
                    colIndex = columns.length - 1;
                }

                let duration = res.duracion_minutos || 40;
                if (res.fecha_hora_inicio && res.fecha_hora_fin) {
                    duration = (new Date(res.fecha_hora_fin) - new Date(res.fecha_hora_inicio)) / (1000 * 60);
                }
                const end = start + (duration * 60000);
                columns[colIndex] = end;

                results[res.id] = { colIndex, totalCols: 1 };
            });

            cluster.forEach(res => {
                if (results[res.id]) {
                    results[res.id].totalCols = columns.length;
                }
            });
        });

        return results;
    };

    const timelineTop = ((now.getHours() * 60 + now.getMinutes() - DISPLAY_START_HOUR * 60) / (cellDuration || 10)) * rowHeight;

    return (
        <div className="partner-view" style={{ display: 'flex', height: '100vh', backgroundColor: '#f9fafb', fontFamily: "'Inter', sans-serif", overflow: 'hidden' }}>

            {/* Sidebar Navigation */}
            <div style={{ width: '64px', backgroundColor: 'white', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem 0', flexShrink: 0 }}>
                <div style={{ width: '32px', height: '32px', backgroundColor: '#000', borderRadius: '8px', marginBottom: '2rem' }} />
                <CalendarIcon size={24} color="#000" style={{ marginBottom: '2rem', cursor: 'pointer' }} />
                <Users size={24} color="#9ca3af" style={{ marginBottom: '2rem', cursor: 'pointer' }} />
            </div>

            {/* Main Area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

                {/* Header */}
                <header style={{ backgroundColor: 'white', borderBottom: '1px solid #e5e7eb', padding: '0.75rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <select
                            value={sucursal?.id || ''}
                            onChange={(e) => setSucursal(sucursales.find(s => s.id === parseInt(e.target.value)))}
                            style={{ border: 'none', background: '#f3f4f6', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: 700, fontSize: '0.9rem', outline: 'none' }}
                        >
                            {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                        </select>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', backgroundColor: '#f3f4f6', padding: '0.25rem', borderRadius: '10px' }}>
                            <button onClick={() => setSelectedDate(addDays(selectedDate, -1))} className="btn-icon"><ChevronLeft size={18} /></button>
                            <span style={{ fontWeight: 800, fontSize: '0.85rem', padding: '0 0.5rem' }}>{format(selectedDate, "EEE, d MMM", { locale: es })}</span>
                            <button onClick={() => setSelectedDate(addDays(selectedDate, 1))} className="btn-icon"><ChevronRight size={18} /></button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button onClick={() => setShowConfig(!showConfig)} className="btn-secondary"><Settings size={18} /></button>
                    </div>
                </header>

                {/* Grid Body */}
                <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
                    <div style={{ minWidth: '100%', display: 'flex', flexDirection: 'column' }}>
                        {/* Header Employees */}
                        <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 60, backgroundColor: 'white', borderBottom: '1px solid #e5e7eb' }}>
                            <div style={{ width: '60px', flexShrink: 0, borderRight: '1px solid #e5e7eb' }} />
                            {empleados.map(emp => (
                                <div key={emp.id} style={{ flex: 1, minWidth: '200px', padding: '1rem', textAlign: 'center', borderRight: '1px solid #e5e7eb' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#f3f4f6', margin: '0 auto 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.8rem' }}>
                                        {(emp.nombre_display || emp.nombres || 'U')[0]}
                                    </div>
                                    <div
                                        onClick={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            setEmpMenu({ empId: emp.id, x: rect.left, y: rect.bottom });
                                        }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                                    >
                                        <div style={{ fontWeight: 800, fontSize: '0.85rem' }}>{emp.nombre_display || emp.nombres}</div>
                                        <ChevronDown size={14} color="#6b7280" />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', position: 'relative' }}>
                            <div style={{ width: '60px', flexShrink: 0, borderRight: '1px solid #e5e7eb', backgroundColor: 'white' }}>
                                {/* Hour labels logic... */}
                                {Array.from({ length: (DISPLAY_END_HOUR - DISPLAY_START_HOUR) * 60 / cellDuration }).map((_, i) => {
                                    const mins = DISPLAY_START_HOUR * 60 + i * cellDuration;
                                    return (
                                        <div key={i} style={{ height: rowHeight, position: 'relative' }}>
                                            {mins % slotDuration === 0 && (
                                                <div style={{ position: 'absolute', top: '-10px', right: '8px', fontSize: '0.65rem', fontWeight: 700, color: '#6b7280' }}>
                                                    {format(setMinutes(setHours(new Date(), Math.floor(mins / 60)), mins % 60), 'h:mm a').replace(' ', '')}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {empleados.map(emp => (
                                <div key={emp.id} style={{ flex: 1, minWidth: '200px', position: 'relative', borderRight: '1px solid #e5e7eb' }}>
                                    {/* Grid lines & Hover Time */}
                                    {Array.from({ length: (DISPLAY_END_HOUR - DISPLAY_START_HOUR) * 60 / cellDuration }).map((_, i) => {
                                        const mins = DISPLAY_START_HOUR * 60 + i * cellDuration;
                                        const isAvailable = mins >= (9 * 60) && mins <= (20 * 60);
                                        const hour = Math.floor(mins / 60);
                                        const m = mins % 60;
                                        const timeStr = `${hour > 12 ? hour - 12 : hour}:${m < 10 ? '0' + m : m} ${hour >= 12 ? 'PM' : 'AM'}`;

                                        return (
                                            <div
                                                key={i}
                                                className="grid-cell"
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={(e) => handleDrop(e, emp.id, mins)}
                                                onClick={(e) => handleCellClick(e, emp.id, mins, timeStr)}
                                                style={{
                                                    height: rowHeight,
                                                    borderBottom: mins % slotDuration === 0 ? '1px solid #e5e7eb' : '1px solid #f3f4f6',
                                                    backgroundColor: isAvailable ? 'white' : '#f9fafb',
                                                    backgroundImage: !isAvailable ? 'repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(0,0,0,0.02) 8px, rgba(0,0,0,0.02) 16px)' : 'none',
                                                    position: 'relative',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <div className="cell-hover-time" style={{ position: 'absolute', left: '8px', top: 0, bottom: 0, display: 'none', alignItems: 'center', fontSize: '0.65rem', color: '#9ca3af', fontWeight: 700, pointerEvents: 'none', zIndex: 5 }}>
                                                    {timeStr}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Reservations with Overlap Logic */}
                                    {(() => {
                                        const empRes = reservas.filter(r => r.empleado_id === emp.id && r.estado !== 'CANCELADA');
                                        const overlapData = processOverlaps(empRes);

                                        return empRes.map((res) => {
                                            const colors = {
                                                'RESERVADA': { bg: '#e0f2fe', border: '#0369a1', text: '#0369a1' },
                                                'COMPLETADA': { bg: '#f3f4f6', border: '#9ca3af', text: '#374151' },
                                                'INASISTENCIA': { bg: '#fee2e2', border: '#b91c1c', text: '#b91c1c' }
                                            }[res.estado] || { bg: '#e0f2fe', border: '#0369a1', text: '#0369a1' };

                                            const isResizingThis = resizingRes?.id === res.id;

                                            // Calcular duración real basada en fechas si no se está redimensionando
                                            let displayDuration = res.duracion_minutos || 40;
                                            if (res.fecha_hora_fin && !isResizingThis) {
                                                const start = new Date(res.fecha_hora_inicio);
                                                const end = new Date(res.fecha_hora_fin);
                                                displayDuration = (end - start) / (1000 * 60);
                                            }
                                            if (isResizingThis) displayDuration = resizingRes.currentDuration;

                                            const { colIndex, totalCols } = overlapData[res.id] || { colIndex: 0, totalCols: 1 };
                                            const width = `${100 / totalCols}%`;
                                            const left = `${(100 / totalCols) * colIndex}%`;

                                            return (
                                                <div
                                                    key={res.id}
                                                    className="res-card"
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, res)}
                                                    onMouseEnter={(e) => !resizingRes && setHoverRes({ res, x: e.clientX, y: e.clientY })}
                                                    onMouseLeave={() => setHoverRes(null)}
                                                    onClick={() => !isResizingInProgress && !resizingRes && (setDrawerOpen(res), setViewState('appointment'))}
                                                    style={{
                                                        position: 'absolute',
                                                        top: getTimeTop(res.fecha_hora_inicio),
                                                        height: getDurationHeight(displayDuration),
                                                        left: left,
                                                        width: width,
                                                        backgroundColor: colors.bg,
                                                        borderLeft: `3px solid ${colors.border}`,
                                                        borderBottom: '1px solid rgba(0,0,0,0.05)',
                                                        padding: '0.4rem 0.6rem',
                                                        fontSize: '0.75rem',
                                                        zIndex: isResizingThis ? 100 : 10,
                                                        cursor: isResizingThis ? 'ns-resize' : 'move',
                                                        boxSizing: 'border-box',
                                                        overflow: 'hidden',
                                                        boxShadow: isResizingThis ? '0 4px 12px rgba(0,0,0,0.2)' : '0 1px 2px rgba(0,0,0,0.1)',
                                                        opacity: isResizingThis ? 0.9 : 1,
                                                        transition: isResizingThis ? 'none' : 'all 0.1s ease',
                                                        borderRight: totalCols > 1 ? '1px solid rgba(0,0,0,0.1)' : 'none'
                                                    }}
                                                >
                                                    <div style={{ fontWeight: 800, color: colors.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{res.cliente_nombre}</div>
                                                    <div style={{ fontSize: '0.65rem', color: colors.text, opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{res.servicio_nombre}</div>

                                                    {/* Resize Handle */}
                                                    <div
                                                        onMouseDown={(e) => handleResizeStart(e, res)}
                                                        className="resize-handle"
                                                        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '10px', cursor: 'ns-resize', display: 'flex', flexDirection: 'column', gap: '1px', alignItems: 'center', justifyContent: 'center', zIndex: 110 }}
                                                    >
                                                        <div style={{ width: '12px', height: '1.5px', backgroundColor: colors.border, opacity: 0.4 }}></div>
                                                        <div style={{ width: '12px', height: '1.5px', backgroundColor: colors.border, opacity: 0.4 }}></div>
                                                    </div>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            ))}

                            {/* Timeline Indicator */}
                            {isSameDay(now, selectedDate) && timelineTop >= 0 && (
                                <div style={{ position: 'absolute', top: timelineTop, left: 0, right: 0, height: '1.5px', backgroundColor: '#ef4444', zIndex: 70, pointerEvents: 'none' }}>
                                    <div style={{ position: 'absolute', left: '55px', top: '-4px', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* RESERVATION HOVER TOOLTIP */}
            {hoverRes && (
                <div style={{
                    position: 'fixed', top: hoverRes.y + 10, left: hoverRes.x + 10, backgroundColor: 'white', borderRadius: '12px',
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 1000, width: '280px', border: '1px solid #e5e7eb'
                }}>
                    <div style={{ backgroundColor: '#2563eb', padding: '0.6rem 1rem', display: 'flex', justifyContent: 'space-between', color: 'white', fontWeight: 800, fontSize: '0.7rem' }}>
                        <span>{formatAMPM(hoverRes.res.fecha_hora_inicio)} - {formatAMPM(hoverRes.res.fecha_hora_fin)}</span>
                        <span>Reservada</span>
                    </div>
                    <div style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{hoverRes.res?.cliente_nombre?.[0] || 'C'}</div>
                            <div>
                                <div style={{ fontWeight: 800, fontSize: '0.85rem' }}>{hoverRes.res.cliente_nombre}</div>
                                <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>+51 967 091 691</div>
                            </div>
                        </div>
                        <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 800, fontSize: '0.8rem' }}>{hoverRes.res.servicio_nombre}</span>
                            <span style={{ fontWeight: 800, fontSize: '0.8rem' }}>30 PEN</span>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '0.25rem' }}>Atendido por {hoverRes.res.empleado_nombre} • 45 min</div>
                    </div>
                </div>
            )}

            {/* MAIN DRAWER SYSTEM (SLIDE-IN) */}
            <div style={{
                position: 'fixed', top: 0, right: (drawerOpen || newResData) ? 0 : '-100%', bottom: 0,
                width: (viewState === 'profile' || viewState === 'appointment' || viewState === 'client_search' || viewState === 'service_search') ? '900px' : '500px', maxWidth: '100%',
                backgroundColor: 'rgba(0,0,0,0.5)', // Backdrop darker
                zIndex: 500, transition: 'right 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                display: 'flex', justifyContent: 'flex-end'
            }}>

                {/* WHITE PANEL CONTAINER */}
                <div style={{
                    width: '100%', height: '100%',
                    backgroundColor: 'white', boxShadow: '-10px 0 30px rgba(0,0,0,0.1)',
                    display: 'flex', flexDirection: 'column', position: 'relative'
                }}>

                    {/* TOP HEADER */}
                    <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button onClick={() => { setDrawerOpen(null); setNewResData(null); setViewState('calendar'); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={20} /></button>
                    </div>

                    {/* VIEW: APPOINTMENT EDIT (REDISEÑADA) */}
                    {/* VIEW: APPOINTMENT EDIT / NEW APPOINTMENT */}
                    {(viewState === 'appointment' || viewState === 'client_search' || viewState === 'service_search') && (
                        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                            {/* PANEL 1: CLIENT SELECTION */}
                            <div style={{ width: '400px', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', backgroundColor: '#fff' }}>
                                <div style={{ padding: '1.5rem', borderBottom: '1px solid #f3f4f6' }}>
                                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900 }}>
                                        {drawerOpen?.cliente_id ? 'Cliente' : 'Seleccionar cliente'}
                                    </h3>
                                </div>

                                <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                                    {drawerOpen?.cliente_id ? (
                                        /* CLIENT SELECTED VIEW */
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                                            <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '2rem', color: '#2563eb', marginBottom: '1rem' }}>
                                                {drawerOpen?.cliente_nombre?.[0] || 'A'}
                                            </div>
                                            <h2 style={{ fontSize: '1.2rem', fontWeight: 900, margin: '0 0 0.25rem 0' }}>{drawerOpen?.cliente_nombre}</h2>
                                            <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0 0 1.5rem 0' }}>{drawerOpen?.cliente_telefono || '+51 000 000 000'}</p>

                                            <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
                                                <button
                                                    onClick={() => setDrawerOpen({ ...drawerOpen, cliente_id: null, cliente_nombre: null })}
                                                    style={{ flex: 1, padding: '0.6rem', borderRadius: '24px', border: '1px solid #e5e7eb', backgroundColor: '#fff', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer' }}
                                                >
                                                    Cambiar
                                                </button>
                                                <button
                                                    onClick={() => setViewState('profile')}
                                                    style={{ flex: 1, padding: '0.6rem', borderRadius: '24px', border: '1px solid #e5e7eb', backgroundColor: '#fff', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer' }}
                                                >
                                                    Ver perfil
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        /* CLIENT SELECTION FLOW */
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            {/* SEARCH BAR (Screenshot 2) */}
                                            <div style={{ position: 'relative' }}>
                                                <Search size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                                                <input
                                                    placeholder="Buscar cliente o dejar vacío"
                                                    value={clientSearchTerm}
                                                    onChange={(e) => setClientSearchTerm(e.target.value)}
                                                    style={{ width: '100%', padding: '0.75rem 0.75rem 0.75rem 2.5rem', borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '0.9rem', outline: 'none', transition: 'border-color 0.2s' }}
                                                    onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                                                    onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                                                />
                                            </div>

                                            {/* NEW CLIENT & WALK-IN OPTIONS */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                                                <button style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', borderRadius: '12px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}><UserPlus size={20} /></div>
                                                    <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>Añadir un nuevo cliente</span>
                                                </button>
                                                <button
                                                    onClick={() => handleSelectClient({ id: 0, razon_social_nombres: 'Cliente sin cita', apellidos: '', telefono: '' })}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', borderRadius: '12px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}
                                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                                >
                                                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}><Users size={20} /></div>
                                                    <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>Sin cita</span>
                                                </button>
                                            </div>

                                            {/* CLIENT LIST (Filtered by name, phone, email) */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '0.5rem' }}>
                                                {clientes
                                                    .filter(c => {
                                                        const search = clientSearchTerm.toLowerCase();
                                                        return (
                                                            (c.razon_social_nombres || '').toLowerCase().includes(search) ||
                                                            (c.apellidos || '').toLowerCase().includes(search) ||
                                                            (c.telefono || '').toLowerCase().includes(search) ||
                                                            (c.email || '').toLowerCase().includes(search)
                                                        );
                                                    })
                                                    .slice(0, 50)
                                                    .map(c => (
                                                        <div
                                                            key={c.id}
                                                            onClick={() => handleSelectClient(c)}
                                                            style={{ padding: '0.75rem', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem', transition: 'background-color 0.2s' }}
                                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                                        >
                                                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#6b7280', flexShrink: 0 }}>
                                                                {c.razon_social_nombres?.[0] || 'C'}
                                                            </div>
                                                            <div style={{ overflow: 'hidden' }}>
                                                                <div style={{ fontWeight: 800, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.razon_social_nombres} {c.apellidos}</div>
                                                                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{c.telefono || c.email || 'Sin datos'}</div>
                                                            </div>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* PANEL 2: SERVICE SELECTION */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#fff' }}>
                                <div style={{ padding: '1.5rem', borderBottom: '1px solid #f3f4f6' }}>
                                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900 }}>Seleccionar un servicio</h3>
                                </div>

                                <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                                    {/* SERVICE SEARCH (Screenshot 1) */}
                                    <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
                                        <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                                        <input
                                            placeholder="Buscar por nombre de servicio"
                                            value={serviceSearchTerm}
                                            onChange={(e) => setServiceSearchTerm(e.target.value)}
                                            style={{ width: '100%', padding: '0.85rem 1rem 0.85rem 2.75rem', borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '0.95rem', outline: 'none' }}
                                        />
                                    </div>

                                    {/* SERVICE LIST GROUPED */}
                                    <div>
                                        <h4 style={{ fontSize: '0.9rem', fontWeight: 900, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            Servicios para varones <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: '0.75rem' }}>{servicios.length}</span>
                                        </h4>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            {servicios
                                                .filter(s => s.nombre.toLowerCase().includes(serviceSearchTerm.toLowerCase()))
                                                .map(s => (
                                                    <div
                                                        key={s.id}
                                                        onClick={() => handleSelectService(s)}
                                                        style={{
                                                            padding: '1.25rem',
                                                            borderRadius: '16px',
                                                            border: drawerOpen?.servicio_id === s.id ? '2px solid #2563eb' : '1px solid #f3f4f6',
                                                            backgroundColor: drawerOpen?.servicio_id === s.id ? '#eff6ff' : '#fff',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'flex-start',
                                                            transition: 'all 0.2s'
                                                        }}
                                                        onMouseEnter={e => {
                                                            if (drawerOpen?.servicio_id !== s.id) e.currentTarget.style.borderColor = '#d1d5db';
                                                        }}
                                                        onMouseLeave={e => {
                                                            if (drawerOpen?.servicio_id !== s.id) e.currentTarget.style.borderColor = '#f3f4f6';
                                                        }}
                                                    >
                                                        <div>
                                                            <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: '0.25rem' }}>{s.nombre}</div>
                                                            <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{s.duracion_minutos || 45}min</div>
                                                        </div>
                                                        <div style={{ textAlign: 'right' }}>
                                                            <div style={{ fontWeight: 400, color: '#6b7280', fontSize: '0.75rem', marginBottom: '0.25rem' }}>desde</div>
                                                            <div style={{ fontWeight: 900, fontSize: '1rem' }}>{s.precio} PEN</div>
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                </div>

                                {/* DRAWER FOOTER (Summary and Save) */}
                                <div style={{ padding: '1.5rem', borderTop: '1px solid #e5e7eb', backgroundColor: '#fff' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>Total</span>
                                            <span style={{ fontSize: '1.5rem', fontWeight: 900 }}>{drawerOpen?.servicio_precio || 0} PEN</span>
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600, textAlign: 'right' }}>
                                            {drawerOpen?.servicio_duracion || 0} min total
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <button
                                            onClick={handleSaveAppointment}
                                            disabled={!drawerOpen?.servicio_id}
                                            style={{
                                                flex: 1,
                                                padding: '1rem',
                                                borderRadius: '30px',
                                                backgroundColor: !drawerOpen?.servicio_id ? '#e5e7eb' : '#2563eb',
                                                color: 'white',
                                                border: 'none',
                                                fontWeight: 900,
                                                fontSize: '1rem',
                                                cursor: !drawerOpen?.servicio_id ? 'not-allowed' : 'pointer',
                                                transition: 'background-color 0.2s'
                                            }}
                                        >
                                            {drawerOpen?.id === 'new' ? 'Guardar cita' : 'Actualizar cita'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* VIEW: CLIENT PROFILE (3 PANELS) */}
                    {viewState === 'profile' && (
                        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                            {/* Profile Sidebar Menu */}
                            <div style={{ width: '220px', backgroundColor: '#f9fafb', borderRight: '1px solid #e5e7eb', padding: '1.5rem 0' }}>
                                {['Resumen', 'Citas', 'Ventas', 'Datos del cliente', 'Artículos', 'Documentos', 'Billetera'].map(tab => (
                                    <div
                                        key={tab}
                                        onClick={() => setProfileTab(tab.toLowerCase())}
                                        style={{
                                            padding: '0.75rem 1.5rem', fontSize: '0.85rem', fontWeight: profileTab === tab.toLowerCase() ? 800 : 500,
                                            color: profileTab === tab.toLowerCase() ? '#000' : '#4b5563', cursor: 'pointer',
                                            backgroundColor: profileTab === tab.toLowerCase() ? '#fff' : 'transparent',
                                            borderRight: profileTab === tab.toLowerCase() ? '3px solid #000' : 'none'
                                        }}
                                    >
                                        {tab}
                                    </div>
                                ))}
                            </div>

                            {/* Profile Content - Resumen */}
                            <div style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
                                <h1 style={{ fontSize: '2rem', fontWeight: 900, marginBottom: '2rem' }}>Resumen</h1>

                                {/* Top Row Stats */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                    <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.5rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                            <span style={{ fontWeight: 900, fontSize: '1rem' }}>Billetera</span>
                                            <span style={{ color: '#2563eb', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer' }}>Ver Billetera</span>
                                        </div>
                                        <div style={{ fontWeight: 400, color: '#6b7280', fontSize: '0.85rem' }}>Saldo</div>
                                        <div style={{ fontWeight: 900, fontSize: '1.5rem' }}>0 PEN</div>
                                    </div>

                                    <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.5rem' }}>
                                        <div style={{ fontWeight: 900, fontSize: '1rem', marginBottom: '1.5rem' }}>Resumen</div>
                                        <div style={{ fontWeight: 400, color: '#6b7280', fontSize: '0.85rem' }}>Total de ventas</div>
                                        <div style={{ fontWeight: 900, fontSize: '1.5rem' }}>250 PEN</div>
                                    </div>
                                </div>

                                {/* Bottom Grid Stats */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                    {[
                                        { label: 'Citas', val: '17' },
                                        { label: 'Valoración', val: '-' },
                                        { label: 'Cancelada', val: '3' },
                                        { label: 'Inasistencia', val: '0' }
                                    ].map((stat, idx) => (
                                        <div key={idx} style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.25rem', position: 'relative' }}>
                                            <Info size={14} style={{ position: 'absolute', top: '1rem', right: '1rem', color: '#d1d5db' }} />
                                            <div style={{ fontWeight: 800, fontSize: '0.85rem', marginBottom: '0.5rem', color: '#111' }}>{stat.label}</div>
                                            <div style={{ fontWeight: 900, fontSize: '1.5rem' }}>{stat.val}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Personal Info Bar */}
                                <div style={{ marginTop: '2.5rem', borderTop: '1px solid #e5e7eb', paddingTop: '1.5rem' }}>
                                    <div style={{ display: 'flex', gap: '2rem', fontSize: '0.85rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#4b5563' }}><User size={16} /> Añadir pronombres</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#4b5563' }}><CalendarIcon size={16} /> Añadir fecha de nacimiento</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#4b5563' }}><Plus size={16} /> Creado en 10 ago 2025</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Quick Action Menu */}
            {quickActionMenu && (
                <>
                    <div
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }}
                        onClick={() => setQuickActionMenu(null)}
                    />
                    <div style={{
                        position: 'fixed',
                        left: quickActionMenu.x + 10,
                        top: quickActionMenu.y + 10,
                        backgroundColor: 'white',
                        borderRadius: '12px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                        padding: '8px',
                        zIndex: 999,
                        width: '240px',
                        border: '1px solid #f3f4f6',
                        animation: 'fadeIn 0.15s ease-out'
                    }}>
                        <div style={{ padding: '8px 12px', fontSize: '0.85rem', fontWeight: 800, color: '#111827', borderBottom: '1px solid #f3f4f6', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            {quickActionMenu.timeStr}
                            <X size={14} style={{ cursor: 'pointer', color: '#9ca3af' }} onClick={() => setQuickActionMenu(null)} />
                        </div>
                        {[
                            {
                                label: 'Añadir cita', icon: <Plus size={16} />, action: () => {
                                    setDrawerOpen({ id: 'new', empleado_id: quickActionMenu.empId, fecha_hora_inicio: format(addMinutes(new Date(selectedDate).setHours(0, 0, 0, 0), quickActionMenu.mins + (DISPLAY_START_HOUR * 60)), 'yyyy-MM-dd HH:mm:ss'), duracion_minutos: 40 });
                                    setViewState('appointment');
                                    setQuickActionMenu(null);
                                }
                            },
                            {
                                label: 'Añadir cita de grupo', icon: <Users size={16} />, action: () => {
                                    alert('Funcionalidad de cita de grupo en desarrollo');
                                    setQuickActionMenu(null);
                                }
                            },
                            {
                                label: 'Añadir horario no disponible', icon: <Clock size={16} />, action: () => {
                                    alert('Funcionalidad de horario no disponible en desarrollo');
                                    setQuickActionMenu(null);
                                }
                            }
                        ].map((opt, i) => (
                            <div
                                key={i}
                                onClick={opt.action}
                                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', cursor: 'pointer', borderRadius: '8px', transition: 'all 0.2s' }}
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                            >
                                <div style={{ color: '#6b7280' }}>{opt.icon}</div>
                                <div style={{ fontSize: '0.85rem', color: '#374151', fontWeight: 500 }}>{opt.label}</div>
                            </div>
                        ))}
                        <div style={{ padding: '10px 12px', fontSize: '0.75rem', color: '#6366f1', fontWeight: 600, cursor: 'pointer', borderTop: '1px solid #f3f4f6', marginTop: '4px' }}>
                            Ajustes de acciones rápidas
                        </div>
                    </div>
                </>
            )}

            {/* Employee Menu */}
            {empMenu && (
                <>
                    <div
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }}
                        onClick={() => setEmpMenu(null)}
                    />
                    <div style={{
                        position: 'fixed',
                        left: empMenu.x,
                        top: empMenu.y + 10,
                        backgroundColor: 'white',
                        borderRadius: '12px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                        padding: '8px',
                        zIndex: 999,
                        width: '200px',
                        border: '1px solid #f3f4f6'
                    }}>
                        <div style={{ padding: '6px 12px', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af', fontWeight: 700 }}>Vistas</div>
                        {[
                            { label: 'Vista de día', icon: <CalendarIcon size={14} /> },
                            { label: 'Vista de 3 días', icon: <Clock size={14} /> },
                            { label: 'Vista semanal', icon: <CalendarIcon size={14} /> },
                            { label: 'Vista mensual', icon: <CalendarIcon size={14} /> },
                        ].map((opt, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', cursor: 'pointer', borderRadius: '8px' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                <div style={{ color: '#6b7280' }}>{opt.icon}</div>
                                <div style={{ fontSize: '0.8rem', color: '#374151' }}>{opt.label}</div>
                            </div>
                        ))}
                        <div style={{ height: '1px', backgroundColor: '#f3f4f6', margin: '4px 0' }} />
                        <div style={{ padding: '6px 12px', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af', fontWeight: 700 }}>Acciones</div>
                        {[
                            { label: 'Añadir cita', icon: <Plus size={14} /> },
                            { label: 'Añadir horario no disponible', icon: <Clock size={14} /> },
                            { label: 'Editar turno', icon: <Settings size={14} /> },
                            { label: 'Añadir días libres', icon: <Plus size={14} /> },
                            { label: 'Ver miembro del equipo', icon: <User size={14} /> },
                        ].map((opt, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', cursor: 'pointer', borderRadius: '8px' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                <div style={{ color: '#6b7280' }}>{opt.icon}</div>
                                <div style={{ fontSize: '0.8rem', color: '#374151' }}>{opt.label}</div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
        .btn-icon { border: none; background: none; padding: 0.4rem; cursor: pointer; border-radius: 6px; }
        .btn-icon:hover { background-color: #f3f4f6; }
        .btn-secondary:hover { background-color: #f9fafb; }
        .res-card:hover { filter: brightness(0.97); }
        .grid-cell:hover .cell-hover-time { display: flex !important; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
      `}} />
        </div>
    );
}
