import httpx
import asyncio
import random
from datetime import datetime

API_URL = "http://localhost:8000/api/mes/downtime"

CATEGORIES = [
    ("machine_fault", ["feeder_jam", "nozzle_clog", "head_error", "conveyor_stuck"]),
    ("material_shortage", ["reel_empty", "wrong_component", "missing_reel"]),
    ("program_setup", ["npi_setup", "changeover", "program_edit", "component_pickup"]),
    ("quality_issue", ["spi_fail", "aoi_fail", "first_article_fail"]),
    ("unplanned_other", ["power_outage", "network_issue", "unknown"]),
]

MACHINES = [
    "DECAN-S2-01", "DECAN-S2-02", "DECAN-S2-03",
    "DECAN-L2-01", "CONVEYOR-01", "CONVEYOR-02",
]

event_counter = 0


async def send_event():
    global event_counter
    async with httpx.AsyncClient(timeout=10.0) as client:
        while True:
            cat, subcats = random.choice(CATEGORIES)
            event_counter += 1
            payload = {
                "machine_code": random.choice(MACHINES),
                "category": cat,
                "sub_category": random.choice(subcats),
                "problem_description": f"Simulirani zastoj #{event_counter} - {cat.replace('_', ' ')}",
                "mes_event_id": f"SIM-{datetime.now().strftime('%Y%m%d%H%M%S')}-{event_counter:04d}",
                "source": "mes_simulator",
            }
            try:
                r = await client.post(API_URL, json=payload)
                status = "✅" if r.status_code == 201 else "⚠️"
                print(f"{status} [{datetime.now().strftime('%H:%M:%S')}] #{event_counter} {cat} -> {r.status_code}")
            except Exception as e:
                print(f"❌ [{datetime.now().strftime('%H:%M:%S')}] #{event_counter} Error: {e}")

            delay = random.randint(15, 60)
            print(f"   ⏳ Sledeći događaj za {delay}s...")
            await asyncio.sleep(delay)


async def main():
    print("=" * 50)
    print("  MES Simulator za SMT Downtime Tracker")
    print("=" * 50)
    print(f"\n  API: {API_URL}")
    print(f"  Mašine: {', '.join(MACHINES)}")
    print("  Kategorije: machine_fault, material_shortage, program_setup, quality_issue, unplanned_other")
    print("\n  Pokrećem slanje događaja...")
    print("  CTRL+C za prekid\n")
    print("-" * 50)

    await send_event()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\nSimulator zaustavljen.")