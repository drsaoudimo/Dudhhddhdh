const pubKeyDetails = {
  "kty": "RSA",
  "n": "iVnCEqxuMxWubaslm4n9dIGCYNztowPET6Mc7ex7xa4BdkxTc4wvZiuAPO75j0Z9enQyckuneH-mpCozTTwLAw",
  "e": "AQAB",
  "d": "GOe1KKSqkMnIKKuldJgnZLZNGVpGHs6CjLwzdTLx2Iyp9OemO04nd-D8zJ7H12JmJa6WRRpTCHY_OWK8Pk42qQ",
  "p": "zq0qSaROdbl06KDbM65iccZPpYbp8EgByFFWGy3iFts",
  "q": "qiEnOiQcMwXQWmp8F92W8cwPhqsFgsf7rCi2vWU8cPk",
  "dp": "GeZ_lyz9HCm6qfCGp-phseptTswigxczCfyPcuaEH-M",
  "dq": "c61hL7430lWEqsW2pL-Nj9ExSV7lu1vg-tkgD71TEHk",
  "qi": "i0rhXJT1m_vcRY7b0wU81-aDwoR0gkD1FNX7hRLpxLE"
};

function base64UrlToBigInt(b64url) {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const buf = Buffer.from(b64, 'base64');
  return BigInt('0x' + buf.toString('hex'));
}

console.log('N (Modulus):', base64UrlToBigInt(pubKeyDetails.n).toString());
console.log('e (Public Exponent):', base64UrlToBigInt(pubKeyDetails.e).toString());
console.log('d (Private Exponent):', base64UrlToBigInt(pubKeyDetails.d).toString());
console.log('p (Prime 1):', base64UrlToBigInt(pubKeyDetails.p).toString());
console.log('q (Prime 2):', base64UrlToBigInt(pubKeyDetails.q).toString());

