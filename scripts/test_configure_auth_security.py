from copy import deepcopy
from urllib.error import HTTPError
import unittest
from unittest.mock import patch

from configure_auth_security import CHARACTERS, HOOK, configure


class AuthSecurityTests(unittest.TestCase):
    def setUp(self):
        self.config = {"external_email_enabled": True, "disable_signup": False, "password_min_length": 6, "password_required_characters": "", "password_hibp_enabled": False, "external_google_enabled": True, "external_kakao_enabled": True, "external_apple_enabled": True, "site_url": "https://unchanged.example"}
        self.patches = []

    def request(self, project, token, changes=None):
        if changes is not None:
            self.patches.append(deepcopy(changes))
            self.config.update(changes)
        return deepcopy(self.config)

    def test_only_reviewed_fields_are_patched_and_read_back(self):
        original = deepcopy(self.config)
        with patch("configure_auth_security.auth_config", side_effect=self.request):
            result = configure("project", "token", apply=True)
            self.assertEqual(result["leaked_password_protection"], "enabled")
            self.assertEqual(self.config["password_min_length"], 12)
            self.assertEqual(self.config["password_required_characters"], CHARACTERS)
            self.assertEqual(self.config["hook_before_user_created_uri"], HOOK)
            for key in original.keys() - {"password_min_length", "password_required_characters", "password_hibp_enabled"}:
                self.assertEqual(self.config[key], original[key])
            self.patches.clear()
            configure("project", "token", apply=True)
            self.assertEqual(self.patches, [])

    def test_dry_run_never_patches_or_exposes_other_config(self):
        self.config["external_google_secret"] = "must-not-print"
        with patch("configure_auth_security.auth_config", side_effect=self.request):
            result = configure("project", "token")
        self.assertEqual(self.patches, [])
        self.assertNotIn("must-not-print", str(result))

    def test_preserves_stronger_length_and_existing_hook(self):
        self.config["password_min_length"] = 20
        with patch("configure_auth_security.auth_config", side_effect=self.request):
            configure("project", "token", apply=True)
        self.assertEqual(self.config["password_min_length"], 20)
        self.config.update(hook_before_user_created_enabled=True, hook_before_user_created_uri="different")
        with patch("configure_auth_security.auth_config", side_effect=self.request):
            with self.assertRaises(ValueError):
                configure("project", "token", apply=True)

    def test_paid_feature_failure_is_reported_without_changing_signup(self):
        def request(project, token, changes=None):
            if changes == {"password_hibp_enabled": True}:
                raise HTTPError("https://api.supabase.com", 422, "plan restriction", {}, None)
            return self.request(project, token, changes)
        with patch("configure_auth_security.auth_config", side_effect=request):
            result = configure("project", "token", apply=True)
        self.assertEqual(result["leaked_password_protection"], "needs_attention_http_422")
        self.assertTrue(self.config["external_email_enabled"])
        self.assertFalse(self.config["disable_signup"])


if __name__ == "__main__":
    unittest.main()
