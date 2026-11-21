
// Sacred Quranic Data: Verses per Surah
export const QURAN_VERSES = [
    7, 286, 200, 176, 120, 165, 206, 75, 129, 109,
    123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
    112, 78, 118, 64, 77, 227, 93, 88, 69, 60,
    34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
    54, 53, 89, 59, 37, 35, 38, 29, 18, 45,
    60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
    14, 11, 11, 18, 12, 12, 30, 52, 52, 44,
    28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
    29, 19, 36, 25, 22, 17, 19, 26, 30, 20,
    15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
    11, 8, 3, 9, 5, 4, 7, 3, 6, 3,
    5, 4, 5, 6
];

export const SACRED_CONSTANTS = {
    QURAN_SURAHS: 114n,
    BIBLE_BOOKS: 66n,
    MAGIC_19: 19n,
    TRINITY: 3n,
    CREATION: 7n,
    COMPLETENESS: 12n,
    BIBLE_CHAPTERS: 1189n,
    BIBLE_VERSES: 31102n
};

// Sacred Biblical Data
export const BIBLE_BOOKS_TOTAL = 66;
export const BIBLE_CHAPTERS_TOTAL = 1189;
export const BIBLE_VERSES_TOTAL = 31102;
export const BIBLE_OT_BOOKS = 39;
export const BIBLE_NT_BOOKS = 27;

export const A1_MATRIX = [
    [7n, 286n, 200n, 176n, 120n, 165n],
    [206n, 75n, 129n, 109n, 123n, 111n],
    [43n, 52n, 99n, 128n, 111n, 110n],
    [98n, 135n, 112n, 78n, 118n, 64n],
    [77n, 227n, 93n, 88n, 69n, 60n],
    [34n, 30n, 73n, 54n, 45n, 83n],
    [182n, 88n, 75n, 85n, 54n, 53n],
    [89n, 59n, 37n, 35n, 38n, 29n],
    [18n, 45n, 60n, 49n, 62n, 55n],
    [78n, 96n, 29n, 22n, 24n, 13n],
    [14n, 11n, 11n, 18n, 12n, 12n],
    [30n, 52n, 52n, 44n, 28n, 28n],
    [20n, 56n, 40n, 31n, 50n, 40n],
    [46n, 42n, 29n, 19n, 36n, 25n],
    [22n, 17n, 19n, 26n, 30n, 20n],
    [15n, 21n, 11n, 8n, 8n, 19n],
    [5n, 8n, 8n, 11n, 11n, 8n],
    [3n, 9n, 5n, 4n, 7n, 3n],
    [6n, 3n, 5n, 4n, 5n, 6n]
];

export const ANT_MATRIX = [
    [5n, 218n, 112n, 136n, 175n, 166n],
    [175n, 85n, 161n, 141n, 112n, 164n],
    [73n, 62n, 127n, 111n, 91n, 114n],
    [86n, 152n, 111n, 48n, 165n, 59n],
    [88n, 151n, 77n, 179n, 25n, 80n],
    [28n, 22n, 84n, 68n, 59n, 74n],
    [197n, 111n, 64n, 137n, 54n, 36n],
    [208n, 102n, 46n, 48n, 45n, 42n],
    [26n, 84n, 122n, 64n, 102n, 96n],
    [80n, 99n, 36n, 29n, 35n, 14n],
    [18n, 10n, 13n, 8n, 12n, 7n],
    [29n, 79n, 45n, 64n, 22n, 30n],
    [16n, 80n, 59n, 15n, 36n, 25n],
    [34n, 28n, 17n, 14n, 23n, 30n],
    [15n, 12n, 14n, 17n, 26n, 14n],
    [10n, 9n, 8n, 3n, 8n, 11n],
    [3n, 4n, 7n, 12n, 9n, 8n],
    [2n, 5n, 2n, 3n, 7n, 3n],
    [4n, 2n, 3n, 3n, 3n, 5n]
];

export const M_MATRIX = [
    [1533n, 1213n, 859n, 1288n, 959n, 658n, 658n, 408n, 617n, 810n, 816n, 719n, 942n],
    [822n, 280n, 406n, 443n, 973n, 1070n, 150n, 915n, 222n, 117n, 1292n, 1364n, 154n],
    [1273n, 197n, 73n, 146n, 21n, 48n, 105n, 47n, 53n, 55n, 111n, 47n, 55n]
];

export const M_CORRECTED_MATRIX: number[][] = [
    [8.87, 264.85, 462.24, 545.53, 337.34, 220.07, 406.48, 159.03, 325.79, 331.59, 141.21, 147.85, 405.12],
    [53.02, 42.75, 84.66, 55.93, 76.23, 50.61, 12.81, 46.08, 17.17, 8.58, 38.43, 34.58, 5.22],
    [6.32, 1.75, 0.65, 0.93, 0.13, 0.41, 1.73, 0.41, 0.71, 0.84, 0.75, 0.40, 0.86]
];

// We will use a generator or a pseudo-random seed to simulate the 114 matrices
// to avoid huge bundle size, while ensuring the principle is shown.
export const generateSimulationMatrices = (n: number, size: number, N_str: string): bigint[][][] => {
    const matrices: bigint[][][] = [];
    const N = BigInt(N_str);
    
    // Use N to seed the random generation for deterministic behavior per key
    let seed = Number(N % 4294967291n); 
    const nextRand = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed;
    };

    for (let s = 0; s < n; s++) {
        const matrix: bigint[][] = [];
        for (let i = 0; i < size; i++) {
            const row: bigint[] = [];
            for (let j = 0; j < size; j++) {
                // Generate values scaling with the size of N to increase collision probability
                const val = BigInt(nextRand()) % N;
                row.push(val);
            }
            matrix.push(row);
        }
        matrices.push(matrix);
    }
    return matrices;
};
