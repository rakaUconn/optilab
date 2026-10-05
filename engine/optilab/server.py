"""FastAPI sidecar. Start: python -m optilab.server --port 8765 [--token T]"""
from __future__ import annotations

import argparse
import os
import threading
import uuid

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .glass import list_glasses
from .catalog import entry_from_zmx, generic_catalog
from .models import AnalysisRequest, CatalogEntry, ImportRequest, JobStatus, ParaxialRequest, ParaxialResult
from .paraxial import solve
from .service import Cancelled, run_analysis

TOKEN: str | None = None


def _auth(x_optilab_token: str | None = Header(default=None)):
    if TOKEN and x_optilab_token != TOKEN:
        raise HTTPException(401, "bad token")


app = FastAPI(title="OptiLab engine", version=__version__)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_jobs: dict[str, JobStatus] = {}
_cancel: dict[str, threading.Event] = {}
_lock = threading.Lock()


@app.get("/health")
def health():
    return {"ok": True, "version": __version__}


@app.get("/glasses", dependencies=[Depends(_auth)])
def glasses():
    return list_glasses()


@app.get("/catalog", response_model=list[CatalogEntry], dependencies=[Depends(_auth)])
def catalog():
    return list(generic_catalog())


@app.post("/catalog/import", response_model=CatalogEntry, dependencies=[Depends(_auth)])
def catalog_import(req: ImportRequest):
    try:
        return entry_from_zmx(req.text, req.vendor, req.part_number, req.name)
    except (ValueError, IndexError, KeyError) as e:
        raise HTTPException(422, f"cannot import: {e}") from e


@app.post("/paraxial", response_model=list[ParaxialResult], dependencies=[Depends(_auth)])
def paraxial(req: ParaxialRequest):
    """Quick first-order numbers (per wavelength) for the lens editor."""
    try:
        return [solve(req.model, w.um) for w in req.model.wavelengths]
    except ValueError as e:
        raise HTTPException(422, str(e)) from e


@app.post("/jobs", response_model=JobStatus, dependencies=[Depends(_auth)])
def submit(req: AnalysisRequest):
    jid = uuid.uuid4().hex[:12]
    ev = threading.Event()
    with _lock:
        _jobs[jid] = JobStatus(id=jid, state="queued")
        _cancel[jid] = ev

    def work():
        def prog(f, m):
            with _lock:
                _jobs[jid] = _jobs[jid].model_copy(update={"state": "running", "progress": f, "message": m})

        try:
            prog(0.0, "start")
            res = run_analysis(req, prog, ev)
            with _lock:
                _jobs[jid] = JobStatus(id=jid, state="done", progress=1.0, message="done", result=res)
        except Cancelled:
            with _lock:
                _jobs[jid] = JobStatus(id=jid, state="cancelled", message="cancelled")
        except Exception as e:  # noqa: BLE001
            with _lock:
                _jobs[jid] = JobStatus(id=jid, state="error", error=f"{type(e).__name__}: {e}")

    threading.Thread(target=work, daemon=True).start()
    return _jobs[jid]


@app.get("/jobs/{jid}", response_model=JobStatus, dependencies=[Depends(_auth)])
def status(jid: str):
    with _lock:
        if jid not in _jobs:
            raise HTTPException(404, "no such job")
        return _jobs[jid]


@app.delete("/jobs/{jid}", dependencies=[Depends(_auth)])
def cancel(jid: str):
    if jid not in _cancel:
        raise HTTPException(404, "no such job")
    _cancel[jid].set()
    return {"cancelling": True}


def main():
    import uvicorn

    global TOKEN
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--token", default=None)
    a = ap.parse_args()
    TOKEN = a.token
    uvicorn.run(app, host=a.host, port=a.port, log_level=os.environ.get("OPTILAB_LOG_LEVEL", "warning"))


if __name__ == "__main__":
    main()
