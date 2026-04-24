import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import { TrendingUp, Calendar, ArrowUpRight, MoreVertical, Search } from 'lucide-react';
import { format } from 'date-fns';
import { es as localeEs } from 'date-fns/locale';

const API_BASE = import.meta.env.VITE_API_URL || (window.location.origin.includes('localhost') ? 'http://localhost:5001/api' : window.location.origin + '/api');

export default function Dashboard() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [sucursales, setSucursales] = useState([]);
    const [selectedSucursalId, setSelectedSucursalId] = useState(null);

    useEffect(() => {
        fetch(`${API_BASE}/sucursales`)
            .then(res => res.json())
            .then(data => {
                setSucursales(data);
                if (data.length > 0) setSelectedSucursalId(data[0].id);
            });
    }, []);

    useEffect(() => {
        if (selectedSucursalId) {
            setLoading(true);
            fetch(`${API_BASE}/dashboard-stats?sucursalId=${selectedSucursalId}`)
                .then(res => res.json())
                .then(data => {
                    setStats(data);
                    setLoading(false);
                })
                .catch(err => {
                    console.error(err);
                    setLoading(false);
                });
        }
    }, [selectedSucursalId]);

    if (loading || !stats) {
        return (
            <div style={{ display: 'flex', height: '100vh' }}>
                <Sidebar />
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' }}>
                    <div className="loader">Cargando Dashboard...</div>
                </div>
            </div>
        );
    }

    const maxSales = Math.max(...stats.salesGraph.map(d => parseFloat(d.ventas) || 0), 100);
    const maxAppointments = Math.max(...stats.upcomingGraph.map(d => d.confirmado + d.cancelada), 5);

    return (
        <div style={{ display: 'flex', height: '100vh', backgroundColor: '#f9fafb', fontFamily: "'Inter', sans-serif", overflow: 'hidden' }}>
            <Sidebar />

            <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 900 }}>Dashboard</h1>
                    <select
                        value={selectedSucursalId}
                        onChange={(e) => setSelectedSucursalId(parseInt(e.target.value))}
                        style={{ border: 'none', background: 'white', padding: '0.6rem 1rem', borderRadius: '12px', fontWeight: 700, fontSize: '0.9rem', outline: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
                    >
                        {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    </select>
                </div>

                {/* Top Grid: Charts */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                    {/* Sales Column */}
                    <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                            <div>
                                <h3 style={{ fontSize: '1rem', fontWeight: 900, marginBottom: '0.25rem' }}>Ventas recientes</h3>
                                <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>Últimos 7 días</p>
                                <div style={{ fontSize: '1.75rem', fontWeight: 900, marginTop: '0.5rem' }}>{stats.summary.totalVentas7d} PEN</div>
                                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.25rem' }}>
                                    Citas <span style={{ fontWeight: 800, color: '#000' }}>{stats.summary.totalCitas7d}</span>
                                </div>
                            </div>
                            <MoreVertical size={20} color="#9ca3af" style={{ cursor: 'pointer' }} />
                        </div>

                        {/* LINE CHART (CSS BASED) */}
                        <div style={{ height: '200px', display: 'flex', alignItems: 'flex-end', gap: '4px', position: 'relative', marginTop: '2rem', borderBottom: '1px solid #f3f4f6' }}>
                            {stats.salesGraph.map((d, i) => {
                                const salesPct = (parseFloat(d.ventas) / maxSales) * 100;
                                return (
                                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', position: 'relative' }}>
                                        {/* Sales Dot */}
                                        <div style={{
                                            width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981',
                                            marginBottom: `${salesPct}%`, position: 'absolute', bottom: '0', zIndex: 2
                                        }} />
                                        {/* Sales Line Segment (simplified) */}
                                        <div style={{ width: '2px', height: `${salesPct}%`, backgroundColor: '#10b981', opacity: 0.2 }} />
                                        <span style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: '8px' }}>{format(new Date(d.fecha), 'eee d', { locale: localeEs })}</span>
                                    </div>
                                );
                            })}
                            {/* Grid Y Axis (simplificado) */}
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', borderTop: '1px dashed #f3f4f6' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#6b7280' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#6366f1' }} /> Ventas
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#6b7280' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} /> Citas
                            </div>
                        </div>
                    </div>

                    {/* Upcoming Appointments Column */}
                    <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                            <div>
                                <h3 style={{ fontSize: '1rem', fontWeight: 900, marginBottom: '0.25rem' }}>Próximas citas</h3>
                                <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>Próximos 7 días</p>
                                <div style={{ fontSize: '1.75rem', fontWeight: 900, marginTop: '0.5rem' }}>{stats.summary.proximasCitas} cita(s)</div>
                            </div>
                            <MoreVertical size={20} color="#9ca3af" style={{ cursor: 'pointer' }} />
                        </div>

                        {/* BAR CHART (CSS BASED) */}
                        <div style={{ height: '200px', display: 'flex', alignItems: 'flex-end', gap: '12px', position: 'relative', marginTop: '2rem', borderBottom: '1px solid #f3f4f6' }}>
                            {stats.upcomingGraph.map((d, i) => {
                                const confirmedPct = (d.confirmado / maxAppointments) * 100;
                                const canceledPct = (d.cancelada / maxAppointments) * 100;
                                return (
                                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                                        <div style={{ display: 'flex', width: '12px', gap: '2px', height: '100%', alignItems: 'flex-end' }}>
                                            <div style={{ width: '100%', height: `${confirmedPct}%`, backgroundColor: '#6366f1', borderRadius: '4px 4px 0 0' }} />
                                            {d.cancelada > 0 && <div style={{ width: '100%', height: `${canceledPct}%`, backgroundColor: '#ef4444', borderRadius: '4px 4px 0 0' }} />}
                                        </div>
                                        <span style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: '8px' }}>{format(new Date(d.fecha), 'eee d', { locale: localeEs })}</span>
                                    </div>
                                );
                            })}
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#6b7280' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#6366f1' }} /> Confirmado
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#6b7280' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }} /> Cancelada
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Row: Activity & Rankings */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '1.5rem' }}>

                    {/* Recent Activity */}
                    <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 900, marginBottom: '1.5rem' }}>Actividad de citas</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {stats.recentActivity.map((act, i) => (
                                <div key={i} style={{ display: 'flex', gap: '1rem' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '20px' }}>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 900 }}>{format(new Date(act.fecha_hora_inicio), 'd')}</div>
                                        <div style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase' }}>{format(new Date(act.fecha_hora_inicio), 'MMM', { locale: localeEs })}</div>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                                            {format(new Date(act.fecha_hora_inicio), 'eee d MMM yyyy h:mm a', { locale: localeEs })}
                                            <span style={{ marginLeft: '8px', color: '#10b981', backgroundColor: '#ecfdf5', padding: '2px 8px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 800 }}>Reservada</span>
                                        </div>
                                        <div style={{ fontWeight: 900, fontSize: '0.9rem', marginTop: '0.2rem' }}>{act.servicio_nombre}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{act.cliente_nombre || 'Cliente sin nombre'} • con {act.empleado_nombre}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Top Services */}
                    <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 900, marginBottom: '1rem' }}>Mejores servicios</h3>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid #f3f4f6' }}>
                                    <th style={{ padding: '0.75rem 0', fontSize: '0.75rem', color: '#6b7280' }}>Servicio</th>
                                    <th style={{ padding: '0.75rem 0', fontSize: '0.75rem', color: '#6b7280', textAlign: 'right' }}>Este mes</th>
                                    <th style={{ padding: '0.75rem 0', fontSize: '0.75rem', color: '#6b7280', textAlign: 'right' }}>Último mes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.topServices.map((s, i) => (
                                    <tr key={i} style={{ borderBottom: i === stats.topServices.length - 1 ? 'none' : '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '0.75rem 0', fontSize: '0.85rem', fontWeight: 700 }}>{s.nombre}</td>
                                        <td style={{ padding: '0.75rem 0', fontSize: '0.85rem', fontWeight: 700, textAlign: 'right' }}>{s.este_mes}</td>
                                        <td style={{ padding: '0.75rem 0', fontSize: '0.85rem', fontWeight: 700, textAlign: 'right', color: '#9ca3af' }}>{s.ultimo_mes}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Top Staff */}
                    <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 900, marginBottom: '1rem' }}>Mejor miembro del equipo</h3>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid #f3f4f6' }}>
                                    <th style={{ padding: '0.75rem 0', fontSize: '0.75rem', color: '#6b7280' }}>Miembro del equipo</th>
                                    <th style={{ padding: '0.75rem 0', fontSize: '0.75rem', color: '#6b7280', textAlign: 'right' }}>Este mes</th>
                                    <th style={{ padding: '0.75rem 0', fontSize: '0.75rem', color: '#6b7280', textAlign: 'right' }}>Último mes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.topStaff.map((s, i) => (
                                    <tr key={i} style={{ borderBottom: i === stats.topStaff.length - 1 ? 'none' : '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '0.75rem 0', fontSize: '0.85rem', fontWeight: 700 }}>{s.nombre}</td>
                                        <td style={{ padding: '0.75rem 0', fontSize: '0.85rem', fontWeight: 700, textAlign: 'right' }}>{s.este_mes} PEN</td>
                                        <td style={{ padding: '0.75rem 0', fontSize: '0.85rem', fontWeight: 700, textAlign: 'right', color: '#9ca3af' }}>{s.ultimo_mes} PEN</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                </div>
            </div>
        </div>
    );
}
