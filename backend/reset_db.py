"""Reset the database to a clean state.  DESTRUCTIVE.

Drops every table (deleting ALL users, watchlists, alerts, and price history),
recreates the schema from the current models (this is how the UUID primary keys
get applied), and reseeds the asset list. Use it to clear test accounts or to
apply a schema change.

    venv/Scripts/python.exe reset_db.py --yes

Without --yes it only describes what it would do, so it can't wipe data by accident.
"""
import sys

import models  # noqa: F401 — importing registers every table on Base.metadata
from database import engine, SessionLocal
from seed import seed


def main():
    if "--yes" not in sys.argv:
        print("This DELETES ALL DATA (users, watchlists, alerts, prices) and reseeds assets.")
        print("Re-run to confirm:  python reset_db.py --yes")
        return

    models.Base.metadata.drop_all(bind=engine)
    models.Base.metadata.create_all(bind=engine)
    print("Schema dropped and recreated.")

    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()
    print("Assets reseeded. Database is clean.")


if __name__ == "__main__":
    main()
