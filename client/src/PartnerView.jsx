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

const getAvatarColor = (id) => {
    const colors = ['#000000', '#c2410c', '#0f766e', '#1e40af', '#7e22ce', '#be123c', '#15803d', '#4338ca'];
    return colors[id % colors.length] || '#000000';
};

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
    const [showClientActions, setShowClientActions] = useState(false);
    const [clientEditData, setClientEditData] = useState({ razon_social_nombres: '', apellidos: '', telefono: '', email: '' });
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
                setDrawerOpen(null);
                setViewState('appointment');
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

                        // Delay más conservador para asegurar estabilidad en DB
                        setTimeout(() => {
                            refreshData();
                            setToast("Cita Reprogramada");
                            setTimeout(() => setToast(null), 3000);
                        }, 500);

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

        // Actualización optimista local COMPLETA
        setReservas(prev => prev.map(r => String(r.id) === String(resId) ? {
            ...r,
            empleado_id: empleadoId,
            fecha_hora_inicio: nStart,
            fecha_hora_fin: nEndStr,
            duracion_minutos: duration
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
            // Delay para asegurar que el servidor procesó el cambio antes de refrescar
            setTimeout(() => {
                refreshData();
                setToast("Cita Reprogramada");
                setTimeout(() => setToast(null), 3000);
            }, 500);
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
                                        (visibleStaffIds.length >= empleados.length || visibleStaffIds.length === 0) ? 'Todo el equipo' :
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
                                                <div translate="no" style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: getAvatarColor(emp.id), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 900, color: '#fff' }}>
                                                    {(emp.nombre_display || emp.nombres || 'U').trim()[0].toUpperCase()}
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
                {/* CALENDAR GRID WRAPPER */}
                <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

                    {/* EMPLOYEES HEADER (STILL) */}
                    <div style={{ paddingLeft: '60px', display: 'flex', borderBottom: '1px solid #e5e7eb', backgroundColor: 'white', zIndex: 10 }}>
                        {visibleEmployees.map(emp => (
                            <div key={emp.id} style={{ flex: 1, minWidth: '150px', padding: '1rem', textAlign: 'center', borderRight: '1px solid #f3f4f6', position: 'relative' }}>
                                <div
                                    onClick={(e) => {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setEmpMenu({ empId: emp.id, x: rect.left, y: rect.bottom });
                                    }}
                                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}
                                >
                                    <div
                                        translate="no"
                                        style={{
                                            width: '42px',
                                            height: '42px',
                                            borderRadius: '50%',
                                            backgroundColor: getAvatarColor(emp.id),
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '1rem',
                                            fontWeight: 900,
                                            color: '#fff',
                                            transition: 'transform 0.2s',
                                            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                    >
                                        {(emp.nombre_display || emp.nombres || 'U').trim()[0].toUpperCase()}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span translate="no" style={{ fontWeight: 800, fontSize: '0.75rem', color: '#111827', textAlign: 'center', maxWidth: '120px' }}>
                                            {emp.nombre_display || `${emp.nombres} ${emp.apellidos}`}
                                        </span>
                                        <ChevronDown size={14} style={{ transform: empMenu?.empId === emp.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: '#6b7280' }} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* TIMELINE & GRID CONTENT */}
                    <div style={{ flex: 1, overflowY: 'auto', position: 'relative', display: 'flex' }}>
                        {/* Time labels column */}
                        <div style={{ width: '60px', flexShrink: 0, borderRight: '1px solid #e5e7eb', backgroundColor: '#fff', zIndex: 5 }}>
                            {Array.from({ length: DISPLAY_END_HOUR - DISPLAY_START_HOUR }).map((_, i) => {
                                const hour = DISPLAY_START_HOUR + i;
                                return (
                                    <div key={hour} style={{ height: (60 / cellDuration) * rowHeight, position: 'relative' }}>
                                        <span style={{ position: 'absolute', top: '-10px', right: '8px', fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af' }}>
                                            {format(setHours(new Date(), hour), 'h a')}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Grid cells */}
                        <div style={{ flex: 1, display: 'flex', position: 'relative', minHeight: (DISPLAY_END_HOUR - DISPLAY_START_HOUR) * 6 * rowHeight }}>
                            {/* Horizontal grid lines */}
                            {Array.from({ length: (DISPLAY_END_HOUR - DISPLAY_START_HOUR) * (60 / cellDuration) }).map((_, i) => (
                                <div key={i} style={{ position: 'absolute', top: i * rowHeight, left: 0, right: 0, height: '1px', backgroundColor: i % (60 / cellDuration) === 0 ? '#e5e7eb' : '#f3f4f6', zIndex: 1 }} />
                            ))}

                            {/* Current time line */}
                            {isSameDay(now, selectedDate) && now.getHours() >= DISPLAY_START_HOUR && now.getHours() < DISPLAY_END_HOUR && (
                                <div style={{ position: 'absolute', top: timelineTop, left: 0, right: 0, height: '2px', backgroundColor: '#ef4444', zIndex: 20, pointerEvents: 'none' }}>
                                    <div style={{ position: 'absolute', left: '-5px', top: '-4px', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
                                </div>
                            )}

                            {/* Columns for each employee */}
                            {visibleEmployees.map(emp => {
                                const empReservas = reservas.filter(r => r.empleado_id === emp.id);
                                const overlapInfo = processOverlaps(empReservas);

                                return (
                                    <div
                                        key={emp.id}
                                        onDragOver={e => e.preventDefault()}
                                        onDrop={e => {
                                            const bcr = e.currentTarget.getBoundingClientRect();
                                            const y = e.clientY - bcr.top + e.currentTarget.parentElement.parentElement.scrollTop;
                                            const mins = Math.round((y / rowHeight) * cellDuration / 15) * 15 + (DISPLAY_START_HOUR * 60);
                                            handleDrop(e, emp.id, mins);
                                        }}
                                        style={{ flex: 1, minWidth: '150px', borderRight: '1px solid #f3f4f6', position: 'relative' }}
                                    >
                                        {/* Availability / Working hours background */}
                                        {Array.from({ length: (DISPLAY_END_HOUR - DISPLAY_START_HOUR) * (60 / cellDuration) }).map((_, i) => {
                                            const mins = (DISPLAY_START_HOUR * 60) + (i * cellDuration);
                                            const available = isTimeAvailable(emp.id, mins);
                                            const hour = Math.floor(mins / 60);
                                            const m = mins % 60;
                                            const timeStr = `${hour}:${String(m).padStart(2, '0')}`;

                                            return (
                                                <div
                                                    key={i}
                                                    className="grid-cell"
                                                    onClick={(e) => handleCellClick(e, emp.id, mins, timeStr)}
                                                    onContextMenu={(e) => {
                                                        e.preventDefault();
                                                        setQuickActionMenu({ x: e.clientX, y: e.clientY, empId: emp.id, mins: i * cellDuration, timeStr });
                                                    }}
                                                    style={{
                                                        height: rowHeight,
                                                        backgroundColor: available ? 'transparent' : '#f9fafb',
                                                        backgroundImage: available ? 'none' : 'repeating-linear-gradient(45deg, #f3f4f6 0px, #f3f4f6 2px, transparent 2px, transparent 4px)',
                                                        cursor: available ? 'cell' : 'not-allowed',
                                                        position: 'relative'
                                                    }}
                                                >
                                                    {available && (
                                                        <div className="cell-hover-time" style={{ display: 'none', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(37, 99, 235, 0.05)', alignItems: 'center', justifyContent: 'center', color: '#2563eb', fontSize: '0.6rem', fontWeight: 800, zIndex: 2 }}>
                                                            {timeStr}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {/* Appointments / Blocks */}
                                        {empReservas.map(res => {
                                            const top = getTimeTop(res.fecha_hora_inicio);
                                            let duration = res.duracion_minutos || 40;
                                            if (res.fecha_hora_inicio && res.fecha_hora_fin) {
                                                duration = (safeDate(res.fecha_hora_fin) - safeDate(res.fecha_hora_inicio)) / (1000 * 60);
                                            }
                                            const height = getDurationHeight(duration);
                                            const { colIndex = 0, totalCols = 1 } = overlapInfo[res.id] || {};

                                            const isResizing = resizingRes?.id === res.id;
                                            const displayHeight = isResizing ? getDurationHeight(resizingRes.currentDuration) : height;

                                            if (res.tipo === 'BLOQUEO') {
                                                return (
                                                    <div
                                                        key={res.id}
                                                        onClick={() => setDrawerOpen(res)}
                                                        style={{ position: 'absolute', top, left: '2px', right: '2px', height: displayHeight, backgroundColor: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '4px', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', cursor: 'pointer' }}
                                                    >
                                                        <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#9ca3af', textAlign: 'center', textTransform: 'uppercase' }}>
                                                            {res.subtipo_bloqueo || 'No disponible'}
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            // CITA
                                            const colorScheme = {
                                                'PENDIENTE': { bg: '#eff6ff', border: '#2173df', text: '#1e40af', accent: '#3b82f6' },
                                                'CONFIRMADA': { bg: '#f0fdf4', border: '#22c55e', text: '#166534', accent: '#22c55e' },
                                                'EN_PROCESO': { bg: '#fdf4ff', border: '#d946ef', text: '#701a75', accent: '#d946ef' },
                                                'FINALIZADA': { bg: '#f8fafc', border: '#cbd5e1', text: '#475569', accent: '#64748b' },
                                                'CANCELADA': { bg: '#fef2f2', border: '#ef4444', text: '#991b1b', accent: '#ef4444' }
                                            };
                                            const theme = colorScheme[res.estado] || colorScheme['PENDIENTE'];

                                            return (
                                                <div
                                                    key={res.id}
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, res)}
                                                    onClick={() => {
                                                        if (!isResizingInProgress) {
                                                            setDrawerOpen(res);
                                                            setViewState('appointment');
                                                        }
                                                    }}
                                                    onMouseEnter={() => setHoverRes(res.id)}
                                                    onMouseLeave={() => setHoverRes(null)}
                                                    className="res-card"
                                                    style={{
                                                        position: 'absolute',
                                                        top,
                                                        left: `${(colIndex / totalCols) * 100}%`,
                                                        width: `${(1 / totalCols) * 100}%`,
                                                        height: displayHeight,
                                                        backgroundColor: theme.bg,
                                                        borderLeft: `4px solid ${theme.border}`,
                                                        borderRadius: '6px',
                                                        zIndex: isResizing ? 40 : 15,
                                                        padding: '6px 8px',
                                                        boxShadow: hoverRes === res.id ? '0 10px 15px -3px rgba(0,0,0,0.1)' : 'none',
                                                        cursor: 'grab',
                                                        transition: 'box-shadow 0.2s',
                                                        overflow: 'hidden',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '2px'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                        <span style={{ fontSize: '0.65rem', fontWeight: 900, color: theme.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {res.cliente_nombre || 'Sin nombre'}
                                                        </span>
                                                        {res.estado === 'CONFIRMADA' && <CheckCircle size={10} color={theme.accent} />}
                                                    </div>
                                                    <div style={{ fontSize: '0.6rem', color: theme.text, opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>
                                                        {res.servicio_nombre || 'Servicio'}
                                                    </div>
                                                    {height >= 40 && (
                                                        <div style={{ fontSize: '0.55rem', color: theme.text, opacity: 0.6, marginTop: 'auto', fontWeight: 700 }}>
                                                            {formatAMPM(res.fecha_hora_inicio)} - {duration} min
                                                        </div>
                                                    )}

                                                    {/* Resize handle */}
                                                    <div
                                                        onMouseDown={(e) => handleResizeStart(e, res)}
                                                        className="resize-handle"
                                                        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '8px', cursor: 'ns-resize', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                                                    >
                                                        <div style={{ width: '20px', height: '3px', borderRadius: '2px', backgroundColor: theme.border, opacity: 0.4 }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* DRAWER / MODAL LAYER */}
                {drawerOpen && (
                    <div
                        onClick={() => setDrawerOpen(null)}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(2px)', zIndex: 100, display: 'flex', justifyContent: 'flex-end', animation: 'fadeIn 0.2s ease-out' }}
                    >
                        <div
                            onClick={(e) => e.stopPropagation()}
                            style={{ width: '100%', maxWidth: '850px', backgroundColor: '#f9fafb', height: '100%', boxShadow: '-10px 0 25px rgba(0,0,0,0.1)', display: 'flex', overflow: 'hidden' }}
                        >

                            {/* DRAWER LEFT: DATA & SELECTORS */}
                            <div style={{ width: '400px', backgroundColor: '#fff', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ padding: '1.5rem', flex: 1, overflowY: 'auto' }}>

                                    {viewState === 'client_edit' ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                <button onClick={() => setViewState('appointment')} style={{ border: 'none', background: 'none', color: '#6b7280', cursor: 'pointer' }}><ChevronLeft size={20} /></button>
                                                <h4 style={{ margin: 0, fontWeight: 900 }}>Editar cliente</h4>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                    <div>
                                                        <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>Nombres</label>
                                                        <input
                                                            value={clientEditData.razon_social_nombres}
                                                            onChange={e => setClientEditData({ ...clientEditData, razon_social_nombres: e.target.value })}
                                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb', outline: 'none', fontWeight: 700 }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>Apellidos</label>
                                                        <input
                                                            value={clientEditData.apellidos}
                                                            onChange={e => setClientEditData({ ...clientEditData, apellidos: e.target.value })}
                                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb', outline: 'none', fontWeight: 700 }}
                                                        />
                                                    </div>
                                                </div>

                                                <div>
                                                    <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>Teléfono móvil</label>
                                                    <input
                                                        value={clientEditData.telefono}
                                                        onChange={e => setClientEditData({ ...clientEditData, telefono: e.target.value })}
                                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb', outline: 'none', fontWeight: 700 }}
                                                    />
                                                </div>

                                                <div>
                                                    <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>Correo electrónico</label>
                                                    <input
                                                        value={clientEditData.email}
                                                        onChange={e => setClientEditData({ ...clientEditData, email: e.target.value })}
                                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb', outline: 'none', fontWeight: 700 }}
                                                    />
                                                </div>

                                                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                                    <button
                                                        onClick={() => setViewState('appointment')}
                                                        style={{ flex: 1, padding: '1rem', borderRadius: '30px', backgroundColor: '#fff', color: '#6b7280', border: '1px solid #e5e7eb', fontWeight: 800, cursor: 'pointer' }}
                                                    >
                                                        Cancelar
                                                    </button>
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                const resp = await fetch(`${API_BASE}/clientes/${drawerOpen.cliente_id}`, {
                                                                    method: 'PATCH',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify(clientEditData)
                                                                });
                                                                if (resp.ok) {
                                                                    const updated = await resp.json();
                                                                    setDrawerOpen({
                                                                        ...drawerOpen,
                                                                        cliente_nombre: updated.razon_social_nombres,
                                                                        cliente_apellidos: updated.apellidos,
                                                                        cliente_telefono: updated.telefono
                                                                    });
                                                                    setViewState('appointment');
                                                                    setToast("Cliente actualizado");
                                                                    setTimeout(() => setToast(null), 3000);
                                                                    refreshData();
                                                                    fetch(`${API_BASE}/clientes`).then(r => r.json()).then(setClientes);
                                                                }
                                                            } catch (err) { alert('Error al guardar'); }
                                                        }}
                                                        style={{ flex: 2, padding: '1rem', borderRadius: '30px', backgroundColor: '#000', color: 'white', border: 'none', fontWeight: 800, cursor: 'pointer' }}
                                                    >
                                                        Guardar cambios
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : viewState === 'client_create' ? (
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
                                        <div style={{ display: 'flex', flexDirection: 'column', padding: '0.5rem' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '2rem' }}>
                                                <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '2rem', color: '#2563eb', marginBottom: '1rem' }}>
                                                    {drawerOpen?.cliente_nombre?.[0] || 'A'}
                                                </div>
                                                <h2 style={{ fontSize: '1.2rem', fontWeight: 900, margin: '0 0 0.25rem 0' }}>{drawerOpen?.cliente_nombre} {drawerOpen?.cliente_apellidos || ''}</h2>
                                                <p style={{ fontSize: '0.95rem', color: '#6b7280', margin: '0 0 1.5rem 0' }}>
                                                    {String(drawerOpen?.cliente_telefono || '').replace('+51', '').trim() || 'Sin teléfono'}
                                                </p>

                                                <div style={{ display: 'flex', gap: '0.75rem', width: '100%', position: 'relative' }}>
                                                    <button
                                                        onClick={() => setDrawerOpen({ ...drawerOpen, cliente_id: null, cliente_nombre: null })}
                                                        style={{ flex: 1, padding: '0.6rem', borderRadius: '24px', border: '1px solid #e5e7eb', backgroundColor: '#fff', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer' }}
                                                    >
                                                        Cambiar
                                                    </button>

                                                    <div style={{ position: 'relative', flex: 1 }}>
                                                        <button
                                                            onClick={() => setShowClientActions(!showClientActions)}
                                                            style={{ width: '100%', padding: '0.6rem', borderRadius: '24px', border: '1px solid #e5e7eb', backgroundColor: '#fff', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}
                                                        >
                                                            Acciones <ChevronDown size={14} />
                                                        </button>

                                                        {showClientActions && (
                                                            <div style={{ position: 'absolute', top: '110%', left: 0, width: '220px', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', zIndex: 100, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                                                                <div style={{ padding: '0.5rem' }}>
                                                                    <button
                                                                        onClick={() => {
                                                                            const c = clientes.find(cli => cli.id === drawerOpen.cliente_id) || { razon_social_nombres: drawerOpen.cliente_nombre, apellidos: drawerOpen.cliente_apellidos, telefono: drawerOpen.cliente_telefono };
                                                                            setClientEditData({
                                                                                razon_social_nombres: c.razon_social_nombres || '',
                                                                                apellidos: c.apellidos || '',
                                                                                telefono: c.telefono || '',
                                                                                email: c.email || ''
                                                                            });
                                                                            setViewState('client_edit');
                                                                            setShowClientActions(false);
                                                                        }}
                                                                        style={{ width: '100%', textAlign: 'left', padding: '0.75rem', borderRadius: '8px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
                                                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                                                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                                                    >
                                                                        Editar datos del cliente
                                                                    </button>
                                                                    <button
                                                                        style={{ width: '100%', textAlign: 'left', padding: '0.75rem', borderRadius: '8px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: '#ef4444' }}
                                                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fef2f2'}
                                                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                                                        onClick={() => {
                                                                            if (window.confirm('¿Eliminar a este cliente de la base de datos?')) {
                                                                                setShowClientActions(false);
                                                                            }
                                                                        }}
                                                                    >
                                                                        Eliminar cliente
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <button
                                                        onClick={() => setViewState('profile')}
                                                        style={{ flex: 1, padding: '0.6rem', borderRadius: '24px', border: '1px solid #e5e7eb', backgroundColor: '#fff', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer' }}
                                                    >
                                                        Ver perfil
                                                    </button>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0 1rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#6b7280', fontSize: '0.9rem' }}>
                                                    <span>🎂</span>
                                                    <span style={{ fontWeight: 600 }}>
                                                        {(() => {
                                                            const client = clientes.find(c => c.id === drawerOpen?.cliente_id);
                                                            return client?.fecha_nacimiento ? format(safeDate(client.fecha_nacimiento), 'd MMM yyyy', { locale: es }) : 'Añadir fecha de nacimiento';
                                                        })()}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#6b7280', fontSize: '0.9rem' }}>
                                                    <span>✨</span>
                                                    <span style={{ fontWeight: 600 }}>
                                                        {(() => {
                                                            const client = clientes.find(c => c.id === drawerOpen?.cliente_id);
                                                            return client?.created_at ? `Creado en ${format(safeDate(client.created_at), 'd MMM yyyy', { locale: es })}` : 'Creado recientemente';
                                                        })()}
                                                    </span>
                                                </div>
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
                                                    onClick={() => {
                                                        setNewClientData({ razon_social_nombres: '', apellidos: '', telefono: '', email: '' });
                                                        setViewState('client_create');
                                                    }}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', borderRadius: '12px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}
                                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                                >
                                                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}><UserPlus size={20} /></div>
                                                    <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>Añadir un nuevo cliente</span>
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

                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#fff' }}>
                                <div style={{ padding: '1.25rem 2rem', borderBottom: '1px solid #f3f4f6', backgroundColor: '#2563eb', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
                                    <div style={{ cursor: 'pointer' }} onClick={() => setViewState('date_picker')}>
                                        <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            {drawerOpen?.fecha_hora_inicio ? format(new Date(drawerOpen.fecha_hora_inicio), 'eee d MMM', { locale: es }) : 'Fecha'} <ChevronDown size={20} />
                                        </h3>
                                        <span style={{ fontSize: '0.9rem', opacity: 0.9, fontWeight: 600 }}>{drawerOpen?.fecha_hora_inicio ? format(new Date(drawerOpen.fecha_hora_inicio), 'h:mm a', { locale: es }) : 'Hora'} • No se repite</span>
                                    </div>
                                    <button
                                        onClick={() => setDrawerOpen(null)}
                                        style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', color: 'white', padding: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                                    >
                                        <X size={24} strokeWidth={3} />
                                    </button>
                                </div>

                                <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', position: 'relative' }}>
                                    {viewState === 'date_picker' ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <h4 style={{ margin: 0, fontWeight: 900 }}>Cambiar fecha y hora</h4>
                                                <button
                                                    onClick={() => setViewState('appointment')}
                                                    style={{ border: 'none', background: '#f3f4f6', padding: '0.5rem', borderRadius: '50%', cursor: 'pointer' }}
                                                ><X size={18} /></button>
                                            </div>

                                            <div>
                                                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>Seleccionar día</label>
                                                <input
                                                    type="date"
                                                    value={drawerOpen?.fecha_hora_inicio ? format(new Date(drawerOpen.fecha_hora_inicio), 'yyyy-MM-dd') : ''}
                                                    onChange={(e) => {
                                                        const newDate = e.target.value;
                                                        const currentStartTime = drawerOpen.startTime || '09:00';
                                                        const newStartISO = `${newDate} ${currentStartTime}:00`;

                                                        let newEndISO = drawerOpen.fecha_hora_fin;
                                                        if (drawerOpen.servicio_duracion) {
                                                            const d = addMinutes(new Date(newStartISO), drawerOpen.servicio_duracion);
                                                            newEndISO = format(d, 'yyyy-MM-dd HH:mm:ss');
                                                        }
                                                        setDrawerOpen({ ...drawerOpen, fecha_hora_inicio: newStartISO, fecha_hora_fin: newEndISO });
                                                    }}
                                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb', outline: 'none', fontWeight: 700 }}
                                                />
                                            </div>

                                            <div>
                                                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>Seleccionar hora</label>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                                                    {Array.from({ length: 48 }).map((_, i) => {
                                                        const h = Math.floor(i / 4) + 8;
                                                        const m = (i % 4) * 15;
                                                        const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                                                        const isSelected = drawerOpen.startTime === timeStr;
                                                        return (
                                                            <button
                                                                key={timeStr}
                                                                onClick={() => {
                                                                    const datePart = drawerOpen?.fecha_hora_inicio ? format(new Date(drawerOpen.fecha_hora_inicio), 'yyyy-MM-dd') : format(selectedDate, 'yyyy-MM-dd');
                                                                    const newStartISO = `${datePart} ${timeStr}:00`;
                                                                    let newEndISO = drawerOpen.fecha_hora_fin;
                                                                    let endTime = drawerOpen.endTime;
                                                                    if (drawerOpen.servicio_duracion) {
                                                                        const d = addMinutes(new Date(newStartISO), drawerOpen.servicio_duracion);
                                                                        newEndISO = format(d, 'yyyy-MM-dd HH:mm:ss');
                                                                        endTime = format(d, 'HH:mm');
                                                                    }
                                                                    setDrawerOpen({ ...drawerOpen, startTime: timeStr, fecha_hora_inicio: newStartISO, fecha_hora_fin: newEndISO, endTime });
                                                                    setViewState('appointment');
                                                                }}
                                                                style={{
                                                                    padding: '0.5rem',
                                                                    borderRadius: '8px',
                                                                    border: isSelected ? '2px solid #2563eb' : '1px solid #e5e7eb',
                                                                    backgroundColor: isSelected ? '#eff6ff' : 'white',
                                                                    color: isSelected ? '#2563eb' : '#000',
                                                                    fontWeight: 700,
                                                                    fontSize: '0.8rem',
                                                                    cursor: 'pointer'
                                                                }}
                                                            >
                                                                {timeStr}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
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
                                                            let newEndDate = drawerOpen?.fecha_hora_fin;
                                                            let endTime = drawerOpen?.endTime;
                                                            if (drawerOpen?.servicio_duracion) {
                                                                const d = addMinutes(safeDate(newStartDate), drawerOpen.servicio_duracion);
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
                                        </>
                                    )}
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

            <FloatingMenus
                quickActionMenu={quickActionMenu}
                setQuickActionMenu={setQuickActionMenu}
                empMenu={empMenu}
                setEmpMenu={setEmpMenu}
                empMenuRef={empMenuRef}
                selectedDate={selectedDate}
                setDrawerOpen={setDrawerOpen}
                setViewState={setViewState}
                handleAddAppointment={handleAddAppointment}
                handleAddBlock={handleAddBlock}
                handleEditShift={handleEditShift}
                DISPLAY_START_HOUR={DISPLAY_START_HOUR}
            />
        </div>
    );
}

const FloatingMenus = ({ quickActionMenu, setQuickActionMenu, empMenu, setEmpMenu, empMenuRef, selectedDate, setDrawerOpen, setViewState, handleAddAppointment, handleAddBlock, handleEditShift, DISPLAY_START_HOUR }) => {
    return (
        <>
            {quickActionMenu && (
                <>
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }} onClick={() => setQuickActionMenu(null)} />
                    <div style={{ position: 'fixed', left: quickActionMenu.x + 10, top: quickActionMenu.y + 10, backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', padding: '8px', zIndex: 999, width: '240px', border: '1px solid #f3f4f6' }}>
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
                                    setDrawerOpen({ id: 'new', empleado_id: quickActionMenu.empId, fecha_hora_inicio: format(newDate, 'yyyy-MM-dd HH:mm:ss'), startTime: format(newDate, 'HH:mm'), endTime: format(addMinutes(newDate, 60), 'HH:mm'), tipo: 'CITA' });
                                    setViewState('appointment'); setQuickActionMenu(null);
                                }
                            },
                            {
                                label: 'Añadir horario no disponible', icon: <Clock size={16} />, action: () => {
                                    const absMins = quickActionMenu.mins + (DISPLAY_START_HOUR * 60);
                                    const newDate = new Date(selectedDate);
                                    newDate.setHours(Math.floor(absMins / 60), absMins % 60, 0, 0);
                                    setDrawerOpen({ id: 'new', empleado_id: quickActionMenu.empId, fecha_hora_inicio: format(newDate, 'yyyy-MM-dd HH:mm:ss'), startTime: format(newDate, 'HH:mm'), endTime: format(addMinutes(newDate, 60), 'HH:mm'), tipo: 'BLOQUEO', subtipo_bloqueo: 'Comida' });
                                    setViewState('appointment'); setQuickActionMenu(null);
                                }
                            }
                        ].map((opt, i) => (
                            <div key={i} onClick={opt.action} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', cursor: 'pointer', borderRadius: '8px' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f9fafb'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
                                <div style={{ color: '#6b7280' }}>{opt.icon}</div>
                                <div style={{ fontSize: '0.85rem', color: '#374151', fontWeight: 500 }}>{opt.label}</div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {empMenu && (
                <>
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }} onClick={() => setEmpMenu(null)} />
                    <div ref={empMenuRef} style={{
                        position: 'fixed',
                        left: empMenu.x,
                        top: empMenu.y + 10,
                        backgroundColor: 'white',
                        borderRadius: '16px',
                        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
                        padding: '12px',
                        zIndex: 999,
                        width: '280px',
                        border: '1px solid #e5e7eb',
                        animation: 'fadeIn 0.15s ease-out'
                    }}>
                        {/* Vistas Section */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '8px' }}>
                            {[
                                { label: 'Vista de día', icon: <ExternalLink size={16} /> },
                                { label: 'Vista de 3 días', icon: <Users size={16} /> },
                                { label: 'Vista semanal', icon: <CalendarIcon size={16} /> },
                                { label: 'Vista mensual', icon: <Settings size={16} /> }
                            ].map((opt, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', cursor: 'pointer', borderRadius: '10px' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f3f4f6'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
                                    <div style={{ color: '#4b5563' }}>{opt.icon}</div>
                                    <div style={{ fontSize: '0.875rem', color: '#111827', fontWeight: 500 }}>{opt.label}</div>
                                </div>
                            ))}
                        </div>

                        <div style={{ height: '1px', backgroundColor: '#f3f4f6', margin: '8px 4px' }} />

                        {/* Acciones Section */}
                        <div style={{ padding: '8px 14px 4px 14px', fontSize: '0.9rem', color: '#111827', fontWeight: 900 }}>Acciones</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {[
                                { label: 'Añadir cita', icon: <Plus size={16} />, action: () => handleAddAppointment(empMenu.empId) },
                                { label: 'Añadir horario no disponible', icon: <Clock size={16} />, action: () => handleAddBlock(empMenu.empId) },
                                { label: 'Editar turno', icon: <Settings size={16} />, action: () => handleEditShift(empMenu.empId) },
                                { label: 'Añadir días libres', icon: <CalendarIcon size={16} />, action: () => { } },
                                { label: 'Ver miembro del equipo', icon: <User size={16} />, action: () => { } }
                            ].map((opt, i) => (
                                <div key={i} onClick={() => { opt.action(); setEmpMenu(null); }} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', cursor: 'pointer', borderRadius: '10px' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f3f4f6'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
                                    <div style={{ color: '#4b5563' }}>{opt.icon}</div>
                                    <div style={{ fontSize: '0.875rem', color: '#111827', fontWeight: 500 }}>{opt.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}

            <style dangerouslySetInnerHTML={{ __html: `.btn-icon:hover { background-color: #f3f4f6; } .btn-secondary:hover { background-color: #f9fafb; } .res-card:hover { filter: brightness(0.97); } .grid-cell:hover .cell-hover-time { display: flex !important; } @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }` }} />
        </>
    );
};




