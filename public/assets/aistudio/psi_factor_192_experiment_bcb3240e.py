#!/usr/bin/env python3
"""
Ψ-Factor 192-bit reproducible experiment.
Hybrid stages:
  1) small-prime extraction
  2) wheel trial division (modulus 30)
  3) bounded Fermat attempt
  4) Pollard-Brent rho
All factorization arithmetic is exact integer arithmetic.

IMPORTANT:
- The test semiprime is intentionally unbalanced: 33-bit * 160-bit = 192-bit.
- This makes Pollard-Brent demonstrable on an ordinary machine.
- It is NOT evidence that a balanced 192-bit semiprime is easy to factor.
- Energy is an estimate from an explicit configurable model, not a hardware measurement.
- Miller-Rabin is a probable-prime check, not a primality certificate.
"""

from math import gcd, isqrt
from time import perf_counter

# Known prime factors; their product is exactly 192 bits.
P_KNOWN = 4296201881
Q_KNOWN = 730750818665451459101842416368018053038089728337
N = P_KNOWN * Q_KNOWN

# Reproducible energy model (illustrative defaults; calibrate for your CPU).
# Units: joules per counted operation.
ENERGY_PER_MODULAR_MULTIPLY = 2.0e-9
ENERGY_PER_GCD = 8.0e-9
ENERGY_PER_MODULAR_REDUCTION = 1.0e-9
ENERGY_PER_INTEGER_DIVISION = 3.0e-9
ENERGY_PER_OTHER_STEP = 0.2e-9
IDLE_POWER_WATTS = 0.0  # Set to a measured incremental/idle power if desired.

class Counters:
    def __init__(self):
        self.modular_multiplies = 0
        self.gcd_calls = 0
        self.modular_reductions = 0
        self.integer_divisions = 0
        self.other_steps = 0
        self.fermat_steps = 0
        self.rho_iterations = 0
        self.trial_candidates = 0

    def total(self):
        return (self.modular_multiplies + self.gcd_calls +
                self.modular_reductions + self.integer_divisions +
                self.other_steps)

def is_probable_prime(n, rounds=16):
    """Miller-Rabin probable-prime test; suitable for experiment screening."""
    if n < 2:
        return False
    small = (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37)
    for p in small:
        if n == p:
            return True
        if n % p == 0:
            return False
    d, s = n - 1, 0
    while d % 2 == 0:
        d //= 2
        s += 1
    # Fixed bases make this experiment reproducible.
    bases = (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37,
             41, 43, 47, 53)[:rounds]
    for a in bases:
        if a >= n:
            continue
        x = pow(a, d, n)
        if x in (1, n - 1):
            continue
        for _ in range(s - 1):
            x = (x * x) % n
            if x == n - 1:
                break
        else:
            return False
    return True

def pollard_brent(n, ctr, seed=2, c=1, batch=64, iteration_limit=2_000_000):
    """Pollard-Brent rho with operation counters and a hard iteration limit."""
    if n % 2 == 0:
        return 2
    y, r, q = seed % n, 1, 1
    g, x, ys = 1, 0, 0

    while g == 1:
        x = y
        for _ in range(r):
            y = (y * y + c) % n
            ctr.modular_multiplies += 1
            ctr.modular_reductions += 1
            ctr.rho_iterations += 1
            if ctr.rho_iterations > iteration_limit:
                return None

        k = 0
        while k < r and g == 1:
            ys = y
            lim = min(batch, r - k)
            for _ in range(lim):
                y = (y * y + c) % n
                diff = abs(x - y)
                q = (q * diff) % n
                ctr.modular_multiplies += 2
                ctr.modular_reductions += 2
                ctr.rho_iterations += 1
                if ctr.rho_iterations > iteration_limit:
                    return None
            g = gcd(q, n)
            ctr.gcd_calls += 1
            k += lim
        r *= 2

    if g == n:
        while True:
            ys = (ys * ys + c) % n
            ctr.modular_multiplies += 1
            ctr.modular_reductions += 1
            g = gcd(abs(x - ys), n)
            ctr.gcd_calls += 1
            ctr.rho_iterations += 1
            if g > 1 or ctr.rho_iterations > iteration_limit:
                break

    return g if 1 < g < n else None

def factor_psi(n, ctr, wheel_limit=100_000, fermat_limit=2_000):
    """Hybrid exact factor search for the supplied benchmark."""
    # Stage 1: small-prime extraction
    factors = []
    small_primes = (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47)
    for p in small_primes:
        while n % p == 0:
            factors.append(p)
            n //= p
            ctr.integer_divisions += 1
        ctr.other_steps += 1

    if n == 1:
        return factors

    # Stage 2: wheel-30 candidates: 1,7,11,13,17,19,23,29 mod 30
    residues = (1, 7, 11, 13, 17, 19, 23, 29)
    d = 7
    while d <= wheel_limit and d <= isqrt(n):
        if d % 30 in residues:
            ctr.trial_candidates += 1
            if n % d == 0:
                while n % d == 0:
                    factors.append(d)
                    n //= d
                    ctr.integer_divisions += 1
                if n == 1:
                    return factors
        d += 2
        ctr.other_steps += 1

    # Stage 3: bounded Fermat attempt (most useful for close factors)
    a = isqrt(n)
    if a * a < n:
        a += 1
    for _ in range(fermat_limit):
        b2 = a * a - n
        b = isqrt(b2)
        ctr.fermat_steps += 1
        ctr.other_steps += 1
        if b * b == b2:
            f1, f2 = a - b, a + b
            if f1 > 1 and f2 > 1 and f1 * f2 == n:
                factors.extend((f1, f2))
                return factors
        a += 1

    # Stage 4: Pollard-Brent with reproducible parameter retries
    for seed, c in ((2, 1), (3, 1), (2, 3), (5, 7), (11, 13)):
        g = pollard_brent(n, ctr, seed=seed, c=c)
        if g is not None and 1 < g < n and n % g == 0:
            factors.extend((g, n // g))
            return factors

    # If no divisor found, return residual; caller checks probable primality.
    factors.append(n)
    return factors

def estimated_energy_j(ctr, elapsed_seconds):
    operation_energy = (
        ctr.modular_multiplies * ENERGY_PER_MODULAR_MULTIPLY +
        ctr.gcd_calls * ENERGY_PER_GCD +
        ctr.modular_reductions * ENERGY_PER_MODULAR_REDUCTION +
        ctr.integer_divisions * ENERGY_PER_INTEGER_DIVISION +
        ctr.other_steps * ENERGY_PER_OTHER_STEP
    )
    return operation_energy + IDLE_POWER_WATTS * elapsed_seconds

def main():
    assert N.bit_length() == 192
    ctr = Counters()

    t0 = perf_counter()
    found = factor_psi(N, ctr)
    elapsed = perf_counter() - t0

    found_sorted = sorted(found)
    expected_sorted = sorted((P_KNOWN, Q_KNOWN))
    product_ok = 1
    for f in found_sorted:
        product_ok *= f

    product_ok = (product_ok == N)
    matches_known = (found_sorted == expected_sorted)
    probable_prime_checks = all(is_probable_prime(f) for f in found_sorted)
    energy = estimated_energy_j(ctr, elapsed)

    print("=== Ψ-Factor / 192-bit hybrid experiment ===")
    print(f"N bits                 : {N.bit_length()}")
    print(f"N                      : {N}")
    print(f"Known factors          : {P_KNOWN} * {Q_KNOWN}")
    print(f"Found factors          : {found_sorted}")
    print(f"Elapsed time (seconds) : {elapsed:.6f}")
    print(f"Counted operations     : {ctr.total():,}")
    print(f"  modular multiplies   : {ctr.modular_multiplies:,}")
    print(f"  modular reductions   : {ctr.modular_reductions:,}")
    print(f"  gcd calls            : {ctr.gcd_calls:,}")
    print(f"  integer divisions    : {ctr.integer_divisions:,}")
    print(f"  other steps          : {ctr.other_steps:,}")
    print(f"  wheel candidates     : {ctr.trial_candidates:,}")
    print(f"  Fermat steps         : {ctr.fermat_steps:,}")
    print(f"  Pollard rho iters    : {ctr.rho_iterations:,}")
    print(f"Estimated energy (J)   : {energy:.9e}")
    print(f"Product verification   : {'PASS' if product_ok else 'FAIL'}")
    print(f"Known-factor match     : {'PASS' if matches_known else 'FAIL'}")
    print(f"Miller-Rabin checks    : {'PASS (probable prime)' if probable_prime_checks else 'FAIL'}")
    print()
    print("Energy model parameters:")
    print(f"  E_modmul = {ENERGY_PER_MODULAR_MULTIPLY:.2e} J/op")
    print(f"  E_gcd    = {ENERGY_PER_GCD:.2e} J/op")
    print(f"  E_mod    = {ENERGY_PER_MODULAR_REDUCTION:.2e} J/op")
    print(f"  E_div    = {ENERGY_PER_INTEGER_DIVISION:.2e} J/op")
    print()
    print("Interpretation: energy is a model-based estimate, not a measured CPU reading.")
    print("Benchmark limitation: this is an unbalanced 33-bit × 160-bit semiprime.")
    print("A balanced 96-bit × 96-bit semiprime is a substantially harder test.")

    if not (product_ok and matches_known and probable_prime_checks):
        raise SystemExit("VALIDATION FAILED")

if __name__ == "__main__":
    main()
