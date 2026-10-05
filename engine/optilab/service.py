"""Orchestrates an AnalysisRequest into an AnalysisResult with progress + cooperative cancel."""
from __future__ import annotations

import threading
from typing import Callable

from .analysis import sequential as sq
from .models import AnalysisRequest, AnalysisResult
from .nonseq import trace as nonseq
from .paraxial import solve


class Cancelled(Exception):
    pass


def run_analysis(req: AnalysisRequest, progress: Callable[[float, str], None] = lambda f, m: None,
                 cancel: threading.Event | None = None) -> AnalysisResult:
    cancel = cancel or threading.Event()

    def check():
        if cancel.is_set():
            raise Cancelled()

    model = req.model.model_copy(deep=True)
    pri = model.wavelengths[model.primary_wavelength].um
    par0 = solve(model, pri)
    if req.autofocus and par0.bfl != float("inf"):
        model.surfaces[-1].thickness = par0.bfl
    pars = [solve(model, w.um) for w in model.wavelengths]
    # image plane is common to all wavelengths: the primary-wavelength paraxial focus (or user thickness)
    image_z = pars[model.primary_wavelength].surface_z[-1] + model.surfaces[-1].thickness
    for p in pars:
        p.image_z = image_z
    res = AnalysisResult(paraxial=pars, image_z=image_z)
    par = pars[model.primary_wavelength]

    jobs = []
    nf, nw = len(model.fields), len(model.wavelengths)
    if "layout" in req.analyses:
        jobs.append(("layout", 1))
    for a in ("spot", "rayfan", "opd", "mtf"):
        if a in req.analyses:
            jobs.append((a, nf * nw))
    if "irradiance" in req.analyses:
        jobs.append(("irradiance", nf * nw))  # weight only
    total = sum(w for _, w in jobs) or 1
    done = 0.0

    def tick(label: str, inc: float = 1.0):
        nonlocal done
        done += inc
        progress(min(done / total, 0.999), label)

    for name, _ in jobs:
        check()
        if name == "layout":
            res.layout = sq.layout(model, pri, par, req.layout_rays)
            tick("layout")
            continue
        if name == "irradiance":
            m2 = model.model_copy(deep=True)
            if m2.nonseq.detector.z is None:
                m2.nonseq.detector.z = image_z
            base = done

            def sub(f, msg):
                progress(min((base + f * nf * nw) / total, 0.999), f"irradiance: {msg}")

            res.irradiance = nonseq.run(m2, progress=sub, check=check)
            done = base + nf * nw
            continue
        for fi, f in enumerate(model.fields):
            for wi, w in enumerate(model.wavelengths):
                check()
                pw = pars[wi]
                if name == "spot":
                    res.spots.append(sq.spot(model, w.um, pw, fi, f.angle, req.pupil_rings))
                elif name == "rayfan":
                    res.rayfans.append(sq.rayfan(model, w.um, pw, fi, f.angle, req.fan_points))
                elif name == "opd":
                    res.opd.append(sq.opd(model, w.um, pw, fi, f.angle))
                elif name == "mtf":
                    res.mtf.append(sq.mtf(model, w.um, pw, fi, f.angle))
                tick(f"{name} field {fi + 1}/{nf}, λ {wi + 1}/{nw}")
    progress(1.0, "done")
    return res
