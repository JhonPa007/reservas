const crypto = require('crypto');

const dbHash = "scrypt:32768:8:1$EasUNiOPYvxieWan$3848928aaf1aa8d3aae3fcc94ffc23e4cb50947b11beb2b1994b2f4ce10769262dbfd8f8acb51cbf15ce2fcc2d016beddc59cc1e5fd3fee243ef525170c3d401";
const password = "password_test"; // I don't know the password, but I can test the logic

function verifyScrypt(password, fullHash) {
    // Format: scrypt:N:r:p$salt$hash
    const parts = fullHash.split(':');
    if (parts[0] !== 'scrypt') return false;
    
    const n = parseInt(parts[1]);
    const r = parseInt(parts[2]);
    const remaining = parts[3].split('$');
    const p = parseInt(remaining[0]);
    const salt = remaining[1];
    const hash = remaining[2];

    console.log({ n, r, p, salt, hashLength: hash.length });

    const derived = crypto.scryptSync(password, salt, 64, { N: n, r, p });
    const derivedHex = derived.toString('hex');
    console.log("Derived:", derivedHex);
    return derivedHex === hash;
}

// Since I don't know the password, I'll just check if it runs without error and what it produces
try {
    verifyScrypt("incorrect", dbHash);
} catch (e) {
    console.error(e);
}
