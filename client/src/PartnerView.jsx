import React, { useState, useEffect, useRef, useMemo } from 'react';
import Sidebar from './Sidebar';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, X, Trash2, Settings, UserPlus, Users, Clock, Search, Check, CheckCircle, Save, MoreVertical, MoreHorizontal, ExternalLink, CreditCard, ShoppingBag, Mail, Phone, Info, Star, ChevronDown, User, UserX, Pencil, ThumbsUp, Cloud, Heart, EyeOff, Tag } from 'lucide-react';
import { format, addDays, startOfDay, addMinutes, isSameDay, parse, setHours, setMinutes } from 'date-fns';
import { es } from 'date-fns/locale';

const API_BASE = import.meta.env.VITE_API_URL || (window.location.origin.includes('localhost') ? 'http://localhost:5001/api' : window.location.origin + '/api');
const DISPLAY_START_HOUR = 6;
const DISPLAY_END_HOUR = 23;

/** Utilidad para parsear fechas de DB de forma segura */
function safeDate(dateStr) {
    if (!dateStr) return new Date();
    if (dateStr instanceof Date) return dateStr;

    // Si la fecha viene de la DB con espacio (YYYY-MM-DD HH:mm:ss)
    // No usamos 'T' para que el navegador la interprete como Hora Local siempre
    let s = String(dateStr);
    if (s.includes('.')) s = s.split('.')[0];
    if (s.endsWith('Z')) s = s.slice(0, -1);

    const d = new Date(s.replace('T', ' ')); // Reemplazamos T por espacio para forzar hora local
    return isNaN(d.getTime()) ? new Date() : d;
}

const getAvatarColor = (id) => {
    const colors = ['#000000', '#c2410c', '#0f766e', '#1e40af', '#7e22ce', '#be123c', '#15803d', '#4338ca'];
    return colors[id % colors.length] || '#000000';
};

const toProperCase = (str) => {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); });
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
    const [viewState, setViewState] = useState('appointment'); // 'appointment', 'client_create', 'client_edit', 'service_selector', 'date_picker'
    const [profileTab, setProfileTab] = useState('resumen');

    const [showConfig, setShowConfig] = useState(false);
    const [showStatusMenu, setShowStatusMenu] = useState(false);
    const [hoverRes, setHoverRes] = useState(null);
    const [resizingRes, setResizingRes] = useState(null); // {id, originalDuration, currentDuration}
    const [isResizingInProgress, setIsResizingInProgress] = useState(false);
    const [toast, setToast] = useState(null);
    const [showClientActions, setShowClientActions] = useState(false);
    const [clientEditData, setClientEditData] = useState({ razon_social_nombres: '', apellidos: '', telefono: '', email: '' });
    const [dbHealth, setDbHealth] = useState(null);

    const [serviceSearchTerm, setServiceSearchTerm] = useState('');
    const [clientSearchTerm, setClientSearchTerm] = useState('');
    const [newClientData, setNewClientData] = useState({ razon_social_nombres: '', apellidos: '', telefono: '', email: '', fecha_nacimiento: '' });
    const [birthDayMonth, setBirthDayMonth] = useState(''); // "MM-DD"
    const [birthYear, setBirthYear] = useState(''); // "YYYY"

    const [visibleStaffIds, setVisibleStaffIds] = useState([]); // IDs of staff to show
    const [showStaffFilter, setShowStaffFilter] = useState(false);
    const [staffFilterMode, setStaffFilterMode] = useState('all'); // 'all', 'with_appointments'
    const [staffSearchTerm, setStaffSearchTerm] = useState('');
    const staffFilterRef = useRef(null);
    const empMenuRef = useRef(null);
    const drawerRef = useRef(null);
    const [quickActionMenu, setQuickActionMenu] = useState(null);

    const [empMenu, setEmpMenu] = useState(null); // {empId, x, y}
    const [now, setNow] = useState(new Date());

    const [shiftFormData, setShiftFormData] = useState({
        empId: null,
        empNombre: '',
        intervals: [{ hora_inicio: '09:00', hora_fin: '18:00' }],
        copyToDays: []
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
            if (e.key === 'Escape') {
                setShowStaffFilter(false);
                setEmpMenu(null);
                setQuickActionMenu(null);
                setShowConfig(false);
                setDrawerOpen(null);
                setViewState('appointment');
                setShowStatusMenu(false);
            }
            if (e.type === 'mousedown') {
                if (showStaffFilter && staffFilterRef.current && !staffFilterRef.current.contains(e.target)) {
                    setShowStaffFilter(false);
                }
                if (empMenu && empMenuRef.current && !empMenuRef.current.contains(e.target)) {
                    setEmpMenu(null);
                }
                if (drawerOpen && drawerRef.current && !drawerRef.current.contains(e.target) && !e.target.closest('.no-close-drawer')) {
                    if (viewState === 'client_create' || viewState === 'client_edit') return;
                    setDrawerOpen(null);
                    setViewState('appointment');
                    setShowStatusMenu(false);
                }
            }
        }
        window.addEventListener('keydown', handleGlobalEvents);
        window.addEventListener('mousedown', handleGlobalEvents);
        return () => {
            window.removeEventListener('keydown', handleGlobalEvents);
            window.removeEventListener('mousedown', handleGlobalEvents);
        };
    }, [showStaffFilter, empMenu, drawerOpen, quickActionMenu, showConfig]);

    useEffect(() => {
        fetch(`${API_BASE}/sucursales`).then(res => res.json()).then(data => {
            setSucursales(data);
            if (data.length > 0) {
                const studio = data.find(s => s.nombre === 'JV Studio') || data[0];
                setSucursal(studio);
            }
        });
        fetch(`${API_BASE}/servicios`).then(res => res.json()).then(setServicios);
        fetch(`${API_BASE}/clientes`).then(res => res.json()).then(setClientes);
        fetch(`${API_BASE}/health`).then(res => res.json()).then(setDbHealth).catch(console.error);
        const timer = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (sucursal) refreshData();
    }, [sucursal, selectedDate]);

    useEffect(() => {
        if (empleados.length > 0 && visibleStaffIds.length === 0) {
            setVisibleStaffIds(empleados.map(e => e.id));
        }
    }, [empleados]);

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
            setEmpleados(await empRes.json());
            const resData = await resRes.json();
            setReservas(resData.reservas || []);
            setHorarios(resData.horarios || []);
            setRecurrentes(resData.recurrentes || []);
            setServicios(await servRes.json());
            setClientes(await cliRes.json());
            setLoading(false);
        } catch (err) {
            console.error(err);
            setLoading(false);
        }
    };

    const handleDragStart = (e, res) => {
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
        const nStart = format(newDate, 'yyyy-MM-dd HH:mm:ss');
        const nEndStr = format(addMinutes(newDate, duration), 'yyyy-MM-dd HH:mm:ss');

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
                body: JSON.stringify({ empleado_id: empleadoId, fecha_hora_inicio: nStart, fecha_hora_fin: nEndStr })
            });
            setTimeout(refreshData, 500);
        } catch (err) {
            console.error(err);
            refreshData();
        }
    };

    const handleResizeStart = (e, res) => {
        e.stopPropagation();
        const startY = e.clientY;
        const start = safeDate(res.fecha_hora_inicio);
        const end = res.fecha_hora_fin ? safeDate(res.fecha_hora_fin) : addMinutes(start, res.duracion_minutos || 40);
        const startDuration = (end - start) / (1000 * 60);

        let moved = false;

        const onMouseMove = (moveEvent) => {
            const deltaY = moveEvent.clientY - startY;
            if (Math.abs(deltaY) > 2) moved = true;
            // Snapping to 5 mins
            const deltaMins = Math.round((deltaY / rowHeight) * cellDuration / 5) * 5;
            const newDuration = Math.max(15, startDuration + deltaMins); // Minimum 15 mins
            setResizingRes({ id: res.id, currentDuration: newDuration });
            setIsResizingInProgress(true);
        };

        const onMouseUp = async (upEvent) => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);

            const deltaY = upEvent.clientY - startY;
            const deltaMins = Math.round((deltaY / rowHeight) * cellDuration / 5) * 5;
            const newDuration = Math.max(15, startDuration + deltaMins);
            const newEndDate = addMinutes(safeDate(res.fecha_hora_inicio), newDuration);
            const nEndStr = format(newEndDate, 'yyyy-MM-dd HH:mm:ss');

            setResizingRes(null);
            setTimeout(() => setIsResizingInProgress(false), 100);

            if (!moved) return;

            try {
                setReservas(prev => prev.map(r => String(r.id) === String(res.id) ? { ...r, fecha_hora_fin: nEndStr, duracion_minutos: newDuration } : r));
                await fetch(`${API_BASE}/reservas/${res.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fecha_hora_fin: nEndStr, duracion_minutos: newDuration })
                });
                refreshData();
            } catch (err) { console.error(err); refreshData(); }
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
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
            estado: 'RESERVADA',
            tipo: 'CITA'
        });
        setViewState('appointment');
    };

    const handleSaveAppointment = async () => {
        if (!drawerOpen) return;
        const isNew = drawerOpen.id === 'new';

        // Si es un BLOQUEO, el proceso es más simple (un solo registro)
        if (drawerOpen.tipo === 'BLOQUEO') {
            try {
                const payload = {
                    empleado_id: drawerOpen.empleado_id,
                    sucursal_id: sucursal.id,
                    fecha_hora_inicio: drawerOpen.fecha_hora_inicio,
                    fecha_hora_fin: drawerOpen.fecha_hora_fin || format(addMinutes(safeDate(drawerOpen.fecha_hora_inicio), 60), 'yyyy-MM-dd HH:mm:ss'),
                    tipo: 'BLOQUEO',
                    subtipo_bloqueo: drawerOpen.subtipo_bloqueo || 'Comida',
                    estado: 'RESERVADA',
                    origen: isNew ? 'PARTNER' : drawerOpen.origen,
                    reserva_online_permitida: !!drawerOpen.reserva_online_permitida
                };

                const method = isNew ? 'POST' : 'PATCH';
                const url = isNew ? `${API_BASE}/reservas` : `${API_BASE}/reservas/${drawerOpen.id}`;

                await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                setDrawerOpen(null);
                refreshData();
                setToast("Horario bloqueado guardado");
                setTimeout(() => setToast(null), 3000);
                return;
            } catch (err) {
                console.error(err);
                return;
            }
        }

        // Lógica original para CITAS
        let start = new Date(safeDate(drawerOpen.fecha_hora_inicio));
        const servicios = drawerOpen.servicios_agregados?.length > 0
            ? drawerOpen.servicios_agregados
            : (drawerOpen.servicio_id ? [{ id: drawerOpen.servicio_id, nombre: drawerOpen.servicio_nombre, precio: drawerOpen.servicio_precio || drawerOpen.precio, duracion_minutos: drawerOpen.servicio_duracion || drawerOpen.duracion_minutos }] : []);

        try {
            for (let i = 0; i < servicios.length; i++) {
                const s = servicios[i];
                const dur = parseInt(s.duracion_minutos || 40);
                const pDateStart = format(start, 'yyyy-MM-dd HH:mm:ss');
                const pDateEnd = format(addMinutes(start, dur), 'yyyy-MM-dd HH:mm:ss');

                const payload = {
                    cliente_id: drawerOpen.cliente_id,
                    empleado_id: drawerOpen.empleado_id,
                    servicio_id: s.id,
                    sucursal_id: sucursal.id,
                    fecha_hora_inicio: pDateStart,
                    fecha_hora_fin: pDateEnd,
                    notas_cliente: drawerOpen.notas_cliente || '',
                    notas_internas: drawerOpen.notas_internas || '',
                    precio_cobrado: s.precio || 0,
                    estado: drawerOpen.estado || 'RESERVADA',
                    origen: isNew ? 'PARTNER' : drawerOpen.origen,
                    tipo: 'CITA',
                    reserva_online_permitida: false
                };

                const method = (!isNew && i === 0) ? 'PATCH' : 'POST';
                const url = (!isNew && i === 0) ? `${API_BASE}/reservas/${drawerOpen.id}` : `${API_BASE}/reservas`;

                await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                start = addMinutes(start, dur);
            }

            setDrawerOpen(null);
            refreshData();
            setToast("Cita guardada correctamente");
            setTimeout(() => setToast(null), 3000);
        } catch (err) { console.error(err); }
    };

    const handleDeleteReservation = async () => {
        if (!drawerOpen || drawerOpen.id === 'new') return;
        if (!window.confirm("¿Estás seguro de que deseas eliminar este registro?")) return;

        try {
            const res = await fetch(`${API_BASE}/reservas/${drawerOpen.id}`, { method: 'DELETE' });
            if (res.ok) {
                setDrawerOpen(null);
                refreshData();
                setToast("Registro eliminado correctamente");
                setTimeout(() => setToast(null), 3000);
            }
        } catch (err) {
            console.error(err);
            setToast("Error al eliminar");
        }
    };

    const handleSelectClient = (client) => {
        setDrawerOpen({
            ...drawerOpen,
            cliente_id: client.id,
            cliente_nombre: client.razon_social_nombres,
            cliente_apellidos: client.apellidos,
            cliente_telefono: client.telefono
        });
        setClientSearchTerm('');
        setViewState('appointment');
    };

    const handleOpenCreateClient = () => {
        const term = clientSearchTerm.trim();
        let nombres = '';
        let apellidos = '';
        let telefono = '';

        if (/^\d+$/.test(term)) {
            telefono = term;
        } else if (term) {
            const parts = term.split(/\s+/);
            nombres = parts[0] || '';
            apellidos = parts.slice(1).join(' ') || '';
        }

        setNewClientData({
            razon_social_nombres: nombres,
            apellidos: apellidos,
            telefono: telefono,
            email: '',
            fecha_nacimiento: ''
        });
        setViewState('client_create');
    };

    const handleAddAppointment = (empId) => {
        const d = new Date();
        d.setMinutes(Math.round(d.getMinutes() / 15) * 15);
        const startDate = new Date(selectedDate);
        startDate.setHours(d.getHours(), d.getMinutes(), 0, 0);

        setDrawerOpen({
            id: 'new',
            empleado_id: empId,
            fecha_hora_inicio: format(startDate, 'yyyy-MM-dd HH:mm:ss'),
            startTime: format(startDate, 'HH:mm'),
            estado: 'RESERVADA',
            tipo: 'CITA'
        });
        setViewState('appointment');
        setEmpMenu(null);
    };

    const handleAddBlock = (empId) => {
        const d = new Date();
        const startDate = new Date(selectedDate);
        startDate.setHours(d.getHours(), 0, 0, 0);
        const endDate = addMinutes(startDate, 60);

        setDrawerOpen({
            id: 'new',
            empleado_id: empId,
            fecha_hora_inicio: format(startDate, 'yyyy-MM-dd HH:mm:ss'),
            fecha_hora_fin: format(endDate, 'yyyy-MM-dd HH:mm:ss'),
            startTime: format(startDate, 'HH:mm'),
            endTime: format(endDate, 'HH:mm'),
            tipo: 'BLOQUEO',
            subtipo_bloqueo: 'Comida'
        });
        setViewState('appointment');
        setEmpMenu(null);
    };

    function isTimeAvailable(empId, mins) {
        try {
            const empIdStr = String(empId);
            const empHorarios = (horarios || []).filter(h => String(h.empleado_id) === empIdStr);
            const empRec = (recurrentes || []).filter(h => String(h.empleado_id) === empIdStr);

            const check = (h) => {
                if (!h.hora_inicio || !h.hora_fin) return false;
                const [hS, mS] = h.hora_inicio.split(':').map(Number);
                const [hE, mE] = h.hora_fin.split(':').map(Number);
                const sMins = hS * 60 + (mS || 0);
                const eMins = hE * 60 + (mE || 0);
                return mins >= sMins && mins < eMins;
            };

            // 1. Prioridad: Horarios específicos hoy
            if (empHorarios.length > 0) return empHorarios.some(check);

            // 2. Prioridad: Horarios recurrentes
            if (empRec.length > 0) {
                const jsDay = selectedDate.getDay();
                const todayRecs = empRec.filter(h => {
                    const dbDay = parseInt(h.dia_semana);
                    return dbDay === jsDay || (dbDay === 7 && jsDay === 0);
                });
                // Si tiene horarios recurrentes pero NINGUNO es hoy: DESCANSA (GRIS)
                if (todayRecs.length === 0) return false;
                return todayRecs.some(check);
            }

            // 3. Fallback: Si no hay absolutamente NADA configurado, mostramos como NO disponible (GRIS)
            return false;
        } catch (e) {
            return false;
        }
    }

    function formatTimeTooltip(mins) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        const period = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
    }

    function getDurationHeight(mins) { return (mins / cellDuration) * rowHeight; }
    function getTimeTop(dateStr) {
        if (!dateStr) return 0;
        const d = safeDate(dateStr);
        const minsTotal = d.getHours() * 60 + d.getMinutes();
        return ((minsTotal - DISPLAY_START_HOUR * 60) / cellDuration) * rowHeight;
    }
    function formatAMPM(dateStr) {
        try { return format(safeDate(dateStr), 'h:mm a'); } catch (e) { return ''; }
    }

    function processOverlaps(resArray) {
        if (!resArray || resArray.length === 0) return {};
        const sorted = [...resArray].sort((a, b) => safeDate(a.fecha_hora_inicio) - safeDate(b.fecha_hora_inicio));
        const clusters = [];
        sorted.forEach(res => {
            const start = safeDate(res.fecha_hora_inicio).getTime();
            const end = res.fecha_hora_fin ? safeDate(res.fecha_hora_fin).getTime() : start + (res.duracion_minutos || 40) * 60000;
            let foundCluster = clusters.find(cluster => cluster.some(c => {
                const cStart = safeDate(c.fecha_hora_inicio).getTime();
                const cEnd = c.fecha_hora_fin ? safeDate(c.fecha_hora_fin).getTime() : cStart + (c.duracion_minutos || 40) * 60000;
                return (start < cEnd && end > cStart);
            }));
            if (foundCluster) foundCluster.push(res); else clusters.push([res]);
        });
        const results = {};
        clusters.forEach(cluster => {
            const columns = [];
            cluster.forEach(res => {
                const start = safeDate(res.fecha_hora_inicio).getTime();
                let colIndex = columns.findIndex(colLastEnd => start >= colLastEnd);
                if (colIndex === -1) { columns.push(0); colIndex = columns.length - 1; }
                columns[colIndex] = res.fecha_hora_fin ? safeDate(res.fecha_hora_fin).getTime() : start + (res.duracion_minutos || 40) * 60000;
                results[res.id] = { colIndex, totalCols: 1 };
            });
            cluster.forEach(res => { if (results[res.id]) results[res.id].totalCols = columns.length; });
        });
        return results;
    }

    const timelineTop = ((now.getHours() * 60 + now.getMinutes() - DISPLAY_START_HOUR * 60) / cellDuration) * rowHeight;
    const visibleEmployees = useMemo(() => {
        if (!empleados || empleados.length === 0) return [];
        if (staffFilterMode === 'with_appointments') {
            return empleados.filter(emp => reservas.some(r => String(r.empleado_id) === String(emp.id)));
        }
        // Si no hay ids visibles seleccionados, mostramos todos por defecto para evitar pantalla vacía
        if (!visibleStaffIds || visibleStaffIds.length === 0) return empleados;

        return empleados.filter(emp => visibleStaffIds.some(vId => String(vId) === String(emp.id)));
    }, [empleados, reservas, staffFilterMode, visibleStaffIds]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#f9fafb', fontFamily: "'Inter', sans-serif", overflow: 'hidden' }}>
            <style>
                {`
                .time-cell-hover { position: relative; transition: background-color 0.1s; }
                .time-cell-hover:hover {
                    background-color: #f3e8ff !important;
                    background-image: none !important;
                }
                .time-cell-hover:hover::after {
                    content: attr(data-time);
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    font-size: 0.75rem;
                    font-weight: 800;
                    color: #7e22ce;
                    pointer-events: none;
                }
                `}
            </style>
            {/* Header */}
            <header style={{ backgroundColor: 'white', borderBottom: '1px solid #e5e7eb', padding: '0.75rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 110 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <img src="/logo_jv.jpg" alt="Logo" style={{ width: '32px', height: '32px', borderRadius: '6px' }} />
                        <span style={{ fontWeight: 900, fontSize: '1.1rem', color: '#111827', whiteSpace: 'nowrap' }}>Reservas JV</span>
                    </div>
                    <select
                        value={sucursal?.id || ''}
                        onChange={(e) => setSucursal(sucursales.find(s => s.id === parseInt(e.target.value)))}
                        style={{ border: 'none', background: '#f3f4f6', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: 700, fontSize: '0.9rem', outline: 'none' }}
                    >
                        {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    </select>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', backgroundColor: '#f3f4f6', padding: '0.25rem', borderRadius: '10px' }}>
                        <button onClick={() => {
                            const prev = new Date(selectedDate);
                            prev.setDate(prev.getDate() - 1);
                            setSelectedDate(prev);
                        }} className="btn-icon"><ChevronLeft size={18} /></button>
                        <span style={{ fontWeight: 800, fontSize: '0.9rem', padding: '0 0.75rem', minWidth: '130px', textAlign: 'center', textTransform: 'capitalize' }}>
                            {format(selectedDate, "eeee, d 'de' MMMM", { locale: es })}
                        </span>
                        <button onClick={() => {
                            const next = new Date(selectedDate);
                            next.setDate(next.getDate() + 1);
                            setSelectedDate(next);
                        }} className="btn-icon"><ChevronRight size={18} /></button>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                        <button onClick={() => setShowStaffFilter(!showStaffFilter)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '20px', border: '1px solid #e5e7eb', backgroundColor: '#fff', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer', outline: 'none' }}>
                            <Users size={16} />
                            <span>{staffFilterMode === 'with_appointments' ? 'Miembros con citas' : visibleStaffIds.length >= empleados.length ? 'Todo el equipo' : `${visibleStaffIds.length} miembros`}</span>
                            <ChevronDown size={14} style={{ transform: showStaffFilter ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                        </button>
                        {showStaffFilter && (
                            <div ref={staffFilterRef} style={{ position: 'absolute', top: '110%', right: 0, width: '320px', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb', zIndex: 1000, padding: '1rem' }}>
                                <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
                                    <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                                    <input placeholder="Buscar miembro..." value={staffSearchTerm} onChange={e => setStaffSearchTerm(e.target.value)} style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 2rem', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '0.8rem', outline: 'none' }} />
                                </div>
                                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                    <div onClick={() => setStaffFilterMode(staffFilterMode === 'all' ? 'with_appointments' : 'all')} style={{ padding: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', borderRadius: '8px', backgroundColor: '#f9fafb', marginBottom: '0.5rem' }}>
                                        <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: '2px solid #2563eb', backgroundColor: staffFilterMode === 'with_appointments' ? '#2563eb' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {staffFilterMode === 'with_appointments' && <Check size={12} color="white" />}
                                        </div>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Solo miembros con citas</span>
                                    </div>
                                    <div style={{ padding: '0.4rem', borderBottom: '1px solid #f3f4f6', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 600 }}>MIEMBROS DEL EQUIPO</span>
                                        <div onClick={() => setVisibleStaffIds(visibleStaffIds.length === empleados.length ? [] : empleados.map(e => e.id))} style={{ fontSize: '0.7rem', color: '#2563eb', fontWeight: 700, cursor: 'pointer' }}>
                                            {visibleStaffIds.length === empleados.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
                                        </div>
                                    </div>
                                    {empleados.filter(e => (e.nombre_display || e.nombres).toLowerCase().includes(staffSearchTerm.toLowerCase())).map(emp => (
                                        <div key={emp.id} onClick={() => setVisibleStaffIds(prev => prev.includes(emp.id) ? prev.filter(id => id !== emp.id) : [...prev, emp.id])} style={{ padding: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', borderRadius: '8px', transition: 'background-color 0.2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f3f4f6'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                            <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: '2px solid #2563eb', backgroundColor: visibleStaffIds.includes(emp.id) ? '#2563eb' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {visibleStaffIds.includes(emp.id) && <Check size={12} color="white" />}
                                            </div>
                                            <div translate="no" style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: getAvatarColor(emp.id), color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 900 }}>{(emp.nombre_display || emp.nombres || 'U').trim()[0].toUpperCase()}</div>
                                            <span translate="no" style={{ fontSize: '0.85rem', fontWeight: 700 }}>{emp.nombre_display || `${emp.nombres} ${emp.apellidos}`}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <button onClick={() => setShowConfig(!showConfig)} className="btn-secondary"><Settings size={18} /></button>
                </div>
            </header>

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                <Sidebar />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
                    {/* Calendar Grid */}
                    <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ paddingLeft: '55px', display: 'flex', borderBottom: '1px solid #e5e7eb', backgroundColor: 'white', zIndex: 10 }}>
                            {visibleEmployees.map(emp => (
                                <div onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); setEmpMenu({ empId: emp.id, x: rect.left, y: rect.bottom }); }} style={{ flex: 1, minWidth: '150px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', padding: '0.75rem 0' }}>
                                    <div translate="no" style={{ width: '42px', height: '42px', borderRadius: '50%', backgroundColor: getAvatarColor(emp.id), color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 900 }}>{(emp.nombre_display || emp.nombres || 'U').trim()[0].toUpperCase()}</div>
                                    <span translate="no" style={{ fontWeight: 900, fontSize: '0.75rem', color: '#111827' }}>{emp.nombre_display || emp.nombres}</span>
                                </div>
                        ))}
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', position: 'relative', display: 'flex' }}>
                        <div style={{ width: '55px', flexShrink: 0, borderRight: '1px solid #e5e7eb', backgroundColor: '#fff', zIndex: 5 }}>
                            {Array.from({ length: (DISPLAY_END_HOUR - DISPLAY_START_HOUR) * 2 }).map((_, i) => {
                                const hour = DISPLAY_START_HOUR + Math.floor(i / 2);
                                const mins = i % 2 === 0 ? '00' : '30';
                                const h12 = hour % 12 || 12;
                                const ampm = hour >= 12 ? 'pm' : 'am';
                                return (
                                    <div key={i} style={{ height: (30 / cellDuration) * rowHeight, position: 'relative' }}>
                                        <div translate="no" style={{ position: 'absolute', top: '-14px', right: '6px', display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: '1.1' }}>
                                            <span style={{ fontWeight: 900, fontSize: '0.85rem', color: '#111827' }}>{h12}:{mins}</span>
                                            <span style={{ fontWeight: 500, fontSize: '0.75rem', color: '#4b5563' }}>{ampm}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
                            {Array.from({ length: (DISPLAY_END_HOUR - DISPLAY_START_HOUR) * (60 / cellDuration) }).map((_, i) => (
                                <div key={i} style={{ position: 'absolute', top: i * rowHeight, left: 0, right: 0, height: '1px', backgroundColor: i % (60 / cellDuration) === 0 ? '#f3f4f6' : '#f9fafb', zIndex: 1 }} />
                            ))}

                            {isSameDay(now, selectedDate) && (
                                <div style={{ position: 'absolute', top: timelineTop, left: 0, right: 0, height: '2px', backgroundColor: '#ef4444', zIndex: 20, pointerEvents: 'none' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444', position: 'absolute', left: '-5px', top: '-4px' }} />
                                </div>
                            )}

                            {visibleEmployees.map((emp, empIndex) => {
                                const empReservas = reservas.filter(r => String(r.empleado_id) === String(emp.id));
                                const overlapInfo = processOverlaps(empReservas);
                                const isRightSide = visibleEmployees.length > 1 && empIndex >= visibleEmployees.length / 2;

                                return (
                                    <div key={emp.id} onDragOver={e => e.preventDefault()} onDrop={e => {
                                        const bcr = e.currentTarget.getBoundingClientRect();
                                        const y = e.clientY - bcr.top;
                                        const mins = Math.round((y / rowHeight) * cellDuration / 15) * 15 + (DISPLAY_START_HOUR * 60);
                                        handleDrop(e, emp.id, mins);
                                    }} style={{ flex: 1, minWidth: '150px', borderRight: '1px solid #f3f4f6', position: 'relative' }}>
                                        {Array.from({ length: (DISPLAY_END_HOUR - DISPLAY_START_HOUR) * (60 / cellDuration) }).map((_, i) => {
                                            const mins = (DISPLAY_START_HOUR * 60) + (i * cellDuration);
                                            const available = isTimeAvailable(emp.id, mins);
                                            return (
                                                <div
                                                    key={i}
                                                    className="time-cell-hover"
                                                    data-time={formatTimeTooltip(mins).replace(' ', '').toLowerCase()}
                                                    title=""
                                                    onClick={(e) => handleCellClick(e, emp.id, mins, '')}
                                                    style={{
                                                        height: rowHeight,
                                                        cursor: 'pointer',
                                                        backgroundColor: available ? '#ffffff' : '#fafafa',
                                                        backgroundImage: available ? 'none' : 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(229, 231, 235, 0.6) 3px, rgba(229, 231, 235, 0.6) 4px)',
                                                        borderBottom: i % (60 / cellDuration) === (60 / cellDuration) - 1 ? '1px solid #f3f4f6' : '1px solid #f9fafb',
                                                    }}
                                                />
                                            );
                                        })}

                                        {empReservas.map(res => {
                                            const top = getTimeTop(res.fecha_hora_inicio);
                                            const duration = (safeDate(res.fecha_hora_fin) - safeDate(res.fecha_hora_inicio)) / 60000;
                                            const isResizing = resizingRes?.id === res.id;
                                            const h = getDurationHeight(isResizing ? resizingRes.currentDuration : duration);
                                            const { colIndex, totalCols } = overlapInfo[res.id] || { colIndex: 0, totalCols: 1 };

                                            const theme = res.tipo === 'BLOQUEO' ? { 
                                                bg: '#9ca3af', 
                                                pattern: 'repeating-linear-gradient(45deg, #9ca3af, #9ca3af 2px, #4b5563 2px, #4b5563 4px)',
                                                text: '#ffffff', 
                                                border: '#374151' 
                                            } : {
                                                'RESERVADA': { bg: '#eff6ff', border: '#2563eb', text: '#1e40af' },
                                                'CONFIRMADA': { bg: '#eff6ff', border: '#2563eb', text: '#1e40af' },
                                                'COMPLETADA': { bg: '#e2e8f0', border: '#cbd5e1', text: '#334155' },
                                                'INASISTENCIA': { bg: '#FF5E76', border: '#e11d48', text: '#111827' },
                                                'CANCELADA': { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' }
                                            }[res.estado] || { bg: '#eff6ff', border: '#2563eb', text: '#1e40af' };

                                            const isBlockedState = res.estado === 'INASISTENCIA' || res.estado === 'CANCELADA';

                                            return (
                                                <div key={res.id} draggable={!isBlockedState} onDragStart={e => { if (!isBlockedState) handleDragStart(e, res); }} onClick={() => {
                                                    if (!isResizingInProgress) {
                                                        const start = safeDate(res.fecha_hora_inicio);
                                                        const end = res.fecha_hora_fin ? safeDate(res.fecha_hora_fin) : addMinutes(start, res.duracion_minutos || 40);
                                                        setDrawerOpen({
                                                            ...res,
                                                            startTime: format(start, 'HH:mm'),
                                                            endTime: format(end, 'HH:mm')
                                                        });
                                                    }
                                                }} onMouseEnter={() => !isResizingInProgress && !drawerOpen && setHoverRes(res.id)} onMouseLeave={() => setHoverRes(null)} style={{ position: 'absolute', top, left: `${(colIndex / totalCols) * 100}%`, width: `${(1 / totalCols) * 100}%`, height: h, zIndex: isResizing || hoverRes === res.id ? 60 : 15, cursor: isBlockedState ? 'pointer' : 'grab', opacity: isBlockedState ? 0.95 : 1, overflow: 'visible' }}>
                                                    <div style={{ backgroundColor: theme.bg, backgroundImage: theme.pattern || 'none', borderLeft: `4px solid ${theme.border}`, borderRadius: res.tipo === 'BLOQUEO' ? '0' : '6px', padding: res.tipo === 'BLOQUEO' ? '0 8px' : '4px 8px', height: '100%', overflow: 'hidden', boxShadow: hoverRes === res.id ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                            <span translate="no" style={{ fontSize: '0.75rem', color: theme.text, lineHeight: '1.2' }}>
                                                                {res.cliente_nombre && <span style={{ marginRight: '4px' }}>{format(safeDate(res.fecha_hora_inicio), 'h:mm')} - {format(res.fecha_hora_fin ? safeDate(res.fecha_hora_fin) : addMinutes(safeDate(res.fecha_hora_inicio), res.duracion_minutos || 40), 'h:mm')}</span>}
                                                                <strong style={{ fontWeight: 800 }}>{res.cliente_nombre ? `${res.cliente_nombre} ${res.cliente_apellidos || ''}` : (res.tipo === 'CITA' ? 'Sin cita' : (res.subtipo_bloqueo || 'Bloqueo'))}</strong>
                                                            </span>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0, marginLeft: '4px' }}>
                                                                {res.estado === 'COMPLETADA' && <Tag size={12} color={theme.text} fill={theme.text} />}
                                                                {res.estado === 'INASISTENCIA' && <EyeOff size={12} color={theme.text} />}
                                                                {res.estado === 'CONFIRMADA' && <ThumbsUp size={12} color={theme.text} />}
                                                                {['WEB', 'ONLINE', 'APP', 'CLIENTE'].includes((res.origen || '').toUpperCase()) && <Cloud size={12} color={theme.text} />}
                                                                {res.preferencia_empleado && <Heart size={12} color={theme.text} fill={theme.text} />}
                                                            </div>
                                                        </div>
                                                        <div style={{ fontSize: '0.7rem', color: theme.text, marginTop: '2px' }}>{res.servicio_nombre}</div>
                                                    </div>
                                                    {!isBlockedState && <div onMouseDown={e => handleResizeStart(e, res)} className="resize-handle" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '8px', cursor: 'ns-resize', zIndex: 10 }} />}

                                                    {hoverRes === res.id && res.tipo !== 'BLOQUEO' && (
                                                        <div style={{ position: 'absolute', ...(top > 600 ? { bottom: 0 } : { top: 0 }), ...(isRightSide ? { right: '102%' } : { left: '102%' }), width: '300px', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', zIndex: 100, border: '1px solid #e5e7eb', overflow: 'hidden', cursor: 'default' }} onClick={e => e.stopPropagation()}>
                                                            <div style={{ backgroundColor: res.estado === 'INASISTENCIA' ? '#ce163b' : (res.estado === 'COMPLETADA' ? '#e2e8f0' : '#2563eb'), color: res.estado === 'COMPLETADA' ? '#111827' : 'white', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{format(safeDate(res.fecha_hora_inicio), 'h:mma')} - {format(res.fecha_hora_fin ? safeDate(res.fecha_hora_fin) : addMinutes(safeDate(res.fecha_hora_inicio), res.duracion_minutos || 40), 'h:mma')}</span>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                    <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>{res.estado.charAt(0) + res.estado.slice(1).toLowerCase()}</span>
                                                                    {res.estado === 'INASISTENCIA' && <EyeOff size={16} color="white" />}
                                                                    {res.estado === 'COMPLETADA' && <Tag size={16} color="#111827" fill="#111827" />}
                                                                </div>
                                                            </div>
                                                            <div style={{ padding: '16px' }}>
                                                                <div style={{ display: 'flex', gap: '12px' }}>
                                                                    <div style={{ width: '45px', height: '45px', borderRadius: '50%', backgroundColor: res.estado === 'COMPLETADA' ? '#f8fafc' : '#eef2ff', color: res.estado === 'COMPLETADA' ? '#64748b' : '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 'bold' }}>
                                                                        {res.cliente_nombre ? res.cliente_nombre.charAt(0).toUpperCase() : 'C'}
                                                                    </div>
                                                                    <div style={{ flex: 1 }}>
                                                                        <div style={{ fontSize: '1.05rem', color: '#111827', fontWeight: 500 }}>{res.cliente_nombre} {res.cliente_apellidos || ''}</div>
                                                                        <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '2px' }}>{res.cliente_telefono || '+ Sin número'}</div>

                                                                        {(Number(clientes.find(c => c.id === res.cliente_id)?.total_inasistencias) || 0) > 0 && (
                                                                            <div style={{ display: 'inline-block', marginTop: '8px', padding: '4px 10px', borderRadius: '12px', backgroundColor: '#fee2e2', color: '#ef4444', fontSize: '0.75rem', fontWeight: 600 }}>
                                                                                {clientes.find(c => c.id === res.cliente_id)?.total_inasistencias} inasistencia{(Number(clientes.find(c => c.id === res.cliente_id)?.total_inasistencias) > 1) ? 's' : ''}
                                                                            </div>
                                                                        )}
                                                                        <div style={{ display: 'inline-block', marginTop: '8px', marginLeft: (Number(clientes.find(c => c.id === res.cliente_id)?.total_inasistencias) || 0) > 0 ? '6px' : '0px', padding: '4px 10px', borderRadius: '12px', border: '1px solid #e5e7eb', color: '#374151', fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer' }}>+ Añadir etiqueta</div>
                                                                    </div>
                                                                </div>
                                                                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                                    <div>
                                                                        <div style={{ fontSize: '0.9rem', color: '#111827', fontWeight: 500 }}>{res.servicio_nombre || 'Servicio'}</div>
                                                                        <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                            {res.preferencia_empleado ? <Heart size={12} color="#ef4444" fill="#ef4444" /> : <Clock size={12} />}
                                                                            {res.duracion_minutos || 40} min • {emp.nombre}
                                                                        </div>
                                                                    </div>
                                                                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827' }}>
                                                                        {res.precio_cobrado || res.precio ? `${res.precio_cobrado || res.precio} PEN` : ''}
                                                                    </div>
                                                                </div>
                                                                {res.estado === 'COMPLETADA' && (
                                                                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                        <div>
                                                                            <div style={{ fontSize: '0.9rem', color: '#111827', fontWeight: 500 }}>Venta</div>
                                                                            <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '2px' }}>{res.precio_cobrado || res.precio || 0} PEN Pagado {res.notas_internas && res.notas_internas.toLowerCase().includes('yape') ? ' - Yape' : (res.notas_internas && res.notas_internas.toLowerCase().includes('plin') ? ' - Plin' : ' - Efectivo')}</div>
                                                                        </div>
                                                                        <Tag size={20} color="#9ca3af" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                </div>
                    </div>

                {/* Drawer */}
                {drawerOpen && (
                    <div onClick={() => setDrawerOpen(null)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.2)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
                        <div ref={drawerRef} onClick={e => e.stopPropagation()} style={{ width: drawerOpen.tipo === 'BLOQUEO' ? '500px' : '850px', backgroundColor: 'white', height: '100%', display: 'flex', flexDirection: 'column', boxShadow: '-10px 0 25px rgba(0,0,0,0.1)' }}>
                            
                            {/* HEADER DEDICADO */}
                            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <button onClick={() => setDrawerOpen(null)} style={{ border: 'none', background: '#f3f4f6', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                        <X size={18} />
                                    </button>
                                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900 }}>
                                        {drawerOpen.tipo === 'BLOQUEO' 
                                            ? (drawerOpen.id === 'new' ? 'Añadir horario no disponible' : 'Editar horario no disponible') 
                                            : (drawerOpen.id === 'new' ? 'Nueva cita' : 'Editar cita')}
                                    </h2>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    {drawerOpen.id !== 'new' && (
                                        <button 
                                            onClick={handleDeleteReservation}
                                            style={{ border: 'none', background: '#fee2e2', color: '#ef4444', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                            title="Eliminar"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    )}
                                    <button style={{ border: 'none', background: 'none', padding: '8px', cursor: 'pointer' }}><MoreHorizontal size={20} /></button>
                                </div>
                            </div>

                            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                                {/* Left: Client Data (Solo para Citas) */}
                                {drawerOpen.tipo !== 'BLOQUEO' && (
                                    <div style={{ width: '400px', borderRight: '1px solid #e5e7eb', padding: '1.5rem', overflowY: 'auto' }}>
                                        {viewState === 'client_edit' || viewState === 'client_create' ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                <button onClick={() => setViewState('appointment')} style={{ border: 'none', background: 'none', color: '#2563eb', fontWeight: 800, textAlign: 'left', padding: 0 }}>← Volver</button>
                                                <h4 style={{ margin: 0, fontWeight: 900 }}>{viewState === 'client_edit' ? 'Editar cliente' : 'Nuevo cliente'}</h4>
                                                <input placeholder="Nombre" value={viewState === 'client_edit' ? clientEditData.razon_social_nombres : newClientData.razon_social_nombres} onChange={e => viewState === 'client_edit' ? setClientEditData({ ...clientEditData, razon_social_nombres: e.target.value }) : setNewClientData({ ...newClientData, razon_social_nombres: e.target.value })} style={{ padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb' }} />
                                                <input placeholder="Apellidos" value={viewState === 'client_edit' ? clientEditData.apellidos : newClientData.apellidos} onChange={e => viewState === 'client_edit' ? setClientEditData({ ...clientEditData, apellidos: e.target.value }) : setNewClientData({ ...newClientData, apellidos: e.target.value })} style={{ padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb' }} />
                                                <input placeholder="Teléfono" value={viewState === 'client_edit' ? clientEditData.telefono : newClientData.telefono} onChange={e => viewState === 'client_edit' ? setClientEditData({ ...clientEditData, telefono: e.target.value }) : setNewClientData({ ...newClientData, telefono: e.target.value })} style={{ padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb' }} />
                                                <input placeholder="Email" value={viewState === 'client_edit' ? clientEditData.email : newClientData.email} onChange={e => viewState === 'client_edit' ? setClientEditData({ ...clientEditData, email: e.target.value }) : setNewClientData({ ...newClientData, email: e.target.value })} style={{ padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb' }} />
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                    <span style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600, paddingLeft: '0.25rem' }}>Fecha de Nacimiento</span>
                                                    <input type="date" value={viewState === 'client_edit' ? (clientEditData.fecha_nacimiento || '') : (newClientData.fecha_nacimiento || '')} onChange={e => viewState === 'client_edit' ? setClientEditData({ ...clientEditData, fecha_nacimiento: e.target.value }) : setNewClientData({ ...newClientData, fecha_nacimiento: e.target.value })} style={{ padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb', color: '#111827' }} />
                                                </div>
                                                <button onClick={async () => {
                                                    const isNew = viewState === 'client_create';
                                                    const rawData = viewState === 'client_edit' ? clientEditData : newClientData;
                                                    const data = {
                                                        ...rawData,
                                                        razon_social_nombres: toProperCase(rawData.razon_social_nombres),
                                                        apellidos: toProperCase(rawData.apellidos)
                                                    };
                                                    const res = await fetch(`${API_BASE}/clientes${viewState === 'client_edit' ? `/${drawerOpen.cliente_id}` : ''}`, { method: viewState === 'client_edit' ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
                                                    if (res.ok) { 
                                                        const result = await res.json();
                                                        refreshData(); 
                                                        if (isNew) {
                                                            setNewClientData({ razon_social_nombres: '', apellidos: '', telefono: '', email: '', fecha_nacimiento: '' });
                                                            handleSelectClient(result.cliente);
                                                        } else {
                                                            handleSelectClient(result);
                                                        }
                                                    }
                                                }} style={{ padding: '1rem', backgroundColor: '#000', color: 'white', borderRadius: '30px', fontWeight: 800 }}>Guardar</button>
                                            </div>
                                        ) : (drawerOpen.cliente_id || drawerOpen.cliente_nombre === 'Sin cita') ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                {(() => {
                                                    const isSinCita = !drawerOpen.cliente_id && drawerOpen.cliente_nombre === 'Sin cita';
                                                    const c = isSinCita ? { razon_social_nombres: 'Sin cita', apellidos: '', telefono: 'No registrado', email: 'No registrado' } : (clientes.find(cli => cli.id === drawerOpen.cliente_id) || {});
                                                    return (
                                                        <>
                                                            <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 900, color: isSinCita ? '#6b7280' : '#2563eb' }}>{c.razon_social_nombres?.[0] || 'C'}</div>
                                                            <h2 translate="no" style={{ fontWeight: 900, margin: '1rem 0 0.25rem 0' }}>{c.razon_social_nombres} {c.apellidos}</h2>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#6b7280', marginBottom: '1.5rem' }}><Phone size={14} /> {c.telefono} {!isSinCita && <Pencil size={12} style={{ cursor: 'pointer' }} onClick={() => { setClientEditData(c); setViewState('client_edit'); }} />}</div>
                                                            <div style={{ display: 'flex', gap: '0.5rem', width: '100%', marginBottom: '2rem' }}>
                                                                <button onClick={() => setDrawerOpen({ ...drawerOpen, cliente_id: null, cliente_nombre: null })} style={{ flex: 1, padding: '0.6rem', borderRadius: '24px', border: '1px solid #e5e7eb', fontWeight: 700 }}>Cambiar</button>
                                                                {!isSinCita && <button onClick={() => setViewState('profile')} style={{ flex: 1, padding: '0.6rem', borderRadius: '24px', border: '1px solid #e5e7eb', fontWeight: 700 }}>Perfil</button>}
                                                            </div>
                                                            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#6b7280' }}><Mail size={16} /> <span style={{ fontWeight: 600 }}>{c.email || 'Sin correo'}</span></div>
                                                                <div translate="no" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#6b7280' }}><CalendarIcon size={16} /> <span style={{ fontWeight: 600 }}>{c.fecha_nacimiento ? format(new Date(String(c.fecha_nacimiento).substring(0, 10) + 'T12:00:00'), "dd 'de' MMMM yyyy", { locale: es }).replace(/de (\w)/, (_, letter) => `de ${letter.toUpperCase()}`) : 'Sin fecha de nacimiento'}</span></div>
                                                                {!isSinCita && <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#6b7280' }}><Clock size={16} /> <span style={{ fontWeight: 600 }}>{c.fecha_registro ? `Registrado: ${format(safeDate(c.fecha_registro), 'd MMM yyyy', { locale: es })}` : 'Registrado recientemente'}</span></div>}
                                                            </div>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                <div style={{ position: 'relative' }}>
                                                    <Search size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                                                    <input placeholder="Buscar cliente..." value={clientSearchTerm} onChange={e => setClientSearchTerm(e.target.value)} style={{ width: '100%', padding: '0.75rem 0.75rem 0.75rem 2.5rem', borderRadius: '12px', border: '1px solid #e5e7eb' }} />
                                                </div>
                                                <button onClick={handleOpenCreateClient} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', border: 'none', background: 'none' }}><UserPlus size={20} color="#2563eb" /> <span style={{ fontWeight: 800 }}>Añadir un nuevo cliente</span></button>
                                                <button onClick={() => { setClientSearchTerm(''); handleSelectClient({ id: null, razon_social_nombres: 'Sin cita', apellidos: '', telefono: '' }); }} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', border: 'none', background: 'none' }}><User size={20} color="#6b7280" /> <span style={{ fontWeight: 800 }}>Sin cita</span></button>
                                                {clientes.filter(c => ((c.razon_social_nombres || '') + ' ' + (c.apellidos || '')).toLowerCase().includes(clientSearchTerm.toLowerCase()) || (c.telefono || '').includes(clientSearchTerm) || (c.email || '').toLowerCase().includes(clientSearchTerm.toLowerCase())).slice(0, 20).map(c => (
                                                    <div key={c.id} onClick={() => handleSelectClient(c)} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', cursor: 'pointer' }}>
                                                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{c.razon_social_nombres?.[0] || 'C'}</div>
                                                        <div><div style={{ fontWeight: 800 }}>{c.razon_social_nombres} {c.apellidos}</div><div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{c.telefono}</div></div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Right Content: Appointment or Block Form */}
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                                    {drawerOpen.tipo === 'BLOQUEO' ? (
                                        /* FORMULARIO DE BLOQUEO (ESTILO FRESHA) */
                                        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                            <div>
                                                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827', display: 'block', marginBottom: '0.75rem' }}>Tipo de horario no disponible</label>
                                                <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '0.5rem', scrollbarWidth: 'none' }}>
                                                    {[
                                                        { label: 'Personalizado', icon: <Plus size={20} /> },
                                                        { label: 'Comida', icon: <Clock size={20} /> },
                                                        { label: 'Formación', icon: <Search size={20} /> },
                                                        { label: 'Reunión', icon: <Users size={20} /> },
                                                        { label: 'Día Libre', icon: <CalendarIcon size={20} /> },
                                                        { label: 'Vacaciones', icon: <Star size={20} /> }
                                                    ].map(sub => (
                                                        <div
                                                            key={sub.label}
                                                            onClick={() => setDrawerOpen({ ...drawerOpen, subtipo_bloqueo: sub.label })}
                                                            style={{
                                                                minWidth: '100px', height: '100px', borderRadius: '12px', border: (drawerOpen.subtipo_bloqueo === sub.label) ? '2px solid #2563eb' : '1px solid #e5e7eb',
                                                                backgroundColor: (drawerOpen.subtipo_bloqueo === sub.label) ? '#eff6ff' : '#fff',
                                                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'pointer', flexShrink: 0
                                                            }}
                                                        >
                                                            <div style={{ color: (drawerOpen.subtipo_bloqueo === sub.label) ? '#2563eb' : '#374151' }}>{sub.icon}</div>
                                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, textAlign: 'center' }}>{sub.label}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div>
                                                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827', display: 'block', marginBottom: '0.5rem' }}>Título (Opcional)</label>
                                                <input 
                                                    placeholder="por ejemplo, comida de negocios" 
                                                    value={drawerOpen.subtipo_bloqueo !== 'Personalizado' ? '' : (drawerOpen.notas_internas || '')}
                                                    onChange={e => setDrawerOpen({ ...drawerOpen, notas_internas: e.target.value })}
                                                    style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1px solid #e5e7eb', outline: 'none', fontSize: '0.95rem' }} 
                                                />
                                            </div>

                                            <div>
                                                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827', display: 'block', marginBottom: '0.5rem' }}>Fecha</label>
                                                <input 
                                                    type="date"
                                                    value={format(safeDate(drawerOpen.fecha_hora_inicio), 'yyyy-MM-dd')}
                                                    onChange={e => {
                                                        const d = e.target.value;
                                                        const startT = drawerOpen.startTime || '09:00';
                                                        const endT = drawerOpen.endTime || '10:00';
                                                        setDrawerOpen({ ...drawerOpen, fecha_hora_inicio: `${d} ${startT}:00`, fecha_hora_fin: `${d} ${endT}:00` });
                                                    }}
                                                    style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1px solid #e5e7eb', outline: 'none', fontSize: '0.95rem' }} 
                                                />
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                                <div>
                                                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827', display: 'block', marginBottom: '0.5rem' }}>Hora de inicio</label>
                                                    <input
                                                        type="time"
                                                        value={drawerOpen.startTime || '09:00'}
                                                        onChange={(e) => {
                                                            const newT = e.target.value;
                                                            const d = format(safeDate(drawerOpen.fecha_hora_inicio), 'yyyy-MM-dd');
                                                            setDrawerOpen({ ...drawerOpen, startTime: newT, fecha_hora_inicio: `${d} ${newT}:00` });
                                                        }}
                                                        style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1px solid #e5e7eb', outline: 'none', fontWeight: 600 }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827', display: 'block', marginBottom: '0.5rem' }}>Hora de finalización</label>
                                                    <input
                                                        type="time"
                                                        value={drawerOpen.endTime || '10:00'}
                                                        onChange={(e) => {
                                                            const newT = e.target.value;
                                                            const d = format(safeDate(drawerOpen.fecha_hora_inicio), 'yyyy-MM-dd');
                                                            setDrawerOpen({ ...drawerOpen, endTime: newT, fecha_hora_fin: `${d} ${newT}:00` });
                                                        }}
                                                        style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1px solid #e5e7eb', outline: 'none', fontWeight: 600 }}
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827', display: 'block', marginBottom: '0.5rem' }}>Miembros del equipo</label>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem', border: '1px solid #e5e7eb', borderRadius: '12px', backgroundColor: '#fafafa' }}>
                                                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: getAvatarColor(drawerOpen.empleado_id), color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800 }}>{(empleados.find(e => e.id === drawerOpen.empleado_id)?.nombre_display || 'U')[0]}</div>
                                                    <span style={{ fontWeight: 600 }}>{empleados.find(e => e.id === drawerOpen.empleado_id)?.nombre_display}</span>
                                                </div>
                                            </div>

                                            <div>
                                                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827', display: 'block', marginBottom: '0.5rem' }}>Frecuencia</label>
                                                <select style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1px solid #e5e7eb', outline: 'none', backgroundColor: 'white' }}>
                                                    <option>No se repite</option>
                                                    <option>Diariamente</option>
                                                    <option>Semanalmente</option>
                                                </select>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '12px' }}>
                                                <input 
                                                    type="checkbox" 
                                                    style={{ width: '20px', height: '20px' }} 
                                                    checked={!!drawerOpen.reserva_online_permitida}
                                                    onChange={e => setDrawerOpen({ ...drawerOpen, reserva_online_permitida: e.target.checked })}
                                                />
                                                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Reserva online permitida durante el horario no disponible</label>
                                            </div>
                                        </div>
                                    ) : (
                                        /* FORMULARIO DE CITA (Existing) */
                                        <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto' }}>
                                            {viewState === 'date_picker' ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                    <h4 style={{ margin: 0, fontWeight: 900 }}>Fecha y hora</h4>
                                                    <input type="date" value={format(safeDate(drawerOpen.fecha_hora_inicio), 'yyyy-MM-dd')} onChange={e => {
                                                        const d = e.target.value;
                                                        const t = format(safeDate(drawerOpen.fecha_hora_inicio), 'HH:mm');
                                                        setDrawerOpen({ ...drawerOpen, fecha_hora_inicio: `${d} ${t}:00` });
                                                    }} style={{ padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb' }} />
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                                                        {Array.from({ length: 40 }).map((_, i) => {
                                                            const h = 8 + Math.floor(i / 4);
                                                            const m = (i % 4) * 15;
                                                            const t = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                                                            return <button key={t} onClick={() => {
                                                                const d = format(safeDate(drawerOpen.fecha_hora_inicio), 'yyyy-MM-dd');
                                                                setDrawerOpen({ ...drawerOpen, fecha_hora_inicio: `${d} ${t}:00` });
                                                                setViewState('appointment');
                                                            }} style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid #e5e7eb', fontWeight: 700 }}>{t}</button>;
                                                        })}
                                                    </div>
                                                </div>
                                            ) : viewState === 'service_selector' ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><h4 style={{ margin: 0, fontWeight: 900 }}>Servicios</h4> <X size={20} onClick={() => setViewState('appointment')} /></div>
                                                    <input placeholder="Buscar servicio..." value={serviceSearchTerm} onChange={e => setServiceSearchTerm(e.target.value)} style={{ padding: '0.75rem', borderRadius: '12px', border: '1px solid #e5e7eb' }} />
                                                    {servicios.filter(s => s.nombre.toLowerCase().includes(serviceSearchTerm.toLowerCase())).map(s => (
                                                        <div key={s.id} onClick={() => {
                                                            const sList = drawerOpen.servicios_agregados?.length > 0 ? [...drawerOpen.servicios_agregados] : (drawerOpen.servicio_id ? [{ id: drawerOpen.servicio_id, nombre: drawerOpen.servicio_nombre, precio: drawerOpen.servicio_precio || drawerOpen.precio, duracion_minutos: drawerOpen.servicio_duracion || drawerOpen.duracion_minutos }] : []);
                                                            sList.push({ id: s.id, nombre: s.nombre, precio: s.precio, duracion_minutos: s.duracion_minutos || 40 });
                                                            setDrawerOpen({ ...drawerOpen, servicios_agregados: sList, servicio_id: sList[0].id, servicio_nombre: sList[0].nombre, servicio_precio: sList[0].precio, servicio_duracion: sList[0].duracion_minutos });
                                                            setViewState('appointment');
                                                        }} style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                                                            <div><div style={{ fontWeight: 800 }}>{s.nombre}</div><div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{s.duracion_minutos} min</div></div>
                                                            <div style={{ fontWeight: 800 }}>{s.precio} PEN</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1.5rem' }}>
                                                    <div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}><h4 style={{ margin: 0, fontWeight: 700 }}>Servicios en la cita</h4></div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                            {(() => {
                                                                const sList = drawerOpen.servicios_agregados?.length > 0
                                                                    ? drawerOpen.servicios_agregados
                                                                    : (drawerOpen.servicio_id ? [{ id: drawerOpen.servicio_id, nombre: drawerOpen.servicio_nombre, precio: drawerOpen.servicio_precio || drawerOpen.precio, duracion_minutos: drawerOpen.servicio_duracion || drawerOpen.duracion_minutos }] : []);

                                                                let currentStart = new Date(safeDate(drawerOpen.fecha_hora_inicio));

                                                                if (sList.length === 0) {
                                                                    return <button onClick={() => setViewState('service_selector')} style={{ width: '100%', padding: '1rem', border: '1px dashed #d1d5db', borderRadius: '12px', color: '#2563eb', fontWeight: 700 }}>+ Añadir servicio principal</button>;
                                                                }

                                                                return (
                                                                    <>
                                                                        {sList.map((serv, idx) => {
                                                                            const serviceStart = idx === 0 ? currentStart : addMinutes(currentStart, sList.slice(0, idx).reduce((sum, s) => sum + parseInt(s.duracion_minutos || 0), 0));
                                                                            return (
                                                                                <div key={idx} style={{ padding: '1.25rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                                                        <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{serv.nombre}</span>
                                                                                        <span style={{ fontWeight: 700 }}>{serv.precio || 0} PEN</span>
                                                                                    </div>
                                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#6b7280', fontSize: '0.85rem' }}>
                                                                                            <span>{formatAMPM(serviceStart)}</span> • <span>{serv.duracion_minutos || 0} min</span> •
                                                                                            <div translate="no" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                                <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: getAvatarColor(drawerOpen.empleado_id), color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px' }}>{(empleados.find(e => e.id === drawerOpen.empleado_id)?.nombre_display || 'U')[0]}</div>
                                                                                                {empleados.find(e => e.id === drawerOpen.empleado_id)?.nombre_display}
                                                                                            </div>
                                                                                        </div>
                                                                                        <X size={16} color="#ef4444" style={{ cursor: 'pointer' }} onClick={() => {
                                                                                            const newList = sList.filter((_, i) => i !== idx);
                                                                                            if (newList.length > 0) {
                                                                                                setDrawerOpen({ ...drawerOpen, servicios_agregados: newList, servicio_id: newList[0].id, servicio_nombre: newList[0].nombre, servicio_precio: newList[0].precio, servicio_duracion: newList[0].duracion_minutos });
                                                                                            } else {
                                                                                                setDrawerOpen({ ...drawerOpen, servicios_agregados: [], servicio_id: null, servicio_nombre: null, servicio_precio: null, servicio_duracion: null });
                                                                                            }
                                                                                        }} />
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                        <button onClick={() => setViewState('service_selector')} style={{ width: '100%', padding: '1rem', border: '1px dashed #d1d5db', borderRadius: '12px', color: '#2563eb', fontWeight: 700 }}>+ Añadir otro servicio</button>
                                                                    </>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* FOOTER ACCIÓN */}
                            <div style={{ padding: '1.25rem 1.5rem', borderTop: '1px solid #f3f4f6', backgroundColor: 'white' }}>
                                {drawerOpen.tipo === 'BLOQUEO' ? (
                                    <button onClick={handleSaveAppointment} style={{ width: '100%', padding: '1rem', backgroundColor: '#000', color: 'white', borderRadius: '12px', fontSize: '1.1rem', fontWeight: 900, cursor: 'pointer', transition: 'transform 0.1s active' }}>
                                        Guardar
                                    </button>
                                ) : (
                                    (() => {
                                        const sList = drawerOpen.servicios_agregados?.length > 0
                                            ? drawerOpen.servicios_agregados
                                            : (drawerOpen.servicio_id ? [{ precio: drawerOpen.servicio_precio || drawerOpen.precio, duracion_minutos: drawerOpen.servicio_duracion || drawerOpen.duracion_minutos }] : []);
                                        const parseNum = val => parseFloat(String(val).replace(/[^0-9.-]+/g, "")) || 0;
                                        const tPrecio = sList.reduce((acc, s) => acc + parseNum(s.precio), 0);
                                        const tDur = sList.reduce((acc, s) => acc + parseNum(s.duracion_minutos), 0);
                                        return (
                                            <>
                                                <div translate="no" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                                    <div><div style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>Total a cobrar</div><div style={{ fontSize: '1.5rem', fontWeight: 900 }}>{tPrecio} PEN</div></div>
                                                    <div style={{ textAlign: 'right', fontSize: '0.8rem', color: '#6b7280' }}>{tDur} min</div>
                                                </div>
                                                <button onClick={handleSaveAppointment} disabled={sList.length === 0} style={{ width: '100%', padding: '1rem', backgroundColor: sList.length === 0 ? '#e5e7eb' : '#2563eb', color: 'white', borderRadius: '30px', fontWeight: 900, cursor: 'pointer' }}>Guardar Cita</button>
                                            </>
                                        );
                                    })()
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* VIEW: CLIENT PROFILE (3 PANELS) */}
            {
                viewState === 'profile' && (
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
                )
            }

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
            <style dangerouslySetInnerHTML={{ __html: `.btn-icon:hover { background-color: #f3f4f6; } .btn-secondary:hover { background-color: #f9fafb; } .res-card:hover { filter: brightness(0.97); } .grid-cell:hover .cell-hover-time { display: flex !important; } @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }` }} />
                </div>
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
        </>
    );
};
