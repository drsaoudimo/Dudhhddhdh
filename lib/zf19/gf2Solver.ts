/**
 * Exact GF(2) Gaussian Elimination over rows M (n_rows x n_cols).
 * Solves c * M = 0 (mod 2), returning linearly independent dependency row-index subsets.
 */
export const solveGf2GaussianDependencies = (gf2Rows: number[][]): number[][] => {
  const numRows = gf2Rows.length;
  if (numRows === 0) return [];
  const numCols = gf2Rows[0].length;
  if (numCols === 0) return [];

  const matWords = Math.ceil(numCols / 32);
  const histWords = Math.ceil(numRows / 32);

  const mat: Uint32Array[] = new Array(numRows);
  const hist: Uint32Array[] = new Array(numRows);

  for (let r = 0; r < numRows; r++) {
    const mRow = new Uint32Array(matWords);
    const hRow = new Uint32Array(histWords);
    const row = gf2Rows[r];
    for (let c = 0; c < numCols; c++) {
      if ((row[c] & 1) === 1) {
        mRow[c >>> 5] |= 1 << (c & 31);
      }
    }
    hRow[r >>> 5] |= 1 << (r & 31);
    mat[r] = mRow;
    hist[r] = hRow;
  }

  let pivotRow = 0;
  for (let col = 0; col < numCols && pivotRow < numRows; col++) {
    const wIdx = col >>> 5;
    const mask = 1 << (col & 31);
    let sel = -1;
    for (let r = pivotRow; r < numRows; r++) {
      if ((mat[r][wIdx] & mask) !== 0) {
        sel = r;
        break;
      }
    }
    if (sel === -1) continue;
    if (sel !== pivotRow) {
      [mat[pivotRow], mat[sel]] = [mat[sel], mat[pivotRow]];
      [hist[pivotRow], hist[sel]] = [hist[sel], hist[pivotRow]];
    }
    const pMat = mat[pivotRow];
    const pHist = hist[pivotRow];
    for (let r = 0; r < numRows; r++) {
      if (r !== pivotRow && (mat[r][wIdx] & mask) !== 0) {
        const rMat = mat[r];
        const rHist = hist[r];
        for (let w = 0; w < matWords; w++) rMat[w] ^= pMat[w];
        for (let w = 0; w < histWords; w++) rHist[w] ^= pHist[w];
      }
    }
    pivotRow++;
  }

  const dependencies: number[][] = [];
  for (let r = 0; r < numRows; r++) {
    let isZero = true;
    for (let w = 0; w < matWords; w++) {
      if (mat[r][w] !== 0) {
        isZero = false;
        break;
      }
    }
    if (isZero) {
      const subset: number[] = [];
      const hRow = hist[r];
      for (let w = 0; w < histWords; w++) {
        let word = hRow[w];
        while (word !== 0) {
          const lsb = word & -word;
          const bit = Math.clz32(lsb) ^ 31;
          const idx = (w << 5) + bit;
          if (idx < numRows) subset.push(idx);
          word ^= lsb;
        }
      }
      if (subset.length > 0) dependencies.push(subset);
    }
  }

  return dependencies;
};
