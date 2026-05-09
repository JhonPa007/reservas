import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (savedUser && token) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const login = (userData, token) => {
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', token);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    setUser(null);
  };

  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.rol_nombre?.toLowerCase() === 'administrador') return true;
    return user.permisos?.includes(permission);
  };

  const canManageReservas = () => {
    if (!user) return false;
    const rol = user.rol_nombre?.toLowerCase();
    return rol === 'administrador' || rol === 'cajero';
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission, canManageReservas }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
