"""
Setup script to create Supabase tables via direct Postgres connection.
Since we can't run raw SQL via the anon key REST API,
run the SQL in supabase_schema.sql via the Supabase Dashboard SQL Editor:

1. Go to https://supabase.com/dashboard/project/bznswadiiqulyzpkajqp/sql
2. Paste the contents of ../supabase_schema.sql
3. Click "Run"

Also create a storage bucket called "media":
1. Go to https://supabase.com/dashboard/project/bznswadiiqulyzpkajqp/storage/buckets
2. Create a new bucket called "media" with public access enabled
"""

import httpx
import sys

SUPABASE_URL = "https://bznswadiiqulyzpkajqp.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6bnN3YWRpaXF1bHl6cGthanFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3NjQzMjQsImV4cCI6MjA3NzM0MDMyNH0.AkVhwJUNM1NKGjR4b5qjEjAfNkszVpqE4TYK7qwxmVM"


def check_tables():
    """Check if tables exist by trying to query them."""
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    }

    tables = ["projects", "clips", "sections", "tracks", "pipeline_events"]

    for table in tables:
        r = httpx.get(f"{SUPABASE_URL}/rest/v1/{table}?select=*&limit=1", headers=headers)
        if r.status_code == 200:
            print(f"  ✓ {table} exists")
        else:
            print(f"  ✗ {table} NOT FOUND - run supabase_schema.sql in the dashboard")
            return False

    return True


def check_storage():
    """Check if media storage bucket exists."""
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    }

    r = httpx.get(f"{SUPABASE_URL}/storage/v1/bucket", headers=headers)
    if r.status_code == 200:
        buckets = r.json()
        media_exists = any(b.get("name") == "media" for b in buckets)
        if media_exists:
            print("  ✓ media storage bucket exists")
            return True
        else:
            print("  ✗ media storage bucket NOT FOUND")
            # Try to create it
            r2 = httpx.post(
                f"{SUPABASE_URL}/storage/v1/bucket",
                headers={**headers, "Content-Type": "application/json"},
                json={"id": "media", "name": "media", "public": True}
            )
            if r2.status_code in (200, 201):
                print("  ✓ media storage bucket created!")
                return True
            else:
                print(f"  Could not create bucket: {r2.text}")
                print("  Create it manually in the Supabase dashboard")
                return False
    return False


if __name__ == "__main__":
    print("\n🔍 Checking Supabase setup...\n")

    print("Tables:")
    tables_ok = check_tables()

    print("\nStorage:")
    storage_ok = check_storage()

    if tables_ok and storage_ok:
        print("\n✅ All good! Database and storage are ready.\n")
    else:
        print("\n⚠️  Setup incomplete. Please:")
        if not tables_ok:
            print("  1. Go to https://supabase.com/dashboard/project/bznswadiiqulyzpkajqp/sql")
            print("  2. Paste contents of supabase_schema.sql and run it")
        if not storage_ok:
            print("  3. Go to https://supabase.com/dashboard/project/bznswadiiqulyzpkajqp/storage/buckets")
            print("  4. Create a public bucket called 'media'")
        print()
        sys.exit(1)
