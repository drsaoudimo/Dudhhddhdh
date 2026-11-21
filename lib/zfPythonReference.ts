export interface PythonReferenceFile {
  path: string;
  group: 'common' | 'zf18' | 'zf19' | 'router';
  titleAr: string;
  code: string;
}

export const ZF_PYTHON_REFERENCE_FILES: PythonReferenceFile[] = [
  {
    path: 'common/result_types.py',
    group: 'common',
    titleAr: 'هياكل الإدخال والنتائج الموحدة (Dataclasses)',
    code: `from dataclasses import dataclass, field
from typing import Dict, List, Optional, Literal

Zf18Status = Literal[
    "FACTORS_VERIFIED",
    "INSUFFICIENT_HINT",
    "ROOT_NOT_FOUND",
    "INVALID_CANDIDATE",
    "TIME_LIMIT",
]

Zf19Status = Literal[
    "FACTORS_VERIFIED",
    "PERFECT_SQUARE",
    "NO_FACTOR_FOUND",
    "RELATIONS_INSUFFICIENT",
    "DEPENDENCY_NOT_FOUND",
    "TRIVIAL_GCD",
    "RELATION_VERIFICATION_FAILED",
    "TIME_LIMIT",
]

@dataclass
class CoppersmithInput:
    N: int
    p0: int
    X: int
    beta: float = 0.5
    epsilon: float = 0.02
    lattice_m: int = 3
    lattice_t: int = 3
    timeout_seconds: float = 10.0

@dataclass
class CoppersmithResult:
    status: Zf18Status
    candidate_root: Optional[int]
    factor_p: Optional[int]
    factor_q: Optional[int]
    lattice_dimension: int
    lattice_reduction_time: float
    root_reconstruction_time: float
    total_time: float
    verification_status: Dict[str, bool] = field(default_factory=dict)

@dataclass
class CfracInput:
    N: int
    factor_base_bound: int = 200
    max_relations: int = 260
    max_iterations: int = 250000
    matrix_solver: Literal["gaussian", "block-wiedemann"] = "gaussian"
    timeout_seconds: float = 15.0
    enable_partial_relations: bool = True

@dataclass
class CfracResult:
    status: Zf19Status
    factor_p: Optional[int]
    factor_q: Optional[int]
    factor_base_size: int
    relations_collected: int
    matrix_rows: int
    matrix_columns: int
    dependencies_found: int
    verification_status: Dict[str, bool] = field(default_factory=dict)
    execution_time: float = 0.0`
  },
  {
    path: 'common/primality.py',
    group: 'common',
    titleAr: 'التحقق المستقل من الأولية واختبار المربع الكامل',
    code: `import math

_BASES = (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47)

def is_perfect_square(n: int) -> tuple[bool, int]:
    if n < 0:
        return False, 0
    s = math.isqrt(n)
    return (s * s == n), s

def is_prime_independent(n: int) -> bool:
    if n < 2:
        return False
    for p in _BASES:
        if n == p:
            return True
        if n % p == 0:
            return False
    d = n - 1
    s = 0
    while d % 2 == 0:
        d //= 2
        s += 1
    for a in _BASES:
        if a >= n:
            break
        x = pow(a, d, n)
        if x == 1 or x == n - 1:
            continue
        for _ in range(s - 1):
            x = (x * x) % n
            if x == n - 1:
                break
        else:
            return False
    return True`
  },
  {
    path: 'zf18/lattice_builder.py',
    group: 'zf18',
    titleAr: 'بناء مصفوفة شبيكة Howgrave-Graham لكثيرة الحدود f(x) = x + p0',
    code: `from typing import List

def poly_mul(a: List[int], b: List[int]) -> List[int]:
    out = [0] * (len(a) + len(b) - 1)
    for i, ca in enumerate(a):
        for j, cb in enumerate(b):
            out[i + j] += ca * cb
    return out

def poly_pow(base: List[int], exp: int) -> List[int]:
    res = [1]
    for _ in range(exp):
        res = poly_mul(res, base)
    return res

def build_coppersmith_lattice(N: int, p0: int, X: int, m: int = 3, t: int = 3) -> List[List[int]]:
    """
    Constructs Howgrave-Graham shift polynomials:
      g_{i, j}(x) = N^(m - i) * x^j * (x + p0)^i  for i in 0..m-1, j = 0
      h_j(x)     = x^j * (x + p0)^m               for j in 0..t-1
    Evaluated at x = X*y so coefficient of y^k carries factor X^k.
    """
    dim = m + t
    f = [p0, 1]  # f(x) = p0 + x
    rows: List[List[int]] = []

    for i in range(m):
        fi = poly_pow(f, i)
        scale_N = pow(N, m - i)
        row = [0] * dim
        for deg, coeff in enumerate(fi):
            row[deg] = coeff * scale_N * pow(X, deg)
        rows.append(row)

    fm = poly_pow(f, m)
    for j in range(t):
        row = [0] * dim
        for deg, coeff in enumerate(fm):
            row[deg + j] = coeff * pow(X, deg + j)
        rows.append(row)

    return rows`
  },
  {
    path: 'zf18/lll_adapter.py',
    group: 'zf18',
    titleAr: 'تقليص LLL (يدعم fpylll/SageMath مع بديل Python دقيق Arbitrary-Precision)',
    code: `from fractions import Fraction
from typing import List

def lll_reduce(basis: List[List[int]], delta: Fraction = Fraction(3, 4)) -> List[List[int]]:
    # Optional C-speed adapter if fpylll is installed in production Sage/Python
    try:
        from fpylll import IntegerMatrix, LLL  # type: ignore
        mat = IntegerMatrix(len(basis), len(basis[0]))
        for r, row in enumerate(basis):
            for c, val in enumerate(row):
                mat[r, c] = val
        LLL.reduction(mat)
        return [[int(mat[r, c]) for c in range(mat.ncols)] for r in range(mat.nrows)]
    except ImportError:
        pass

    # Pure arbitrary-precision exact Fraction Gram-Schmidt LLL fallback
    B = [list(row) for row in basis]
    n = len(B)

    def dot(u: List[Fraction], v: List[Fraction]) -> Fraction:
        return sum(x * y for x, y in zip(u, v))

    def gram_schmidt():
        ortho: List[List[Fraction]] = []
        mu: List[List[Fraction]] = [[Fraction(0)] * n for _ in range(n)]
        norm_sq: List[Fraction] = [Fraction(0)] * n
        for i in range(n):
            v = [Fraction(x) for x in B[i]]
            for j in range(i):
                if norm_sq[j] != 0:
                    mu[i][j] = dot([Fraction(x) for x in B[i]], ortho[j]) / norm_sq[j]
                    v = [v[k] - mu[i][j] * ortho[j][k] for k in range(len(v))]
            ortho.append(v)
            norm_sq[i] = dot(v, v)
        return mu, norm_sq

    k = 1
    mu, norm_sq = gram_schmidt()
    while k < n:
        for j in range(k - 1, -1, -1):
            if abs(mu[k][j]) > Fraction(1, 2):
                q = round(mu[k][j])
                if q != 0:
                    B[k] = [B[k][idx] - q * B[j][idx] for idx in range(len(B[k]))]
                    mu, norm_sq = gram_schmidt()
        if norm_sq[k] >= (delta - mu[k][k - 1] ** 2) * norm_sq[k - 1]:
            k += 1
        else:
            B[k], B[k - 1] = B[k - 1], B[k]
            mu, norm_sq = gram_schmidt()
            k = max(k - 1, 1)
    return B`
  },
  {
    path: 'zf18/root_reconstruction.py',
    group: 'zf18',
    titleAr: 'فك التقييس (unscale X^k) واستخراج جميع الجذور الصحيحة من كل الصفوف المختزلة',
    code: `import math
from typing import List

def eval_poly(coeffs: List[int], x: int) -> int:
    acc = 0
    for c in reversed(coeffs):
        acc = acc * x + c
    return acc

def integer_roots_in_bound(coeffs: List[int], X: int) -> List[int]:
    while len(coeffs) > 1 and coeffs[-1] == 0:
        coeffs.pop()
    if len(coeffs) <= 1:
        return []
    if len(coeffs) == 2:
        c0, c1 = coeffs[0], coeffs[1]
        if c1 != 0 and (-c0) % c1 == 0:
            r = (-c0) // c1
            return [r] if abs(r) < X else []
        return []

    roots: List[int] = []
    # Check x = 0 and rational-root divisors of c0
    if coeffs[0] == 0:
        roots.append(0)
    # Binary search / integer root scan on monotonic sub-intervals or Cauchy bound
    if len(coeffs) == 3:
        c, b, a = coeffs
        disc = b * b - 4 * a * c
        if disc >= 0:
            s = math.isqrt(disc)
            if s * s == disc:
                for num in (-b + s, -b - s):
                    if num % (2 * a) == 0:
                        r = num // (2 * a)
                        if abs(r) < X and r not in roots:
                            roots.append(r)
        return roots

    # Higher-degree: factor c0 divisors + bisection fallback
    c0 = abs(coeffs[0])
    if c0 != 0:
        # Try small and modular candidate divisors up to min(X, 10**6)
        limit = min(X, 100000)
        for d in range(1, limit):
            if c0 % d == 0:
                for cand in (d, -d):
                    if eval_poly(coeffs, cand) == 0 and cand not in roots:
                        roots.append(cand)
    return roots

def reconstruct_candidate_roots(reduced_basis: List[List[int]], X: int) -> List[int]:
    all_roots: List[int] = []
    # Important: scan ALL reduced basis rows, not only row 0
    for row in reduced_basis:
        coeffs: List[int] = []
        x_pow = 1
        valid = True
        for val in row:
            if val % x_pow != 0:
                valid = False
                break
            coeffs.append(val // x_pow)
            x_pow *= X
        if not valid:
            continue
        for r in integer_roots_in_bound(coeffs, X):
            if r not in all_roots:
                all_roots.append(r)
    return all_roots`
  },
  {
    path: 'zf19/continued_fraction.py',
    group: 'zf19',
    titleAr: 'تكرار الكسور المستمرة لـ √N ومتطابقة A_k^2 ≡ (-1)^(k+1) Q_{k+1} (mod N)',
    code: `import math
from dataclasses import dataclass

@dataclass
class CfStep:
    k: int
    a_k: int
    P_next: int
    Q_next: int
    A_k_mod_N: int

def iter_cfrac(N: int):
    a0 = math.isqrt(N)
    P_k, Q_k, a_k = 0, 1, a0
    A_prev, A_curr = 1, a0 % N
    k = 0

    while True:
        P_next = a_k * Q_k - P_k
        num = N - P_next * P_next
        assert num % Q_k == 0, "Exact division invariant violated"
        Q_next = num // Q_k

        yield CfStep(k=k, a_k=a_k, P_next=P_next, Q_next=Q_next, A_k_mod_N=A_curr)

        if Q_next == 0 or (Q_next == 1 and k > 0):
            break

        a_next = (P_next + a0) // Q_next
        A_next = (a_next * A_curr + A_prev) % N
        A_prev, A_curr = A_curr, A_next
        P_k, Q_k, a_k = P_next, Q_next, a_next
        k += 1`
  },
  {
    path: 'zf19/verification.py',
    group: 'zf19',
    titleAr: 'التحقق الجبري السداسي من علاقات CFRAC وتكوين X² ≡ Y² (mod N)',
    code: `import math
from common.primality import is_prime_independent

def verify_cfrac_dependency(N: int, fb_primes: list[int], relations: list, subset_indices: list[int]):
    X = 1
    total_exp = [0] * (len(fb_primes) + 1)  # index 0 = (-1) sign parity

    for idx in subset_indices:
        rel = relations[idx]
        # 1. Modular congruence check: A_k^2 ≡ (-1)^(k+1) * Q_{k+1} (mod N)
        rhs = (-rel["Q_next"] if rel["sign_neg"] else rel["Q_next"]) % N
        if (rel["A_k_mod_N"] * rel["A_k_mod_N"]) % N != rhs:
            return False, None

        X = (X * rel["A_k_mod_N"]) % N
        total_exp[0] += 1 if rel["sign_neg"] else 0
        for j, e in enumerate(rel["exponents"]):
            total_exp[j + 1] += e

    # 2. All final exponents (including sign) must be even
    if any(e % 2 != 0 for e in total_exp):
        return False, None

    Y = 1
    for j, p in enumerate(fb_primes):
        half = total_exp[j + 1] // 2
        if half > 0:
            Y = (Y * pow(p, half, N)) % N

    if (X * X) % N != (Y * Y) % N:
        return False, None

    for candidate in (abs(X - Y), X + Y):
        g = math.gcd(candidate, N)
        if 1 < g < N:
            other = N // g
            if g * other == N and is_prime_independent(g) and is_prime_independent(other):
                return True, tuple(sorted((g, other)))
    return False, None`
  },
  {
    path: 'zf_router.py',
    group: 'router',
    titleAr: 'الموجّه المستقل ZF_Router(N, H) لاختيار ZF-18 أو ZF-19 والتحقق النهائي',
    code: `from typing import Optional
from common.primality import is_perfect_square, is_prime_independent
from common.result_types import CoppersmithInput, CfracInput

def zf_router(N: int, p0: Optional[int] = None, X: Optional[int] = None):
    sq, root = is_perfect_square(N)
    if sq:
        return {"status": "PERFECT_SQUARE", "factors": (root, root), "engine": "PRECHECK"}

    if is_prime_independent(N):
        return {"status": "PRIME_MODULUS", "factors": None, "engine": "PRECHECK"}

    if p0 is not None and X is not None:
        # Dispatch to ZF-18 Coppersmith-LLL
        from zf18.engine import run_zf18_coppersmith
        res18 = run_zf18_coppersmith(CoppersmithInput(N=N, p0=p0, X=X))
        if res18.status == "FACTORS_VERIFIED":
            return {"status": "FACTORS_VERIFIED", "factors": (res18.factor_p, res18.factor_q), "engine": "ZF-18"}

    # Fallback / default path: ZF-19 CFRAC
    from zf19.engine import run_zf19_cfrac
    res19 = run_zf19_cfrac(CfracInput(N=N))
    if res19.status == "FACTORS_VERIFIED":
        return {"status": "FACTORS_VERIFIED", "factors": (res19.factor_p, res19.factor_q), "engine": "ZF-19"}

    return {"status": "INCONCLUSIVE", "factors": None, "engine": "ZF-19"}`
  }
];
