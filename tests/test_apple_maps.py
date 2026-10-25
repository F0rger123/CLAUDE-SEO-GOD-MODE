"""Offline test: the Apple Maps auth token is a valid ES256 JWT with scope server_api. No Apple account needed."""
import base64
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from unittest import mock
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
try:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
    HAVE = True
except ImportError:
    HAVE = False


def b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


@unittest.skipUnless(HAVE, "cryptography not installed")
class AppleTokenTest(unittest.TestCase):
    def test_jwt(self):
        key = ec.generate_private_key(ec.SECP256R1())
        with tempfile.TemporaryDirectory() as d:
            p8 = Path(d) / "AuthKey_TEST123456.p8"
            p8.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                             serialization.NoEncryption()))
            env = dict(APPLE_MAPS_TEAM_ID="TEAM123456", APPLE_MAPS_KEY_ID="KEY1234567", APPLE_MAPS_KEY_FILE=str(p8))
            with mock.patch.dict(os.environ, env):  # don't leak fake credentials into other tests
                spec = importlib.util.spec_from_file_location("apple_maps", ROOT / "scripts/integrations/apple_maps.py")
                mod = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(mod)
                token = mod.auth_jwt()
        h, p, sig = token.split(".")
        self.assertEqual(json.loads(b64d(h)), {"alg": "ES256", "kid": "KEY1234567", "typ": "JWT"})
        claims = json.loads(b64d(p))
        self.assertEqual((claims["iss"], claims["scope"]), ("TEAM123456", "server_api"))
        self.assertGreater(claims["exp"], claims["iat"])
        raw = b64d(sig)
        der = encode_dss_signature(int.from_bytes(raw[:32], "big"), int.from_bytes(raw[32:], "big"))
        key.public_key().verify(der, f"{h}.{p}".encode(), ec.ECDSA(hashes.SHA256()))  # raises if invalid


if __name__ == "__main__":
    unittest.main()
