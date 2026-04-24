import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import { Users, Clock, Plus, Search, MoreVertical, X, Check, Copy, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';

const API_BASE = import.meta.env.VITE_API_URL || (window.location.origin.includes('localhost') ? 'http://localhost:5001/api' : window.location.origin + '/api');

export default function TeamManager() {
    const [activeTab, setActiveTab] = useState('members'); // 'members' | 'shifts'
    const [team, setTeam] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddMember, setShowAddMember] = useState(false);
    const [newMember, setNewMember] = useState({ nombres: '', apellidos: '', email: '', telefono: '', dni: '' });

    // Shift States
    const [selectedMember, setSelectedMember] = useState(null);
    const [recurringShifts, setRecurringShifts] = useState([]);
    const [showShiftEditor, setShowShiftEditor] = useState(false);

    useEffect(() => {
        fetchTeam();
    }, []);

    const fetchTeam = () => {
        setLoading(true);
        fetch(`${API_BASE}/equipo`)
            .then(res => res.json())
            .then(data => {
                setTeam(data);
                setLoading(false);
            });
    };

    const handleAddMember = (e) => {
        e.preventDefault();
        fetch(`${API_BASE}/equipo/miembros`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newMember)
        }).then(() => {
            setShowAddMember(false);
            setNewMember({ nombres: '', apellidos: '', email: '', telefono: '', dni: '' });
            fetchTeam();
        });
    };

    const openShiftEditor = (member) => {
        setSelectedMember(member);
        fetch(`${API_BASE}/equipo/horarios-recurrentes/${member.id}`)
            .then(res => res.json())
            .then(data => {
                // Initialize with all days if empty or map existing
                const days = [0, 1, 2, 3, 4, 5, 6].map(d => {
                    const existing = data.filter(h => h.dia_semana === d);
                    return {
                        dia: d,
                        activo: existing.length > 0,
                        horarios: existing.length > 0 ? existing.map(e => ({ inicio: e.hora_inicio.substring(0, 5), fin: e.hora_fin.substring(0, 5) })) : [{ inicio: '09:00', fin: '18:00' }]
                    };
                });
                setRecurringShifts(days);
                setShowShiftEditor(true);
            });
    };

    const saveShifts = () => {
        const flatShifts = [];
        recurringShifts.forEach(day => {
            if (day.activo) {
                day.horarios.forEach(h => {
                    flatShifts.push({
                        dia_semana: day.dia,
                        hora_inicio: h.inicio,
                        hora_fin: h.fin
                    });
                });
            }
        });

        fetch(`${API_BASE}/equipo/horarios-recurrentes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                empleado_id: selectedMember.id,
                sucursal_id: 1, // Default to JV Studio
                horarios: flatShifts
            })
        }).then(() => {
            setShowShiftEditor(false);
        });
    };

    const copyToAll = (fromIndex) => {
        const sourceDay = recurringShifts[fromIndex];
        const newShifts = recurringShifts.map(day => ({
            ...day,
            activo: true,
            horarios: sourceDay.horarios.map(h => ({ ...h }))
        }));
        setRecurringShifts(newShifts);
    };

    return (
        <div style={{ display: 'flex', height: '100vh', backgroundColor: '#f9fafb', fontFamily: "'Inter', sans-serif" }}>
            <Sidebar />

            <div style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 900 }}>Gestión de Equipo</h1>
                    <button
                        onClick={() => setShowAddMember(true)}
                        style={{ backgroundColor: '#000', color: '#fff', padding: '0.6rem 1.2rem', borderRadius: '12px', border: 'none', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <Plus size={18} /> Añadir miembro
                    </button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '2rem', borderBottom: '1px solid #e5e7eb', marginBottom: '2rem' }}>
                    <div
                        onClick={() => setActiveTab('members')}
                        style={{ padding: '0.75rem 0', cursor: 'pointer', fontWeight: 700, color: activeTab === 'members' ? '#000' : '#6b7280', borderBottom: activeTab === 'members' ? '2px solid #000' : 'none' }}
                    >
                        Miembros del equipo ({team.length})
                    </div>
                    <div
                        onClick={() => setActiveTab('shifts')}
                        style={{ padding: '0.75rem 0', cursor: 'pointer', fontWeight: 700, color: activeTab === 'shifts' ? '#000' : '#6b7280', borderBottom: activeTab === 'shifts' ? '2px solid #000' : 'none' }}
                    >
                        Turnos programados
                    </div>
                </div>

                {loading ? (
                    <div>Cargando...</div>
                ) : activeTab === 'members' ? (
                    <div style={{ backgroundColor: 'white', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid #f3f4f6', backgroundColor: '#fafafa' }}>
                                    <th style={{ padding: '1rem', fontSize: '0.75rem', color: '#6b7280', fontWeight: 700 }}>Nombre</th>
                                    <th style={{ padding: '1rem', fontSize: '0.75rem', color: '#6b7280', fontWeight: 700 }}>Contacto</th>
                                    <th style={{ padding: '1rem', fontSize: '0.75rem', color: '#6b7280', fontWeight: 700 }}>Rol</th>
                                    <th style={{ padding: '1rem', fontSize: '0.75rem', color: '#6b7280', fontWeight: 700, textAlign: 'right' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {team.map(m => (
                                    <tr key={m.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#6b7280' }}>
                                                {m.nombres[0]}{m.apellidos ? m.apellidos[0] : ''}
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 800 }}>{m.nombres} {m.apellidos}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>ID: {m.dni || '---'}</div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <div style={{ fontSize: '0.85rem' }}>{m.email || 'Sin email'}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{m.telefono || 'Sin teléfono'}</div>
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#f3f4f6', fontWeight: 700 }}>Bajo</span>
                                        </td>
                                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                                            <button
                                                onClick={() => openShiftEditor(m)}
                                                style={{ border: '1px solid #e5e7eb', background: 'white', padding: '0.4rem 0.8rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                                            >
                                                Editar turnos
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '2rem', textAlign: 'center' }}>
                        <Clock size={48} color="#d1d5db" style={{ marginBottom: '1rem' }} />
                        <h3 style={{ fontWeight: 800 }}>Agenda Semanal</h3>
                        <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>Visualización de turnos en desarrollo. Usa "Editar turnos" en la lista de miembros.</p>
                    </div>
                )}
            </div>

            {/* Modal: Add Member */}
            {showAddMember && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '24px', width: '450px', padding: '2rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 900 }}>Añadir miembro</h2>
                            <X onClick={() => setShowAddMember(false)} style={{ cursor: 'pointer' }} />
                        </div>
                        <form onSubmit={handleAddMember} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 800, display: 'block', marginBottom: '0.4rem' }}>Nombres</label>
                                <input required value={newMember.nombres} onChange={e => setNewMember({ ...newMember, nombres: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e5e7eb' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 800, display: 'block', marginBottom: '0.4rem' }}>Apellidos</label>
                                <input required value={newMember.apellidos} onChange={e => setNewMember({ ...newMember, apellidos: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e5e7eb' }} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 800, display: 'block', marginBottom: '0.4rem' }}>DNI</label>
                                    <input value={newMember.dni} onChange={e => setNewMember({ ...newMember, dni: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e5e7eb' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 800, display: 'block', marginBottom: '0.4rem' }}>Teléfono</label>
                                    <input value={newMember.telefono} onChange={e => setNewMember({ ...newMember, telefono: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e5e7eb' }} />
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 800, display: 'block', marginBottom: '0.4rem' }}>Email</label>
                                <input value={newMember.email} onChange={e => setNewMember({ ...newMember, email: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e5e7eb' }} />
                            </div>
                            <button type="submit" style={{ backgroundColor: '#000', color: '#fff', padding: '0.75rem', borderRadius: '12px', border: 'none', fontWeight: 800, marginTop: '1rem', cursor: 'pointer' }}>Guardar</button>
                        </form>
                    </div>
                </div>
            )}

            {/* Fullscreen Modal: Shift Editor (Recurring) */}
            {showShiftEditor && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: '#fff', zIndex: 1100, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1.5rem 2rem', borderBottom: '1px solid #e5e7eb' }}>
                        <div>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 900 }}>Establecer los turnos recurrentes de {selectedMember.nombres}</h2>
                            <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>Los cambios se aplicarán a todos los turnos futuros.</p>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <button onClick={() => setShowShiftEditor(false)} style={{ background: 'none', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Cerrar</button>
                            <button onClick={saveShifts} style={{ backgroundColor: '#000', color: '#fff', padding: '0.6rem 1.5rem', borderRadius: '12px', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Guardar</button>
                        </div>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: '3rem' }}>
                        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                            {recurringShifts.map((day, idx) => (
                                <div key={idx} style={{ display: 'flex', borderBottom: '1px solid #f3f4f6', padding: '1.5rem 0', gap: '2rem', alignItems: 'flex-start' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', width: '120px' }}>
                                        <input
                                            type="checkbox"
                                            checked={day.activo}
                                            onChange={e => {
                                                const next = [...recurringShifts];
                                                next[idx].activo = e.target.checked;
                                                setRecurringShifts(next);
                                            }}
                                            style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                                        />
                                        <span style={{ fontWeight: 800, textTransform: 'capitalize' }}>
                                            {format(addDays(startOfWeek(new Date()), day.dia), 'eeee', { locale: es })}
                                        </span>
                                    </div>

                                    <div style={{ flex: 1 }}>
                                        {day.activo ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                {day.horarios.map((h, hIdx) => (
                                                    <div key={hIdx} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                        <input
                                                            type="time"
                                                            value={h.inicio}
                                                            onChange={e => {
                                                                const next = [...recurringShifts];
                                                                next[idx].horarios[hIdx].inicio = e.target.value;
                                                                setRecurringShifts(next);
                                                            }}
                                                            style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '0.9rem' }}
                                                        />
                                                        <span style={{ color: '#6b7280' }}>a</span>
                                                        <input
                                                            type="time"
                                                            value={h.fin}
                                                            onChange={e => {
                                                                const next = [...recurringShifts];
                                                                next[idx].horarios[hIdx].fin = e.target.value;
                                                                setRecurringShifts(next);
                                                            }}
                                                            style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '0.9rem' }}
                                                        />

                                                        {hIdx === 0 && (
                                                            <button
                                                                onClick={() => {
                                                                    const next = [...recurringShifts];
                                                                    next[idx].horarios.push({ inicio: '15:00', fin: '19:00' });
                                                                    setRecurringShifts(next);
                                                                }}
                                                                style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid #e5e7eb', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                                                title="Añadir intervalo"
                                                            >
                                                                <Plus size={16} />
                                                            </button>
                                                        )}

                                                        {hIdx > 0 && (
                                                            <button
                                                                onClick={() => {
                                                                    const next = [...recurringShifts];
                                                                    next[idx].horarios.splice(hIdx, 1);
                                                                    setRecurringShifts(next);
                                                                }}
                                                                style={{ width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: '#fee2e2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        )}

                                                        {hIdx === 0 && (
                                                            <button
                                                                onClick={() => copyToAll(idx)}
                                                                style={{ marginLeft: '1rem', background: '#f3f4f6', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
                                                            >
                                                                <Copy size={14} /> Copiar a todos los días
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>No está trabajando</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
