import { A1_MATRIX, ANT_MATRIX, M_CORRECTED_MATRIX, M_MATRIX } from '../matricesData';
import { isProbablePrimeBig } from './mathEngine';

export interface ReferenceMatrixPreset {
  id: 'diff' | 'M' | 'ANT' | 'A1' | 'M_corrected';
  titleAr: string;
  formulaLatex: string;
  descriptionAr: string;
  matrix: number[][];
}

const toNumbers = (m: bigint[][]): number[][] => m.map(r => r.map(v => Number(v)));

export const A1_FLOAT = toNumbers(A1_MATRIX);
export const ANT_FLOAT = toNumbers(ANT_MATRIX);
export const M_FLOAT = toNumbers(M_MATRIX);
export const DIFF_ANT_A1_FLOAT: number[][] = ANT_FLOAT.map((row, i) =>
  row.map((val, j) => val - A1_FLOAT[i][j])
);

export const REFERENCE_MATRIX_PRESETS: ReferenceMatrixPreset[] = [
  {
    id: 'M',
    titleAr: 'المصفوفة M (3 × 13 · المجموع = 21919)',
    formulaLatex: 'M \\in \\mathbb{Z}^{3\\times 13},\\quad \\sum M = 21919 = 23 \\cdot 953',
    descriptionAr: 'مصفوفة حقيقية من الرتبة 3 تحمل الشبه أولي 21919 = 23 × 953 كمجموع مباشر.',
    matrix: M_FLOAT
  },
  {
    id: 'diff',
    titleAr: 'مصفوفة الفرق A_NT - A_1 (19 × 6 · المجموع = 371)',
    formulaLatex: 'A_{NT} - A_1 \\in \\mathbb{Z}^{19\\times 6},\\quad \\sum (A_{NT}-A_1) = 371 = 7 \\cdot 53',
    descriptionAr: 'الفرق الحسابي بين المصفوفتين المرجعيتين يُنتج شبه الأولي 371 = 7 × 53 في الكتلة M_{7,53}.',
    matrix: DIFF_ANT_A1_FLOAT
  },
  {
    id: 'ANT',
    titleAr: 'المصفوفة التصحيحية A_{NT\\_corrected} (19 × 6 · المجموع = 6607)',
    formulaLatex: 'A_{NT} \\in \\mathbb{Z}^{19\\times 6},\\quad \\sum A_{NT} = 6607',
    descriptionAr: 'التوزيع المصحح (مجموعه 6607، عدد أولي) الذي يكشف عنق الزجاجة في الصفين 7 و 8.',
    matrix: ANT_FLOAT
  },
  {
    id: 'A1',
    titleAr: 'المصفوفة الخام A_1 (19 × 6 · المجموع = 6236)',
    formulaLatex: 'A_1 \\in \\mathbb{Z}^{19\\times 6},\\quad \\sum A_1 = 6236 = 2^2 \\cdot 1559',
    descriptionAr: 'المزيج المرجعي الخام؛ مجموعها 6236 = 2² × 1559 (مركب عام — مزيج متعدد الكتل وليس شبه أولي).',
    matrix: A1_FLOAT
  },
  {
    id: 'M_corrected',
    titleAr: 'المصفوفة المصححة M_{corrected} (3 × 13)',
    formulaLatex: 'M_{\\text{corrected}} \\in \\mathbb{R}^{3\\times 13}',
    descriptionAr: 'الصف 2 (r = 0.979) يحمل الإشارة النظيفة للأولوية p_j، بينما الصفان 0 و 1 ضجيج.',
    matrix: M_CORRECTED_MATRIX
  }
];

export const parseMatrixText = (raw: string): { matrix: number[][] | null; error: string | null } => {
  const cleaned = raw.trim();
  if (!cleaned) {
    return { matrix: null, error: 'الحقل فارغ؛ الصق مصفوفة بصيغة np.array أو JSON أو CSV.' };
  }

  try {
    // Strip np.array(...) wrapper if present
    let normalized = cleaned
      .replace(/np\.array\s*\(/gi, '')
      .replace(/\)\s*$/g, '')
      .trim();

    if (normalized.startsWith('[')) {
      // Allow trailing commas
      normalized = normalized.replace(/,\s*\]/g, ']');
      const parsed = JSON.parse(normalized);
      if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0])) {
        const rows = parsed.map((row: any[]) => row.map(Number));
        const colCount = rows[0].length;
        if (colCount === 0 || rows.some(r => r.length !== colCount || r.some(v => Number.isNaN(v)))) {
          return { matrix: null, error: 'يجب أن تكون جميع الصفوف بنفس الطول وتحتوي أرقاماً صالحة.' };
        }
        return { matrix: rows, error: null };
      }
    }

    // Fallback: CSV or whitespace-separated rows
    const lines = cleaned.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const rows = lines.map(line =>
      line
        .replace(/[\[\]]/g, '')
        .split(/[\s,;]+/)
        .filter(Boolean)
        .map(Number)
    );
    const colCount = rows[0]?.length || 0;
    if (rows.length === 0 || colCount === 0 || rows.some(r => r.length !== colCount || r.some(v => Number.isNaN(v)))) {
      return { matrix: null, error: 'تعذر قراءة الأبعاد؛ تأكد من تساوي الأعمدة في كل صف.' };
    }
    return { matrix: rows, error: null };
  } catch {
    return { matrix: null, error: 'صيغة غير صالحة؛ جرّب JSON مثل [[1,2],[3,4]] أو CSV أو np.array(...).' };
  }
};

const gcdNum = (a: number, b: number): number => {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y > 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
};

const gcdArray = (arr: number[]): number => {
  let g = 0;
  for (const v of arr) {
    g = gcdNum(g, v);
  }
  return g;
};

export const computeMatrixRank = (matrix: number[][], eps = 1e-6): number => {
  const m = matrix.length;
  const n = matrix[0]?.length || 0;
  const A = matrix.map(r => [...r]);
  let rank = 0;
  let col = 0;

  for (let row = 0; row < m && col < n; col++) {
    let pivot = row;
    for (let i = row + 1; i < m; i++) {
      if (Math.abs(A[i][col]) > Math.abs(A[pivot][col])) pivot = i;
    }
    if (Math.abs(A[pivot][col]) <= eps) continue;
    [A[row], A[pivot]] = [A[pivot], A[row]];
    const div = A[row][col];
    for (let j = col; j < n; j++) A[row][j] /= div;
    for (let i = 0; i < m; i++) {
      if (i !== row && Math.abs(A[i][col]) > eps) {
        const factor = A[i][col];
        for (let j = col; j < n; j++) A[i][j] -= factor * A[row][j];
      }
    }
    rank++;
    row++;
  }
  return rank;
};

export interface MatrixAnalysisReport {
  rows: number;
  cols: number;
  isIntegerMatrix: boolean;
  totalSum: number;
  rowSums: number[];
  colSums: number[];
  gcdRowSums: number;
  gcdColSums: number;
  estimatedRank: number;
  minVal: number;
  maxVal: number;
  theorem1TotalClassAr: string;
  theorem1Passed: boolean;
  theorem2CandidateFactors: { rowGcdFactor: number; colGcdFactor: number };
  theorem3Rank1Exact: boolean;
}

export const analyzeMatrixStructure = (matrix: number[][]): MatrixAnalysisReport => {
  const rows = matrix.length;
  const cols = matrix[0]?.length || 0;
  const isIntegerMatrix = matrix.every(r => r.every(v => Math.abs(v - Math.round(v)) < 1e-9));

  const rowSums = matrix.map(r => Number(r.reduce((a, b) => a + b, 0).toFixed(4)));
  const colSums = new Array(cols).fill(0).map((_, j) =>
    Number(matrix.reduce((acc, row) => acc + row[j], 0).toFixed(4))
  );
  const totalSum = Number(rowSums.reduce((a, b) => a + b, 0).toFixed(4));

  let minVal = Infinity;
  let maxVal = -Infinity;
  for (const r of matrix) {
    for (const v of r) {
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
    }
  }

  const gcdRowSums = isIntegerMatrix ? gcdArray(rowSums) : 0;
  const gcdColSums = isIntegerMatrix ? gcdArray(colSums) : 0;
  const estimatedRank = computeMatrixRank(matrix);

  // Check whether integer |totalSum| is prime or semiprime or general composite
  let theorem1Passed = false;
  let theorem1TotalClassAr = `المجموع الكلي = ${totalSum}`;
  if (isIntegerMatrix && Number.isInteger(totalSum) && Math.abs(totalSum) >= 4) {
    const absSum = BigInt(Math.abs(Math.round(totalSum)));
    if (isProbablePrimeBig(absSum, 12)) {
      theorem1TotalClassAr = `المجموع ${absSum} عدد أولي (العمود c = 1)`;
    } else {
      // Quick factor check for semiprime sum
      let pFound: bigint | null = null;
      for (let d = 2n; d * d <= absSum && d <= 100000n; d++) {
        if (absSum % d === 0n) {
          pFound = d;
          break;
        }
      }
      if (pFound !== null) {
        const qFound = absSum / pFound;
        if (isProbablePrimeBig(pFound, 10) && isProbablePrimeBig(qFound, 10)) {
          theorem1Passed = true;
          theorem1TotalClassAr = `محققة ✓: ∑ = ${absSum} = ${pFound} × ${qFound} (شبه أولي متطابق مع الكتلة M_{${pFound},${qFound}})`;
        } else {
          theorem1TotalClassAr = `المجموع ${absSum} مركب عام (${pFound} × ${qFound}) — مزيج متعدد الكتل`;
        }
      }
    }
  }

  return {
    rows,
    cols,
    isIntegerMatrix,
    totalSum,
    rowSums,
    colSums,
    gcdRowSums,
    gcdColSums,
    estimatedRank,
    minVal,
    maxVal,
    theorem1TotalClassAr,
    theorem1Passed,
    theorem2CandidateFactors: { rowGcdFactor: gcdRowSums, colGcdFactor: gcdColSums },
    theorem3Rank1Exact: estimatedRank === 1
  };
};

// Mother matrix U_infinity slice: row primes r, cols = [1, q_1, q_2, ...]
export interface MotherMatrixSlice {
  primes: number[];
  headers: number[]; // [1, ...primes]
  cells: Array<Array<{ r: number; c: number; value: number; kind: 'PRIME' | 'SEMIPRIME' | 'SQUARE' | 'MIRROR_ZERO' }>>;
}

export const buildMotherMatrixSlice = (count = 10, mode: 'triangular' | 'dual' = 'triangular'): MotherMatrixSlice => {
  const primes: number[] = [];
  let candidate = 2;
  while (primes.length < count) {
    if (isProbablePrimeBig(BigInt(candidate), 8)) primes.push(candidate);
    candidate++;
  }
  const headers = [1, ...primes];
  const cells = primes.map(r =>
    headers.map(c => {
      if (c === 1) {
        return { r, c, value: r, kind: 'PRIME' as const };
      }
      if (mode === 'triangular' && r > c) {
        return { r, c, value: 0, kind: 'MIRROR_ZERO' as const };
      }
      return {
        r,
        c,
        value: r * c,
        kind: r === c ? ('SQUARE' as const) : ('SEMIPRIME' as const)
      };
    })
  );
  return { primes, headers, cells };
};

export interface GeneratedBlockResult {
  p: number;
  q: number;
  rank: number;
  rows: number;
  cols: number;
  U: number[][];
  V: number[][];
  block: number[][];
  totalSum: number;
  expectedProduct: number;
  sumVerified: boolean;
  actualRank: number;
  rowSums: number[];
  colSums: number[];
  gcdRowSums: number;
  gcdColSums: number;
}

// Deterministic seeded PRNG for reproducible academic blocks
const createSeededRng = (seed: number) => {
  let s = (seed >>> 0) || 1337;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

// Partition integer targetTotal across count entries randomly with exact sum === targetTotal
const partitionIntegerExact = (targetTotal: number, count: number, rand: () => number): number[] => {
  if (count <= 1) return [targetTotal];
  const weights = Array.from({ length: count }, () => 0.25 + rand());
  const wSum = weights.reduce((a, b) => a + b, 0);
  const out = weights.map(w => Math.floor((w / wSum) * targetTotal));
  let remainder = targetTotal - out.reduce((a, b) => a + b, 0);
  let idx = 0;
  while (remainder > 0) {
    out[idx % count] += 1;
    remainder--;
    idx++;
  }
  while (remainder < 0) {
    if (out[idx % count] > 0) {
      out[idx % count] -= 1;
      remainder++;
    }
    idx++;
  }
  return out;
};

export const buildBlockMpq = (
  pInput: number,
  qInput: number,
  rank = 1,
  rowsOpt?: number,
  colsOpt?: number,
  seed = 42
): GeneratedBlockResult => {
  const p = Math.max(2, Math.round(pInput));
  const q = Math.max(2, Math.round(qInput));
  const requestedRank = Math.max(1, Math.min(6, Math.round(rank)));
  const rows = rowsOpt ?? Math.max(requestedRank + 1, Math.min(8, Math.ceil(Math.sqrt(p)) + 1));
  const cols = colsOpt ?? Math.max(requestedRank + 1, Math.min(8, Math.ceil(Math.sqrt(q)) + 1));
  const r = Math.min(requestedRank, rows, cols);

  const rand = createSeededRng(seed + p * 31 + q * 97 + r * 7);
  const u0 = partitionIntegerExact(p, rows, rand);
  const v0 = partitionIntegerExact(q, cols, rand);

  // Build U (rows x r) and V (cols x r):
  // Column 0 sums to p (resp. q); columns k >= 1 lie in the zero-sum hyperplane (1^T u = 0, 1^T v = 0)
  // guaranteeing exact sum(U V^T) == p*q, exact row/col GCDs, and exact rank == r.
  const U: number[][] = Array.from({ length: rows }, (_, i) => [u0[i]]);
  const V: number[][] = Array.from({ length: cols }, (_, j) => [v0[j]]);

  for (let k = 1; k < r; k++) {
    const scaleU = Math.max(1, Math.round(1 + rand() * 2));
    const scaleV = Math.max(1, Math.round(1 + rand() * 2));
    const uLayer = new Array(rows).fill(0);
    const vLayer = new Array(cols).fill(0);
    const ui = (k - 1) % (rows - 1);
    const vj = (k - 1) % (cols - 1);
    uLayer[ui] += scaleU;
    uLayer[rows - 1] -= scaleU;
    vLayer[vj] += scaleV;
    vLayer[cols - 1] -= scaleV;
    for (let i = 0; i < rows; i++) U[i].push(uLayer[i]);
    for (let j = 0; j < cols; j++) V[j].push(vLayer[j]);
  }

  const block: number[][] = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => {
      let s = 0;
      for (let k = 0; k < r; k++) s += U[i][k] * V[j][k];
      return s;
    })
  );

  const rowSums = block.map(row => row.reduce((a, b) => a + b, 0));
  const colSums = Array.from({ length: cols }, (_, j) =>
    block.reduce((acc, row) => acc + row[j], 0)
  );
  const totalSum = rowSums.reduce((a, b) => a + b, 0);
  const expectedProduct = p * q;

  return {
    p,
    q,
    rank: r,
    rows,
    cols,
    U,
    V,
    block,
    totalSum,
    expectedProduct,
    sumVerified: totalSum === expectedProduct,
    actualRank: computeMatrixRank(block),
    rowSums,
    colSums,
    gcdRowSums: gcdArray(rowSums),
    gcdColSums: gcdArray(colSums)
  };
};

export interface DirectSumSlice {
  matrix: number[][];
  blocksMeta: Array<{ p: number; q: number; rowOffset: number; colOffset: number; rows: number; cols: number; sum: number }>;
  totalSum: number;
}

export const buildInfiniteDirectSumSlice = (pairs: Array<[number, number]>, rank = 1, seed = 42): DirectSumSlice => {
  const minDim = Math.max(3, rank + 1);
  const generated = pairs.map(([p, q], idx) => buildBlockMpq(p, q, rank, minDim, minDim, seed + idx * 17));
  const totalRows = generated.reduce((a, g) => a + g.rows, 0);
  const totalCols = generated.reduce((a, g) => a + g.cols, 0);
  const matrix: number[][] = Array.from({ length: totalRows }, () => new Array(totalCols).fill(0));
  const blocksMeta: DirectSumSlice['blocksMeta'] = [];

  let rOff = 0;
  let cOff = 0;
  for (const g of generated) {
    for (let i = 0; i < g.rows; i++) {
      for (let j = 0; j < g.cols; j++) {
        matrix[rOff + i][cOff + j] = g.block[i][j];
      }
    }
    blocksMeta.push({
      p: g.p,
      q: g.q,
      rowOffset: rOff,
      colOffset: cOff,
      rows: g.rows,
      cols: g.cols,
      sum: g.totalSum
    });
    rOff += g.rows;
    cOff += g.cols;
  }

  return {
    matrix,
    blocksMeta,
    totalSum: blocksMeta.reduce((acc, b) => acc + b.sum, 0)
  };
};

export const generatePythonBlockCode = (p: number, q: number, rank = 1, seed = 42): string => `import numpy as np

def build_block(p, q, r=${rank}, seed=${seed}):
    """بناء الكتلة M_{p,q} برتبة r مع الحفاظ التام على sum(M_{p,q}) == p * q."""
    rng = np.random.default_rng(seed)
    m_p = max(r + 1, min(8, int(np.sqrt(p)) + 1))
    n_q = max(r + 1, min(8, int(np.sqrt(q)) + 1))

    def partition(total, k):
        w = rng.uniform(0.25, 1.25, size=k)
        arr = np.floor((w / w.sum()) * total).astype(int)
        arr[0] += total - arr.sum()
        return arr

    U = np.zeros((m_p, r), dtype=int)
    V = np.zeros((n_q, r), dtype=int)
    U[:, 0] = partition(p, m_p)
    V[:, 0] = partition(q, n_q)

    # أعمدة مجموعها صفري لضبط الرتبة r مع ثبات المجموع الكلي عند p*q
    for k in range(1, r):
        su = int(rng.integers(1, 4))
        sv = int(rng.integers(1, 4))
        U[(k - 1) % (m_p - 1), k] += su
        U[-1, k] -= su
        V[(k - 1) % (n_q - 1), k] += sv
        V[-1, k] -= sv

    M_pq = U @ V.T
    assert M_pq.sum() == p * q
    return M_pq

M_pq = build_block(${p}, ${q}, r=${rank}, seed=${seed})
print("M_${p}_${q} shape:", M_pq.shape, "rank:", np.linalg.matrix_rank(M_pq), "sum:", M_pq.sum(), "expected:", ${p * q})`;
