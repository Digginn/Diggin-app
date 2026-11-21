"""Apply only the reviewed Auth settings after the corresponding DB migration."""

import argparse
import json
import os
from urllib.error import HTTPError
from urllib.request import Request, urlopen


HOOK = "pg-functions://postgres/private/reject_public_email_signup"
CHARACTERS = r"""abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789:!@#$%^&*()_+-=[]{};'\\:"|<>?,./`~"""
PROJECTS = {"development": "rrlxfzddufutsmwcymci", "production": "hymfhaowjyzuennxphfz"}


def auth_config(project, token, changes=None):
    request = Request(
        f"https://api.supabase.com/v1/projects/{project}/config/auth",
        data=json.dumps(changes).encode() if changes is not None else None,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="PATCH" if changes is not None else "GET",
    )
    with urlopen(request, timeout=30) as response:
        return json.load(response)


def configure(project, token, apply=False):
    current = auth_config(project, token)
    if not current.get("external_email_enabled"):
        raise ValueError("Email provider must remain enabled for administrator login.")
    if current.get("disable_signup"):
        raise ValueError("Global signup is disabled; verify social signup before changing settings.")
    if current.get("hook_before_user_created_enabled") and current.get("hook_before_user_created_uri") != HOOK:
        raise ValueError("An existing signup hook must be reviewed before replacement.")
    desired = {
        "password_min_length": max(12, current.get("password_min_length") or 0),
        "password_required_characters": CHARACTERS,
        "hook_before_user_created_enabled": True,
        "hook_before_user_created_uri": HOOK,
    }
    changes = {key: value for key, value in desired.items() if current.get(key) != value}
    if not apply:
        return {"dry_run": True, "changes": changes, "leaked_password_protection": bool(current.get("password_hibp_enabled"))}
    if changes:
        auth_config(project, token, changes)
    # This paid feature is attempted separately so a plan restriction does not undo the core policy.
    hibp_status = "enabled"
    if not current.get("password_hibp_enabled"):
        try:
            auth_config(project, token, {"password_hibp_enabled": True})
        except HTTPError as error:
            if error.code not in (400, 402, 403, 422):
                raise
            hibp_status = f"needs_attention_http_{error.code}"
    verified = auth_config(project, token)
    if any(verified.get(key) != value for key, value in desired.items()):
        raise ValueError("Auth settings did not match the reviewed policy after applying.")
    if not verified.get("password_hibp_enabled"):
        hibp_status = "needs_attention" if hibp_status == "enabled" else hibp_status
    return {"password_policy": "verified", "email_signup_hook": "verified", "leaked_password_protection": hibp_status}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--environment", choices=PROJECTS, required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    project = os.environ.get("SUPABASE_PROJECT_ID")
    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if project != PROJECTS[args.environment] or not token:
        raise SystemExit("Expected project and scoped SUPABASE_ACCESS_TOKEN are required.")
    try:
        result = configure(project, token, args.apply)
    except HTTPError as error:
        raise SystemExit(f"Auth configuration request failed (HTTP {error.code}); response omitted.") from None
    print(json.dumps(result, ensure_ascii=False))
    if str(result.get("leaked_password_protection", "")).startswith("needs_attention"):
        print("::warning::Leaked password protection is not enabled. Check plan and Auth configuration permissions; no upgrade was purchased.")


if __name__ == "__main__":
    main()
