const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
(async () => {
    const API_BASE = 'http://localhost:5000/api';
    const sucursalId = 2; // JV Studio
    const fecha = '2026-04-26'; // Hoy Domingo

    try {
        const res = await fetch(`${API_BASE}/reservas/sucursal/${sucursalId}/${fecha}`);
        const data = await res.json();
        console.log('--- DEBUG DATA ---');
        console.log('Recurrentes encontrados:', data.recurrentes.length);
        console.log('Muestra Recurrente:', data.recurrentes[0]);
        console.log('Horarios encontrados:', data.horarios.length);
    } catch (e) {
        console.error('Error en fetch:', e.message);
    }
})();
