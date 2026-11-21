
import { gcd, modDetBigInt } from './mathUtils';

export interface StrategyResult {
    factor: bigint;
    method: string;
}

export const strategyCombinedDeterminants = (matrices: bigint[][][], N: bigint): StrategyResult | null => {
    let combinedDet = 0n;
    for (let i = 0; i < matrices.length; i++) {
        const d = modDetBigInt(matrices[i], N);
        if (d === 0n) continue;
        
        const g = gcd(d, N);
        if (g > 1n && g < N) {
            return { factor: g, method: `det(M_${i + 1})` };
        }
        
        if (combinedDet === 0n) combinedDet = d;
        else combinedDet = gcd(combinedDet, d);
    }
    
    const gFinal = gcd(combinedDet, N);
    if (gFinal > 1n && gFinal < N) {
        return { factor: gFinal, method: "combined GCD" };
    }
    
    return null;
};

export const strategyShifted = (matrices: bigint[][][], N: bigint): StrategyResult | null => {
    const size = matrices[0].length;
    for (let i = 0; i < matrices.length; i++) {
        for (let k = -5n; k <= 5n; k++) {
            if (k === 0n) continue;
            const Ms = matrices[i].map((row, rIdx) => 
                row.map((val, cIdx) => rIdx === cIdx ? (val + k + N) % N : val)
            );
            const d = modDetBigInt(Ms, N);
            const g = gcd(d, N);
            if (g > 1n && g < N) {
                return { factor: g, method: `det(M_${i + 1} + ${k}I)` };
            }
        }
    }
    return null;
};

export const strategyA1Lens = (matrices: bigint[][][], A1: bigint[][], N: bigint): StrategyResult | null => {
    // Simplified A1 Lens: T = (A1 * A1^T) * M_truncated
    const k = A1.length; // 19
    const m = A1[0].length; // 6
    
    // G = A1 * A1^T (mod N)
    const G: bigint[][] = Array.from({ length: k }, () => Array(k).fill(0n));
    for (let i = 0; i < k; i++) {
        for (let j = 0; j < k; j++) {
            for (let l = 0; l < m; l++) {
                G[i][j] = (G[i][j] + A1[i][l] * A1[j][l]) % N;
            }
        }
    }

    for (let i = 0; i < matrices.length; i++) {
        const M = matrices[i];
        if (M.length < k) continue;

        // Truncated matrix B = M[0:k, 0:k]
        const B = M.slice(0, k).map(row => row.slice(0, k));
        
        // T = G * B
        const T: bigint[][] = Array.from({ length: k }, () => Array(k).fill(0n));
        for (let r = 0; r < k; r++) {
            for (let c = 0; c < k; c++) {
                for (let l = 0; l < k; l++) {
                    T[r][c] = (T[r][c] + G[r][l] * B[l][c]) % N;
                }
            }
        }

        const d = modDetBigInt(T, N);
        const g = gcd(d, N);
        if (g > 1n && g < N) {
            return { factor: g, method: `A1-lens(M_${i + 1})` };
        }
    }
    return null;
};
