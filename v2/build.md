# Project SSH Keeper
##### (Name TBD)

## Features
- Stores SSH servers with their IP, port, and username for easy connection
- Allows adding tasks per server (stored locally, not on the SSH server)
- Tasks can be checked off
- Clean interface with theme options including light/dark backgrounds and customisable accent colours
- Easy to use
- Copy buttons for SSH connection commands — no terminal launching

## Build

This system should allow users to easily store SSH credentials (excluding passwords) and connect via copy buttons — copying the `ssh <user>@<ip> -p <port>` command to clipboard for pasting into any terminal.

The app should be clean and minimal with a faint sci-fi aesthetic. A settings button should open a page for configuring layout, theme, password, username, 2FA, etc.

Servers should support pagination and a search bar filtered by name. Each server should have the following fields: name, default IP, secondary IP/URL, port, SSH user, notes.

There should also be a quick-action copy button that copies an htop/btop monitoring command for that server.

Deleting a server should require the user to type the server's name as confirmation.

On first launch, the app should prompt the user to create an account with a strong password and set up 2FA (TOTP via pyotp — compatible with Google Authenticator / Authy).

Password storage must follow good security practices — no plaintext, use argon2 with salt.

Tasks can be added to any server after creation without entering the server edit view — just a quick-add button that opens a small input. Tasks display as a checklist with tick boxes.

## Tech Stack
- **Backend:** Python, FastAPI
- **Auth:** JWT (python-jose or PyJWT) for session tokens, pyotp for TOTP 2FA, argon2-cffi for password hashing
- **Frontend:** Native HTML/CSS (no frameworks), served via FastAPI static/template files
- **Database:** SQLite via SQLAlchemy or raw sqlite3
- **No terminal launching** — copy to clipboard only

## Database Schema (suggested)

**users:** id, username, email, hashed_password, totp_secret, created_at

**servers:** id, name, default_ip, secondary_ip, port, ssh_user, notes, created_at

**tasks:** id, server_id (FK), description, completed (bool), created_at