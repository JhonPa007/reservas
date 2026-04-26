const { Client } = require('pg');
(async () => {
    const client = new Client('postgresql://postgres:JbCjfwFkrmmbuQdkFpCWGvNEbmqCUldc@gondola.proxy.rlwy.net:17823/railway');
    try {
        await client.connect();
        const h = await client.query('SELECT * FROM horarios_empleados LIMIT 10');
        const r = await client.query('SELECT * FROM horarios_recurrentes LIMIT 10');
        console.log(JSON.stringify({ horarios: h.rows, recurrentes: r.rows }, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
})();
