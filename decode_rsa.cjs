const crypto = require('crypto');

const pubKeyPem = `-----BEGIN PUBLIC KEY-----
MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAIlZwhKsbjMVrm2rJZuJ/XSBgmDc7aMDxE+jHO3se8WuAXZMU3OML2YrgDzu+Y9GfXp0MnJLp3h/pqQqM008CwMCAwEAAQ==
-----END PUBLIC KEY-----`;

const privKeyPem = `-----BEGIN RSA PRIVATE KEY-----
MIIBVAIBADANBgkqhkiG9w0BAQEFAASCAT4wggE6AgEAAkEAiVnCEqxuMxWubaslm4n9dIGCYNztowPET6Mc7ex7xa4BdkxTc4wvZiuAPO75j0Z9enQyckuneH+mpCozTTwLAwIDAQABAkAY57UopKqQycgoq6V0mCdktk0ZWkYezoKMvDN1MvHYjKn056Y7Tid34PzMnsfXYmYlrpZFGlMIdj85Yrw+TjapAiEAzq0qSaROdbl06KDbM65iccZPpYbp8EgByFFWGy3iFtsCIQCqISc6JBwzBdBaanwX3ZbxzA+GqwWCx/usKLa9ZTxw+QIgGeZ/lyz9HCm6qfCGp+phseptTswigxczCfyPcuaEH+MCIHOtYS++N9JVhKrFtqS/jY/RMUle5btb4PrZIA+9UxB5AiEAi0rhXJT1m/vcRY7b0wU81+aDwoR0gkD1FNX7hRLpxLE=
-----END RSA PRIVATE KEY-----`;

const pubObj = crypto.createPublicKey(pubKeyPem);
console.log("Public Key details:");
console.log(JSON.stringify(pubObj.export({ format: 'jwk' }), null, 2));

const privObj = crypto.createPrivateKey(privKeyPem);
console.log("Private Key details:");
console.log(JSON.stringify(privObj.export({ format: 'jwk' }), null, 2));
