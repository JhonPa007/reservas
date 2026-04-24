import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Calendar as CalendarIcon, Home, Users, BarChart3, Settings } from 'lucide-react';

export default function Sidebar() {
    const navigate = useNavigate();
    const location = useLocation();

    const menuItems = [
        { icon: <Home size={22} />, path: '/dashboard', label: 'Dashboard' },
        { icon: <CalendarIcon size={22} />, path: '/', label: 'Calendario' },
        { icon: <Users size={22} />, path: '/clientes', label: 'Clientes' },
        { icon: <BarChart3 size={22} />, path: '/analytics', label: 'Análisis' },
        { icon: <Settings size={22} />, path: '/ajustes', label: 'Ajustes' },
    ];

    return (
        <div style={{
            width: '64px',
            backgroundColor: 'white',
            borderRight: '1px solid #e5e7eb',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '1rem 0',
            flexShrink: 0,
            zIndex: 100
        }}>
            <div style={{
                width: '32px',
                height: '32px',
                backgroundColor: '#000',
                borderRadius: '8px',
                marginBottom: '2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 900,
                fontSize: '0.8rem'
            }}>JV</div>

            {menuItems.map((item, idx) => (
                <div
                    key={idx}
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
        </div>
    );
}
