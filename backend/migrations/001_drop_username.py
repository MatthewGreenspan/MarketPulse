"""Drops the users.username column.

Login is email-based, so existing users keep working; they lose only the
stored username. Run once, from the backend directory, with the venv active:

    python migrations/001_drop_username.py

This is irreversible. Back up first if the usernames matter:

    pg_dump -t users market_dashboard > users_backup.sql
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text

from database import SessionLocal


def column_exists(db) -> bool:
    return db.execute(
        text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'users' AND column_name = 'username'"
        )
    ).first() is not None


def main() -> int:
    db = SessionLocal()
    try:
        if not column_exists(db):
            print("users.username is already gone. Nothing to do.")
            return 0

        affected = db.execute(text("SELECT COUNT(*) FROM users")).scalar()
        print(f"About to drop users.username. {affected} user row(s) affected.")
        if input("Type 'drop' to continue: ").strip() != "drop":
            print("Cancelled. No changes made.")
            return 1

        db.execute(text("ALTER TABLE users DROP COLUMN username"))
        db.commit()
        print("Dropped users.username.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
