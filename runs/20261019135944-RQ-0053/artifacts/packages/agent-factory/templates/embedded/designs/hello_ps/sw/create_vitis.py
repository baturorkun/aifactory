"""The Vitis Unified workspace of this design, made from its XSA.

    vitis -s designs/<design>/sw/create_vitis.py

The workspace is output (out/<design>/vitis), made from the XSA the xsa stage
wrote and the sources in sw/src. A workspace made from the same XSA is reused
and only the application rebuilt (the usual loop when only C changed); after
a hardware build, which writes a new XSA, it is recreated, since everything
in it derives from the XSA. The ELF is copied to out/<design>/artifacts and
recorded in summary.json.

`vitis -s` exits 0 even when this script fails, so the previous ELF is removed
first and scripts/flow.mjs fails the stage when no ELF comes out.
vitis.dispose() runs at the end in every case: a vitis-server left behind
locks the workspace.
"""

import hashlib
import json
import os
import re
import shutil
import stat
import sys
import time

import vitis

SW_DIR = os.path.dirname(os.path.abspath(__file__))
DESIGN_DIR = os.path.dirname(SW_DIR)
DESIGN = os.path.basename(DESIGN_DIR)
ROOT = os.path.dirname(os.path.dirname(DESIGN_DIR))
OUT = os.path.join(ROOT, "out", DESIGN)
ARTIFACTS = os.path.join(OUT, "artifacts")
WORKSPACE = os.path.join(OUT, "vitis")
SOURCES = os.path.join(SW_DIR, "src")


def project_value(name):
    """One `set NAME value` of the design's project.tcl."""
    with open(os.path.join(DESIGN_DIR, "project.tcl"), encoding="utf-8") as handle:
        match = re.search(r"^\s*set\s+" + name + r"\s+\"?([^\"\s#]+)", handle.read(), re.MULTILINE)
    return match.group(1) if match else ""


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def remove_tree(path):
    """rmtree that also removes the read-only files Vitis exports."""
    def make_writable(function, target, *_):
        os.chmod(target, stat.S_IWRITE)
        function(target)
    if sys.version_info >= (3, 12):
        shutil.rmtree(path, onexc=make_writable)
    else:
        shutil.rmtree(path, onerror=make_writable)


def update_summary(fields, duration):
    path = os.path.join(ARTIFACTS, "summary.json")
    summary = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as handle:
            summary = json.load(handle)
    summary.setdefault("artifacts", {}).update(fields)
    summary.setdefault("durations", {})["sw"] = round(duration, 1)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2)


def copy_compile_database(app_name, platform_name, domain):
    """The application's compile database and the platform's BSP headers, into
    artifacts/sw, for the coding standard check on another machine (RQ-0053).
    scripts/flow.mjs rewrites the database to the project's own paths."""
    sw = os.path.join(ARTIFACTS, "sw")
    os.makedirs(sw, exist_ok=True)
    database = os.path.join(WORKSPACE, app_name, "build", "compile_commands.json")
    if os.path.isfile(database):
        shutil.copy2(database, os.path.join(sw, "compile_commands.vitis.json"))
    include = os.path.join(WORKSPACE, platform_name, "export", platform_name, "sw", domain, "include")
    target = os.path.join(sw, "bsp-include")
    if os.path.isdir(include):
        if os.path.isdir(target):
            remove_tree(target)
        shutil.copytree(include, target)


def main():
    started = time.time()
    top = project_value("TOP")
    cpu = project_value("CPU")
    if not top or not cpu:
        sys.exit("designs/{}/project.tcl must set TOP and CPU for the software stage".format(DESIGN))
    xsa = os.path.join(ARTIFACTS, top + ".xsa")
    if not os.path.isfile(xsa):
        sys.exit("SW FAILED: no {} (run the xsa stage first)".format(os.path.relpath(xsa, ROOT)))

    platform_name = DESIGN + "_platform"
    app_name = DESIGN + "_app"
    elf_artifact = os.path.join(ARTIFACTS, app_name + ".elf")
    if os.path.exists(elf_artifact):
        os.remove(elf_artifact)
    domain = "standalone_" + cpu
    stamp = os.path.join(WORKSPACE, ".xsa.sha256")
    digest = sha256(xsa)
    if os.path.isdir(WORKSPACE):
        made_from = open(stamp, encoding="utf-8").read().strip() if os.path.exists(stamp) else ""
        if made_from != digest:
            print("SW: the XSA changed, recreating out/{}/vitis".format(DESIGN))
            remove_tree(WORKSPACE)

    client = vitis.create_client()
    try:
        fresh = not os.path.isdir(os.path.join(WORKSPACE, app_name))
        os.makedirs(WORKSPACE, exist_ok=True)
        client.set_workspace(path=WORKSPACE)
        if fresh:
            platform = client.create_platform_component(
                name=platform_name, hw_design=xsa, os="standalone", cpu=cpu, domain_name=domain)
            platform.build()
            xpfm = os.path.join(WORKSPACE, platform_name, "export", platform_name, platform_name + ".xpfm")
            app = client.create_app_component(
                name=app_name, platform=xpfm, domain=domain, template="empty_application")
            sources = sorted(name for name in os.listdir(SOURCES) if not name.startswith("."))
            app.import_files(from_loc=SOURCES, files=sources, dest_dir_in_cmp="src")
            if "lscript.ld" in sources:
                app.set_app_config(key="USER_LINKER_SCRIPT", values=["../src/lscript.ld"])
            with open(stamp, "w", encoding="utf-8") as handle:
                handle.write(digest)
        else:
            print("SW: reusing out/{}/vitis (same XSA)".format(DESIGN))
            app = client.get_component(name=app_name)
            sources = sorted(name for name in os.listdir(SOURCES) if not name.startswith("."))
            app.import_files(from_loc=SOURCES, files=sources, dest_dir_in_cmp="src")
        # The previous build's ELF would survive a failed compile and pass
        # for this one's.
        elf = os.path.join(WORKSPACE, app_name, "build", app_name + ".elf")
        if os.path.exists(elf):
            os.remove(elf)
        app.build()
    finally:
        vitis.dispose()

    if not os.path.isfile(elf):
        sys.exit("SW FAILED: the application build produced no {}".format(os.path.relpath(elf, ROOT)))
    shutil.copy2(elf, elf_artifact)
    copy_compile_database(app_name, platform_name, domain)
    update_summary({"elf": app_name + ".elf"}, time.time() - started)
    print("SW: {} built, out/{}/artifacts/{}.elf".format(app_name, DESIGN, app_name))


main()
