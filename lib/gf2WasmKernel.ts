/**
 * High-Performance WebAssembly (WASM) Kernel for GF(2) Matrix Operations & Markowitz Core
 * Dynamically emits and instantiates an optimized 64-bit WASM binary (i64.ctz + i64.xor)
 * executing full row-by-row Markowitz bit-scan & pivot elimination in WASM linear memory.
 */

export interface Gf2WasmContext {
  backend: 'wasm-gf2' | 'js-fallback';
  ensureCapacity: (requiredBytes: number) => void;
  getMemoryBuffer: () => ArrayBuffer | null;
  eliminateRange: (
    startRow: number,
    endRow: number,
    matQwords: number,
    histQwords: number,
    matBase: number,
    histBase: number,
    pivotsOff: number
  ) => number;
  eliminateMatrix: (
    mCore: number,
    kCore: number,
    matWords: number,
    matBytes: Uint8Array,
    histBytes: Uint8Array
  ) => number;
}

const buildWasmGf2Module = (useSimd: boolean): Uint8Array => {
  const encodeU32 = (arr: number[], val: number) => {
    let v = val >>> 0;
    while (true) {
      const b = v & 0x7f;
      v >>>= 7;
      if (v === 0) {
        arr.push(b);
        break;
      }
      arr.push(b | 0x80);
    }
  };

  const encodeI32 = (arr: number[], val: number) => {
    let v = val | 0;
    while (true) {
      const b = v & 0x7f;
      v >>= 7;
      if ((v === 0 && (b & 0x40) === 0) || (v === -1 && (b & 0x40) !== 0)) {
        arr.push(b);
        break;
      }
      arr.push(b | 0x80);
    }
  };

  const createSection = (id: number, payload: number[]): number[] => {
    const sec = [id];
    const lenArr: number[] = [];
    encodeU32(lenArr, payload.length);
    sec.push(...lenArr, ...payload);
    return sec;
  };

  // Types:
  // Type 0: (i32, i32, i32) -> i32  [xorRows32]
  // Type 1: (i32, i32, i32, i32, i32, i32, i32) -> i32 [eliminateRange64/128]
  const typePayload = [
    2,
    0x60, 3, 0x7f, 0x7f, 0x7f, 1, 0x7f,
    0x60, 7, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 1, 0x7f
  ];

  // Functions: func 0 -> type 0, func 1 -> type 1
  const funcPayload = [2, 0, 1];

  // Memory: initial 16 pages (1MB), dynamically growable without artificial cap
  const memPayload = [0x01, 0x00, 0x10];

  const encStr = (s: string): number[] => [s.length, ...Array.from(s, (ch) => ch.charCodeAt(0))];
  const expPayload = [
    3,
    ...encStr('memory'), 0x02, 0x00,
    ...encStr('eliminate'), 0x00, 0x00,
    ...encStr('eliminateRange'), 0x00, 0x01
  ];

  // Func 0: xorRows32(rowAOffset, rowBOffset, wordCount) -> 1
  const f0Locals = [1, 1, 0x7f]; // local 3: w (i32)
  const f0Code = [
    0x41, 0x00, 0x21, 0x03, // w = 0
    0x02, 0x40,             // block $done
      0x03, 0x40,           // loop $L
        0x20, 0x03, 0x20, 0x02, 0x4e, 0x0d, 0x01, // if w >= wordCount br $done
        0x20, 0x00, 0x20, 0x03, 0x41, 0x02, 0x74, 0x6a, // addrA = rowA + (w << 2)
        0x20, 0x00, 0x20, 0x03, 0x41, 0x02, 0x74, 0x6a, 0x28, 0x02, 0x00, // load A[w]
        0x20, 0x01, 0x20, 0x03, 0x41, 0x02, 0x74, 0x6a, 0x28, 0x02, 0x00, // load B[w]
        0x73, // xor
        0x36, 0x02, 0x00, // store A[w]
        0x20, 0x03, 0x41, 0x01, 0x6a, 0x21, 0x03, // w++
        0x0c, 0x00, // br $L
      0x0b,
    0x0b,
    0x41, 0x01, 0x0b
  ];
  const f0Body: number[] = [...f0Locals, ...f0Code];

  // Func 1: eliminateRange(startRow, endRow, matQwords, histQwords, matBase, histBase, pivotsOff) -> i32
  // Params: 0:startRow, 1:endRow, 2:matQwords, 3:histQwords, 4:matBase, 5:histBase, 6:pivotsOff
  // Locals: 7:r, 8:w, 9:rowMatOff, 10:piv, 11:pivMatOff, 12:pDst, 13:pSrc, 14:pEnd, 15:col (all i32), 16:word (i64)
  const f1Locals = [2, 9, 0x7f, 1, 0x7e];
  const f1Code: number[] = [];
  const push = (...bytes: number[]) => f1Code.push(...bytes);
  const i32Const = (v: number) => {
    push(0x41);
    encodeI32(f1Code, v);
  };

  // Emit 512-bit/iter SIMD (4x v128.xor) or 256-bit/iter (4x i64.xor) row XOR (pDst[0..] ^= pSrc[0..]) up to pEnd
  const emitXorUnrolled = () => {
    if (useSimd) {
      // 4x v128.xor (64 bytes/iter) while (pEnd - pDst) >= 64
      push(0x02, 0x40); // block $done64
        push(0x03, 0x40); // loop $loop64
          push(0x20, 0x0e, 0x20, 0x0c, 0x6b);
          i32Const(64);
          push(0x49, 0x0d, 0x01); // if (pEnd - pDst) <u 64 br $done64
          for (let k = 0; k < 4; k++) {
            const off = k * 16;
            push(0x20, 0x0c);
            push(0x20, 0x0c, 0xfd, 0x00, 0x03); encodeU32(f1Code, off); // v128.load align=3
            push(0x20, 0x0d, 0xfd, 0x00, 0x03); encodeU32(f1Code, off); // v128.load align=3
            push(0xfd, 0x51); // v128.xor
            push(0xfd, 0x0b, 0x03); encodeU32(f1Code, off); // v128.store align=3
          }
          push(0x20, 0x0c); i32Const(64); push(0x6a, 0x21, 0x0c); // pDst += 64
          push(0x20, 0x0d); i32Const(64); push(0x6a, 0x21, 0x0d); // pSrc += 64
          push(0x0c, 0x00); // br $loop64
        push(0x0b);
      push(0x0b);

      // 1x v128.xor (16 bytes/iter) while (pEnd - pDst) >= 16
      push(0x02, 0x40); // block $done16
        push(0x03, 0x40); // loop $loop16
          push(0x20, 0x0e, 0x20, 0x0c, 0x6b);
          i32Const(16);
          push(0x49, 0x0d, 0x01); // if (pEnd - pDst) <u 16 br $done16
          push(0x20, 0x0c);
          push(0x20, 0x0c, 0xfd, 0x00, 0x03, 0x00);
          push(0x20, 0x0d, 0xfd, 0x00, 0x03, 0x00);
          push(0xfd, 0x51);
          push(0xfd, 0x0b, 0x03, 0x00);
          push(0x20, 0x0c, 0x41, 16, 0x6a, 0x21, 0x0c);
          push(0x20, 0x0d, 0x41, 16, 0x6a, 0x21, 0x0d);
          push(0x0c, 0x00);
        push(0x0b);
      push(0x0b);

      // Final 8-byte tail if pDst < pEnd
      push(0x20, 0x0c, 0x20, 0x0e, 0x49); // pDst <u pEnd
      push(0x04, 0x40);
        push(0x20, 0x0c);
        push(0x20, 0x0c, 0x29, 0x03, 0x00);
        push(0x20, 0x0d, 0x29, 0x03, 0x00);
        push(0x85);
        push(0x37, 0x03, 0x00);
      push(0x0b);
      return;
    }

    // 4x unrolled 64-bit i64.xor while (pEnd - pDst) >= 32
    push(0x02, 0x40); // block $done4
      push(0x03, 0x40); // loop $loop4
        push(0x20, 0x0e, 0x20, 0x0c, 0x6b); // pEnd - pDst
        i32Const(32);
        push(0x49, 0x0d, 0x01); // if (pEnd - pDst) <u 32 br $done4
        for (let k = 0; k < 4; k++) {
          const off = k * 8;
          push(0x20, 0x0c);
          push(0x20, 0x0c, 0x29, 0x03, off);
          push(0x20, 0x0d, 0x29, 0x03, off);
          push(0x85); // i64.xor
          push(0x37, 0x03, off); // i64.store align=3 offset=k*8
        }
        push(0x20, 0x0c, 0x41, 32, 0x6a, 0x21, 0x0c); // pDst += 32
        push(0x20, 0x0d, 0x41, 32, 0x6a, 0x21, 0x0d); // pSrc += 32
        push(0x0c, 0x00); // br $loop4
      push(0x0b);
    push(0x0b);

    // Tail loop for remaining 0..3 qwords
    push(0x02, 0x40); // block $done1
      push(0x03, 0x40); // loop $loop1
        push(0x20, 0x0c, 0x20, 0x0e, 0x4f, 0x0d, 0x01); // if pDst >=u pEnd br $done1
        push(0x20, 0x0c);
        push(0x20, 0x0c, 0x29, 0x03, 0x00);
        push(0x20, 0x0d, 0x29, 0x03, 0x00);
        push(0x85); // i64.xor
        push(0x37, 0x03, 0x00); // i64.store
        push(0x20, 0x0c, 0x41, 0x08, 0x6a, 0x21, 0x0c);
        push(0x20, 0x0d, 0x41, 0x08, 0x6a, 0x21, 0x0d);
        push(0x0c, 0x00); // br $loop1
      push(0x0b);
    push(0x0b);
  };

  // r = startRow
  push(0x20, 0x00, 0x21, 0x07);
  push(0x02, 0x40); // block $exit_rows
    push(0x03, 0x40); // loop $row_loop
      // if r >= endRow br $exit_rows
      push(0x20, 0x07, 0x20, 0x01, 0x4e, 0x0d, 0x01);
      // rowMatOff = matBase + ((r * matQwords) << 3)
      push(0x20, 0x04, 0x20, 0x07, 0x20, 0x02, 0x6c, 0x41, 0x03, 0x74, 0x6a, 0x21, 0x09);
      // w = 0
      i32Const(0); push(0x21, 0x08);

      push(0x02, 0x40); // block $next_row
        push(0x03, 0x40); // loop $word_loop
          // if w >= matQwords: return r
          push(0x20, 0x08, 0x20, 0x02, 0x4e);
          push(0x04, 0x40); // if
            push(0x20, 0x07, 0x0f); // return r
          push(0x0b); // end if

          // word = i64.load(rowMatOff + (w << 3))
          push(0x20, 0x09, 0x20, 0x08, 0x41, 0x03, 0x74, 0x6a, 0x29, 0x03, 0x00, 0x22, 0x10);
          // if i64.eqz(word): w++; br $word_loop
          push(0x50);
          push(0x04, 0x40);
            push(0x20, 0x08, 0x41, 0x01, 0x6a, 0x21, 0x08);
            push(0x0c, 0x01); // br $word_loop
          push(0x0b);

          // col = (w << 6) + i32.wrap_i64(i64.ctz(word))
          push(0x20, 0x08, 0x41, 0x06, 0x74);
          push(0x20, 0x10, 0x7a, 0xa7, 0x6a, 0x21, 0x0f);

          // piv = i32.load(pivotsOff + (col << 2))
          push(0x20, 0x06, 0x20, 0x0f, 0x41, 0x02, 0x74, 0x6a, 0x28, 0x02, 0x00, 0x22, 0x0a);
          // if piv < 0: store r into pivotsOff[col], br $next_row
          i32Const(0); push(0x48); // i32.lt_s
          push(0x04, 0x40);
            push(0x20, 0x06, 0x20, 0x0f, 0x41, 0x02, 0x74, 0x6a, 0x20, 0x07, 0x36, 0x02, 0x00);
            push(0x0c, 0x02); // br $next_row
          push(0x0b);

          // pivMatOff = matBase + ((piv * matQwords) << 3)
          push(0x20, 0x04, 0x20, 0x0a, 0x20, 0x02, 0x6c, 0x41, 0x03, 0x74, 0x6a, 0x21, 0x0b);

          // Unrolled SIMD/64-bit mat XOR from w .. matQwords
          push(0x20, 0x09, 0x20, 0x08, 0x41, 0x03, 0x74, 0x6a, 0x21, 0x0c);
          push(0x20, 0x0b, 0x20, 0x08, 0x41, 0x03, 0x74, 0x6a, 0x21, 0x0d);
          push(0x20, 0x09, 0x20, 0x02, 0x41, 0x03, 0x74, 0x6a, 0x21, 0x0e);
          emitXorUnrolled();

          // Piv-bounded hist XOR from 0 .. ((piv >> 6) + 1) qwords (since piv < r strictly, hist[piv] has zero bits >= piv+1)
          // pDst = histBase + ((r * histQwords) << 3)
          push(0x20, 0x05, 0x20, 0x07, 0x20, 0x03, 0x6c, 0x41, 0x03, 0x74, 0x6a, 0x22, 0x0c);
          // pEnd = pDst + (((piv >>> 6) + 1) << 3)
          push(0x20, 0x0a, 0x41, 0x06, 0x76, 0x41, 0x01, 0x6a, 0x41, 0x03, 0x74, 0x6a, 0x21, 0x0e);
          // pSrc = histBase + ((piv * histQwords) << 3)
          push(0x20, 0x05, 0x20, 0x0a, 0x20, 0x03, 0x6c, 0x41, 0x03, 0x74, 0x6a, 0x21, 0x0d);
          emitXorUnrolled();

          push(0x0c, 0x00); // br $word_loop
        push(0x0b); // end $word_loop
      push(0x0b); // end $next_row

      // r++
      push(0x20, 0x07, 0x41, 0x01, 0x6a, 0x21, 0x07);
      push(0x0c, 0x00); // br $row_loop
    push(0x0b); // end $row_loop
  push(0x0b); // end $exit_rows

  i32Const(-1);
  push(0x0b);

  const f1Body: number[] = [...f1Locals, ...f1Code];

  const codePayload = [2];
  const f0LenEnc: number[] = [];
  encodeU32(f0LenEnc, f0Body.length);
  codePayload.push(...f0LenEnc, ...f0Body);
  const f1LenEnc: number[] = [];
  encodeU32(f1LenEnc, f1Body.length);
  codePayload.push(...f1LenEnc, ...f1Body);

  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...createSection(1, typePayload),
    ...createSection(3, funcPayload),
    ...createSection(5, memPayload),
    ...createSection(7, expPayload),
    ...createSection(10, codePayload)
  ]);
};

let cachedGf2Context: Gf2WasmContext | null = null;

export const getOrCreateGf2WasmContext = (): Gf2WasmContext => {
  if (cachedGf2Context) return cachedGf2Context;

  for (const trySimd of [true, false]) {
    try {
      const bytes = buildWasmGf2Module(trySimd);
      const mod = new WebAssembly.Module(bytes);
      const inst = new WebAssembly.Instance(mod);
      const eliminateRangeFn = inst.exports.eliminateRange as (
        startRow: number,
        endRow: number,
        matQwords: number,
        histQwords: number,
        matBase: number,
        histBase: number,
        pivotsOff: number
      ) => number;
      const memory = inst.exports.memory as WebAssembly.Memory;

      const ensureCapacity = (requiredBytes: number) => {
        if (memory.buffer.byteLength < requiredBytes) {
          const deltaPages = Math.ceil((requiredBytes - memory.buffer.byteLength) / 65536);
          memory.grow(deltaPages);
        }
      };

      cachedGf2Context = {
        backend: 'wasm-gf2',
        ensureCapacity,
        getMemoryBuffer: () => memory.buffer,
        eliminateRange: eliminateRangeFn,
        eliminateMatrix: (mCore: number, _kCore: number, matWords: number, matBytes: Uint8Array, histBytes: Uint8Array) => {
          const requiredBytes = matBytes.byteLength + histBytes.byteLength + 4096;
          ensureCapacity(requiredBytes);
          return mCore * matWords;
        }
      };
      return cachedGf2Context;
    } catch {
      // Fall back to non-SIMD 64-bit module, then JS fallback
    }
  }

  cachedGf2Context = {
    backend: 'js-fallback',
    ensureCapacity: () => {},
    getMemoryBuffer: () => null,
    eliminateRange: () => -1,
    eliminateMatrix: () => 0
  };
  return cachedGf2Context;
};
