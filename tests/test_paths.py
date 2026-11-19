import pytest

from app.services.repositories import paths


@pytest.mark.parametrize("raw,expected", [
    (r"\\wsl.localhost\Ubuntu-22.04\home\dileep\Propylon\lwb360-kansas", "/home/dileep/Propylon/lwb360-kansas"),
    (r"\\wsl$\Ubuntu\home\me\app", "/home/me/app"),
    (r'"\\wsl.localhost\Ubuntu\home\me\app"', "/home/me/app"),
    (r"\\wsl.localhost\Ubuntu", "/"),
    ("/home/me/app", "/home/me/app"),
    ("  ~/app  ", "~/app"),
])
def test_unc_and_plain(raw, expected, monkeypatch):
    monkeypatch.setattr("sys.platform", "linux")
    assert paths.normalize_path(raw) == expected


def test_drive_letter_only_on_wsl(monkeypatch):
    monkeypatch.setattr("sys.platform", "linux")
    monkeypatch.setattr(paths, "is_wsl", lambda: True)
    assert paths.normalize_path(r"C:\Users\me\app") == "/mnt/c/Users/me/app"
    monkeypatch.setattr(paths, "is_wsl", lambda: False)
    assert paths.normalize_path(r"C:\Users\me\app") == r"C:\Users\me\app"
