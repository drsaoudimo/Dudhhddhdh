// Unified Wasm32 Unrolled Montgomery-REDC Arithmetic Kernel + Auto Suyama/Montgomery ECM Stage 1+2 (B2)
// Shared between main-thread MPQS/GF(2) solver and all >500-bit Web Workers.

export type RedcBackend = 'wasm-cios-unrolled' | 'wasm-cios-loop' | 'bigint-redc' | 'native';
export type EcmCurveFamily = 'suyama' | 'montgomery';

export interface RedcBenchmarkResult {
  active: boolean;
  backend: RedcBackend;
  nBits: number;
  speedupPct: number;
  redcNsPerMul: number;
  naiveNsPerMul: number;
  source: 'gf2-solver' | 'web-worker';
  opsPerSec: number;
}

export interface AutoCurveDecision {
  curveFamily: EcmCurveFamily;
  autoSwitchReason: string;
}

export interface MontgomeryRedcCtx {
  N: bigint;
  bits: number;
  kLimbs: number;
  backend: RedcBackend;
  oneM: bigint;
  twoM: bigint;
  toMont(x: bigint): bigint;
  fromMont(xM: bigint): bigint;
  montMul(aM: bigint, bM: bigint): bigint;
  montSqr(aM: bigint): bigint;
  montAdd(aM: bigint, bM: bigint): bigint;
  montSub(aM: bigint, bM: bigint): bigint;
  montPow(baseM: bigint, exp: bigint): bigint;
  ecLadder(k: number, bxM: bigint, bzM: bigint, a24M: bigint): [bigint, bigint];
  ecStage1Primes(
    primes: number[],
    xM: bigint,
    zM: bigint,
    a24M: bigint,
    b1: number,
    gcdFn: (a: bigint, b: bigint) => bigint
  ): { factor: bigint | null; xM: bigint; zM: bigint };
  montMulSlot(aSlot: number, bSlot: number, outSlot: number): void;
  montSqrSlot(aSlot: number, outSlot: number): void;
  writeSlot(slot: number, val: bigint): void;
  readSlot(slot: number): bigint;
  getRawWasmExports(): {
    montMulPtr: (aPtr: number, bPtr: number, outPtr: number) => void;
    montSqrPtr: (aPtr: number, outPtr: number) => void;
    batchMulPtr?: (aPtr: number, bPtr: number, nIters: number) => void;
    slotPtr: (slot: number) => number;
  } | null;
}

/**
 * Pure automatic curve family selector based strictly on N bit-length & ECM Stage 2 (B2) bound.
 * - Suyama (Z/12Z torsion): selected for N <= 500 bits with B2 < 450,000 (dense low-B1 torsion).
 * - Direct Montgomery (a24 parameterized torsion family): auto-switched when N > 500 bits or B2 >= 450,000.
 */
export const selectAutoCurveFamily = (
  nBits: number,
  b2Bound: number
): AutoCurveDecision => {
  if (nBits > 500 && b2Bound >= 450000) {
    return {
      curveFamily: 'montgomery',
      autoSwitchReason: `N > 500b (${nBits}b) & B2 ≥ 450k → Montgomery`
    };
  }
  if (nBits > 500) {
    return {
      curveFamily: 'montgomery',
      autoSwitchReason: `N > 500b (${nBits}b) → Montgomery`
    };
  }
  if (b2Bound >= 450000) {
    return {
      curveFamily: 'montgomery',
      autoSwitchReason: `B2 ≥ 450k (${Math.round(b2Bound / 1000)}k) → Montgomery`
    };
  }
  return {
    curveFamily: 'suyama',
    autoSwitchReason: `N ≤ 500b (${nBits}b) & B2 < 450k → Suyama`
  };
};

// --- Plain JS Self-Contained Wasm32 Montgomery-REDC + ECM Stage 1+2 Worker Kernel ---
// Exported as a string so both TS runtime and Worker Blobs execute identical bytecode synthesis.

const WORKER_MONT_REDC_JS = `
  const buildMontgomeryWasmCore = (N) => {
    const bits = N.toString(2).length;
    const K = Math.max(2, Math.ceil(bits / 32));
    const stride = K * 4;
    const useUnrolled = K <= 40; // Up to 1280-bit fully unrolled in Wasm i64 locals

    // Compute n0Prime = -N^{-1} mod 2^32 using 5-step Hensel lifting
    const n0 = N & 0xffffffffn;
    let inv32 = 1n;
    for (let step = 0; step < 5; step++) {
      inv32 = (inv32 * (2n - n0 * inv32)) & 0xffffffffn;
    }
    const n0Prime = (0x100000000n - inv32) & 0xffffffffn;

    // LEB128 encoders
    const u32Enc = (out, v) => {
      let x = v >>> 0;
      do {
        let byte = x & 0x7f;
        x >>>= 7;
        if (x !== 0) byte |= 0x80;
        out.push(byte);
      } while (x !== 0);
    };
    const s64Enc = (out, vBig) => {
      let x = BigInt(vBig);
      while (true) {
        const byte = Number(x & 0x7fn);
        x >>= 7n;
        const signSet = (byte & 0x40) !== 0;
        if ((x === 0n && !signSet) || (x === -1n && signSet)) {
          out.push(byte);
          break;
        }
        out.push(byte | 0x80);
      }
    };
    const section = (id, payload) => {
      const s = [id];
      u32Enc(s, payload.length);
      for (let i = 0; i < payload.length; i++) s.push(payload[i]);
      return s;
    };

    // Opcodes
    const I32 = 0x7f, I64 = 0x7e;
    const END = 0x0b, BR = 0x0c, BR_IF = 0x0d, CALL = 0x10, DROP = 0x1a;
    const IF = 0x04, ELSE = 0x05, BLOCK = 0x02, LOOP = 0x03, VOID = 0x40;
    const LGET = 0x20, LSET = 0x21, LTEE = 0x22;
    const I64_LOAD32_U = 0x35, I64_STORE32 = 0x3e, I32_LOAD = 0x28;
    const I32_CONST = 0x41, I64_CONST = 0x42;
    const I32_EQZ = 0x45, I32_EQ = 0x46, I32_LT_U = 0x49, I32_GE_U = 0x4f, I32_GE_S = 0x4e;
    const I32_ADD = 0x6a, I32_SUB = 0x6b, I32_MUL = 0x6c, I32_SHL = 0x74, I32_SHR_U = 0x76, I32_AND = 0x71;
    const I64_EQZ = 0x50, I64_LT_U = 0x53, I64_GE_S = 0x57, I64_GE_U = 0x59;
    const I64_ADD = 0x7c, I64_SUB = 0x7d, I64_MUL = 0x7e, I64_AND = 0x83, I64_OR = 0x84, I64_SHL = 0x86, I64_SHR_U = 0x88;
    const I32_WRAP_I64 = 0xa7, I64_EXTEND_I32_U = 0xad;

    const pushLocalGet = (b, idx) => { b.push(LGET); u32Enc(b, idx); };
    const pushLocalSet = (b, idx) => { b.push(LSET); u32Enc(b, idx); };
    const pushLocalTee = (b, idx) => { b.push(LTEE); u32Enc(b, idx); };
    const pushI32Const = (b, v) => { b.push(I32_CONST); s64Enc(b, BigInt(v | 0)); };
    const pushI64Const = (b, v) => { b.push(I64_CONST); s64Enc(b, v); };
    const pushLoad32 = (b, baseLocal, off) => {
      pushLocalGet(b, baseLocal);
      b.push(I64_LOAD32_U, 0x02);
      u32Enc(b, off);
    };
    const pushLoad32ConstAddr = (b, addr) => {
      pushI32Const(b, addr);
      b.push(I64_LOAD32_U, 0x02);
      u32Enc(b, 0);
    };
    const pushStore32 = (b, baseLocal, off, emitVal) => {
      pushLocalGet(b, baseLocal);
      emitVal(b);
      b.push(I64_STORE32, 0x02);
      u32Enc(b, off);
    };

    const I64_STORE = 0x37;

    // Memory map:
    // 0 .. stride-1           : N
    // stride .. 2*stride-1    : ONE_M
    // 2*stride .. 3*stride-1  : TWO_M
    // 3*stride .. 5*stride-1  : T_SCRATCH (for FIOS REDC accumulator, K+2 limbs)
    // 6*stride ..             : WORK SLOTS (slot s at (6 + s) * stride)
    const N_PTR = 0;
    const ONE_PTR = stride;
    const TWO_PTR = stride * 2;
    const T_SCRATCH_PTR = stride * 3;
    const slotAddr = (s) => (6 + s) * stride;

    // Function indices:
    // 0: montMul(aPtr, bPtr, outPtr)   [Single-pass 4x-unrolled FIOS REDC]
    // 1: montSqr(aPtr, outPtr)         [Calls montMul(aPtr, aPtr, outPtr)]
    // 2: montAdd(aPtr, bPtr, outPtr)
    // 3: montSub(aPtr, bPtr, outPtr)
    // 4: ecDiffAdd(x1, z1, x0, z0, bx, bz, outX, outZ)
    // 5: ecDouble(px, pz, a24, outX, outZ)
    // 6: ecLadder(k, bx, bz, a24, outX, outZ)
    // 7: ecStage1Batch(primesPtr, count, xSlotPtr, zSlotPtr, a24Ptr, accZPtr) -> i32
    // 8: batchMul(aPtr, bPtr, nIters) -> void

    // Helper: emit conditional subtract N in locals t[0..K-1], carry tK -> store to outPtr
    const emitLocalCondSubAndStore = (b, outPtrLocal, tBase, tKLocal, dBase, borrowLocal, tmpLocal) => {
      // Compute d[j] = (t[j] - N[j] - borrow) & 0xffffffff; borrow = ((t[j] - N[j] - borrow) >>> 32) & 1
      pushI64Const(b, 0n);
      pushLocalSet(b, borrowLocal);
      for (let j = 0; j < K; j++) {
        pushLocalGet(b, tBase + j);
        pushLoad32ConstAddr(b, N_PTR + j * 4);
        b.push(I64_SUB);
        pushLocalGet(b, borrowLocal);
        b.push(I64_SUB);
        pushLocalTee(b, tmpLocal);
        pushI64Const(b, 0xffffffffn);
        b.push(I64_AND);
        pushLocalSet(b, dBase + j);

        pushLocalGet(b, tmpLocal);
        pushI64Const(b, 32n);
        b.push(I64_SHR_U);
        pushI64Const(b, 1n);
        b.push(I64_AND);
        pushLocalSet(b, borrowLocal);
      }
      // If tK >= borrow (i.e. t >= N), store d; else store t
      pushLocalGet(b, tKLocal);
      pushLocalGet(b, borrowLocal);
      b.push(I64_GE_U);
      b.push(IF, VOID);
      for (let j = 0; j < K; j++) {
        pushStore32(b, outPtrLocal, j * 4, (bb) => pushLocalGet(bb, dBase + j));
      }
      b.push(ELSE);
      for (let j = 0; j < K; j++) {
        pushStore32(b, outPtrLocal, j * 4, (bb) => pushLocalGet(bb, tBase + j));
      }
      b.push(END);
    };

    // Build Fn 0: Single-Pass 4x-Unrolled FIOS montMul(aPtr=0, bPtr=1, outPtr=2)
    // Bytecode size ~900 bytes for ALL bit sizes -> guarantees V8 TurboFan compilation + zero register spills!
    const buildFnMontMulFios = () => {
      const body = [];
      // Locals: i32 (iPtr=3, jOff=4, bCur=5, iEnd=6), i64 (ai=7, m=8, c1=9, c2=10, prod=11, tNew=12)
      // Zero T_SCRATCH[0..K+1] using 8-byte i64.store
      pushI32Const(body, 0);
      pushLocalSet(body, 4);
      body.push(LOOP, VOID);
        pushI32Const(body, T_SCRATCH_PTR);
        pushLocalGet(body, 4);
        body.push(I32_ADD);
        pushI64Const(body, 0n);
        body.push(I64_STORE, 0x03, 0x00);
        pushLocalGet(body, 4);
        pushI32Const(body, 8);
        body.push(I32_ADD);
        pushLocalTee(body, 4);
        pushI32Const(body, (K + 2) * 4);
        body.push(I32_LT_U, BR_IF, 0x00);
      body.push(END);

      // iPtr = aPtr; iEnd = aPtr + stride
      pushLocalGet(body, 0);
      pushLocalTee(body, 3);
      pushI32Const(body, stride);
      body.push(I32_ADD);
      pushLocalSet(body, 6);

      const rem = (K - 1) % 4;
      const emitConstJ = (jByte) => {
        pushI32Const(body, T_SCRATCH_PTR + jByte - 4);
        pushLoad32ConstAddr(body, T_SCRATCH_PTR + jByte);
        pushLocalGet(body, 7);
        pushLoad32(body, 1, jByte);
        body.push(I64_MUL, I64_ADD);
        pushLocalGet(body, 9);
        body.push(I64_ADD);
        pushLocalTee(body, 11);
        pushI64Const(body, 0xffffffffn);
        body.push(I64_AND);
        pushLocalSet(body, 12);
        pushLocalGet(body, 11);
        pushI64Const(body, 32n);
        body.push(I64_SHR_U);
        pushLocalSet(body, 9);

        pushLocalGet(body, 12);
        pushLocalGet(body, 8);
        pushLoad32ConstAddr(body, N_PTR + jByte);
        body.push(I64_MUL, I64_ADD);
        pushLocalGet(body, 10);
        body.push(I64_ADD);
        pushLocalTee(body, 11);
        pushI64Const(body, 0xffffffffn);
        body.push(I64_AND);
        body.push(I64_STORE32, 0x02, 0x00);
        pushLocalGet(body, 11);
        pushI64Const(body, 32n);
        body.push(I64_SHR_U);
        pushLocalSet(body, 10);
      };

      const emitLoopJOff = (off) => {
        pushLocalGet(body, 4);
        pushI32Const(body, T_SCRATCH_PTR + off - 4);
        body.push(I32_ADD);

        pushLocalGet(body, 4);
        pushI32Const(body, T_SCRATCH_PTR + off);
        body.push(I32_ADD, I64_LOAD32_U, 0x02, 0x00);
        pushLocalGet(body, 7);
        pushLoad32(body, 5, off);
        body.push(I64_MUL, I64_ADD);
        pushLocalGet(body, 9);
        body.push(I64_ADD);
        pushLocalTee(body, 11);
        pushI64Const(body, 0xffffffffn);
        body.push(I64_AND);
        pushLocalSet(body, 12);
        pushLocalGet(body, 11);
        pushI64Const(body, 32n);
        body.push(I64_SHR_U);
        pushLocalSet(body, 9);

        pushLocalGet(body, 12);
        pushLocalGet(body, 8);
        pushLocalGet(body, 4);
        pushI32Const(body, N_PTR + off);
        body.push(I32_ADD, I64_LOAD32_U, 0x02, 0x00);
        body.push(I64_MUL, I64_ADD);
        pushLocalGet(body, 10);
        body.push(I64_ADD);
        pushLocalTee(body, 11);
        pushI64Const(body, 0xffffffffn);
        body.push(I64_AND);
        body.push(I64_STORE32, 0x02, 0x00);
        pushLocalGet(body, 11);
        pushI64Const(body, 32n);
        body.push(I64_SHR_U);
        pushLocalSet(body, 10);
      };

      // Outer loop over a[i]
      body.push(LOOP, VOID);
        pushLoad32(body, 3, 0);
        pushLocalSet(body, 7);

        // j = 0:
        pushLoad32ConstAddr(body, T_SCRATCH_PTR);
        pushLocalGet(body, 7);
        pushLoad32(body, 1, 0);
        body.push(I64_MUL, I64_ADD);
        pushLocalTee(body, 11);
        pushI64Const(body, 0xffffffffn);
        body.push(I64_AND);
        pushLocalTee(body, 12);
        pushI64Const(body, n0Prime);
        body.push(I64_MUL);
        pushI64Const(body, 0xffffffffn);
        body.push(I64_AND);
        pushLocalSet(body, 8);

        pushLocalGet(body, 11);
        pushI64Const(body, 32n);
        body.push(I64_SHR_U);
        pushLocalSet(body, 9);

        pushLocalGet(body, 12);
        pushLocalGet(body, 8);
        pushLoad32ConstAddr(body, N_PTR);
        body.push(I64_MUL, I64_ADD);
        pushI64Const(body, 32n);
        body.push(I64_SHR_U);
        pushLocalSet(body, 10);

        // Remainder j = 1 .. rem
        for (let jj = 1; jj <= rem; jj++) {
          emitConstJ(jj * 4);
        }

        // Main 4x-unrolled j loop for remaining (K - 1 - rem) limbs
        if (1 + rem < K) {
          const startByte = (1 + rem) * 4;
          pushI32Const(body, startByte);
          pushLocalSet(body, 4);
          pushLocalGet(body, 1);
          pushI32Const(body, startByte);
          body.push(I32_ADD);
          pushLocalSet(body, 5);
          body.push(LOOP, VOID);
            for (let u = 0; u < 4; u++) emitLoopJOff(u * 4);
            pushLocalGet(body, 5);
            pushI32Const(body, 16);
            body.push(I32_ADD);
            pushLocalSet(body, 5);
            pushLocalGet(body, 4);
            pushI32Const(body, 16);
            body.push(I32_ADD);
            pushLocalTee(body, 4);
            pushI32Const(body, stride);
            body.push(I32_LT_U, BR_IF, 0x00);
          body.push(END);
        }

        // Final carries -> T[K-1], T[K]
        pushI32Const(body, T_SCRATCH_PTR + stride - 4);
        pushLoad32ConstAddr(body, T_SCRATCH_PTR + stride);
        pushLocalGet(body, 9);
        body.push(I64_ADD);
        pushLocalTee(body, 11);
        pushI64Const(body, 0xffffffffn);
        body.push(I64_AND);
        pushLocalGet(body, 10);
        body.push(I64_ADD);
        pushLocalTee(body, 12);
        pushI64Const(body, 0xffffffffn);
        body.push(I64_AND);
        body.push(I64_STORE32, 0x02, 0x00);

        pushI32Const(body, T_SCRATCH_PTR + stride);
        pushLocalGet(body, 11);
        pushI64Const(body, 32n);
        body.push(I64_SHR_U);
        pushLocalGet(body, 12);
        pushI64Const(body, 32n);
        body.push(I64_SHR_U, I64_ADD);
        body.push(I64_STORE32, 0x02, 0x00);

        pushLocalGet(body, 3);
        pushI32Const(body, 4);
        body.push(I32_ADD);
        pushLocalTee(body, 3);
        pushLocalGet(body, 6);
        body.push(I32_LT_U, BR_IF, 0x00);
      body.push(END);

      // Final conditional subtract T - N -> outPtr
      pushI64Const(body, 0n);
      pushLocalSet(body, 9); // borrow
      pushI32Const(body, 0);
      pushLocalSet(body, 4);
      body.push(LOOP, VOID);
        pushLocalGet(body, 2);
        pushLocalGet(body, 4);
        body.push(I32_ADD);
        pushI32Const(body, T_SCRATCH_PTR);
        pushLocalGet(body, 4);
        body.push(I32_ADD, I64_LOAD32_U, 0x02, 0x00);
        pushI32Const(body, N_PTR);
        pushLocalGet(body, 4);
        body.push(I32_ADD, I64_LOAD32_U, 0x02, 0x00, I64_SUB);
        pushLocalGet(body, 9);
        body.push(I64_SUB);
        pushLocalTee(body, 11);
        pushI64Const(body, 0xffffffffn);
        body.push(I64_AND, I64_STORE32, 0x02, 0x00);
        pushLocalGet(body, 11);
        pushI64Const(body, 32n);
        body.push(I64_SHR_U);
        pushI64Const(body, 1n);
        body.push(I64_AND);
        pushLocalSet(body, 9);
        pushLocalGet(body, 4);
        pushI32Const(body, 4);
        body.push(I32_ADD);
        pushLocalTee(body, 4);
        pushI32Const(body, stride);
        body.push(I32_LT_U, BR_IF, 0x00);
      body.push(END);

      pushLoad32ConstAddr(body, T_SCRATCH_PTR + stride);
      pushLocalGet(body, 9);
      body.push(I64_LT_U, IF, VOID);
        pushI32Const(body, 0);
        pushLocalSet(body, 4);
        body.push(LOOP, VOID);
          pushLocalGet(body, 2);
          pushLocalGet(body, 4);
          body.push(I32_ADD);
          pushI32Const(body, T_SCRATCH_PTR);
          pushLocalGet(body, 4);
          body.push(I32_ADD, I64_LOAD32_U, 0x02, 0x00, I64_STORE32, 0x02, 0x00);
          pushLocalGet(body, 4);
          pushI32Const(body, 4);
          body.push(I32_ADD);
          pushLocalTee(body, 4);
          pushI32Const(body, stride);
          body.push(I32_LT_U, BR_IF, 0x00);
        body.push(END);
      body.push(END);
      body.push(END);

      const b = [];
      u32Enc(b, 2);
      u32Enc(b, 4); b.push(I32);
      u32Enc(b, 6); b.push(I64);
      for (let i = 0; i < body.length; i++) b.push(body[i]);
      return b;
    };

    const buildFnBatchMul = () => {
      const b = [];
      u32Enc(b, 1);
      u32Enc(b, 1); b.push(I32);
      pushI32Const(b, 0);
      pushLocalSet(b, 3);
      b.push(LOOP, VOID);
        pushLocalGet(b, 0);
        pushLocalGet(b, 1);
        pushLocalGet(b, 0);
        b.push(CALL); u32Enc(b, 0);
        pushLocalGet(b, 3);
        pushI32Const(b, 1);
        b.push(I32_ADD);
        pushLocalTee(b, 3);
        pushLocalGet(b, 2);
        b.push(I32_LT_U, BR_IF, 0x00);
      b.push(END, END);
      return b;
    };

    // Build Fn 2: montAdd(aPtr=0, bPtr=1, outPtr=2) - unrolled for speed
    const buildFnMontAdd = () => {
      const b = [];
      if (useUnrolled) {
        const sBase = 3;
        const dBase = sBase + K;
        const cLoc = dBase + K;
        const tmpLoc = cLoc + 1;
        const body = [];
        pushI64Const(body, 0n);
        pushLocalSet(body, cLoc);
        for (let j = 0; j < K; j++) {
          pushLoad32(body, 0, j * 4);
          pushLoad32(body, 1, j * 4);
          body.push(I64_ADD);
          pushLocalGet(body, cLoc);
          body.push(I64_ADD);
          pushLocalTee(body, tmpLoc);
          pushI64Const(body, 0xffffffffn);
          body.push(I64_AND);
          pushLocalSet(body, sBase + j);
          pushLocalGet(body, tmpLoc);
          pushI64Const(body, 32n);
          body.push(I64_SHR_U);
          pushLocalSet(body, cLoc);
        }
        // Top carry in cLoc
        const topCarryLoc = cLoc + 2;
        pushLocalGet(body, cLoc);
        pushLocalSet(body, topCarryLoc);
        emitLocalCondSubAndStore(body, 2, sBase, topCarryLoc, dBase, cLoc, tmpLoc);
        body.push(END);
        u32Enc(b, 1);
        u32Enc(b, 2 * K + 3);
        b.push(I64);
        for (let i = 0; i < body.length; i++) b.push(body[i]);
        return b;
      }

      // Loop fallback montAdd(a=0, b=1, out=2)
      const body = [];
      pushI64Const(body, 0n);
      pushLocalSet(body, 4); // c
      pushI32Const(body, 0);
      pushLocalSet(body, 3); // j
      body.push(LOOP, VOID);
      pushI32Const(body, T_SCRATCH_PTR);
      pushLocalGet(body, 3);
      pushI32Const(body, 2);
      body.push(I32_SHL, I32_ADD);
      pushLocalGet(body, 0);
      pushLocalGet(body, 3);
      pushI32Const(body, 2);
      body.push(I32_SHL, I32_ADD, I64_LOAD32_U, 0x02, 0x00);
      pushLocalGet(body, 1);
      pushLocalGet(body, 3);
      pushI32Const(body, 2);
      body.push(I32_SHL, I32_ADD, I64_LOAD32_U, 0x02, 0x00);
      body.push(I64_ADD);
      pushLocalGet(body, 4);
      body.push(I64_ADD);
      pushLocalTee(body, 5);
      pushI64Const(body, 0xffffffffn);
      body.push(I64_AND, I64_STORE32, 0x02, 0x00);
      pushLocalGet(body, 5);
      pushI64Const(body, 32n);
      body.push(I64_SHR_U);
      pushLocalSet(body, 4);
      pushLocalGet(body, 3);
      pushI32Const(body, 1);
      body.push(I32_ADD);
      pushLocalTee(body, 3);
      pushI32Const(body, K);
      body.push(I32_LT_U, BR_IF, 0x00, END);

      // Subtract N into outPtr with borrow in local 6
      pushI64Const(body, 0n);
      pushLocalSet(body, 6);
      pushI32Const(body, 0);
      pushLocalSet(body, 3);
      body.push(LOOP, VOID);
      pushLocalGet(body, 2);
      pushLocalGet(body, 3);
      pushI32Const(body, 2);
      body.push(I32_SHL, I32_ADD);
      pushI32Const(body, T_SCRATCH_PTR);
      pushLocalGet(body, 3);
      pushI32Const(body, 2);
      body.push(I32_SHL, I32_ADD, I64_LOAD32_U, 0x02, 0x00);
      pushI32Const(body, N_PTR);
      pushLocalGet(body, 3);
      pushI32Const(body, 2);
      body.push(I32_SHL, I32_ADD, I64_LOAD32_U, 0x02, 0x00);
      body.push(I64_SUB);
      pushLocalGet(body, 6);
      body.push(I64_SUB);
      pushLocalTee(body, 5);
      pushI64Const(body, 0xffffffffn);
      body.push(I64_AND, I64_STORE32, 0x02, 0x00);
      pushLocalGet(body, 5);
      pushI64Const(body, 32n);
      body.push(I64_SHR_U);
      pushI64Const(body, 1n);
      body.push(I64_AND);
      pushLocalSet(body, 6);
      pushLocalGet(body, 3);
      pushI32Const(body, 1);
      body.push(I32_ADD);
      pushLocalTee(body, 3);
      pushI32Const(body, K);
      body.push(I32_LT_U, BR_IF, 0x00, END);

      pushLocalGet(body, 4);
      pushLocalGet(body, 6);
      body.push(I64_LT_U, IF, VOID);
      pushI32Const(body, 0);
      pushLocalSet(body, 3);
      body.push(LOOP, VOID);
      pushLocalGet(body, 2);
      pushLocalGet(body, 3);
      pushI32Const(body, 2);
      body.push(I32_SHL, I32_ADD);
      pushI32Const(body, T_SCRATCH_PTR);
      pushLocalGet(body, 3);
      pushI32Const(body, 2);
      body.push(I32_SHL, I32_ADD, I64_LOAD32_U, 0x02, 0x00);
      body.push(I64_STORE32, 0x02, 0x00);
      pushLocalGet(body, 3);
      pushI32Const(body, 1);
      body.push(I32_ADD);
      pushLocalTee(body, 3);
      pushI32Const(body, K);
      body.push(I32_LT_U, BR_IF, 0x00, END);
      body.push(END, END);

      u32Enc(b, 2);
      u32Enc(b, 1); b.push(I32);
      u32Enc(b, 3); b.push(I64);
      for (let i = 0; i < body.length; i++) b.push(body[i]);
      return b;
    };

    // Build Fn 3: montSub(aPtr=0, bPtr=1, outPtr=2) = (a - b) mod N
    const buildFnMontSub = () => {
      const b = [];
      if (useUnrolled) {
        const dBase = 3;
        const borrowLoc = dBase + K;
        const tmpLoc = borrowLoc + 1;
        const cLoc = borrowLoc + 2;
        const body = [];
        pushI64Const(body, 0n);
        pushLocalSet(body, borrowLoc);
        for (let j = 0; j < K; j++) {
          pushLoad32(body, 0, j * 4);
          pushLoad32(body, 1, j * 4);
          body.push(I64_SUB);
          pushLocalGet(body, borrowLoc);
          body.push(I64_SUB);
          pushLocalTee(body, tmpLoc);
          pushI64Const(body, 0xffffffffn);
          body.push(I64_AND);
          pushLocalSet(body, dBase + j);
          pushLocalGet(body, tmpLoc);
          pushI64Const(body, 32n);
          body.push(I64_SHR_U);
          pushI64Const(body, 1n);
          body.push(I64_AND);
          pushLocalSet(body, borrowLoc);
        }
        pushLocalGet(body, borrowLoc);
        body.push(I64_EQZ, IF, VOID);
        for (let j = 0; j < K; j++) {
          pushStore32(body, 2, j * 4, (bb) => pushLocalGet(bb, dBase + j));
        }
        body.push(ELSE);
        pushI64Const(body, 0n);
        pushLocalSet(body, cLoc);
        for (let j = 0; j < K; j++) {
          pushLocalGet(body, dBase + j);
          pushLoad32ConstAddr(body, N_PTR + j * 4);
          body.push(I64_ADD);
          pushLocalGet(body, cLoc);
          body.push(I64_ADD);
          pushLocalTee(body, tmpLoc);
          pushI64Const(body, 0xffffffffn);
          body.push(I64_AND);
          pushLocalSet(body, dBase + j);
          pushLocalGet(body, tmpLoc);
          pushI64Const(body, 32n);
          body.push(I64_SHR_U);
          pushLocalSet(body, cLoc);
          pushStore32(body, 2, j * 4, (bb) => pushLocalGet(bb, dBase + j));
        }
        body.push(END, END);
        u32Enc(b, 1);
        u32Enc(b, K + 3);
        b.push(I64);
        for (let i = 0; i < body.length; i++) b.push(body[i]);
        return b;
      }

      const body = [];
      pushI64Const(body, 0n);
      pushLocalSet(body, 4); // borrow
      pushI32Const(body, 0);
      pushLocalSet(body, 3);
      body.push(LOOP, VOID);
      pushLocalGet(body, 2);
      pushLocalGet(body, 3);
      pushI32Const(body, 2);
      body.push(I32_SHL, I32_ADD);
      pushLocalGet(body, 0);
      pushLocalGet(body, 3);
      pushI32Const(body, 2);
      body.push(I32_SHL, I32_ADD, I64_LOAD32_U, 0x02, 0x00);
      pushLocalGet(body, 1);
      pushLocalGet(body, 3);
      pushI32Const(body, 2);
      body.push(I32_SHL, I32_ADD, I64_LOAD32_U, 0x02, 0x00);
      body.push(I64_SUB);
      pushLocalGet(body, 4);
      body.push(I64_SUB);
      pushLocalTee(body, 5);
      pushI64Const(body, 0xffffffffn);
      body.push(I64_AND, I64_STORE32, 0x02, 0x00);
      pushLocalGet(body, 5);
      pushI64Const(body, 32n);
      body.push(I64_SHR_U);
      pushI64Const(body, 1n);
      body.push(I64_AND);
      pushLocalSet(body, 4);
      pushLocalGet(body, 3);
      pushI32Const(body, 1);
      body.push(I32_ADD);
      pushLocalTee(body, 3);
      pushI32Const(body, K);
      body.push(I32_LT_U, BR_IF, 0x00, END);

      pushLocalGet(body, 4);
      body.push(I64_EQZ, IF, VOID, ELSE);
      pushI64Const(body, 0n);
      pushLocalSet(body, 4); // carry
      pushI32Const(body, 0);
      pushLocalSet(body, 3);
      body.push(LOOP, VOID);
      pushLocalGet(body, 2);
      pushLocalGet(body, 3);
      pushI32Const(body, 2);
      body.push(I32_SHL, I32_ADD);
      pushLocalGet(body, 2);
      pushLocalGet(body, 3);
      pushI32Const(body, 2);
      body.push(I32_SHL, I32_ADD, I64_LOAD32_U, 0x02, 0x00);
      pushI32Const(body, N_PTR);
      pushLocalGet(body, 3);
      pushI32Const(body, 2);
      body.push(I32_SHL, I32_ADD, I64_LOAD32_U, 0x02, 0x00);
      body.push(I64_ADD);
      pushLocalGet(body, 4);
      body.push(I64_ADD);
      pushLocalTee(body, 5);
      pushI64Const(body, 0xffffffffn);
      body.push(I64_AND, I64_STORE32, 0x02, 0x00);
      pushLocalGet(body, 5);
      pushI64Const(body, 32n);
      body.push(I64_SHR_U);
      pushLocalSet(body, 4);
      pushLocalGet(body, 3);
      pushI32Const(body, 1);
      body.push(I32_ADD);
      pushLocalTee(body, 3);
      pushI32Const(body, K);
      body.push(I32_LT_U, BR_IF, 0x00, END);
      body.push(END, END);

      u32Enc(b, 2);
      u32Enc(b, 1); b.push(I32);
      u32Enc(b, 2); b.push(I64);
      for (let i = 0; i < body.length; i++) b.push(body[i]);
      return b;
    };

    const emitCopyPtr = (b, srcPtr, dstPtr) => {
      for (let j = 0; j < K; j++) {
        b.push(I32_CONST); s64Enc(b, BigInt(dstPtr + j * 4));
        b.push(I32_CONST); s64Enc(b, BigInt(srcPtr + j * 4));
        b.push(I64_LOAD32_U, 0x02); u32Enc(b, 0);
        b.push(I64_STORE32, 0x02); u32Enc(b, 0);
      }
    };
    const emitCopyLocalToConst = (b, srcLocal, dstPtr) => {
      if (useUnrolled) {
        for (let j = 0; j < K; j++) {
          pushI32Const(b, dstPtr + j * 4);
          pushLocalGet(b, srcLocal);
          b.push(I64_LOAD32_U, 0x02); u32Enc(b, j * 4);
          b.push(I64_STORE32, 0x02); u32Enc(b, 0);
        }
      } else {
        // Store via caller temp or loop
        for (let j = 0; j < K; j++) {
          pushI32Const(b, dstPtr + j * 4);
          pushLocalGet(b, srcLocal);
          b.push(I64_LOAD32_U, 0x02); u32Enc(b, j * 4);
          b.push(I64_STORE32, 0x02); u32Enc(b, 0);
        }
      }
    };
    const emitCopyConstToLocal = (b, srcPtr, dstLocal) => {
      for (let j = 0; j < K; j++) {
        pushLocalGet(b, dstLocal);
        pushI32Const(b, srcPtr + j * 4);
        b.push(I64_LOAD32_U, 0x02); u32Enc(b, 0);
        b.push(I64_STORE32, 0x02); u32Enc(b, j * 4);
      }
    };
    const emitZeroConst = (b, dstPtr) => {
      for (let j = 0; j < K; j++) {
        pushI32Const(b, dstPtr + j * 4);
        pushI64Const(b, 0n);
        b.push(I64_STORE32, 0x02); u32Enc(b, 0);
      }
    };
    const emitCall3 = (b, fnIdx, a1, a2, a3) => {
      pushI32Const(b, a1); pushI32Const(b, a2); pushI32Const(b, a3);
      b.push(CALL); u32Enc(b, fnIdx);
    };
    const emitCall2 = (b, fnIdx, a1, a2) => {
      pushI32Const(b, a1); pushI32Const(b, a2);
      b.push(CALL); u32Enc(b, fnIdx);
    };

    const EC_X1 = slotAddr(50);
    const EC_Z1 = slotAddr(51);
    const EC_X0 = slotAddr(52);
    const EC_Z0 = slotAddr(53);
    const EC_BX = slotAddr(54);
    const EC_BZ = slotAddr(55);
    const EC_A24 = slotAddr(56);
    const EC_SA = slotAddr(57);
    const EC_SB = slotAddr(58);
    const EC_SU = slotAddr(59);
    const EC_SV = slotAddr(60);
    const EC_SUM = slotAddr(61);
    const EC_DIF = slotAddr(62);
    const EC_DF = slotAddr(63);
    const EC_AX = slotAddr(64);
    const EC_AZ = slotAddr(65);
    const EC_DX = slotAddr(66);
    const EC_DZ = slotAddr(67);

    // Build Fn 4: ecDiffAdd(x1=0, z1=1, x0=2, z0=3, bx=4, bz=5, outX=6, outZ=7)
    // Uses scratch SA..DF cleanly, writes result safely to outX, outZ even if aliased!
    const buildFnEcDiffAdd = () => {
      const b = [];
      u32Enc(b, 0); // no extra locals
      // sA = x1 - z1; sB = x0 + z0
      pushLocalGet(b, 0); pushLocalGet(b, 1); pushI32Const(b, EC_SA); b.push(CALL); u32Enc(b, 3);
      pushLocalGet(b, 2); pushLocalGet(b, 3); pushI32Const(b, EC_SB); b.push(CALL); u32Enc(b, 2);
      emitCall3(b, 0, EC_SA, EC_SB, EC_SU); // u = sA * sB
      // sA = x1 + z1; sB = x0 - z0
      pushLocalGet(b, 0); pushLocalGet(b, 1); pushI32Const(b, EC_SA); b.push(CALL); u32Enc(b, 2);
      pushLocalGet(b, 2); pushLocalGet(b, 3); pushI32Const(b, EC_SB); b.push(CALL); u32Enc(b, 3);
      emitCall3(b, 0, EC_SA, EC_SB, EC_SV); // v = sA * sB

      emitCall3(b, 2, EC_SU, EC_SV, EC_SUM); // u + v
      emitCall3(b, 3, EC_SU, EC_SV, EC_DIF); // u - v
      emitCall2(b, 1, EC_SUM, EC_SA); // (u+v)^2
      emitCall2(b, 1, EC_DIF, EC_SB); // (u-v)^2

      pushLocalGet(b, 5); pushI32Const(b, EC_SA); pushI32Const(b, EC_AX); b.push(CALL); u32Enc(b, 0); // bz * (u+v)^2
      pushLocalGet(b, 4); pushI32Const(b, EC_SB); pushI32Const(b, EC_AZ); b.push(CALL); u32Enc(b, 0); // bx * (u-v)^2
      // Copy EC_AX -> outX, EC_AZ -> outZ
      for (let j = 0; j < K; j++) {
        pushLocalGet(b, 6);
        pushLoad32ConstAddr(b, EC_AX + j * 4);
        b.push(I64_STORE32, 0x02); u32Enc(b, j * 4);
        pushLocalGet(b, 7);
        pushLoad32ConstAddr(b, EC_AZ + j * 4);
        b.push(I64_STORE32, 0x02); u32Enc(b, j * 4);
      }
      b.push(END);
      return b;
    };

    // Build Fn 5: ecDouble(px=0, pz=1, a24=2, outX=3, outZ=4)
    const buildFnEcDouble = () => {
      const b = [];
      u32Enc(b, 0);
      pushLocalGet(b, 0); pushLocalGet(b, 1); pushI32Const(b, EC_SA); b.push(CALL); u32Enc(b, 2); // sum
      pushLocalGet(b, 0); pushLocalGet(b, 1); pushI32Const(b, EC_SB); b.push(CALL); u32Enc(b, 3); // dif
      emitCall2(b, 1, EC_SA, EC_SU); // u = sum^2
      emitCall2(b, 1, EC_SB, EC_SV); // v = dif^2
      emitCall3(b, 3, EC_SU, EC_SV, EC_DF); // df = u - v
      pushLocalGet(b, 2); pushI32Const(b, EC_DF); pushI32Const(b, EC_SA); b.push(CALL); u32Enc(b, 0); // a24 * df
      emitCall3(b, 2, EC_SV, EC_SA, EC_SB); // v + a24 * df
      pushI32Const(b, EC_SU); pushI32Const(b, EC_SV); pushLocalGet(b, 3); b.push(CALL); u32Enc(b, 0); // outX = u * v
      pushI32Const(b, EC_DF); pushI32Const(b, EC_SB); pushLocalGet(b, 4); b.push(CALL); u32Enc(b, 0); // outZ = df * (v + a24*df)
      b.push(END);
      return b;
    };

    // Helper: inline Montgomery step reusing fixed EC_* buffers (fast, zero copy overhead on inputs/outputs except start/end)
    const emitInlineEcStep = (b, bitCondLocal) => {
      // EC_SA = EC_X1 - EC_Z1, EC_SB = EC_X0 + EC_Z0, EC_SU = SA*SB
      emitCall3(b, 3, EC_X1, EC_Z1, EC_SA);
      emitCall3(b, 2, EC_X0, EC_Z0, EC_SB);
      emitCall3(b, 0, EC_SA, EC_SB, EC_SU);
      // EC_SA = EC_X1 + EC_Z1, EC_SB = EC_X0 - EC_Z0, EC_SV = SA*SB
      emitCall3(b, 2, EC_X1, EC_Z1, EC_SA);
      emitCall3(b, 3, EC_X0, EC_Z0, EC_SB);
      emitCall3(b, 0, EC_SA, EC_SB, EC_SV);

      emitCall3(b, 2, EC_SU, EC_SV, EC_SUM);
      emitCall3(b, 3, EC_SU, EC_SV, EC_DIF);
      emitCall2(b, 1, EC_SUM, EC_SA);
      emitCall2(b, 1, EC_DIF, EC_SB);
      emitCall3(b, 0, EC_BZ, EC_SA, EC_AX);
      emitCall3(b, 0, EC_BX, EC_SB, EC_AZ);

      pushLocalGet(b, bitCondLocal);
      b.push(IF, VOID);
      // bit == 1: P0 = (AX, AZ); P1 = Double(X1, Z1)
      emitCopyPtr(b, EC_AX, EC_X0);
      emitCopyPtr(b, EC_AZ, EC_Z0);
      emitCall3(b, 2, EC_X1, EC_Z1, EC_SA);
      emitCall3(b, 3, EC_X1, EC_Z1, EC_SB);
      emitCall2(b, 1, EC_SA, EC_SU);
      emitCall2(b, 1, EC_SB, EC_SV);
      emitCall3(b, 3, EC_SU, EC_SV, EC_DF);
      emitCall3(b, 0, EC_A24, EC_DF, EC_SA);
      emitCall3(b, 2, EC_SV, EC_SA, EC_SB);
      emitCall3(b, 0, EC_SU, EC_SV, EC_X1);
      emitCall3(b, 0, EC_DF, EC_SB, EC_Z1);
      b.push(ELSE);
      // bit == 0: P1 = (AX, AZ); P0 = Double(X0, Z0)
      emitCopyPtr(b, EC_AX, EC_X1);
      emitCopyPtr(b, EC_AZ, EC_Z1);
      emitCall3(b, 2, EC_X0, EC_Z0, EC_SA);
      emitCall3(b, 3, EC_X0, EC_Z0, EC_SB);
      emitCall2(b, 1, EC_SA, EC_SU);
      emitCall2(b, 1, EC_SB, EC_SV);
      emitCall3(b, 3, EC_SU, EC_SV, EC_DF);
      emitCall3(b, 0, EC_A24, EC_DF, EC_SA);
      emitCall3(b, 2, EC_SV, EC_SA, EC_SB);
      emitCall3(b, 0, EC_SU, EC_SV, EC_X0);
      emitCall3(b, 0, EC_DF, EC_SB, EC_Z0);
      b.push(END);
    };

    // Build Fn 6: ecLadder(k=0, bx=1, bz=2, a24=3, outX=4, outZ=5)
    const buildFnEcLadder = () => {
      const b = [];
      const clzOp = 0x67; // i32.clz
      const bitLoc = 6;
      const condLoc = 7;

      const body = [];
      // Handle k == 0 -> outX = ONE, outZ = 0
      pushLocalGet(body, 0);
      body.push(I32_EQZ, IF, VOID);
      emitCopyConstToLocal(body, ONE_PTR, 4);
      for (let j = 0; j < K; j++) {
        pushLocalGet(body, 5);
        pushI64Const(body, 0n);
        body.push(I64_STORE32, 0x02); u32Enc(body, j * 4);
      }
      body.push(ELSE);

      // Handle k == 1 -> copy bx, bz to outX, outZ
      pushLocalGet(body, 0);
      pushI32Const(body, 1);
      body.push(I32_EQ, IF, VOID);
      for (let j = 0; j < K; j++) {
        pushLocalGet(body, 4);
        pushLocalGet(body, 1);
        body.push(I64_LOAD32_U, 0x02); u32Enc(body, j * 4);
        body.push(I64_STORE32, 0x02); u32Enc(body, j * 4);
        pushLocalGet(body, 5);
        pushLocalGet(body, 2);
        body.push(I64_LOAD32_U, 0x02); u32Enc(body, j * 4);
        body.push(I64_STORE32, 0x02); u32Enc(body, j * 4);
      }
      body.push(ELSE);

      // General k >= 2
      emitCopyLocalToConst(body, 1, EC_BX);
      emitCopyLocalToConst(body, 2, EC_BZ);
      emitCopyLocalToConst(body, 3, EC_A24);
      emitCopyPtr(body, ONE_PTR, EC_X0);
      emitZeroConst(body, EC_Z0);
      emitCopyPtr(body, EC_BX, EC_X1);
      emitCopyPtr(body, EC_BZ, EC_Z1);

      pushI32Const(body, 31);
      pushLocalGet(body, 0);
      body.push(clzOp, I32_SUB);
      pushLocalSet(body, bitLoc);

      body.push(LOOP, VOID);
      pushLocalGet(body, 0);
      pushLocalGet(body, bitLoc);
      body.push(I32_SHR_U);
      pushI32Const(body, 1);
      body.push(I32_AND);
      pushLocalSet(body, condLoc);

      emitInlineEcStep(body, condLoc);

      pushLocalGet(body, bitLoc);
      pushI32Const(body, 1);
      body.push(I32_SUB);
      pushLocalTee(body, bitLoc);
      pushI32Const(body, 0);
      body.push(I32_GE_S, BR_IF, 0x00, END);

      emitCopyConstToLocal(body, EC_X0, 4);
      emitCopyConstToLocal(body, EC_Z0, 5);
      body.push(END, END, END);

      u32Enc(b, 1);
      u32Enc(b, 2); b.push(I32);
      for (let i = 0; i < body.length; i++) b.push(body[i]);
      return b;
    };

    // Build Fn 7: ecStage1Batch(primesPtr=0, count=1, xSlotPtr=2, zSlotPtr=3, a24Ptr=4, accZPtr=5)
    // Multiplies curve point (xSlotPtr, zSlotPtr) in-place by every u32 prime-power in primesPtr[0..count-1]
    // and accumulates accZ = accZ * z inside Wasm with ZERO JS<->Wasm calls per prime.
    const buildFnEcStage1Batch = () => {
      const b = [];
      const idxLoc = 6;
      const pwrLoc = 7;
      const bitLoc = 8;
      const condLoc = 9;
      const body = [];

      pushLocalGet(body, 1);
      body.push(I32_EQZ, IF, VOID);
      pushI32Const(body, 1);
      body.push(0x0f);
      body.push(END);

      emitCopyLocalToConst(body, 4, EC_A24);
      emitCopyLocalToConst(body, 2, EC_DX);
      emitCopyLocalToConst(body, 3, EC_DZ);

      pushI32Const(body, 0);
      pushLocalSet(body, idxLoc);

      body.push(LOOP, VOID);
      pushLocalGet(body, 0);
      pushLocalGet(body, idxLoc);
      pushI32Const(body, 2);
      body.push(I32_SHL, I32_ADD, I32_LOAD, 0x02, 0x00);
      pushLocalSet(body, pwrLoc);

      emitCopyPtr(body, EC_DX, EC_BX);
      emitCopyPtr(body, EC_DZ, EC_BZ);
      emitCopyPtr(body, ONE_PTR, EC_X0);
      emitZeroConst(body, EC_Z0);
      emitCopyPtr(body, EC_DX, EC_X1);
      emitCopyPtr(body, EC_DZ, EC_Z1);

      pushI32Const(body, 31);
      pushLocalGet(body, pwrLoc);
      body.push(0x67, I32_SUB);
      pushLocalSet(body, bitLoc);

      body.push(LOOP, VOID);
      pushLocalGet(body, pwrLoc);
      pushLocalGet(body, bitLoc);
      body.push(I32_SHR_U);
      pushI32Const(body, 1);
      body.push(I32_AND);
      pushLocalSet(body, condLoc);

      emitInlineEcStep(body, condLoc);

      pushLocalGet(body, bitLoc);
      pushI32Const(body, 1);
      body.push(I32_SUB);
      pushLocalTee(body, bitLoc);
      pushI32Const(body, 0);
      body.push(I32_GE_S, BR_IF, 0x00, END);

      emitCopyPtr(body, EC_X0, EC_DX);
      emitCopyPtr(body, EC_Z0, EC_DZ);

      pushLocalGet(body, 5);
      pushI32Const(body, EC_DZ);
      pushI32Const(body, EC_SA);
      body.push(CALL); u32Enc(body, 0);
      emitCopyConstToLocal(body, EC_SA, 5);

      pushLocalGet(body, idxLoc);
      pushI32Const(body, 1);
      body.push(I32_ADD);
      pushLocalTee(body, idxLoc);
      pushLocalGet(body, 1);
      body.push(I32_LT_U, BR_IF, 0x00, END);

      emitCopyConstToLocal(body, EC_DX, 2);
      emitCopyConstToLocal(body, EC_DZ, 3);
      pushI32Const(body, 1);
      body.push(END);

      u32Enc(b, 1);
      u32Enc(b, 4); b.push(I32);
      for (let i = 0; i < body.length; i++) b.push(body[i]);
      return b;
    };

    // Function Signatures:
    // T0: (i32, i32, i32) -> void           [montMul, montAdd, montSub]
    // T1: (i32, i32) -> void                [montSqr]
    // T2: (i32,i32,i32,i32,i32,i32,i32,i32) -> void  [ecDiffAdd]
    // T3: (i32,i32,i32,i32,i32) -> void     [ecDouble]
    // T4: (i32,i32,i32,i32,i32,i32) -> void [ecLadder]
    // T5: (i32,i32,i32,i32,i32,i32) -> i32  [ecStage1Batch]
    const typeSecPayload = [
      6,
      0x60, 3, I32, I32, I32, 0,
      0x60, 2, I32, I32, 0,
      0x60, 8, I32, I32, I32, I32, I32, I32, I32, I32, 0,
      0x60, 5, I32, I32, I32, I32, I32, 0,
      0x60, 6, I32, I32, I32, I32, I32, I32, 0,
      0x60, 6, I32, I32, I32, I32, I32, I32, 1, I32
    ];
    const funcSecPayload = [9, 0, 1, 0, 0, 2, 3, 4, 5, 0];
    const memSecPayload = [1, 0x00, 0x04]; // 4 pages = 256 KB linear memory
    const encName = (name, kind, idx) => {
      const out = [name.length];
      for (let i = 0; i < name.length; i++) out.push(name.charCodeAt(i));
      out.push(kind);
      u32Enc(out, idx);
      return out;
    };
    const expPayload = [10];
    const expItems = [
      ['memory', 0x02, 0],
      ['montMul', 0x00, 0],
      ['montSqr', 0x00, 1],
      ['montAdd', 0x00, 2],
      ['montSub', 0x00, 3],
      ['ecDiffAdd', 0x00, 4],
      ['ecDouble', 0x00, 5],
      ['ecLadder', 0x00, 6],
      ['ecStage1Batch', 0x00, 7],
      ['batchMul', 0x00, 8]
    ];
    for (let i = 0; i < expItems.length; i++) {
      const eBytes = encName(expItems[i][0], expItems[i][1], expItems[i][2]);
      for (let j = 0; j < eBytes.length; j++) expPayload.push(eBytes[j]);
    }

    const fn0 = buildFnMontMulFios();
    const fn1 = (() => {
      const b = [];
      u32Enc(b, 0);
      pushLocalGet(b, 0); pushLocalGet(b, 0); pushLocalGet(b, 1);
      b.push(CALL); u32Enc(b, 0);
      b.push(END);
      return b;
    })();
    const fn2 = buildFnMontAdd();
    const fn3 = buildFnMontSub();
    const fn4 = buildFnEcDiffAdd();
    const fn5 = buildFnEcDouble();
    const fn6 = buildFnEcLadder();
    const fn7 = buildFnEcStage1Batch();
    const fn8 = buildFnBatchMul();

    const fns = [fn0, fn1, fn2, fn3, fn4, fn5, fn6, fn7, fn8];
    const codePayload = [fns.length];
    for (let i = 0; i < fns.length; i++) {
      u32Enc(codePayload, fns[i].length);
      for (let j = 0; j < fns[i].length; j++) codePayload.push(fns[i][j]);
    }

    const wasmBytes = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
      ...section(1, typeSecPayload),
      ...section(3, funcSecPayload),
      ...section(5, memSecPayload),
      ...section(7, expPayload),
      ...section(10, codePayload)
    ]);

    const mod = new WebAssembly.Module(wasmBytes);
    const inst = new WebAssembly.Instance(mod);
    const memU32 = new Uint32Array(inst.exports.memory.buffer);

    const writeLimbsAt = (bytePtr, val) => {
      const idx = bytePtr >>> 2;
      let t = val < 0n ? ((val % N) + N) % N : (val > N ? val % N : val);
      for (let i = 0; i < K; i++) {
        memU32[idx + i] = Number(t & 0xffffffffn);
        t >>= 32n;
      }
    };
    const readLimbsAt = (bytePtr) => {
      const idx = bytePtr >>> 2;
      let res = 0n;
      for (let i = K - 1; i >= 0; i--) {
        res = (res << 32n) | BigInt(memU32[idx + i] >>> 0);
      }
      return res;
    };

    const R = 1n << BigInt(K * 32);
    const oneM = R % N;
    const twoM = (oneM + oneM) >= N ? (oneM + oneM - N) : (oneM + oneM);
    writeLimbsAt(N_PTR, N);
    writeLimbsAt(ONE_PTR, oneM);
    writeLimbsAt(TWO_PTR, twoM);

    return {
      K,
      bits,
      R,
      oneM,
      twoM,
      backend: useUnrolled ? 'wasm-cios-unrolled' : 'wasm-cios-loop',
      memU32,
      slotAddr,
      ONE_PTR,
      TWO_PTR,
      writeLimbsAt,
      readLimbsAt,
      exports: inst.exports
    };
  };

  const createMontgomeryCtx = (N) => {
    const bits = N.toString(2).length;
    if ((N & 1n) === 0n) {
      return {
        N, bits, kLimbs: Math.ceil(bits / 32), backend: 'native',
        oneM: 1n, twoM: 2n % N,
        toMont: (x) => ((x % N) + N) % N,
        fromMont: (xM) => xM,
        montMul: (a, b) => (a * b) % N,
        montSqr: (a) => (a * a) % N,
        montAdd: (a, b) => { const s = a + b; return s >= N ? s - N : s; },
        montSub: (a, b) => (a >= b ? a - b : a + N - b),
        montPow: (baseM, exp) => {
          let r = 1n, b = ((baseM % N) + N) % N, e = exp;
          while (e > 0n) { if (e & 1n) r = (r * b) % N; e >>= 1n; if (e > 0n) b = (b * b) % N; }
          return r;
        },
        ecLadder: () => [1n, 0n],
        ecStage1Primes: (_p, xM, zM) => ({ factor: null, xM, zM }),
        montMulSlot: () => {},
        montSqrSlot: () => {},
        writeSlot: () => {},
        readSlot: () => 0n,
        getRawWasmExports: () => null
      };
    }

    try {
      const core = buildMontgomeryWasmCore(N);
      const { K, R, oneM, twoM, backend, memU32, slotAddr, writeLimbsAt, readLimbsAt, exports } = core;
      const SA = slotAddr(0);
      const SB = slotAddr(1);
      const SC = slotAddr(2);
      const SD = slotAddr(3);
      const SE = slotAddr(4);
      const SF = slotAddr(5);
      const PRIMES_SCRATCH = slotAddr(120); // well clear of EC_* slots (50..67) and winPow (10..27)

      const toMont = (x) => {
        const xm = ((x % N) + N) % N;
        return (xm * R) % N;
      };
      const fromMont = (xM) => {
        writeLimbsAt(SA, xM);
        writeLimbsAt(SB, 1n);
        exports.montMul(SA, SB, SC);
        return readLimbsAt(SC);
      };
      const montMul = (aM, bM) => {
        writeLimbsAt(SA, aM);
        writeLimbsAt(SB, bM);
        exports.montMul(SA, SB, SC);
        return readLimbsAt(SC);
      };
      const montSqr = (aM) => {
        writeLimbsAt(SA, aM);
        exports.montSqr(SA, SC);
        return readLimbsAt(SC);
      };
      const montAdd = (a, b) => {
        const s = a + b;
        return s >= N ? s - N : s;
      };
      const montSub = (a, b) => (a >= b ? a - b : a + N - b);

      const montPow = (baseM, exp) => {
        if (exp === 0n) return oneM;
        if (exp === 1n) return baseM;
        const RES_SLOT = slotAddr(8);
        const BASE_SLOT = slotAddr(9);
        writeLimbsAt(RES_SLOT, oneM);
        writeLimbsAt(BASE_SLOT, baseM);

        if (exp < (1n << 48n)) {
          let e = exp;
          while (e > 0n) {
            if (e & 1n) exports.montMul(RES_SLOT, BASE_SLOT, RES_SLOT);
            e >>= 1n;
            if (e > 0n) exports.montSqr(BASE_SLOT, BASE_SLOT);
          }
          return readLimbsAt(RES_SLOT);
        }

        // 4-bit windowed modular exponentiation inside Wasm memory slots 10..25
        writeLimbsAt(slotAddr(10), oneM);
        writeLimbsAt(slotAddr(11), baseM);
        for (let t = 2; t < 16; t++) {
          exports.montMul(slotAddr(10 + t - 1), BASE_SLOT, slotAddr(10 + t));
        }
        const hex = exp.toString(16);
        const topNib = parseInt(hex[0], 16);
        memU32.copyWithin(RES_SLOT >>> 2, slotAddr(10 + topNib) >>> 2, (slotAddr(10 + topNib) >>> 2) + K);
        for (let i = 1; i < hex.length; i++) {
          exports.montSqr(RES_SLOT, RES_SLOT);
          exports.montSqr(RES_SLOT, RES_SLOT);
          exports.montSqr(RES_SLOT, RES_SLOT);
          exports.montSqr(RES_SLOT, RES_SLOT);
          const nib = parseInt(hex[i], 16);
          if (nib !== 0) exports.montMul(RES_SLOT, slotAddr(10 + nib), RES_SLOT);
        }
        return readLimbsAt(RES_SLOT);
      };

      const ecLadder = (k, bxM, bzM, a24M) => {
        writeLimbsAt(SA, bxM);
        writeLimbsAt(SB, bzM);
        writeLimbsAt(SC, a24M);
        exports.ecLadder(k >>> 0, SA, SB, SC, SD, SE);
        return [readLimbsAt(SD), readLimbsAt(SE)];
      };

      const ecStage1Primes = (primes, xM, zM, a24M, b1, gcdFn) => {
        const X_S = slotAddr(70);
        const Z_S = slotAddr(71);
        const A_S = slotAddr(72);
        const ACC_S = slotAddr(73);
        writeLimbsAt(X_S, xM);
        writeLimbsAt(Z_S, zM);
        writeLimbsAt(A_S, a24M);
        writeLimbsAt(ACC_S, oneM);

        const maxPrimesChunk = Math.floor((memU32.buffer.byteLength - PRIMES_SCRATCH - 16) / 4);
        const chunkCap = Math.min(512, maxPrimesChunk);
        const pIdxBase = PRIMES_SCRATCH >>> 2;
        let idx = 0;
        while (idx < primes.length) {
          let cnt = 0;
          while (idx < primes.length && cnt < chunkCap) {
            const p = primes[idx++];
            let pwr = p;
            while (pwr * p <= b1) pwr *= p;
            memU32[pIdxBase + cnt] = pwr >>> 0;
            cnt++;
          }
          if (cnt > 0) {
            exports.ecStage1Batch(PRIMES_SCRATCH, cnt, X_S, Z_S, A_S, ACC_S);
            const accVal = readLimbsAt(ACC_S);
            writeLimbsAt(SA, accVal);
            writeLimbsAt(SB, 1n);
            exports.montMul(SA, SB, SC);
            const g = gcdFn(readLimbsAt(SC), N);
            if (g > 1n && g < N) {
              return { factor: g, xM: readLimbsAt(X_S), zM: readLimbsAt(Z_S) };
            }
            writeLimbsAt(ACC_S, oneM);
          }
        }
        return { factor: null, xM: readLimbsAt(X_S), zM: readLimbsAt(Z_S) };
      };

      return {
        N, bits, kLimbs: K, backend, oneM, twoM,
        toMont, fromMont, montMul, montSqr, montAdd, montSub, montPow,
        ecLadder, ecStage1Primes,
        montMulSlot: (aS, bS, oS) => exports.montMul(slotAddr(aS), slotAddr(bS), slotAddr(oS)),
        montSqrSlot: (aS, oS) => exports.montSqr(slotAddr(aS), slotAddr(oS)),
        writeSlot: (s, v) => writeLimbsAt(slotAddr(s), v),
        readSlot: (s) => readLimbsAt(slotAddr(s)),
        getRawWasmExports: () => ({
          montMulPtr: exports.montMul,
          montSqrPtr: exports.montSqr,
          batchMulPtr: exports.batchMul,
          slotPtr: slotAddr
        })
      };
    } catch (e) {
      // Safe JS BigInt Montgomery-REDC fallback if WebAssembly is ever unavailable
      const w = Math.ceil(bits / 64) * 64;
      const wBig = BigInt(w);
      const R = 1n << wBig;
      let inv = 1n;
      for (let step = 1; step < w; step <<= 1) inv = BigInt.asUintN(w, inv * (2n - N * inv));
      const nPrime = BigInt.asUintN(w, R - inv);
      const redc = (T) => {
        const m = BigInt.asUintN(w, BigInt.asUintN(w, T) * nPrime);
        let t = (T + m * N) >> wBig;
        return t >= N ? t - N : t;
      };
      const oneM = R % N;
      const twoM = (oneM + oneM) >= N ? (oneM + oneM - N) : (oneM + oneM);
      const montMul = (a, b) => redc(a * b);
      const montSqr = (a) => redc(a * a);
      const montAdd = (a, b) => { const s = a + b; return s >= N ? s - N : s; };
      const montSub = (a, b) => (a >= b ? a - b : a + N - b);
      const ecLadderFallback = (k, bx, bz, a24M) => {
        if (k === 0) return [oneM, 0n];
        if (k === 1) return [bx, bz];
        let x0 = oneM, z0 = 0n, x1 = bx, z1 = bz;
        const msb = 31 - Math.clz32(k);
        for (let bit = msb; bit >= 0; bit--) {
          const uA = montMul(montSub(x1, z1), montAdd(x0, z0));
          const vA = montMul(montAdd(x1, z1), montSub(x0, z0));
          const sumUV = montAdd(uA, vA), diffUV = montSub(uA, vA);
          const ax = montMul(bz, montSqr(sumUV)), az = montMul(bx, montSqr(diffUV));
          if ((k >>> bit) & 1) {
            const sumD = montAdd(x1, z1), difD = montSub(x1, z1);
            const uD = montSqr(sumD), vD = montSqr(difD), df = montSub(uD, vD);
            x0 = ax; z0 = az; x1 = montMul(uD, vD); z1 = montMul(df, montAdd(vD, montMul(a24M, df)));
          } else {
            const sumD = montAdd(x0, z0), difD = montSub(x0, z0);
            const uD = montSqr(sumD), vD = montSqr(difD), df = montSub(uD, vD);
            x1 = ax; z1 = az; x0 = montMul(uD, vD); z0 = montMul(df, montAdd(vD, montMul(a24M, df)));
          }
        }
        return [x0, z0];
      };
      return {
        N, bits, kLimbs: Math.ceil(bits / 32), backend: 'bigint-redc',
        oneM, twoM,
        toMont: (x) => ((((x % N) + N) % N) << wBig) % N,
        fromMont: (xM) => redc(xM),
        montMul, montSqr, montAdd, montSub,
        montPow: (baseM, exp) => {
          let r = oneM, b = baseM, e = exp;
          while (e > 0n) { if (e & 1n) r = redc(r * b); e >>= 1n; if (e > 0n) b = redc(b * b); }
          return r;
        },
        ecLadder: ecLadderFallback,
        ecStage1Primes: (primes, xM, zM, a24M, b1, gcdFn) => {
          let cx = xM, cz = zM, acc = oneM;
          for (let i = 0; i < primes.length; i++) {
            let pwr = primes[i];
            while (pwr * primes[i] <= b1) pwr *= primes[i];
            const [nx, nz] = ecLadderFallback(pwr, cx, cz, a24M);
            cx = nx; cz = nz;
            acc = montMul(acc, nz);
            if ((i & 255) === 255) {
              const g = gcdFn(redc(acc), N);
              if (g > 1n && g < N) return { factor: g, xM: cx, zM: cz };
              acc = oneM;
            }
          }
          return { factor: null, xM: cx, zM: cz };
        },
        montMulSlot: () => {}, montSqrSlot: () => {}, writeSlot: () => {}, readSlot: () => 0n,
        getRawWasmExports: () => null
      };
    }
  };

  const benchmarkWorkerRedcVsNaive = (ctx, sourceLabel = 'web-worker') => {
    const N = ctx.N;
    const iters = ctx.bits > 650 ? 6000 : 8000;
    const seedA = ((N >> 2n) | 3n) % N;
    const seedB = ((N >> 3n) | 5n) % N;

    // Warmup both
    let jx = seedA;
    for (let i = 0; i < 400; i++) jx = (jx * seedB) % N;
    const raw = ctx.getRawWasmExports();
    if (raw && raw.batchMulPtr) {
      ctx.writeSlot(80, ctx.toMont(seedA));
      ctx.writeSlot(81, ctx.toMont(seedB));
      const p0 = raw.slotPtr(80);
      const p1 = raw.slotPtr(81);
      raw.batchMulPtr(p0, p1, 400);

      const tN0 = performance.now();
      for (let i = 0; i < iters; i++) jx = (jx * seedB) % N;
      const tNaiveMs = Math.max(0.05, performance.now() - tN0);

      const tR0 = performance.now();
      raw.batchMulPtr(p0, p1, iters);
      const tRedcMs = Math.max(0.02, performance.now() - tR0);

      const redcNsPerMul = (tRedcMs * 1e6) / iters;
      const naiveNsPerMul = (tNaiveMs * 1e6) / iters;
      const speedupPct = ((naiveNsPerMul - redcNsPerMul) / Math.max(1, naiveNsPerMul)) * 100;
      const opsPerSec = Math.round(1e9 / Math.max(1, redcNsPerMul));
      void jx;
      return {
        active: ctx.backend.startsWith('wasm'),
        backend: ctx.backend,
        nBits: ctx.bits,
        speedupPct: Number(speedupPct.toFixed(1)),
        redcNsPerMul: Number(redcNsPerMul.toFixed(1)),
        naiveNsPerMul: Number(naiveNsPerMul.toFixed(1)),
        source: sourceLabel,
        opsPerSec
      };
    }

    const tN0 = performance.now();
    for (let i = 0; i < iters; i++) jx = (jx * seedB) % N;
    const tNaiveMs = Math.max(0.02, performance.now() - tN0);
    let rx = ctx.toMont(seedA);
    const ry = ctx.toMont(seedB);
    const tR0 = performance.now();
    for (let i = 0; i < iters; i++) rx = ctx.montMul(rx, ry);
    const tRedcMs = Math.max(0.01, performance.now() - tR0);
    const redcNsPerMul = (tRedcMs * 1e6) / iters;
    const naiveNsPerMul = (tNaiveMs * 1e6) / iters;
    void rx; void jx;
    return {
      active: ctx.backend !== 'native',
      backend: ctx.backend,
      nBits: ctx.bits,
      speedupPct: Number((((naiveNsPerMul - redcNsPerMul) / Math.max(1, naiveNsPerMul)) * 100).toFixed(1)),
      redcNsPerMul: Number(redcNsPerMul.toFixed(1)),
      naiveNsPerMul: Number(naiveNsPerMul.toFixed(1)),
      source: sourceLabel,
      opsPerSec: Math.round(1e9 / Math.max(1, redcNsPerMul))
    };
  };

  const selectAutoCurveFamilyWorker = (nBits, b2Bound) => {
    if (nBits > 500 && b2Bound >= 450000) {
      return { curveFamily: 'montgomery', autoSwitchReason: 'N > 500b (' + nBits + 'b) & B2 ≥ 450k → Montgomery' };
    }
    if (nBits > 500) {
      return { curveFamily: 'montgomery', autoSwitchReason: 'N > 500b (' + nBits + 'b) → Montgomery' };
    }
    if (b2Bound >= 450000) {
      return { curveFamily: 'montgomery', autoSwitchReason: 'B2 ≥ 450k (' + Math.round(b2Bound / 1000) + 'k) → Montgomery' };
    }
    return { curveFamily: 'suyama', autoSwitchReason: 'N ≤ 500b (' + nBits + 'b) & B2 < 450k → Suyama' };
  };

  // Direct Montgomery Parameterization (Z/2Z x Z/4Z torsion, independent of Suyama):
  // t = (r^2 + 1) / (2r) => a24 = t^2 = (r^2 + 1)^2 / (4 r^2), ensuring A+2 = (2t)^2 & A-2 = ((r^2-1)/r)^2
  // with non-torsion starting x0 = r^2 + 3r + 5 (infinite order over Q, avoids small-order collapse).
  const getDirectMontgomeryCurveRedc = (ctx, seedBig, N, modInvFn, gcdFn) => {
    const r = ((seedBig < 0n ? -seedBig : seedBig) % (1n << 60n)) + 3n;
    const r2 = (r * r) % N;
    const r2p1 = (r2 + 1n) % N;
    const num = (r2p1 * r2p1) % N;
    const den = (4n * r2) % N;
    const g = gcdFn(den, N);
    if (g > 1n && g < N) return { factor: g };
    if (g === N || g > 1n) return null;

    const a24 = (num * modInvFn(den, N)) % N;
    const x0 = (r2 + 3n * r + 5n) % N;
    if (x0 <= 1n || x0 === N - 1n) return null;
    return {
      a24M: ctx.toMont(a24),
      x0M: ctx.toMont(x0),
      z0M: ctx.oneM
    };
  };

  const getSuyamaCurveRedcUnified = (ctx, sigma, N, modInvFn, gcdFn) => {
    const u = (sigma * sigma - 5n + N) % N;
    const v = (4n * sigma) % N;
    const u3 = (((u * u) % N) * u) % N;
    const v3 = (((v * v) % N) * v) % N;
    const diff = (v - u + N) % N;
    const diff3 = (((diff * diff) % N) * diff) % N;
    const num = (diff3 * (3n * u + v)) % N;
    const den4 = (16n * ((u3 * v) % N)) % N;

    const g = gcdFn(den4, N);
    if (g > 1n && g < N) return { factor: g };
    if (g === N || g > 1n) return null;

    const a24 = (num * modInvFn(den4, N)) % N;
    return {
      a24M: ctx.toMont(a24),
      x0M: ctx.toMont(u3),
      z0M: ctx.toMont(v3)
    };
  };

  const runUnifiedEcmStage1And2 = (
    N,
    sigmaVal,
    b1,
    b2,
    primesB1,
    modInvFn,
    gcdFn,
    onProgress = null,
    sharedCtx = null
  ) => {
    const ctx = sharedCtx || createMontgomeryCtx(N);
    const nBits = ctx.bits;
    const { curveFamily, autoSwitchReason } = selectAutoCurveFamilyWorker(nBits, b2);
    const curve = curveFamily === 'montgomery'
      ? getDirectMontgomeryCurveRedc(ctx, sigmaVal, N, modInvFn, gcdFn)
      : getSuyamaCurveRedcUnified(ctx, sigmaVal, N, modInvFn, gcdFn);
    if (!curve) return null;
    if (curve.factor) return { factor: curve.factor, stage: 'Curve Setup GCD (' + curveFamily + ')', curveFamily };

    const { a24M, x0M, z0M } = curve;
    if (onProgress) {
      onProgress({
        stagePhase: 'stage1',
        curveFamily,
        autoSwitchReason,
        b2ProgressPct: 0,
        b2GiantStepsDone: 0,
        b2GiantStepsTotal: 0,
        dStep: 210
      });
    }

    // Stage 1 accelerated via Wasm batch prime loop
    const s1 = ctx.ecStage1Primes(primesB1, x0M, z0M, a24M, b1, gcdFn);
    if (s1.factor && s1.factor > 1n && s1.factor < N) {
      return { factor: s1.factor, stage: 'ECM Stage 1 (' + curveFamily + ')', curveFamily };
    }
    const curX = s1.xM;
    const curZ = s1.zM;
    const gZ = gcdFn(ctx.fromMont(curZ), N);
    if (gZ > 1n && gZ < N) {
      return { factor: gZ, stage: 'ECM Stage 1 (' + curveFamily + ')', curveFamily };
    }

    if (b2 <= b1) return null;

    // Stage 2: BSGS over (B1, B2] with D = 210 and Montgomery batch inversion
    const D = 210;
    const coprimeD = [1, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103];
    const bxArr = new Array(coprimeD.length);
    const bzArr = new Array(coprimeD.length);
    for (let idx = 0; idx < coprimeD.length; idx++) {
      const [bx, bz] = ctx.ecLadder(coprimeD[idx], curX, curZ, a24M);
      bxArr[idx] = bx;
      bzArr[idx] = bz;
    }

    const prefix = new Array(coprimeD.length);
    prefix[0] = bzArr[0];
    for (let idx = 1; idx < coprimeD.length; idx++) {
      prefix[idx] = ctx.montMul(prefix[idx - 1], bzArr[idx]);
    }
    const prodNorm = ctx.fromMont(prefix[coprimeD.length - 1]);
    const gBatch = gcdFn(prodNorm, N);
    if (gBatch > 1n && gBatch < N) return { factor: gBatch, stage: 'ECM Stage 2 BabySetup (' + curveFamily + ')', curveFamily };
    if (gBatch === N) return null;

    let invAcc = ctx.toMont(modInvFn(prodNorm, N));
    for (let idx = coprimeD.length - 1; idx > 0; idx--) {
      const zInv = ctx.montMul(invAcc, prefix[idx - 1]);
      invAcc = ctx.montMul(invAcc, bzArr[idx]);
      bxArr[idx] = ctx.montMul(bxArr[idx], zInv);
    }
    bxArr[0] = ctx.montMul(bxArr[0], invAcc);

    const [dX, dZ] = ctx.ecLadder(D, curX, curZ, a24M);
    const startM = Math.max(1, Math.floor((b1 - 105) / D));
    const endM = Math.ceil((b2 + 105) / D);
    const totalGiant = Math.max(1, endM - startM + 1);

    let [prevGX, prevGZ] = ctx.ecLadder(startM - 1, dX, dZ, a24M);
    let [giantX, giantZ] = ctx.ecLadder(startM, dX, dZ, a24M);
    let stage2Accum = ctx.oneM;

    const addDiffMont = (x1, z1, x2, z2, x0, z0) => {
      const u = ctx.montMul(ctx.montSub(x1, z1), ctx.montAdd(x2, z2));
      const v = ctx.montMul(ctx.montAdd(x1, z1), ctx.montSub(x2, z2));
      const s = ctx.montAdd(u, v);
      const d = ctx.montSub(u, v);
      return [ctx.montMul(z0, ctx.montSqr(s)), ctx.montMul(x0, ctx.montSqr(d))];
    };

    const reportEvery = Math.max(32, Math.floor(totalGiant / 12));
    for (let m = startM; m <= endM; m++) {
      for (let idx = 0; idx < bxArr.length; idx++) {
        const diff = ctx.montSub(giantX, ctx.montMul(giantZ, bxArr[idx]));
        if (diff > 0n) stage2Accum = ctx.montMul(stage2Accum, diff);
      }

      const done = m - startM + 1;
      if ((m & 31) === 31) {
        const g2 = gcdFn(ctx.fromMont(stage2Accum), N);
        if (g2 > 1n && g2 < N) return { factor: g2, stage: 'ECM Stage 2 B2 (' + curveFamily + ')', curveFamily };
        stage2Accum = ctx.oneM;
      }

      if (onProgress && (done === 1 || done % reportEvery === 0 || m === endM)) {
        onProgress({
          stagePhase: 'stage2-b2',
          curveFamily,
          autoSwitchReason,
          b2ProgressPct: Math.min(100, Math.round((done / totalGiant) * 100)),
          b2GiantStepsDone: done,
          b2GiantStepsTotal: totalGiant,
          dStep: D
        });
      }

      if (m < endM) {
        const [ngx, ngz] = addDiffMont(giantX, giantZ, dX, dZ, prevGX, prevGZ);
        prevGX = giantX;
        prevGZ = giantZ;
        giantX = ngx;
        giantZ = ngz;
      }
    }

    const gFinal = gcdFn(ctx.fromMont(stage2Accum), N);
    if (gFinal > 1n && gFinal < N) return { factor: gFinal, stage: 'ECM Stage 2 B2 (' + curveFamily + ')', curveFamily };
    return null;
  };
`;

// Runtime evaluator in TypeScript module using the exact same verified plain JS implementation
const runtimeKernelFactory = new Function(
  `${WORKER_MONT_REDC_JS}
  return {
    createMontgomeryCtx,
    benchmarkWorkerRedcVsNaive,
    getDirectMontgomeryCurveRedc,
    getSuyamaCurveRedcUnified,
    runUnifiedEcmStage1And2
  };`
) as () => {
  createMontgomeryCtx: (N: bigint) => MontgomeryRedcCtx;
  benchmarkWorkerRedcVsNaive: (ctx: MontgomeryRedcCtx, sourceLabel?: 'gf2-solver' | 'web-worker') => RedcBenchmarkResult;
  getDirectMontgomeryCurveRedc: (ctx: MontgomeryRedcCtx, seedBig: bigint, N: bigint, modInvFn: (a: bigint, m: bigint) => bigint, gcdFn: (a: bigint, b: bigint) => bigint) => any;
  getSuyamaCurveRedcUnified: (ctx: MontgomeryRedcCtx, sigma: bigint, N: bigint, modInvFn: (a: bigint, m: bigint) => bigint, gcdFn: (a: bigint, b: bigint) => bigint) => any;
  runUnifiedEcmStage1And2: (...args: any[]) => any;
};

let cachedRuntimeKernel: ReturnType<typeof runtimeKernelFactory> | null = null;
const getRuntimeKernel = () => {
  if (!cachedRuntimeKernel) cachedRuntimeKernel = runtimeKernelFactory();
  return cachedRuntimeKernel;
};

export const createMontgomeryRedcCtx = (N: bigint): MontgomeryRedcCtx =>
  getRuntimeKernel().createMontgomeryCtx(N);

export const benchmarkRedcVsNaive = (
  N: bigint,
  source: 'gf2-solver' | 'web-worker' = 'gf2-solver',
  existingCtx?: MontgomeryRedcCtx
): RedcBenchmarkResult => {
  const ctx = existingCtx || createMontgomeryRedcCtx(N);
  return getRuntimeKernel().benchmarkWorkerRedcVsNaive(ctx, source);
};

export const runUnifiedEcmCurve = (
  N: bigint,
  sigmaVal: bigint,
  b1: number,
  b2: number,
  primesB1: number[],
  modInvFn: (a: bigint, m: bigint) => bigint,
  gcdFn: (a: bigint, b: bigint) => bigint,
  onProgress?: (info: {
    stagePhase: 'stage1' | 'stage2-b2';
    curveFamily: EcmCurveFamily;
    autoSwitchReason: string;
    b2ProgressPct: number;
    b2GiantStepsDone: number;
    b2GiantStepsTotal: number;
    dStep: number;
  }) => void,
  sharedCtx?: MontgomeryRedcCtx
) =>
  getRuntimeKernel().runUnifiedEcmStage1And2(
    N,
    sigmaVal,
    b1,
    b2,
    primesB1,
    modInvFn,
    gcdFn,
    onProgress,
    sharedCtx
  );

export const getWorkerMontRedcCode = (): string => WORKER_MONT_REDC_JS;
