"""
Clean seed script - creates only teams, users, machines (NO downtime events)
Run this on fresh database for clean Monday start.
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import AsyncSessionLocal, init_db
from app.models.user import Team, User, UserRole
from app.models.machine import Machine, MachineType
from app.core.security import get_password_hash


async def seed_clean():
    await init_db()
    async with AsyncSessionLocal() as db:
        from sqlalchemy import select, func
        result = await db.execute(select(func.count()).select_from(Team))
        if result.scalar() > 0:
            print("Data already exists, skipping seed.")
            return

        teams_data = [
            ("MAINT", "Maintenance", get_password_hash("1234")),
            ("PROCESS", "Process", get_password_hash("1234")),
            ("PROD", "Production", get_password_hash("1234")),
            ("QUALITY", "Quality Control", get_password_hash("1234")),
            ("PLANNER", "Planners", get_password_hash("1234")),
        ]
        teams = {}
        for code, name, pin in teams_data:
            t = Team(code=code, name=name, pin_code=pin)
            db.add(t)
            await db.flush()
            teams[code] = t

        users_data = [
            ("$EOP1", "Operator 1", "PROCESS", "admin", "3698"),
            ("$EOP2", "Operator 2", "PLANNER", "planner", "1234"),
            ("$EOP3", "Operator 3", "PROCESS", "process", "1234"),
            ("$EOP4", "Operator 4", "PROD", "operator", "1234"),
            ("$EOP5", "Operator 5", "PROD", "operator", "1234"),
            ("$EOP6", "Operator 6", "PROD", "operator", "1234"),
            ("$EOP7", "Operator 7", "MAINT", "maintenance", "1234"),
            ("$EOP8", "Operator 8", "PROCESS", "process", "1234"),
            ("$EOP9", "Operator 9", "PROCESS", "process", "1234"),
            ("$EOP10", "Operator 10", "PROD", "admin", "1234"),
            ("$EOP11", "Operator 11", "QUALITY", "quality", "1234"),
            ("$EOP12", "Operator 12", "QUALITY", "quality", "1234"),
        ]
        for badge, name, team_code, role, pin in users_data:
            u = User(
                badge_code=badge,
                full_name=name,
                team_id=teams[team_code].id if team_code else None,
                role=UserRole(role),
                pin_code=get_password_hash(pin),
            )
            db.add(u)
            await db.flush()

        machines_data = [
            ("SMT-PICK-01", "Pick & Place #1", "SMT-01", "DECAN_S2"),
            ("SMT-PICK-02", "Pick & Place #2", "SMT-01", "DECAN_S2"),
            ("SMT-PICK-03", "Pick & Place #3", "SMT-01", "DECAN_L2"),
            ("SMT-PICK-04", "Pick & Place #4", "SMT-01", "DECAN_L2"),
            ("SMT-TRAY-01", "Tray Feeder #1", "SMT-01", "STF100S"),
            ("SMT-CONV-01", "Conveyor In", "SMT-01", "CONVEYOR"),
            ("SMT-CONV-02", "Conveyor Out", "SMT-01", "CONVEYOR"),
            ("SMT-SPI-01", "SPI", "SMT-01", "SPI"),
            ("SMT-AOI-01", "AOI", "SMT-01", "AOI"),
            ("SMT-REFLOW-01", "Reflow Oven", "SMT-01", "REFLOW"),
            ("SMT-PRINTER-01", "Printer", "SMT-01", "PRINTER"),
        ]
        for code, name, line, mtype in machines_data:
            m = Machine(code=code, name=name, line=line, type=MachineType(mtype))
            db.add(m)
            await db.flush()

        await db.commit()
        print("\n[OK] Clean seed data created successfully!")
