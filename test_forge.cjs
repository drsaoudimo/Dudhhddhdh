const forge = require('node-forge');

const N = "7193635544578916131245592130006272350772265480387308336832776804763155159413344255219590557637253863263350706505175725932453154924647646322594191861615363";
const p = "93482403209085700747991199314584767093292700500928150036920044698463283320539";
const q = "76951760947880247255370052432969354998499726093747193692693750956575728365817";

try {
    const n_forge = new forge.jsbn.BigInteger(N, 10);
    const e_forge = new forge.jsbn.BigInteger("65537", 10);
    const p_forge = new forge.jsbn.BigInteger(p, 10);
    const q_forge = new forge.jsbn.BigInteger(q, 10);
    const p1 = p_forge.subtract(forge.jsbn.BigInteger.ONE);
    const q1 = q_forge.subtract(forge.jsbn.BigInteger.ONE);
    const phi = p1.multiply(q1);
    const d_forge = e_forge.modInverse(phi);
    const dp = d_forge.mod(p1);
    const dq = d_forge.mod(q1);
    const qInv = q_forge.modInverse(p_forge);

    const privateKey = forge.pki.setRsaPrivateKey(
        n_forge, e_forge, d_forge, p_forge, q_forge, dp, dq, qInv
    );
    
    const pem = forge.pki.privateKeyToPem(privateKey);
    console.log(pem);
} catch (e) {
    console.error(e);
}
