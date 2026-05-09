import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Calendar as CalendarIcon, Home, Users, BarChart3, Settings, LogOut } from 'lucide-react';
import { useAuth } from './AuthContext';

export default function Sidebar() {
    const { logout, hasPermission } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const menuItems = [
        { icon: <Home size={22} />, path: '/dashboard', label: 'Dashboard', permission: 'ver_dashboard' },
        { icon: <CalendarIcon size={22} />, path: '/', label: 'Calendario', permission: 'ver_reservas' },
        { icon: <Users size={22} />, path: '/equipo', label: 'Equipo', permission: 'ver_equipo' },
        { icon: <BarChart3 size={22} />, path: '/analytics', label: 'Análisis', permission: 'ver_finanzas' },
        { icon: <Settings size={22} />, path: '/ajustes', label: 'Ajustes', permission: 'ver_configuracion' },
    ].filter(item => hasPermission(item.permission));

    return (
        <div className="sidebar" style={{
            width: '64px',
            backgroundColor: 'white',
            borderRight: '1px solid #e5e7eb',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '1.5rem 0',
            flexShrink: 0,
            zIndex: 100
        }}>
            {menuItems.map((item, idx) => (
                <div
                    key={idx}
                    className="sidebar-item"
                    onClick={() => navigate(item.path)}
                    title={item.label}
                    style={{
                        marginBottom: '1.5rem',
                        cursor: 'pointer',
                        color: location.pathname === item.path ? '#000' : '#d1d5db',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        transition: 'all 0.2s',
                        padding: '8px',
                        borderRadius: '12px',
                        backgroundColor: location.pathname === item.path ? '#f3f4f6' : 'transparent'
                    }}
                    onMouseEnter={(e) => {
                        if (location.pathname !== item.path) {
                            e.currentTarget.style.color = '#9ca3af';
                            e.currentTarget.style.backgroundColor = '#f9fafb';
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (location.pathname !== item.path) {
                            e.currentTarget.style.color = '#d1d5db';
                            e.currentTarget.style.backgroundColor = 'transparent';
                        }
                    }}
                >
                    {item.icon}
                </div>
            ))}
            <div style={{ flex: 1 }} />
            
            <div
                onClick={() => { logout(); navigate('/login'); }}
                title="Cerrar Sesión"
                style={{
                    cursor: 'pointer',
                    color: '#ef4444',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    transition: 'all 0.2s',
                    padding: '8px',
                    borderRadius: '12px'
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#fef2f2';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                }}
            >
                <LogOut size={22} />
            </div>
        </div>
    );
}
