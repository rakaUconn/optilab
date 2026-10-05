import time

import pytest
from fastapi.testclient import TestClient

from optilab.models import AnalysisRequest, Detector, Source
from optilab.server import app

client = TestClient(app)
JSON = {"content-type": "application/json"}



def wait(jid, states=("done", "error", "cancelled"), timeout=60):
    t0 = time.time()
    while time.time() - t0 < timeout:
        s = client.get(f"/jobs/{jid}").json()
        if s["state"] in states:
            return s
        time.sleep(0.05)
    raise TimeoutError


def test_health_and_glasses():
    assert client.get("/health").json()["ok"]
    assert "N-BK7" in client.get("/glasses").json()


def test_job_runs_all_sequential_analyses(doublet):
    req = AnalysisRequest(model=doublet, analyses=["layout", "spot", "rayfan", "opd", "mtf"], pupil_rings=5)
    jid = client.post("/jobs", content=req.model_dump_json(), headers=JSON).json()["id"]
    s = wait(jid)
    assert s["state"] == "done", s
    r = s["result"]
    nf, nw = len(doublet.fields), len(doublet.wavelengths)
    assert len(r["spots"]) == len(r["mtf"]) == len(r["rayfans"]) == nf * nw
    assert r["layout"]["rays"] and r["paraxial"][0]["efl"] == pytest.approx(100.0, abs=0.01)
    axis = [x for x in r["spots"] if x["field"] == 0 and abs(x["wavelength"] - 0.5876) < 1e-9][0]
    assert axis["rms_radius"] > 0 and axis["n_traced"] == 91


def test_cancel_long_job(doublet):
    m = doublet.model_copy(deep=True)
    m.nonseq.source = Source(beam_diameter=20, n=401)
    m.nonseq.detector = Detector(half_width=3, bins=64)
    m.nonseq.tess_rings, m.nonseq.tess_segments = 24, 120
    req = AnalysisRequest(model=m, analyses=["irradiance"])
    jid = client.post("/jobs", content=req.model_dump_json(), headers=JSON).json()["id"]
    wait(jid, states=("running",))
    assert client.delete(f"/jobs/{jid}").json()["cancelling"]
    assert wait(jid)["state"] == "cancelled"


def test_irradiance_job_reports_progress(singlet):
    m = singlet.model_copy(deep=True)
    m.nonseq.source = Source(beam_diameter=8, n=15)
    m.nonseq.tess_rings, m.nonseq.tess_segments = 8, 32
    req = AnalysisRequest(model=m, analyses=["irradiance"])
    jid = client.post("/jobs", content=req.model_dump_json(), headers=JSON).json()["id"]
    s = wait(jid)
    assert s["state"] == "done" and s["result"]["irradiance"]["total_power"] > 0.5


def test_bad_glass_gives_error_state(singlet):
    m = singlet.model_copy(deep=True)
    m.surfaces[0].glass = "UNOBTAINIUM"
    jid = client.post("/jobs", content=AnalysisRequest(model=m).model_dump_json(), headers=JSON).json()["id"]
    s = wait(jid)
    assert s["state"] == "error" and "UNOBTAINIUM" in s["error"]
