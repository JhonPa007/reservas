import React, { useState, useEffect, useRef, useMemo } from 'react';
import Sidebar from './Sidebar';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, X, Trash2, Settings, UserPlus, Users, Clock, Search, Check, CheckCircle, Save, MoreVertical, ExternalLink, CreditCard, ShoppingBag, Mail, Phone, Info, Star, ChevronDown, User } from 'lucide-react';
import { format, addDays, startOfDay, addMinutes, isSameDay, parse, setHours, setMinutes } from 'date-fns';
import { es } from 'date-fns/locale';

const API_BASE = import.meta.env.VITE_API_URL || (window.location.origin.includes('localhost') ? 'http://localhost:5001/api' : window.location.origin + '/api');
const DISPLAY_START_HOUR = 8;
const DISPLAY_END_HOUR = 21;

/** Utilidad para parsear fechas de DB de forma segura */
function safeDate(dateStr) {
    if (!dateStr) return new Date();
    let s = "";
    if (dateStr instanceof Date) {
        const y = dateStr.getFullYear();
        const m = String(dateStr.getMonth() + 1).padStart(2, '0');
        const d = String(dateStr.getDate()).padStart(2, '0');
        const hh = String(dateStr.getHours()).padStart(2, '0');
        const mm = String(dateStr.getMinutes()).padStart(2, '0');
        const ss = String(dateStr.getSeconds()).padStart(2, '0');
        s = `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
    } else {
        s = String(dateStr).replace(' ', 'T');
    }
    if (s.includes('.')) s = s.split('.')[0];
    if (s.endsWith('Z')) s = s.slice(0, -1);
    const d = new Date(s);
    return isNaN(d.getTime()) ? new Date() : d;
}

export default function PartnerView() {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [sucursal, setSucursal] = useState({ id: 1, nombre: 'JV Studio' });
    const [sucursales, setSucursales] = useState([]);
    const [empleados, setEmpleados] = useState([]);
    const [servicios, setServicios] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [reservas, setReservas] = useState([]);
    const [horarios, setHorarios] = useState([]);
    const [recurrentes, setRecurrentes] = useState([]);

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
    const [isResizingInProgress, setIsResizingInProgress] = useState(false);
    const [toast, setToast] = useState(null);
    const [dbHealth, setDbHealth] = useState(null);

    const [showActions, setShowActions] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [showServiceSearch, setShowServiceSearch] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [clientSearchTerm, setClientSearchTerm] = useState('');
    const [serviceSearchTerm, setServiceSearchTerm] = useState('');
    const [newClientData, setNewClientData] = useState({ razon_social_nombres: '', apellidos: '', telefono: '', email: '' });
    const [birthDayMonth, setBirthDayMonth] = useState(''); // "MM-DD"
    const [birthYear, setBirthYear] = useState(''); // "YYYY"

    const [visibleStaffIds, setVisibleStaffIds] = useState([]); // IDs of staff to show
    const [showStaffFilter, setShowStaffFilter] = useState(false);
    const [staffFilterMode, setStaffFilterMode] = useState('all'); // 'all', 'with_appointments'
    const [staffSearchTerm, setStaffSearchTerm] = useState('');
    const staffFilterRef = useRef(null);
    const empMenuRef = useRef(null);
    const [quickActionMenu, setQuickActionMenu] = useState(null);
    const quickActionMenuRef = useRef(null);

    const [empMenu, setEmpMenu] = useState(null); // {empId, x, y}
    const [now, setNow] = useState(new Date());

    const [shiftFormData, setShiftFormData] = useState({
        empId: null,
        empNombre: '',
        intervals: [{ hora_inicio: '09:00', hora_fin: '18:00' }],
        copyToDays: [] // [1, 2, 3, 4, 5] (L, M, X, J, V)
    });

    const handleEditShift = (empId) => {
        const emp = empleados.find(e => e.id === empId);
        const empShifts = horarios.filter(h => h.empleado_id === empId);
        setShiftFormData({
            empId,
            empNombre: emp?.nombre_display || emp?.nombres,
            intervals: empShifts.length > 0
                ? empShifts.map(h => ({ hora_inicio: h.hora_inicio.slice(0, 5), hora_fin: h.hora_fin.slice(0, 5) }))
                : [{ hora_inicio: '09:00', hora_fin: '18:00' }]
        });
        setViewState('shift_edit');
        setEmpMenu(null);
    };

    useEffect(() => {
        function handleGlobalEvents(e) {
            // Close logic on ESC
            if (e.key === 'Escape') {
                setShowStaffFilter(false);
                setEmpMenu(null);
                setQuickActionMenu(null);
                setShowConfig(false);
                setViewState('search');
            }

            // Close staff filter on click outside
            if (showStaffFilter && staffFilterRef.current && !staffFilterRef.current.contains(e.target)) {
                setShowStaffFilter(false);
            }

            // Close emp menu on click outside
            if (empMenu && empMenuRef.current && !empMenuRef.current.contains(e.target)) {
                setEmpMenu(null);
            }
        }

        window.addEventListener('keydown', handleGlobalEvents);
        window.addEventListener('mousedown', handleGlobalEvents);
        return () => {
            window.removeEventListener('keydown', handleGlobalEvents);
            window.removeEventListener('mousedown', handleGlobalEvents);
        };
    }, [showStaffFilter, empMenu]);

    useEffect(() => {
        fetch(`${API_BASE}/sucursales`).then(res => res.json()).then(data => {
            setSucursales(data);
            if (data.length > 0) setSucursal(data[0]);
        });
        fetch(`${API_BASE}/servicios`).then(res => res.json()).then(setServicios);
        fetch(`${API_BASE}/clientes`).then(res => res.json()).then(setClientes);

        fetch(`${API_BASE}/health`).then(res => res.json()).then(setDbHealth).catch(console.error);
        const timer = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (sucursales.length > 0) {
            const studio = sucursales.find(s => s.nombre === 'JV Studio');
            if (studio) setSucursal(studio);
            else setSucursal(sucursales[0]);
        }
    }, [sucursales]);

    useEffect(() => {
        if (sucursal) refreshData();
    }, [sucursal, selectedDate]);

    useEffect(() => {
        if (empleados.length > 0) {
            setVisibleStaffIds(empleados.map(e => e.id));
        }
    }, [empleados]);

    // Lógica global para redimensionamiento (Resizing)
    useEffect(() => {
        const handleGlobalMouseMove = (e) => {
            if (resizingRes) {
                const deltaY = e.clientY - resizingRes.startY;
                const newDuration = Math.max(15, resizingRes.originalDuration + Math.round(deltaY / 2.333));
                setResizingRes(curr => ({ ...curr, currentDuration: newDuration }));
            }
        };

        const handleGlobalMouseUp = async () => {
            if (resizingRes) {
                const resId = resizingRes.id;
                const newMins = resizingRes.currentDuration;

                const targetRes = reservas.find(r => String(r.id) === String(resId));
                if (targetRes) {
                    const start = safeDate(targetRes.fecha_hora_inicio);
                    const newEnd = addMinutes(start, newMins);
                    const nEndStr = format(newEnd, 'yyyy-MM-dd HH:mm:ss');

                    // Actualización optimista local
                    setReservas(prev => prev.map(r => String(r.id) === String(resId) ? {
                        ...r,
                        duracion_minutos: newMins,
                        fecha_hora_fin: nEndStr
                    } : r));

                    try {
                        console.log("Saving resize:", { id: resId, mins: newMins, end: nEndStr });
                        const resp = await fetch(`${API_BASE}/reservas/${resId}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                duracion_minutos: newMins,
                                fecha_hora_fin: nEndStr
                            })
                        });

                        // Pequeño delay para asegurar que DB procesó el cambio
                        setTimeout(() => {
                            refreshData();
                            setToast("Cita Reprogramada");
                            setTimeout(() => setToast(null), 3000);
                        }, 200);

                    } catch (err) {
                        console.error("Error al guardar duración:", err);
                        refreshData();
                    }
                }

                setResizingRes(null);
                setIsResizingInProgress(false);
            }
        };

        if (resizingRes) {
            window.addEventListener('mousemove', handleGlobalMouseMove);
            window.addEventListener('mouseup', handleGlobalMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [resizingRes, reservas]);

    const isTimeAvailable = (empId, mins) => {
        // 1. Prioridad: Turnos específicos para esta fecha
        const empHorarios = horarios.filter(h => h.empleado_id === empId);
        if (empHorarios.length > 0) {
            return empHorarios.some(h => {
                const [hStart, mStart] = h.hora_inicio.split(':').map(Number);
                const [hEnd, mEnd] = h.hora_fin.split(':').map(Number);
                return mins >= (hStart * 60 + mStart) && mins < (hEnd * 60 + mEnd);
            });
        }

        // 2. Fallback: Turnos recurrentes (semanales)
        const empRec = recurrentes.filter(h => h.empleado_id === empId);
        if (empRec.length > 0) {
            return empRec.some(h => {
                const [hStart, mStart] = h.hora_inicio.split(':').map(Number);
                const [hEnd, mEnd] = h.hora_fin.split(':').map(Number);
                return mins >= (hStart * 60 + mStart) && mins < (hEnd * 60 + mEnd);
            });
        }

        // 3. Si no hay nada definido, no está disponible
        return false;
    };

    const handleAddAppointment = (empId) => {
        const hour = new Date().getHours();
        const mins = format(new Date(), 'mm');
        const startDate = new Date(selectedDate);
        startDate.setHours(hour, parseInt(mins), 0, 0);

        setDrawerOpen({
            id: 'new',
            empleado_id: empId,
            fecha_hora_inicio: format(startDate, 'yyyy-MM-dd HH:mm:ss'),
            startTime: format(startDate, 'HH:mm'),
            endTime: format(addMinutes(startDate, 60), 'HH:mm'),
            tipo: 'CITA'
        });
        setViewState('appointment');
        setEmpMenu(null);
    };

    const handleAddBlock = (empId) => {
        const hour = new Date().getHours();
        const startDate = new Date(selectedDate);
        startDate.setHours(hour, 0, 0, 0);

        setDrawerOpen({
            id: 'new',
            empleado_id: empId,
            fecha_hora_inicio: format(startDate, 'yyyy-MM-dd HH:mm:ss'),
            startTime: format(startDate, 'HH:mm'),
            endTime: format(addMinutes(startDate, 60), 'HH:mm'),
            tipo: 'BLOQUEO',
            subtipo_bloqueo: 'Comida'
        });
        setViewState('appointment');
        setEmpMenu(null);
    };

    const refreshData = async () => {
        if (!sucursal) return;
        try {
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            const [empRes, resRes, servRes, cliRes] = await Promise.all([
                fetch(`${API_BASE}/empleados/${sucursal.id}`),
                fetch(`${API_BASE}/reservas/sucursal/${sucursal.id}/${dateStr}`),
                fetch(`${API_BASE}/servicios`),
                fetch(`${API_BASE}/clientes`)
            ]);

            const empData = await empRes.json();
            const data = await resRes.json();
            const servData = await servRes.json();
            const cliData = await cliRes.json();

            setEmpleados(empData);
            setReservas(data.reservas || []);
            setHorarios(data.horarios || []);
            setRecurrentes(data.recurrentes || []);
            setServicios(servData);
            setClientes(cliData);
            console.log("Datos cargados:", {
                fecha: dateStr,
                citasCargadas: (data.reservas || []).length,
                empleados: empData.length
            });
            setLoading(false);
        } catch (err) {
            console.error(err);
            setLoading(false);
        }
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

        const oldRes = reservas.find(r => String(r.id) === String(resId));
        let duration = oldRes?.duracion_minutos || 40;
        if (oldRes?.fecha_hora_inicio && oldRes?.fecha_hora_fin) {
            duration = (safeDate(oldRes.fecha_hora_fin) - safeDate(oldRes.fecha_hora_inicio)) / (1000 * 60);
        }

        const nStart = format(newDate, 'yyyy-MM-dd HH:mm:ss');
        const nEndStr = format(addMinutes(newDate, duration), 'yyyy-MM-dd HH:mm:ss');

        // Actualización optimista local
        setReservas(prev => prev.map(r => String(r.id) === String(resId) ? {
            ...r,
            empleado_id: empleadoId,
            fecha_hora_inicio: nStart,
            fecha_hora_fin: nEndStr
        } : r));

        try {
            await fetch(`${API_BASE}/reservas/${resId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    empleado_id: empleadoId,
                    fecha_hora_inicio: nStart,
                    fecha_hora_fin: nEndStr
                })
            });
            refreshData();
            setToast("Cita Reprogramada");
            setTimeout(() => setToast(null), 3000);
        } catch (err) {
            console.error(err);
            refreshData(); // Rollback en caso de error
        }
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
        const hour = Math.floor(mins / 60);
        const m = mins % 60;
        const newDate = new Date(selectedDate);
        newDate.setHours(hour, m, 0, 0);

        setDrawerOpen({
            id: 'new',
            empleado_id: empId,
            fecha_hora_inicio: format(newDate, 'yyyy-MM-dd HH:mm:ss'),
            startTime: format(newDate, 'HH:mm'),
            endTime: format(addMinutes(newDate, 60), 'HH:mm'),
            cliente_id: null,
            servicio_id: null,
            tipo: 'CITA'
        });
        setViewState('appointment');
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
            notas_cliente: drawerOpen.notas_cliente || '',
            notas_internas: drawerOpen.notas_internas || '',
            precio_cobrado: drawerOpen.precio_cobrado || 0,
            origen: isNew ? 'PARTNER' : drawerOpen.origen
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
            servicio_precio: parseFloat(service.precio),
            servicio_duracion: parseInt(service.duracion_minutos),
            fecha_hora_fin: format(end, 'yyyy-MM-dd HH:mm:ss'),
            endTime: format(end, 'HH:mm'),
            precio_cobrado: parseFloat(service.precio)
        });
        setViewState('appointment');
    };

    function getDurationHeight(mins) {
        return (mins / (cellDuration || 10)) * rowHeight;
    }

    function getTimeTop(dateStr) {
        if (!dateStr) return 0;
        const d = safeDate(dateStr);
        const hour = d.getHours();
        const minsTotal = hour * 60 + d.getMinutes();
        const diff = minsTotal - (DISPLAY_START_HOUR * 60);
        return (diff / (cellDuration || 10)) * rowHeight;
    }

    function formatAMPM(dateStr) {
        if (!dateStr) return '';
        try {
            const d = safeDate(dateStr);
            if (isNaN(d.getTime())) return '';
            return format(d, 'h:mm a');
        } catch (e) { return ''; }
    }

    // Algoritmo de solapamiento robusto
    function processOverlaps(resArray) {
        if (!resArray || resArray.length === 0) return {};

        const sorted = [...resArray].sort((a, b) => safeDate(a.fecha_hora_inicio) - safeDate(b.fecha_hora_inicio));
        const clusters = [];

        sorted.forEach(res => {
            const start = safeDate(res.fecha_hora_inicio).getTime();
            let duration = res.duracion_minutos || 40;
            if (res.fecha_hora_inicio && res.fecha_hora_fin) {
                duration = (safeDate(res.fecha_hora_fin) - safeDate(res.fecha_hora_inicio)) / (1000 * 60);
            }
            const end = start + (duration * 60000);

            let foundCluster = clusters.find(cluster => {
                return cluster.some(c => {
                    const cStart = safeDate(c.fecha_hora_inicio).getTime();
                    let cDuration = c.duracion_minutos || 40;
                    if (c.fecha_hora_inicio && c.fecha_hora_fin) {
                        cDuration = (safeDate(c.fecha_hora_fin) - safeDate(c.fecha_hora_inicio)) / (1000 * 60);
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
            cluster.sort((a, b) => safeDate(a.fecha_hora_inicio) - safeDate(b.fecha_hora_inicio));
            const columns = [];

            cluster.forEach(res => {
                const start = safeDate(res.fecha_hora_inicio).getTime();
                let colIndex = columns.findIndex(colLastEnd => start >= colLastEnd);

                if (colIndex === -1) {
                    columns.push(0);
                    colIndex = columns.length - 1;
                }

                let duration = res.duracion_minutos || 40;
                if (res.fecha_hora_inicio && res.fecha_hora_fin) {
                    duration = (safeDate(res.fecha_hora_fin) - safeDate(res.fecha_hora_inicio)) / (1000 * 60);
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
    }

    const timelineTop = ((now.getHours() * 60 + now.getMinutes() - DISPLAY_START_HOUR * 60) / (cellDuration || 10)) * rowHeight;

    const visibleEmployees = empleados.filter(emp => {
        if (staffFilterMode === 'with_appointments') {
            return reservas.some(r => r.empleado_id === emp.id);
        }
        return visibleStaffIds.includes(emp.id);
    });

    return (
        <div className="partner-view" style={{ display: 'flex', height: '100vh', backgroundColor: '#f9fafb', fontFamily: "'Inter', sans-serif", overflow: 'hidden' }}>

            <Sidebar />

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
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        {/* STAFF FILTER BUTTON */}
                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={() => setShowStaffFilter(!showStaffFilter)}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '20px', border: '1px solid #e5e7eb', backgroundColor: '#fff', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer', outline: 'none' }}
                            >
                                <Users size={16} />
                                <span>
                                    {staffFilterMode === 'with_appointments' ? 'Miembros con citas' :
                                        visibleStaffIds.length === empleados.length ? 'Todo el equipo' :
                                            `${visibleStaffIds.length} miembros`}
                                </span>
                                <ChevronRight size={14} style={{ transform: showStaffFilter ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform 0.2s' }} />
                            </button>

                            {showStaffFilter && (
                                <div ref={staffFilterRef} style={{ position: 'absolute', top: '110%', right: 0, width: '320px', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb', zIndex: 1000, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    {/* SEARCH BAR */}
                                    <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
                                        <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                                        <input
                                            placeholder="Buscar"
                                            value={staffSearchTerm}
                                            onChange={e => setStaffSearchTerm(e.target.value)}
                                            style={{ width: '100%', padding: '0.6rem 0.6rem 0.6rem 2.2rem', borderRadius: '12px', border: '1px solid #e5e7eb', backgroundColor: '#f9fafb', fontSize: '0.85rem', outline: 'none' }}
                                        />
                                    </div>

                                    {/* QUICK MODES */}
                                    <div
                                        onClick={() => { setStaffFilterMode('with_appointments'); setShowStaffFilter(false); }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', borderRadius: '12px', cursor: 'pointer', backgroundColor: staffFilterMode === 'with_appointments' ? '#eff6ff' : 'transparent', color: staffFilterMode === 'with_appointments' ? '#2563eb' : '#374151' }}
                                        onMouseEnter={e => !staffFilterMode.includes('with_appointments') && (e.currentTarget.style.backgroundColor = '#f9fafb')} onMouseLeave={e => staffFilterMode !== 'with_appointments' && (e.currentTarget.style.backgroundColor = 'transparent')}
                                    >
                                        <CalendarIcon size={18} />
                                        <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>Miembros del equipo con citas</span>
                                    </div>

                                    <div
                                        onClick={() => { setStaffFilterMode('all'); setVisibleStaffIds(empleados.map(e => e.id)); setShowStaffFilter(false); }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', borderRadius: '12px', cursor: 'pointer', backgroundColor: staffFilterMode === 'all' && visibleStaffIds.length === empleados.length ? '#eff6ff' : 'transparent', color: staffFilterMode === 'all' && visibleStaffIds.length === empleados.length ? '#2563eb' : '#374151' }}
                                        onMouseEnter={e => (staffFilterMode !== 'all' || visibleStaffIds.length !== empleados.length) && (e.currentTarget.style.backgroundColor = '#f9fafb')} onMouseLeave={e => (staffFilterMode !== 'all' || visibleStaffIds.length !== empleados.length) && (e.currentTarget.style.backgroundColor = 'transparent')}
                                    >
                                        <Users size={18} />
                                        <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>Todo el equipo</span>
                                    </div>

                                    <div style={{ height: '1px', backgroundColor: '#f3f4f6', margin: '0.5rem 0' }} />

                                    {/* MASTER CHECKBOX */}
                                    <div
                                        onClick={() => {
                                            if (visibleStaffIds.length === empleados.length) setVisibleStaffIds([]);
                                            else setVisibleStaffIds(empleados.map(e => e.id));
                                            setStaffFilterMode('all');
                                        }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', borderRadius: '12px', cursor: 'pointer' }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: '2px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: visibleStaffIds.length === empleados.length ? '#2563eb' : '#fff', borderColor: visibleStaffIds.length === empleados.length ? '#2563eb' : '#e5e7eb' }}>
                                            {visibleStaffIds.length === empleados.length && <CheckCircle size={14} color="#fff" />}
                                        </div>
                                        <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#6b7280' }}>Todos los miembros del equipo</span>
                                    </div>

                                    {/* INDIVIDUAL STAFF */}
                                    <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                                        {empleados.filter(e => `${e.nombres} ${e.apellidos}`.toLowerCase().includes(staffSearchTerm.toLowerCase())).map(emp => (
                                            <div
                                                key={emp.id}
                                                onClick={() => {
                                                    const newIds = visibleStaffIds.includes(emp.id)
                                                        ? visibleStaffIds.filter(id => id !== emp.id)
                                                        : [...visibleStaffIds, emp.id];
                                                    setVisibleStaffIds(newIds);
                                                    setStaffFilterMode('all');
                                                }}
                                                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', borderRadius: '12px', cursor: 'pointer' }}
                                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                            >
                                                <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: '2px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: visibleStaffIds.includes(emp.id) ? '#2563eb' : '#fff', borderColor: visibleStaffIds.includes(emp.id) ? '#2563eb' : '#e5e7eb' }}>
                                                    {visibleStaffIds.includes(emp.id) && <CheckCircle size={14} color="#fff" />}
                                                </div>
                                                <div translate="no" style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 900, color: '#fff' }}>
                                                    {((emp.nombres || emp.nombre_display || 'U').trim().match(/[a-zA-Z]/) || ['U'])[0].toUpperCase()}{((emp.apellidos || '').trim().match(/[a-zA-Z]/) || [''])[0].toUpperCase()}
                                                </div>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1f2937' }}>{emp.nombres} {emp.apellidos}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <button onClick={() => setShowConfig(!showConfig)} className="btn-secondary"><Settings size={18} /></button>
                    </div>
                </header>

                {/* Grid Body */}
                <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
                    <div style={{ minWidth: '100%', display: 'flex', flexDirection: 'column' }}>
                        {/* Header Employees */}
                        <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 60, backgroundColor: 'white', borderBottom: '1px solid #e5e7eb' }}>
                            <div style={{ width: '60px', flexShrink: 0, borderRight: '1px solid #e5e7eb' }} />
                            {visibleEmployees.map(emp => (
                                <div key={emp.id} style={{ flex: 1, minWidth: '200px', padding: '1rem', textAlign: 'center', borderRight: '1px solid #e5e7eb' }}>
                                    <div translate="no" style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#000', margin: '0 auto 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.8rem', color: '#fff' }}>
                                        {((emp.nombres || emp.nombre_display || 'U').trim().match(/[a-zA-Z]/) || ['U'])[0].toUpperCase()}{((emp.apellidos || '').trim().match(/[a-zA-Z]/) || [''])[0].toUpperCase()}
                                    </div>
                                    <div
                                        onClick={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            setEmpMenu({ empId: emp.id, x: rect.left, y: rect.bottom });
                                        }}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer' }}
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

                            {visibleEmployees.map(emp => (
                                <div key={emp.id} style={{ flex: 1, minWidth: '200px', position: 'relative', borderRight: '1px solid #e5e7eb' }}>
                                    {/* Grid lines & Hover Time */}
                                    {Array.from({ length: (DISPLAY_END_HOUR - DISPLAY_START_HOUR) * 60 / cellDuration }).map((_, i) => {
                                        const mins = DISPLAY_START_HOUR * 60 + i * cellDuration;
                                        const available = isTimeAvailable(emp.id, mins);
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
                                                    backgroundColor: available ? 'white' : '#f9fafb',
                                                    backgroundImage: !available ? 'repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(0,0,0,0.02) 8px, rgba(0,0,0,0.02) 16px)' : 'none',
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
                                        const empRes = reservas.filter(r => String(r.empleado_id) === String(emp.id) && r.estado !== 'CANCELADA');
                                        const overlapData = processOverlaps(empRes);

                                        return empRes.map((res) => {
                                            const isBlocked = res.tipo === 'BLOQUEO';
                                            const colors = isBlocked ?
                                                { bg: '#f3f4f6', border: '#9ca3af', text: '#4b5563' } :
                                                ({
                                                    'RESERVADA': { bg: '#eff6ff', border: '#2563eb', text: '#1e40af' },
                                                    'CONFIRMADA': { bg: '#ecfdf5', border: '#059669', text: '#065f46' },
                                                    'INASISTENCIA': { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' },
                                                    'COMPLETADA': { bg: '#f0fdf4', border: '#10b981', text: '#166534' }
                                                }[res.estado] || { bg: '#eff6ff', border: '#2563eb', text: '#1e40af' });

                                            const isResizingThis = resizingRes?.id === res.id;
                                            const isModificable = res.estado === 'RESERVADA' || res.estado === 'CONFIRMADA' || isBlocked;

                                            // Calcular duración real basada en fechas si no se está redimensionando
                                            let displayDuration = res.duracion_minutos || 40;
                                            if (res.fecha_hora_fin && !isResizingThis) {
                                                const start = safeDate(res.fecha_hora_inicio);
                                                const end = safeDate(res.fecha_hora_fin);
                                                if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                                                    displayDuration = (end - start) / (1000 * 60);
                                                }
                                            }
                                            if (isResizingThis) displayDuration = resizingRes.currentDuration;

                                            const { colIndex, totalCols } = overlapData[res.id] || { colIndex: 0, totalCols: 1 };
                                            const width = `${100 / totalCols}%`;
                                            const left = `${(100 / totalCols) * colIndex}%`;

                                            // Tiempo dinámico para la etiqueta
                                            const startTime = safeDate(res.fecha_hora_inicio);
                                            const endTime = isResizingThis ? addMinutes(startTime, displayDuration) : safeDate(res.fecha_hora_fin);

                                            return (
                                                <div
                                                    key={res.id}
                                                    className="res-card"
                                                    draggable={isModificable && !isBlocked}
                                                    onDragStart={(e) => isModificable && handleDragStart(e, res)}
                                                    onMouseEnter={(e) => !resizingRes && setHoverRes({ res, x: e.clientX, y: e.clientY })}
                                                    onMouseLeave={() => setHoverRes(null)}
                                                    onClick={() => !isResizingInProgress && !resizingRes && (setDrawerOpen({
                                                        ...res,
                                                        tipo: res.tipo || 'CITA',
                                                        startTime: format(safeDate(res.fecha_hora_inicio), 'HH:mm'),
                                                        endTime: format(safeDate(res.fecha_hora_fin), 'HH:mm')
                                                    }), setViewState('appointment'))}
                                                    style={{
                                                        position: 'absolute',
                                                        top: getTimeTop(res.fecha_hora_inicio),
                                                        height: getDurationHeight(displayDuration),
                                                        left: left,
                                                        width: width,
                                                        backgroundColor: colors.bg,
                                                        borderLeft: `4px solid ${colors.border}`,
                                                        borderBottom: '1px solid rgba(0,0,0,0.05)',
                                                        padding: '0.4rem 0.6rem',
                                                        fontSize: '0.75rem',
                                                        zIndex: isResizingThis ? 100 : 10,
                                                        cursor: isBlocked ? 'pointer' : (!isModificable ? 'default' : (isResizingThis ? 'ns-resize' : 'move')),
                                                        boxSizing: 'border-box',
                                                        overflow: 'hidden',
                                                        boxShadow: isResizingThis ? '0 4px 12px rgba(0,0,0,0.2)' : '0 1px 2px rgba(0,0,0,0.1)',
                                                        opacity: isResizingThis ? 0.8 : 1,
                                                        transition: isResizingThis ? 'none' : 'all 0.1s ease',
                                                        backgroundImage: isBlocked ? 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.02) 10px, rgba(0,0,0,0.02) 20px)' : 'none'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                        <div style={{ fontSize: '0.65rem', fontWeight: 800, color: colors.text, opacity: 0.9 }}>
                                                            {format(startTime, 'h:mm a')} - {format(endTime, 'h:mm a')}
                                                        </div>
                                                        <div style={{ fontWeight: 800, color: colors.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.75rem' }}>
                                                            {isBlocked ? (res.subtipo_bloqueo || 'BLOQUEO').toUpperCase() : `${res.cliente_nombre} ${res.cliente_apellidos || ''}`}
                                                        </div>
                                                    </div>
                                                    {!isBlocked && (
                                                        <div style={{ fontSize: '0.6rem', color: colors.text, marginTop: '1px', opacity: 0.7, fontWeight: 600 }}>
                                                            {res.servicio_nombre}
                                                        </div>
                                                    )}

                                                    {/* Manija de redimensionamiento (Resize Handle) */}
                                                    {isModificable && !isBlocked && (
                                                        <div
                                                            onMouseDown={(e) => {
                                                                e.stopPropagation();
                                                                setResizingRes({
                                                                    id: res.id,
                                                                    originalDuration: displayDuration,
                                                                    currentDuration: displayDuration,
                                                                    startY: e.clientY
                                                                });
                                                                setIsResizingInProgress(true);
                                                            }}
                                                            style={{
                                                                position: 'absolute',
                                                                bottom: 0,
                                                                left: 0,
                                                                right: 0,
                                                                height: '12px',
                                                                cursor: 'ns-resize',
                                                                zIndex: 101,
                                                                display: 'flex',
                                                                justifyContent: 'center',
                                                                alignItems: 'flex-end',
                                                                paddingBottom: '3px'
                                                            }}
                                                        >
                                                            <div style={{ width: '20px', height: '2px', backgroundColor: colors.border, borderRadius: '1px', opacity: 0.4 }} />
                                                        </div>
                                                    )}
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
            {(() => {
                if (!hoverRes) return null;

                // Buscar la versión más reciente de la reserva para reflejar cambios de estado inmediatos
                const currentRes = reservas.find(r => String(r.id) === String(hoverRes.res.id)) || hoverRes.res;

                const hoverColors = ({
                    'RESERVADA': { bg: '#2563eb', label: 'Reservada' },
                    'CONFIRMADA': { bg: '#059669', label: 'Confirmada' },
                    'INASISTENCIA': { bg: '#ef4444', label: 'Inasistencia' },
                    'COMPLETADA': { bg: '#10b981', label: 'Completada / Pagada' }
                }[currentRes.estado] || { bg: '#2563eb', label: 'Reservada' });

                const popupWidth = 280;
                const popupHeight = 180;
                let leftPos = hoverRes.x + 15;
                let topPos = hoverRes.y + 15;

                // Ajustar posición si se sale de la pantalla
                if (leftPos + popupWidth > window.innerWidth) {
                    leftPos = hoverRes.x - popupWidth - 15;
                }
                if (topPos + popupHeight > window.innerHeight) {
                    topPos = hoverRes.y - popupHeight - 15;
                }

                return (
                    <div style={{
                        position: 'fixed', top: topPos, left: leftPos, backgroundColor: 'white', borderRadius: '12px',
                        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)', zIndex: 1000,
                        width: `${popupWidth}px`, border: '1px solid #e5e7eb', overflow: 'hidden'
                    }}>
                        <div style={{ backgroundColor: hoverColors.bg, padding: '0.6rem 1rem', display: 'flex', justifyContent: 'space-between', color: 'white', fontWeight: 800, fontSize: '0.7rem' }}>
                            <span>{format(safeDate(currentRes.fecha_hora_inicio), 'h:mm a')} - {format(safeDate(currentRes.fecha_hora_fin), 'h:mm a')}</span>
                            <span>{hoverColors.label.toUpperCase()}</span>
                        </div>
                        <div style={{ padding: '1rem' }}>
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#f3f4fb', color: hoverColors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.9rem' }}>
                                    {currentRes?.cliente_nombre?.[0] || 'C'}
                                </div>
                                <div>
                                    <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#111' }}>{currentRes.cliente_nombre} {currentRes.cliente_apellidos || ''}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>+51 967 091 691</div>
                                </div>
                            </div>
                            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 800, fontSize: '0.8rem', color: '#111' }}>{currentRes.servicio_nombre}</span>
                                <span style={{ fontWeight: 900, fontSize: '0.85rem', color: '#111' }}>30 PEN</span>
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#d1d5db' }} />
                                Atendido por {currentRes.empleado_nombre || 'Especialista'} • 45 min
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* MAIN DRAWER SYSTEM (SLIDE-IN) */}
            <div style={{
                position: 'fixed', top: 0, right: drawerOpen ? 0 : '-100%', bottom: 0,
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

                    {/* TOAST MESSAGE */}
                    {toast && (
                        <div style={{
                            position: 'fixed',
                            bottom: '40px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            backgroundColor: '#1f2937',
                            color: '#fff',
                            padding: '12px 24px',
                            borderRadius: '12px',
                            fontSize: '0.9rem',
                            fontWeight: 700,
                            zIndex: 10000,
                            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)',
                            animation: 'fadeInOut 3s forwards'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '8px', height: '8px', backgroundColor: '#10b981', borderRadius: '50%' }} />
                                {toast}
                            </div>
                        </div>
                    )}

                    <style>{`
                        @keyframes fadeInOut {
                            0% { opacity: 0; transform: translate(-50%, 20px); }
                            10% { opacity: 1; transform: translate(-50%, 0); }
                            90% { opacity: 1; transform: translate(-50%, 0); }
                            100% { opacity: 0; transform: translate(-50%, -10px); }
                        }
                    `}</style>

                    {/* TOP HEADER */}
                    <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            {viewState !== 'shift_edit' && (
                                <>
                                    <div
                                        onClick={() => {
                                            if (drawerOpen) setDrawerOpen({ ...drawerOpen, tipo: 'CITA' });
                                        }}
                                        style={{ fontSize: '0.9rem', fontWeight: 900, cursor: 'pointer', color: (drawerOpen?.tipo || 'CITA') === 'CITA' ? '#000' : '#9ca3af', borderBottom: (drawerOpen?.tipo || 'CITA') === 'CITA' ? '2px solid #000' : 'none', paddingBottom: '4px' }}>
                                        Cita
                                    </div>
                                    <div
                                        onClick={() => {
                                            if (drawerOpen) setDrawerOpen({ ...drawerOpen, tipo: 'BLOQUEO', subtipo_bloqueo: 'Comida' });
                                        }}
                                        style={{ fontSize: '0.9rem', fontWeight: 900, cursor: 'pointer', color: drawerOpen?.tipo === 'BLOQUEO' ? '#000' : '#9ca3af', borderBottom: drawerOpen?.tipo === 'BLOQUEO' ? '2px solid #000' : 'none', paddingBottom: '4px' }}>
                                        Tiempo no disponible
                                    </div>
                                </>
                            )}
                            {viewState === 'shift_edit' && (
                                <div style={{ fontSize: '0.9rem', fontWeight: 900, color: '#000' }}>Configuración de turno</div>
                            )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            {drawerOpen?.id && (drawerOpen?.tipo || 'CITA') === 'CITA' && (
                                <div style={{ position: 'relative' }}>
                                    <select
                                        value={drawerOpen.estado || 'RESERVADA'}
                                        onChange={async (e) => {
                                            const novoEstado = e.target.value;
                                            if (novoEstado === 'CANCELADA') {
                                                if (window.confirm('¿Eliminar esta reserva por completo?')) {
                                                    try {
                                                        const r = await fetch(`${API_BASE}/reservas/${drawerOpen.id}`, { method: 'DELETE' });
                                                        if (r.ok) { setDrawerOpen(null); refreshData(); }
                                                    } catch (err) { alert('Error al eliminar'); }
                                                }
                                                return;
                                            }
                                            // Actualizar estado en local y remoto
                                            setDrawerOpen({ ...drawerOpen, estado: novoEstado });
                                            try {
                                                await fetch(`${API_BASE}/reservas/${drawerOpen.id}`, {
                                                    method: 'PATCH',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ estado: novoEstado })
                                                });
                                                refreshData();
                                            } catch (err) { console.error('Error actualizando estado'); }
                                        }}
                                        style={{
                                            padding: '4px 12px',
                                            borderRadius: '20px',
                                            fontSize: '0.75rem',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                            outline: 'none',
                                            border: '1px solid #e5e7eb',
                                            backgroundColor: (drawerOpen.estado === 'CONFIRMADA' ? '#ecfdf5' : (drawerOpen.estado === 'INASISTENCIA' ? '#fef2f2' : (drawerOpen.estado === 'COMPLETADA' ? '#f0fdf4' : '#eff6ff'))),
                                            color: (drawerOpen.estado === 'CONFIRMADA' ? '#059669' : (drawerOpen.estado === 'INASISTENCIA' ? '#ef4444' : (drawerOpen.estado === 'COMPLETADA' ? '#10b981' : '#2563eb')))
                                        }}
                                    >
                                        <option value="RESERVADA">Reservada</option>
                                        <option value="CONFIRMADA">Confirmada</option>
                                        <option value="INASISTENCIA">Inasistencia</option>
                                        {drawerOpen.estado === 'COMPLETADA' && <option value="COMPLETADA">Completada / Pagada</option>}
                                        <option value="CANCELADA">Eliminar / Cancelar</option>
                                    </select>
                                </div>
                            )}
                            <button onClick={() => { setDrawerOpen(null); setViewState('calendar'); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={20} /></button>
                        </div>
                    </div>

                    {/* VIEW: SHIFT EDIT FORM (Fresha Style) */}
                    {viewState === 'shift_edit' && (
                        <div style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto' }}>
                            <div style={{ marginBottom: '1rem' }}>
                                <h1 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '0.5rem' }}>Turno de {shiftFormData.empNombre} el {format(selectedDate, "eeee, d MMM", { locale: es })}</h1>
                                <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>Solo estás editando los turnos de este día. Para establecer turnos recurrentes, ve a turnos programados.</p>
                            </div>

                            {shiftFormData.intervals.map((interval, idx) => (
                                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '1rem', alignItems: 'flex-end' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>Hora de inicio</label>
                                        <input
                                            type="time"
                                            value={interval.hora_inicio}
                                            onChange={(e) => {
                                                const newInts = [...shiftFormData.intervals];
                                                newInts[idx].hora_inicio = e.target.value;
                                                setShiftFormData({ ...shiftFormData, intervals: newInts });
                                            }}
                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb', outline: 'none', fontWeight: 700 }}
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>Hora de finalización</label>
                                        <input
                                            type="time"
                                            value={interval.hora_fin}
                                            onChange={(e) => {
                                                const newInts = [...shiftFormData.intervals];
                                                newInts[idx].hora_fin = e.target.value;
                                                setShiftFormData({ ...shiftFormData, intervals: newInts });
                                            }}
                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb', outline: 'none', fontWeight: 700 }}
                                        />
                                    </div>
                                    <button
                                        onClick={() => {
                                            if (shiftFormData.intervals.length > 1) {
                                                const newInts = shiftFormData.intervals.filter((_, i) => i !== idx);
                                                setShiftFormData({ ...shiftFormData, intervals: newInts });
                                            }
                                        }}
                                        style={{ background: 'none', border: 'none', paddingBottom: '12px', cursor: 'pointer', color: '#6b7280' }}
                                    >
                                        <Trash2 size={20} />
                                    </button>
                                </div>
                            ))}

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <button
                                    onClick={() => {
                                        const last = shiftFormData.intervals[shiftFormData.intervals.length - 1];
                                        setShiftFormData({ ...shiftFormData, intervals: [...shiftFormData.intervals, { hora_inicio: last.hora_fin, hora_fin: '21:00' }] });
                                    }}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '20px', padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 800, fontSize: '0.85rem' }}
                                >
                                    <Plus size={16} /> Añadir otro intervalo
                                </button>

                                <div style={{ display: 'flex', gap: '0.4rem', backgroundColor: '#f3f4f6', padding: '4px', borderRadius: '24px' }}>
                                    {[
                                        { l: 'L', v: 1 }, { l: 'M', v: 2 }, { l: 'X', v: 3 }, { l: 'J', v: 4 }, { l: 'V', v: 5 }, { l: 'S', v: 6 }, { l: 'D', v: 0 }
                                    ].map((dayObj) => {
                                        const isSelected = shiftFormData.copyToDays.includes(dayObj.v);
                                        return (
                                            <button
                                                key={dayObj.v}
                                                onClick={() => {
                                                    const current = shiftFormData.copyToDays;
                                                    const next = current.includes(dayObj.v)
                                                        ? current.filter(d => d !== dayObj.v)
                                                        : [...current, dayObj.v];
                                                    setShiftFormData({ ...shiftFormData, copyToDays: next });
                                                }}
                                                style={{
                                                    width: '32px', height: '32px', borderRadius: '50%', border: 'none',
                                                    backgroundColor: isSelected ? '#000' : 'transparent',
                                                    color: isSelected ? '#fff' : '#6b7280',
                                                    fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s'
                                                }}
                                            >
                                                {dayObj.l}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1.5rem', marginTop: 'auto', display: 'flex', gap: '1rem' }}>
                                <button
                                    onClick={() => setViewState('calendar')}
                                    style={{ flex: 1, padding: '1rem', borderRadius: '30px', backgroundColor: 'white', color: '#000', border: '1px solid #e5e7eb', fontWeight: 900, cursor: 'pointer' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={async () => {
                                        try {
                                            const basePayload = {
                                                empleado_id: shiftFormData.empId,
                                                sucursal_id: sucursal.id,
                                                intervalos: shiftFormData.intervals
                                            };
                                            const promises = [
                                                fetch(`${API_BASE}/horarios`, {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ ...basePayload, fecha: format(selectedDate, 'yyyy-MM-dd') })
                                                })
                                            ];
                                            if (shiftFormData.copyToDays.length > 0) {
                                                const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
                                                shiftFormData.copyToDays.forEach(dayIndex => {
                                                    const targetDate = addDays(start, dayIndex === 0 ? 6 : dayIndex - 1);
                                                    if (!isSameDay(targetDate, selectedDate)) {
                                                        promises.push(fetch(`${API_BASE}/horarios`, {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ ...basePayload, fecha: format(targetDate, 'yyyy-MM-dd') })
                                                        }));
                                                    }
                                                });
                                            }
                                            await Promise.all(promises);
                                            setViewState('calendar');
                                            refreshData();
                                        } catch (err) { alert('Error al guardar turnos'); }
                                    }}
                                    style={{ flex: 1, padding: '1rem', borderRadius: '30px', backgroundColor: '#2563eb', color: 'white', border: 'none', fontWeight: 900, cursor: 'pointer' }}
                                >
                                    Guardar y replicar
                                </button>
                            </div>
                        </div>
                    )}

                    {/* VIEW: BLOCK TIME FORM (Fresha Style) */}
                    {(drawerOpen?.tipo === 'BLOQUEO') && (
                        <div style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem', overflowY: 'auto' }}>
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6b7280', display: 'block', marginBottom: '1rem' }}>Tipo de horario no disponible</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                                    {[
                                        { label: 'Personalizado', icon: <Plus size={20} /> },
                                        { label: 'Comida', icon: <Clock size={20} /> },
                                        { label: 'Reunión', icon: <Users size={20} /> },
                                        { label: 'Formación', icon: <Search size={20} /> },
                                        { label: 'Día Libre', icon: <CalendarIcon size={20} /> },
                                        { label: 'Vacaciones', icon: <Star size={20} /> }
                                    ].map(sub => (
                                        <div
                                            key={sub.label}
                                            onClick={() => {
                                                if (drawerOpen) setDrawerOpen({ ...drawerOpen, subtipo_bloqueo: sub.label });
                                            }}
                                            style={{
                                                padding: '1.25rem', borderRadius: '16px', border: (drawerOpen?.subtipo_bloqueo === sub.label) ? '2px solid #2563eb' : '1px solid #e5e7eb',
                                                backgroundColor: (drawerOpen?.subtipo_bloqueo === sub.label) ? '#eff6ff' : '#fff',
                                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', cursor: 'pointer'
                                            }}
                                        >
                                            <div style={{ color: (drawerOpen?.subtipo_bloqueo === sub.label) ? '#2563eb' : '#6b7280' }}>{sub.icon}</div>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>{sub.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>Fecha</label>
                                    <div style={{ padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb', backgroundColor: '#f9fafb', fontSize: '0.9rem', fontWeight: 700 }}>
                                        {format(selectedDate, "eeee, d MMM", { locale: es })}
                                    </div>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>Frecuencia</label>
                                    <select style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb', outline: 'none', fontWeight: 700 }}>
                                        <option>No se repite</option>
                                        <option>Cada día</option>
                                        <option>Cada semana</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>Hora de inicio</label>
                                    <input
                                        type="time"
                                        value={drawerOpen?.startTime || '09:00'}
                                        onChange={(e) => setDrawerOpen({ ...drawerOpen, startTime: e.target.value })}
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb', outline: 'none', fontWeight: 700 }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>Hora de finalización</label>
                                    <input
                                        type="time"
                                        value={drawerOpen?.endTime || '10:00'}
                                        onChange={(e) => setDrawerOpen({ ...drawerOpen, endTime: e.target.value })}
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb', outline: 'none', fontWeight: 700 }}
                                    />
                                </div>
                            </div>

                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>Descripción (Opcional)</label>
                                <textarea placeholder="Añadir descripción o comentario" style={{ width: '100%', height: '100px', padding: '1rem', borderRadius: '12px', border: '1px solid #e5e7eb', outline: 'none', fontSize: '0.9rem', resize: 'none' }} />
                            </div>

                            <div style={{ marginTop: 'auto', paddingTop: '2rem' }}>
                                <button
                                    onClick={async () => {
                                        const current = drawerOpen;
                                        const startTime = current.startTime || '09:00';
                                        const endTime = current.endTime || '10:00';
                                        const startISO = `${format(selectedDate, 'yyyy-MM-dd')} ${startTime}:00`;
                                        const endISO = `${format(selectedDate, 'yyyy-MM-dd')} ${endTime}:00`;

                                        const payload = {
                                            empleado_id: current.empleadoId || current.empleado_id,
                                            sucursal_id: sucursal.id,
                                            fecha_hora_inicio: startISO,
                                            fecha_hora_fin: endISO,
                                            tipo: 'BLOQUEO',
                                            subtipo_bloqueo: current.subtipo_bloqueo || 'Personalizado',
                                            estado: 'RESERVADA'
                                        };

                                        try {
                                            const resp = await fetch(`${API_BASE}/reservas`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify(payload)
                                            });
                                            if (resp.ok) {
                                                setDrawerOpen(null);
                                                refreshData();
                                            }
                                        } catch (err) { alert('Error al guardar bloqueo'); }
                                    }}
                                    style={{ width: '100%', padding: '1.25rem', borderRadius: '30px', backgroundColor: '#000', color: 'white', border: 'none', fontWeight: 900, fontSize: '1rem', cursor: 'pointer' }}
                                >
                                    Guardar
                                </button>
                            </div>
                        </div>
                    )}

                    {/* VIEW: APPOINTMENT EDIT / NEW APPOINTMENT / CLIENT CREATE */}
                    {(viewState === 'appointment' || viewState === 'client_search' || viewState === 'service_search' || viewState === 'client_create') && drawerOpen?.tipo !== 'BLOQUEO' && (
                        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                            {/* PANEL 1: CLIENT SELECTION */}
                            <div style={{ width: '400px', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', backgroundColor: '#fff' }}>
                                <div style={{ padding: '1.5rem', borderBottom: '1px solid #f3f4f6' }}>
                                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900 }}>
                                        {drawerOpen?.cliente_id ? 'Cliente' : 'Seleccionar cliente'}
                                    </h3>
                                </div>

                                <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                                    {viewState === 'client_create' ? (
                                        /* NEW CLIENT FORM */
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                            <button onClick={() => setViewState('appointment')} style={{ border: 'none', background: 'none', color: '#2563eb', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left', padding: 0 }}>← Volver</button>
                                            <h4 style={{ margin: 0, fontWeight: 900 }}>Nuevo cliente</h4>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>Nombres *</label>
                                                    <input
                                                        value={newClientData.razon_social_nombres}
                                                        onChange={e => setNewClientData({ ...newClientData, razon_social_nombres: e.target.value })}
                                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb', outline: 'none' }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>Apellidos</label>
                                                    <input
                                                        value={newClientData.apellidos}
                                                        onChange={e => setNewClientData({ ...newClientData, apellidos: e.target.value })}
                                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb', outline: 'none' }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>Email</label>
                                                    <input
                                                        type="email"
                                                        placeholder="example@domain.com"
                                                        value={newClientData.email}
                                                        onChange={e => setNewClientData({ ...newClientData, email: e.target.value })}
                                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb', outline: 'none' }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>Teléfono *</label>
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <div style={{ padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb', backgroundColor: '#f9fafb', fontSize: '0.9rem', color: '#6b7280' }}>+51</div>
                                                        <input
                                                            type="tel"
                                                            placeholder="900 000 000"
                                                            value={newClientData.telefono}
                                                            onChange={e => setNewClientData({ ...newClientData, telefono: e.target.value })}
                                                            style={{ flex: 1, padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb', outline: 'none' }}
                                                        />
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', gap: '1rem' }}>
                                                    <div style={{ flex: 2 }}>
                                                        <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>Fecha de nacimiento</label>
                                                        <div style={{ position: 'relative' }}>
                                                            <input
                                                                type="text"
                                                                placeholder="Día y mes"
                                                                value={birthDayMonth}
                                                                onChange={e => setBirthDayMonth(e.target.value)}
                                                                onFocus={e => e.target.type = 'date'}
                                                                onBlur={e => { if (!e.target.value) e.target.type = 'text'; }}
                                                                style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb', outline: 'none' }}
                                                            />
                                                            <CalendarIcon size={16} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
                                                        </div>
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>Año</label>
                                                        <input
                                                            type="number"
                                                            placeholder="Año"
                                                            value={birthYear}
                                                            onChange={e => setBirthYear(e.target.value)}
                                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb', outline: 'none' }}
                                                        />
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={async () => {
                                                        try {
                                                            let finalDate = null;
                                                            if (birthDayMonth) {
                                                                // birthDayMonth usually gives YYYY-MM-DD from type=date
                                                                // We ignore its year and use birthYear if provided
                                                                const [y, m, d] = birthDayMonth.split('-');
                                                                const yearToUse = birthYear || '1900';
                                                                finalDate = `${yearToUse}-${m}-${d}`;
                                                            }

                                                            const resp = await fetch(`${API_BASE}/clientes`, {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({
                                                                    ...newClientData,
                                                                    fecha_nacimiento: finalDate
                                                                })
                                                            });
                                                            const data = await resp.json();
                                                            if (data.success) {
                                                                handleSelectClient(data.cliente);
                                                                setNewClientData({ razon_social_nombres: '', apellidos: '', telefono: '', email: '' });
                                                                setBirthDayMonth('');
                                                                setBirthYear('');
                                                                setViewState('appointment');
                                                                fetch(`${API_BASE}/clientes`).then(r => r.json()).then(setClientes);
                                                            } else {
                                                                alert(data.message);
                                                            }
                                                        } catch (err) { alert('Error al crear cliente'); }
                                                    }}
                                                    style={{ marginTop: '1rem', padding: '1rem', borderRadius: '30px', backgroundColor: '#2563eb', color: 'white', border: 'none', fontWeight: 800, cursor: 'pointer' }}
                                                >
                                                    Crear y seleccionar
                                                </button>
                                            </div>
                                        </div>
                                    ) : drawerOpen?.cliente_id ? (
                                        /* CLIENT SELECTED VIEW */
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                                            <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '2rem', color: '#2563eb', marginBottom: '1rem' }}>
                                                {drawerOpen?.cliente_nombre?.[0] || 'A'}
                                            </div>
                                            <h2 style={{ fontSize: '1.2rem', fontWeight: 900, margin: '0 0 0.25rem 0' }}>{drawerOpen?.cliente_nombre} {drawerOpen?.cliente_apellidos || ''}</h2>
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
                                                <button
                                                    onClick={() => setViewState('client_create')}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', borderRadius: '12px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}
                                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                                >
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
                                    {/* TIME SELECTION */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>Hora de inicio</label>
                                            <input
                                                type="time"
                                                value={drawerOpen?.startTime || '09:00'}
                                                onChange={(e) => {
                                                    const start = e.target.value;
                                                    const newStartDate = `${format(selectedDate, 'yyyy-MM-dd')} ${start}:00`;
                                                    // Si hay servicio, recalcular fin
                                                    let newEndDate = drawerOpen.fecha_hora_fin;
                                                    let endTime = drawerOpen.endTime;
                                                    if (drawerOpen.servicio_duracion) {
                                                        const d = addMinutes(new Date(newStartDate), drawerOpen.servicio_duracion);
                                                        newEndDate = format(d, 'yyyy-MM-dd HH:mm:ss');
                                                        endTime = format(d, 'HH:mm');
                                                    }
                                                    setDrawerOpen({ ...drawerOpen, startTime: start, fecha_hora_inicio: newStartDate, fecha_hora_fin: newEndDate, endTime });
                                                }}
                                                style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb', outline: 'none', fontWeight: 700 }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>Hora de finalización</label>
                                            <input
                                                type="time"
                                                value={drawerOpen?.endTime || '10:00'}
                                                onChange={(e) => {
                                                    const end = e.target.value;
                                                    const newEndDate = `${format(selectedDate, 'yyyy-MM-dd')} ${end}:00`;
                                                    setDrawerOpen({ ...drawerOpen, endTime: end, fecha_hora_fin: newEndDate });
                                                }}
                                                style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb', outline: 'none', fontWeight: 700 }}
                                            />
                                        </div>
                                    </div>

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
            {
                quickActionMenu && (
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
                                        const absMins = quickActionMenu.mins + (DISPLAY_START_HOUR * 60);
                                        const newDate = new Date(selectedDate);
                                        newDate.setHours(Math.floor(absMins / 60), absMins % 60, 0, 0);

                                        setDrawerOpen({
                                            id: 'new',
                                            empleado_id: quickActionMenu.empId,
                                            fecha_hora_inicio: format(newDate, 'yyyy-MM-dd HH:mm:ss'),
                                            startTime: format(newDate, 'HH:mm'),
                                            endTime: format(addMinutes(newDate, 60), 'HH:mm'),
                                            tipo: 'CITA'
                                        });
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
                                        const absMins = quickActionMenu.mins + (DISPLAY_START_HOUR * 60);
                                        const newDate = new Date(selectedDate);
                                        newDate.setHours(Math.floor(absMins / 60), absMins % 60, 0, 0);

                                        setDrawerOpen({
                                            id: 'new',
                                            empleado_id: quickActionMenu.empId,
                                            fecha_hora_inicio: format(newDate, 'yyyy-MM-dd HH:mm:ss'),
                                            startTime: format(newDate, 'HH:mm'),
                                            endTime: format(addMinutes(newDate, 60), 'HH:mm'),
                                            tipo: 'BLOQUEO',
                                            subtipo_bloqueo: 'Comida'
                                        });
                                        setViewState('appointment');
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
                )
            }

            {/* Employee Menu */}
            {
                empMenu && (
                    <>
                        <div
                            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }}
                            onClick={() => setEmpMenu(null)}
                        />
                        <div ref={empMenuRef} style={{
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
                                { label: 'Añadir cita', icon: <Plus size={14} />, action: () => handleAddAppointment(empMenu.empId) },
                                { label: 'Añadir horario no disponible', icon: <Clock size={14} />, action: () => handleAddBlock(empMenu.empId) },
                                { label: 'Editar turno', icon: <Settings size={14} />, action: () => handleEditShift(empMenu.empId) },
                                { label: 'Añadir días libres', icon: <Plus size={14} />, action: () => handleAddBlock(empMenu.empId) },
                                { label: 'Ver miembro del equipo', icon: <User size={14} /> },
                            ].map((opt, i) => (
                                <div key={i} onClick={opt.action} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', cursor: 'pointer', borderRadius: '8px' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                    <div style={{ color: '#6b7280' }}>{opt.icon}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#374151' }}>{opt.label}</div>
                                </div>
                            ))}
                        </div>
                    </>
                )
            }


            <style dangerouslySetInnerHTML={{
                __html: `
        .btn-icon { border: none; background: none; padding: 0.4rem; cursor: pointer; border-radius: 6px; }
        .btn-icon:hover { background-color: #f3f4f6; }
        .btn-secondary:hover { background-color: #f9fafb; }
        .res-card:hover { filter: brightness(0.97); }
        .grid-cell:hover .cell-hover-time { display: flex !important; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
      `}} />
        </div >
    );
}
