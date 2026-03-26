import secrets
import os
from pathlib import Path

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./sshkeeper.db")

# Persist secret key to file so it survives restarts
_key_file = Path(__file__).parent.parent / ".secret_key"
if os.getenv("SECRET_KEY"):
    SECRET_KEY = os.getenv("SECRET_KEY")
elif _key_file.exists():
    SECRET_KEY = _key_file.read_text().strip()
else:
    SECRET_KEY = secrets.token_hex(32)
    _key_file.write_text(SECRET_KEY)

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
