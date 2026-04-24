#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
nifti_to_mesh.py
────────────────────────────────────────────────────────────────────────────
Convert NIfTI cardiac segmentation files into compact JSON triangle meshes
ready to be loaded directly in Three.js as solid BufferGeometry.

Run once (from repo root):
    python apps/scripts/nifti_to_mesh.py

Outputs (in apps/web/public/heart/):
    anatomy_mesh.json  – full cardiac anatomy surface
    vessels_mesh.json  – coronary vessel surface
────────────────────────────────────────────────────────────────────────────
"""

import json
import sys
from pathlib import Path

import numpy as np
import nibabel as nib
from scipy.ndimage import gaussian_filter
from skimage.measure import marching_cubes

# ── I/O paths ────────────────────────────────────────────────────────────────
ROOT     = Path(__file__).resolve().parent.parent / "web" / "public" / "heart"
ANAT_IN  = ROOT / "anatomy.nii.gz"
VESS_IN  = ROOT / "vessels.nii.gz"
ANAT_OUT = ROOT / "anatomy_mesh.json"
VESS_OUT = ROOT / "vessels_mesh.json"


# ── NIfTI loader ─────────────────────────────────────────────────────────────
def load_nifti(path: Path):
    """Returns (data ndarray uint8/int16, zooms tuple-of-3)."""
    img   = nib.load(str(path))
    data  = np.asarray(img.dataobj)
    zooms = tuple(float(z) for z in img.header.get_zooms()[:3])
    print(f"  shape={data.shape}  dtype={data.dtype}  zooms={zooms}")
    return data, zooms


# ── Coordinate conversion ─────────────────────────────────────────────────────
def ras_to_threejs(verts_mm: np.ndarray,
                   normals:   np.ndarray,
                   shape:     tuple,
                   zooms:     tuple,
                   target:    float = 1.3):
    """
    marching_cubes returns vertices in physical (mm) space with
    NIfTI i/j/k ↔ R/A/S axes.

    Three.js convention: Y-up, right-hand, so:
        Three X  =  RAS R  (left → right)
        Three Y  =  RAS S  (inferior → superior)   i.e. NIfTI k-axis
        Three Z  = -RAS A  (posterior → anterior)

    We also centre and scale so the longest axis fits ±target/2.
    """
    nx, ny, nz = shape
    px, py, pz = zooms

    # World extent of the volume
    ex, ey, ez = nx * px, ny * py, nz * pz
    cx, cy, cz = ex / 2.0, ey / 2.0, ez / 2.0
    scale = target / max(ex, ey, ez)

    # verts columns: [R, A, S] in mm (i*px, j*py, k*pz)
    r = verts_mm[:, 0] - cx
    a = verts_mm[:, 1] - cy
    s = verts_mm[:, 2] - cz

    x3 =  r * scale
    y3 =  s * scale
    z3 = -a * scale

    verts_3js = np.column_stack([x3, y3, z3]).astype(np.float32)

    # Normals: same axis remap (no centering/scaling needed for unit normals)
    nr = normals[:, 0]
    na = normals[:, 1]
    ns = normals[:, 2]
    normals_3js = np.column_stack([nr, ns, -na]).astype(np.float32)
    # Renormalise (remap may introduce tiny errors)
    lengths = np.linalg.norm(normals_3js, axis=1, keepdims=True).clip(1e-8)
    normals_3js /= lengths

    return verts_3js, normals_3js


# ── Volume downsampling (block-mean) ─────────────────────────────────────────
def downsample(data: np.ndarray, zooms: tuple, factor: int) -> tuple:
    """
    Downsample the volume by integer `factor` using block-mean pooling.
    Returns (data_small, zooms_small). factor=1 → passthrough.
    Much better than face-subsampling because it preserves topology:
    the resulting marching-cubes mesh is CLOSED and WATERTIGHT.
    """
    if factor <= 1:
        return data, zooms
    nx, ny, nz = data.shape
    # Trim to multiples of factor
    nx2 = (nx // factor) * factor
    ny2 = (ny // factor) * factor
    nz2 = (nz // factor) * factor
    trimmed = data[:nx2, :ny2, :nz2].astype(np.float32)
    small = trimmed.reshape(
        nx2 // factor, factor,
        ny2 // factor, factor,
        nz2 // factor, factor,
    ).mean(axis=(1, 3, 5))
    zooms_small = tuple(z * factor for z in zooms)
    print(f"  Downsampled {factor}x -> shape={small.shape} zooms={zooms_small}")
    return small, zooms_small


# ── Laplacian smoothing (umbrella operator) ──────────────────────────────────
def laplacian_smooth(verts: np.ndarray, faces: np.ndarray,
                     iters: int = 5, lam: float = 0.5) -> np.ndarray:
    """
    Simple umbrella Laplacian smoothing — averages each vertex with its
    neighbours. Removes the voxel-staircase faceting that marching cubes
    produces while keeping the triangulation intact.
    """
    n = len(verts)
    # Build neighbour sums via scatter-add
    for _ in range(iters):
        neigh_sum = np.zeros_like(verts)
        neigh_cnt = np.zeros(n, dtype=np.int32)
        for a, b in ((0, 1), (1, 2), (2, 0)):
            ia = faces[:, a]
            ib = faces[:, b]
            np.add.at(neigh_sum, ia, verts[ib])
            np.add.at(neigh_sum, ib, verts[ia])
            np.add.at(neigh_cnt, ia, 1)
            np.add.at(neigh_cnt, ib, 1)
        cnt = np.maximum(neigh_cnt, 1)[:, None]
        avg = neigh_sum / cnt
        verts = verts + lam * (avg - verts)
    return verts


# ── Marching-cubes → JSON ─────────────────────────────────────────────────────
def extract_mesh(data:         np.ndarray,
                 zooms:        tuple,
                 sigma:        float = 1.0,
                 downfactor:   int   = 1,
                 smooth_iters: int   = 4) -> dict:
    """
    Binary-mask the data (> 0 = tissue), optionally downsample the VOLUME
    (not the mesh!) to keep the triangle count manageable, run marching
    cubes, Laplacian-smooth, then convert to Three.js space.

    Produces a CLOSED, WATERTIGHT mesh — no orphan triangles / point-cloud
    artefacts.
    """
    # Binary mask of all labeled voxels, excluding label 8 (adipose tissue)
    # which wraps the heart and hides the internal anatomy.
    mask = ((data > 0) & (data != 8)).astype(np.float32)

    # Optional block-mean volume downsampling (keeps topology intact)
    mask, zooms = downsample(mask, zooms, downfactor)

    # Gaussian blur reduces voxel staircase artefacts on the surface
    smoothed = gaussian_filter(mask, sigma=sigma)

    # Marching cubes — spacing converts voxel indices to mm
    verts_mm, faces, normals, _ = marching_cubes(
        smoothed, level=0.5, spacing=zooms, method="lewiner"
    )
    print(f"  Raw mesh: {len(verts_mm):,} verts  {len(faces):,} faces")

    # Laplacian smoothing on the raw mm coordinates (topology preserved)
    if smooth_iters > 0:
        verts_mm = laplacian_smooth(verts_mm, faces, iters=smooth_iters, lam=0.55)
        print(f"  Laplacian smoothed ({smooth_iters} iters)")

    # Convert coordinates to Three.js scene space
    verts_3js, normals_3js = ras_to_threejs(
        verts_mm, normals, mask.shape, zooms
    )

    # All vertices are referenced (no decimation), so just emit directly
    verts_out   = verts_3js
    normals_out = normals_3js
    faces_out   = faces.astype(np.int32)

    print(f"  Final mesh: {len(verts_out):,} verts  {len(faces_out):,} faces")

    # Round floats to 3 decimals before serialisation → ~50 % smaller JSON
    def r3(arr: np.ndarray) -> list:
        return [round(float(v), 3) for v in arr.flatten()]

    return {
        "vertices": r3(verts_out),
        "normals":  r3(normals_out),
        "faces":    faces_out.flatten().tolist(),   # ints — no rounding needed
    }


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    ROOT.mkdir(parents=True, exist_ok=True)

    components = {
        "aorta": "Normal_1_aorta.nii.gz",
        "coronary_arteries": "Normal_1_coronary_artery.nii.gz",
        "left_atrium": "Normal_1_left_atrium.nii.gz",
        "left_ventricle": "Normal_1_left_ventricle.nii.gz",
        "myocardium": "Normal_1_myocardium.nii.gz",
        "pulmonary_artery": "Normal_1_pulmonary_artery.nii.gz",
        "right_atrium": "Normal_1_right_atrium.nii.gz",
        "right_ventricle": "Normal_1_right_ventricle.nii.gz"
    }

    for name, filename in components.items():
        in_path = ROOT / filename
        out_path = ROOT / f"{name}_mesh.json"
        
        if not in_path.exists():
            print(f"Skipping {name}, file not found: {filename}")
            continue

        print(f"\nProcessing {name}...")
        data, zooms = load_nifti(in_path)
        
        # Vessels might need slightly less smoothing
        sigma = 0.8 if "artery" in name else 1.2
        smooth_iters = 3 if "artery" in name else 5

        mesh = extract_mesh(data, zooms, sigma=sigma, downfactor=2, smooth_iters=smooth_iters)
        
        out_path.write_text(json.dumps(mesh, separators=(",", ":")))
        size_kb = out_path.stat().st_size // 1024
        print(f"  -> {out_path.name}  ({size_kb:,} KB)")

    print("\nDone -- meshes are in apps/web/public/heart/")


if __name__ == "__main__":
    main()
